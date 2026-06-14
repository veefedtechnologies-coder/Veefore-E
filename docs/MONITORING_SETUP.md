# Production Monitoring Setup

**Version:** 2.0  
**Last Updated:** 2025-01-01

This guide explains how to configure production monitoring using the centralized error handling system introduced in Phase 4 of the refactoring initiative.

---

## Overview

The refactored error handling architecture provides structured hooks for monitoring:

1. **Centralized Express error middleware** — all server errors pass through one handler
2. **Typed error classes** — categorized errors enable smart alerting thresholds
3. **React error boundaries** — client errors are caught and reported separately
4. **Consistent error format** — all errors include `requestId`, `userId`, `timestamp`

---

## Server-Side Monitoring

### Error Middleware Hook

The error middleware in `/server/shared/errors/errorHandler.ts` is where monitoring integrations attach:

```typescript
// server/shared/errors/errorHandler.ts
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const errorEvent = {
    errorCode: err.code,
    errorClass: err.constructor.name,
    message: err.message,
    statusCode: err.statusCode || 500,
    requestId: req.headers['x-request-id'] ?? generateRequestId(),
    userId: req.user?.id,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  };

  // ── Monitoring integration point ──────────────────────────────────
  monitoring.captureError(errorEvent);  // plug in your monitoring client here
  // ─────────────────────────────────────────────────────────────────

  res.status(errorEvent.statusCode).json({
    error: {
      code: errorEvent.errorCode,
      message: err.isOperational ? err.message : 'An internal error occurred',
      requestId: errorEvent.requestId,
    }
  });
};
```

### Integrating Sentry

```bash
npm install @sentry/node
```

```typescript
// server/index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

// Add before routes
app.use(Sentry.Handlers.requestHandler());

// Add before error handler
app.use(Sentry.Handlers.errorHandler());
```

### Integrating Datadog

```bash
npm install dd-trace
```

```typescript
// server/index.ts — must be first import
import tracer from 'dd-trace';
tracer.init({
  service: 'veefore-api',
  env: process.env.NODE_ENV,
  version: process.env.npm_package_version,
});
```

### Custom Monitoring Client Interface

```typescript
// server/shared/monitoring/monitoring.ts
export interface MonitoringClient {
  captureError(event: ErrorEvent): void;
  captureMetric(name: string, value: number, tags?: Record<string, string>): void;
  captureEvent(event: CustomEvent): void;
}
```

---

## Alerting Rules by Error Type

The typed error classes enable granular alerting:

| Error Class | Suggested Alert | Threshold |
|-------------|----------------|----------|
| `AuthenticationError` | Spike detection | >50/min per IP → possible brute force |
| `AuthorizationError` | Log only | Normal user behavior |
| `ValidationError` | Log only | Client-side validation issues |
| `ExternalServiceError` | Alert immediately | Any Instagram/OpenAI/S3 failures |
| `NotFoundError` | Log only | Normal |
| `Error` (unhandled) | Alert immediately | Any |

### Example Alert Configuration (PagerDuty / Datadog)

```yaml
# alerts.yml
alerts:
  - name: "External Service Failures"
    condition: error_class == "ExternalServiceError"
    threshold: 5 per minute
    severity: high
    
  - name: "Unhandled Errors"
    condition: error_class == "Error" AND status_code == 500
    threshold: 3 per minute
    severity: critical
    
  - name: "Auth Brute Force"
    condition: error_class == "AuthenticationError" AND ip_count > 50/min
    severity: critical
```

---

## Client-Side Monitoring

### React Error Boundary Reporting

All feature modules are wrapped in error boundaries. Configure the boundary to report to your monitoring service:

```typescript
// client/src/shared/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Monitoring integration point
    monitoring.captureError({
      error,
      componentStack: info.componentStack,
      userId: getCurrentUserId(),
      timestamp: new Date().toISOString(),
    });
  }
}
```

### Sentry React Integration

```bash
npm install @sentry/react
```

```typescript
// client/src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({ useEffect: React.useEffect }),
  ],
  tracesSampleRate: 0.1,
});
```

---

## Performance Monitoring

### Server Response Time Tracking

Add timing middleware before all routes:

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    monitoring.captureMetric('http.response_time', duration, {
      method: req.method,
      path: req.route?.path ?? req.path,
      status: String(res.statusCode),
    });
  });
  next();
});
```

### Key Metrics to Track

| Metric | Description | Alert Threshold |
|--------|------------|----------------|
| `http.response_time` | API response time P95 | > 2,000ms |
| `ai.generation_time` | AI text generation P95 | > 10,000ms |
| `storage.upload_time` | File upload P95 | > 5,000ms |
| `instagram.api_time` | Instagram API calls | > 3,000ms |
| `db.query_time` | MongoDB query P95 | > 500ms |
| `redis.operation_time` | Redis operation P95 | > 100ms |

---

## Health Check Endpoint

The server exposes a health check endpoint at `GET /health`:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "2.0.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "storage": "connected"
  }
}
```

Configure your load balancer or uptime monitoring (UptimeRobot, Pingdom, etc.) to hit this endpoint every 60 seconds.

---

## Log Aggregation

All server logs follow a structured JSON format compatible with log aggregation services:

```json
{
  "level": "error",
  "message": "Instagram API request failed",
  "requestId": "req_abc123",
  "userId": "user_xyz",
  "service": "InstagramService",
  "method": "publishMedia",
  "errorClass": "ExternalServiceError",
  "statusCode": 502,
  "timestamp": "2025-01-01T12:00:00Z"
}
```

Ship logs to your preferred destination (CloudWatch, Logtail, Papertrail, etc.) by configuring the `LOG_DESTINATION` environment variable.
