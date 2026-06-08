# Redis Optimization - Baseline Measurement Instructions

## Task 1: Measure Baseline Redis Usage (Bug Condition Exploration)

### Purpose
This test measures Redis command usage on **UNFIXED code** to document and confirm the bug exists. The test is **EXPECTED TO FAIL** (showing high Redis usage) - this is the SUCCESS case that confirms the bug.

**DO NOT attempt to fix anything** - this is pure observation and measurement.

### Prerequisites

1. **Redis must be running** and configured via `REDIS_URL` environment variable
   - Check your `.env` file for `REDIS_URL`
   - For local Redis: `REDIS_URL=redis://localhost:6379`
   - For Upstash: Use your Upstash Redis URL

2. **Development server must be running**
   ```bash
   npm run dev
   ```
   - Wait for server to fully initialize
   - Confirm workers are started (check console logs)

### Running the Baseline Measurement Test

1. In a **separate terminal** (while server is running):
   ```bash
   npm test baseline-measurement.test.ts
   ```

2. The test will run for approximately **2-3 minutes** and measure:
   - Total Redis commands
   - Commands per minute  
   - Rate-limiting command patterns
   - Active Redis connections
   - Queue operation patterns
   - Worker connection overhead

### Expected Results (Bug Conditions)

The test should **FAIL with high measurements**, confirming these bug conditions:

| Metric | Expected Bug Value | What It Indicates |
|--------|-------------------|-------------------|
| Commands/minute | ~515 commands/min | Excessive Redis usage |
| Daily extrapolation | ~745,000 commands/day | Exceeds Upstash free tier (500K/month) |
| Rate-limit commands/request | 4 commands | Inefficient sliding-window (should be 2) |
| Active connections | 5+ connections | No connection pooling |
| Queue stats operations | LRANGE (O(n)) | Fetching entire job arrays |
| Unused workers | 5 idle workers | AI, Notification, SocialListening x2, Webhook |
| Repeatable job scans | ZRANGE uncached | Scanning on every workspace wake-up |

### Understanding the Output

#### ✅ **Bug Confirmed** Status
- Measurements match or exceed expected bug values
- This is the **desired outcome** for Task 1
- Confirms the bug exists and needs fixing

#### ❓ **Inconclusive** Status  
- Measurements lower than expected (may need longer test duration)
- Some tests require authentication (queue stats, workspace wake-ups)
- Check server logs for additional context

### Interpreting Test Results

1. **Test 1.1-1.2**: Overall Redis command usage
   - Confirms excessive command volume
   - Extrapolates to daily usage exceeding limits

2. **Test 1.3**: Rate-limiting command pattern
   - Shows 4 commands/request pattern (ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE)
   - Optimal would be 2 commands/request

3. **Test 1.4**: Connection pooling
   - Shows multiple independent connections (5+)
   - Optimal would be 2 shared connections

4. **Test 1.5**: Queue stats operations
   - May be inconclusive without authentication
   - Look for LRANGE commands fetching job arrays

5. **Test 1.6**: Unused worker detection
   - Checks for idle worker connections
   - Cross-reference with server startup logs

6. **Test 1.7**: Repeatable job caching
   - May be inconclusive without authentication
   - Look for ZRANGE commands without caching

### After Running the Test

1. **Review the console output** - detailed metrics and command breakdown
2. **Check `baseline-results.md`** (if generated) - full results documentation
3. **Confirm bug conditions** - most tests should show ✅ Bug Confirmed
4. **Document counterexamples** - note any specific patterns observed

### Next Steps

After confirming the bug exists (Task 1 complete):
1. **DO NOT proceed to Task 2** until explicitly instructed
2. Report findings to the orchestrator
3. Task 2 will establish preservation baseline (all functionality still works)
4. Tasks 3+ will implement optimizations with verification

### Troubleshooting

**"Server not running" error:**
- Start server: `npm run dev`
- Wait for full initialization
- Check `http://localhost:5000/health` responds

**"REDIS_URL not configured" error:**
- Check `.env` file has `REDIS_URL` set
- For Upstash: Use your Upstash Redis URL (starts with `rediss://`)
- For local: `REDIS_URL=redis://localhost:6379`

**Low command counts:**
- Test might need longer duration (currently 2 minutes)
- Ensure server has active workers running
- Check for rate-limiting or firewall issues

**Test inconclusive:**
- Some tests require authenticated API calls
- Run longer measurement duration
- Cross-reference with server logs for worker/queue activity

### Important Notes

- This is a **bug exploration test** - failing (showing high usage) is the success condition
- The test uses Redis MONITOR command which can impact performance
- Run this test in development/staging, not production
- Keep measurement duration reasonable (2-5 minutes is sufficient)
- Some tests may be inconclusive without authentication - this is expected

---

**Task Status**: Task 1 is complete when baseline metrics are documented and bug is confirmed
