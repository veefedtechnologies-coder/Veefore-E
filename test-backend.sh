#!/bin/bash

# Test Backend Connection
# This script tests if your Railway backend is running and accessible

echo "🔍 Testing VeeFore Backend Connection"
echo "======================================"
echo ""

echo "Testing: https://api.veefore.com/api/health"
echo ""

# Test with curl
response=$(curl -s -w "\n%{http_code}" https://api.veefore.com/api/health 2>&1)
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status Code: $http_code"
echo "Response Body:"
echo "$body"
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ Backend is UP and running!"
    echo ""
    echo "Your backend is healthy and ready to serve requests."
else
    echo "❌ Backend is DOWN or not responding correctly!"
    echo ""
    echo "Possible issues:"
    echo "  1. Railway service is not deployed"
    echo "  2. Environment variables missing in Railway"
    echo "  3. Database connection failing"
    echo "  4. Custom domain not configured correctly"
    echo ""
    echo "Next steps:"
    echo "  1. Check Railway Dashboard → Your Service"
    echo "  2. Verify service is running (green status)"
    echo "  3. Check deployment logs for errors"
    echo "  4. Ensure all environment variables from RAILWAY_ENV_VARIABLES.txt are set"
fi
