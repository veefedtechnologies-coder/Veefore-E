# Production Monitoring Setup

This document describes the recommended production monitoring setup for Veefore-E after the refactoring initiative, including APM, error tracking, bundle size monitoring, and key post-deployment metrics.

---

## Overview

The refactoring introduced centralized error handling (`server/shared/middleware/errorHandler.ts`), a service layer architecture, and bundle optimizations. Monitoring should be configured to validate these improvements hold in production and to catch regressions early.

---

## 1. APM (Application Performance Monitoring)

### Recommended Options

| Tool | Best For | Setup Complexity |
|------|---------|-----------------|
| **Datadog APM** | Full-stack visibility, Node.js + browser | Medium |
| **New Relic** | Detailed Node.js transaction tracing | Medium |
| **Elastic APM** | Self-hosted, no per-seat cost | High |
| **Sentry Performance** | Already integrated for error tracking | Low (reuse existing) |

### Datadog APM Setup (Recommended)

```bash
npm install dd-trace
```

```typescript
// server/index.ts — must be the FIRST import
import tracer from 'dd-trace';

tracer.init({
  service: 'veefore-api',
  env: process.env.NODE_ENV,
  version: process.env.APP_VERSION,
  logInjection: true,  // correlate APM traces with Pino log entries
  runtimeMetrics: true,
  profiling: true,
});
```

Set environment variables:

```
DD_API_KEY=<your-datadog-api-key>
DD_SITE=datadoghq.com
DD_SERVICE=veefore-api
DD_ENV=production
DD_VERSION=1.0.0
```

### New Relic Setup (Alternative)

```bash
npm install newrelic
```

```typescript
// server/index.ts — must be the FIRST import
require('newrelic');
```

Create `newrelic.js` at the project root:

```javascript
exports.config = {
  app_name: ['Veefore-E'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: { level: 'info' },
  allow_all_headers: true,
  distributed_tracing: { enabled: true },
};
```

### Key Transactions to Trace

After the service layer refactoring, these are the critical code paths to monitor:

| Transaction | Expected P95 Latency | Alert Threshold |
|------------|---------------------|----------------|
| `POST /api/ai/generate-caption` | < 3s | > 5s |
| `POST /api/ai/generate-text` | < 5s | > 10s |
| `POST /api/instagram/publish` | < 4s | > 8s |
| `GET /api/dashboard/metrics` | < 500ms | > 1s |
| `POST /api/storage/upload` | < 2s | > 5s |
| `POST /auth/login` | < 300ms | > 1s |

---

## 2. Error Tracking with Centralized Error Handler

The refactoring implemented a centralized error handler at `server/shared/middleware/errorHandler.ts`. This is the integration point for error tracking services.

### Sentry Integration (Recommended)

```bash
npm install @sentry/node @sentry/profiling-node
```

```typescript
// server/index.ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `veefore-api@${process.env.APP_VERSION}`,
  tracesSampleRate: 0.1,          // 10% of requests sampled for performance
  profilesSampleRate: 0.1,
  integrations: [nodeProfilingIntegration()],
});

// Add Sentry request handler before all routes
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
```

```typescript
// server/shared/middleware/errorHandler.ts (updated to include Sentry)
import * as Sentry from '@sentry/node';
import { AppError } from '../errors';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Log unexpected errors to Sentry
  if (!(err instanceof AppError) || err.statusCode >= 500) {
    Sentry.captureException(err, {
      tags: {
        requestId: req.headers['x-request-id'] as string,
        route: req.route?.path,
      },
      user: { id: (req as any).userId },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        type: err.constructor.name,
        message: err.message,
        requestId: req.headers['x-request-id'],
      },
    });
  }

  // Generic error — don't leak internals
  res.status(500).json({
    error: {
      type: 'InternalServerError',
      message: 'An unexpected error occurred',
      requestId: req.headers['x-request-id'],
    },
  });
};
```

Set environment variables:

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

### Error Alerting Rules

Configure these Sentry alert rules:

| Alert | Condition | Channel |
|-------|-----------|---------|
| `ExternalServiceError` spike | > 10 errors/min | Slack #alerts |
| `AuthenticationError` spike | > 50 errors/min | PagerDuty |
| Unhandled exceptions | Any | Slack #alerts |
| New error type (not seen before) | First occurrence | Email |

---

## 3. Bundle Size Monitoring

### CI-Based Bundle Size Checks

The `bundlesize` package enforces size budgets in CI:

```bash
npm install --save-dev bundlesize
```

```json
// package.json
{
  "bundlesize": [
    {
      "path": "./dist/assets/index-*.js",
      "maxSize": "55 kB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/vendor-react-*.js",
      "maxSize": "150 kB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/vendor-framer-*.js",
      "maxSize": "100 kB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/vendor-three-*.js",
      "maxSize": "320 kB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/vendor-charts-*.js",
      "maxSize": "80 kB",
      "compression": "gzip"
    }
  ]
}
```

Add to CI:

```yaml
# .github/workflows/ci.yml
- name: Check bundle sizes
  run: npx bundlesize
```

### Automated Bundle Analysis on PRs

```bash
npm install --save-dev vite-bundle-visualizer
```

```bash
# Generate bundle analysis
npx vite-bundle-visualizer --open
```

Configure in CI to post a bundle report comment on PRs that change bundle size by >5%.

---

## 4. Key Metrics to Track Post-Deployment

### Server-Side Metrics

| Metric | Tool | Alert Threshold |
|--------|------|----------------|
| API error rate (5xx) | Datadog / New Relic | > 1% of requests |
| API P95 latency | Datadog / New Relic | > 2x baseline |
| MongoDB query time | Datadog / Mongoose debug | P95 > 500ms |
| Redis hit rate | Datadog / Redis metrics | < 80% (cache degradation) |
| Memory usage (Node.js heap) | Datadog / New Relic | > 80% of limit |
| Instagram webhook processing time | Custom metric | P95 > 5s |
| AI generation success rate | Custom metric | < 95% success |

### Client-Side Metrics

| Metric | Tool | Target |
|--------|------|--------|
| Core Web Vitals (LCP, FID, CLS) | Sentry Performance / web-vitals | LCP < 2.5s, CLS < 0.1 |
| JavaScript errors | Sentry | 0 new error types per deploy |
| Bundle size per chunk | bundlesize CI | Within defined limits |
| Lighthouse CI Performance | lhci | ≥ 90 |

### Business Metrics

| Metric | Why It Matters |
|--------|---------------|
| Signup completion rate | Validates `useSignUpFlow` refactoring didn't break the funnel |
| Instagram publish success rate | Validates consolidated `InstagramService` |
| AI generation completion rate | Validates `AIServiceManager` refactoring |
| Session errors (WebSocket disconnects) | Validates `useWebSocketChat` stability |

### Custom Instrumentation

For the service layer, add lightweight metrics to each service:

```typescript
// server/features/ai/services/openai.service.ts
import { performance } from 'node:perf_hooks';

async generateText(prompt: string): Promise<string> {
  const start = performance.now();
  try {
    const result = await this.openai.chat.completions.create({ ... });
    const duration = performance.now() - start;
    logger.info({ duration, provider: 'openai', type: 'text' }, 'AI generation completed');
    return result.choices[0].message.content;
  } catch (error) {
    logger.error({ error, provider: 'openai', type: 'text' }, 'AI generation failed');
    throw new ExternalServiceError('OpenAI generation failed');
  }
}
```

---

## 5. Log Aggregation

The server uses **Pino** for structured JSON logging. All logs include:
- `requestId` — correlates all log lines for a single request
- `userId` — identifies the authenticated user
- `service` — which service layer class generated the log
- `duration` — for timed operations

### Recommended Log Aggregation Setup

| Tool | Deployment |
|------|-----------|
| **Datadog Logs** | If using Datadog APM (log correlation built-in) |
| **Logtail (Better Stack)** | Simple setup, good for Railway/Vercel |
| **AWS CloudWatch** | If hosting on AWS |
| **Elastic Stack (ELK)** | Self-hosted, full control |

For Railway deployment, Pino's output is automatically captured by Railway's log aggregator. Forward to Datadog:

```bash
# Set in Railway dashboard
DD_LOGS_INJECTION=true
DD_API_KEY=<key>
```

---

## Requirements Satisfied

- **Requirement 7.2** — Performance monitoring setup with APM, error tracking, bundle monitoring, and key post-deployment metrics ✅
