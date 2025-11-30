# VeeFore Development Environment - Simple Version
# Run this in PowerShell

Write-Host "🚀 Starting VeeFore Development Environment..." -ForegroundColor Green

# Start backend server in background
Write-Host "Starting backend server..." -ForegroundColor Cyan
Start-Job -ScriptBlock { 
    Set-Location "F:\Veefed Veefore\Veefore"
    npx tsx server/index.ts 
} | Out-Null

# Wait for backend to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Start Cloudflare tunnel in background
Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan
Start-Job -ScriptBlock { 
    Set-Location "F:\Veefed Veefore\Veefore"
    cloudflared tunnel --config tunnel-config.yml run 
} | Out-Null

Write-Host ""
Write-Host "✅ Services started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend: http://localhost:5000" -ForegroundColor Yellow
Write-Host "Tunnel: https://veefore-webhook.veefore.com" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray

# Keep script running and show job status
try {
    while ($true) {
        Start-Sleep -Seconds 10
        $jobs = Get-Job
        Write-Host "Active jobs: $($jobs.Count)" -ForegroundColor DarkGray
    }
} finally {
    Write-Host "Stopping all services..." -ForegroundColor Red
    Get-Job | Stop-Job
    Get-Job | Remove-Job
}




