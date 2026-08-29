/**
 * Windows SAPI 引擎 —— 火山引擎失败时的固定兜底（始终启用，不可关闭）。
 *
 * 用 PowerShell System.Speech.Synthesis.SpeechSynthesizer 离线合成，零网络依赖，
 * 音质机械感强（不如云端），用于火山失败（断网 / 额度 / Key 失效）时的保底。
 *
 * 健壮性（第三方安装反馈修复）：
 *   - 本机 SAPI 无中文语音时，中文文本会「静默跳过」→ speak 前置中文能力检测，
 *     明确抛错让上层提示用户，不假装播报成功
 *   - 火山 voice ID 绝不传给 SAPI：SelectVoice 只匹配本机 SAPI 语音，无匹配则不选
 *     （用系统默认），避免 SelectVoice 抛异常
 *   - PowerShell 加 $ErrorActionPreference='Stop'：异常真正抛出，而不是 Continue 静默吞掉
 *   - spawn 捕获 stderr：失败时带错误详情，不丢日志
 */
import { spawn } from 'node:child_process'

function rateToSAPI(rate) {
  const normalized = (rate - 200) / 100
  return Math.round(Math.max(-10, Math.min(10, normalized * 10)))
}

function volumeToSAPI(volume) {
  return Math.round(Math.max(0, Math.min(1, volume)) * 100)
}

/** 文本是否含 CJK（中文/日文/韩文）字符。 */
function hasCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(String(text ?? ''))
}

/** 本机 SAPI 语音缓存：{ name, culture, enabled }（避免每次 speak 都跑 PowerShell）。 */
let cachedSapiVoices = null

async function getInstalledVoices() {
  if (cachedSapiVoices) return cachedSapiVoices
  const psScript = `
    $ErrorActionPreference = 'Stop';
    Add-Type -AssemblyName System.Speech;
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $s.GetInstalledVoices() | ForEach-Object { "{0}|{1}|{2}" -f $_.VoiceInfo.Name, $_.VoiceInfo.Culture.Name, $_.Enabled }
  `
  return new Promise((resolve) => {
    const proc = spawn('powershell', ['-NoProfile', '-Command', psScript], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[voice] SAPI 枚举语音失败: ${stderr.trim() || code}`)
        resolve([])
        return
      }
      cachedSapiVoices = stdout.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, culture, enabled] = l.split('|')
        return { name: name ?? '', culture: culture ?? '', enabled: enabled === 'True' }
      })
      resolve(cachedSapiVoices)
    })
    proc.on('error', () => resolve([]))
  })
}

/**
 * 判断本机 SAPI 是否有中文语音。
 * 用 Culture 区域（zh-*）判断最可靠——Windows 中文语音名（如 "Microsoft Huihui Desktop"）
 * 本身不含 "zh"/"chinese" 字样，正则匹配语音名会误判。
 */
export async function hasChineseSapiVoice() {
  const voices = await getInstalledVoices()
  if (voices.length === 0) return false
  return voices.some((v) => {
    const c = (v.culture || '').toLowerCase()
    const n = (v.name || '').toLowerCase()
    // Culture 是 zh-*（最可靠）；语音名含 zh/chinese/中文/汉语/普通话/Huihui 兜底
    return c.startsWith('zh') || /zh|chinese|中文|汉语|普通话|huihui/i.test(n)
  })
}

/** 从本机语音里按名字选一个；无匹配返回 null（调用方用系统默认）。 */
async function matchVoice(name) {
  if (!name) return null
  const voices = await getInstalledVoices()
  const exact = voices.find((v) => v.name.toLowerCase() === String(name).toLowerCase())
  if (exact) return exact.name
  return null
}

/** 找本机第一个可用中文语音（Culture zh-*，优先启用的）。 */
async function findChineseVoice() {
  const voices = await getInstalledVoices()
  const zh = voices.filter((v) => (v.culture || '').toLowerCase().startsWith('zh'))
  if (zh.length === 0) return null
  const enabled = zh.find((v) => v.enabled) || zh[0]
  return enabled
}

export class WindowsSAPIEngine {
  currentProcess = null
  type = 'windows-sapi'
  get engineName() { return 'windows-sapi' }

  async speak(text, options = {}, onBeforePlay) {
    await this.stop()
    if (onBeforePlay) await onBeforePlay()

    const speechText = String(text ?? '')

    // 前置中文能力检测：文本含中文但本机 SAPI 无中文语音 → 明确报错（不假装播报成功）
    if (hasCJK(speechText)) {
      const hasZh = await hasChineseSapiVoice()
      if (!hasZh) {
        throw new Error('本机 SAPI 未安装中文语音（如 Huihui/中文语音包），无法朗读中文。请安装中文语音包或配置火山引擎 Key 使用云端 TTS。')
      }
    }

    const escapedText = speechText
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
    const rate = rateToSAPI(options.rate ?? 200)
    const volume = volumeToSAPI(options.volume ?? 1.0)

    // 选 SAPI 语音：
    //   1) 显式指定且本机存在 → 用它
    //   2) 文本含中文 → 自动选本机第一个中文语音（Culture zh-* / 名字含中文标记），
    //      避免系统默认选中英文语音导致中文被跳过
    //   3) 否则用系统默认
    let selectedVoice = await matchVoice(options.voice)
    if (!selectedVoice && hasCJK(speechText)) {
      const zhVoice = await findChineseVoice()
      if (zhVoice) selectedVoice = zhVoice.name
    }

    let psScript = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;`
    if (selectedVoice) {
      psScript += ` $s.SelectVoice('${selectedVoice.replace(/'/g, "''")}');`
    }
    psScript += ` $s.Rate = ${rate}; $s.Volume = ${volume}; $s.Speak('${escapedText}');`

    return new Promise((resolve, reject) => {
      this.currentProcess = spawn('powershell', ['-NoProfile', '-Command', psScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let stderr = ''
      this.currentProcess.stderr.on('data', (d) => { stderr += d.toString() })
      this.currentProcess.on('close', (code) => {
        this.currentProcess = null
        if (code === 0 || code === null) resolve()
        else reject(new Error(`PowerShell SAPI 播报失败（code ${code}）: ${stderr.trim() || '未知错误'}`))
      })
      this.currentProcess.on('error', (err) => {
        this.currentProcess = null
        reject(err)
      })
    })
  }

  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
  }

  async getVoices() {
    return getInstalledVoices()
  }
}
