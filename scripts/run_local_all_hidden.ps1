#!/usr/bin/env pwsh
# Start backend and frontend locally in hidden windows

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RuntimeDir = Join-Path $ProjectRoot '.runtime'

if (-not (Test-Path $RuntimeDir)) {
  New-Item -ItemType Directory -Path $RuntimeDir | Out-Null
}

Write-Host ""
Write-Host "Starting Monitoring Platform..." -ForegroundColor Cyan
Write-Host ""

# Stop existing services on ports
Write-Host "Cleaning up existing services..." -ForegroundColor Yellow
Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

# Verify prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$pythonExe = Join-Path $ProjectRoot 'venv\Scripts\python.exe'
$nodeCmd = (Get-Command node -ErrorAction SilentlyContinue).Source
$nextCli = Join-Path $ProjectRoot 'frontend\node_modules\next\dist\bin\next'

if (-not (Test-Path $pythonExe)) {
  Write-Host "ERROR: venv not found at venv\Scripts\python.exe" -ForegroundColor Red
  exit 1
}

if (-not $nodeCmd) {
  Write-Host "ERROR: Node.js not found in PATH" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $nextCli)) {
  Write-Host "ERROR: Next.js not found at frontend\node_modules" -ForegroundColor Red
  exit 1
}

Write-Host "All checks passed" -ForegroundColor Green
Write-Host ""

# Setup environment
$env:DATABASE_URL = 'sqlite+aiosqlite:///./data/monitoring.db'
$env:DEV_ALLOW_INSECURE_SECRET = '1'
$env:ENVIRONMENT = 'local'
$env:SECRET_KEY = 'dev-secret-key-change-me'
$env:INITIAL_ADMIN_EMAIL = 'admin@example.com'
$env:INITIAL_ADMIN_PASSWORD = 'admin123'
$env:INGEST_API_KEY = '5aaOHADSpi7ER87pvC4U8oeQaYEhGhbMqe9QzbOi8WQ'

if (-not (Test-Path (Join-Path $ProjectRoot 'data'))) {
  New-Item -ItemType Directory -Path (Join-Path $ProjectRoot 'data') | Out-Null
}

# Start backend
Write-Host "Starting backend..." -ForegroundColor Yellow

$BackendPidFile = Join-Path $RuntimeDir 'backend.pid'
$BackendOutLog = Join-Path $RuntimeDir 'backend.out.log'
$BackendErrLog = Join-Path $RuntimeDir 'backend.err.log'

Remove-Item $BackendPidFile -Force -ErrorAction SilentlyContinue
Remove-Item $BackendOutLog -Force -ErrorAction SilentlyContinue
Remove-Item $BackendErrLog -Force -ErrorAction SilentlyContinue

$backendProc = Start-Process -FilePath $pythonExe -ArgumentList '-m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog -PassThru

if ($backendProc -and $backendProc.Id) {
  $backendProc.Id | Out-File -FilePath $BackendPidFile -NoNewline
  Write-Host ("Backend started (PID: " + $backendProc.Id + ")") -ForegroundColor Green
} else {
  Write-Host "ERROR: Failed to start backend" -ForegroundColor Red
  exit 1
}

# Start frontend
Write-Host "Starting frontend..." -ForegroundColor Yellow

$FrontendPidFile = Join-Path $RuntimeDir 'frontend.pid'
$FrontendOutLog = Join-Path $RuntimeDir 'frontend.out.log'
$FrontendErrLog = Join-Path $RuntimeDir 'frontend.err.log'

Remove-Item $FrontendPidFile -Force -ErrorAction SilentlyContinue
Remove-Item $FrontendOutLog -Force -ErrorAction SilentlyContinue
Remove-Item $FrontendErrLog -Force -ErrorAction SilentlyContinue

$frontendProc = Start-Process -FilePath $nodeCmd -ArgumentList ($nextCli + ' dev -H 0.0.0.0 -p 3000') -WorkingDirectory (Join-Path $ProjectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput $FrontendOutLog -RedirectStandardError $FrontendErrLog -PassThru

if ($frontendProc -and $frontendProc.Id) {
  $frontendProc.Id | Out-File -FilePath $FrontendPidFile -NoNewline
  Write-Host ("Frontend started (PID: " + $frontendProc.Id + ")") -ForegroundColor Green
} else {
  Write-Host "ERROR: Failed to start frontend" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Services started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend:    http://127.0.0.1:3000" -ForegroundColor Cyan
Write-Host "Backend API: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "API Docs:    http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Login: admin@example.com / admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "Logs: .runtime/backend.*.log and .runtime/frontend.*.log" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop: .\scripts\stop_local_all_hidden.ps1" -ForegroundColor Gray
Write-Host ""

# Monitor services
$bId = $backendProc.Id
$fId = $frontendProc.Id

while ($true) {
  Start-Sleep -Seconds 5
  
  $bProc = Get-Process -Id $bId -ErrorAction SilentlyContinue
  $fProc = Get-Process -Id $fId -ErrorAction SilentlyContinue
  
  if (-not $bProc -or -not $fProc) {
    if (-not $bProc) { Write-Host "Backend stopped" -ForegroundColor Red }
    if (-not $fProc) { Write-Host "Frontend stopped" -ForegroundColor Red }
    break
  }
}