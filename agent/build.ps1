<#
.SYNOPSIS
    Sobiraet MonitoringAgent dlya Windows i Linux + GUI.
.EXAMPLE
    .\build.ps1              # tolko Windows EXE + GUI
    .\build.ps1 -All         # Windows + Linux amd64 + Linux arm64 + GUI
#>

param(
    [switch]$All,
    [switch]$Linux,
    [switch]$LinuxArm64
)

$ErrorActionPreference = "Stop"

# PS 5.1 ne podderzhivaet ?. — ispolzuem if/else
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCmd) {
    Write-Error "go ne najden v PATH. Ustanovite Go s https://go.dev/dl/"
    exit 1
}
$goExe = $goCmd.Source

$ldflags = "-s -w"
$pkg = "."

function Build($goos, $goarch, $out) {
    Write-Host "[build] $goos/$goarch -> $out" -ForegroundColor Cyan
    $env:GOOS   = $goos
    $env:GOARCH = $goarch
    & $goExe build -ldflags $ldflags -o $out $pkg
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $out" }
    $size = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host "       OK - $size MB" -ForegroundColor Green
}

Push-Location $PSScriptRoot

try {
    Build "windows" "amd64" "MonitoringAgent.exe"

    if ($All -or $Linux) {
        Build "linux" "amd64" "monitoring-agent-linux-amd64"
    }
    if ($All -or $LinuxArm64) {
        Build "linux" "arm64" "monitoring-agent-linux-arm64"
    }
} finally {
    Remove-Item Env:\GOOS   -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    Pop-Location
}

# GUI (C# WPF)
$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnetCmd) {
    $dotnetExe = $dotnetCmd.Source
    Write-Host "[build] GUI (C# WPF) -> gui-dist\MonitoringAgentGUI.exe" -ForegroundColor Cyan
    Push-Location "$PSScriptRoot\gui"
    try {
        & $dotnetExe publish -c Release -r win-x64 --self-contained false `
            -p:PublishSingleFile=true -o "..\gui-dist" --nologo -v quiet
        if ($LASTEXITCODE -ne 0) { throw "GUI build failed" }
        $guiExe = Get-Item "..\gui-dist\MonitoringAgentGUI.exe" -ErrorAction SilentlyContinue
        if ($guiExe) {
            $size = [math]::Round($guiExe.Length / 1KB, 0)
            Write-Host "       OK - $size KB" -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[skip] dotnet not found - GUI not built" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
