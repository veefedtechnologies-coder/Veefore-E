# Bugfix Requirements Document

## Introduction

The server is consuming 745K Redis commands per day with just 1 user on the landing page (not even logged in), causing server crashes when hitting Upstash free tier limit of 500K requests/month. This represents ~515 Redis requests per minute (1 request every 0.11 seconds), which is completely inappropriate for production and will never scale. The system must be optimized to reduce Redis command usage by 80% while preserving ALL existing functionality (Redis, BullMQ, queues, workers, and all features).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a single unauthenticated user visits the landing page THEN the system generates 745K Redis commands per day

1.2 WHEN rate-limiting middleware processes ANY HTTP request on `/api` routes THEN the system executes 4 Redis commands per request (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE)

1.3 WHEN frontend polling occurs THEN the system triggers rate-limiting checks on every poll request, multiplying Redis command usage

1.4 WHEN 12+ BullMQ workers (MetricsWorker with 3 workers, AutomationWorker, MessageWorker, PostWorker, VerifyWorker, WebhookWorker, AIWorker, NotificationWorker, SocialListeningWorker, SocialListeningAIWorker, EmailWorker) start on server boot THEN each worker maintains active Redis connection with continuous polling and PING keepalives

1.5 WHEN worker heartbeat mechanisms run THEN the system generates 60K-80K Redis commands per month from worker polling alone

1.6 WHEN `scheduleSmartPolling()` is called THEN the system invokes `metricsQueue.getRepeatableJobs()` which issues ZRANGE scan of repeatable job sorted set

1.7 WHEN workspace wake-up or user login occurs THEN `scheduleSmartPolling()` is triggered, generating Redis scan operations

1.8 WHEN `cancelWorkspaceJobs()` or `cancelAccountJobs()` is invoked THEN the system calls `metricsQueue.getJobs(['waiting', 'delayed', 'active'])` fetching ALL jobs as arrays (O(n) operation)

1.9 WHEN cancel operations execute full queue scans THEN hundreds of LRANGE commands are issued to Redis

1.10 WHEN `getQueueStats()` is called THEN the system uses `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()` methods that fetch ENTIRE job arrays instead of using count methods

1.11 WHEN the application creates multiple Redis connections THEN the system maintains 5+ separate IORedis connections with independent AUTH, PING, and keepalive commands

1.12 WHEN each worker creates its own `new IORedis(...)` instance THEN connection overhead multiplies, generating 5K-10K commands per month

1.13 WHEN deep hibernation cleanup runs daily THEN the system fetches entire job list from Redis, issuing thousands of commands in a single execution

1.14 WHEN Redis command limit (500K requests/month on Upstash free tier) is exceeded THEN the server crashes and all queues fail simultaneously

### Expected Behavior (Correct)

2.1 WHEN a single unauthenticated user visits the landing page THEN the system SHALL generate under 150K Redis commands per day (80% reduction)

2.2 WHEN rate-limiting middleware processes ANY HTTP request on `/api` routes THEN the system SHALL use a 2-command fixed-window INCR pattern (INCR + EXPIRE) instead of 4-command sliding-window pattern

2.3 WHEN frontend polling occurs THEN the system SHALL continue to enforce rate limits but with optimized Redis operations

2.4 WHEN 12+ BullMQ workers start on server boot THEN the system SHALL reuse shared Redis connections instead of creating individual connections per worker

2.5 WHEN worker heartbeat mechanisms run THEN the system SHALL reduce polling frequency while maintaining worker health monitoring

2.6 WHEN `scheduleSmartPolling()` is called THEN the system SHALL cache `getRepeatableJobs()` results with a short TTL (e.g., 30 seconds) to prevent repeated ZRANGE scans

2.7 WHEN workspace wake-up or user login occurs THEN the system SHALL use cached repeatable jobs data when available

2.8 WHEN `cancelWorkspaceJobs()` or `cancelAccountJobs()` is invoked THEN the system SHALL use targeted job removal by job ID pattern matching instead of fetching all jobs

2.9 WHEN cancel operations execute THEN the system SHALL minimize Redis commands by using key pattern scanning instead of full job array fetches

2.10 WHEN `getQueueStats()` is called THEN the system SHALL use `.getWaitingCount()`, `.getActiveCount()`, `.getCompletedCount()`, `.getFailedCount()` methods (O(1) operations) instead of array fetch methods

2.11 WHEN the application needs Redis connections THEN the system SHALL consolidate to shared connection pool across all workers and services

2.12 WHEN workers initialize THEN the system SHALL reuse existing Redis client instances instead of creating new connections

2.13 WHEN deep hibernation cleanup runs daily THEN the system SHALL use count-based operations and targeted cleanup instead of fetching entire job lists

2.14 WHEN production workload increases THEN the system SHALL remain within Redis free tier limits (under 100K commands/month target) without crashes

### Unchanged Behavior (Regression Prevention)

3.1 WHEN rate-limiting is required THEN the system SHALL CONTINUE TO enforce all rate limit policies (global, auth, API, upload, AI, etc.) with identical limits and behavior

3.2 WHEN BullMQ workers process jobs THEN all 12+ workers SHALL CONTINUE TO function correctly with no change in job processing behavior

3.3 WHEN MetricsWorker processes metrics jobs THEN the system SHALL CONTINUE TO fetch Instagram metrics on the same schedule

3.4 WHEN AutomationWorker, MessageWorker, PostWorker, VerifyWorker, WebhookWorker, AIWorker, NotificationWorker, SocialListeningWorker, SocialListeningAIWorker, EmailWorker process their respective jobs THEN all workers SHALL CONTINUE TO execute their job handlers correctly

3.5 WHEN smart polling schedules repeatable jobs THEN the system SHALL CONTINUE TO create adaptive polling intervals based on account activity (high/medium/low)

3.6 WHEN workspace jobs need to be cancelled THEN the system SHALL CONTINUE TO remove all jobs for the specified workspace

3.7 WHEN account-specific jobs need to be cancelled THEN the system SHALL CONTINUE TO remove all jobs for the specified account

3.8 WHEN queue statistics are requested THEN the system SHALL CONTINUE TO return accurate counts for waiting, active, completed, failed, and delayed jobs

3.9 WHEN Redis becomes unavailable THEN the system SHALL CONTINUE TO use in-memory fallback for rate limiting (existing behavior)

3.10 WHEN deep hibernation cleanup runs THEN the system SHALL CONTINUE TO clean up stale jobs correctly

3.11 WHEN the application uses Redis for any feature THEN the system SHALL CONTINUE TO use Redis (not switch to in-memory solutions)

3.12 WHEN the application uses BullMQ for queues THEN the system SHALL CONTINUE TO use BullMQ (not switch to alternative queue systems)

3.13 WHEN multiple concurrent HTTP requests arrive THEN the system SHALL CONTINUE TO handle them correctly with proper rate limiting

3.14 WHEN OAuth callback endpoints are accessed THEN the system SHALL CONTINUE TO exempt them from rate limiting

3.15 WHEN authentication failures occur THEN the system SHALL CONTINUE TO track brute-force attempts and apply progressive delays

3.16 WHEN rate limit violations occur THEN the system SHALL CONTINUE TO log violations and return 429 status codes with appropriate retry-after headers

## Bug Condition and Property Specification

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SystemState
  OUTPUT: boolean
  
  // Returns true when Redis usage is excessive
  RETURN X.redisCommandsPerDay > 500000 OR X.redisCommandsPerMinute > 350
END FUNCTION
```

### Property Specification - Fix Checking

```pascal
// Property: Redis Command Optimization
FOR ALL X WHERE isBugCondition(X) DO
  result ← optimizeRedisUsage'(X)
  ASSERT result.redisCommandsPerDay <= 150000 
    AND result.redisCommandsPerMinute <= 105
    AND result.rateLimitingWorks = true
    AND result.allWorkersRunning = true
    AND result.allQueuesOperational = true
    AND result.noFeatureLoss = true
END FOR
```

### Property Specification - Preservation Checking

```pascal
// Property: Feature Preservation
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT optimizeRedisUsage(X).features = originalSystem(X).features
    AND optimizeRedisUsage(X).rateLimits = originalSystem(X).rateLimits
    AND optimizeRedisUsage(X).workerBehavior = originalSystem(X).workerBehavior
    AND optimizeRedisUsage(X).queueBehavior = originalSystem(X).queueBehavior
END FOR
```

### Counterexample

**Concrete example demonstrating the bug:**

```typescript
// System State: 1 unauthenticated user on landing page
const systemState = {
  authenticatedUsers: 0,
  landingPageVisitors: 1,
  redisCommandsPerDay: 745000,
  redisCommandsPerMinute: 515,
  upstashFreeTierLimit: 500000 / 30, // ~16,666 per day
  result: 'CRASH - Redis limit exceeded'
};

// After Fix:
const optimizedState = {
  authenticatedUsers: 0,
  landingPageVisitors: 1,
  redisCommandsPerDay: 100000, // 80% reduction
  redisCommandsPerMinute: 70,
  upstashFreeTierLimit: 500000 / 30,
  result: 'SUCCESS - Within limits, all features working'
};
```

## Optimization Targets by Root Cause

| Root Cause | Current Usage | Target Usage | Optimization Method |
|------------|---------------|--------------|---------------------|
| Rate-Limiting Middleware | 350K-450K/month | 175K-225K/month | Switch to 2-command INCR pattern |
| BullMQ Worker Heartbeats | 60K-80K/month | 20K-30K/month | Reduce polling frequency, share connections |
| Queue Stats Methods | 10K-30K/month | 2K-5K/month | Use count methods instead of array fetches |
| Multiple Redis Connections | 5K-10K/month | 1K-2K/month | Consolidate to shared connection pool |
| Smart Polling Overhead | 5K-15K/month | 1K-3K/month | Cache getRepeatableJobs() results |
| Full Queue Scans | Variable | 50% reduction | Use targeted job removal by pattern |
| Deep Hibernation Cleanup | High per-execution | 50% reduction | Use count-based operations |
| **Unused Workers (see below)** | **Variable** | **0 (lazy initialization)** | **Start workers only when needed** |
| **TOTAL** | **745K/day** | **<150K/day (80% reduction)** | **Optimization not deletion** |

## Unused Features Consuming Resources

### Workers Running But Never Processing Jobs

**Analysis Result:** The following workers/queues are initialized on server boot and maintain Redis connections with continuous polling/heartbeats, but are never used:

1.15 WHEN AIWorker starts THEN the system consumes Redis resources for a worker that processes `ai-processing` queue jobs

1.16 WHEN AIQueueManager.addJob() is called THEN it should add jobs to the queue, BUT this method is **NEVER called anywhere in the codebase**

1.17 WHEN NotificationWorker starts THEN the system consumes Redis resources for a worker that processes `notifications` queue jobs

1.18 WHEN NotificationQueueManager.sendNotification() is called THEN it should add jobs to the queue, BUT this method is **NEVER called anywhere in the codebase**

1.19 WHEN SocialListeningWorker and SocialListeningAIWorker start THEN the system consumes Redis resources for workers processing social listening jobs

1.20 WHEN SocialListeningQueueManager methods are called THEN they should add jobs to the queue, BUT these methods are **NEVER called anywhere in the codebase**

1.21 WHEN WebhookWorker starts THEN the system consumes Redis resources, BUT webhooks are processed **SYNCHRONOUSLY** in the route handler via `processWebhookEntry()` instead of being queued

1.22 WHEN WebhookQueueManager.addWebhookEvent() exists THEN it should queue webhook events, BUT this method is **NEVER called** - webhooks bypass the queue entirely

### Expected Behavior for Unused Workers

2.15 WHEN AIWorker is needed for competitor analysis THEN the system SHALL use lazy initialization - only start the worker when first job is queued

2.16 WHEN NotificationWorker is needed THEN the system SHALL use lazy initialization - only start the worker when first notification is sent

2.17 WHEN SocialListeningWorker and SocialListeningAIWorker are needed THEN the system SHALL use lazy initialization - only start when first listening job is created

2.18 WHEN WebhookWorker is needed THEN the system SHALL either (a) start using the queue for async webhook processing OR (b) remove the unused worker entirely if synchronous processing is preferred

2.19 WHEN server boots with zero active workspaces THEN the system SHALL NOT start any workers consuming Redis resources

2.20 WHEN first job needs processing THEN the system SHALL initialize the required worker on-demand

### Unchanged Behavior for Unused Workers

3.17 WHEN AIWorker is eventually needed in the future THEN the system SHALL CONTINUE TO process competitor analysis jobs correctly

3.18 WHEN NotificationWorker is eventually needed THEN the system SHALL CONTINUE TO broadcast notifications via RealtimeService

3.19 WHEN SocialListeningWorker is eventually used THEN the system SHALL CONTINUE TO ingest social listening data

3.20 WHEN webhook processing switches to async queue-based THEN the system SHALL CONTINUE TO process webhook events correctly

3.21 WHEN lazy initialization is implemented THEN worker functionality SHALL remain identical, only timing of initialization changes
