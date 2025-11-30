# VeeFore Development Environment Startup Script
# PowerShell Version

Write-Host "Starting VeeFore Development Environment..." -ForegroundColor Green
Write-Host ""

# Check if required files exist
if (-not (Test-Path "server/index.ts")) {
    Write-Host "❌ Error: server/index.ts not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "tunnel-config.yml")) {
    Write-Host "❌ Error: tunnel-config.yml not found!" -ForegroundColor Red
    Write-Host "Please ensure the tunnel configuration file exists." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Starting Backend Server..." -ForegroundColor Cyan
# Start backend server in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '🚀 Starting VeeFore Backend Server...' -ForegroundColor Green; npx tsx server/index.ts"

Write-Host ""
Write-Host "[2/3] Waiting for backend to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 8

Write-Host ""
Write-Host "[3/3] Starting Cloudflare Tunnel..." -ForegroundColor Cyan
# Start Cloudflare tunnel in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '🌐 Starting Cloudflare Tunnel...' -ForegroundColor Green; cloudflared tunnel --config tunnel-config.yml run"

Write-Host ""
Write-Host "✅ Development environment started!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend: http://localhost:5000" -ForegroundColor Yellow
Write-Host "Tunnel: https://veefore-webhook.veefore.com" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




