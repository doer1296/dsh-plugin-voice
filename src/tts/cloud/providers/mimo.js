/**
 * 小米 MiMo（mimo.mi.com）V2.5-TTS provider（OpenAI 兼容接口）。
 *
 * 协议（依据官方文档 speech-synthesis-v2.5）：
 *   - 端点：POST https://api.xiaomimimo.com/v1/chat/completions（OpenAI 兼容）
 *   - 鉴权：Authorization: Bearer <MIMO_API_KEY>
 *   - 模型：mimo-v2.5-tts（预置音色）/ mimo-v2.5-tts-voicedesign（文本设计音色）/
 *           mimo-v2.5-tts-voiceclone（音频样本复刻音色）
 *   - 调用规则：目标文本必须放在 role=assistant 的 content 中，不可放 user 角色；
 *     user 角色为可选参数，可传自然语言指令控制语气/风格（情绪映射用）
 *   - 音频参数：audio = { format: 'wav' | 'pcm16', voice: 'mimo_default' | ... }；
 *     非流式响应音频在 choices[0].message.audio.data（base64）
 *   - 预置音色：mimo_default（中国集群默认 冰糖）/ 冰糖 / 茉莉 / 苏打 / 白桦 /
 *               Mia / Chloe / Milo / Dean
 *
 * 与火山 provider 的差异：
 *   - 无流式字节流封装，直接用官方 chat.completions 返回的 WAV（data 里是完整 WAV）；
 *     长文案停顿控制（句间插静音）在火山 provider 用分片 + silenceBytes 实现，
 *     MiMo 侧若开启同样走分片（format=pcm16 → 自行拼 WAV + 句间静音）。
 *   - 情绪映射：MiMo 不走声学参数（pitch/rate/loudness），而是把情绪转成
 *     自然语言指令放进 role=user 的消息，由模型自行演绎（官方推荐做法）。
 *
 * 实现注意：node:https 原生直连（绕开 undici 全局 dispatcher / fetch 代理劫持，
 * DSH 进程可能把全局 fetch 指向 pi-ai 代理 localhost:3001，该代理不转发本域名）。
 */

import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

const MIMO_HOST = 'api.xiaomimimo.com'
const MIMO_PATH = '/v1/chat/completions'
const DEFAULT_MODEL = 'mimo-v2.5-tts'
const DEFAULT_VOICE = 'mimo_default'
const SAMPLE_RATE = 24000

// 官方文档预置音色列表（Voice ID → 语言/性别）
export const MIMO_PRESET_VOICES = [
  'mimo_default',
  '冰糖', '茉莉', '苏打', '白桦',
  'Mia', 'Chloe', 'Milo', 'Dean',
]

// 情绪 → 自然语言发音风格指令（放入 role=user 的消息，官方推荐做法）
const EMOTION_INSTRUCTION = {
  happy: '用轻快上扬、充满喜悦的语气朗读',
  sad: '用低沉缓慢、略带忧伤的语气朗读',
  angry: '用气愤、强硬的语气朗读',
  calm: '用平稳舒缓、冷静从容的语气朗读',
  excited: '用兴奋激昂、语速偏快的语气朗读',
  neutral: '',
}

/** node:https 原生 POST JSON，返回完整响应字符串或抛错（绕开 fetch 代理劫持）。 */
function httpsJsonPost(apiKey, body, timeoutMs, apiBase) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    // apiBase 仅用于测试/内网（如 "http://127.0.0.1:8080"），生产走官方 https 域名
    const isHttp = String(apiBase || '').startsWith('http://')
    const base = (apiBase || MIMO_HOST).replace(/^https?:\/\//, '')
    const [hostname, port] = base.split(':')
    const requestFn = isHttp ? httpRequest : httpsRequest
    const req = requestFn({
      hostname,
      ...(port ? { port: Number(port) } : {}),
      path: MIMO_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
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
    req.on('timeout', () => req.destroy(new Error('MiMo TTS 请求超时')))
    req.write(payload)
    req.end()
  })
}

/** 静音（16bit 单声道，用于句间停顿）。 */
function silenceBytes(ms) {
  if (!ms || ms <= 0) return Buffer.alloc(0)
  return Buffer.alloc(Math.round((ms / 1000) * SAMPLE_RATE) * 2)
}

/** PCM16 → RIFF/WAVE 容器（兼容 Media.SoundPlayer）。 */
function pcmToWav(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** 按句/逗号切分长文案（与火山 provider 同一策略），仅长文本启用。 */
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

/** 合并多段 PCM 与句间静音 → WAV。 */
function concatSegments(segments) {
  const pieces = []
  for (const seg of segments) {
    pieces.push(seg.pcm)
    if (seg.pauseAfterMs) pieces.push(silenceBytes(seg.pauseAfterMs))
  }
  return pcmToWav(Buffer.concat(pieces))
}

export class MimoProvider {
  type = 'mimo'
  get engineName() { return 'mimo' }
  currentProcess = null
  tempFile = null

  constructor(config) {
    this.config = config || {}
  }

  async speak(text, options = {}, onBeforePlay) {
    await this.stop()
    const audioBuffer = await this.synthesize({
      text,
      voice: options.voice,
      rate: options.rate,
      emotion: options.emotion,
      emotionIntensity: options.emotionIntensity,
    })
    const tempFile = join(tmpdir(), `dsh-voice-mimo-${Date.now()}.wav`)
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

  /** 合成 → WAV Buffer（支持长文案分片 + 句间静音）。 */
  async synthesize(params) {
    const apiKey = this.config.apiKey || this.config.token
    if (!apiKey) throw new Error('MiMo TTS: 缺少 apiKey（config.mimo.apiKey 或环境变量 MIMO_API_KEY）')
    const model = this.config.model || DEFAULT_MODEL
    const format = this.config.format || 'pcm' // 内部统一用 pcm 拼 WAV（含句间静音）
    const pauseControl = this.config.pauseControl ?? true
    const voice = params.voice || this.config.voice || DEFAULT_VOICE

    const instruction = this.buildInstruction(params)
    const timeout = this.config.timeout || 30000
    const retries = this.config.retries ?? 1

    // 长文案分片：每片独立合成（片间插句读静音），短文本一次合成
    const segs = pauseControl
      ? splitForPauses(params.text, {
          sentenceMs: this.config.pauseSentenceMs ?? 400,
          commaMs: this.config.pauseCommaMs ?? 200,
        })
      : null

    if (segs) {
      const results = await Promise.allSettled(
        segs.map((seg) => this.synthOnce({ text: seg.text, voice, model, format, instruction, timeout, retries }))
      )
      if (results.every((r) => r.status === 'fulfilled')) {
        const segments = []
        results.forEach((r, i) => {
          segments.push({ pcm: r.value, pauseAfterMs: segs[i].pauseAfterMs })
        })
        return concatSegments(segments)
      }
      // 分片失败 → 整体一次合成兜底
      console.warn('[voice] MiMo 分片合成失败，整段重试:', results.find((r) => r.status === 'rejected')?.reason?.message)
    }

    const pcm = await this.synthOnce({ text: params.text, voice, model, format, instruction, timeout, retries })
    return pcmToWav(pcm)
  }

  /** 情绪/语速 → 自然语言风格指令（放 role=user）。 */
  buildInstruction(params) {
    const parts = []
    const base = params.emotion ? EMOTION_INSTRUCTION[params.emotion] : ''
    if (base) parts.push(base)
    const rate = params.rate
    if (typeof rate === 'number' && rate > 0) {
      if (rate >= 250) parts.push('语速偏快')
      else if (rate <= 150) parts.push('语速放慢、沉稳一些')
    }
    // emotionIntensity 不直接转指令（模型对自然语言的演绎由自身把握），保留整数化即可
    return parts.join('，') || ''
  }

  /** 单次合成：OpenAI 兼容 chat.completions → 返回 PCM Buffer。 */
  async synthOnce({ text, voice, model, format, instruction, timeout, retries }) {
    const body = {
      model,
      messages: [
        ...(instruction ? [{ role: 'user', content: instruction }] : []),
        { role: 'assistant', content: text },
      ],
      audio: { format: format === 'pcm' ? 'pcm16' : 'wav', voice },
      stream: false,
    }
    const maxAttempts = (retries ?? 1) + 1
    let lastErr
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt))
      try {
        const { status, body: respBody } = await httpsJsonPost(
          this.config.apiKey || this.config.token,
          body,
          timeout,
          this.config.apiBase // 可选覆盖（测试 / 域名变更用），默认官方域名
        )
        if (status !== 200) {
          throw new Error(`MiMo TTS HTTP ${status}: ${respBody.slice(0, 300)}`)
        }
        let data
        try { data = JSON.parse(respBody) } catch { throw new Error(`MiMo TTS 返回非 JSON: ${respBody.slice(0, 200)}`) }
        const audio = data?.choices?.[0]?.message?.audio?.data
        if (!audio) {
          throw new Error(`MiMo TTS 响应缺音频数据（error: ${JSON.stringify(data?.error || '').slice(0, 200)}）`)
        }
        return Buffer.from(audio, 'base64')
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        // 业务错误（HTTP / 缺音频 / 非 JSON）不重试——确定性错误
        if (msg.startsWith('MiMo TTS HTTP') || msg.startsWith('MiMo TTS 返回非 JSON') || msg.includes('缺音频数据')) throw err
        if (attempt < maxAttempts - 1) {
          console.warn(`[voice] MiMo 请求失败（第 ${attempt + 1} 次），重试中: ${msg}`)
        }
      }
    }
    throw new Error(`MiMo TTS: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
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
    try { unlinkSync(this.tempFile) } catch {}
    this.tempFile = null
  }

  /** 返回官方预置音色列表（全部可用，无开通门槛）。 */
  async getVoices() {
    return MIMO_PRESET_VOICES
  }
}