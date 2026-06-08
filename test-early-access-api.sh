#!/bin/bash

# Test script for early access API endpoint
# This helps diagnose production issues

echo "=== Testing Early Access API Endpoint ==="
echo ""

# Test 1: Check if endpoint exists
echo "Test 1: Checking if /api/early-access/status endpoint responds..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "https://www.veefore.com/api/early-access/status?email=test@example.com"
echo ""

# Test 2: Get actual response
echo "Test 2: Getting actual response..."
curl -s "https://www.veefore.com/api/early-access/status?email=test@example.com" | jq '.' || echo "Response is not JSON or jq not installed"
echo ""

# Test 3: Check with a real email (replace with actual approved email)
echo "Test 3: Testing with specific email..."
read -p "Enter approved email to test: " TEST_EMAIL
if [ ! -z "$TEST_EMAIL" ]; then
    echo "Response for $TEST_EMAIL:"
    curl -s "https://www.veefore.com/api/early-access/status?email=$(echo $TEST_EMAIL | jq -sRr @uri)" | jq '.'
fi
echo ""

echo "=== Test Complete ==="
