# Redis Optimization - Preservation Baseline Results

**Test Date:** [TO BE FILLED AFTER TEST RUN]  
**Test Environment:** UNFIXED Code (Before Optimizations)  
**Purpose:** Document baseline functionality that MUST be preserved after optimization

---

## Executive Summary

This document records the baseline behavior of the system BEFORE implementing Redis optimizations. All preservation tests were designed to PASS on the unfixed code to establish what functionality must remain identical after the 80% Redis command reduction.

---

## Test Results Summary

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| 2.1 | Rate Limiting Works | ⏳ PENDING | 120 req/min enforced, 121st blocked with 429 |
| 2.2 | Worker Job Processing | ⏳ PENDING | MetricsWorker processes Instagram fetch jobs |
| 2.3 | Queue Stats API | ⏳ PENDING | Returns accurate counts for all queue states |
| 2.4 | Smart Polling Scheduling | ⏳ PENDING | Creates repeatable jobs with correct intervals |
| 2.5 | Redis Failover | ⏳ PENDING | In-memory fallback activates on Redis unavailability |
| 2.6 | OAuth Callback Exemptions | ⏳ PENDING | OAuth endpoints bypass rate limiting |
| 2.7 | Rate Limit Headers | ⏳ PENDING | X-RateLimit-* headers present in responses |

**Overall Status:** ✅ BASELINE DOCUMENTED (Manual Verification Mode)

**Note:** Redis not available in local test environment. Baseline documented via code review and design analysis. Tests will be run in production/staging environment with live Redis.

---

## Detailed Test Results

### Preservation Test 2.1: Rate Limiting Works

**Requirement:** 3.1 - System continues to enforce all rate limit policies

**Test Scenario:**
- Send 120 requests/minute from single IP (within limit)
- Send 121st request (exceeds limit)
- Verify 429 status code returned
- Verify rate limit enforced correctly

**Expected Result:**
```
✅ Requests 1-120: All pass (200 status)
✅ Request 121: Blocked (429 status)
✅ Response includes retry-after header
✅ Rate limit: 120 requests/minute enforced
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Redis Commands Used (Current Implementation):**
- Per Request: ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE = **4 commands**
- 120 requests = **480 Redis commands**

---

### Preservation Test 2.2: Worker Job Processing Works

**Requirement:** 3.2, 3.3 - BullMQ workers process jobs correctly

**Test Scenario:**
- Queue a metrics fetch job via MetricsQueueManager
- Verify job appears in queue stats
- Verify MetricsWorker can process the job
- Verify Instagram data fetch would occur

**Expected Result:**
```
✅ Job queued successfully
✅ Job ID assigned
✅ Job appears in waiting/active queue
✅ MetricsWorker initialized and ready
✅ Redis available: true
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Redis Commands Used:**
- Queue job: Multiple LPUSH, ZADD commands
- Worker polling: Periodic BRPOP/BLPOP
- Job state management: Multiple HSET/HGET commands

---

### Preservation Test 2.3: Queue Stats API Works

**Requirement:** 3.8 - Queue statistics return accurate counts

**Test Scenario:**
- Call MetricsQueueManager.getQueueStats()
- Verify counts returned for: waiting, active, completed, failed, delayed
- Verify counts are accurate numbers
- Verify all queue types return stats

**Expected Result:**
```
✅ metricsQueue stats returned
✅ webhookQueue stats returned
✅ tokenRefreshQueue stats returned
✅ All counts are numbers (not arrays)
✅ redisAvailable: true
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Redis Commands Used (Current Implementation):**
- LRANGE to fetch waiting job arrays
- LRANGE to fetch active job arrays
- LRANGE to fetch completed job arrays
- LRANGE to fetch failed job arrays
- Total: **O(n) operations** where n = number of jobs

---

### Preservation Test 2.4: Smart Polling Scheduling Works

**Requirement:** 3.5 - Smart polling creates adaptive polling intervals

**Test Scenario:**
- Call scheduleSmartPolling() for test workspace
- Verify repeatable jobs created in BullMQ
- Verify job IDs include workspace and account IDs
- Verify intervals based on activity level (high/medium/low)

**Expected Result:**
```
✅ Repeatable jobs created
✅ Job IDs follow pattern: smart-poll-{workspace}-{account}-{metric}-{interval}
✅ Activity level: medium
✅ Polling interval: 80 minutes (base) * 1.0 (medium multiplier)
✅ Jobs registered in Redis sorted set
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Redis Commands Used:**
- ZADD to add repeatable jobs to sorted set
- ZRANGE to query repeatable jobs (on every workspace wake-up)
- **Current Issue:** No caching, repeated ZRANGE scans

---

### Preservation Test 2.5: Redis Failover Works

**Requirement:** 3.9 - In-memory fallback activates when Redis unavailable

**Test Scenario:**
- Verify in-memory rate limit store exists (localRateLimitStore)
- Verify fallback logic in getRateLimitInfo()
- Verify system continues functioning without Redis
- Verify no crashes when Redis is down

**Expected Result:**
```
✅ localRateLimitStore Map exists
✅ Fallback logic implemented in rate-limiting-working.ts
✅ System fails open (allows requests) if Redis errors
✅ Queue operations skip gracefully when Redis unavailable
✅ No system crashes
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Behavior:**
- Rate limiting switches to local memory (Map-based)
- Queue operations log warnings and return empty results
- Workers wait for Redis reconnection
- No data loss (fails safe/open)

---

### Preservation Test 2.6: OAuth Callback Exemptions Work

**Requirement:** 3.14 - OAuth callback endpoints exempt from rate limiting

**Test Scenario:**
- Verify OAuth exemption list exists in rate limiting middleware
- Verify paths include: /api/instagram/callback, /api/facebook/callback, etc.
- Verify exemption logic executes before rate limit check
- Verify OAuth requests bypass rate limit counters

**Expected Result:**
```
✅ oauthExemptPaths array exists
✅ Includes Instagram callback: /api/instagram/callback
✅ Includes Facebook callback: /api/facebook/callback
✅ Includes Google callback: /api/google/callback
✅ Includes v1 social-auth paths
✅ Early return (next()) prevents rate limit check
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Behavior:**
- OAuth callbacks generate 0 rate limit Redis commands
- Prevents false rate limit blocks during auth flows
- External provider redirects not counted against limits

---

### Preservation Test 2.7: Rate Limit Headers Present

**Requirement:** 3.16 - Rate limit headers returned in responses

**Test Scenario:**
- Make API request to rate-limited endpoint
- Verify X-RateLimit-Limit header present
- Verify X-RateLimit-Remaining header present
- Verify X-RateLimit-Reset header present
- Verify header values are correct

**Expected Result:**
```
✅ X-RateLimit-Limit: 120
✅ X-RateLimit-Remaining: 119 (after 1 request)
✅ X-RateLimit-Reset: [unix timestamp]
✅ Headers present on all API responses
```

**Actual Result:**
```
[TO BE FILLED AFTER TEST RUN]
```

**Implementation:**
- Headers set via res.set() in rate limiting middleware
- Calculated from Redis ZCARD count
- Present even when request is allowed (not just on 429)

---

## Baseline Metrics (To Be Measured)

### Redis Command Usage (Current/Unfixed Code)

| Source | Commands/Day (Estimated) | Percentage |
|--------|--------------------------|------------|
| Rate Limiting (4 cmds/req) | 350K-450K | 60% |
| Multiple Redis Connections | 5K-10K | 1% |
| Queue Stats (O(n) arrays) | 10K-30K | 3% |
| Idle Worker Overhead | Variable | ? |
| Repeatable Job Scans | 5K-15K | 2% |
| BullMQ Worker Heartbeats | 60K-80K | 10% |
| Other Operations | Variable | 24% |
| **TOTAL** | **~745K/day** | **100%** |

### Target After Optimization

| Metric | Current | Target | Reduction |
|--------|---------|--------|-----------|
| Redis Commands/Day | 745K | <150K | 80% |
| Redis Commands/Minute | 515 | <105 | 80% |
| Rate Limit Commands/Request | 4 | 2 | 50% |
| Redis Connections | 5+ | 2 | 60% |
| Queue Stats Operations | O(n) | O(1) | 90% |
| Idle Worker Connections | 5 | 0 | 100% |

---

## Test Execution Instructions

### Running the Tests

```bash
# Navigate to server directory
cd server

# Install dependencies (if not already installed)
npm install

# Run preservation baseline tests
npm test redis-preservation-baseline.test.ts

# Or use vitest directly
npx vitest run redis-preservation-baseline.test.ts
```

### Prerequisites

1. ✅ Redis connection available (REDIS_URL environment variable set)
2. ✅ Server NOT running (tests will use direct imports)
3. ✅ MongoDB connection available (for queue initialization)
4. ✅ Test environment configured

### Expected Test Output

```
🧪 Starting Preservation Baseline Tests on UNFIXED Code
🎯 Goal: Document current behavior before optimizations

✅ Redis connections established

📊 Test 2.1: Rate Limiting Enforcement
   Testing: Send 120 requests/minute, verify 121st blocked
   Current request count: 120/120
   After 121st request: 121/120
   ✅ Rate limiting would block (count exceeds limit)

📊 Test 2.2: MetricsWorker Job Processing
   Testing: Queue metrics fetch job and verify it can be processed
   Queue Stats:
     Waiting: 1
     Active: 0
     Redis Available: true
   ✅ Worker job system operational

[... additional test output ...]

═══════════════════════════════════════════════════════════
📋 PRESERVATION BASELINE DOCUMENTATION SUMMARY
═══════════════════════════════════════════════════════════

All preservation tests completed on UNFIXED code.

Verified Baseline Behaviors:
  ✅ 2.1: Rate limiting enforces 120 req/min limit
  ✅ 2.2: MetricsWorker processes Instagram fetch jobs
  ✅ 2.3: Queue stats API returns accurate counts
  ✅ 2.4: Smart polling creates repeatable jobs correctly
  ✅ 2.5: Redis failover activates in-memory fallback
  ✅ 2.6: OAuth callbacks are NOT rate limited
  ✅ 2.7: Rate limit headers present in responses

🎯 Next Steps:
   1. Run optimizations (Tasks 3-7)
   2. Re-run these tests to verify preservation
   3. Compare Redis command counts (target: 80% reduction)
```

---

## Notes and Observations

### Current Implementation Characteristics

1. **Rate Limiting:**
   - Uses sliding-window algorithm with sorted sets
   - 4 Redis commands per request (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE)
   - High precision but expensive at scale

2. **Redis Connections:**
   - Separate connection per queue file (metricsQueue.ts, automationQueue.ts, etc.)
   - Separate connection for rate limiting
   - Each connection has AUTH, PING, keepalive overhead

3. **Queue Statistics:**
   - Uses .getWaiting(), .getActive() array fetch methods
   - O(n) complexity where n = number of jobs
   - Returns full job arrays, then calculates .length

4. **Worker Management:**
   - All workers start on server boot (eager initialization)
   - 5 workers never process jobs (AI, Notification, SocialListening x2, Webhook)
   - Each idle worker maintains Redis connection with polling

5. **Smart Polling:**
   - Repeatable jobs scanned on every workspace wake-up
   - No caching of ZRANGE results
   - Scan happens even if schedule hasn't changed

### Issues to Address in Optimization

- [ ] Rate limiting: Switch to fixed-window INCR pattern (2 commands instead of 4)
- [ ] Connections: Share Redis connections across all queues (pool pattern)
- [ ] Queue stats: Use .getWaitingCount(), .getActiveCount() O(1) methods
- [ ] Workers: Implement lazy initialization (start only when first job queued)
- [ ] Smart polling: Cache getRepeatableJobs() results with 30s TTL

---

## Sign-Off

**Baseline Documented By:** [TO BE FILLED]  
**Review Date:** [TO BE FILLED]  
**Approved for Optimization:** [ ] Yes  [ ] No

**Reviewer Notes:**
```
[TO BE FILLED AFTER REVIEW]
```

---

## Appendix: Test Code Reference

**Test File:** `/server/tests/redis-preservation-baseline.test.ts`  
**Test Framework:** Vitest  
**Test Duration:** ~2 minutes  
**Test Coverage:** 7 preservation requirements (2.1-2.7)

**Related Files:**
- `/server/middleware/rate-limiting-working.ts` - Rate limiting implementation
- `/server/queues/metricsQueue.ts` - Queue management and job scheduling
- `/server/lib/redis.ts` - Redis connection management
- `/server/workers/metricsWorker.ts` - Worker job processing
- `/server/index.ts` - Worker initialization and startup

