$ErrorActionPreference = 'Stop'

$startupDir = [Environment]::GetFolderPath('Startup')
$target = Join-Path $startupDir 'PerfectBot Dashboard Host.vbs'

if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Force
    Write-Host "Removed per-user startup launcher:"
    Write-Host $target
} else {
    Write-Host "Per-user startup launcher was not installed."
}
