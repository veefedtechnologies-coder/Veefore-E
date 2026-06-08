# Task 1 Execution Plan - Baseline Measurement

## Status: Ready to Execute (Requires Manual Steps)

### What Was Created

✅ **Baseline Measurement Test**: `.kiro/specs/redis-optimization-production-ready/baseline-measurement.test.ts`
- Comprehensive bug exploration test
- Measures 7 specific bug conditions  
- Expected to FAIL (showing high Redis usage) - this confirms the bug exists
- Test duration: ~2-3 minutes

✅ **Documentation**: `README.md` with full instructions
✅ **Execution Plan**: This file

### Prerequisites Check

Before running the test, you need:

1. ✅ **Test file created**: `baseline-measurement.test.ts`
2. ❌ **Server running**: Currently NOT running
3. ❓ **Redis configured**: Need to verify `REDIS_URL` in `.env`

### Step-by-Step Execution Instructions

#### Step 1: Verify Redis Configuration

Check your `.env` file has `REDIS_URL` configured:

```bash
cat .env | grep REDIS_URL
```

**Expected output**: Should show your Redis URL (Upstash or local Redis)

If not configured, add to `.env`:
```
REDIS_URL=your_redis_url_here
```

#### Step 2: Start the Development Server

In **Terminal 1**:

```bash
npm run dev
```

**Wait for server to fully start** - look for these logs:
- `✅ MongoDB connected`
- `[INFRA] Background workers and Rate Limiting connected to Redis`
- `Server listening on port 5000`

**Do NOT close this terminal** - leave server running.

#### Step 3: Run the Baseline Measurement Test

In **Terminal 2** (new terminal):

```bash
npm test baseline-measurement.test.ts
```

**Expected behavior**:
- Test will run for ~2-3 minutes
- Console will show live Redis command monitoring
- Tests should FAIL with high measurements (this confirms the bug)

#### Step 4: Review Results

After the test completes, review:

1. **Console output** - detailed metrics table
2. **Test results** - most tests should show "✅ Bug Confirmed"
3. **Command breakdown** - top Redis commands being executed

**Example expected output**:
```
┌─────────────────────────────────┬──────────────────┬────────────────────┬────────────────────┐
│ Metric                          │ Measured Value   │ Expected Bug Value │ Status             │
├─────────────────────────────────┼──────────────────┼────────────────────┼────────────────────┤
│ Commands per minute             │ 450              │ ~515               │ ✅ Bug Confirmed    │
│ Extrapolated daily commands     │ 648,000          │ ~745,000           │ ✅ Bug Confirmed    │
│ Active Redis connections        │ 7                │ 5+                 │ ✅ Bug Confirmed    │
└─────────────────────────────────┴──────────────────┴────────────────────┴────────────────────┘
```

### What the Test Measures

The test documents 7 specific bug conditions:

| Test | Bug Condition | Expected Result |
|------|--------------|-----------------|
| 1.1 | Total Redis commands | ~1,030 in 2 min |
| 1.2 | Commands per minute | ~515/min |
| 1.3 | Rate-limit commands | 4 per request |
| 1.4 | Active connections | 5+ connections |
| 1.5 | Queue stats pattern | LRANGE (O(n)) |
| 1.6 | Unused workers | 5 idle workers |
| 1.7 | Repeatable job scans | ZRANGE uncached |

### Success Criteria

Task 1 is complete when:

- [x] Baseline measurement test is created
- [ ] Test is executed successfully
- [ ] Results show HIGH Redis usage (bug confirmed)
- [ ] Findings are documented

**CRITICAL**: The test should **FAIL with high measurements** - this is the desired outcome that confirms the bug exists.

### After Completion

**DO NOT proceed to Task 2** automatically. Report to the orchestrator:

1. Baseline metrics documented ✅
2. Bug conditions confirmed ✅  
3. Ready for Task 2 (Preservation Baseline) ⏭️

### Troubleshooting

**If server won't start:**
- Check MongoDB is running
- Check Redis is accessible
- Check for port conflicts (5000)

**If test fails to connect:**
- Verify server is running: `curl http://localhost:5000/health`
- Check REDIS_URL is correct
- Try restarting both server and test

**If command counts are low:**
- Let test run full 2 minutes
- Check server logs for worker activity
- Verify rate limiting is active (check logs)

### Alternative: Manual Measurement

If automated test has issues, you can manually measure via Redis CLI:

```bash
# Connect to Redis
redis-cli -u $REDIS_URL

# Run MONITOR command for 2 minutes
MONITOR

# Count commands manually
# Check active connections
CLIENT LIST
```

---

## Ready to Execute?

Follow the steps above to complete Task 1. Once you have the baseline measurements and confirmed the bug exists, report back with the results.
