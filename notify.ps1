# dsh-plugin-voice 通知后端（仅 toast + sound，语音由 Node 端云端 TTS 处理）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File notify.ps1
# 从环境变量 DSH_VOICE_PAYLOAD 读取 base64(UTF-8 JSON)：
#   {"mode":"toast|sound|both","title":"...","message":"..."}
#   toast = 桌面通知（NotifyIcon 气泡）  sound = 提示音  both = 提示音 + 桌面通知
# （语音播报 speak 不在此处理——由 Node 端云端 TTS 引擎 Volcano/Edge 合成并播放）
# （用环境变量而非命令行参数：避免 bash/node 调用时中文编码与转义问题）
param()

$ErrorActionPreference = 'Stop'

$payloadB64 = $env:DSH_VOICE_PAYLOAD
if (-not $payloadB64) { Write-Error '缺少 DSH_VOICE_PAYLOAD 环境变量'; exit 1 }

$json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payloadB64))
$cfg = $json | ConvertFrom-Json
$mode = [string]$cfg.mode
$title = [string]$cfg.title
if (-not $title) { $title = 'dsh 通知' }
$message = [string]$cfg.message
if (-not $message) { Write-Error 'message 为空'; exit 1 }

# ── 提示音（自定义音效优先：~/.dsh/voice/sounds/<effect>.wav，缺省回退系统提示音）──
if ($mode -in @('sound', 'both')) {
    $effect = $env:DSH_VOICE_SOUND_EFFECT
    if ($effect) {
        $soundPath = Join-Path $env:USERPROFILE ('.dsh\voice\sounds\' + $effect + '.wav')
        if (Test-Path $soundPath) {
            try {
                $player = New-Object System.Media.SoundPlayer($soundPath)
                $player.PlaySync()
            } catch { [System.Media.SystemSounds]::Exclamation.Play() | Out-Null }
        } else {
            [System.Media.SystemSounds]::Exclamation.Play() | Out-Null
        }
    } else {
        try {
            [System.Media.SystemSounds]::Exclamation.Play() | Out-Null
            Start-Sleep -Milliseconds 300
        } catch { Write-Warning "提示音失败: $_" }
    }
}

# ── 桌面通知（NotifyIcon 气泡，无需额外模块）──
if ($mode -in @('toast', 'both')) {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.BalloonTipTitle = $title
        $n.BalloonTipText = $message
        $n.Visible = $true
        $n.ShowBalloonTip(8000)
        Start-Sleep -Seconds 3   # 保活：进程退出气泡会消失，等 3 秒让用户看到
        $n.Dispose()
    } catch { Write-Warning "桌面通知失败: $_" }
}

Write-Output "voice-notify: $mode ok"
