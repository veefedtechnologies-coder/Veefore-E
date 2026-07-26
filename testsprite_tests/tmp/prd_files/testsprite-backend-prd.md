# Veefore Backend API — Product Requirements Document (PRD)

## 1. Overview

Veefore is a social-media management platform. This PRD scopes the **backend
Express API** that powers the web client, with emphasis on the Instagram
analytics + smart-polling subsystem. The backend is a Node.js/Express server
(TypeScript, ESM) backed by MongoDB (Mongoose), Redis, and BullMQ for background
jobs. It integrates with the Instagram Graph API through a rate-limit-governed
HTTP client.

- **Runtime:** Node.js, Express 4
- **Base URL (local):** `http://localhost:3000`
- **Data stores:** MongoDB (Mongoose), Redis (BullMQ queues, caching)
- **Auth:** Firebase ID token presented as `Authorization: Bearer <token>`
- **Background jobs:** BullMQ workers for metrics polling, token hygiene, snapshots

## 2. Goals

1. Provide reliable, rate-limit-safe synchronization of Instagram analytics
   (followers, account insights, per-post insights) into the platform.
2. Expose authenticated REST endpoints for the web client to read social
   accounts, analytics, and polling status.
3. Expose unauthenticated operational endpoints (health checks) for
   load balancers and monitoring.
4. Enforce authentication and workspace isolation on all user-scoped data.

## 3. Authentication & Authorization

- **Scheme:** Bearer token in the `Authorization` header.
- **Token type:** Firebase ID token (JWT), verified via Firebase Admin
  `verifyIdToken()`. Tokens expire ~1 hour after issuance.
- **Behavior:**
  - Missing/empty `Authorization` header → `401 Unauthorized`.
  - Malformed JWT (not 3 parts) → `401 Invalid token format`.
  - Valid token with no matching user → a user record is created on the fly.
  - State-changing cookie-based requests additionally require a valid CSRF
    token (`x-csrf-token` header matching the `csrf_token` cookie), else
    `403 CSRF_REQUIRED` / `403 INVALID_CSRF`.
- **Authorization:** User-scoped resources are isolated by workspace; a user may
  only access workspaces they belong to.

## 4. Functional Requirements — API Endpoints

### 4.1 Health & Operational (Unauthenticated)
- `GET /api/health` — returns `{ status: "healthy", ... }` with HTTP 200.
- `GET /health` — enterprise health-check routes (liveness/readiness) for load
  balancers. Returns 200 when the service is healthy.
- **Acceptance:** Both endpoints respond 200 without any `Authorization` header.

### 4.2 Instagram Polling Status (Authenticated)
- `GET /api/instagram/polling-status` — returns the active smart-polling
  cadence for the connected account(s): per-data-type timers (account insights,
  recent post insights, new-post detection, follower count) and the story queue.
- **Acceptance:**
  - Without a valid token → 401.
  - With a valid token → 200 and a JSON body describing distinct polling timers
    (not a single static value).

### 4.3 Social Accounts (Authenticated)
- Endpoints to list and read connected social accounts for the user's
  workspace, including follower counts and last-sync timestamps.
- **Acceptance:** 401 without token; 200 + account list with a valid token,
  scoped to the caller's workspace only.

### 4.4 Analytics (Authenticated)
- Endpoints returning aggregated workspace analytics (followers, posts,
  engagement, reach) derived from stored Instagram content + metrics.
- **Acceptance:** 401 without token; 200 + analytics payload with a valid token.

## 5. Smart Polling Subsystem (Background Behavior)

The polling subsystem schedules four independent BullMQ repeatable jobs per
connected Instagram account, each on its own cadence:

| Job | Metric type | Fetches | Cadence driver |
|-----|-------------|---------|----------------|
| Account insights | `reach` | profile + account insights | ceiling-based |
| Recent post insights | `likes` | profile + media list + batched per-post insights | age-bucket of newest post |
| New-post detection | `new_posts` | profile + media list only (no per-post insights) | ceiling-scaled detection interval |
| Follower count | `followers` | profile only | ceiling-based |

Key correctness rules:
1. **Per-post age buckets:** a post's insights are refreshed when the time since
   its last fetch ≥ the age-bucket interval for its own age (0–48h hourly,
   48h–7d every 6h, 7–30d daily, 30d+ weekly), scaled by ceiling
   (HIGH ×1.0, LOW ×2.0).
2. **6-month cutoff:** posts older than 6 months are never insight-polled.
3. **Batching:** per-post insights for all due posts are fetched in a single
   Facebook Batch API request (up to 50 posts per call).
4. **New-post detection is media-list-only:** it must NOT trigger per-post
   insight fetches; newly discovered posts are persisted and picked up by the
   recent-post-insights job on the next cycle.
5. **Rate-limit governance:** all Instagram Graph calls route through a governed
   HTTP client that respects usage tiers; at RESTRICTED/CRITICAL usage, insight
   fetches are skipped.

## 6. Non-Functional Requirements

- **Rate limiting:** API requests are rate-limited per the rate-limiting
  middleware; excessive requests receive `429`.
- **Security:** Helmet headers, CSRF protection for cookie auth, workspace
  isolation, encrypted social tokens at rest.
- **Resilience:** External Instagram calls are best-effort (profile is
  mandatory; insights/media failures degrade gracefully without failing the
  whole sync).
- **Observability:** Structured logging (pino); BullMQ board for queue
  inspection.

## 7. Error Handling Contract

- `401 Unauthorized` — missing/invalid/expired token.
- `403 Forbidden` — CSRF failure or cross-workspace access attempt.
- `404 Not Found` — unknown resource.
- `429 Too Many Requests` — rate limit exceeded.
- `500 Internal Server Error` — unexpected server error (should be rare; most
  external failures are handled gracefully).

## 8. Out of Scope (for this test pass)

- Frontend/UI flows (separate test scope).
- Third-party OAuth connect flows requiring live Instagram/Meta credentials.
- Payment/billing provider webhooks.
