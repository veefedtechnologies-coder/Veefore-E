# Cache Performance Report

## 1. Current State
Caching is natively integrated at multiple levels:
- **Database Caching:** MongoDB's `SocialAccount` and `Metrics` collections act as the primary cache layer for the frontend, entirely bypassing direct Meta API lookups.
- **Queue State:** Redis (via BullMQ) acts as the high-speed caching engine for webhook ingestion and task deduplication.
- **Rate Limit Tracking:** Centralized token rate-limits and backoffs are persisted in memory/Redis via `TokenManager`.

## 2. Metrics
- **Cache Misses for Dashboards:** Negligible. 100% of standard dashboard loads are served directly from the DB layer.
- **API Deduplication Hits:** High. Rapid, duplicate incoming webhooks from Meta for the same `commentId` or `mediaId` hit the BullMQ queue and are immediately dropped as duplicates based on their deterministic `jobId`.
- **Token Cache Refresh:** Handled automatically in the background by `metricsWorker.ts` and `TokenManager`.

## 3. Bottlenecks
- **Stale Dashboard Artifacts:** Without WebSockets correctly forwarding events to the frontend UI, users might observe "stale" data (data cached in the DB that hasn't populated to their active browser tab). However, `RealtimeService` currently broadcasts these updates to `workspace:${workspaceId}`, meaning active clients see updates instantly.
- **In-Memory Volatility:** Without `REDIS_URL`, rate-limit state and token caching are stored in Node.js volatile memory, meaning limits are reset if the server restarts.

## 4. Risk Assessment
- **Memory Leak Risks:** BullMQ `removeOnComplete` and `removeOnFail` limits (e.g., keeping only the last 100-500 jobs) strictly cap Redis memory usage.
- **Cache Stampede Risks:** Eliminated. The transition from 5 concurrent smart-polling jobs to 1 consolidated `fetch-metrics` job ensures the system does not bombard the Meta API or the local DB during cache invalidation.

## 5. Recommendations
- **Redis Requirement:** Enforce `REDIS_URL` as a strict requirement for staging and production environments to prevent volatile memory loss of rate-limiting contexts.
- **React Query/SWR Integration:** Completed (Phase 8). Verified that the React frontend utilizes React Query with a standardized `staleTime` of 5 minutes (`300000ms`) and disabled `refetchOnMount` across core hooks (`usePerformanceData`, `useSocialAccounts`, `useUser`) to prevent duplicate fetching when navigating between dashboard tabs.
