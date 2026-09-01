var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/tts/audio-player.js
var audio_player_exports = {};
__export(audio_player_exports, {
  playAudioFile: () => playAudioFile
});
import { spawn } from "node:child_process";
function playAudioFile(filePath, onSpawn) {
  return new Promise((resolve2, reject) => {
    const psScript = `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`;
    const proc = spawn("powershell", ["-NoProfile", "-c", psScript], {
      stdio: "ignore",
      windowsHide: true
    });
    if (onSpawn) onSpawn(proc);
    proc.on("close", (code) => {
      if (code === 0 || code === null) resolve2();
      else reject(new Error(`SoundPlayer exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
var init_audio_player = __esm({
  "src/tts/audio-player.js"() {
  }
});

// src/tts/cloud/providers/mimo.js
var mimo_exports = {};
__export(mimo_exports, {
  MIMO_PRESET_VOICES: () => MIMO_PRESET_VOICES,
  MimoProvider: () => MimoProvider
});
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
function httpsJsonPost(apiKey, body, timeoutMs, apiBase) {
  return new Promise((resolve2, reject) => {
    const payload = JSON.stringify(body);
    const isHttp = String(apiBase || "").startsWith("http://");
    const base = (apiBase || MIMO_HOST).replace(/^https?:\/\//, "");
    const [hostname, port] = base.split(":");
    const requestFn = isHttp ? httpRequest : httpsRequest;
    const req = requestFn({
      hostname,
      ...port ? { port: Number(port) } : {},
      path: MIMO_PATH,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve2({ status: res.statusCode, body: buf.toString("utf8") });
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => req.destroy(new Error("MiMo TTS \u8BF7\u6C42\u8D85\u65F6")));
    req.write(payload);
    req.end();
  });
}
function silenceBytes(ms) {
  if (!ms || ms <= 0) return Buffer.alloc(0);
  return Buffer.alloc(Math.round(ms / 1e3 * SAMPLE_RATE) * 2);
}
function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function splitForPauses(text, opts) {
  const { sentenceMs = 400, commaMs = 200, minChars = 40, maxSegs = 4 } = opts || {};
  const trimmed = String(text || "").trim();
  if (trimmed.length < minChars) return null;
  const segs = [];
  const splitByComma = (s, endMs) => {
    const subs = s.split(/(?<=[，、；])/).map((x) => x.trim()).filter(Boolean);
    if (subs.length < 2) return false;
    subs.forEach((sub, i) => {
      segs.push({ text: sub, pauseAfterMs: i < subs.length - 1 ? commaMs : endMs });
    });
    return true;
  };
  const bySentence = trimmed.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean);
  if (bySentence.length >= 2) {
    for (const s of bySentence) {
      if (s.length > 50 && splitByComma(s, sentenceMs)) continue;
      segs.push({ text: s, pauseAfterMs: sentenceMs });
    }
  } else if (trimmed.length >= 60 && splitByComma(trimmed, 0)) {
  } else {
    return null;
  }
  if (segs.length > maxSegs) {
    const head = segs.slice(0, maxSegs - 1);
    head.push({ text: segs.slice(maxSegs - 1).map((s) => s.text).join(""), pauseAfterMs: 0 });
    segs.length = 0;
    segs.push(...head);
  } else {
    segs[segs.length - 1].pauseAfterMs = 0;
  }
  return segs.length >= 2 ? segs : null;
}
function concatSegments(segments) {
  const pieces = [];
  for (const seg of segments) {
    pieces.push(seg.pcm);
    if (seg.pauseAfterMs) pieces.push(silenceBytes(seg.pauseAfterMs));
  }
  return pcmToWav(Buffer.concat(pieces));
}
var MIMO_HOST, MIMO_PATH, DEFAULT_MODEL, DEFAULT_VOICE, SAMPLE_RATE, MIMO_PRESET_VOICES, EMOTION_INSTRUCTION, MimoProvider;
var init_mimo = __esm({
  "src/tts/cloud/providers/mimo.js"() {
    MIMO_HOST = "api.xiaomimimo.com";
    MIMO_PATH = "/v1/chat/completions";
    DEFAULT_MODEL = "mimo-v2.5-tts";
    DEFAULT_VOICE = "mimo_default";
    SAMPLE_RATE = 24e3;
    MIMO_PRESET_VOICES = [
      "mimo_default",
      "\u51B0\u7CD6",
      "\u8309\u8389",
      "\u82CF\u6253",
      "\u767D\u6866",
      "Mia",
      "Chloe",
      "Milo",
      "Dean"
    ];
    EMOTION_INSTRUCTION = {
      happy: "\u7528\u8F7B\u5FEB\u4E0A\u626C\u3001\u5145\u6EE1\u559C\u60A6\u7684\u8BED\u6C14\u6717\u8BFB",
      sad: "\u7528\u4F4E\u6C89\u7F13\u6162\u3001\u7565\u5E26\u5FE7\u4F24\u7684\u8BED\u6C14\u6717\u8BFB",
      angry: "\u7528\u6C14\u6124\u3001\u5F3A\u786C\u7684\u8BED\u6C14\u6717\u8BFB",
      calm: "\u7528\u5E73\u7A33\u8212\u7F13\u3001\u51B7\u9759\u4ECE\u5BB9\u7684\u8BED\u6C14\u6717\u8BFB",
      excited: "\u7528\u5174\u594B\u6FC0\u6602\u3001\u8BED\u901F\u504F\u5FEB\u7684\u8BED\u6C14\u6717\u8BFB",
      neutral: ""
    };
    MimoProvider = class {
      type = "mimo";
      get engineName() {
        return "mimo";
      }
      currentProcess = null;
      tempFile = null;
      constructor(config) {
        this.config = config || {};
      }
      async speak(text, options = {}, onBeforePlay) {
        await this.stop();
        const audioBuffer = await this.synthesize({
          text,
          voice: options.voice,
          rate: options.rate,
          emotion: options.emotion,
          emotionIntensity: options.emotionIntensity
        });
        const tempFile = join(tmpdir(), `dsh-voice-mimo-${Date.now()}.wav`);
        this.tempFile = tempFile;
        writeFileSync(tempFile, audioBuffer);
        try {
          if (onBeforePlay) await onBeforePlay();
          const { playAudioFile: playAudioFile2 } = await Promise.resolve().then(() => (init_audio_player(), audio_player_exports));
          await playAudioFile2(tempFile, (proc) => {
            this.currentProcess = proc;
          });
        } finally {
          this.currentProcess = null;
          this.cleanupTempFile();
        }
      }
      /** 合成 → WAV Buffer（支持长文案分片 + 句间静音）。 */
      async synthesize(params) {
        const apiKey = this.config.apiKey || this.config.token;
        if (!apiKey) throw new Error("MiMo TTS: \u7F3A\u5C11 apiKey\uFF08config.mimo.apiKey \u6216\u73AF\u5883\u53D8\u91CF MIMO_API_KEY\uFF09");
        const model = this.config.model || DEFAULT_MODEL;
        const format = this.config.format || "pcm";
        const pauseControl = this.config.pauseControl ?? true;
        let voice = MIMO_PRESET_VOICES.includes(params.voice) ? params.voice : null;
        if (!voice) voice = MIMO_PRESET_VOICES.includes(this.config.voice) ? this.config.voice : DEFAULT_VOICE;
        if (params.voice && !MIMO_PRESET_VOICES.includes(params.voice)) {
          console.warn(`[voice] MiMo \u97F3\u8272 "${params.voice}" \u4E0D\u5728\u9884\u7F6E\u5217\u8868\uFF0C\u56DE\u9000 "${voice}"`);
        }
        const instruction = this.buildInstruction(params);
        const timeout = this.config.timeout || 3e4;
        const retries = this.config.retries ?? 1;
        const segs = pauseControl ? splitForPauses(params.text, {
          sentenceMs: this.config.pauseSentenceMs ?? 400,
          commaMs: this.config.pauseCommaMs ?? 200
        }) : null;
        if (segs) {
          const results = await Promise.allSettled(
            segs.map((seg) => this.synthOnce({ text: seg.text, voice, model, format, instruction, timeout, retries }))
          );
          if (results.every((r) => r.status === "fulfilled")) {
            const segments = [];
            results.forEach((r, i) => {
              segments.push({ pcm: r.value, pauseAfterMs: segs[i].pauseAfterMs });
            });
            return concatSegments(segments);
          }
          console.warn("[voice] MiMo \u5206\u7247\u5408\u6210\u5931\u8D25\uFF0C\u6574\u6BB5\u91CD\u8BD5:", results.find((r) => r.status === "rejected")?.reason?.message);
        }
        const pcm = await this.synthOnce({ text: params.text, voice, model, format, instruction, timeout, retries });
        return pcmToWav(pcm);
      }
      /** 情绪/语速 → 自然语言风格指令（放 role=user）。 */
      buildInstruction(params) {
        const parts = [];
        const base = params.emotion ? EMOTION_INSTRUCTION[params.emotion] : "";
        if (base) parts.push(base);
        const rate = params.rate;
        if (typeof rate === "number" && rate > 0) {
          if (rate >= 250) parts.push("\u8BED\u901F\u504F\u5FEB");
          else if (rate <= 150) parts.push("\u8BED\u901F\u653E\u6162\u3001\u6C89\u7A33\u4E00\u4E9B");
        }
        return parts.join("\uFF0C") || "";
      }
      /** 单次合成：OpenAI 兼容 chat.completions → 返回 PCM Buffer。 */
      async synthOnce({ text, voice, model, format, instruction, timeout, retries }) {
        const body = {
          model,
          messages: [
            ...instruction ? [{ role: "user", content: instruction }] : [],
            { role: "assistant", content: text }
          ],
          audio: { format: format === "pcm" ? "pcm16" : "wav", voice },
          stream: false
        };
        const maxAttempts = (retries ?? 1) + 1;
        let lastErr;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
          try {
            const { status, body: respBody } = await httpsJsonPost(
              this.config.apiKey || this.config.token,
              body,
              timeout,
              this.config.apiBase
              // 可选覆盖（测试 / 域名变更用），默认官方域名
            );
            if (status !== 200) {
              throw new Error(`MiMo TTS HTTP ${status}: ${respBody.slice(0, 300)}`);
            }
            let data;
            try {
              data = JSON.parse(respBody);
            } catch {
              throw new Error(`MiMo TTS \u8FD4\u56DE\u975E JSON: ${respBody.slice(0, 200)}`);
            }
            const audio = data?.choices?.[0]?.message?.audio?.data;
            if (!audio) {
              throw new Error(`MiMo TTS \u54CD\u5E94\u7F3A\u97F3\u9891\u6570\u636E\uFF08error: ${JSON.stringify(data?.error || "").slice(0, 200)}\uFF09`);
            }
            return Buffer.from(audio, "base64");
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith("MiMo TTS HTTP") || msg.startsWith("MiMo TTS \u8FD4\u56DE\u975E JSON") || msg.includes("\u7F3A\u97F3\u9891\u6570\u636E")) throw err;
            if (attempt < maxAttempts - 1) {
              console.warn(`[voice] MiMo \u8BF7\u6C42\u5931\u8D25\uFF08\u7B2C ${attempt + 1} \u6B21\uFF09\uFF0C\u91CD\u8BD5\u4E2D: ${msg}`);
            }
          }
        }
        throw new Error(`MiMo TTS: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
      }
      stop() {
        if (this.currentProcess) {
          this.currentProcess.kill("SIGTERM");
          this.currentProcess = null;
        }
        this.cleanupTempFile();
      }
      cleanupTempFile() {
        if (!this.tempFile) return;
        try {
          unlinkSync(this.tempFile);
        } catch {
        }
        this.tempFile = null;
      }
      /** 返回官方预置音色列表（全部可用，无开通门槛）。 */
      async getVoices() {
        return MIMO_PRESET_VOICES;
      }
    };
  }
});

// src/tts/cloud/providers/volcano.js
var volcano_exports = {};
__export(volcano_exports, {
  VolcanoProvider: () => VolcanoProvider
});
import { writeFileSync as writeFileSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { tmpdir as tmpdir2 } from "node:os";
import { request as httpsRequest2 } from "node:https";
function httpsRequestRaw(options, body, timeoutMs) {
  return new Promise((resolve2, reject) => {
    const req = httpsRequest2({
      hostname: "openspeech.bytedance.com",
      path: "/api/v3/tts/unidirectional",
      method: "POST",
      headers: {
        "X-Api-Key": options.apiKey,
        "X-Api-Resource-Id": options.resourceId,
        "X-Api-Request-Id": options.requestId,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve2({ status: res.statusCode, body: buf.toString("utf8") });
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy(new Error("Volcano TTS \u8BF7\u6C42\u8D85\u65F6"));
    });
    req.write(body);
    req.end();
  });
}
function fixWavDataSize(buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return buffer;
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === "data") {
      const actual = buffer.length - dataStart;
      buffer.writeUInt32LE(actual, offset + 4);
      buffer.writeUInt32LE(buffer.length - 8, 4);
      break;
    }
    offset = dataStart + chunkSize + chunkSize % 2;
  }
  return buffer;
}
function pcmToWav2(pcm, sampleRate) {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
function silenceBytes2(ms, sampleRate) {
  if (!ms || ms <= 0) return Buffer.alloc(0);
  const frames = Math.round(ms / 1e3 * sampleRate);
  return Buffer.alloc(frames * 2);
}
function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function splitForPauses2(text, opts) {
  const { sentenceMs = 400, commaMs = 200, minChars = 40, maxSegs = 4 } = opts || {};
  const trimmed = String(text || "").trim();
  if (trimmed.length < minChars) return null;
  const segs = [];
  const splitByComma = (s, endMs) => {
    const subs = s.split(/(?<=[，、；])/).map((x) => x.trim()).filter(Boolean);
    if (subs.length < 2) return false;
    subs.forEach((sub, i) => {
      segs.push({ text: sub, pauseAfterMs: i < subs.length - 1 ? commaMs : endMs });
    });
    return true;
  };
  const bySentence = trimmed.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean);
  if (bySentence.length >= 2) {
    for (const s of bySentence) {
      if (s.length > 50 && splitByComma(s, sentenceMs)) continue;
      segs.push({ text: s, pauseAfterMs: sentenceMs });
    }
  } else if (trimmed.length >= 60 && splitByComma(trimmed, 0)) {
  } else {
    return null;
  }
  if (segs.length > maxSegs) {
    const head = segs.slice(0, maxSegs - 1);
    head.push({ text: segs.slice(maxSegs - 1).map((s) => s.text).join(""), pauseAfterMs: 0 });
    segs.length = 0;
    segs.push(...head);
  } else {
    segs[segs.length - 1].pauseAfterMs = 0;
  }
  return segs.length >= 2 ? segs : null;
}
var EMOTION_PROFILE, VolcanoProvider;
var init_volcano = __esm({
  "src/tts/cloud/providers/volcano.js"() {
    init_mimo();
    EMOTION_PROFILE = {
      neutral: { pitch: 0, rate: 0, loudness: 0 },
      happy: { pitch: 2, rate: 3, loudness: 2 },
      sad: { pitch: -2, rate: -6, loudness: -4 },
      angry: { pitch: 1, rate: 4, loudness: 6 },
      calm: { pitch: -1, rate: -4, loudness: -2 },
      excited: { pitch: 3, rate: 8, loudness: 3 }
    };
    VolcanoProvider = class {
      type = "volcano";
      get engineName() {
        return "volcano";
      }
      currentProcess = null;
      tempFile = null;
      constructor(config) {
        this.config = config;
      }
      async speak(text, options = {}, onBeforePlay) {
        await this.stop();
        const audioBuffer = await this.synthesize({
          text,
          voice: options.voice,
          rate: options.rate,
          volume: options.volume,
          emotion: options.emotion,
          emotionIntensity: options.emotionIntensity
        });
        const tempFile = join2(tmpdir2(), `dsh-voice-volcano-${Date.now()}.wav`);
        this.tempFile = tempFile;
        writeFileSync2(tempFile, audioBuffer);
        try {
          if (onBeforePlay) await onBeforePlay();
          const { playAudioFile: playAudioFile2 } = await Promise.resolve().then(() => (init_audio_player(), audio_player_exports));
          await playAudioFile2(tempFile, (proc) => {
            this.currentProcess = proc;
          });
        } finally {
          this.currentProcess = null;
          this.cleanupTempFile();
        }
      }
      async synthesize(params) {
        let voice = params.voice || this.config.voice || "zh_female_daimengchuanmei_moon_bigtts";
        if (MIMO_PRESET_VOICES.includes(voice) && !MIMO_PRESET_VOICES.includes(this.config.voice)) {
          console.warn(`[voice] \u706B\u5C71\u6536\u5230 MiMo \u97F3\u8272 "${voice}"\uFF0C\u56DE\u9000\u914D\u7F6E\u97F3\u8272 "${this.config.voice}"`);
          voice = this.config.voice || "zh_female_daimengchuanmei_moon_bigtts";
        }
        const apiKey = this.config.apiKey || this.config.token;
        if (!apiKey) throw new Error("Volcano TTS: \u7F3A\u5C11 apiKey\uFF08config.cloud.apiKey\uFF09");
        const resourceId = this.config.resourceId || "seed-tts-1.0";
        const format = this.config.format || "wav";
        const sampleRate = this.config.sampleRate || 24e3;
        const speechRate = params.rate ? Math.round((params.rate / 200 - 1) * 100) : 0;
        const loudnessRate = params.volume !== void 0 ? Math.round((params.volume - 1) * 100) : 0;
        const emotionProfile = params.emotion ? EMOTION_PROFILE[params.emotion] : void 0;
        let pitch = 0;
        let finalSpeechRate = speechRate;
        let finalLoudnessRate = loudnessRate;
        if (emotionProfile) {
          const k = params.emotionIntensity ?? 0.7;
          pitch = clampInt(Math.round(emotionProfile.pitch * k), -12, 12);
          finalSpeechRate = clampInt(speechRate + Math.round(emotionProfile.rate * k), -50, 100);
          finalLoudnessRate = clampInt(loudnessRate + Math.round(emotionProfile.loudness * k), -50, 100);
        }
        const silenceDuration = this.config.silenceDuration ?? 400;
        const ctx = {
          apiKey,
          resourceId,
          voice,
          format,
          sampleRate,
          finalSpeechRate,
          finalLoudnessRate,
          pitch,
          disableMarkdownFilter: this.config.disableMarkdownFilter ?? true,
          disableEmojiFilter: this.config.disableEmojiFilter ?? true,
          timeout: this.config.timeout || 3e4,
          // 音质增强参数（seed-tts-1.0 支持，默认 0 不改变现有行为）
          punctuationBias: this.config.nlpPara?.punctuationBias ?? 0,
          inequalityChoose: this.config.nlpPara?.inequalityChoose ?? 0,
          energyRate: this.config.energyRate ?? 0,
          retries: this.config.retries ?? 1
          // 网络瞬时故障重试次数
        };
        const pauseControl = this.config.pauseControl ?? true;
        const segs = pauseControl && format === "pcm" ? splitForPauses2(params.text, {
          sentenceMs: this.config.pauseSentenceMs ?? 400,
          commaMs: this.config.pauseCommaMs ?? 200
        }) : null;
        if (segs) {
          const results = await Promise.allSettled(
            segs.map((seg, i) => this.synthOnce(seg.text, ctx, i === segs.length - 1 ? silenceDuration : 0))
          );
          if (results.every((r) => r.status === "fulfilled")) {
            const pieces = [];
            results.forEach((r, i) => {
              pieces.push(r.value);
              if (i < results.length - 1) pieces.push(silenceBytes2(segs[i].pauseAfterMs, sampleRate));
            });
            return pcmToWav2(Buffer.concat(pieces), sampleRate);
          }
        }
        const audio = await this.synthOnce(params.text, ctx, silenceDuration);
        if (format === "pcm") {
          return pcmToWav2(audio, sampleRate);
        }
        return fixWavDataSize(audio);
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
              loudness_rate: ctx.finalLoudnessRate
            }
          }
        };
        if (ctx.punctuationBias || ctx.punctuationBias === 0) {
          bodyObj.req_params.nlp_para = {
            punctuation_bias: ctx.punctuationBias,
            inequality_choose: ctx.inequalityChoose ?? 0
          };
        }
        if (ctx.pitch !== 0 || (ctx.energyRate || ctx.energyRate === 0)) {
          const postProcess = {};
          if (ctx.pitch !== 0) postProcess.pitch = ctx.pitch;
          if (ctx.energyRate || ctx.energyRate === 0) postProcess.energy_rate = ctx.energyRate;
          bodyObj.req_params.post_process = postProcess;
        }
        const body = JSON.stringify(bodyObj);
        const maxAttempts = (ctx.retries ?? 1) + 1;
        let lastErr;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 300 * attempt));
          }
          const requestId = `dsh-voice-${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
          try {
            const { status, body: respBody } = await httpsRequestRaw(
              { apiKey: ctx.apiKey, resourceId: ctx.resourceId, requestId },
              body,
              ctx.timeout
            );
            if (status !== 200) {
              throw new Error(`Volcano TTS HTTP ${status}: ${respBody.slice(0, 300)}`);
            }
            const chunks = [];
            let buffer = respBody;
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);
              if (!line) continue;
              const data = JSON.parse(line);
              const SUCCESS_CODES = [0, 2e7];
              if (!SUCCESS_CODES.includes(data.code)) {
                throw new Error(`Volcano TTS API error: code=${data.code}, message=${data.message}`);
              }
              if (data.data) chunks.push(Buffer.from(data.data, "base64"));
            }
            if (chunks.length === 0) {
              const preview = buffer.trim().slice(0, 200);
              throw new Error(`Volcano TTS \u54CD\u5E94\u7F3A\u97F3\u9891\u6570\u636E\uFF08\u539F\u59CB\u54CD\u5E94: ${preview || "<\u7A7A>"})`);
            }
            return Buffer.concat(chunks);
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith("Volcano TTS HTTP") || msg.startsWith("Volcano TTS API error")) throw err;
            if (attempt < maxAttempts - 1) {
              console.warn(`[voice] \u706B\u5C71\u8BF7\u6C42\u5931\u8D25\uFF08\u7B2C ${attempt + 1} \u6B21\uFF09\uFF0C\u91CD\u8BD5\u4E2D: ${msg}`);
            }
          }
        }
        throw new Error(`Volcano TTS: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
      }
      stop() {
        if (this.currentProcess) {
          this.currentProcess.kill("SIGTERM");
          this.currentProcess = null;
        }
        this.cleanupTempFile();
      }
      cleanupTempFile() {
        if (!this.tempFile) return;
        try {
          unlinkSync2(this.tempFile);
        } catch {
        }
        this.tempFile = null;
      }
      /**
       * 返回当前可用的音色列表。
       *
       * 火山引擎音色需在控制台开通对应资源才能合成，未开通的请求会返回空音频（"响应缺音频数据"）。
       * 因此只返回当前配置的音色（唯一确定已开通可用的），避免列出未开通音色导致试听失败。
       * 用户如需更多音色：在火山控制台开通 → 在设置面板的「火山音色」填入对应 ID。
       */
      async getVoices() {
        const configuredVoice = this.config.voice || "zh_female_daimengchuanmei_moon_bigtts";
        return [configuredVoice];
      }
    };
  }
});

// src/tts/windows-sapi.js
var windows_sapi_exports = {};
__export(windows_sapi_exports, {
  WindowsSAPIEngine: () => WindowsSAPIEngine,
  hasChineseSapiVoice: () => hasChineseSapiVoice
});
import { spawn as spawn2 } from "node:child_process";
function rateToSAPI(rate) {
  const normalized = (rate - 200) / 100;
  return Math.round(Math.max(-10, Math.min(10, normalized * 10)));
}
function volumeToSAPI(volume) {
  return Math.round(Math.max(0, Math.min(1, volume)) * 100);
}
function hasCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(String(text ?? ""));
}
async function getInstalledVoices() {
  if (cachedSapiVoices) return cachedSapiVoices;
  const psScript = `
    $ErrorActionPreference = 'Stop';
    Add-Type -AssemblyName System.Speech;
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $s.GetInstalledVoices() | ForEach-Object { "{0}|{1}|{2}" -f $_.VoiceInfo.Name, $_.VoiceInfo.Culture.Name, $_.Enabled }
  `;
  return new Promise((resolve2) => {
    const proc = spawn2("powershell", ["-NoProfile", "-Command", psScript], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[voice] SAPI \u679A\u4E3E\u8BED\u97F3\u5931\u8D25: ${stderr.trim() || code}`);
        resolve2([]);
        return;
      }
      cachedSapiVoices = stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name2, culture, enabled] = l.split("|");
        return { name: name2 ?? "", culture: culture ?? "", enabled: enabled === "True" };
      });
      resolve2(cachedSapiVoices);
    });
    proc.on("error", () => resolve2([]));
  });
}
async function hasChineseSapiVoice() {
  const voices = await getInstalledVoices();
  if (voices.length === 0) return false;
  return voices.some((v) => {
    const c = (v.culture || "").toLowerCase();
    const n = (v.name || "").toLowerCase();
    return c.startsWith("zh") || /zh|chinese|中文|汉语|普通话|huihui/i.test(n);
  });
}
async function matchVoice(name2) {
  if (!name2) return null;
  const voices = await getInstalledVoices();
  const exact = voices.find((v) => v.name.toLowerCase() === String(name2).toLowerCase());
  if (exact) return exact.name;
  return null;
}
async function findChineseVoice() {
  const voices = await getInstalledVoices();
  const zh = voices.filter((v) => (v.culture || "").toLowerCase().startsWith("zh"));
  if (zh.length === 0) return null;
  const enabled = zh.find((v) => v.enabled) || zh[0];
  return enabled;
}
var cachedSapiVoices, WindowsSAPIEngine;
var init_windows_sapi = __esm({
  "src/tts/windows-sapi.js"() {
    cachedSapiVoices = null;
    WindowsSAPIEngine = class {
      currentProcess = null;
      type = "windows-sapi";
      get engineName() {
        return "windows-sapi";
      }
      async speak(text, options = {}, onBeforePlay) {
        await this.stop();
        if (onBeforePlay) await onBeforePlay();
        const speechText = String(text ?? "");
        if (hasCJK(speechText)) {
          const hasZh = await hasChineseSapiVoice();
          if (!hasZh) {
            throw new Error("\u672C\u673A SAPI \u672A\u5B89\u88C5\u4E2D\u6587\u8BED\u97F3\uFF08\u5982 Huihui/\u4E2D\u6587\u8BED\u97F3\u5305\uFF09\uFF0C\u65E0\u6CD5\u6717\u8BFB\u4E2D\u6587\u3002\u8BF7\u5B89\u88C5\u4E2D\u6587\u8BED\u97F3\u5305\u6216\u914D\u7F6E\u706B\u5C71\u5F15\u64CE Key \u4F7F\u7528\u4E91\u7AEF TTS\u3002");
          }
        }
        const escapedText = speechText.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
        const rate = rateToSAPI(options.rate ?? 200);
        const volume = volumeToSAPI(options.volume ?? 1);
        let selectedVoice = await matchVoice(options.voice);
        if (!selectedVoice && hasCJK(speechText)) {
          const zhVoice = await findChineseVoice();
          if (zhVoice) selectedVoice = zhVoice.name;
        }
        let psScript = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;`;
        if (selectedVoice) {
          psScript += ` $s.SelectVoice('${selectedVoice.replace(/'/g, "''")}');`;
        }
        psScript += ` $s.Rate = ${rate}; $s.Volume = ${volume}; $s.Speak('${escapedText}');`;
        return new Promise((resolve2, reject) => {
          this.currentProcess = spawn2("powershell", ["-NoProfile", "-Command", psScript], {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true
          });
          let stderr = "";
          this.currentProcess.stderr.on("data", (d) => {
            stderr += d.toString();
          });
          this.currentProcess.on("close", (code) => {
            this.currentProcess = null;
            if (code === 0 || code === null) resolve2();
            else reject(new Error(`PowerShell SAPI \u64AD\u62A5\u5931\u8D25\uFF08code ${code}\uFF09: ${stderr.trim() || "\u672A\u77E5\u9519\u8BEF"}`));
          });
          this.currentProcess.on("error", (err) => {
            this.currentProcess = null;
            reject(err);
          });
        });
      }
      stop() {
        if (this.currentProcess) {
          this.currentProcess.kill("SIGTERM");
          this.currentProcess = null;
        }
      }
      async getVoices() {
        return getInstalledVoices();
      }
    };
  }
});

// src/tts/notification-sound.js
var notification_sound_exports = {};
__export(notification_sound_exports, {
  playNotificationSound: () => playNotificationSound
});
import { spawn as spawn3 } from "node:child_process";
import { existsSync, readFileSync, writeFileSync as writeFileSync3, unlinkSync as unlinkSync3 } from "node:fs";
import { tmpdir as tmpdir3 } from "node:os";
import { dirname, join as join3, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function getAssetsDir() {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  if (existsSync(join3(moduleDir, "..", "assets"))) return join3(moduleDir, "..", "assets");
  if (existsSync(join3(moduleDir, "..", "..", "assets"))) return join3(moduleDir, "..", "..", "assets");
  return join3(moduleDir, "..", "assets");
}
function beepScript(pattern) {
  return pattern.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    if (p.includes(",")) {
      const [freq, ms2] = p.split(",");
      return `[System.Console]::Beep(${freq}, ${ms2})`;
    }
    const ms = Number.parseInt(p, 10);
    return Number.isNaN(ms) ? "" : `Start-Sleep -Milliseconds ${ms}`;
  }).filter(Boolean).join("; ");
}
function amplifyWav(srcPath, gain) {
  let buf;
  try {
    buf = readFileSync(srcPath);
  } catch {
    return srcPath;
  }
  try {
    if (buf.length < 44) return srcPath;
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return srcPath;
    const fmt = buf.readUInt16LE(20);
    const channels = buf.readUInt16LE(22);
    const bits = buf.readUInt16LE(34);
    const dataOffset = 44;
    const actualSize = buf.length - 8;
    buf.writeUInt32LE(actualSize, 4);
    const curDataSize = buf.readUInt32LE(40);
    if (fmt === 1 && channels === 1 && bits === 16 && dataOffset + curDataSize <= buf.length && typeof gain === "number" && gain > 1.001) {
      let peak = 0;
      for (let i = dataOffset; i < dataOffset + curDataSize; i += 2) {
        const s = buf.readInt16LE(i);
        const a = s < 0 ? -s : s;
        if (a > peak) peak = a;
      }
      if (peak > 0) {
        const effectiveGain = Math.min(gain, 32767 / peak);
        if (effectiveGain > 1.001) {
          for (let i = dataOffset; i < dataOffset + curDataSize; i += 2) {
            const s = buf.readInt16LE(i);
            let v = Math.round(s * effectiveGain);
            if (v > 32767) v = 32767;
            if (v < -32768) v = -32768;
            buf.writeInt16LE(v, i);
          }
        }
      }
    }
  } catch {
    return srcPath;
  }
  const tmp = join3(tmpdir3(), `dsh-voice-amp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`);
  try {
    writeFileSync3(tmp, buf);
    return tmp;
  } catch {
    return srcPath;
  }
}
async function playNotificationSound(sound) {
  if (sound === false || sound === "none") return;
  if (typeof sound === "string" && sound.startsWith("beep:")) {
    const pattern = BEEP_PATTERNS[sound.slice(5)];
    if (!pattern) {
      process.stderr.write("\x07");
      return;
    }
    await playFile("powershell", ["-NoProfile", "-c", beepScript(pattern)]);
    return;
  }
  let soundPath = null;
  let soundName = sound;
  if (!soundName) soundName = "melodious";
  if (BUILTIN_PRESETS.includes(soundName)) {
    const candidate = join3(getAssetsDir(), `${soundName}.wav`);
    if (existsSync(candidate)) soundPath = candidate;
  }
  if (!soundPath && existsSync(soundName)) soundPath = soundName;
  if (soundName === "beep" || !soundPath) {
    process.stderr.write("\x07");
    return;
  }
  const playPath = amplifyWav(soundPath, SOUND_GAIN);
  try {
    await playFile("powershell", [
      "-NoProfile",
      "-c",
      // PlaySync 同步播放：提示音播完进程立即退出，语音无缝衔接（无间隔）。
      `(New-Object Media.SoundPlayer '${playPath}').PlaySync()`
    ]);
  } finally {
    if (playPath !== soundPath) {
      try {
        unlinkSync3(playPath);
      } catch {
      }
    }
  }
}
function playFile(command, args) {
  return new Promise((resolve2) => {
    let proc;
    try {
      proc = spawn3(command, args, { stdio: "ignore", windowsHide: true });
    } catch {
      return resolve2();
    }
    const done = () => {
      try {
        proc.kill();
      } catch {
      }
      resolve2();
    };
    proc.on("close", done);
    proc.on("error", () => resolve2());
    setTimeout(done, 1e4);
  });
}
var SOUND_GAIN, BUILTIN_PRESETS, BEEP_PATTERNS;
var init_notification_sound = __esm({
  "src/tts/notification-sound.js"() {
    SOUND_GAIN = 2;
    BUILTIN_PRESETS = [
      "melodious",
      "bright",
      "ding_ding",
      "gift",
      "light",
      "short",
      "sudden",
      "sudden_2",
      "tactful"
    ];
    BEEP_PATTERNS = {
      info: "800,120;80;1200,120;150",
      success: "600,100;80;800,100;80;1200,120;150",
      error: "1000,150;80;600,150;80;400,150;200",
      warning: "800,200;100;500,200;150",
      milestone: "900,80;60;900,80;60;1200,120;150",
      single: "880,150"
    };
  }
});

// src/index.js
import { spawn as spawn4 } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { join as join5, dirname as dirname2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/tts/factory.js
var cachedEngine = null;
var enginePromise = null;
var volcanoClassPromise = null;
var mimoClassPromise = null;
var sapiClassPromise = null;
function getVolcanoClass() {
  if (!volcanoClassPromise) {
    volcanoClassPromise = Promise.resolve().then(() => (init_volcano(), volcano_exports)).then((m) => m.VolcanoProvider);
  }
  return volcanoClassPromise;
}
function getMimoClass() {
  if (!mimoClassPromise) {
    mimoClassPromise = Promise.resolve().then(() => (init_mimo(), mimo_exports)).then((m) => m.MimoProvider);
  }
  return mimoClassPromise;
}
function getSapiClass() {
  if (!sapiClassPromise) {
    sapiClassPromise = Promise.resolve().then(() => (init_windows_sapi(), windows_sapi_exports)).then((m) => m.WindowsSAPIEngine);
  }
  return sapiClassPromise;
}
var lastLoggedEngine = null;
function logEngine(desc) {
  if (lastLoggedEngine === desc) return;
  lastLoggedEngine = desc;
  console.log(`[voice] ${desc}`);
}
function createTTSEngine(options = {}) {
  if (cachedEngine) return Promise.resolve(cachedEngine);
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const engineType = options.engine || "auto";
    const hasKey = (cfg) => cfg && cfg.apiKey && cfg.apiKey.trim() && !cfg.apiKey.startsWith("${");
    const tryCandidates = async (candidates) => {
      for (const cand of candidates) {
        if (cand.type === "windows-sapi") {
          const SAPI2 = await getSapiClass();
          cachedEngine = new SAPI2();
          logEngine(`${cand.label}`);
          return cachedEngine;
        }
        if (!hasKey(cand.cfg)) continue;
        try {
          if (cand.type === "mimo") {
            const Mimo = await getMimoClass();
            cachedEngine = new Mimo(cand.cfg);
          } else if (cand.type === "volcano") {
            const Volcano = await getVolcanoClass();
            cachedEngine = new Volcano(cand.cfg);
          }
          logEngine(`${cand.label}`);
          return cachedEngine;
        } catch (e) {
          console.warn(`[voice] ${cand.label} \u521D\u59CB\u5316\u5931\u8D25\uFF0C\u56DE\u9000\u4E0B\u4E2A\u5F15\u64CE: ${e.message}`);
        }
      }
      return null;
    };
    const MIMO = { type: "mimo", cfg: options.mimo, label: "auto \u2192 \u5C0F\u7C73 MiMo\uFF08\u5DF2\u914D\u7F6E Key\uFF09" };
    const VOLCANO = { type: "volcano", cfg: options.cloud, label: "auto \u2192 \u706B\u5C71\u5F15\u64CE\uFF08\u5DF2\u914D\u7F6E Key\uFF09" };
    const SAPI = { type: "windows-sapi", label: "auto \u2192 SAPI\uFF08\u65E0\u4E91\u7AEF Key\uFF0C\u79BB\u7EBF\u515C\u5E95\uFF09" };
    const chain = engineType === "volcano" ? [VOLCANO, MIMO, SAPI] : engineType === "mimo" ? [MIMO, VOLCANO, SAPI] : engineType === "auto" ? [MIMO, VOLCANO, SAPI] : null;
    if (chain) {
      if (engineType !== "auto") {
        MIMO.label = `mimo \u2192 \u5C0F\u7C73 MiMo\uFF08\u5DF2\u914D\u7F6E Key\uFF09`;
        VOLCANO.label = `volcano \u2192 \u706B\u5C71\u5F15\u64CE\uFF08\u5DF2\u914D\u7F6E Key\uFF09`;
        SAPI.label = `${engineType} \u2192 \u65E0\u53EF\u7528 Key\uFF0C\u964D\u7EA7 SAPI \u515C\u5E95`;
      }
      cachedEngine = await tryCandidates(chain);
      return cachedEngine;
    }
    if (engineType === "windows-sapi") {
      const SAPI2 = await getSapiClass();
      cachedEngine = new SAPI2();
      logEngine("windows-sapi\uFF08\u663E\u5F0F\u79BB\u7EBF\uFF09");
      return cachedEngine;
    }
    throw new Error(`\u4E0D\u652F\u6301\u7684\u5F15\u64CE: ${engineType}\u3002\u652F\u6301: auto / volcano / mimo / windows-sapi`);
  })().finally(() => {
    enginePromise = null;
  });
  return enginePromise;
}
function resetEngineCache() {
  cachedEngine = null;
  enginePromise = null;
}
async function createFallbackEngine() {
  const SAPI = await getSapiClass();
  return new SAPI();
}

// src/voice-queue.js
var NOTIFICATION_GAP_MS = 2e3;
var notificationSoundPromise = null;
function getPlayNotificationSound() {
  if (!notificationSoundPromise) {
    notificationSoundPromise = Promise.resolve().then(() => (init_notification_sound(), notification_sound_exports)).then((m) => m.playNotificationSound);
  }
  return notificationSoundPromise;
}
function cleanSpeechText(text) {
  return String(text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^#+\s*/gm, "").replace(/\[[^\]]*\]\([^)]*\)/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/^\s*[-*+]\s+/gm, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}
function truncateForSpeech(text, maxLen) {
  if (!maxLen || text.length <= maxLen) return text;
  const head = text.slice(0, maxLen);
  const lastStop = Math.max(
    head.lastIndexOf("\u3002"),
    head.lastIndexOf("\uFF01"),
    head.lastIndexOf("\uFF1F"),
    head.lastIndexOf("\uFF1B"),
    head.lastIndexOf("\uFF0C"),
    head.lastIndexOf(",")
  );
  return lastStop > maxLen / 2 ? head.slice(0, lastStop + 1) : head;
}
var VoiceQueue = class {
  queue = [];
  maxSize;
  engine;
  processing = false;
  notificationSound;
  fallbackEngine = null;
  hasPlayedNotification = false;
  prevEnqueuedAt = 0;
  doneResolve = null;
  donePromise = null;
  constructor(engine2, maxSize = 2, notificationSound, fallbackEngine = null) {
    this.engine = engine2;
    this.maxSize = maxSize;
    this.notificationSound = notificationSound;
    this.fallbackEngine = fallbackEngine;
  }
  enqueue(text, options, notificationSound) {
    while (this.queue.length >= this.maxSize) this.queue.shift();
    this.queue.push({ text, options, enqueuedAt: Date.now(), notificationSound });
    this.processQueue();
  }
  stop() {
    this.queue = [];
    this.engine.stop();
  }
  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    this.hasPlayedNotification = false;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (this.hasPlayedNotification && this.prevEnqueuedAt > 0 && item.enqueuedAt - this.prevEnqueuedAt > NOTIFICATION_GAP_MS) {
        this.hasPlayedNotification = false;
      }
      this.prevEnqueuedAt = item.enqueuedAt;
      let onBeforePlay;
      try {
        if (!this.hasPlayedNotification) {
          const sound = item.notificationSound;
          if (sound && sound !== false && sound !== "none") {
            this.hasPlayedNotification = true;
            const playSound = await getPlayNotificationSound();
            onBeforePlay = () => playSound(sound);
          }
        }
        await this.engine.speak(item.text, item.options, onBeforePlay);
      } catch (err) {
        console.error("[voice] \u64AD\u62A5\u5931\u8D25:", err instanceof Error ? err.message : err);
        if (this.fallbackEngine) {
          try {
            const sapiOptions = {
              rate: item.options?.rate,
              volume: item.options?.volume
            };
            console.error("[voice] \u56DE\u9000\u672C\u5730 SAPI \u5F15\u64CE");
            await this.fallbackEngine.speak(item.text, sapiOptions, onBeforePlay);
          } catch (err2) {
            console.error("[voice] SAPI \u515C\u5E95\u4E5F\u5931\u8D25:", err2 instanceof Error ? err2.message : err2);
          }
        }
      }
    }
    this.processing = false;
    if (this.queue.length > 0) {
      this.processQueue();
    } else if (this.doneResolve) {
      this.doneResolve();
      this.doneResolve = null;
      this.donePromise = null;
    }
  }
  /** 返回 Promise，队列空时 resolve。 */
  waitForDone() {
    if (!this.processing && this.queue.length === 0) return Promise.resolve();
    if (!this.donePromise) {
      this.donePromise = new Promise((resolve2) => {
        this.doneResolve = resolve2;
      });
    }
    return this.donePromise;
  }
};

// src/config.js
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
import { homedir, platform } from "node:os";
var DEFAULT_CONFIG_PATH = join4(homedir(), ".dsh", "voice", "config.json");
var _settingsScope = null;
function setSettingsScope(scope) {
  _settingsScope = scope;
}
function mapSettingsToConfig(v) {
  if (!v || typeof v !== "object") return null;
  const result = {};
  if (v.defaultMode !== void 0) result.defaultMode = v.defaultMode;
  if (v.engine !== void 0) result.engine = v.engine;
  if (v.callDelaySeconds !== void 0) result.callDelaySeconds = v.callDelaySeconds;
  if (v.onTurnEnd !== void 0) result.onTurnEnd = v.onTurnEnd;
  if (v.onTaskStart !== void 0) result.onTaskStart = v.onTaskStart;
  if (v.onQuestion !== void 0) result.onQuestion = v.onQuestion;
  if (v.autoCall !== void 0) result.autoCall = v.autoCall;
  if (v.textClean !== void 0) result.textClean = v.textClean;
  if (v.maxTextLength !== void 0) result.maxTextLength = v.maxTextLength;
  if (v.volume !== void 0) result.volume = v.volume;
  if (v.rate !== void 0) result.rate = v.rate;
  const cloud = {};
  if (v.cloud_apiKey !== void 0) cloud.apiKey = v.cloud_apiKey;
  if (v.cloud_voice !== void 0) cloud.voice = v.cloud_voice;
  if (v.cloud_resourceId !== void 0) cloud.resourceId = v.cloud_resourceId;
  if (v.cloud_energyRate !== void 0) cloud.energyRate = v.cloud_energyRate;
  if (v.cloud_retries !== void 0) cloud.retries = v.cloud_retries;
  if (v.cloud_timeout !== void 0) cloud.timeout = v.cloud_timeout;
  if (v.cloud_pauseSentenceMs !== void 0) cloud.pauseSentenceMs = v.cloud_pauseSentenceMs;
  if (v.cloud_pauseCommaMs !== void 0) cloud.pauseCommaMs = v.cloud_pauseCommaMs;
  if (Object.keys(cloud).length) result.cloud = cloud;
  const mimo = {};
  if (v.mimo_apiKey !== void 0) mimo.apiKey = v.mimo_apiKey;
  if (v.mimo_voice !== void 0) mimo.voice = v.mimo_voice;
  if (Object.keys(mimo).length) result.mimo = mimo;
  if (v.templates && typeof v.templates === "object") result.templates = v.templates;
  if (v.sceneSounds && typeof v.sceneSounds === "object") result.sceneSounds = v.sceneSounds;
  return result;
}
var DEFAULT_CONFIG = {
  engine: "auto",
  // 默认 auto：有 MiMo Key 用 MiMo → 否则火山 → 否则 SAPI（候选链自动降级）
  cloud: {
    provider: "volcano",
    apiKey: "${VOLCANO_API_KEY}",
    voice: "zh_female_daimengchuanmei_moon_bigtts",
    resourceId: "seed-tts-1.0",
    format: "pcm",
    sampleRate: 24e3,
    silenceDuration: 400,
    pauseControl: true,
    pauseSentenceMs: 400,
    pauseCommaMs: 200,
    timeout: 3e4,
    // 音质增强参数（seed-tts-1.0 支持）
    nlpPara: { punctuationBias: 0, inequalityChoose: 0 },
    // 标点偏向 / 特殊字符读法
    energyRate: 0,
    // 能量增益 -50~100（提升响度感知）
    retries: 1
    // 网络瞬时故障重试次数
  },
  // 小米 MiMo V2.5-TTS（OpenAI 兼容 chat.completions，mimo.mi.com）
  mimo: {
    provider: "mimo",
    apiKey: "${MIMO_API_KEY}",
    voice: "mimo_default",
    // 预置音色：mimo_default/冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean
    format: "pcm",
    pauseControl: true,
    pauseSentenceMs: 400,
    pauseCommaMs: 200,
    timeout: 3e4,
    retries: 1
  },
  rate: 200,
  volume: 1,
  onTaskStart: true,
  onQuestion: true,
  // agent 提问（ask_user_question）等待过久且用户离开 → 播报「呼叫」防卡住
  sceneSounds: {
    task_start: "light",
    // 开始：轻快短音
    task_complete: "bright",
    // 完成：明亮上扬
    task_error: "melodious",
    // 出错：悦耳（柔和提醒，不刺耳）
    need_interaction: "ding_ding",
    // 呼叫：叮叮提醒
    milestone: "gift"
    // 关键点：礼物般的欢快
  },
  textClean: true,
  maxTextLength: 200,
  startupWelcome: true,
  // DSH 启动后播报一句欢迎语（可改用 startupWelcomeText 自定义文案；false 关闭）
  startupWelcomeText: "\u6B22\u8FCE\u4F7F\u7528\u8BED\u97F3\u52A9\u624B\uFF0C\u6211\u5C06\u4E00\u76F4\u966A\u4F34\u60A8",
  roles: [],
  scenes: {
    task_start: { voice: void 0, rate: 190, volume: 1, emotion: "calm" },
    task_complete: { voice: void 0, rate: 220, volume: 1, emotion: "happy" },
    task_error: { voice: void 0, rate: 210, volume: 1, emotion: "angry" },
    need_interaction: { voice: void 0, rate: 200, volume: 1, emotion: "calm" },
    milestone: { voice: void 0, rate: 210, volume: 1, emotion: "happy" }
  }
};
var cachedConfig = null;
function resolveEnvVars(obj) {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, name2) => process.env[name2] ?? `\${${name2}}`);
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  return obj;
}
function loadConfig(configPath) {
  const resolvedPath = configPath || DEFAULT_CONFIG_PATH;
  if (!configPath && cachedConfig) return cachedConfig;
  let fileConfig = {};
  if (existsSync2(resolvedPath)) {
    try {
      const fileVal = JSON.parse(readFileSync2(resolvedPath, "utf-8"));
      fileConfig = deepMerge(fileConfig, fileVal);
    } catch {
      console.error(`[voice] \u914D\u7F6E\u6587\u4EF6\u89E3\u6790\u5931\u8D25: ${resolvedPath}\uFF0C\u4F7F\u7528\u9ED8\u8BA4`);
    }
  }
  if (_settingsScope && !configPath) {
    try {
      const settingsVal = _settingsScope.get();
      const mapped = mapSettingsToConfig(settingsVal);
      if (mapped && Object.keys(mapped).length) {
        fileConfig = deepMerge(fileConfig, mapped);
      }
    } catch (e) {
      console.error("[voice] settings scope \u8BFB\u53D6\u5931\u8D25\uFF0C\u56DE\u9000 config.json:", e.message);
    }
  }
  cachedConfig = resolveEnvVars(deepMerge(DEFAULT_CONFIG, fileConfig));
  return cachedConfig;
}
function deepMerge(base, override) {
  if (typeof base !== "object" || base === null) return override;
  if (typeof override !== "object" || override === null) return override;
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(base[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function resetConfigCache() {
  cachedConfig = null;
}
function resolveRole(roles, roleParam) {
  if (!roles || roles.length === 0) return void 0;
  if (!roleParam) return roles[0];
  const nameMatch = roles.find((r) => r.name === roleParam);
  if (nameMatch) return nameMatch;
  return roles[0];
}
function defaultVoiceByEngine(config) {
  const hasKey = (cfg) => cfg && cfg.apiKey && cfg.apiKey.trim() && !cfg.apiKey.startsWith("${");
  const useMimo = config.engine === "mimo" || config.engine === "auto" && hasKey(config.mimo);
  return useMimo && config.mimo?.voice ? config.mimo.voice : config.cloud?.voice;
}
function resolveOptions(config, scene, override, role) {
  const result = {
    voice: role?.voice ?? config.voice ?? defaultVoiceByEngine(config),
    rate: role?.rate ?? config.rate ?? 200,
    volume: role?.volume ?? config.volume ?? 1.3,
    emotion: role?.emotion,
    emotionIntensity: role?.emotionIntensity
  };
  if (scene) {
    if (config.scenes) {
      const globalScene = config.scenes[scene];
      if (globalScene) {
        if (globalScene.voice !== void 0) result.voice = globalScene.voice || result.voice;
        if (globalScene.rate !== void 0) result.rate = globalScene.rate;
        if (globalScene.volume !== void 0) result.volume = globalScene.volume;
        if (globalScene.emotion !== void 0) result.emotion = globalScene.emotion;
        if (globalScene.emotionIntensity !== void 0) result.emotionIntensity = globalScene.emotionIntensity;
      }
    }
    if (role?.scenes) {
      const roleScene = role.scenes[scene];
      if (roleScene) {
        if (roleScene.voice !== void 0) result.voice = roleScene.voice || result.voice;
        if (roleScene.rate !== void 0) result.rate = roleScene.rate;
        if (roleScene.volume !== void 0) result.volume = roleScene.volume;
        if (roleScene.emotion !== void 0) result.emotion = roleScene.emotion;
        if (roleScene.emotionIntensity !== void 0) result.emotionIntensity = roleScene.emotionIntensity;
      }
    }
  }
  if (override?.voice !== void 0) result.voice = override.voice;
  if (override?.rate !== void 0) result.rate = override.rate;
  if (override?.volume !== void 0) result.volume = override.volume;
  if (override?.emotion !== void 0) result.emotion = override.emotion;
  if (override?.emotionIntensity !== void 0) result.emotionIntensity = override.emotionIntensity;
  return result;
}

// src/page-html.js
var pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh \u8BED\u97F3 \xB7 \u6D4B\u8BD5\u4E0E\u8BBE\u7F6E</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--dsw-alias-bg-base, #0f1115); color: var(--dsw-alias-label-primary, #e6e8eb);
  font: 13px/1.6 var(--dsw-font-family, "Segoe UI", system-ui, sans-serif); }
header { display: flex; align-items: center; gap: 14px; padding: 12px 22px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #2a3038); }
header h1 { font-size: 15px; font-weight: 600; }
header .sub { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; }
.version-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 12px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #2a3038); background: var(--dsw-alias-bg-layer-2, #1a1f27); font-size: 12px; }
.version-badge b { color: var(--dsw-alias-label-primary, #e6e8eb); font-weight: 600; }
.version-badge .tag { padding: 0 8px; border-radius: 999px; background: var(--dsw-alias-accent-soft, #2a3038);
  color: var(--dsw-alias-label-secondary, #9aa3ad); font-variant-numeric: tabular-nums; }
main { max-width: 760px; margin: 0 auto; padding: 18px 22px; }
.panel { background: var(--dsw-alias-bg-module-platform, #161a21); border: 1px solid var(--dsw-alias-border-l2, #2a3038);
  border-radius: 10px; padding: 14px; margin-bottom: 14px; }
.panel h2 { font-size: 13.5px; margin-bottom: 10px; color: var(--dsw-alias-label-secondary, #9aa3ad); font-weight: 600; }
textarea, input[type=text], input[type=number], select { width: 100%; background: var(--dsw-alias-bg-base, #0f1115);
  border: 1px solid var(--dsw-alias-border-l2, #2a3038); color: var(--dsw-alias-label-primary, #e6e8eb);
  border-radius: 6px; padding: 9px 11px; font-size: 13px; outline: none; resize: vertical; }
textarea { min-height: 64px; }
textarea:focus, input:focus, select:focus { border-color: var(--dsw-alias-brand-primary, #4d8cff); }
.row { display: flex; gap: 10px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 0; }
.row label { flex: none; color: var(--dsw-alias-label-secondary, #9aa3ad); font-size: 12px; min-width: 70px; }
button { background: var(--dsw-alias-button-info-fill, #4d8cff); border: none; color: var(--dsw-alias-label-inverse, #fff);
  border-radius: 6px; padding: 8px 16px; font-size: 12.5px; cursor: pointer; flex: none; }
button:hover { opacity: .9; }
button.ghost { background: transparent; border: 1px solid var(--dsw-alias-border-l2, #2a3038); color: var(--dsw-alias-label-secondary, #9aa3ad); }
#msg, #setmsg { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; margin-top: 8px; }
.hint { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; margin-top: 6px; }
.voices { max-height: 180px; overflow-y: auto; border: 1px solid var(--dsw-alias-border-l2, #2a3038);
  border-radius: 6px; padding: 6px; margin-top: 6px; }
.voice-item { padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 12px; }
.voice-item:hover { background: var(--dsw-alias-interactive-bg-hover, #1c2129); }
.voice-item.active { color: var(--dsw-alias-brand-primary, #4d8cff); }
</style>
</head>
<body>
<header>
  <h1>dsh \u8BED\u97F3</h1>
  <span class="version-badge"><b>DSH\u8BED\u97F3\u52A9\u624B</b><span class="tag">v${"0.2.4"}</span></span>
  <span class="sub">speak \u5DE5\u5177 / /voice \u547D\u4EE4 / \u81EA\u52A8\u901A\u77E5\u5171\u7528\u6B64\u540E\u7AEF \xB7 \u706B\u5C71 TTS\uFF08\u5931\u8D25\u56DE\u9000 SAPI\uFF09</span>
</header>
<main>
  <div class="panel">
    <h2>\u53D1\u4E00\u6761\u8BED\u97F3 / \u901A\u77E5</h2>
    <textarea id="text" placeholder="\u8981\u64AD\u62A5 / \u901A\u77E5\u7684\u5185\u5BB9\u2026">\u4F60\u597D\uFF0C\u6211\u662F dsh \u8BED\u97F3\u52A9\u624B\uFF0C\u8FD9\u662F\u64AD\u62A5\u6D4B\u8BD5\u3002</textarea>
    <div class="row">
      <label>\u65B9\u5F0F</label>
      <select id="mode">
        <option value="speak">\u8BED\u97F3\u64AD\u62A5</option>
        <option value="toast">\u684C\u9762\u901A\u77E5</option>
        <option value="sound">\u63D0\u793A\u97F3</option>
        <option value="both">\u8BED\u97F3 + \u684C\u9762</option>
      </select>
    </div>
    <div class="row">
      <label>\u573A\u666F</label>
      <select id="scene">
        <option value="">\uFF08\u4E0D\u6307\u5B9A\uFF09</option>
        <option value="task_start">\u5F00\u59CB</option>
        <option value="milestone">\u5173\u952E\u70B9</option>
        <option value="task_complete">\u5B8C\u6210</option>
        <option value="need_interaction">\u547C\u53EB</option>
        <option value="task_error">\u51FA\u9519</option>
      </select>
      <label>\u60C5\u7EEA</label>
      <select id="emotion">
        <option value="">\uFF08\u6309\u573A\u666F\uFF09</option>
        <option value="neutral">neutral</option>
        <option value="happy">happy</option>
        <option value="sad">sad</option>
        <option value="angry">angry</option>
        <option value="calm">calm</option>
        <option value="excited">excited</option>
      </select>
    </div>
    <div class="row">
      <button onclick="send()">\u53D1\u9001</button>
      <button class="ghost" onclick="demo()">\u6F14\u793A\uFF1A\u4EFB\u52A1\u5B8C\u6210</button>
      <button class="ghost" onclick="stopVoice()">\u505C\u6B62\u64AD\u62A5</button>
    </div>
    <div id="msg"></div>
  </div>

  <div class="panel">
    <h2>\u53EF\u7528\u97F3\u8272\uFF08\u70B9\u51FB\u8BD5\u542C\uFF09</h2>
    <button class="ghost" onclick="loadVoices()" style="margin-bottom:8px">\u5237\u65B0\u97F3\u8272\u5217\u8868</button>
    <div class="voices" id="voices"><div style="color:var(--dsw-alias-label-tertiary,#9aa3ad);font-size:12px;padding:8px">\u70B9\u51FB\u300C\u5237\u65B0\u97F3\u8272\u5217\u8868\u300D\u52A0\u8F7D</div></div>
  </div>

  <div class="panel">
    <h2>\u63D0\u793A\u97F3\u8BD5\u542C\uFF08\u97F3\u91CF\u5DF2 +100%\uFF09</h2>
    <div class="row" style="flex-wrap:wrap">
      <label>\u63D0\u793A\u97F3</label>
      <select id="sound-preview">
        <option value="melodious">WAV\xB7\u60A6\u8033</option>
        <option value="bright">WAV\xB7\u660E\u4EAE</option>
        <option value="light">WAV\xB7\u8F7B\u5FEB</option>
        <option value="ding_ding">WAV\xB7\u53EE\u53EE</option>
        <option value="gift">WAV\xB7\u793C\u7269</option>
        <option value="short">WAV\xB7\u77ED\u4FC3</option>
        <option value="sudden">WAV\xB7\u6025\u4FC3</option>
        <option value="sudden_2">WAV\xB7\u6025\u4FC32</option>
        <option value="tactful">WAV\xB7\u59D4\u5A49</option>
      </select>
      <button onclick="previewSound()">\u8BD5\u542C</button>
    </div>
    <div id="sound-msg" class="hint"></div>
    <div class="hint">\u573A\u666F\u63D0\u793A\u97F3\u5728\u8BBE\u7F6E\u9762\u677F\u91CC\u53EF\u5206\u522B\u914D\u7F6E\uFF08\u5F00\u59CB/\u5173\u952E\u70B9/\u5B8C\u6210/\u547C\u53EB/\u51FA\u9519\uFF09\u3002</div>
  </div>

  <div class="panel">
    <h2>\u884C\u4E3A\u504F\u597D</h2>
    <div class="row">
      <label>\u9ED8\u8BA4\u65B9\u5F0F</label>
      <select id="set-mode">
        <option value="toast">\u684C\u9762\u901A\u77E5</option>
        <option value="speak">\u8BED\u97F3\u64AD\u62A5</option>
        <option value="sound">\u63D0\u793A\u97F3</option>
        <option value="both">\u8BED\u97F3 + \u684C\u9762</option>
      </select>
    </div>
    <div class="row">
      <label>\u5F15\u64CE</label>
      <select id="set-engine">
        <option value="auto">auto\uFF08\u6709 MiMo Key \u7528 MiMo\uFF0C\u5426\u5219\u706B\u5C71\uFF0C\u5426\u5219 SAPI\uFF09</option>
        <option value="mimo">mimo\uFF08\u5C0F\u7C73 MiMo V2.5-TTS\uFF09</option>
        <option value="volcano">volcano\uFF08\u706B\u5C71 seed-tts\uFF0C\u9AD8\u97F3\u8D28\uFF09</option>
        <option value="windows-sapi">windows-sapi\uFF08\u79BB\u7EBF\uFF0C\u673A\u68B0\u97F3\uFF09</option>
        </select>
    </div>
    <div class="row">
      <label>\u65E0\u4EBA\u56DE\u5E94\u7B49\u5F85(\u79D2)</label>
      <input type="number" id="set-delay" min="5" max="600" style="width:90px">
    </div>
    <div class="hint">\u4EFB\u52A1\u7B54\u5B8C\u5148\u5F39\u684C\u9762\u901A\u77E5 \u2192 \u7B49\u8FD9\u4E48\u591A\u79D2 \u2192 \u671F\u95F4\u4F60\u6709\u4EFB\u4F55\u64CD\u4F5C\uFF08\u53D1\u6D88\u606F/\u70B9\u4F1A\u8BDD/\u6EDA\u52A8/\u62D6\u52A8\uFF09\uFF1D\u4EBA\u56DE\u6765\u4E86\uFF0C\u5C31\u4E0D\u6253\u6270\uFF1B\u5B8C\u5168\u6CA1\u64CD\u4F5C\uFF1D\u4EBA\u4E0D\u5728\uFF0C\u64AD\u653E\u300C\u5B8C\u6210\u300D\u8BED\u97F3\u53EB\u4F60\u56DE\u6765</div>
    <div class="row" style="min-height:38px">
      <label style="flex:none;color:var(--dsw-alias-label-secondary,#9aa3ad);font-size:12px;min-width:70px">\u5F00\u59CB\u81EA\u52A8\u64AD\u62A5</label>
      <div style="display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary,#e6e8eb)">
        <input type="checkbox" id="set-taskstart" style="width:auto;accent-color:var(--dsw-alias-brand-primary,#4d8cff)">
        <span>\u53D1\u65B0\u6D88\u606F\uFF08agent \u7A7A\u95F2\uFF09\uFF1D\u65B0\u4EFB\u52A1\u5F00\u59CB\uFF0C\u81EA\u52A8\u64AD\u62A5\u300C\u5F00\u59CB\u300D\u6A21\u677F</span>
      </div>
    </div>
    <div class="row" style="min-height:38px">
      <label style="flex:none;color:var(--dsw-alias-label-secondary,#9aa3ad);font-size:12px;min-width:70px">\u63D0\u95EE\u81EA\u52A8\u547C\u53EB</label>
      <div style="display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary,#e6e8eb)">
        <input type="checkbox" id="set-question" style="width:auto;accent-color:var(--dsw-alias-brand-primary,#4d8cff)">
        <span>\u4EFB\u52A1\u4E2D\u9014 agent \u8981\u4F60\u786E\u8BA4/\u9009\u62E9/\u586B\u5165\u65F6\uFF0C\u7B49\u5F85\u8FC7\u4E45\u4E14\u4F60\u79BB\u5F00 \u2192 \u81EA\u52A8\u64AD\u62A5\u300C\u547C\u53EB\u300D\u9632\u5361\u4F4F</span>
      </div>
    </div>
    <div class="row" style="color:var(--dsw-alias-label-secondary,#9aa3ad);font-size:12px">
      <span id="engine-status">\u5B9E\u9645\u5F15\u64CE\uFF1A\u2026</span>
    </div>
    <div class="row">
      <button onclick="saveSettings()">\u4FDD\u5B58\u8BBE\u7F6E</button>
      <span id="setmsg"></span>
    </div>
    <div class="hint">\u8BBE\u7F6E\u4FDD\u5B58\u5230 settings.yaml \u7684 voice \u5206\u533A\uFF0C\u7ACB\u5373\u751F\u6548\uFF08\u5F15\u64CE\u5207\u6362\u91CD\u7F6E\u7F13\u5B58\uFF09\uFF0C\u65E0\u9700\u91CD\u542F dsh\u3002SAPI \u515C\u5E95\u56FA\u5B9A\u542F\u7528\uFF1A\u4E91\u7AEF\u5F15\u64CE\uFF08\u706B\u5C71 / \u5C0F\u7C73 MiMo\uFF09\u5931\u8D25\u81EA\u52A8\u56DE\u9000\u79BB\u7EBF\u8BED\u97F3\u3002</div>
  </div>
</main>
<script>
const $ = s => document.querySelector(s);
async function send(extraVoice) {
  const text = $('#text').value.trim();
  if (!text) { $('#msg').textContent = '\u5185\u5BB9\u4E3A\u7A7A'; return; }
  $('#msg').textContent = '\u64AD\u62A5\u4E2D\u2026';
  const body = { text, mode: $('#mode').value };
  if ($('#scene').value) body.scene = $('#scene').value;
  if ($('#emotion').value) body.emotion = $('#emotion').value;
  if (extraVoice) body.voice = extraVoice;
  const r = await fetch('/voice/api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  $('#msg').textContent = r.ok ? ('\u5DF2\u53D1\u9001\uFF08' + d.mode + '\uFF09' + (extraVoice ? '\uFF0C\u97F3\u8272: ' + extraVoice : '')) : ('\u5931\u8D25: ' + (d.error || r.status));
}
function demo() {
  $('#text').value = '\u4EFB\u52A1\u5DF2\u7ECF\u5168\u90E8\u5B8C\u6210\u4E86\uFF0C\u5FEB\u6765\u770B\u770B\u7ED3\u679C\u4E86\u3002';
  $('#mode').value = 'both';
  $('#scene').value = 'task_complete';
  $('#emotion').value = 'happy';
  send();
}
async function stopVoice() {
  await fetch('/voice/api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text:'stop', mode:'toast' }) });
  $('#msg').textContent = '\u5DF2\u53D1\u9001\u505C\u6B62';
}
async function loadVoices() {
  try {
    const r = await fetch('/voice/api/voices');
    const d = await r.json();
    const list = d.voices || [];
    const html = list.map(v => '<div class="voice-item" onclick="testVoice(\\''+v+'\\')">' + v + '</div>').join('');
    $('#voices').innerHTML = html || '<div style="color:#9aa3ad;padding:8px">\u65E0\u53EF\u7528\u97F3\u8272</div>';
  } catch(e) { $('#voices').innerHTML = '<div style="color:#f87171;padding:8px">\u52A0\u8F7D\u5931\u8D25: ' + e.message + '</div>'; }
}
function testVoice(voice) {
  $$('.voice-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  $('#text').value = '\u8FD9\u662F ' + voice + ' \u97F3\u8272\u7684\u8BD5\u542C\u3002';
  $('#mode').value = 'speak';
  send(voice);
}
function $$(s) { return document.querySelectorAll(s); }
async function previewSound() {
  const sound = $('#sound-preview').value;
  const r = await fetch('/voice/api/sound', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sound }) });
  const d = await r.json().catch(() => ({}));
  $('#sound-msg').textContent = r.ok ? ('\u5DF2\u64AD\u653E\uFF1A' + sound) : ('\u5931\u8D25: ' + (d.error || r.status));
}
async function loadSettings() {
  try {
    const r = await fetch('/voice/api/settings');
    const d = await r.json();
    if (!d.config) return;
    const c = d.config;
    $('#set-mode').value = c.defaultMode || 'toast';
    $('#set-engine').value = c.engine || 'auto';
    $('#set-delay').value = c.callDelaySeconds || 60;
    $('#set-taskstart').checked = c.onTaskStart !== false;
    $('#set-question').checked = c.onQuestion !== false;
    // \u5B9E\u9645\u5F15\u64CE\u72B6\u6001\uFF08volcano / windows-sapi\uFF09
    const eng = $('#engine-status');
    if (eng) {
      const map = { volcano: '\u706B\u5C71\u4E91\u7AEF', mimo: '\u5C0F\u7C73 MiMo \u4E91\u7AEF', 'windows-sapi': 'SAPI \u79BB\u7EBF' };
      eng.textContent = '\u5B9E\u9645\u5F15\u64CE\uFF1A' + (map[d.engine] || d.engine || '\u672A\u77E5');
    }
  } catch(e) { $('#setmsg').textContent = '\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25: ' + e.message; }
}
async function saveSettings() {
  const body = {
    defaultMode: $('#set-mode').value,
    engine: $('#set-engine').value,
    callDelaySeconds: Number($('#set-delay').value) || 60,
    onTaskStart: $('#set-taskstart').checked,
    onQuestion: $('#set-question').checked,
  };
  const r = await fetch('/voice/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  $('#setmsg').textContent = r.ok ? '\u5DF2\u4FDD\u5B58\uFF0C\u7ACB\u5373\u751F\u6548\uFF08\u5F15\u64CE\u7F13\u5B58\u5DF2\u91CD\u7F6E\uFF09' : ('\u4FDD\u5B58\u5931\u8D25: ' + (d.error || r.status));
}
loadSettings();
</script>
</body>
</html>`;

// src/index.js
var name = "dsh-plugin-voice";
var inject = ["commands", "webServer", "tools", "systemPrompt", "settings", "userQuestions"];
var PACKAGE_ROOT = join5(dirname2(fileURLToPath2(import.meta.url)), "..");
var PS1 = join5(PACKAGE_ROOT, "notify.ps1");
var IDLE_PS1 = join5(PACKAGE_ROOT, "idle.ps1");
var VALID_MODES = ["toast", "speak", "sound", "both"];
var VALID_SCENES = ["task_start", "task_complete", "task_error", "need_interaction", "milestone"];
var VALID_EMOTIONS = ["neutral", "happy", "sad", "angry", "calm", "excited"];
var SPEAK_MAX_CHARS = 300;
function engineNameOf(engine2) {
  if (!engine2) return "unknown";
  if (typeof engine2.engineName === "string") return engine2.engineName;
  if (typeof engine2.type === "string" && engine2.type !== "undefined") return engine2.type;
  return String(engine2.constructor?.name ?? "unknown");
}
var pendingCalls = /* @__PURE__ */ new Map();
var questionCallTokens = /* @__PURE__ */ new Set();
var QUESTION_IMMEDIATE_GRACE_MS = 3e3;
function fireQuestionCall(why) {
  const cfg = loadConfig();
  if (cfg.onQuestion === false) return;
  console.log(`[voice] agent \u63D0\u95EE\u672A\u56DE\u7B54\u4E14\u7528\u6237\u4E0D\u5728\u7535\u8111\u524D\uFF08${why}\uFF09\uFF0C\u64AD\u62A5\u300C\u547C\u53EB\u300D\u9632\u5361\u4F4F`);
  notify("speak", "\u9700\u8981\u4F60\u7684\u786E\u8BA4", renderTemplate(cfg.templates?.need_interaction ?? DEFAULT_TEMPLATES.need_interaction), {
    scene: "need_interaction",
    emotion: "calm"
  }).catch((e) => console.error("[voice] \u63D0\u95EE\u547C\u53EB\u64AD\u62A5\u5931\u8D25:", e.message));
}
function scheduleQuestionCall(request) {
  const config = loadConfig();
  if (config.onQuestion === false) return null;
  const n = Array.isArray(request?.questions) ? request.questions.length : 0;
  if (n <= 0) return null;
  const delaySec = config.callDelaySeconds || 60;
  const token = { cancelled: false, timer: null };
  questionCallTokens.add(token);
  (async () => {
    let alreadyAway = false;
    try {
      const idleNow = await queryIdle();
      alreadyAway = idleNow > 60;
      if (alreadyAway) {
        console.log(`[voice] agent \u53D1\u8D77\u63D0\u95EE\uFF08${n} \u4E2A\u95EE\u9898\u5F85\u786E\u8BA4\uFF09\uFF0C\u7528\u6237\u5DF2\u79BB\u5F00\uFF08\u7A7A\u95F2 ${idleNow}s\uFF09\uFF0C${QUESTION_IMMEDIATE_GRACE_MS / 1e3} \u79D2\u5BBD\u9650\u540E\u7ACB\u5373\u64AD\u62A5\u300C\u547C\u53EB\u300D`);
      }
    } catch {
    }
    if (token.cancelled) return;
    if (!alreadyAway) {
      console.log(`[voice] agent \u53D1\u8D77\u63D0\u95EE\uFF08${n} \u4E2A\u95EE\u9898\u5F85\u786E\u8BA4\uFF09\uFF0C${delaySec} \u79D2\u672A\u56DE\u7B54\u4E14\u7528\u6237\u79BB\u5F00\u5C06\u64AD\u62A5\u300C\u547C\u53EB\u300D`);
    }
    token.timer = setTimeout(async () => {
      token.timer = null;
      if (token.cancelled) {
        questionCallTokens.delete(token);
        return;
      }
      if (!alreadyAway) {
        try {
          const cfg = loadConfig();
          if (cfg.onQuestion === false) {
            questionCallTokens.delete(token);
            return;
          }
          const idle = await queryIdle();
          if (idle <= 60) {
            console.log(`[voice] \u63D0\u95EE\u7B49\u5F85\u8D85\u65F6\uFF0C\u4F46\u7528\u6237\u8FD1\u671F\u6709\u64CD\u4F5C\uFF08\u7A7A\u95F2 ${idle}s\uFF09\uFF0C\u4E0D\u64AD\u62A5\uFF08\u5E94\u8BE5\u6B63\u5728\u770B\uFF09`);
            questionCallTokens.delete(token);
            return;
          }
        } catch (e) {
          console.error("[voice] \u63D0\u95EE\u547C\u53EB\u5904\u7406\u5931\u8D25:", e.message);
          questionCallTokens.delete(token);
          return;
        }
      }
      questionCallTokens.delete(token);
      fireQuestionCall(alreadyAway ? `\u53D1\u8D77\u63D0\u95EE\u65F6\u7528\u6237\u5DF2\u79BB\u5F00\uFF0C\u5BBD\u9650 ${QUESTION_IMMEDIATE_GRACE_MS / 1e3}s` : `\u7B49\u5F85 ${delaySec}s \u65E0\u4EBA\u5E94\u7B54`);
    }, alreadyAway ? QUESTION_IMMEDIATE_GRACE_MS : delaySec * 1e3);
  })();
  return token;
}
function cancelQuestionCall(token) {
  if (!token) return;
  token.cancelled = true;
  if (token.timer) {
    clearTimeout(token.timer);
    token.timer = null;
  }
  if (questionCallTokens.delete(token)) {
    console.log("[voice] \u63D0\u95EE\u5DF2\u56DE\u7B54/\u7ED3\u675F\uFF0C\u53D6\u6D88\u300C\u547C\u53EB\u300D\u8BA1\u65F6");
  }
}
var homeDir = process.env.USERPROFILE || process.env.HOME || "";
var CONFIG_FILE = join5(homeDir, ".dsh", "voice", "config.json");
var _settingsScope2 = null;
var _applied = false;
var DEFAULT_TEMPLATES = {
  task_start: "\u5F00\u59CB\u6267\u884C\u4EFB\u52A1\u4E86",
  task_complete: "\u4EFB\u52A1\u5DF2\u7ECF\u5B8C\u6210\u4E86\uFF0C\u5FEB\u6765\u770B\u770B\u7ED3\u679C\u4E86",
  task_error: "\u4EFB\u52A1\u51FA\u9519\u4E86\uFF0C\u9700\u8981\u4F60\u5904\u7406\u4E00\u4E0B\u5B50",
  need_interaction: "\u6211\u9700\u8981\u4F60\u8FC7\u6765\u770B\u770B\u4E86",
  milestone: "\u6211\u5DF2\u8DE8\u8FC7\u6700\u9AD8\u7684\u5C71\u4E86\uFF0C\u540E\u9762\u90FD\u662F\u5C0F\u6253\u5C0F\u95F9\u4E86"
};
function runProcess(command, args, { timeout = 15e3, env } = {}) {
  return new Promise((resolve2, reject) => {
    const child = spawn4(command, args, {
      windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${command} \u6267\u884C\u8D85\u65F6\uFF08${timeout}ms\uFF09`));
    }, timeout);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve2(stdout);
      else {
        const detail = (stderr || stdout).trim().slice(0, 300);
        reject(new Error(detail || `${command} \u9000\u51FA\u7801 ${code}`));
      }
    });
  });
}
async function queryIdle() {
  try {
    const stdout = await runProcess("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", IDLE_PS1], { timeout: 15e3 });
    const d = JSON.parse(stdout.trim());
    return Number(d.idle_seconds) || 0;
  } catch {
  }
  return 0;
}
var engine = null;
var voiceQueue = null;
var engineInitPromise = null;
function ensureEngine() {
  if (engine && voiceQueue) return Promise.resolve(voiceQueue);
  if (engineInitPromise) return engineInitPromise;
  engineInitPromise = (async () => {
    const config = loadConfig();
    engine = await createTTSEngine({
      engine: config.engine,
      cloud: config.cloud,
      mimo: config.mimo
    });
    const fallbackEngine = await createFallbackEngine();
    voiceQueue = new VoiceQueue(engine, 2, false, fallbackEngine);
    return voiceQueue;
  })().finally(() => {
    engineInitPromise = null;
  });
  return engineInitPromise;
}
async function refreshEngine() {
  resetEngineCache();
  resetConfigCache();
  engine = null;
  voiceQueue = null;
  engineInitPromise = null;
  await ensureEngine();
}
var notifyQueue = Promise.resolve();
async function notify(mode, title, message, options = {}) {
  if (!VALID_MODES.includes(mode)) mode = "toast";
  let text = String(message ?? "").trim();
  if (!text) return Promise.reject(new Error("\u901A\u77E5\u5185\u5BB9\u4E3A\u7A7A"));
  if (options.onlyIfAway && (mode === "speak" || mode === "both")) {
    const idle = await queryIdle();
    if (idle <= 120) {
      console.log(`[voice] onlyIfAway\uFF1A\u7528\u6237\u5728\u573A\uFF08\u7A7A\u95F2 ${idle}s\uFF09\uFF0C\u8BED\u97F3\u964D\u7EA7\u4E3A toast`);
      mode = "toast";
    } else {
      console.log(`[voice] onlyIfAway\uFF1A\u7528\u6237\u5DF2\u79BB\u5F00\uFF08\u7A7A\u95F2 ${idle}s\uFF09\uFF0C\u8BED\u97F3\u64AD\u62A5`);
    }
  }
  if (mode === "speak" || mode === "both") {
    const config = loadConfig();
    let speechText = config.textClean !== false ? cleanSpeechText(text) : text;
    speechText = truncateForSpeech(speechText, config.maxTextLength ?? 200);
    if (speechText) {
      const scene = options.scene && VALID_SCENES.includes(options.scene) ? options.scene : void 0;
      const role = resolveRole(config.roles, options.role);
      const resolved = resolveOptions(config, scene, {
        voice: options.voice,
        rate: options.rate,
        volume: options.volume,
        emotion: options.emotion,
        emotionIntensity: options.emotionIntensity
      }, role);
      const sceneSound = scene && config.sceneSounds?.[scene] ? config.sceneSounds[scene] : false;
      const q = await ensureEngine();
      q.enqueue(speechText, resolved, sceneSound);
    }
    if (mode === "both") {
    } else {
      return { mode, engine: engineNameOf((await ensureEngine()).engine) };
    }
    text = text.slice(0, SPEAK_MAX_CHARS);
  }
  if (mode === "toast" || mode === "sound" || mode === "both") {
    const payload = Buffer.from(JSON.stringify({
      mode: mode === "both" ? "both" : mode === "speak" ? "toast" : mode,
      title: String(title ?? "dsh \u901A\u77E5"),
      message: text
    })).toString("base64");
    if (!existsSync3(PS1)) return Promise.reject(new Error(`notify.ps1 \u4E0D\u5B58\u5728: ${PS1}`));
    const task = notifyQueue.then(async () => {
      await runProcess("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1], {
        timeout: 12e4,
        env: { DSH_VOICE_PAYLOAD: payload }
      });
    });
    notifyQueue = task.then(() => {
    }, () => {
    });
    await task;
  }
  return { mode };
}
function renderTemplate(tpl, vars = {}) {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k === "summary") {
      const s = String(vars.summary ?? "").trim();
      return s ? `\uFF1A${s}` : "";
    }
    if (k === "session") return String(vars.session ?? "");
    return m;
  });
}
function parseFlags(raw) {
  let mode = loadConfig().defaultMode || "toast";
  let rest = String(raw ?? "").trim();
  for (const flag of ["--speak", "--sound", "--toast", "--both"]) {
    if (rest.includes(flag)) {
      mode = flag.slice(2);
      rest = rest.replace(flag, "").trim();
      break;
    }
  }
  let scene, emotion, role;
  const sceneMatch = rest.match(/--scene=(\w+)/);
  if (sceneMatch) {
    scene = sceneMatch[1];
    rest = rest.replace(sceneMatch[0], "").trim();
  }
  const emotionMatch = rest.match(/--emotion=(\w+)/);
  if (emotionMatch) {
    emotion = emotionMatch[1];
    rest = rest.replace(emotionMatch[0], "").trim();
  }
  const roleMatch = rest.match(/--role=(\S+)/);
  if (roleMatch) {
    role = roleMatch[1];
    rest = rest.replace(roleMatch[0], "").trim();
  }
  return { mode, text: rest, scene, emotion, role };
}
function sendHtml(res, text) {
  const data = Buffer.from(text, "utf8");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": data.length });
  res.end(data);
}
function sendJson(res, code, obj) {
  const data = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": data.length });
  res.end(data);
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
function apply(ctx) {
  if (_applied) {
    console.log("[voice] apply \u91CD\u590D\u8C03\u7528\uFF0C\u8DF3\u8FC7\uFF08HMR \u91CD\u8F7D\uFF09");
    return;
  }
  _applied = true;
  try {
    const voiceSchema = z.object({
      defaultMode: z.string().default("both"),
      engine: z.string().default("auto"),
      callDelaySeconds: z.number().default(60),
      onTurnEnd: z.boolean().default(true),
      onTaskStart: z.boolean().default(true),
      onQuestion: z.boolean().default(true),
      autoCall: z.boolean().default(true),
      textClean: z.boolean().default(true),
      maxTextLength: z.number().default(200),
      volume: z.number().default(1.3),
      rate: z.number().default(200),
      cloud_apiKey: z.string().default(""),
      cloud_voice: z.string().default("zh_female_daimengchuanmei_moon_bigtts"),
      cloud_resourceId: z.string().default("seed-tts-1.0"),
      mimo_apiKey: z.string().default(""),
      mimo_voice: z.string().default("mimo_default"),
      cloud_energyRate: z.number().default(0),
      cloud_retries: z.number().default(1),
      cloud_timeout: z.number().default(3e4),
      cloud_pauseSentenceMs: z.number().default(400),
      cloud_pauseCommaMs: z.number().default(200),
      templates: z.object({
        task_start: z.string().default(DEFAULT_TEMPLATES.task_start),
        task_complete: z.string().default(DEFAULT_TEMPLATES.task_complete),
        task_error: z.string().default(DEFAULT_TEMPLATES.task_error),
        need_interaction: z.string().default(DEFAULT_TEMPLATES.need_interaction),
        milestone: z.string().default(DEFAULT_TEMPLATES.milestone)
      }).default({}),
      sceneSounds: z.object({
        task_start: z.string().default("light"),
        task_complete: z.string().default("bright"),
        task_error: z.string().default("melodious"),
        need_interaction: z.string().default("ding_ding"),
        milestone: z.string().default("gift")
      }).default({})
    });
    _settingsScope2 = ctx.settings?.register(settingsNamespace("voice"), voiceSchema, { applies: "live" });
    if (_settingsScope2) {
      console.log("[voice] \u5DF2\u6CE8\u518C\u539F\u751F\u8BBE\u7F6E\uFF08settings.yaml \u7684 voice \u5206\u533A\uFF09");
      setSettingsScope(_settingsScope2);
      _settingsScope2.watch(() => {
        try {
          resetConfigCache();
          refreshEngine().catch((e) => console.error("[voice] \u8BBE\u7F6E\u53D8\u66F4\u5237\u65B0\u5F15\u64CE\u5931\u8D25:", e.message));
          console.log("[voice] settings \u5DF2\u53D8\u66F4\uFF0C\u5B9E\u65F6\u5237\u65B0\u914D\u7F6E\u4E0E\u5F15\u64CE");
        } catch (e) {
          console.error("[voice] settings watch \u5904\u7406\u5931\u8D25:", e.message);
        }
      });
    }
  } catch (e) {
    console.error("[voice] settings \u6CE8\u518C\u5931\u8D25\uFF0C\u56DE\u9000 config.json:", e.message);
  }
  if (process.env.DSH_VOICE_INJECT_PROMPT !== "0") {
    ctx.systemPrompt?.section?.({
      name: "voice-user-guidance",
      order: 100,
      text: '\u4F60\u6709 speak / notify_user / user_activity / stop \u5DE5\u5177\uFF0C\u7528\u4E8E\u8BED\u97F3\u64AD\u62A5\u548C\u4E3B\u52A8\u8054\u7CFB\u7528\u6237\u3002\u89C4\u5219\uFF1A\n1. \u5FC5\u987B\uFF1A\u4EFB\u52A1\u51FA\u9519\u3001\u6216\u9700\u8981\u7528\u6237\u6CE8\u610F\u4E0E\u786E\u8BA4\u65F6\uFF0C\u7ACB\u5373\u7528 speak \u8BED\u97F3\u64AD\u62A5\uFF08scene \u4F20 task_error\uFF0Cemotion \u4F20 angry\uFF09\n2. \u5FC5\u987B\uFF1A\u5B8C\u6210\u591A\u6B65\u6216\u8F83\u957F\u65F6\u95F4\u7684\u4EFB\u52A1\u540E\uFF0C\u7528 speak \u8BED\u97F3\u64AD\u62A5\uFF08scene \u4F20 task_complete\uFF0Cemotion \u4F20 happy\uFF09\uFF1B\u82E5\u7528\u6237\u4E0D\u5728\u7535\u8111\u524D\uFF08user_activity \u7A7A\u95F2\u8D85\u8FC7 2 \u5206\u949F\uFF09\uFF0C\u7528\u8BED\u97F3\u547C\u53EB\u7528\u6237\u56DE\u6765\n3. \u5FC5\u987B\uFF1A\u591A\u6B65\u4EFB\u52A1\u9047\u5230\u5173\u952E\u8FDB\u5C55\u8282\u70B9\uFF08\u5982\u5B50\u6B65\u9AA4\u5B8C\u6210\u3001\u5173\u952E\u6587\u4EF6\u751F\u6210\u3001\u9A8C\u8BC1\u901A\u8FC7\uFF09\u65F6\uFF0C\u7528 speak \u64AD\u62A5\u8FDB\u5EA6\uFF08scene \u4F20 milestone\uFF0Cemotion \u4F20 happy\uFF09\uFF0C\u6587\u6848\u8BF4\u6E05\u695A\u5230\u4E86\u54EA\u4E00\u6B65\uFF08\u5982"\u7B2C\u4E00\u6B65\u641E\u5B9A\u4E86""\u62A5\u544A\u5DF2\u751F\u6210\uFF0C\u6B63\u5728\u68C0\u67E5"\uFF09\uFF1B\u4EFB\u52A1\u5F00\u59CB\u64AD\u62A5\u7531\u63D2\u4EF6\u81EA\u52A8\u5B8C\u6210\uFF0C\u65E0\u9700\u91CD\u590D\u8C03\u7528\n4. \u64AD\u62A5\u5185\u5BB9\u81EA\u5DF1\u5199\u8FDB message\uFF0C\u60F3\u8BF4\u5565\u8BF4\u5565\uFF0C\u50CF\u8DDF\u670B\u53CB\u8BF4\u8BDD\u4E00\u6837\u81EA\u7136\uFF08\u5982"\u641E\u5B9A\u4E86\uFF0C\u62A5\u544A\u653E\u684C\u9762\u4E86"\uFF09\uFF1B\u4E0D\u5199\u5219\u7528\u573A\u666F\u9ED8\u8BA4\u6587\u6848\n5. \u60C5\u7EEA\uFF1Ahappy=\u5B8C\u6210 / calm=\u5F00\u59CB / angry=\u51FA\u9519 / excited=\u5173\u952E\u70B9\uFF1BemotionIntensity 0-1 \u63A7\u5236\u5F3A\u5EA6\n6. \u4F8B\u5916\uFF1A\u51E0\u79D2\u5C31\u80FD\u5B8C\u6210\u7684\u7B80\u5355\u4EFB\u52A1\u65E0\u9700\u64AD\u62A5\uFF0C\u907F\u514D\u6253\u6270'
    });
  }
  ctx.on?.("agent/error", (payload) => {
    try {
      const cfg = loadConfig();
      const text = renderTemplate(cfg.templates?.task_error ?? DEFAULT_TEMPLATES.task_error, {
        session: payload?.agent?.id ?? ""
      });
      notify("both", "dsh \u4EFB\u52A1\u51FA\u9519", text, { scene: "task_error", emotion: "angry" }).catch((e) => console.error("[voice] \u51FA\u9519\u81EA\u52A8\u901A\u77E5\u5931\u8D25:", e.message));
    } catch (e) {
      console.error("[voice] \u51FA\u9519\u81EA\u52A8\u901A\u77E5\u5931\u8D25:", e.message);
    }
  });
  ctx.on?.("agent/turn-stopping", (payload) => {
    try {
      const agent = payload?.agent;
      if (!agent?.session) return;
      const config = loadConfig();
      if (config.onTurnEnd === false) return;
      let text = "";
      for (const ev of agent.session.events) {
        if (ev.type === "assistant/message") {
          const parts = (ev.data?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "");
          if (parts.length) text = parts.join("\n");
        }
      }
      const summary = text.trim().slice(0, 200) || `\u4F1A\u8BDD ${agent.id} \u7684\u56DE\u5408\u5DF2\u7ED3\u675F`;
      notify("toast", "\u4EFB\u52A1\u5B8C\u6210", summary).catch((e) => console.error("[voice] \u5B8C\u6210\u81EA\u52A8\u901A\u77E5\u5931\u8D25:", e.message));
      const cfg = config;
      if (cfg.autoCall !== false) {
        const sessionId = agent.id;
        const prev = pendingCalls.get(sessionId);
        if (prev?.timer) clearTimeout(prev.timer);
        const entry = { summary, responded: false, timer: null };
        entry.timer = setTimeout(async () => {
          try {
            if (!entry.responded) {
              const idle = await queryIdle();
              if (idle <= 60) {
                console.log(`[voice] ${cfg.callDelaySeconds}\u79D2\u5230\uFF0C\u4F46\u7528\u6237\u8FD1\u671F\u6709\u64CD\u4F5C\uFF08\u7A7A\u95F2 ${idle}s\uFF09\uFF0C\u4E0D\u8BED\u97F3\u547C\u53EB\uFF08${sessionId}\uFF09`);
              } else {
                notify("speak", "\u4EFB\u52A1\u5B8C\u6210", renderTemplate(cfg.templates?.task_complete ?? DEFAULT_TEMPLATES.task_complete), {
                  scene: "task_complete",
                  emotion: "happy"
                }).catch((e) => console.error("[voice] \u8BED\u97F3\u547C\u53EB\u5931\u8D25:", e.message));
                console.log(`[voice] ${cfg.callDelaySeconds}\u79D2\u672A\u786E\u8BA4\u4E14\u65E0\u64CD\u4F5C\uFF0C\u8BED\u97F3\u547C\u53EB\uFF08${sessionId}\uFF09`);
              }
            }
          } catch (e) {
            console.error("[voice] \u786E\u8BA4\u7A97\u53E3\u5904\u7406\u5931\u8D25:", e.message);
          }
          pendingCalls.delete(sessionId);
        }, (cfg.callDelaySeconds || 60) * 1e3);
        pendingCalls.set(sessionId, entry);
      }
    } catch (e) {
      console.error("[voice] \u5B8C\u6210\u81EA\u52A8\u901A\u77E5\u5931\u8D25:", e.message);
    }
  });
  ctx.on?.("agent/inbox/inserted", async (payload) => {
    if (payload?.message?.source?.kind !== "user") return;
    for (const [sessionId, entry] of pendingCalls) {
      if (!entry.responded) {
        entry.responded = true;
        if (entry.timer) clearTimeout(entry.timer);
        pendingCalls.delete(sessionId);
        console.log(`[voice] \u7528\u6237\u5DF2\u4E92\u52A8\uFF0C\u53D6\u6D88\u547C\u53EB\uFF08${sessionId}\uFF09`);
      }
    }
    try {
      const config = loadConfig();
      if (config.onTaskStart === false) return;
      if (payload.agent?.status !== "idle") return;
      const text = renderTemplate(config.templates?.task_start ?? DEFAULT_TEMPLATES.task_start, {
        session: payload.agent?.id ?? ""
      });
      notify("speak", "\u4EFB\u52A1\u5F00\u59CB", text, {
        scene: "task_start",
        emotion: "calm"
      }).catch((e) => console.error("[voice] \u5F00\u59CB\u81EA\u52A8\u64AD\u62A5\u5931\u8D25:", e.message));
      console.log(`[voice] \u65B0\u4EFB\u52A1\u5F00\u59CB\uFF0C\u81EA\u52A8\u64AD\u62A5\u300C\u5F00\u59CB\u300D\uFF08${payload.agent?.id}\uFF09`);
    } catch (e) {
      console.error("[voice] \u5F00\u59CB\u81EA\u52A8\u64AD\u62A5\u5931\u8D25:", e.message);
    }
  });
  try {
    const uq = ctx.userQuestions;
    if (uq && typeof uq.ask === "function" && !uq.__voiceQuestionWrapped) {
      uq.__voiceQuestionWrapped = true;
      const originalAsk = Object.getPrototypeOf(uq).ask;
      uq.ask = function wrappedAsk(request) {
        const timer = scheduleQuestionCall(request);
        const result = originalAsk.call(uq, request);
        Promise.resolve(result).catch(() => {
        }).finally(() => cancelQuestionCall(timer));
        return result;
      };
      console.log("[voice] \u5DF2\u63A5\u7BA1 ctx.userQuestions.ask\uFF1Aagent \u63D0\u95EE\u7B49\u5F85\u8FC7\u4E45\u4E14\u7528\u6237\u79BB\u5F00\u65F6\u5C06\u64AD\u62A5\u300C\u547C\u53EB\u300D");
    }
  } catch (e) {
    console.error("[voice] \u5305\u88C5 userQuestions \u5931\u8D25:", e.message);
  }
  ctx.tools?.register?.({
    name: "speak",
    description: "\u901A\u8FC7\u4E91\u7AEF TTS\uFF08\u706B\u5C71 seed-tts \u9AD8\u97F3\u8D28\uFF0C\u5931\u8D25\u81EA\u52A8\u56DE\u9000 SAPI\uFF09\u8BED\u97F3\u64AD\u62A5\u6587\u672C\uFF0C\u6216\u53D1\u684C\u9762\u901A\u77E5 / \u63D0\u793A\u97F3\u4E3B\u52A8\u8054\u7CFB\u7528\u6237\u3002\u4EFB\u52A1\u5B8C\u6210\u3001\u51FA\u9519\u3001\u9700\u8981\u7528\u6237\u6CE8\u610F\u3001\u547C\u53EB\u7528\u6237\u56DE\u6765\u65F6\u4F7F\u7528\u3002\u60F3\u8BF4\u7684\u8BDD\u5199\u8FDB message\uFF08\u81EA\u7531\u53D1\u6325\uFF0C\u8BED\u6C14\u81EA\u7136\u5373\u53EF\uFF09\uFF1B\u4E0D\u5199\u5219\u6309 scene \u7528\u9ED8\u8BA4\u6587\u6848\u3002",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "\u4F60\u60F3\u5BF9\u7528\u6237\u8BF4\u7684\u8BDD\uFF08\u81EA\u7531\u53D1\u6325\uFF0C\u4E0D\u7528\u6A21\u677F\uFF1B\u8BED\u97F3\u64AD\u62A5\u4F1A\u5FF5\u51FA\u6765\uFF0C50 \u5B57\u5185\u6700\u4F73\uFF09" },
        scene: { type: "string", enum: VALID_SCENES, description: "\u64AD\u62A5\u573A\u666F\uFF08\u51B3\u5B9A\u9ED8\u8BA4\u6587\u6848 + \u97F3\u8272/\u8BED\u901F/\u60C5\u7EEA\uFF09\uFF1Atask_start=\u5F00\u59CB / task_complete=\u5B8C\u6210\uFF08\u9ED8\u8BA4\uFF09/ task_error=\u51FA\u9519 / need_interaction=\u547C\u53EB / milestone=\u5173\u952E\u70B9" },
        emotion: { type: "string", enum: VALID_EMOTIONS, description: "\u60C5\u7EEA\uFF1Aneutral/happy/sad/angry/calm/excited\u3002\u9ED8\u8BA4\u6309\u573A\u666F\uFF1A\u5B8C\u6210=happy / \u51FA\u9519=angry / \u5F00\u59CB=calm" },
        emotionIntensity: { type: "number", description: "\u60C5\u7EEA\u5F3A\u5EA6 0-1\uFF0C\u9ED8\u8BA4 0.7" },
        mode: { type: "string", enum: ["speak", "toast", "sound", "both"], description: "speak=\u8BED\u97F3\u64AD\u62A5\uFF08\u9ED8\u8BA4\uFF09\uFF1Btoast=\u684C\u9762\u901A\u77E5\uFF1Bsound=\u63D0\u793A\u97F3\uFF1Bboth=\u8BED\u97F3+\u684C\u9762\u901A\u77E5" },
        role: { type: "string", description: "\u6307\u5B9A\u64AD\u62A5\u89D2\u8272\u540D\uFF08\u591A agent \u4E0D\u540C\u97F3\u8272\uFF09\u3002\u672A\u6307\u5B9A\u7528\u914D\u7F6E\u7684\u7B2C\u4E00\u4E2A\u89D2\u8272" },
        voice: { type: "string", description: "\u8986\u76D6\u97F3\u8272\uFF08\u4F18\u5148\u7EA7\u9AD8\u4E8E\u573A\u666F/\u89D2\u8272\u914D\u7F6E\uFF09" },
        rate: { type: "number", description: "\u8BED\u901F 50-300\uFF0C\u9ED8\u8BA4 200" },
        volume: { type: "number", description: "\u97F3\u91CF 0-2\uFF0C\u9ED8\u8BA4 1.3\uFF08+30%\uFF09" },
        onlyIfAway: { type: "boolean", description: "\u4EC5\u5F53\u7528\u6237\u79BB\u5F00\u7535\u8111\u65F6\u624D\u8BED\u97F3\u64AD\u62A5\uFF08\u7A7A\u95F2\u8D85 2 \u5206\u949F\uFF09\uFF1B\u7528\u6237\u5728\u573A\u65F6\u81EA\u52A8\u964D\u7EA7\u4E3A\u684C\u9762\u901A\u77E5\uFF0C\u907F\u514D\u6253\u6270" },
        title: { type: "string", description: "\u684C\u9762\u901A\u77E5\u6807\u9898\uFF08\u9ED8\u8BA4 dsh \u901A\u77E5\uFF09" }
      },
      required: ["message"]
    },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: (args, value) => [{ type: "text", text: `\u5DF2\u64AD\u62A5\uFF08${value.mode}${value.engine ? ` \xB7 ${value.engine}` : ""}\uFF09` }]
    },
    execute: async (args, exec) => {
      const scene = args.scene ?? "task_complete";
      const custom = String(args.message ?? "").trim();
      const cfg = loadConfig();
      const text = custom || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {
        summary: String(args.summary ?? "").trim(),
        session: ""
      });
      const result = await notify(
        args.mode ?? "speak",
        args.title,
        text,
        {
          scene,
          emotion: args.emotion,
          emotionIntensity: args.emotionIntensity,
          role: args.role,
          voice: args.voice,
          rate: args.rate,
          volume: args.volume,
          onlyIfAway: args.onlyIfAway
        }
      );
      if (exec?.agent?.id) {
        const p = pendingCalls.get(exec.agent.id);
        if (p && !p.responded) {
          p.responded = true;
          if (p.timer) clearTimeout(p.timer);
          pendingCalls.delete(exec.agent.id);
          console.log(`[voice] \u6A21\u578B\u5DF2\u4E3B\u52A8\u64AD\u62A5\uFF0C\u53D6\u6D88\u515C\u5E95\u547C\u53EB\uFF08${exec.agent.id}\uFF09`);
        }
      }
      return { mode: result.mode, engine: result.engine ?? null, text: text.slice(0, 80) };
    },
    isConcurrencySafe: () => false,
    // 语音播报必须串行
    timeoutMs: 12e4
  });
  ctx.tools?.register?.({
    name: "notify_user",
    description: "\u901A\u8FC7\u684C\u9762\u901A\u77E5 / \u8BED\u97F3\u64AD\u62A5 / \u63D0\u793A\u97F3\u4E3B\u52A8\u8054\u7CFB\u7528\u6237\uFF08speak \u5DE5\u5177\u7684\u522B\u540D\uFF0C\u53C2\u6570\u517C\u5BB9\uFF09\u3002\u4EFB\u52A1\u5B8C\u6210\u3001\u51FA\u9519\u3001\u9700\u8981\u7528\u6237\u6CE8\u610F\u6216\u786E\u8BA4\u3001\u547C\u53EB\u7528\u6237\u56DE\u6765\u65F6\u4F7F\u7528\u3002",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "\u4F60\u60F3\u5BF9\u7528\u6237\u8BF4\u7684\u8BDD" },
        scene: { type: "string", enum: VALID_SCENES, description: "\u901A\u77E5\u573A\u666F" },
        mode: { type: "string", enum: ["speak", "toast", "sound", "both"], description: "\u901A\u77E5\u65B9\u5F0F\uFF0C\u9ED8\u8BA4 toast" },
        title: { type: "string", description: "\u901A\u77E5\u6807\u9898" }
      },
      required: ["message"]
    },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: (args, value) => [{ type: "text", text: `\u5DF2\u901A\u77E5\u7528\u6237\uFF08${value.mode}${value.engine ? ` \xB7 ${value.engine}` : ""}\uFF09` }]
    },
    execute: async (args, exec) => {
      const scene = args.scene ?? "task_complete";
      const custom = String(args.message ?? "").trim();
      const cfg = loadConfig();
      const text = custom || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {});
      const result = await notify(args.mode ?? "toast", args.title, text, { scene });
      if (exec?.agent?.id) {
        const p = pendingCalls.get(exec.agent.id);
        if (p && !p.responded) {
          p.responded = true;
          if (p.timer) clearTimeout(p.timer);
          pendingCalls.delete(exec.agent.id);
        }
      }
      return { mode: result.mode, engine: result.engine ?? null, text: text.slice(0, 80) };
    },
    isConcurrencySafe: () => false,
    timeoutMs: 12e4
  });
  ctx.tools?.register?.({
    name: "user_activity",
    description: "\u67E5\u8BE2\u7528\u6237\u5F53\u524D\u662F\u5426\u5728\u7535\u8111\u524D\uFF1A\u8FD4\u56DE\u7CFB\u7EDF\u952E\u76D8/\u9F20\u6807\u7A7A\u95F2\u79D2\u6570\uFF080 \u8868\u793A\u7528\u6237\u6B63\u5728\u64CD\u4F5C\uFF0C\u6570\u503C\u8D8A\u5927\u8868\u793A\u79BB\u5F00\u8D8A\u4E45\uFF09\u3002\u957F\u4EFB\u52A1\u5B8C\u6210\u6216\u4E0D\u786E\u5B9A\u7528\u6237\u662F\u5426\u5728\u7EBF\u65F6\u4F7F\u7528\uFF0C\u5224\u65AD\u662F\u5426\u9700\u8981\u4E3B\u52A8\u547C\u53EB\u7528\u6237\u3002",
    parameters: { type: "object", properties: {} },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: (args, value) => {
        const idle = value?.idle_seconds ?? 0;
        const desc = idle <= 30 ? "\u7528\u6237\u6B63\u5728\u7535\u8111\u524D" : idle <= 180 ? "\u7528\u6237\u53EF\u80FD\u77ED\u6682\u79BB\u5F00" : "\u7528\u6237\u4E0D\u5728\u7535\u8111\u524D";
        return [{ type: "text", text: `\u7CFB\u7EDF\u7A7A\u95F2 ${idle} \u79D2\uFF08${desc}\uFF09` }];
      }
    },
    execute: async () => ({ idle_seconds: await queryIdle() }),
    isConcurrencySafe: () => true
  });
  ctx.tools?.register?.({
    name: "stop_voice",
    description: "\u505C\u6B62\u5F53\u524D\u6B63\u5728\u64AD\u653E\u7684\u8BED\u97F3\u5E76\u6E05\u7A7A\u64AD\u62A5\u961F\u5217\u3002\u7528\u6237\u60F3\u6253\u65AD\u64AD\u62A5\u65F6\u4F7F\u7528\u3002",
    parameters: { type: "object", properties: {} },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: () => [{ type: "text", text: "\u5DF2\u505C\u6B62\u64AD\u62A5" }]
    },
    execute: async () => {
      if (voiceQueue) voiceQueue.stop();
      return { stopped: true };
    },
    isConcurrencySafe: () => true
  });
  ctx.tools?.register?.({
    name: "get_voices",
    description: "\u83B7\u53D6\u5F53\u524D TTS \u5F15\u64CE\u53EF\u7528\u7684\u97F3\u8272\u5217\u8868\uFF0C\u5E76\u8FD4\u56DE\u5B9E\u9645\u5F15\u64CE\uFF08volcano=\u706B\u5C71\u4E91\u7AEF / windows-sapi=\u79BB\u7EBF\uFF09\u3002\u7528\u4E8E\u9009\u62E9 speak \u7684 voice \u53C2\u6570\uFF0C\u4E5F\u7528\u4E8E\u5411\u7528\u6237\u786E\u8BA4\u5F53\u524D\u662F\u5426\u5728\u8DD1\u4E91\u7AEF\u8BED\u97F3\u3002",
    parameters: { type: "object", properties: {} },
    output: {
      schema: { type: "object", additionalProperties: true, properties: {} },
      render: (args, value) => [
        { type: "text", text: `\u5F15\u64CE\uFF1A${value.engine}
\u53EF\u7528\u97F3\u8272\uFF1A${(value?.voices ?? []).join(", ") || "\uFF08\u65E0\uFF09"}` }
      ]
    },
    execute: async () => {
      const q = await ensureEngine();
      const voices = await q.engine.getVoices();
      return { engine: engineNameOf(q.engine), voices };
    },
    isConcurrencySafe: () => true
  });
  ctx.commands.register({
    name: "voice",
    description: "\u8BED\u97F3\u64AD\u62A5 / \u901A\u77E5\u7528\u6237\u3002/voice <\u5185\u5BB9> [--speak|--sound|--toast|--both] [--scene=...] [--emotion=...] [--role=...]",
    input: { hint: "<\u5185\u5BB9> [--speak|--toast|--scene=...]" },
    handler: async (invocation) => {
      const { mode, text, scene, emotion, role } = parseFlags(invocation?.rawInput);
      const safeScene = scene && VALID_SCENES.includes(scene) ? scene : void 0;
      const cfg = loadConfig();
      const content = text || renderTemplate(cfg.templates?.[safeScene] ?? DEFAULT_TEMPLATES[safeScene] ?? DEFAULT_TEMPLATES.task_complete, {});
      try {
        const used = await notify(mode, "dsh \u8BED\u97F3", content, { scene: safeScene, emotion, role });
        return { kind: "success", text: `\u5DF2\u64AD\u62A5\uFF08${used.mode}${used.engine ? ` \xB7 ${used.engine}` : ""}\uFF09\uFF1A${content.slice(0, 60)}${content.length > 60 ? "\u2026" : ""}` };
      } catch (e) {
        return { kind: "error", text: `[voice] ${e.message}` };
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/voice",
    handler: (req, res) => sendHtml(res, pageHtml)
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/voice/api",
    handler: async (req, res) => {
      try {
        const body = await readBody(req).catch(() => ({}));
        const mode = String(body.mode ?? "toast");
        const scene = body.scene && VALID_SCENES.includes(body.scene) ? body.scene : void 0;
        const raw = String(body.text ?? "").trim();
        const cfg = loadConfig();
        const text = raw || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {});
        const used = await notify(mode, "dsh \u8BED\u97F3", text, {
          scene,
          emotion: body.emotion,
          role: body.role,
          // 试听按钮显式传当前填写值（未保存也能试听）；不传则回落 settings 保存值
          voice: body.voice,
          rate: body.rate,
          volume: body.volume
        });
        sendJson(res, 200, { ok: true, mode: used.mode, engine: used.engine ?? null, text: text.slice(0, 80) });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/voice/api/settings",
    handler: async (req, res) => {
      try {
        if (req.method === "GET") {
          const config = loadConfig();
          let activeEngine = null;
          try {
            const q = await ensureEngine();
            activeEngine = engineNameOf(q.engine);
          } catch (e) {
            activeEngine = `error: ${e.message}`;
          }
          sendJson(res, 200, { config, version: "0.2.4", engine: activeEngine });
          return;
        }
        if (req.method === "POST") {
          const body = await readBody(req).catch(() => ({}));
          if (_settingsScope2) {
            const patch = {};
            if (body.defaultMode !== void 0) patch.defaultMode = body.defaultMode;
            if (body.engine !== void 0) patch.engine = body.engine;
            if (body.callDelaySeconds !== void 0) patch.callDelaySeconds = body.callDelaySeconds;
            if (body.onTurnEnd !== void 0) patch.onTurnEnd = body.onTurnEnd;
            if (body.onTaskStart !== void 0) patch.onTaskStart = body.onTaskStart;
            if (body.onQuestion !== void 0) patch.onQuestion = body.onQuestion;
            if (body.autoCall !== void 0) patch.autoCall = body.autoCall;
            if (body.textClean !== void 0) patch.textClean = body.textClean;
            if (body.maxTextLength !== void 0) patch.maxTextLength = body.maxTextLength;
            if (body.volume !== void 0) patch.volume = body.volume;
            if (body.rate !== void 0) patch.rate = body.rate;
            if (body.cloud?.apiKey !== void 0) patch.cloud_apiKey = body.cloud.apiKey;
            if (body.cloud?.voice !== void 0) patch.cloud_voice = body.cloud.voice;
            if (body.cloud?.resourceId !== void 0) patch.cloud_resourceId = body.cloud.resourceId;
            if (body.cloud?.energyRate !== void 0) patch.cloud_energyRate = body.cloud.energyRate;
            if (body.cloud?.retries !== void 0) patch.cloud_retries = body.cloud.retries;
            if (body.cloud?.timeout !== void 0) patch.cloud_timeout = body.cloud.timeout;
            if (body.cloud?.pauseSentenceMs !== void 0) patch.cloud_pauseSentenceMs = body.cloud.pauseSentenceMs;
            if (body.cloud?.pauseCommaMs !== void 0) patch.cloud_pauseCommaMs = body.cloud.pauseCommaMs;
            if (body.mimo?.apiKey !== void 0) patch.mimo_apiKey = body.mimo.apiKey;
            if (body.mimo?.voice !== void 0) patch.mimo_voice = body.mimo.voice;
            if (body.templates && typeof body.templates === "object") patch.templates = body.templates;
            if (body.sceneSounds && typeof body.sceneSounds === "object") patch.sceneSounds = body.sceneSounds;
            try {
              await _settingsScope2.update(patch);
              resetConfigCache();
              await refreshEngine();
              sendJson(res, 200, { ok: true, config: loadConfig() });
              return;
            } catch (e) {
              console.error("[voice] settings scope \u4FDD\u5B58\u5931\u8D25\uFF0C\u56DE\u9000 config.json:", e.message);
            }
          }
          const { writeFileSync: writeFileSync4, mkdirSync } = await import("node:fs");
          const current = loadConfig();
          const next = { ...current, ...body };
          if (body.cloud) next.cloud = { ...current.cloud, ...body.cloud };
          if (body.edgeTTS) next.edgeTTS = { ...current.edgeTTS, ...body.edgeTTS };
          if (body.templates) next.templates = { ...current.templates, ...body.templates };
          if (body.sceneSounds) next.sceneSounds = { ...current.sceneSounds, ...body.sceneSounds };
          mkdirSync(join5(CONFIG_FILE, ".."), { recursive: true });
          writeFileSync4(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
          resetConfigCache();
          await refreshEngine();
          sendJson(res, 200, { ok: true, config: loadConfig() });
          return;
        }
        sendJson(res, 405, { error: "method not allowed" });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/voice/api/sound",
    handler: async (req, res) => {
      try {
        const body = await readBody(req).catch(() => ({}));
        const sound = String(body.sound ?? "melodious");
        const { playNotificationSound: playNotificationSound2 } = await Promise.resolve().then(() => (init_notification_sound(), notification_sound_exports));
        await playNotificationSound2(sound);
        sendJson(res, 200, { ok: true, sound });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/voice/api/voices",
    handler: async (req, res) => {
      try {
        const q = await ensureEngine();
        const voices = await q.engine.getVoices();
        sendJson(res, 200, { voices });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }
  });
  const welcomeCfg = loadConfig();
  if (welcomeCfg.startupWelcome !== false) {
    setTimeout(() => {
      const cfg = loadConfig();
      notify("speak", "\u6B22\u8FCE", cfg.startupWelcomeText || "\u6B22\u8FCE\u4F7F\u7528\u8BED\u97F3\u52A9\u624B\uFF0C\u6211\u5C06\u4E00\u76F4\u966A\u4F34\u60A8", {
        emotion: "happy"
      }).then((r) => {
        console.log(`[voice] \u542F\u52A8\u6B22\u8FCE\u8BED\u5DF2\u64AD\u62A5\uFF08\u5F15\u64CE ${r?.engine || "?"}\uFF09`);
      }).catch((e) => {
        console.error("[voice] \u542F\u52A8\u6B22\u8FCE\u8BED\u64AD\u62A5\u5931\u8D25:", e.message);
      });
    }, 5e3).unref?.();
  }
}
export {
  apply,
  inject,
  name
};
