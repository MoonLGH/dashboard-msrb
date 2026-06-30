param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$logDir = Join-Path $RepoRoot '.desk\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$deskLog = Join-Path $logDir 'desk-startup.log'
$agentLog = Join-Path $logDir 'dashboard-agent-startup.log'
$dashboardRoot = Join-Path $RepoRoot 'dashboard'

function Test-TcpPort {
    param([int]$Port)
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $connected = $result.AsyncWaitHandle.WaitOne(500)
        if ($connected) {
            $client.EndConnect($result)
        }
        $client.Close()
        return $connected
    } catch {
        return $false
    }
}

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

if (Test-TcpPort -Port 4784) {
    Add-Content -Path $deskLog -Value "[$(Get-Date -Format o)] PerfectBot Desk already appears to be listening on port 4784"
} else {
    Start-LoggedNode -Name 'PerfectBot Desk' -WorkingDirectory $RepoRoot -ArgumentList 'npm run desk' -LogPath $deskLog
}

Start-Sleep -Seconds 4
Start-LoggedNode -Name 'PerfectBot Dashboard Agent' -WorkingDirectory $dashboardRoot -ArgumentList 'npm run agent' -LogPath $agentLog
