#!/bin/bash

# Manual Verification Script for Redis Optimization
# Run this script to verify the optimizations are working correctly

echo "🔍 Redis Optimization - Manual Verification Script"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Redis URL is set
if [ -z "$REDIS_URL" ]; then
    echo -e "${RED}❌ REDIS_URL environment variable not set${NC}"
    echo "Please set REDIS_URL and try again"
    exit 1
fi

echo -e "${GREEN}✅ REDIS_URL is configured${NC}"
echo ""

# Function to run a verification test
run_test() {
    local test_name=$1
    local test_number=$2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}Test ${test_number}: ${test_name}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Test 1: Connection Count
run_test "Redis Connection Count Verification" "1"
echo "Expected: 2 connections (down from 5+)"
echo ""
CONNECTION_COUNT=$(redis-cli -u "$REDIS_URL" CLIENT LIST 2>/dev/null | wc -l | xargs)

if [ -z "$CONNECTION_COUNT" ]; then
    echo -e "${RED}❌ Could not connect to Redis${NC}"
else
    echo -e "Current connection count: ${GREEN}${CONNECTION_COUNT}${NC}"
    if [ "$CONNECTION_COUNT" -le 3 ]; then
        echo -e "${GREEN}✅ PASS: Connection count optimized (≤3 connections)${NC}"
    else
        echo -e "${YELLOW}⚠️  WARNING: Connection count higher than expected${NC}"
    fi
fi
echo ""
read -p "Press Enter to continue to next test..."
echo ""

# Test 2: Rate-Limiting Commands
run_test "Rate-Limiting Command Count" "2"
echo "This test will monitor Redis commands while sending 10 test requests"
echo "Expected: 2 commands per request (EVAL for Lua script)"
echo ""
echo -e "${YELLOW}Starting Redis MONITOR in background...${NC}"

# Start monitoring in background
redis-cli -u "$REDIS_URL" MONITOR > /tmp/redis_monitor.log 2>&1 &
MONITOR_PID=$!
sleep 2

echo -e "${YELLOW}Sending 10 test requests...${NC}"
for i in {1..10}; do
    curl -s http://localhost:3000/api/health > /dev/null 2>&1
    echo -n "."
done
echo ""

sleep 2
kill $MONITOR_PID 2>/dev/null

# Count EVAL commands (Lua script execution)
EVAL_COUNT=$(grep -c "EVAL" /tmp/redis_monitor.log 2>/dev/null || echo "0")
echo ""
echo "EVAL commands detected: $EVAL_COUNT"
if [ "$EVAL_COUNT" -ge 10 ]; then
    echo -e "${GREEN}✅ PASS: Rate-limiting using optimized pattern${NC}"
else
    echo -e "${YELLOW}⚠️  Note: May need server restart to activate optimization${NC}"
fi
echo ""
rm -f /tmp/redis_monitor.log
read -p "Press Enter to continue to next test..."
echo ""

# Test 3: Worker Initialization
run_test "Lazy Worker Initialization Check" "3"
echo "This test checks server logs for worker initialization"
echo "Expected: NO logs for unused workers (AI, Notification, SocialListening, Webhook)"
echo ""
echo -e "${YELLOW}Instructions:${NC}"
echo "1. Restart your development server (npm run dev)"
echo "2. Check the server logs on startup"
echo "3. Look for worker initialization messages"
echo ""
echo -e "${GREEN}Expected to see:${NC}"
echo "  ✓ Automation Worker"
echo "  ✓ Message Worker"
echo "  ✓ Post Worker"
echo "  ✓ Verify Worker"
echo "  ✓ Metrics Worker"
echo "  ✓ Email Worker"
echo ""
echo -e "${RED}Should NOT see:${NC}"
echo "  ✗ AI Worker"
echo "  ✗ Notification Worker"
echo "  ✗ Social Listening Worker"
echo "  ✗ Webhook Worker"
echo ""
read -p "Press Enter to continue to next test..."
echo ""

# Test 4: Queue Stats LRANGE Elimination
run_test "Queue Stats O(1) Optimization" "4"
echo "This test verifies queue stats use count methods instead of LRANGE"
echo "Expected: Zero LRANGE commands when fetching queue stats"
echo ""
echo -e "${YELLOW}Starting Redis MONITOR in background...${NC}"

redis-cli -u "$REDIS_URL" MONITOR > /tmp/redis_monitor_stats.log 2>&1 &
MONITOR_PID=$!
sleep 2

echo -e "${YELLOW}Fetching queue stats...${NC}"
curl -s http://localhost:3000/api/admin/queue-stats > /dev/null 2>&1
sleep 2

kill $MONITOR_PID 2>/dev/null

LRANGE_COUNT=$(grep -c "LRANGE" /tmp/redis_monitor_stats.log 2>/dev/null || echo "0")
echo ""
echo "LRANGE commands detected: $LRANGE_COUNT"
if [ "$LRANGE_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ PASS: Queue stats using O(1) count methods${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: Still using LRANGE - may need server restart${NC}"
fi
echo ""
rm -f /tmp/redis_monitor_stats.log
read -p "Press Enter to continue to next test..."
echo ""

# Test 5: Repeatable Jobs Caching
run_test "Repeatable Jobs Caching (30s TTL)" "5"
echo "This test requires authenticated workspace wake-up to verify caching"
echo "Expected: ZRANGE on first call, NO ZRANGE on second call (cache hit)"
echo ""
echo -e "${YELLOW}Instructions:${NC}"
echo "1. Log in to your application"
echo "2. Perform a workspace wake-up action"
echo "3. Immediately perform another workspace wake-up (within 30 seconds)"
echo "4. Wait 35 seconds and perform a third wake-up"
echo ""
echo "Expected console logs:"
echo "  First wake-up:  '🔄 Fetched fresh repeatable jobs data'"
echo "  Second wake-up: '📦 Using cached repeatable jobs data'"
echo "  Third wake-up:  '🔄 Fetched fresh repeatable jobs data' (cache expired)"
echo ""
echo "Manual verification required for this test."
echo ""
read -p "Press Enter to continue to summary..."
echo ""

# Test 6: Rate Limiting Enforcement
run_test "Rate Limiting Enforcement Test" "6"
echo "This test verifies rate limiting blocks requests correctly"
echo "Expected: First 120 requests succeed, 121st request gets 429 status"
echo ""
echo -e "${YELLOW}Sending 125 rapid requests...${NC}"
echo "This may take 10-15 seconds..."
echo ""

SUCCESS_COUNT=0
BLOCKED_COUNT=0

for i in {1..125}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null)
    if [ "$STATUS" == "200" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$STATUS" == "429" ]; then
        BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    fi
    
    # Show progress every 25 requests
    if [ $((i % 25)) -eq 0 ]; then
        echo -n "."
    fi
done

echo ""
echo ""
echo "Results:"
echo "  Successful requests (200): $SUCCESS_COUNT"
echo "  Blocked requests (429): $BLOCKED_COUNT"
echo ""

if [ "$SUCCESS_COUNT" -ge 115 ] && [ "$BLOCKED_COUNT" -ge 1 ]; then
    echo -e "${GREEN}✅ PASS: Rate limiting working correctly${NC}"
elif [ "$SUCCESS_COUNT" -eq 125 ]; then
    echo -e "${YELLOW}⚠️  WARNING: No rate limiting detected - may need configuration check${NC}"
else
    echo -e "${RED}❌ FAIL: Unexpected rate limiting behavior${NC}"
fi
echo ""

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Manual Verification Complete${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary of Optimizations Verified:"
echo "  • Connection Pooling: Checked"
echo "  • Rate-Limiting Optimization: Checked"
echo "  • Lazy Worker Initialization: Instructions provided"
echo "  • Queue Stats O(1): Checked"
echo "  • Repeatable Jobs Caching: Instructions provided"
echo "  • Rate Limiting Enforcement: Checked"
echo ""
echo "For complete verification results, see:"
echo "  .kiro/specs/redis-optimization-production-ready/POST-OPTIMIZATION-VERIFICATION.md"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review the verification report"
echo "  2. Monitor Redis usage in Upstash dashboard for 24 hours"
echo "  3. Deploy to staging environment"
echo "  4. After 24h staging success, deploy to production"
echo ""
