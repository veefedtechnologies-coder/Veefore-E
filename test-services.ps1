# Test script to verify unified VeeFore server is running
Write-Host "🔍 Testing VeeFore Unified Development Environment..." -ForegroundColor Green

# Test unified server
Write-Host "Testing unified server (port 5000)..." -ForegroundColor Cyan
try {
    $serverResponse = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -Method Head -TimeoutSec 5
    Write-Host "✅ Unified server is running (Status: $($serverResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Unified server is not responding" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test frontend via unified server
Write-Host "Testing frontend via unified server..." -ForegroundColor Cyan
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:5000" -Method Head -TimeoutSec 5
    Write-Host "✅ Frontend is accessible via unified server (Status: $($frontendResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend is not accessible via unified server" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test tunnel
Write-Host "Testing Cloudflare tunnel..." -ForegroundColor Cyan
try {
    $tunnelResponse = Invoke-WebRequest -Uri "https://veefore-webhook.veefore.com/api/health" -Method Head -TimeoutSec 10
    Write-Host "✅ Cloudflare tunnel is working (Status: $($tunnelResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Cloudflare tunnel is not responding" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🌐 Access URLs:" -ForegroundColor Yellow
Write-Host "Unified Server (Local): http://localhost:5000" -ForegroundColor White
Write-Host "App (Tunnel): https://veefore-webhook.veefore.com" -ForegroundColor White
