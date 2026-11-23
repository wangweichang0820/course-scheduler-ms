# Grab the Qoder IDE window as a PNG, for the competition post's "how it was built with Qoder" evidence.
# Screen capture only: no clicks, no input, nothing is modified.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads .ps1 as ANSI unless a BOM is present,
# and the Write tool does not emit a BOM, so non-ASCII comments break the parser.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-ide-shot.ps1 -Name qoder-01-agent-process
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Process = 'Qoder*'
)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
'@

# Resolve the main window handle straight from the process; EnumWindows callbacks are a scope minefield.
$cands = Get-Process -Name $Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $cands) { Write-Error "No process matching '$Process' has a main window."; exit 1 }
$hwnd = ($cands | Sort-Object { $_.MainWindowTitle.Length } -Descending | Select-Object -First 1).MainWindowHandle

if ([Win32]::IsIconic($hwnd)) { Write-Error "Window is minimized - restore it first."; exit 1 }
$r = New-Object Win32+RECT
[void][Win32]::GetWindowRect($hwnd, [ref]$r)
$w = $r.R - $r.L
$h = $r.B - $r.T
if ($w -lt 600 -or $h -lt 400) { Write-Error "Unexpected window size ${w}x${h}"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size $w, $h))
$out = Join-Path (Split-Path -Parent $PSScriptRoot) "docs\screenshots\$Name.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

$kb = [math]::Round((Get-Item $out).Length / 1024)
Write-Output ("saved={0} {1}x{2} {3}KB" -f $Name, $w, $h, $kb)
