#!/usr/bin/env pwsh
# Stop backend and frontend services

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RuntimeDir = Join-Path $ProjectRoot '.runtime'
$BackendPidFile = Join-Path $RuntimeDir 'backend.pid'
$FrontendPidFile = Join-Path $RuntimeDir 'frontend.pid'

Write-Host ""
Write-Host "Stopping Monitoring Platform Services" -ForegroundColor Cyan
Write-Host ""

# Stop backend
if (Test-Path $BackendPidFile) {
  $pidValue = Get-Content $BackendPidFile -ErrorAction SilentlyContinue
  if ($pidValue) {
    Write-Host "Stopping backend (PID: $pidValue)..." -ForegroundColor Yellow
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Write-Host "Backend stopped" -ForegroundColor Green
  }
  Remove-Item $BackendPidFile -Force -ErrorAction SilentlyContinue
}

# Stop frontend
if (Test-Path $FrontendPidFile) {
  $pidValue = Get-Content $FrontendPidFile -ErrorAction SilentlyContinue
  if ($pidValue) {
    Write-Host "Stopping frontend (PID: $pidValue)..." -ForegroundColor Yellow
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Write-Host "Frontend stopped" -ForegroundColor Green
  }
  Remove-Item $FrontendPidFile -Force -ErrorAction SilentlyContinue
}

# Kill listeners on ports
Write-Host "Cleaning up port listeners..." -ForegroundColor Yellow
Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "All services stopped" -ForegroundColor Green
Write-Host ""