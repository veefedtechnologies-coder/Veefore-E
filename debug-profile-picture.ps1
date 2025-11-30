# Test script to debug Instagram profile picture issue
Write-Host "🔍 Testing Instagram Profile Picture Fetch..." -ForegroundColor Green

# Test the refresh profile picture endpoint
Write-Host "Testing profile picture refresh endpoint..." -ForegroundColor Cyan

try {
    # You'll need to replace these with actual values from your database
    $workspaceId = "YOUR_WORKSPACE_ID"  # Replace with actual workspace ID
    $body = @{
        workspaceId = $workspaceId
        platform = "instagram"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/social-accounts/refresh-profile-picture" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "✅ Profile picture refresh response:" -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
    
} catch {
    Write-Host "❌ Profile picture refresh failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "🔍 Next steps:" -ForegroundColor Yellow
Write-Host "1. Check the server logs for '[PROFILE PICTURE DEBUG]' messages" -ForegroundColor White
Write-Host "2. Look for '[PROFILE PICTURE REFRESH]' logs" -ForegroundColor White
Write-Host "3. Check if Instagram API returns profile_picture_url field" -ForegroundColor White
Write-Host "4. Verify the profile picture URL is not being filtered out" -ForegroundColor White



