/**
 * 音频文件播放器（移植自 agent-voice-mcp-minus dist/tts/audio-player.js，仅 Windows）。
 * 用 PowerShell Media.SoundPlayer 播放 WAV 文件，支持外部 kill 进程停止播放。
 */
import { spawn } from 'node:child_process'

/**
 * 播放指定 WAV 文件（Windows: PowerShell SoundPlayer）。
 * @param {string} filePath - WAV 文件绝对路径
 * @param {(proc: ChildProcess) => void} onSpawn - 进程创建后回调，用于持有引用以便 kill
 */
export function playAudioFile(filePath, onSpawn) {
  return new Promise((resolve, reject) => {
    const psScript = `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`
    const proc = spawn('powershell', ['-NoProfile', '-c', psScript], {
      stdio: 'ignore',
      windowsHide: true,
    })
    if (onSpawn) onSpawn(proc)
    proc.on('close', (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`SoundPlayer exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}
