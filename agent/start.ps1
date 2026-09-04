<#
.SYNOPSIS
    Monitoring Agent - стартер для Планировщика задач
.DESCRIPTION
    Загружает agent.env в переменные окружения процесса и запускает MonitoringAgent.exe
    без окна консоли. Используется как Action задачи планировщика.
#>

$ErrorActionPreference = "SilentlyContinue"
$dir = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition

# Загрузить agent.env
$envFile = Join-Path $dir "agent.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -and -not $_.StartsWith("#")) {
            $parts = $_ -split "=", 2
            if ($parts.Count -eq 2) {
                Set-Item -Path "Env:\$($parts[0].Trim())" -Value $parts[1].Trim()
            }
        }
    }
}

# Убрать флаг паузы (чтобы агент стартовал даже если GUI поставил на паузу)
$pause = Join-Path $dir ".agent_paused"
if (Test-Path $pause) { Remove-Item $pause -Force -ErrorAction SilentlyContinue }

$bin = Join-Path $dir "MonitoringAgent.exe"
if (Test-Path $bin) {
    Start-Process -FilePath $bin -WorkingDirectory $dir -WindowStyle Hidden
} else {
    # fallback: записать ошибку в лог
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [start.ps1] ERROR: MonitoringAgent.exe not found at $bin" |
        Out-File -FilePath (Join-Path $dir "agent_start_error.log") -Append -Encoding UTF8
}
