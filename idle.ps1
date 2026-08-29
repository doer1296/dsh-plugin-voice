# dsh-plugin-voice 用户活跃度查询：系统空闲秒数（GetLastInputInfo）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File idle.ps1
# 输出：{"idle_seconds": N}
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DshVoiceIdle {
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
}
'@

$info = New-Object DshVoiceIdle+LASTINPUTINFO
$info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
if ([DshVoiceIdle]::GetLastInputInfo([ref]$info)) {
    $idleMs = [Environment]::TickCount - $info.dwTime
    if ($idleMs -lt 0) { $idleMs = 0 }
    $idleSeconds = [Math]::Floor($idleMs / 1000)
} else {
    $idleSeconds = 0
}
Write-Output ('{"idle_seconds": ' + $idleSeconds + '}')
