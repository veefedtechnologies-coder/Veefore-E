# Route Guards Reference

Maps every premium route to its required entitlement middleware. Use this as the single source of truth when adding new routes or reviewing existing ones.

All guard helpers live in `server/middleware/apply-route-guards.ts`.  
The individual middleware functions live in `server/middleware/entitlement.middleware.ts`.

---

## How to read this table

| Column | Meaning |
|--------|---------|
| **Route** | HTTP method + path (relative to the mount prefix) |
| **File** | Source file containing the route definition |
| **Guard chain** | Ordered middleware to add, left to right |
| **Min plan** | Minimum plan required to pass all guards |
| **Status** | `applied` = guards are already in place; `pending` = guards documented here but not yet wired |

---

## 1. Scheduling Routes

Mount prefix: `/api` / `/api/v1` (via `mountV1Routes`)

| Route | File | Guard chain | Min plan | Status |
|-------|------|-------------|----------|--------|
| `POST /content/:contentId/schedule` | `server/routes/v1/content.routes.ts` | `requireSubscription()`, `requireProfileLimit()` | Free (active) | pending |
| `PUT /content/:contentId/reschedule` | `server/routes/v1/content.routes.ts` | `requireSubscription()`, `requireProfileLimit()` | Free (active) | pending |
| `POST /scheduler/create` | `server/routes/v1/scheduler.routes.ts` | `requireSubscription()`, `requireProfileLimit()` | Free (active) | pending |
| Bulk schedule endpoint (future) | TBD | `requireSubscription()`, `requireProfileLimit()`, `requireFeature('bulkScheduling')` | Creator | pending |

**Helper export:** `schedulingGuards` / `bulkSchedulingGuards`

```ts
// server/routes/v1/content.routes.ts
import { schedulingGuards } from '../../middleware/apply-route-guards';

router.post('/:contentId/schedule',
  requireAuth,
  ...schedulingGuards,
  validateRequest({ params: ContentIdParams }),
  auditMiddleware(AuditActions.CONTENT.SCHEDULE, { resource: 'content' }),
  contentController.scheduleContent
);
```

---

## 2. Analytics Routes

Mount prefix: `/api` / `/api/v1`

| Route | File | Guard chain | Min plan | Status |
|-------|------|-------------|----------|--------|
| `GET /analytics/workspace/:id/date-range` | `server/routes/v1/analytics.routes.ts` | `analyticsHistoryGuard()` | Free (30 days) | pending |
| `GET /analytics/historical` | `server/routes/v1/analytics.routes.ts` | `analyticsHistoryGuard()` | Free (30 days) | pending |
| `GET /analytics/dashboards/:dashboardId` | `server/features/analytics/api/routes.ts` | `requireFeature('customDashboards')` | Pro | pending |

**Helper export:** `analyticsHistoryGuard()` (factory function), `customDashboardGuards`

```ts
// server/routes/v1/analytics.routes.ts
import {
  analyticsHistoryGuard,
  customDashboardGuards
} from '../../middleware/apply-route-guards';

// Historical endpoint
router.get('/historical',
  requireAuth,
  analyticsHistoryGuard(),          // reads ?days / ?startDate / ?from dynamically
  validateWorkspaceAccess({ source: 'query' }),
  handler
);

// Date-range endpoint
router.get('/workspace/:workspaceId/date-range',
  requireAuth,
  analyticsHistoryGuard(),
  validateWorkspaceAccess({ source: 'params' }),
  analyticsController.getDateRange
);
```

For the dashboard router, wrap `createDashboardRouter` with the guards:

```ts
// server/routes/v1/analytics.routes.ts
import { customDashboardGuards } from '../../middleware/apply-route-guards';

router.use(
  '/dashboards',
  ...customDashboardGuards,         // requireFeature('customDashboards')
  createDashboardRouter({ service: legacyDashboardService, cache: new RedisAnalyticsCache() })
);
```

### Analytics history limits by plan

| Plan | `analyticsHistoryDays` |
|------|------------------------|
| Free | 30 |
| Creator | 365 (1 year) |
| Pro | 730 (2 years) |
| Business | 730 (2 years) |
| Enterprise | Unlimited |

---

## 3. Analytics Export Routes

Mount prefix: `/api` / `/api/v1`

| Route | File | Guard chain | Min plan | Status |
|-------|------|-------------|----------|--------|
| `GET /analytics-reports/export-data` | `server/routes/v1/analytics-reports.routes.ts` | `requireSubscription()`, `injectAnalyticsExportMode()` | Free (watermarked) | pending |

**Helper export:** `analyticsExportGuards`, `injectAnalyticsExportMode()`

Free users receive a watermarked PDF export (`analyticsExport: 'watermarked_pdf'`).  
Paid users receive full exports (`analyticsExport: 'full'`).  
`injectAnalyticsExportMode()` attaches `req.analyticsExportMode` for the PDF renderer.

```ts
// server/routes/v1/analytics-reports.routes.ts
import {
  analyticsExportGuards,
  injectAnalyticsExportMode
} from '../../middleware/apply-route-guards';

router.get('/export-data',
  requireAuth,
  ...analyticsExportGuards,         // requireSubscription()
  injectAnalyticsExportMode(),      // sets req.analyticsExportMode
  validateWorkspaceAccess({ source: 'query' }),
  handler
);
```

### Export capability by plan

| Plan | `analyticsExport` value |
|------|------------------------|
| Free | `watermarked_pdf` |
| Creator | `full` |
| Pro | `full` |
| Business | `full` |
| Enterprise | `full` |

---

## 4. Social Listening Routes

Source file: `server/routes/social-listening.ts`  
Mount location: registered in `server/routes/v1/index.ts` or `server/routes.ts`

### 4a. Basic social listening (Creator plan and above)

| Route | Guard chain | Status |
|-------|-------------|--------|
| `GET /social-listening/sources/:workspaceId` | `requireFeature('socialListening')` | pending |
| `POST /social-listening/sources` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/trends/:workspaceId` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/dashboard/overview/:workspaceId` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/dashboard/summary/:workspaceId` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/dashboard/viral-hooks/:workspaceId` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/alerts/:workspaceId` | `requireFeature('socialListening')` | pending |
| `GET /social-listening/search/:workspaceId` | `requireFeature('socialListening')` | pending |

**Helper export:** `socialListeningGuards`

### 4b. Advanced social listening (Pro plan and above)

| Route | Guard chain | Status |
|-------|-------------|--------|
| `GET /social-listening/dashboard/sentiment-timeline/:workspaceId` | `requireFeature('socialListening')`, `requireFeature('advancedSocialListening')` | pending |
| `GET /social-listening/dashboard/topic-clusters/:workspaceId` | `requireFeature('socialListening')`, `requireFeature('advancedSocialListening')` | pending |
| `GET /social-listening/dashboard/trending/:workspaceId` | `requireFeature('socialListening')`, `requireFeature('advancedSocialListening')` | pending |
| `GET /social-listening/dashboard/audience/:workspaceId` | `requireFeature('socialListening')`, `requireFeature('advancedSocialListening')` | pending |

**Helper export:** `advancedSocialListeningGuards`

```ts
// server/routes/social-listening.ts  (example patch — basic routes)
import {
  socialListeningGuards,
  advancedSocialListeningGuards,
} from '../middleware/apply-route-guards';

// Basic — available on Creator+
router.get('/sources/:workspaceId',
  ...socialListeningGuards,         // requireFeature('socialListening')
  async (req, res) => { /* ... */ }
);

// Advanced — available on Pro+
router.get('/dashboard/sentiment-timeline/:workspaceId',
  ...advancedSocialListeningGuards, // requireFeature('socialListening') + requireFeature('advancedSocialListening')
  async (req, res) => { /* ... */ }
);
```

### Social listening feature availability by plan

| Plan | `socialListening` | `advancedSocialListening` |
|------|-------------------|--------------------------|
| Free | ✗ | ✗ |
| Creator | ✓ | ✗ |
| Pro | ✓ | ✓ |
| Business | ✓ | ✓ |
| Enterprise | ✓ | ✓ |

---

## 5. Guard placement rules for new routes

When adding a new premium route, follow this decision tree:

1. **Is it behind authentication?**  
   Always add `requireAuth` first. This is separate from entitlement and is not exported from this file.

2. **Does the feature require an active subscription?**  
   Add `requireSubscription()`. This rejects users whose subscription has `cancelled`, `expired`, or `payment_failed` (past grace).

3. **Does the feature consume a social profile slot?**  
   Add `requireProfileLimit()` after `requireSubscription()`.

4. **Is the feature gated by a boolean plan flag?**  
   Add `requireFeature('featureKey')`. Valid feature keys are defined in `PlanFeatures` in `server/config/plan-config.ts`.

5. **Does the feature query historical data?**  
   Add `analyticsHistoryGuard()` to enforce the plan's `analyticsHistoryDays` limit.

6. **Does the feature consume AI credits?**  
   Add `requireCredits(CREDIT_COSTS[operation])` — covered by task 16.2, not this file.

7. **Is there a minimum plan tier (not just a feature flag)?**  
   Add `requirePlan('planId')` — covered by task 16.2.

---

## 6. Guard helper quick reference

| Export | Type | Description |
|--------|------|-------------|
| `schedulingGuards` | `RequestHandler[]` | `requireSubscription()` + `requireProfileLimit()` |
| `bulkSchedulingGuards` | `RequestHandler[]` | `schedulingGuards` + `requireFeature('bulkScheduling')` |
| `analyticsHistoryGuard()` | `() => RequestHandler` | Reads days from request, calls `requireAnalyticsLimit(days)` |
| `customDashboardGuards` | `RequestHandler[]` | `requireFeature('customDashboards')` |
| `analyticsExportGuards` | `RequestHandler[]` | `requireSubscription()` |
| `injectAnalyticsExportMode()` | `() => RequestHandler` | Sets `req.analyticsExportMode` from user plan |
| `socialListeningGuards` | `RequestHandler[]` | `requireFeature('socialListening')` |
| `advancedSocialListeningGuards` | `RequestHandler[]` | `requireFeature('socialListening')` + `requireFeature('advancedSocialListening')` |

---

## 7. Error response shapes

All middleware follows the same error contract so the frontend `UpgradeDialog` can render the correct message.

| HTTP code | Middleware | Response body keys |
|-----------|------------|--------------------|
| 401 | all | `{ error }` |
| 402 | `requireSubscription`, `requireCredits` | `{ error, currentPlan, upgradeUrl, reason }` / `{ error, required, remaining, purchaseUrl }` |
| 403 | `requireFeature`, `requireWorkspaceLimit`, `requireProfileLimit`, `requireAnalyticsLimit`, `requirePlan` | `{ error, currentPlan, requiredPlan, upgradeHint }` |

---

_Last updated: task 16.1 — Guard scheduling, analytics, and social listening routes_
