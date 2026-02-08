# R Portable 环境准备脚本
# 用于下载R并安装REddyProc包

param(
    [string]$RVersion = "4.4.0",
    [string]$OutputDir = "..\R-Portable"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "R Portable 环境准备脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 创建输出目录
$OutputDir = Resolve-Path $OutputDir -ErrorAction SilentlyContinue
if (-not $OutputDir) {
    $OutputDir = Join-Path $PSScriptRoot "..\R-Portable"
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $OutputDir = Resolve-Path $OutputDir
}

Write-Host "`n[1/4] 检查R Portable目录..." -ForegroundColor Yellow
if (Test-Path (Join-Path $OutputDir "bin")) {
    Write-Host "  R Portable 已存在: $OutputDir" -ForegroundColor Green
} else {
    Write-Host "  R Portable 目录为空，请手动下载R并解压到: $OutputDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "  下载地址:" -ForegroundColor White
    Write-Host "  - R Portable: https://sourceforge.net/projects/rportable/" -ForegroundColor Cyan
    Write-Host "  - R 官方: https://cran.r-project.org/bin/windows/base/R-$RVersion-win.exe" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  安装后将R目录复制到: $OutputDir" -ForegroundColor White
    exit 1
}

# 查找Rscript
$RscriptPath = Join-Path $OutputDir "bin\x64\Rscript.exe"
if (-not (Test-Path $RscriptPath)) {
    $RscriptPath = Join-Path $OutputDir "bin\Rscript.exe"
}

if (-not (Test-Path $RscriptPath)) {
    Write-Host "  错误: 找不到Rscript.exe" -ForegroundColor Red
    exit 1
}

Write-Host "  Rscript路径: $RscriptPath" -ForegroundColor Green

Write-Host "`n[2/4] 检查R版本..." -ForegroundColor Yellow
& $RscriptPath --version

Write-Host "`n[3/4] 安装REddyProc包..." -ForegroundColor Yellow
$installScript = @"
options(repos = c(CRAN = 'https://cloud.r-project.org'))
if (!require('REddyProc', quietly = TRUE)) {
    cat('正在安装REddyProc...\n')
    install.packages('REddyProc', dependencies = TRUE)
} else {
    cat('REddyProc已安装\n')
}
cat('REddyProc版本:', as.character(packageVersion('REddyProc')), '\n')
"@

& $RscriptPath -e $installScript

Write-Host "`n[4/4] 验证安装..." -ForegroundColor Yellow
$verifyScript = @"
library(REddyProc)
cat('REddyProc加载成功!\n')
cat('版本:', as.character(packageVersion('REddyProc')), '\n')
"@

& $RscriptPath -e $verifyScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "R Portable 环境准备完成!" -ForegroundColor Green
    Write-Host "目录: $OutputDir" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "`n错误: REddyProc安装验证失败" -ForegroundColor Red
    exit 1
}
