# Monitoring Agent Update Script (Windows)
$ErrorActionPreference = "Stop"
Write-Host "[*] === Обновление Monitoring Agent (Windows) ===" -ForegroundColor Cyan

$InstallDir = "$env:ProgramFiles\MonitoringAgent"
if (-not (Test-Path $InstallDir)) {
    $proc = Get-Process -Name "MonitoringAgent" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { $InstallDir = Split-Path $proc.Path }
}

$EnvFile = Join-Path $InstallDir "agent.env"
$BackendUrl = $env:BACKEND_URL
$IngestKey = $env:INGEST_API_KEY
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line.Split("=", 2)
            if ($parts.Length -eq 2) {
                if ($parts[0].Trim() -eq "BACKEND_URL" -and -not $BackendUrl) { $BackendUrl = $parts[1].Trim() }
                if ($parts[0].Trim() -eq "INGEST_API_KEY" -and -not $IngestKey) { $IngestKey = $parts[1].Trim() }
            }
        }
    }
}

if (-not $BackendUrl) {
    Write-Host "[x] Не удалось определить BACKEND_URL." -ForegroundColor Red
    Exit 1
}

$BackendUrl = $BackendUrl.TrimEnd("/")
$TargetVer = (Invoke-RestMethod -Uri "$BackendUrl/agent/VERSION" -TimeoutSec 10).Trim()
Write-Host "[*] Новая версия: $TargetVer" -ForegroundColor Green

$DownloadUrl = "$BackendUrl/agent/MonitoringAgent.exe"
$TmpFile = Join-Path $env:TEMP ("MonitoringAgent-new-" + [Guid]::NewGuid().ToString() + ".exe")
$Headers = @{}
if ($IngestKey) { $Headers["X-Ingest-Key"] = $IngestKey }
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -Headers $Headers -TimeoutSec 60

$ServiceName = "MonitoringAgent"
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
}

$DestExe = Join-Path $InstallDir "MonitoringAgent.exe"
$OldExe = Join-Path $InstallDir "MonitoringAgent.exe.old"
if (Test-Path $DestExe) {
    Remove-Item $OldExe -Force -ErrorAction SilentlyContinue
    Move-Item -Path $DestExe -Destination $OldExe -Force
}

Move-Item -Path $TmpFile -Destination $DestExe -Force
Set-Content -Path (Join-Path $InstallDir "VERSION") -Value $TargetVer -Force

if ($svc) {
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 2
    Write-Host "[+] Служба $ServiceName успешно обновлена и запущена!" -ForegroundColor Green
} else {
    Write-Host "[+] Бинарник обновлен до версии $TargetVer" -ForegroundColor Green
}
