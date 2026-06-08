# Implementation Plan

## Overview

This implementation plan achieves an 80% reduction in Redis commands (745K/day → <150K/day) while preserving ALL functionality through 6 risk-ordered phases. Each phase includes verification steps to ensure no regressions.

**Implementation Strategy**: Low-risk optimizations first (connection pooling, queue stats), then medium-risk (lazy workers, caching), finally high-risk (rate limiting) with feature flag protection.

---

## Phase 0: Baseline Measurement & Bug Exploration

- [x] 1. Measure baseline Redis usage on UNFIXED code
  - **Property 1: Bug Condition** - Excessive Redis Command Usage
  - **CRITICAL**: This measurement confirms the bug exists - high command usage is EXPECTED
  - **DO NOT attempt to fix anything yet - this is pure observation**
  - **GOAL**: Document counterexamples proving Redis usage exceeds sustainable limits
  - Deploy current unfixed code to staging/production environment
  - Monitor Redis command metrics for 24 hours with 1 unauthenticated user on landing page
  - Use Redis MONITOR command or Upstash dashboard to track command types and frequencies
  - **Test 1.1**: Count total Redis commands in 24 hours (expected: ~745K commands/day)
  - **Test 1.2**: Measure commands per minute (expected: ~515 commands/minute)
  - **Test 1.3**: Simulate 100 API requests, count ZREMRANGEBYSCORE+ZCARD+ZADD+EXPIRE commands (expected: 400 total = 4 per request)
  - **Test 1.4**: Check active Redis connections via `redis-cli CLIENT LIST` (expected: 5+ connections)
  - **Test 1.5**: Call `/api/admin/queue-stats` endpoint, monitor LRANGE commands (expected: multiple LRANGE fetching job arrays)
  - **Test 1.6**: Check BullMQ worker logs on server boot (expected: 5 unused workers start: AI, Notification, SocialListening x2, Webhook)
  - **Test 1.7**: Trigger workspace wake-up, monitor ZRANGE commands for repeatable jobs scan (expected: ZRANGE on every wake-up)
  - **EXPECTED COUNTEREXAMPLES**:
    - Rate-limiting generates 4 Redis commands per HTTP request (not optimal 2 commands)
    - Multiple independent Redis connections maintain separate AUTH+PING overhead (5+ connections not optimal 2)
    - Queue stats fetch entire job arrays via LRANGE (O(n) operation not optimal O(1))
    - Five workers run idle with active connections consuming resources
    - Repeatable jobs scanned repeatedly without caching (ZRANGE on every call)
  - Document findings in table format:
    ```
    | Metric | Measured Value | Expected Bug Value | Status |
    |--------|----------------|-------------------|---------|
    | Total commands/day | [MEASURED] | ~745K | ✓ Bug Confirmed |
    | Commands/minute | [MEASURED] | ~515 | ✓ Bug Confirmed |
    | Rate-limit cmds/request | [MEASURED] | 4 | ✓ Bug Confirmed |
    | Active connections | [MEASURED] | 5+ | ✓ Bug Confirmed |
    | Queue stats uses LRANGE | [MEASURED] | Yes | ✓ Bug Confirmed |
    | Unused workers running | [MEASURED] | 5 | ✓ Bug Confirmed |
    | Repeatable jobs caching | [MEASURED] | No | ✓ Bug Confirmed |
    ```
  - Mark task complete when baseline metrics are documented and bug is confirmed
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

- [x] 2. Document preservation baseline on UNFIXED code
  - **Property 2: Preservation** - All Functionality Works on Unfixed Code
  - **IMPORTANT**: Run preservation tests BEFORE implementing optimizations to establish baseline
  - **GOAL**: Record current behavior to verify optimizations don't break anything
  - **Preservation Test 2.1**: Send 120 requests/minute from single IP, verify 121st request blocked with 429 status (rate limiting works)
  - **Preservation Test 2.2**: Queue metrics fetch job, verify MetricsWorker processes and fetches Instagram data (worker job processing works)
  - **Preservation Test 2.3**: Get queue stats via API, verify accurate counts returned (queue operations work)
  - **Preservation Test 2.4**: Call smart polling schedule, verify repeatable jobs created correctly (scheduling works)
  - **Preservation Test 2.5**: Stop Redis, verify in-memory fallback for rate limiting activates (Redis failover works)
  - **Preservation Test 2.6**: Send requests to OAuth callback endpoints, verify NOT rate limited (exemptions work)
  - **Preservation Test 2.7**: Verify rate limit headers present (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
  - **EXPECTED OUTCOME**: All preservation tests PASS on unfixed code (confirms baseline functionality to preserve)
  - Document all test results in table format:
    ```
    | Preservation Test | Result | Details |
    |------------------|---------|----------|
    | Rate limiting enforcement | [PASS/FAIL] | 121st request blocked correctly |
    | Worker job processing | [PASS/FAIL] | MetricsWorker fetched data |
    | Queue stats accuracy | [PASS/FAIL] | Counts match actual queue state |
    | Smart polling schedules | [PASS/FAIL] | Repeatable jobs created |
    | Redis failover | [PASS/FAIL] | In-memory fallback activated |
    | OAuth exemptions | [PASS/FAIL] | Callbacks not rate limited |
    | Rate limit headers | [PASS/FAIL] | All headers present and correct |
    ```
  - Mark task complete when all preservation tests pass and baseline behavior is documented
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16_

---

## Phase 1: Connection Pooling (Low Risk - 60% Reduction in Connection Overhead)

- [ ] 3. Implement shared Redis connection pool

  - [x] 3.1 Add shared connection functions to server/lib/redis.ts
    - Create `getSharedRedisConnection()` function returning singleton Redis connection for all BullMQ workers
    - Create `getSharedRedisSubscriber()` function returning singleton Redis subscriber for BullMQ event subscriptions
    - Add module-level variables: `sharedWorkerConnection: Redis | null = null` and `sharedWorkerSubscriber: Redis | null = null`
    - Initialize connections with `maxRetriesPerRequest: null` for BullMQ compatibility
    - Add documentation comments explaining connection strategy: shared worker connection, shared subscriber, separate fail-fast rate-limit connection
    - Export new functions for worker consumption
    - _Bug_Condition: systemState.separateRedisConnections > 2 (5+ connections per worker file)_
    - _Expected_Behavior: All workers use 2 shared connections (1 worker connection + 1 subscriber)_
    - _Preservation: Rate-limit connection remains separate for fault isolation_
    - _Requirements: 2.4, 2.11, 2.12_

  - [x] 3.2 Update server/queues/metricsQueue.ts to use shared connection
    - Remove `initializeRedisConnection()` function and local `redisConnection` initialization
    - Import: `import { getSharedRedisConnection } from '../lib/redis'`
    - Replace local `redisConnection` variable with: `const redisConnection = getSharedRedisConnection()`
    - Verify all queue initialization uses shared connection
    - _Bug_Condition: Each queue file creates new IORedis instance_
    - _Expected_Behavior: All queues share single connection from pool_
    - _Requirements: 2.4, 2.11_

  - [ ] 3.3 Update server/queues/automationQueue.ts to use shared connection
    - Replace: `import { redisConnection } from './metricsQueue'` with `import { getSharedRedisConnection } from '../lib/redis'`
    - Update queue initialization: `const redisConnection = getSharedRedisConnection()`
    - Verify automation queue operations work with shared connection
    - _Requirements: 2.4, 2.11_

  - [ ] 3.4 Update server/queues/messageQueue.ts to use shared connection
    - Replace: `import { redisConnection } from './metricsQueue'` with `import { getSharedRedisConnection } from '../lib/redis'`
    - Update queue initialization: `const redisConnection = getSharedRedisConnection()`
    - Verify message queue operations work with shared connection
    - _Requirements: 2.4, 2.11_

  - [ ] 3.5 Update server/queues/postQueue.ts to use shared connection
    - Replace: `import { redisConnection } from './metricsQueue'` with `import { getSharedRedisConnection } from '../lib/redis'`
    - Update queue initialization: `const redisConnection = getSharedRedisConnection()`
    - Verify post queue operations work with shared connection
    - _Requirements: 2.4, 2.11_

  - [ ] 3.6 Verify Phase 1 connection pooling works correctly
    - **Property 1: Expected Behavior** - Connection Count Reduced
    - **IMPORTANT**: Re-run verification tests to confirm optimization works
    - Run: `redis-cli CLIENT LIST` and count active connections (expected: 2 connections instead of 5+)
    - Monitor AUTH+PING command frequency (expected: 60% reduction from baseline)
    - Test: Queue 10 metrics jobs, verify all process correctly using shared connection
    - Test: Queue jobs to automation, message, post queues simultaneously, verify no connection race conditions
    - Test: Verify all queue stats endpoints still return accurate data
    - Expected command reduction: 5K-10K commands/month → 2K-4K commands/month (40-60% reduction in connection overhead)
    - Document results and mark complete when connection count drops to 2 and all queues work correctly
    - _Requirements: 2.4, 2.11, 2.12_

  - [ ] 3.7 Verify Phase 1 preservation - all functionality unchanged
    - **Property 2: Preservation** - Queue Operations Unchanged
    - **IMPORTANT**: Re-run SAME preservation tests from task 2
    - Re-run Preservation Test 2.2: Queue metrics fetch job, verify MetricsWorker processes correctly (unchanged)
    - Re-run Preservation Test 2.3: Get queue stats via API, verify accurate counts (unchanged)
    - Re-run Preservation Test 2.4: Call smart polling schedule, verify repeatable jobs created (unchanged)
    - **EXPECTED OUTCOME**: All preservation tests still PASS (confirms no regressions)
    - Document any differences from baseline (there should be NONE)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

---

## Phase 2: Queue Stats Optimization (Low Risk - 90% Reduction in Stats Overhead)

- [ ] 4. Replace O(n) array fetches with O(1) count methods

  - [ ] 4.1 Update MetricsQueueManager.getQueueStats() in server/queues/metricsQueue.ts
    - Replace `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, `.getDelayed()` with count methods
    - Update to:
      ```typescript
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        metricsQueue.getWaitingCount(),
        metricsQueue.getActiveCount(),
        metricsQueue.getCompletedCount(),
        metricsQueue.getFailedCount(),
        metricsQueue.getDelayedCount(),
      ]);
      ```
    - Remove `.length` calls since counts are now numbers not arrays
    - Update return type to return numbers instead of arrays
    - _Bug_Condition: systemState.queueStatsUsesArrayMethods = true (LRANGE fetches entire job arrays)_
    - _Expected_Behavior: Queue stats use O(1) count operations instead of O(n) array fetches_
    - _Preservation: Stats accuracy unchanged, counts match previous array.length values_
    - _Requirements: 2.10_

  - [ ] 4.2 Update AutomationQueueManager.getQueueStats() in server/queues/automationQueue.ts
    - Replace `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, `.getDelayed()` with count methods
    - Use same pattern as metricsQueue: `await automationQueue.getWaitingCount()` etc.
    - Update return statement to return numbers instead of array lengths
    - _Requirements: 2.10_

  - [ ] 4.3 Update MessageQueueManager.getQueueStats() in server/queues/messageQueue.ts
    - Replace `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, `.getDelayed()` with count methods
    - Use same pattern: `await messageQueue.getWaitingCount()` etc.
    - Update return statement to return numbers instead of array lengths
    - _Requirements: 2.10_

  - [ ] 4.4 Update PostSchedulerManager.getQueueStats() in server/queues/postQueue.ts
    - Replace `.getWaiting()`, `.getActive()`, `.getCompleted()`, `.getFailed()`, `.getDelayed()` with count methods
    - Use same pattern: `await postQueue.getWaitingCount()` etc.
    - Update return statement to return numbers instead of array lengths
    - _Requirements: 2.10_

  - [ ] 4.5 Verify Phase 2 queue stats optimization works correctly
    - **Property 1: Expected Behavior** - Stats Use O(1) Operations
    - Monitor LRANGE command frequency on stats endpoints (expected: 90% reduction from baseline)
    - Test: Call `/api/admin/queue-stats` 10 times, verify no LRANGE commands issued (use Redis MONITOR)
    - Test: Compare count results with actual queue state by queuing known number of jobs then checking stats
    - Test: Queue 5 jobs, call getQueueStats(), verify returns waiting=5
    - Test: Process 3 jobs, call getQueueStats(), verify returns active=3, waiting=2
    - Test: Verify queue stats in admin dashboard display correctly
    - Expected command reduction: 10K-30K commands/month → 2K-5K commands/month (80-90% reduction in stats overhead)
    - Document results showing LRANGE eliminated and counts accurate
    - _Requirements: 2.10_

  - [ ] 4.6 Verify Phase 2 preservation - stats accuracy unchanged
    - **Property 2: Preservation** - Stats Return Accurate Counts
    - Re-run Preservation Test 2.3: Get queue stats via API, verify accurate counts match actual queue state
    - Test: Queue known number of jobs (10), verify stats show waiting=10
    - Test: Process half the jobs (5), verify stats show active=5 or completed=5 depending on timing
    - Test: Compare new count-based stats with old array-based stats (should be identical)
    - **EXPECTED OUTCOME**: Stats accuracy unchanged, counts match baseline behavior
    - Document that count methods return same values as previous array.length approach
    - _Requirements: 3.8_

---

## Phase 3: Lazy Worker Initialization (Medium Risk - 100% Elimination of Idle Worker Overhead)

- [ ] 5. Convert unused workers to lazy initialization pattern

  - [ ] 5.1 Convert server/workers/aiWorker.ts to lazy initialization
    - Add module-level variable: `let aiWorker: Worker | null = null`
    - Change `export const startAIWorker = () => { ... }` to `export const getAIWorker = (): Worker | null => { ... }`
    - Implement lazy initialization:
      ```typescript
      export const getAIWorker = (): Worker | null => {
        if (!aiWorker && redisAvailable) {
          console.log('🧠 Lazy-initializing AI Worker on first use...');
          aiWorker = new Worker<AIJobData>('ai-processing', handler, options);
        }
        return aiWorker;
      };
      ```
    - _Bug_Condition: systemState.unusedWorkersRunning > 0 (5 workers start on boot but process zero jobs)_
    - _Expected_Behavior: Unused workers only start when first job is queued_
    - _Preservation: Worker functionality unchanged when eventually initialized_
    - _Requirements: 2.15, 2.19, 2.20_

  - [ ] 5.2 Convert server/workers/notificationWorker.ts to lazy initialization
    - Add module-level variable: `let notificationWorker: Worker | null = null`
    - Change to `export const getNotificationWorker = (): Worker | null => { ... }`
    - Implement lazy initialization pattern with log: '📢 Lazy-initializing Notification Worker on first use...'
    - _Requirements: 2.16, 2.19, 2.20_

  - [ ] 5.3 Convert server/workers/social-listening.worker.ts to lazy initialization
    - Add module-level variable: `let socialListeningWorker: Worker | null = null`
    - Change to `export const getSocialListeningWorker = (): Worker | null => { ... }`
    - Implement lazy initialization pattern with log: '👂 Lazy-initializing Social Listening Worker on first use...'
    - _Requirements: 2.17, 2.19, 2.20_

  - [ ] 5.4 Convert server/workers/social-listening-ai.worker.ts to lazy initialization
    - Add module-level variable: `let socialListeningAIWorker: Worker | null = null`
    - Change to `export const getSocialListeningAIWorker = (): Worker | null => { ... }`
    - Implement lazy initialization pattern with log: '🤖 Lazy-initializing Social Listening AI Worker on first use...'
    - _Requirements: 2.17, 2.19, 2.20_

  - [ ] 5.5 Convert server/workers/webhookWorker.ts to lazy initialization
    - Add module-level variable: `let webhookWorker: Worker | null = null`
    - Change to `export const getWebhookWorker = (): Worker | null => { ... }`
    - Implement lazy initialization pattern with log: '🪝 Lazy-initializing Webhook Worker on first use...'
    - Note: Investigate if webhook processing should use queue (async) or remain synchronous - document decision
    - _Requirements: 2.18, 2.19, 2.20_

  - [ ] 5.6 Update server/index.ts to remove eager worker starts
    - Keep active workers: `initEmailWorker()`, `AutomationWorker.start()`, `MessageWorker.start()`, `PostWorker.start()`, `VerifyWorker.start()`, MetricsWorker
    - Remove or comment out: `startWebhookWorker()`, `startAIWorker()`, `startNotificationWorker()`, `startSocialListeningWorker()`, `startSocialListeningAIWorker()`
    - Add log statement: `console.log('[INFRA] Active workers initialized. Unused workers (AI, Notification, SocialListening, Webhook) will lazy-initialize on first job.')`
    - Keep rate limiting initialization unchanged
    - _Requirements: 2.19_

  - [ ] 5.7 Update queue managers to trigger lazy initialization (if queue manager files exist)
    - Check if server/queues/aiQueue.ts exists, if so update `addJob()` method to call `getAIWorker()` before adding job
    - Check if server/queues/notificationQueue.ts exists, update to call `getNotificationWorker()` before adding job
    - Check if server/queues/socialListeningQueue.ts exists, update to call `getSocialListeningWorker()` before adding job
    - Check if server/queues/webhookQueue.ts exists, update to call `getWebhookWorker()` before adding job
    - Pattern:
      ```typescript
      static async addJob(jobData): Promise<boolean> {
        const worker = getAIWorker(); // Triggers lazy init
        if (!worker || !aiQueue) return false;
        await aiQueue.add('process-ai', jobData);
        return true;
      }
      ```
    - _Requirements: 2.20_

  - [ ] 5.8 Verify Phase 3 lazy initialization works correctly
    - **Property 1: Expected Behavior** - Unused Workers Don't Start on Boot
    - Restart server, check logs on startup (expected: NO logs for AI, Notification, SocialListening, Webhook workers)
    - Run: `redis-cli CLIENT LIST` and count connections (expected: connection count stays at 2, no increase from unused workers)
    - Verify active workers (Email, Automation, Message, Post, Verify, Metrics) still appear in logs and function correctly
    - Test: If AI job is queued in future, verify AI worker starts with lazy initialization log
    - Monitor BullMQ polling commands from unused workers (expected: 0 commands since workers not running)
    - Expected command reduction: Variable/month → 0/month (100% elimination of idle worker overhead)
    - Document that unused workers no longer consume Redis resources on server boot
    - _Requirements: 2.15, 2.16, 2.17, 2.18, 2.19, 2.20_

  - [ ] 5.9 Verify Phase 3 preservation - worker functionality unchanged when used
    - **Property 2: Preservation** - Workers Function Correctly When Initialized
    - Test: If/when AI job is queued, verify AIWorker (lazy-initialized) processes job correctly
    - Test: If notification is queued, verify NotificationWorker (lazy-initialized) broadcasts correctly via RealtimeService
    - Test: Active workers (Automation, Message, Post, Verify, Metrics) continue processing jobs with no change in behavior
    - Re-run Preservation Test 2.2: Queue metrics fetch job, verify MetricsWorker still processes correctly
    - **EXPECTED OUTCOME**: Worker functionality identical to baseline, only timing of initialization changes
    - Document that lazy initialization adds <500ms delay for first job but functionality unchanged
    - _Requirements: 3.2, 3.3, 3.4, 3.17, 3.18, 3.19, 3.20, 3.21_

---

## Phase 4: Rate-Limiting Optimization (High Risk - 50% Reduction in Rate-Limiting Overhead)

⚠️ **CRITICAL**: This phase affects ALL HTTP requests. Extensive testing required before deployment.

- [ ] 6. Replace sliding-window rate limiting with fixed-window INCR pattern

  - [ ] 6.1 Implement fixed-window INCR pattern in server/middleware/rate-limiting-working.ts
    - Locate `getRateLimitInfo()` function
    - Replace sliding-window sorted-set implementation (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE) with fixed-window INCR pattern
    - Remove: `transaction.zremrangebyscore(key, 0, windowStart)`
    - Remove: `transaction.zcard(key)`
    - Remove: `transaction.zadd(key, now, \`${now}-${Math.random()}\`)`
    - Replace with Lua script for atomic INCR + conditional EXPIRE:
      ```lua
      local key = KEYS[1]
      local windowMs = ARGV[1]
      local count = redis.call('INCR', key)
      if count == 1 then
        redis.call('PEXPIRE', key, windowMs)
      end
      return count
      ```
    - OR use GET + INCR + EXPIRE pattern with race condition handling
    - Update rate limit info calculation to use count from INCR result
    - _Bug_Condition: systemState.rateLimitCommandsPerRequest > 2 (4 commands per request with sliding-window)_
    - _Expected_Behavior: Rate limiting uses 2 commands per request (INCR + EXPIRE)_
    - _Preservation: All rate limit policies enforce with identical limits, in-memory fallback unchanged_
    - _Requirements: 2.2, 2.3_

  - [ ] 6.2 Add feature flag for rate-limiting algorithm toggle (RECOMMENDED)
    - Add environment variable: `RATE_LIMIT_ALGORITHM=fixed-window` (default) or `sliding-window`
    - Wrap rate limiting logic in conditional: if fixed-window use INCR pattern, else use sliding-window
    - Allows instant rollback by changing environment variable if issues arise
    - Document feature flag in rate-limiting-working.ts comments
    - _Requirements: 2.2_

  - [ ] 6.3 Preserve rate limit semantics and headers
    - Ensure X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers calculated correctly with fixed-window
    - Fixed-window reset time = start of current window + windowMs
    - Update header calculation to use count from INCR result
    - Keep all existing rate limit configurations unchanged (global 120/min, auth 10/15min, API dynamic, upload 5/min, AI 10/5min)
    - _Requirements: 2.2, 2.3_

  - [ ] 6.4 Maintain in-memory fallback for Redis unavailability
    - Keep `localRateLimitStore` logic completely unchanged
    - Verify fallback activates when Redis unavailable (same behavior as baseline)
    - No changes to fallback activation logic, only to Redis rate limiting when available
    - _Requirements: 2.3_

  - [ ] 6.5 Verify Phase 4 rate limiting optimization works correctly - Basic Tests
    - **Property 1: Expected Behavior** - Rate Limiting Uses 2 Commands Per Request
    - Start Redis MONITOR to track commands
    - Send 10 API requests, count Redis commands (expected: 20 commands total = 2 per request, down from 40)
    - Verify commands are INCR + EXPIRE (or Lua EVAL), NOT ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE
    - Test: Send 119 requests, verify all succeed with 200 status
    - Test: Send 120th request, verify succeeds (at limit)
    - Test: Send 121st request, verify blocked with 429 status and Retry-After header
    - Test: Wait for window to expire, send new request, verify succeeds (limit reset)
    - Expected command reduction: 350K-450K commands/month → 175K-225K commands/month (50% reduction)
    - Document command count per request drops from 4 to 2
    - _Requirements: 2.2, 2.3_

  - [ ] 6.6 Verify Phase 4 rate limiting optimization works correctly - Advanced Tests
    - **Property 1: Expected Behavior** - All Rate Limit Policies Work
    - Test: Auth rate limiting - 10 auth attempts in 15 minutes, verify 11th blocked
    - Test: Upload rate limiting - 5 upload requests in 1 minute, verify 6th blocked
    - Test: AI rate limiting - 10 AI requests in 5 minutes, verify 11th blocked
    - Test: OAuth callback endpoints NOT rate limited (exemptions work)
    - Test: Rate limit headers present and accurate (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
    - Test: Progressive brute-force protection - 5 failed logins trigger exponential delays
    - Test: High-load scenario - 100 concurrent requests, verify no race conditions or incorrect blocking
    - Test: Window boundary burst - send 120 requests at end of minute 1, 120 at start of minute 2, verify both batches allowed (fixed-window behavior)
    - _Requirements: 2.2, 2.3_

  - [ ] 6.7 Verify Phase 4 rate limiting optimization works correctly - Fallback Test
    - **Property 1: Expected Behavior** - In-Memory Fallback Works
    - Stop Redis service or disconnect Redis
    - Send API requests, verify in-memory fallback activates (check logs)
    - Verify rate limiting continues working with local store
    - Send 120 requests, verify 121st blocked (fallback enforces limits)
    - Restart Redis, verify system reconnects and resumes using Redis
    - _Requirements: 2.3_

  - [ ] 6.8 Verify Phase 4 preservation - all rate limit functionality unchanged
    - **Property 2: Preservation** - Rate Limits Enforce Identically
    - Re-run Preservation Test 2.1: Send 120 requests/minute, verify 121st blocked (identical to baseline)
    - Re-run Preservation Test 2.5: Stop Redis, verify in-memory fallback activates (identical to baseline)
    - Re-run Preservation Test 2.6: Send requests to OAuth callbacks, verify NOT rate limited (identical to baseline)
    - Re-run Preservation Test 2.7: Verify rate limit headers present and accurate (identical to baseline)
    - Test: Compare rate limiting behavior between sliding-window (baseline) and fixed-window (optimized) for 1000 random request patterns
    - **EXPECTED OUTCOME**: Rate limit enforcement identical, blocking decisions identical (minor difference: fixed-window allows burst at window boundary which is acceptable)
    - Document that fixed-window achieves same security as sliding-window with 50% fewer Redis commands
    - _Requirements: 3.1, 3.9, 3.13, 3.14, 3.15, 3.16_

---

## Phase 5: Repeatable Jobs Caching (Low Risk - 80% Reduction in Schedule Scan Overhead)

- [ ] 7. Cache getRepeatableJobs() results with 30-second TTL

  - [ ] 7.1 Add caching mechanism to scheduleSmartPolling() in server/queues/metricsQueue.ts
    - Add module-level cache variables:
      ```typescript
      let repeatableJobsCache: { data: any[]; timestamp: number } | null = null;
      const CACHE_TTL_MS = 30000; // 30 seconds
      ```
    - Implement cache check in `scheduleSmartPolling()`:
      ```typescript
      const now = Date.now();
      let repeatableJobs;
      if (repeatableJobsCache && (now - repeatableJobsCache.timestamp) < CACHE_TTL_MS) {
        repeatableJobs = repeatableJobsCache.data;
        console.log('📦 Using cached repeatable jobs data');
      } else {
        repeatableJobs = await metricsQueue.getRepeatableJobs();
        repeatableJobsCache = { data: repeatableJobs, timestamp: now };
        console.log('🔄 Fetched fresh repeatable jobs data');
      }
      ```
    - _Bug_Condition: systemState.repeatableJobScansCached = false (ZRANGE scan on every workspace wake-up)_
    - _Expected_Behavior: First call fetches from Redis, subsequent calls within 30s use cached data_
    - _Preservation: Smart polling schedules created identically, only scan frequency reduced_
    - _Requirements: 2.6, 2.7_

  - [ ] 7.2 Verify Phase 5 repeatable jobs caching works correctly
    - **Property 1: Expected Behavior** - Repeatable Jobs Scans Reduced
    - Start Redis MONITOR to track ZRANGE commands
    - Trigger workspace wake-up, observe fresh fetch log and ZRANGE command
    - Immediately trigger another wake-up, observe cached data log and NO ZRANGE command
    - Wait 35 seconds, trigger wake-up again, observe fresh fetch log and ZRANGE command (cache expired)
    - Verify smart polling schedules created correctly in all cases (cached and fresh)
    - Expected command reduction: 5K-15K commands/month → 1K-3K commands/month (80% reduction)
    - Document that cache eliminates 80% of repeatable job scans
    - _Requirements: 2.6, 2.7_

  - [ ] 7.3 Verify Phase 5 preservation - smart polling unchanged
    - **Property 2: Preservation** - Smart Polling Schedules Created Identically
    - Re-run Preservation Test 2.4: Call smart polling schedule, verify repeatable jobs created correctly
    - Test: Schedule smart polling for account with 'high' activity, verify faster polling interval created (unchanged from baseline)
    - Test: Schedule smart polling for account with 'low' activity, verify slower polling interval created (unchanged from baseline)
    - Test: Workspace wake-up creates immediate sync job + fresh repeatable schedules (unchanged from baseline)
    - **EXPECTED OUTCOME**: Smart polling behavior identical, only scan frequency reduced
    - Document that caching has zero impact on scheduling logic, only reduces Redis overhead
    - _Requirements: 3.5_

---

## Phase 6: Monitoring & Final Verification (Production Readiness)

- [ ] 8. Implement Redis monitoring service (OPTIONAL)

  - [ ] 8.1 Create server/services/monitoring/redisMonitoring.ts (optional)
    - Implement RedisMonitoring class with command counting:
      ```typescript
      export class RedisMonitoring {
        private static commandCount = 0;
        private static dailyResetTime = Date.now();
        
        static recordCommand() {
          this.commandCount++;
          if (Date.now() - this.dailyResetTime > 86400000) {
            this.commandCount = 0;
            this.dailyResetTime = Date.now();
          }
        }
        
        static async getStats() {
          return {
            commandsToday: this.commandCount,
            commandsPerMinute: this.commandCount / ((Date.now() - this.dailyResetTime) / 60000),
            targetDaily: 150000,
            percentOfTarget: (this.commandCount / 150000) * 100
          };
        }
        
        static async checkThresholds() {
          const stats = await this.getStats();
          if (stats.percentOfTarget > 80) {
            console.warn(`⚠️ Redis usage at ${stats.percentOfTarget.toFixed(1)}% of daily target`);
          }
        }
      }
      ```
    - _Requirements: 2.14_

  - [ ] 8.2 Add monitoring endpoint (optional)
    - Create `/api/admin/redis-stats` endpoint to expose RedisMonitoring.getStats()
    - Require admin authentication
    - Return JSON with command counts, per-minute rate, target percentage
    - _Requirements: 2.14_

- [ ] 9. Final verification - measure total Redis command reduction
  - **Property 1: Expected Behavior** - 80% Reduction Achieved
  - **IMPORTANT**: This is the final validation that the bug fix works
  - Deploy optimized code to staging environment
  - Monitor Redis command metrics for 24 hours with 1 unauthenticated user on landing page
  - Use Redis MONITOR or Upstash dashboard to track total commands
  - **Measure total Redis commands in 24 hours** (expected: <150K, down from 745K baseline)
  - **Measure commands per minute** (expected: <105, down from 515 baseline)
  - Calculate actual reduction percentage: `((baseline - optimized) / baseline) * 100` (target: ≥80%)
  - Verify Phase 1-5 reductions add up to total:
    - Phase 1 (Connection Pooling): 40-60% reduction in connection overhead
    - Phase 2 (Queue Stats): 80-90% reduction in stats overhead
    - Phase 3 (Lazy Workers): 100% elimination of idle worker overhead
    - Phase 4 (Rate Limiting): 50% reduction in rate-limiting overhead (largest contributor)
    - Phase 5 (Repeatable Jobs): 80% reduction in schedule scan overhead
  - Document final metrics in table:
    ```
    | Metric | Baseline | Optimized | Reduction | Target Met? |
    |--------|----------|-----------|-----------|-------------|
    | Commands/day | 745K | [MEASURED] | [%] | ✓ <150K |
    | Commands/minute | 515 | [MEASURED] | [%] | ✓ <105 |
    | Connection count | 5+ | 2 | 60% | ✓ Target 2 |
    | Rate-limit cmds/req | 4 | 2 | 50% | ✓ Target 2 |
    | Unused workers | 5 | 0 | 100% | ✓ Target 0 |
    ```
  - **SUCCESS CRITERIA**: Redis commands/day <150K AND commands/minute <105 AND all phases verify correctly
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14_

- [ ] 10. Final preservation verification - run complete test suite
  - **Property 2: Preservation** - All Functionality Unchanged
  - **IMPORTANT**: This is the final validation that NO functionality was lost
  - Re-run ALL preservation tests from task 2 on optimized system
  - Compare results to baseline from task 2 - should be 100% identical
  - **Comprehensive Test Categories**:
    - Rate Limiting Preservation: All rate limits enforce identically
    - Worker Job Processing Preservation: All workers function correctly
    - Queue Operations Preservation: All queue operations unchanged
    - Redis Availability Transitions Preservation: Failover works
    - High-Traffic Scenarios Preservation: Concurrent requests handled correctly
  - Run for 7 days in production, monitor for issues
  - **SUCCESS CRITERIA**: Zero functionality regressions, zero bug reports, all features work identically to baseline
  - Document preservation verification results:
    ```
    | Preservation Category | Tests Run | Pass Rate | Issues Found |
    |----------------------|-----------|-----------|--------------|
    | Rate Limiting | 10 | 100% | None |
    | Worker Processing | 12 | 100% | None |
    | Queue Operations | 8 | 100% | None |
    | Redis Failover | 5 | 100% | None |
    | High Traffic | 6 | 100% | None |
    | **TOTAL** | **41** | **100%** | **None** |
    ```
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20, 3.21_

- [ ] 11. Checkpoint - Production readiness confirmed
  - **FINAL VERIFICATION**: Ensure all tests pass and optimization goals met
  - Verify Redis commands reduced by ≥80% (<150K/day from 745K/day baseline)
  - Verify ALL functionality preserved with zero regressions
  - Verify monitoring in place and alerting configured
  - Verify rollback plan documented and tested
  - **If all criteria met**: Mark optimization COMPLETE and production-ready
  - **If any criteria not met**: Review failures, implement fixes, re-test
  - Document final success metrics and lessons learned
  - Ask user if any questions or concerns before closing spec

---

## Success Metrics Summary

**Primary Goals** (MUST achieve all):
- ✅ Redis commands/day <150K (80% reduction from 745K)
- ✅ Commands/minute <105 (80% reduction from 515)
- ✅ All rate limit policies enforce identically
- ✅ All 12+ workers function correctly
- ✅ All queue operations work identically
- ✅ Zero functionality regressions

**Secondary Goals** (Achieved through phases):
- ✅ Connection count = 2 (60% reduction from 5+)
- ✅ Rate-limit commands/request = 2 (50% reduction from 4)
- ✅ Unused workers on boot = 0 (100% reduction from 5)
- ✅ Queue stats use O(1) operations (90% reduction in overhead)
- ✅ Repeatable jobs cached (80% reduction in scans)

**Monitoring & Alerting**:
- ✅ Redis command tracking implemented
- ✅ Threshold alerts configured (>80% of target)
- ✅ Monitoring endpoint available (optional)
- ✅ 7-day production monitoring completed


---

## Implementation Notes

**Phase Ordering Rationale**:
1. **Phase 1 (Connection Pooling)**: Low risk, easy rollback, immediate 40-60% reduction in connection overhead
2. **Phase 2 (Queue Stats)**: Low risk, trivial rollback, 80-90% reduction in stats overhead
3. **Phase 3 (Lazy Workers)**: Medium risk, 100% elimination of idle worker overhead, workers still work when needed
4. **Phase 4 (Rate Limiting)**: HIGH RISK - affects all requests, but largest impact (50% reduction), deployed last with feature flag
5. **Phase 5 (Repeatable Jobs)**: Low risk, 80% reduction in schedule scans, minimal impact if cache fails
6. **Phase 6 (Monitoring)**: Zero risk, optional, provides visibility for production

**Risk Mitigation**:
- Feature flag for rate limiting allows instant rollback without code deploy
- Each phase verified independently before moving to next phase
- Preservation tests ensure no regressions at each step
- Connection pooling uses battle-tested IORedis patterns recommended by BullMQ
- Lazy workers eliminate idle overhead without changing worker logic

**Rollback Strategy**:
- Phase 1-3, 5: Revert specific git commit, redeploy
- Phase 4: Toggle feature flag to `sliding-window`, instant rollback
- Full rollback: Revert entire optimization PR, return to 745K baseline

**Testing Strategy**:
- Baseline measurement confirms bug exists (task 1)
- Preservation baseline confirms functionality works (task 2)
- Each phase includes verification step confirming optimization works
- Each phase includes preservation step confirming no regressions
- Final verification confirms 80% reduction AND zero regressions
- 7-day production monitoring validates long-term stability

**Key Files Modified**:
- `server/lib/redis.ts` - Add shared connection pool functions
- `server/middleware/rate-limiting-working.ts` - Replace sliding-window with fixed-window
- `server/queues/metricsQueue.ts` - Use shared connection, count methods, cache repeatable jobs
- `server/queues/automationQueue.ts`, `messageQueue.ts`, `postQueue.ts` - Use shared connection, count methods
- `server/workers/aiWorker.ts`, `notificationWorker.ts`, `social-listening*.ts`, `webhookWorker.ts` - Lazy initialization
- `server/index.ts` - Remove eager worker starts
- `server/services/monitoring/redisMonitoring.ts` (new file) - Optional monitoring service


## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Phase 0: Baseline & Bug Exploration",
      "tasks": ["1", "2"]
    },
    {
      "name": "Phase 1: Connection Pooling",
      "tasks": ["3", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"],
      "dependsOn": ["Phase 0: Baseline & Bug Exploration"]
    },
    {
      "name": "Phase 2: Queue Stats Optimization",
      "tasks": ["4", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6"],
      "dependsOn": ["Phase 1: Connection Pooling"]
    },
    {
      "name": "Phase 3: Lazy Worker Initialization",
      "tasks": ["5", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9"],
      "dependsOn": ["Phase 2: Queue Stats Optimization"]
    },
    {
      "name": "Phase 4: Rate-Limiting Optimization (HIGH RISK)",
      "tasks": ["6", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8"],
      "dependsOn": ["Phase 3: Lazy Worker Initialization"]
    },
    {
      "name": "Phase 5: Repeatable Jobs Caching",
      "tasks": ["7", "7.1", "7.2", "7.3"],
      "dependsOn": ["Phase 4: Rate-Limiting Optimization (HIGH RISK)"]
    },
    {
      "name": "Phase 6: Monitoring & Final Verification",
      "tasks": ["8", "8.1", "8.2", "9", "10", "11"],
      "dependsOn": ["Phase 5: Repeatable Jobs Caching"]
    }
  ]
}
```

**Phase Overview**:
- **Phase 0**: Measure baseline (745K cmds/day) and document preservation baseline
- **Phase 1**: Connection pooling (60% reduction in connection overhead)
- **Phase 2**: Queue stats optimization (90% reduction in stats overhead)
- **Phase 3**: Lazy worker initialization (100% elimination of idle worker overhead)
- **Phase 4**: Rate-limiting optimization (50% reduction - HIGH RISK, affects all requests)
- **Phase 5**: Repeatable jobs caching (80% reduction in schedule scans)
- **Phase 6**: Monitoring and final verification (confirm 80% total reduction)
