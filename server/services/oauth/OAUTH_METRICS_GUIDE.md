# OAuth Metrics and Monitoring Guide

## Overview

This guide documents the OAuth metrics tracking and monitoring implementation for the server-side OAuth 2.0 Authorization Code Flow.

**Requirements**: 18.9

## Metrics Tracked

The OAuth system tracks the following metrics:

### 1. OAuth Flow Success/Failure Rates

**Metric**: `oauth_flow.success_rate_percent`

Tracks the percentage of successful OAuth authentication flows compared to failed flows.

- **Success**: User successfully completes OAuth flow and receives authentication token
- **Failure**: OAuth flow fails at any stage (state validation, token exchange, Firebase token creation, etc.)

### 2. Token Refresh Success Rates

**Metric**: `token_refresh.success_rate_percent`

Tracks the percentage of successful token refresh operations.

- **Success**: Refresh token successfully exchanges for new access token and Firebase custom token
- **Failure**: Refresh operation fails (expired token, network error, etc.)

### 3. OAuth Flow Latency

**Metric**: `oauth_flow.average_duration_ms`

Tracks the average time (in milliseconds) from OAuth flow initiation to completion.

- Measured from `/api/auth/google/start` to successful callback completion
- Only includes successful flows in the average
- Helps identify performance issues in OAuth operations

### 4. Error Rates by Type

**Metric**: `errors.error_rates_by_type`

Tracks the distribution of different error types across all failed OAuth operations.

Tracked error types:
- `invalid_state` - State parameter validation failed (CSRF protection triggered)
- `state_expired` - State parameter expired (>10 minutes)
- `token_exchange_failed` - Failed to exchange authorization code for tokens
- `authorization_code_used` - Authorization code was already used (replay attempt)
- `redirect_uri_mismatch` - Redirect URI not authorized in Google Console
- `firebase_token_failed` - Failed to create Firebase custom token
- `refresh_token_expired` - Refresh token expired or revoked
- `refresh_token_not_found` - No refresh token found in database
- `retry_exhaustion` - All retry attempts exhausted for network requests
- `network_error` - Network connectivity issues
- `unknown` - Unclassified error

## Metrics Endpoint

### GET /api/auth/metrics

Returns real-time OAuth metrics for monitoring and observability.

**Authentication**: None (public endpoint for monitoring tools)

**Response Format**:

```json
{
  "success": true,
  "timestamp": "2025-02-08T16:06:57.123Z",
  "metrics": {
    "oauth_flow": {
      "success_rate_percent": "95.50",
      "total_flows": 1000,
      "average_duration_ms": "2500"
    },
    "token_refresh": {
      "success_rate_percent": "98.20",
      "total_refreshes": 500
    },
    "errors": {
      "error_rates_by_type": {
        "invalid_state": 2.5,
        "token_exchange_failed": 1.0,
        "state_expired": 0.5
      }
    },
    "metadata": {
      "recent_metrics_count": 1000,
      "note": "Metrics are based on the last 1000 operations"
    }
  }
}
```

**Response Fields**:

- `oauth_flow.success_rate_percent` - Percentage of successful OAuth flows (0-100)
- `oauth_flow.total_flows` - Total number of OAuth flow attempts
- `oauth_flow.average_duration_ms` - Average latency for successful flows
- `token_refresh.success_rate_percent` - Percentage of successful token refreshes (0-100)
- `token_refresh.total_refreshes` - Total number of refresh attempts
- `errors.error_rates_by_type` - Error distribution as percentages
- `metadata.recent_metrics_count` - Number of operations in the current metrics window

## Implementation Details

### Metrics Storage

Metrics are stored in-memory using a circular buffer:
- Maximum of 1000 most recent operations stored
- Oldest metrics automatically removed when limit reached
- Metrics reset on server restart

**Production Recommendation**: Integrate with external metrics service (Prometheus, Datadog, CloudWatch) for persistent storage and historical analysis.

### Metrics Collection Points

Metrics are automatically collected at the following points:

1. **Flow Initiation** - When `/api/auth/google/start` is called
2. **Flow Success** - When OAuth callback completes successfully
3. **Flow Failure** - When OAuth callback fails at any stage
4. **Token Refresh** - When `/api/auth/refresh` is called (success or failure)
5. **Logout** - When `/api/auth/logout` is called

### Latency Tracking

OAuth flow latency is measured from the start of the callback handler to completion:

```typescript
const flowStartTime = Date.now();
// ... OAuth operations ...
const flowDuration = Date.now() - flowStartTime;
oauthMetrics.recordFlowSuccess(flowDuration, userId, email, correlationId);
```

Token refresh latency is measured similarly for the refresh endpoint.

## Monitoring Best Practices

### 1. Set Up Alerting

Configure alerts for:
- OAuth flow success rate drops below 95%
- Token refresh success rate drops below 98%
- Average OAuth flow duration exceeds 5 seconds
- Specific error types exceed threshold (e.g., `token_exchange_failed` > 5%)

### 2. Dashboard Visualization

Create monitoring dashboards with:
- Time-series graphs for success rates
- Latency percentiles (p50, p95, p99)
- Error rate breakdown by type
- Total operation counts

### 3. Correlation with Other Metrics

Cross-reference OAuth metrics with:
- Server response times
- Database query performance
- External API latency (Google OAuth)
- Network connectivity issues

### 4. Regular Review

- Review metrics weekly for trends
- Investigate any sudden changes in error rates
- Monitor for unusual patterns (e.g., spike in `invalid_state` could indicate attack)

## Integration with Monitoring Tools

### Prometheus

To integrate with Prometheus:

```typescript
import { register, Counter, Histogram } from 'prom-client';

const oauthFlowSuccess = new Counter({
  name: 'oauth_flow_success_total',
  help: 'Total number of successful OAuth flows',
});

const oauthFlowDuration = new Histogram({
  name: 'oauth_flow_duration_ms',
  help: 'OAuth flow duration in milliseconds',
  buckets: [100, 500, 1000, 2500, 5000, 10000],
});

// Update in OAuth routes
oauthFlowSuccess.inc();
oauthFlowDuration.observe(flowDuration);
```

### Datadog

To integrate with Datadog:

```typescript
import { metrics } from 'datadog-metrics';

metrics.increment('oauth.flow.success');
metrics.histogram('oauth.flow.duration', flowDuration);
metrics.gauge('oauth.flow.success_rate', successRate);
```

### CloudWatch

To integrate with AWS CloudWatch:

```typescript
import AWS from 'aws-sdk';

const cloudwatch = new AWS.CloudWatch();

cloudwatch.putMetricData({
  Namespace: 'OAuth',
  MetricData: [{
    MetricName: 'FlowSuccessRate',
    Value: successRate,
    Unit: 'Percent',
  }],
});
```

## Troubleshooting

### High Error Rates

**Symptom**: Error rate suddenly increases

**Possible Causes**:
- Google OAuth service outage → Check Google status page
- Network connectivity issues → Check server connectivity
- Configuration issues → Verify environment variables
- Attack attempts → Review logs for patterns

### High Latency

**Symptom**: Average OAuth flow duration exceeds 5 seconds

**Possible Causes**:
- Slow database queries → Optimize MongoDB queries
- Network latency to Google → Check network path
- High server load → Scale horizontally
- Slow Firebase Admin operations → Review Firebase performance

### Low Success Rates

**Symptom**: OAuth flow success rate below 95%

**Possible Causes**:
- Mismatched redirect URIs → Verify Google Console configuration
- Session storage issues → Check session middleware
- State parameter expiration → Review session TTL settings
- Token storage failures → Check MongoDB connectivity

## Security Considerations

### 1. Metrics Endpoint Security

The `/api/auth/metrics` endpoint is currently public for monitoring tools. Consider:
- Adding authentication for production environments
- Implementing rate limiting to prevent abuse
- Using IP whitelisting for monitoring services only

### 2. Sensitive Data in Metrics

The metrics system does NOT store or expose:
- Access tokens
- Refresh tokens
- Session secrets
- User passwords
- Authorization codes

All metrics contain only:
- Operation counts
- Success/failure status
- Duration measurements
- Error type categories (not error messages)

### 3. User Privacy

Metrics do NOT contain personally identifiable information (PII):
- Email addresses are logged but not stored in metrics
- User IDs are logged but not exposed in metrics endpoint
- IP addresses are logged but not stored in metrics

## Testing

Comprehensive tests are available in:
- `server/routes/__tests__/auth-metrics.test.ts` - Integration tests for metrics tracking
- `server/services/oauth/__tests__/OAuthMetrics.test.ts` - Unit tests for metrics service (if exists)

Run tests with:
```bash
npm test -- server/routes/__tests__/auth-metrics.test.ts
```

## Future Enhancements

Consider implementing:

1. **Persistent Storage** - Store metrics in database for historical analysis
2. **Real-time Alerting** - Integrate with PagerDuty or similar for critical alerts
3. **User Segmentation** - Track metrics by user type or region
4. **Performance Optimization** - Add caching for frequently accessed metrics
5. **Custom Metrics** - Allow filtering by time range, user, or error type
6. **Metrics Visualization** - Build admin dashboard for real-time monitoring
7. **SLA Tracking** - Calculate and report on OAuth SLA compliance
8. **Anomaly Detection** - Automatically detect unusual patterns in metrics

## Support

For questions or issues related to OAuth metrics:
1. Check the metrics endpoint: `GET /api/auth/metrics`
2. Review server logs for detailed operation information
3. Consult the main OAuth documentation in the design document
4. Contact the development team for assistance

---

**Last Updated**: 2025-02-08
**Requirements**: 18.9
**Version**: 1.0.0
