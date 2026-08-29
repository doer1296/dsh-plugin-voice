/**
 * 场景化提示音（移植自 agent-voice-mcp-minus dist/tts/notification-sound.js，仅保留 Windows）。
 *
 * 播报前先响一声提示音，提前唤醒蓝牙音频链路；与蓝牙前导静音（leadingSilence）配套。
 *
 * 支持的 sound 值：
 *   - false / 'none'           → 不响
 *   - 'beep:info|success|error|warning|milestone|single' → Console.Beep 蜂鸣模式
 *   - 'melodious'|'bright'|'ding_ding'|'gift'|'light'|'short'|'sudden'|'sudden_2'|'tactful' → 内置 WAV
 *   - 绝对路径 → 自定义 WAV
 *   - 其他 / 找不到 → 回退 \x07 终端铃声
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 提示音音量增益 +100%（仅 WAV 提示音生效；语音音量由引擎参数控制，互不影响）
const SOUND_GAIN = 2.0

// 内置 WAV 预设（随包分发在 assets/）
const BUILTIN_PRESETS = [
  'melodious', 'bright', 'ding_ding', 'gift', 'light',
  'short', 'sudden', 'sudden_2', 'tactful',
]

// 场景蜂鸣模式（移植自 B）：
// 语法："频率Hz,时长ms" 为一声音，纯数字为静默毫秒，分号串联。
const BEEP_PATTERNS = {
  info: '800,120;80;1200,120;150',
  success: '600,100;80;800,100;80;1200,120;150',
  error: '1000,150;80;600,150;80;400,150;200',
  warning: '800,200;100;500,200;150',
  milestone: '900,80;60;900,80;60;1200,120;150',
  single: '880,150',
}

// 解析 assets/ 目录：编译后 lib/index.js → 同级 assets/
// （build.mjs 把 assets 随包分发，路径相对 lib/ 推导）
function getAssetsDir() {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  // lib/ 或 lib/tts/ 都可能在，统一向上找 assets
  if (existsSync(join(moduleDir, '..', 'assets'))) return join(moduleDir, '..', 'assets')
  if (existsSync(join(moduleDir, '..', '..', 'assets'))) return join(moduleDir, '..', '..', 'assets')
  return join(moduleDir, '..', 'assets')
}

function beepScript(pattern) {
  return pattern
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (p.includes(',')) {
        const [freq, ms] = p.split(',')
        return `[System.Console]::Beep(${freq}, ${ms})`
      }
      const ms = Number.parseInt(p, 10)
      return Number.isNaN(ms) ? '' : `Start-Sleep -Milliseconds ${ms}`
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * 修复 + 放大 WAV，写临时文件返回路径。
 *
 * 两件事：
 * 1. 修复 RIFF size 字段：部分内置 WAV 该字段比实际小 4 字节，Windows
 *    SoundPlayer 严格校验会直接拒播（报 "wave header is corrupt"）→ 静音。
 *    按实际文件大小重写，保证 SoundPlayer 能播。
 * 2. 16-bit PCM 采样放大 gain 倍：自适应增益，若峰值 ×gain 超 32767 自动降
 *    到不削波的最大值。
 *
 * 始终返回修复后的副本（即使 gain<=1 也修复 RIFF 头），调用方负责在播放
 * 完成后删除返回的临时文件（若与源路径不同）。
 */
function amplifyWav(srcPath, gain) {
  let buf
  try { buf = readFileSync(srcPath) } catch { return srcPath }
  try {
    // 基本头校验
    if (buf.length < 44) return srcPath
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return srcPath

    // 1. 修复 RIFF size 字段（关键：部分文件少 4 字节，SoundPlayer 拒播）
    const actualSize = buf.length - 8
    buf.writeUInt32LE(actualSize, 4)

    // 2. 标准 44 字节头：fmt(1=PCM)/channels=1/bits=16，data 从 44 开始
    const fmt = buf.readUInt16LE(20)
    const channels = buf.readUInt16LE(22)
    const bits = buf.readUInt16LE(34)
    const dataOffset = 44
    const dataSize = buf.readUInt32LE(40)
    if (fmt === 1 && channels === 1 && bits === 16 &&
        dataOffset + dataSize <= buf.length && typeof gain === 'number' && gain > 1.001) {
      // 找峰值 → 自适应增益
      let peak = 0
      for (let i = dataOffset; i < dataOffset + dataSize; i += 2) {
        const s = buf.readInt16LE(i)
        const a = s < 0 ? -s : s
        if (a > peak) peak = a
      }
      if (peak > 0) {
        const effectiveGain = Math.min(gain, 32767 / peak)
        if (effectiveGain > 1.001) {
          // 逐采样放大（int16 饱和处理）
          for (let i = dataOffset; i < dataOffset + dataSize; i += 2) {
            const s = buf.readInt16LE(i)
            let v = Math.round(s * effectiveGain)
            if (v > 32767) v = 32767
            if (v < -32768) v = -32768
            buf.writeInt16LE(v, i)
          }
        }
      }
    }
  } catch { return srcPath }

  // 写临时修复/放大文件
  const tmp = join(tmpdir(), `dsh-voice-amp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`)
  try {
    writeFileSync(tmp, buf)
    return tmp
  } catch { return srcPath }
}

export async function playNotificationSound(sound) {
  if (sound === false || sound === 'none') return

  // 场景蜂鸣：beep:info / beep:success / beep:error / beep:warning / beep:milestone / beep:single
  if (typeof sound === 'string' && sound.startsWith('beep:')) {
    const pattern = BEEP_PATTERNS[sound.slice(5)]
    if (!pattern) {
      process.stderr.write('\x07')
      return
    }
    await playFile('powershell', ['-NoProfile', '-c', beepScript(pattern)])
    return
  }

  let soundPath = null
  let soundName = sound
  if (!soundName) soundName = 'melodious'

  // 1. 内置预设 WAV
  if (BUILTIN_PRESETS.includes(soundName)) {
    const candidate = join(getAssetsDir(), `${soundName}.wav`)
    if (existsSync(candidate)) soundPath = candidate
  }
  // 2. 自定义文件绝对路径
  if (!soundPath && existsSync(soundName)) soundPath = soundName
  // 3. 找不到 → 回退终端铃声
  if (soundName === 'beep' || !soundPath) {
    process.stderr.write('\x07')
    return
  }

  // 播放 WAV（Windows: PowerShell Media.SoundPlayer；先按 SOUND_GAIN 放大音量）
  const playPath = amplifyWav(soundPath, SOUND_GAIN)
  try {
    await playFile('powershell', [
      '-NoProfile', '-c',
      `(New-Object Media.SoundPlayer '${playPath}').Play(); Start-Sleep -Seconds 3`,
    ])
  } finally {
    if (playPath !== soundPath) {
      try { unlinkSync(playPath) } catch {}
    }
  }
}

function playFile(command, args) {
  return new Promise((resolve) => {
    let proc
    try {
      proc = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    } catch {
      return resolve()
    }
    const done = () => {
      try { proc.kill() } catch {}
      resolve()
    }
    proc.on('close', done)
    proc.on('error', () => resolve())
    setTimeout(done, 3000) // 不超过 3s
  })
}
