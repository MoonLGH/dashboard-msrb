param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$startupDir = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $RepoRoot 'dashboard\scripts\startup-hidden.vbs'
$target = Join-Path $startupDir 'PerfectBot Dashboard Host.vbs'

$script = Join-Path $RepoRoot 'dashboard\scripts\start-dashboard-host.ps1'
if (-not (Test-Path $script)) {
    throw "Startup script not found: $script"
}

$escapedScript = $script.Replace('"', '""')
$escapedRoot = $RepoRoot.Replace('"', '""')
$content = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$escapedScript"" -RepoRoot ""$escapedRoot""", 0, False
"@

Set-Content -Path $launcher -Value $content -Encoding ASCII
Copy-Item -LiteralPath $launcher -Destination $target -Force

Write-Host "Installed per-user startup launcher:"
Write-Host $target
Write-Host "It will run hidden at Windows login."
