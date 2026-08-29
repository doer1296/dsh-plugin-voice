/**
 * 火山引擎豆包语音合成大模型（seed-tts）provider。
 * 移植自 agent-voice-mcp-minus dist/tts/cloud/providers/volcano.js，逻辑保留。
 *
 * 核心：
 *   - v3 流式接口 /api/v3/tts/unidirectional（X-Api-Key 鉴权）
 *   - PCM → WAV 客户端封装（16bit 单声道，24kHz 即该音色带宽上限）
 *   - 长文案按句切分并行合成 + 段间静音（pauseControl）
 *   - 情绪声学映射（pitch ±12 + speech_rate/loudness_rate 偏移，seed-tts v3 不支持服务端 emotion）
 *   - Node 22+ 原生 fetch（无需 axios / node-fetch）
 */

import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request as httpsRequest } from 'node:https'

// 用 node:https 原生发起请求（绕开 undici 全局 dispatcher / fetch 代理劫持，
// DSH 进程可能把全局 fetch 指向 pi-ai 代理 localhost:3001，该代理不转发火山域名 → 响应缺音频数据）
// 返回一次性流式读取完成后的完整响应字符串，或抛错
function httpsRequestRaw(options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: 'openspeech.bytedance.com',
      path: '/api/v3/tts/unidirectional',
      method: 'POST',
      headers: {
        'X-Api-Key': options.apiKey,
        'X-Api-Resource-Id': options.resourceId,
        'X-Api-Request-Id': options.requestId,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({ status: res.statusCode, body: buf.toString('utf8') })
      })
    })
    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy(new Error('Volcano TTS 请求超时'))
    })
    req.write(body)
    req.end()
  })
}

function fixWavDataSize(buffer) {
  // 流式返回的 WAV，data 子块长度字段可能为 0xFFFFFFFF 占位，Media.SoundPlayer 会拒绝。修正 data 长度与 RIFF 总长。
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return buffer
  }
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    if (chunkId === 'data') {
      const actual = buffer.length - dataStart
      buffer.writeUInt32LE(actual, offset + 4)
      buffer.writeUInt32LE(buffer.length - 8, 4)
      break
    }
    offset = dataStart + chunkSize + (chunkSize % 2)
  }
  return buffer
}

// 裸 PCM → RIFF/WAVE 容器（16bit 单声道小端），兼容 Media.SoundPlayer。
function pcmToWav(pcm, sampleRate) {
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)        // PCM
  header.writeUInt16LE(1, 22)        // 单声道
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byteRate
  header.writeUInt16LE(2, 32)        // blockAlign
  header.writeUInt16LE(16, 34)       // bitsPerSample
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}

// 生成指定毫秒的静音（16bit 单声道，全零即静音）。用于句间/逗号停顿（pauseControl）。
function silenceBytes(ms, sampleRate) {
  if (!ms || ms <= 0) return Buffer.alloc(0)
  const frames = Math.round((ms / 1000) * sampleRate)
  return Buffer.alloc(frames * 2)
}

// 情绪 → 声学参数组合（seed-tts v3 不支持服务端 emotion，客户端映射）
const EMOTION_PROFILE = {
  neutral: { pitch: 0, rate: 0, loudness: 0 },
  happy: { pitch: 2, rate: 3, loudness: 2 },
  sad: { pitch: -2, rate: -6, loudness: -4 },
  angry: { pitch: 1, rate: 4, loudness: 6 },
  calm: { pitch: -1, rate: -4, loudness: -2 },
  excited: { pitch: 3, rate: 8, loudness: 3 },
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// 长文案停顿控制：按句切分 → 并行合成 → 段间插静音。SSML <break> 在 v3 流式接口实测会截断音频，故客户端实现。
function splitForPauses(text, opts) {
  const { sentenceMs = 400, commaMs = 200, minChars = 40, maxSegs = 4 } = opts || {}
  const trimmed = String(text || '').trim()
  if (trimmed.length < minChars) return null
  const segs = []
  const splitByComma = (s, endMs) => {
    const subs = s.split(/(?<=[，、；])/).map((x) => x.trim()).filter(Boolean)
    if (subs.length < 2) return false
    subs.forEach((sub, i) => {
      segs.push({ text: sub, pauseAfterMs: i < subs.length - 1 ? commaMs : endMs })
    })
    return true
  }
  const bySentence = trimmed.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean)
  if (bySentence.length >= 2) {
    for (const s of bySentence) {
      if (s.length > 50 && splitByComma(s, sentenceMs)) continue
      segs.push({ text: s, pauseAfterMs: sentenceMs })
    }
  } else if (trimmed.length >= 60 && splitByComma(trimmed, 0)) {
    // 单个超长句（无句号）：仅按逗号切分
  } else {
    return null
  }
  if (segs.length > maxSegs) {
    const head = segs.slice(0, maxSegs - 1)
    head.push({ text: segs.slice(maxSegs - 1).map((s) => s.text).join(''), pauseAfterMs: 0 })
    segs.length = 0
    segs.push(...head)
  } else {
    segs[segs.length - 1].pauseAfterMs = 0
  }
  return segs.length >= 2 ? segs : null
}

export class VolcanoProvider {
  type = 'volcano'
  get engineName() { return 'volcano' }
  currentProcess = null
  tempFile = null

  constructor(config) {
    this.config = config
  }

  async speak(text, options = {}, onBeforePlay) {
    await this.stop()
    const audioBuffer = await this.synthesize({
      text,
      voice: options.voice,
      rate: options.rate,
      volume: options.volume,
      emotion: options.emotion,
      emotionIntensity: options.emotionIntensity,
    })
    const tempFile = join(tmpdir(), `dsh-voice-volcano-${Date.now()}.wav`)
    this.tempFile = tempFile
    writeFileSync(tempFile, audioBuffer)
    try {
      if (onBeforePlay) await onBeforePlay()
      const { playAudioFile } = await import('../../audio-player.js')
      await playAudioFile(tempFile, (proc) => { this.currentProcess = proc })
    } finally {
      this.currentProcess = null
      this.cleanupTempFile()
    }
  }

  async synthesize(params) {
    const voice = params.voice || this.config.voice || 'zh_female_daimengchuanmei_moon_bigtts'
    const apiKey = this.config.apiKey || this.config.token
    if (!apiKey) throw new Error('Volcano TTS: 缺少 apiKey（config.cloud.apiKey）')
    const resourceId = this.config.resourceId || 'seed-tts-1.0'
    const format = this.config.format || 'wav'
    const sampleRate = this.config.sampleRate || 24000
    const speechRate = params.rate ? Math.round((params.rate / 200 - 1) * 100) : 0
    const loudnessRate = params.volume !== undefined ? Math.round((params.volume - 1) * 100) : 0
    const emotionProfile = params.emotion ? EMOTION_PROFILE[params.emotion] : undefined
    let pitch = 0
    let finalSpeechRate = speechRate
    let finalLoudnessRate = loudnessRate
    if (emotionProfile) {
      const k = params.emotionIntensity ?? 0.7
      pitch = clampInt(Math.round(emotionProfile.pitch * k), -12, 12)
      finalSpeechRate = clampInt(speechRate + Math.round(emotionProfile.rate * k), -50, 100)
      finalLoudnessRate = clampInt(loudnessRate + Math.round(emotionProfile.loudness * k), -50, 100)
    }
    const silenceDuration = this.config.silenceDuration ?? 400
    const ctx = {
      apiKey, resourceId, voice, format, sampleRate,
      finalSpeechRate, finalLoudnessRate, pitch,
      disableMarkdownFilter: this.config.disableMarkdownFilter ?? true,
      disableEmojiFilter: this.config.disableEmojiFilter ?? true,
      timeout: this.config.timeout || 30000,
      // 音质增强参数（seed-tts-1.0 支持，默认 0 不改变现有行为）
      punctuationBias: this.config.nlpPara?.punctuationBias ?? 0,
      inequalityChoose: this.config.nlpPara?.inequalityChoose ?? 0,
      energyRate: this.config.energyRate ?? 0,
      retries: this.config.retries ?? 1, // 网络瞬时故障重试次数
    }
  // 段间停顿按 pauseControl 控制（silenceBytes 仅用于句间/逗号停顿，无前导静音）
  const pauseControl = this.config.pauseControl ?? true
    const segs = pauseControl && format === 'pcm'
      ? splitForPauses(params.text, {
          sentenceMs: this.config.pauseSentenceMs ?? 400,
          commaMs: this.config.pauseCommaMs ?? 200,
        })
      : null
    if (segs) {
      const results = await Promise.allSettled(
        segs.map((seg, i) => this.synthOnce(seg.text, ctx, i === segs.length - 1 ? silenceDuration : 0))
      )
      if (results.every((r) => r.status === 'fulfilled')) {
        const pieces = []
        results.forEach((r, i) => {
          pieces.push(r.value)
          if (i < results.length - 1) pieces.push(silenceBytes(segs[i].pauseAfterMs, sampleRate))
        })
        return pcmToWav(Buffer.concat(pieces), sampleRate)
      }
    }
    const audio = await this.synthOnce(params.text, ctx, silenceDuration)
    if (format === 'pcm') {
      return pcmToWav(audio, sampleRate)
    }
    return fixWavDataSize(audio)
  }

  async synthOnce(text, ctx, silenceDuration) {
    const bodyObj = {
      req_params: {
        text,
        speaker: ctx.voice,
        silence_duration: silenceDuration,
        disable_markdown_filter: ctx.disableMarkdownFilter,
        disable_emoji_filter: ctx.disableEmojiFilter,
        audio_params: {
          format: ctx.format,
          sample_rate: ctx.sampleRate,
          speech_rate: ctx.finalSpeechRate,
          loudness_rate: ctx.finalLoudnessRate,
        },
      },
    }
    // 音质增强参数（seed-tts-1.0 支持）：
    // - nlp_para.punctuation_bias：标点偏向（0-6，纠正长句/无标点文本的断句自然度）
    // - nlp_para.inequality_choose：不等号等特殊字符读法（0/1，如 "1!=2" 读作 "一不等于二"）
    // - post_process.energy_rate：能量增益（-50~100，提升响度感知，与 loudness_rate 叠加）
    if (ctx.punctuationBias || ctx.punctuationBias === 0) {
      bodyObj.req_params.nlp_para = {
        punctuation_bias: ctx.punctuationBias,
        inequality_choose: ctx.inequalityChoose ?? 0,
      }
    }
    if (ctx.pitch !== 0 || (ctx.energyRate || ctx.energyRate === 0)) {
      const postProcess = {}
      if (ctx.pitch !== 0) postProcess.pitch = ctx.pitch
      if (ctx.energyRate || ctx.energyRate === 0) postProcess.energy_rate = ctx.energyRate
      bodyObj.req_params.post_process = postProcess
    }
    const body = JSON.stringify(bodyObj)
    const maxAttempts = (ctx.retries ?? 1) + 1
    let lastErr
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // 网络瞬时故障重试：退避 300ms × 重试序号
        await new Promise((r) => setTimeout(r, 300 * attempt))
      }
      const requestId = `dsh-voice-${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 8)}`
      try {
        // node:https 原生直连（绕开 undici 全局 dispatcher / fetch 代理劫持）
        const { status, body: respBody } = await httpsRequestRaw(
          { apiKey: ctx.apiKey, resourceId: ctx.resourceId, requestId },
          body,
          ctx.timeout
        )
        if (status !== 200) {
          throw new Error(`Volcano TTS HTTP ${status}: ${respBody.slice(0, 300)}`)
        }
        const chunks = []
        let buffer = respBody
        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (!line) continue
          const data = JSON.parse(line)
          const SUCCESS_CODES = [0, 20000000]
          if (!SUCCESS_CODES.includes(data.code)) {
            throw new Error(`Volcano TTS API error: code=${data.code}, message=${data.message}`)
          }
          if (data.data) chunks.push(Buffer.from(data.data, 'base64'))
        }
        if (chunks.length === 0) {
          const preview = buffer.trim().slice(0, 200)
          throw new Error(`Volcano TTS 响应缺音频数据（原始响应: ${preview || '<空>'})`)
        }
        return Buffer.concat(chunks)
      } catch (err) {
        lastErr = err
        // 业务错误（HTTP 状态 / API code）不重试——是确定性错误（Key 失效/资源未开通/文本非法），重试无意义
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.startsWith('Volcano TTS HTTP') || msg.startsWith('Volcano TTS API error')) throw err
        if (attempt < maxAttempts - 1) {
          console.warn(`[voice] 火山请求失败（第 ${attempt + 1} 次），重试中: ${msg}`)
        }
      }
    }
    throw new Error(`Volcano TTS: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
    this.cleanupTempFile()
  }

  cleanupTempFile() {
    if (!this.tempFile) return
    try {
      unlinkSync(this.tempFile)
    } catch {}
    this.tempFile = null
  }

  /**
   * 返回当前可用的音色列表。
   *
   * 火山引擎音色需在控制台开通对应资源才能合成，未开通的请求会返回空音频（"响应缺音频数据"）。
   * 因此只返回当前配置的音色（唯一确定已开通可用的），避免列出未开通音色导致试听失败。
   * 用户如需更多音色：在火山控制台开通 → 在设置面板的「火山音色」填入对应 ID。
   */
  async getVoices() {
    const configuredVoice = this.config.voice || 'zh_female_daimengchuanmei_moon_bigtts'
    return [configuredVoice]
  }
}
