param(
    [string]$TaskName = 'PerfectBot Dashboard Host',
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $RepoRoot 'dashboard\scripts\start-dashboard-host.ps1'
if (-not (Test-Path $script)) {
    throw "Startup script not found: $script"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -RepoRoot `"$RepoRoot`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts PerfectBot local desk and dashboard host agent at Windows logon.' -Force | Out-Null

Write-Host "Installed startup task: $TaskName"
Write-Host "It will run at Windows logon."
