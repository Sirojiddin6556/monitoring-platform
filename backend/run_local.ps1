#!/usr/bin/env pwsh
# Run backend locally without Docker (PowerShell)
Set-StrictMode -Version Latest

# Ensure venv activation (adjust path if your venv is elsewhere)
if (Test-Path .\venv\Scripts\Activate.ps1) {
  & .\venv\Scripts\Activate.ps1
}

# Use local sqlite DB
$env:DATABASE_URL = "sqlite+aiosqlite:///./data/monitoring.db"
if (-not (Test-Path .\data)) { New-Item -ItemType Directory -Path .\data | Out-Null }

Write-Output "Installing local requirements (aiosqlite)..."
python -m pip install -r backend/requirements-local.txt

Write-Output "Starting backend on http://127.0.0.1:8000"
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
