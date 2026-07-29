# Queue Health Report

> **Incident Reference:** Deployment `87157d65-44d9-441b-ac0f-72be5f381f0a`
> **Error:** `ReplyError: ERR max requests limit exceeded. Limit: 500000, Usage: 500005`
> **Affected Queues:** Automation Queue (`automation-processing`), Message Queue (`message-processing`)
> **Last Updated:** 2025

---

## 1. Current State

The backend relies on BullMQ for asynchronous processing across **twelve distinct queues**, all sharing a single Upstash Redis instance on the free tier (500,000 requests/month). The queues and their workers are:

| Queue Name | Redis Key | Worker | Concurrency |
|---|---|---|---|
| `metrics-fetch` | `metricsQueue` | `MetricsWorker` | 5 |
| `webhook-process` | `webhookQueue` (metricsQueue.ts) | `MetricsWorker` | 10 |
| `token-refresh` | `tokenRefreshQueue` | `MetricsWorker` | 2 |
| `automation-processing` | `automationQueue` | `AutomationWorker` | 5 |
| `message-processing` | `messageQueue` | `MessageWorker` | 5 |
| `webhook-ingestion` | `webhookQueue` (webhookQueue.ts) | `WebhookWorker` | 50 |
| `post-scheduler` | `postQueue` | `PostWorker` | 3 |
| `post-verifier` | `verifyQueue` | `VerifyWorker` | — |
| `notifications` | `notificationQueue` | `NotificationWorker` | 10 |
| `ai-processing` | `aiQueue` | `AIWorker` | — |
| `social-listening-ingest` | `socialListeningIngestQueue` | `SocialListeningWorker` | — |
| `social-listening-ai` | `socialListeningAIQueue` | `SocialListeningAIWorker` | — |
| `email-queue` | `emailQueue` | `EmailWorker` | — |

In addition, a **separate Redis connection** (`getRateLimitRedisClient`) is used by the rate-limiting middleware, which issues **4 Redis commands per API request** (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE via `multi()`).

---

## 2. Root Cause Analysis

The 500,000 request limit was exhausted by the **compounding effect of multiple high-frequency Redis consumers** operating simultaneously. The primary contributors, ranked by estimated volume, are:

### 2.1 Rate-Limiting Middleware — Highest Volume Driver

**File:** `server/middleware/rate-limiting-working.ts`

Every inbound HTTP request to `/api/*` triggers `getRateLimitInfo()`, which executes an atomic Redis transaction of **4 commands** (ZREMRANGEBYSCORE, ZCARD, ZADD, EXPIRE). Multiple rate-limit tiers are applied per request:

- `globalRateLimiter` — applied to all `/api` routes
- `apiRateLimiter` — applied to authenticated API routes
- `authRateLimiter` — applied to login/register endpoints
- `socialMediaRateLimiter`, `aiRateLimiter`, `dashboardRefreshLimiter`, `webhookRateLimiter`, `automationRateLimiter`, `syncRateLimiter` — applied to specific route groups

A single user request that hits a protected route can trigger **8–16 Redis commands** from rate-limiting alone. At 120 requests/minute per IP in production, a modest 10 concurrent users generates approximately **9,600–19,200 Redis commands per minute**, or **~14–28 million commands per month** — far exceeding the 500,000 limit on its own.

**The rate-limiting system is the single largest Redis consumer and the primary cause of the limit breach.**

### 2.2 BullMQ Worker Heartbeats and Queue Polling

**Files:** `server/workers/*.ts`, `server/queues/metricsQueue.ts`

BullMQ workers maintain active connections and continuously poll their queues for new jobs using Redis blocking commands (`BRPOPLPUSH` / `BLMOVE`). With **12+ active workers** each holding a dedicated IORedis connection, the baseline polling overhead is significant even when no jobs are being processed. Each worker connection generates periodic `PING` keepalives and lock-renewal commands (`SET` with `PX`/`NX`) for every active job.

The `MetricsWorker` alone spawns **three separate workers** (`metricsWorker`, `webhookWorker`, `tokenRefreshWorker`), each with its own dedicated `new IORedis(...)` connection, in addition to the shared `redisConnection` used by the queue producers.

### 2.3 `getQueueStats()` — Expensive Bulk Fetches

**Files:** `server/queues/metricsQueue.ts` (lines 590–630), `server/queues/automationQueue.ts` (lines 55–75), `server/queues/messageQueue.ts` (lines 47–67), `server/queues/postQueue.ts` (lines 185–215)

The `getQueueStats()` methods in `MetricsQueueManager`, `AutomationQueueManager`, `MessageQueueManager`, and `PostSchedulerManager` call the deprecated `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, and `.getDelayed()` methods, which **fetch entire job arrays** from Redis rather than just counts. Each call issues multiple `LRANGE`/`ZRANGE` commands that scan the full job list. If these stats endpoints are polled by a frontend dashboard or health check on any regular interval, they generate a disproportionate number of Redis commands.

### 2.4 Smart Polling — Repeatable Job Overhead

**File:** `server/queues/metricsQueue.ts` — `scheduleSmartPolling()`

`scheduleSmartPolling()` calls `metricsQueue.getRepeatableJobs()` on every invocation to diff existing schedules before adding new ones. `getRepeatableJobs()` issues a `ZRANGE` scan of the repeatable job sorted set. If this is called frequently (e.g., on every workspace wake-up or login), it adds unnecessary overhead. The `wakeUpWorkspace()` method calls `scheduleSmartPolling()` for every connected account on every wake-up event.

### 2.5 `cancelWorkspaceJobs()` / `cancelAccountJobs()` — Full Queue Scans

**File:** `server/queues/metricsQueue.ts` (lines 530–575)

Both `cancelWorkspaceJobs()` and `cancelAccountJobs()` call `metricsQueue.getJobs(['waiting', 'delayed', 'active'])`, which fetches **all jobs in those states** from Redis and then filters in application memory. On a busy queue, this is an O(n) Redis scan that can issue hundreds of `LRANGE` commands per call.

### 2.6 Deep Hibernation Cleanup — Full Queue Scan

**File:** `server/workers/metricsWorker.ts` — `isDeepHibernationCleanup` handler

The daily deep hibernation cleanup calls `mq.getJobs(['waiting', 'delayed', 'prioritized'])` to find and remove stale jobs for inactive workspaces. This fetches the entire job list from Redis in one pass. While it runs only once daily, on a large queue it can issue thousands of Redis commands in a single execution.

### 2.7 Multiple Redundant Redis Connections

**Files:** `server/lib/redis.ts`, `server/queues/metricsQueue.ts`, `server/workers/*.ts`

The application creates **at minimum 5 separate IORedis connections** at startup:
1. `getRedisClient()` — general-purpose client (`server/lib/redis.ts`)
2. `getRedisSubscriber()` — pub/sub subscriber (`server/lib/redis.ts`)
3. `getRateLimitRedisClient()` — rate-limiting fail-fast client (`server/lib/redis.ts`)
4. `redisConnection` — shared BullMQ queue producer connection (`server/queues/metricsQueue.ts`)
5. Per-worker dedicated connections — each worker in `metricsWorker.ts`, `automationWorker.ts`, `messageWorker.ts`, `postWorker.ts` creates its own `new IORedis(...)` instance

Each connection independently issues `AUTH`, `PING`, and keepalive commands. On Upstash, **every command on every connection counts against the request limit**, including connection handshakes.

---

## 3. Metrics

| Metric | Value |
|---|---|
| Upstash Free Tier Limit | 500,000 requests/month |
| Estimated Rate-Limit Commands/Request | 4–16 (depending on route) |
| Active Worker Connections | 12+ |
| Active Queue Producer Connections | 4+ |
| Smart Polling Interval | 80 minutes per account |
| Daily Snapshot Cron | Every hour (`0 * * * *`) |
| Token Hygiene Cron | Every 6 hours |
| Social Listening Trends Cron | Every 2 hours |
| Fallback Post Checks Cron | Every 5 minutes |
| Automation Worker Concurrency | 5 |
| Webhook Worker Concurrency | 50 |

---

## 4. Risk Assessment

- **Immediate Risk (CRITICAL):** The rate-limiting middleware's per-request Redis usage alone is sufficient to exhaust the 500,000 monthly limit under normal production traffic. This is not a spike issue — it is a structural overconsumption problem that will recur every month on the free tier.
- **Automation & Message Queue Failures:** Once the limit is hit, all Redis AUTH commands fail, causing BullMQ workers to lose their connections. The `automationQueue` and `messageQueue` error handlers log `🚨 Automation Queue Error` and `🚨 Message Queue Error` respectively, which matches the observed crash logs exactly.
- **Cascading Failure:** Because all queues share a single Redis instance, hitting the limit disables the entire async processing pipeline simultaneously — not just the automation and message queues.
- **Ghost Jobs:** Repeatable jobs registered before the crash remain in Redis and will resume firing immediately after the instance resets, potentially causing a burst of activity that re-exhausts the limit quickly.
- **Connection Leak Risk:** Workers create new `IORedis` instances without a shared connection pool. If workers are restarted without a clean shutdown, orphaned connections may persist until Upstash's idle timeout.
- **Deadlocks:** The queue system utilizes deterministic `jobId` deduplication. If a job fails and gets locked, it drops out after 3 retries, ensuring the system doesn't infinitely loop on bad payloads.

---

## 5. Prioritized Recommendations

### Priority 1 — Eliminate Per-Request Redis Usage in Rate Limiting (Immediate)

**File:** `server/middleware/rate-limiting-working.ts`

The rate-limiting middleware must not issue Redis commands on every HTTP request. Replace the sliding-window sorted-set implementation with a **fixed-window counter** using a single `INCR` + `PEXPIRE` pattern (2 commands per window, not 4 per request), or switch to an in-memory rate limiter (e.g., `express-rate-limit` with the default memory store) for all non-critical limiters. Reserve Redis-backed rate limiting only for the authentication brute-force limiter where cross-instance consistency is genuinely required.

**Estimated savings:** 60–90% reduction in total Redis commands.

```typescript
// Replace the 4-command sliding window with a 2-command fixed window:
async function getRateLimitInfo(key: string, windowMs: number, max: number) {
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.pexpire(key, windowMs); // Set TTL only on first request
  return { requests: count, blocked: count > max };
}
```

### Priority 2 — Replace `.getWaiting()` / `.getActive()` with Count Methods

**Files:** `server/queues/metricsQueue.ts`, `server/queues/automationQueue.ts`, `server/queues/messageQueue.ts`, `server/queues/postQueue.ts`

Replace all calls to `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, `.getDelayed()` (which return full job arrays) with their count equivalents: `.getWaitingCount()`, `.getActiveCount()`, `.getCompletedCount()`, `.getFailedCount()`, `.getDelayedCount()`. These issue a single `LLEN` or `ZCARD` command instead of a full `LRANGE` scan.

```typescript
// Before (fetches all jobs — O(n) Redis scan):
const waiting = await queue.getWaiting();
return { waiting: waiting.length };

// After (single LLEN command — O(1)):
const waiting = await queue.getWaitingCount();
return { waiting };
```

### Priority 3 — Consolidate Redis Connections

Audit all `new IORedis(...)` instantiations across workers and share a single connection per role (one for queue producers, one for workers via BullMQ's built-in connection sharing). BullMQ supports passing a shared `IORedis` instance to multiple workers. Eliminating 4–6 redundant connections reduces the baseline AUTH/PING overhead by ~30%.

### Priority 4 — Upgrade Upstash Plan or Switch Redis Provider

The free tier's 500,000 request/month limit is insufficient for a production application with active users, background workers, and per-request rate limiting. The **Upstash Pay-as-you-go** plan ($0.20 per 100K commands) or the **Pro 2K** plan ($20/month, 10M commands) should be evaluated. Alternatively, a **dedicated Redis instance** (Railway's Redis plugin, Render Redis, or self-hosted) eliminates per-command billing entirely.

### Priority 5 — Cache `getRepeatableJobs()` Results

**File:** `server/queues/metricsQueue.ts` — `scheduleSmartPolling()`

Cache the result of `metricsQueue.getRepeatableJobs()` in application memory with a short TTL (e.g., 60 seconds). This prevents redundant `ZRANGE` scans when `scheduleSmartPolling()` is called in rapid succession during workspace wake-ups.

### Priority 6 — Reduce Fallback Post Check Frequency

**File:** `server/queues/postQueue.ts` — `scheduleFallbackChecks()`

The fallback check cron runs every 5 minutes (`*/5 * * * *`). Each execution triggers a BullMQ job that scans the database for missed scheduled posts. Increasing this interval to every 15 or 30 minutes reduces cron-related Redis overhead by 66–83% with negligible impact on post scheduling accuracy.

### Priority 7 — Implement a Redis Request Budget Monitor

Add a lightweight background task that periodically queries the Upstash REST API for current usage and emits a warning log (or Sentry alert) when usage exceeds 70% of the monthly limit. This provides early warning before the next limit breach.

---

## 6. Estimated Monthly Redis Request Budget (Current vs. Optimized)

| Source | Current (est.) | After Fixes (est.) |
|---|---|---|
| Rate-limiting middleware (4–16 cmds × all requests) | ~350,000–450,000 | ~20,000–40,000 |
| BullMQ worker heartbeats & polling (12+ workers) | ~60,000–80,000 | ~30,000–40,000 |
| Queue stats (full array fetches) | ~10,000–30,000 | ~1,000–3,000 |
| Smart polling repeatable job diffing | ~5,000–15,000 | ~2,000–5,000 |
| Cron jobs (daily snapshot, token hygiene, etc.) | ~5,000–10,000 | ~5,000–10,000 |
| Connection handshakes (5+ connections) | ~5,000–10,000 | ~2,000–4,000 |
| **Total** | **~435,000–595,000** | **~60,000–102,000** |

Implementing Priority 1 and Priority 2 alone brings estimated monthly usage well within the free tier limit. Implementing all recommendations reduces usage by approximately **80%**, providing substantial headroom for growth.
