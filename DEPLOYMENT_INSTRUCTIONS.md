# Instagram Token Solution - Deployment Instructions

## Overview
This document provides step-by-step instructions for deploying the permanent Instagram token solution to prevent token decryption and logout issues.

## Pre-Deployment Checklist

### ✅ Verify Implementation
1. **Core Fix**: Confirm `convertSocialAccount()` method includes token decryption
2. **Middleware**: Token health check middleware is integrated
3. **Services**: Validator and monitoring services are created
4. **Routes**: Token health API endpoints are registered
5. **Server Integration**: Monitoring service is initialized on startup

### ✅ Environment Requirements
- Node.js environment with ES modules support
- MongoDB connection string configured
- Instagram API credentials available
- Server restart capability

## Deployment Steps

### Step 1: Server Restart Required
The new token monitoring service requires a server restart to initialize properly.

```bash
# Stop the current server
# Restart using your preferred method
npm run dev  # or your production start command
```

### Step 2: Verify Service Initialization
After restart, check the server logs for these messages:
```
[TOKEN MONITORING] Initializing Instagram token health monitoring...
[TOKEN MONITORING] ✅ Token monitoring service started successfully
[INSTAGRAM MONITOR] Starting Instagram token monitoring service...
[INSTAGRAM MONITOR] ✅ Monitoring service started successfully
```

### Step 3: Test Token Health API
Verify the new API endpoints are working:

```bash
# Test health stats endpoint
curl -X GET "http://localhost:5000/api/instagram/token-health/stats"

# Should return monitoring statistics
```

### Step 4: Monitor Background Service
The monitoring service will automatically:
- Run health checks every 30 minutes
- Fix encrypted tokens automatically
- Log all operations for monitoring

## Verification Steps

### 1. Check Service Status
```bash
# Get overall monitoring stats
curl -X GET "http://localhost:5000/api/instagram/token-health/stats"
```

Expected response:
```json
{
  "success": true,
  "validator": { ... },
  "healthChecker": { ... },
  "timestamp": "2024-01-XX..."
}
```

### 2. Test Token Validation (when account is connected)
```bash
# Replace WORKSPACE_ID with actual workspace ID
curl -X POST "http://localhost:5000/api/instagram/token-health/validate" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "WORKSPACE_ID"}'
```

### 3. Monitor Server Logs
Watch for these log patterns:
- `[TOKEN HEALTH]` - Health check middleware operations
- `[INSTAGRAM VALIDATOR]` - Token validation operations  
- `[INSTAGRAM MONITOR]` - Background monitoring operations

## Post-Deployment Monitoring

### Key Metrics to Watch
1. **Token Health Rate**: Percentage of healthy vs unhealthy tokens
2. **Auto-Fix Success Rate**: How many tokens are automatically fixed
3. **API Validation Success**: Instagram API call success rate
4. **Background Processing**: Monitor service performance

### Log Monitoring Commands
```bash
# Monitor token-related logs
tail -f server.log | grep -E "\[TOKEN|INSTAGRAM\]"

# Check for errors
tail -f server.log | grep -E "ERROR.*token|ERROR.*instagram"
```

### Health Check Endpoints
- `GET /api/instagram/token-health/stats` - Overall system health
- `GET /health` - General server health (includes token monitoring)

## Troubleshooting

### Common Issues

#### 1. Service Not Starting
**Symptoms**: No token monitoring logs on startup
**Solution**: 
- Check ES module imports are working
- Verify MongoDB connection
- Check server startup logs for errors

#### 2. Token Validation Failing
**Symptoms**: Validation always returns errors
**Solution**:
- Verify Instagram API credentials
- Check network connectivity
- Review token encryption service

#### 3. Background Monitoring Not Running
**Symptoms**: No periodic health check logs
**Solution**:
- Check if service initialized properly
- Verify no startup errors
- Restart server if needed

### Debug Commands
```bash
# Force immediate health check
curl -X POST "http://localhost:5000/api/instagram/token-health/validate" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "test", "forceRefresh": true}'

# Clear validation cache
curl -X POST "http://localhost:5000/api/instagram/token-health/clear-cache"

# Get detailed stats
curl -X GET "http://localhost:5000/api/instagram/token-health/stats"
```

## Rollback Plan

If issues occur, you can disable the new features:

### 1. Disable Background Monitoring
Comment out the monitoring initialization in `server/index.ts`:
```typescript
// // Initialize Instagram Token Monitoring Service
// console.log('[TOKEN MONITORING] Initializing Instagram token health monitoring...');
// const { initializeTokenMonitoring } = await import('./initializeTokenMonitoring');
// const tokenMonitor = initializeTokenMonitoring(storage);
// console.log('[TOKEN MONITORING] ✅ Token monitoring service started successfully');
```

### 2. Disable Health Check Middleware
Remove middleware from routes in `server/routes/instagram-diagnostics.js`:
```javascript
// Remove checkTokenHealth from route handlers
router.post('/instagram', async (req, res) => { // Remove checkTokenHealth
```

### 3. Keep Core Fix
**DO NOT REMOVE** the core token decryption fix in `convertSocialAccount()` - this is essential and safe.

## Success Indicators

### Immediate (After Deployment)
- ✅ Server starts without errors
- ✅ Token monitoring logs appear
- ✅ API endpoints respond correctly
- ✅ No increase in error rates

### Short-term (Within 1 hour)
- ✅ Background monitoring runs first check
- ✅ Any existing encrypted tokens are detected
- ✅ Auto-fix attempts are logged
- ✅ System performance remains stable

### Long-term (Within 24 hours)
- ✅ Regular monitoring cycles complete
- ✅ Token health statistics show improvement
- ✅ No user reports of token issues
- ✅ Instagram metrics display correctly

## Next Steps After Deployment

### 1. User Account Connection
When users connect their Instagram accounts:
- The system will automatically validate tokens
- Any issues will be detected and fixed immediately
- Users should see metrics without reconnection needs

### 2. Ongoing Monitoring
- Review token health statistics weekly
- Monitor for any recurring patterns
- Adjust monitoring intervals if needed

### 3. Performance Optimization
- Monitor system resource usage
- Adjust batch sizes if needed
- Fine-tune monitoring intervals

## Support

### For Technical Issues
1. Check server logs for error patterns
2. Test API endpoints manually
3. Verify MongoDB connectivity
4. Review Instagram API status

### For User Issues
1. Check token health status for their workspace
2. Force token validation if needed
3. Guide through reconnection if automatic fix fails
4. Monitor logs for their specific account

## Conclusion

This deployment provides:
- **Automatic token decryption** for all Instagram accounts
- **Proactive monitoring** to prevent future issues
- **Self-healing capabilities** for common token problems
- **Comprehensive APIs** for manual intervention when needed
- **Detailed logging** for troubleshooting and monitoring

The solution is designed to be robust and self-maintaining, requiring minimal manual intervention once deployed.