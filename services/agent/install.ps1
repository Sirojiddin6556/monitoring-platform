<# 
.SYNOPSIS
    Monitoring Agent - установка на Windows-сервер
.DESCRIPTION
    Устанавливает агент мониторинга, который собирает метрики (CPU, RAM, Disk, Network и т.д.)
    через psutil и отправляет их на центральный бэкенд.
.EXAMPLE
    .\install.ps1 -BackendUrl "http://10.0.0.1:8000" -ServerId "win-server-1"
.EXAMPLE
    .\install.ps1 -BackendUrl "http://10.0.0.1:8000" -ServerId "win-server-1" -Interval 30
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$BackendUrl,
    
    [Parameter(Mandatory=$false)]
    [string]$ServerId,
    
    [int]$Interval = 15,
    
    [string]$InstallDir = "C:\monitoring-agent",
    
    [string]$ServiceName = "MonitoringAgent"
)

$ErrorActionPreference = "Stop"

function Write-Step  { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

# -- Запросить параметры если не переданы --
if (-not $BackendUrl) {
    $BackendUrl = Read-Host "Введите URL бэкенда (http://ip:8000)"
}
if (-not $ServerId) {
    $ServerId = Read-Host "Введите ID сервера"
}
if (-not $BackendUrl) { Write-Err "BackendUrl обязателен" }
if (-not $ServerId)   { Write-Err "ServerId обязателен" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Monitoring Agent - Установка" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Backend:   $BackendUrl"
Write-Host "  Server ID: $ServerId"
Write-Host "  Interval:  ${Interval}s"
Write-Host "  Каталог:   $InstallDir"
Write-Host ""

# -- Проверить Python --
Write-Step "Проверяю Python..."
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd -c "import sys; print(sys.version_info.major)" 2>$null
        if ($ver -eq "3") {
            $pythonCmd = $cmd
            break
        }
    } catch { }
}

if (-not $pythonCmd) {
    Write-Err "Python 3 не найден. Установите Python 3.8+ с https://python.org и добавьте в PATH"
}

$pyVer = & $pythonCmd --version 2>&1
Write-Step "Python: $pythonCmd ($pyVer)"

# -- Создать каталог --
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Write-Step "Каталог: $InstallDir"

# -- Создать venv --
Write-Step "Создаю виртуальное окружение..."
& $pythonCmd -m venv "$InstallDir\venv"
if ($LASTEXITCODE -ne 0) { Write-Err "Не удалось создать venv" }

$pipExe = Join-Path $InstallDir "venv\Scripts\pip.exe"
$pythonExe = Join-Path $InstallDir "venv\Scripts\python.exe"

# -- Установить зависимости --
Write-Step "Устанавливаю зависимости..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $pythonExe -m pip install --quiet --upgrade pip 2>&1 | Out-Null
& $pipExe install --quiet psutil httpx 2>&1 | Out-Null
& $pipExe install --quiet prometheus_client python-json-logger 2>&1 | Out-Null
$ErrorActionPreference = $prevEAP

# -- Записать агент --
Write-Step "Записываю agent.py..."

# Копируем полную версию агента (app.py из директории установщика)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceAgent = Join-Path $scriptDir "app.py"
if (Test-Path $sourceAgent) {
    Copy-Item $sourceAgent "$InstallDir\agent.py" -Force
    Write-Step "Скопирован полный агент из $sourceAgent"
} else {
    Write-Err "Файл app.py не найден рядом с install.ps1 ($scriptDir). Поместите app.py в ту же папку."
}

# Также копируем requirements.txt если есть
$sourceReqs = Join-Path $scriptDir "requirements.txt"
if (Test-Path $sourceReqs) {
    Copy-Item $sourceReqs "$InstallDir\requirements.txt" -Force
    $prevEAP2 = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $pipExe install --quiet -r "$InstallDir\requirements.txt" 2>&1 | Out-Null
    $ErrorActionPreference = $prevEAP2
    Write-Step "Зависимости из requirements.txt установлены"
}

# -- Создать конфигурационный .env --
$envContent = @"
BACKEND_URL=$BackendUrl
SERVER_ID=$ServerId
INTERVAL=$Interval
METRICS_PORT=8001
"@
Set-Content -Path "$InstallDir\.env" -Value $envContent -Encoding UTF8
Write-Step "Конфигурация записана в $InstallDir\.env"

# -- Создать скрипт запуска --
$startScript = @"
@echo off
cd /d "$InstallDir"
set /p dummy=<nul
for /f "tokens=1,* delims==" %%a in (.env) do set %%a=%%b
"$InstallDir\venv\Scripts\python.exe" "$InstallDir\agent.py"
pause
"@
Set-Content -Path "$InstallDir\start.bat" -Value $startScript -Encoding ASCII

# -- PowerShell скрипт запуска --
$psStart = @"
`$envFile = Join-Path '$InstallDir' '.env'
Get-Content `$envFile | ForEach-Object {
    if (`$_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable(`$matches[1], `$matches[2], 'Process')
    }
}
& '$InstallDir\venv\Scripts\python.exe' '$InstallDir\agent.py'
"@
Set-Content -Path "$InstallDir\start.ps1" -Value $psStart -Encoding UTF8

Write-Step "Скрипты запуска созданы"

# -- Регистрация как Windows Service (через NSSM или Task Scheduler) --
Write-Step "Создаю задачу в Планировщике задач..."

$action = New-ScheduledTaskAction `
    -Execute "$InstallDir\venv\Scripts\python.exe" `
    -Argument "$InstallDir\agent.py" `
    -WorkingDirectory $InstallDir

$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 999

# Переменные окружения через обёрточный скрипт
$wrapperAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$InstallDir\start.ps1`"" `
    -WorkingDirectory $InstallDir

try {
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask `
        -TaskName $ServiceName `
        -Action $wrapperAction `
        -Trigger $trigger `
        -Settings $settings `
        -Description "Monitoring Agent ($ServerId) - отправляет метрики на $BackendUrl" `
        -RunLevel Highest `
        -Force | Out-Null
    
    Write-Step "Задача '$ServiceName' создана в Планировщике"
    
    # Запустить сейчас
    Start-ScheduledTask -TaskName $ServiceName
    Write-Step "Агент запущен!"
    
} catch {
    Write-Warn "Не удалось создать задачу в Планировщике (нужны права администратора)"
    Write-Warn "Запустите вручную: $InstallDir\start.ps1"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Установка завершена!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Агент отправляет метрики на $BackendUrl каждые ${Interval} сек" -ForegroundColor Cyan
Write-Host ""
Write-Host "Полезные команды:" -ForegroundColor Yellow
Write-Host "  # Запуск вручную:"
Write-Host "  powershell -File `"$InstallDir\start.ps1`""
Write-Host ""
Write-Host "  # Проверить задачу:"
Write-Host "  Get-ScheduledTask -TaskName $ServiceName"
Write-Host ""
Write-Host "  # Остановить:"
Write-Host "  Stop-ScheduledTask -TaskName $ServiceName"
Write-Host ""
Write-Host "  # Удалить:"
Write-Host "  Unregister-ScheduledTask -TaskName $ServiceName"
Write-Host ""
Write-Host "  # Изменить конфиг:"
Write-Host "  notepad $InstallDir\.env"
