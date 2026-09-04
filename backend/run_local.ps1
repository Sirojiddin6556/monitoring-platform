#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run backend locally without Docker (PowerShell)
.DESCRIPTION
    Activates venv, installs dependencies, and runs backend with uvicorn
    Supports reload mode via BACKEND_RELOAD environment variable
.EXAMPLE
    .\backend\run_local.ps1
    BACKEND_RELOAD=1 .\backend\run_local.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Resolve paths from script location
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")

function Write-Header {
  param([string]$Message)
  Write-Host ""
  Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "║ $($Message.PadRight(54)) ║" -ForegroundColor Cyan
  Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
}

function Write-Success {
  param([string]$Message)
  Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
  param([string]$Message)
  Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)
  Write-Host "ℹ $Message" -ForegroundColor Yellow
}

Push-Location $ProjectRoot
try {
  Write-Header "Backend Local Runner"

  # Check venv
  Write-Info "Checking virtual environment..."
  $VenvActivate = Join-Path $ProjectRoot 'venv\Scripts\Activate.ps1'
  if (-not (Test-Path $VenvActivate)) {
    Write-Error-Custom "venv not found at venv\Scripts\Activate.ps1"
    Write-Host "Create it with: python -m venv venv" -ForegroundColor Yellow
    exit 1
  }
  
  # Activate venv
  & $VenvActivate
  Write-Success "Virtual environment activated"

  # Set environment variables
  Write-Info "Setting environment variables..."
  $env:DATABASE_URL = "sqlite+aiosqlite:///./data/monitoring.db"
  $env:DEV_ALLOW_INSECURE_SECRET = "1"
  $env:ENVIRONMENT = "local"
  $env:SECRET_KEY ??= "dev-secret-key-change-me"
  $env:INITIAL_ADMIN_EMAIL ??= "admin@example.com"
  $env:INITIAL_ADMIN_PASSWORD ??= "admin123"
  $env:INGEST_API_KEY ??= "5aaOHADSpi7ER87pvC4U8oeQaYEhGhbMqe9QzbOi8WQ"
  
  Write-Success "Environment variables configured"

  # Create data directory
  if (-not (Test-Path 'data')) {
    New-Item -ItemType Directory -Path 'data' -Force | Out-Null
    Write-Success "Created data directory"
  }

  # Install dependencies
  Write-Info "Installing local requirements (aiosqlite)..."
  python -m pip install -r backend/requirements-local.txt 2>&1 | Select-Object -Last 3
  Write-Success "Dependencies installed"

  # Determine reload mode
  $reloadEnabled = ($env:BACKEND_RELOAD -eq "1" -or $env:BACKEND_RELOAD -eq "true")
  
  Write-Header "Starting Backend"
  Write-Host ""
  Write-Host "Backend API: http://127.0.0.1:8000" -ForegroundColor Cyan
  Write-Host "API Docs:    http://127.0.0.1:8000/docs" -ForegroundColor Cyan
  Write-Host "Login:       admin@example.com / admin123" -ForegroundColor Cyan
  Write-Host ""

  if ($reloadEnabled) {
    Write-Info "Reload mode: ON (watching backend/ directory)"
    python -m uvicorn backend.app.main:app `
      --reload `
      --reload-dir backend `
      --host 127.0.0.1 `
      --port 8000
  } else {
    Write-Info "Reload mode: OFF"
    Write-Info "Set BACKEND_RELOAD=1 to enable reload on changes"
    python -m uvicorn backend.app.main:app `
      --host 127.0.0.1 `
      --port 8000
  }
} catch {
  Write-Error-Custom $_.Exception.Message
  exit 1
} finally {
  Pop-Location
}
