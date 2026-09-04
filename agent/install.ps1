<#
.SYNOPSIS
    Monitoring Agent - Windows installer
.EXAMPLE
    .\install.ps1 -BackendUrl "http://10.0.0.1:8000" -ServerId "win-server-1"
.EXAMPLE
    .\install.ps1 -BackendUrl "http://10.0.0.1:8000" -ServerId "win-server-1" -Interval 30 -AgentKey "secret"
#>

param(
    [Parameter(Mandatory=$false)] [string]$BackendUrl,
    [Parameter(Mandatory=$false)] [string]$ServerId,
    [int]$Interval        = 15,
    [string]$IngestApiKey = "",
    [string]$AgentKey     = "",
    [string]$InstallDir   = "C:\monitoring-agent",
    [string]$ServiceName  = "MonitoringAgent"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding          = [System.Text.Encoding]::UTF8

function Write-Step { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

if (-not $BackendUrl) { $BackendUrl = Read-Host "Enter backend URL (http://ip:8000)" }
if (-not $ServerId)   { $ServerId   = Read-Host "Enter server ID" }
if (-not $BackendUrl) { Write-Err "BackendUrl is required" }
if (-not $ServerId)   { Write-Err "ServerId is required" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Monitoring Agent - Install (Go)"       -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Backend:   $BackendUrl"
Write-Host "  Server ID: $ServerId"
Write-Host "  Interval:  ${Interval}s"
Write-Host "  Dir:       $InstallDir"
Write-Host ""

# -- Find binary next to script (or download from backend) --
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceBin = Join-Path $scriptDir "MonitoringAgent.exe"
if (-not (Test-Path $sourceBin)) {
    Write-Warn "MonitoringAgent.exe not found locally - downloading from $BackendUrl ..."
    try {
        Invoke-WebRequest "$BackendUrl/api/agent/download/MonitoringAgent.exe" -OutFile $sourceBin -UseBasicParsing
        Write-Step "MonitoringAgent.exe downloaded"
    } catch {
        Write-Err "Failed to download MonitoringAgent.exe: $_"
    }
}

# -- Create install directory --
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Write-Step "Directory: $InstallDir"

# -- Stop old agent if running --
Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 200

# Force-kill any lingering agent processes to release file lock
$lingerProcs = Get-Process -Name "MonitoringAgent" -ErrorAction SilentlyContinue
if ($lingerProcs) {
    Write-Warn "Lingering MonitoringAgent processes found. Terminating to release file locks..."
    Stop-Process -Name "MonitoringAgent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# -- Copy binary and VERSION --
$resolvedSource = Resolve-Path $sourceBin -ErrorAction SilentlyContinue
$resolvedTarget = Resolve-Path "$InstallDir\MonitoringAgent.exe" -ErrorAction SilentlyContinue
if ($resolvedSource -and $resolvedTarget -and ($resolvedSource.Path -eq $resolvedTarget.Path)) {
    # Skip copying if it's already in the target directory
} else {
    Copy-Item $sourceBin "$InstallDir\MonitoringAgent.exe" -Force
}
Write-Step "Binary copied: MonitoringAgent.exe"

$srcVersion = Join-Path $scriptDir "VERSION"
if (Test-Path $srcVersion) {
    Copy-Item $srcVersion "$InstallDir\VERSION" -Force
}

# -- Write .env config --
$effectiveKey = if ($AgentKey) { $AgentKey } else { $IngestApiKey }
$envContent = "BACKEND_URL=$BackendUrl`nSERVER_ID=$ServerId`nINTERVAL=$Interval`nINGEST_API_KEY=$effectiveKey`nAGENT_KEY=$effectiveKey"
Set-Content -Path "$InstallDir\agent.env" -Value $envContent -Encoding UTF8
Write-Step "Config written: agent.env"

# -- Write start.ps1 (agent reads agent.env itself via loadEnvFile) --
$startScript = @'
$ErrorActionPreference = "SilentlyContinue"
$dir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$pause = Join-Path $dir ".agent_paused"
if (Test-Path $pause) { Remove-Item $pause -Force -ErrorAction SilentlyContinue }
$bin = Join-Path $dir "MonitoringAgent.exe"
if (Test-Path $bin) {
    Start-Process -FilePath $bin -WorkingDirectory $dir -WindowStyle Hidden
}
'@
Set-Content -Path "$InstallDir\start.ps1" -Value $startScript -Encoding UTF8
Write-Step "Start script written: start.ps1"

# -- Write uninstall.ps1 --
$sn = $ServiceName
$id = $InstallDir
$uninstallScript = @"
Stop-ScheduledTask -TaskName '$sn' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName '$sn' -Confirm:`$false -ErrorAction SilentlyContinue
Get-Process -Name 'MonitoringAgent' -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host '[+] Done. Directory $id was NOT deleted - remove manually if needed.' -ForegroundColor Green
"@
Set-Content -Path "$InstallDir\uninstall.ps1" -Value $uninstallScript -Encoding UTF8
Write-Step "Uninstall script written: uninstall.ps1"

# -- Register Scheduled Task --
Write-Step "Registering scheduled task..."

$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -RestartCount 5

$taskAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File `"$InstallDir\start.ps1`"" `
    -WorkingDirectory $InstallDir

try {
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask `
        -TaskName    $ServiceName `
        -Action      $taskAction `
        -Trigger     $trigger `
        -Settings    $settings `
        -Description "Monitoring Agent ($ServerId) -> $BackendUrl" `
        -RunLevel    Limited `
        -Force | Out-Null

    Write-Step "Task '$ServiceName' registered"
    Start-ScheduledTask -TaskName $ServiceName
    Write-Step "Agent started!"
} catch {
    Write-Warn "Failed to register scheduled task: $_"
    Write-Warn "Run manually: powershell -File `"$InstallDir\start.ps1`""
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Installation complete!"                 -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Agent sends metrics to $BackendUrl every ${Interval}s" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName $ServiceName"
Write-Host "  Stop-ScheduledTask -TaskName $ServiceName"
Write-Host "  Start-ScheduledTask -TaskName $ServiceName"
Write-Host "  notepad $InstallDir\agent.env"
Write-Host "  powershell -File `"$InstallDir\uninstall.ps1`""
Write-Host ""
