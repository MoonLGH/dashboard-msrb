param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$logDir = Join-Path $RepoRoot '.desk\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$deskLog = Join-Path $logDir 'desk-startup.log'
$agentLog = Join-Path $logDir 'dashboard-agent-startup.log'
$dashboardRoot = Join-Path $RepoRoot 'dashboard'

function Start-LoggedNode {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$ArgumentList,
        [string]$LogPath
    )

    $command = "Set-Location -LiteralPath '$WorkingDirectory'; $ArgumentList *>> '$LogPath'"
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        $command
    ) -WindowStyle Hidden

    Add-Content -Path $LogPath -Value "[$(Get-Date -Format o)] started $Name"
}

Start-LoggedNode -Name 'PerfectBot Desk' -WorkingDirectory $RepoRoot -ArgumentList 'npm run desk' -LogPath $deskLog
Start-Sleep -Seconds 4
Start-LoggedNode -Name 'PerfectBot Dashboard Agent' -WorkingDirectory $dashboardRoot -ArgumentList 'npm run agent' -LogPath $agentLog
