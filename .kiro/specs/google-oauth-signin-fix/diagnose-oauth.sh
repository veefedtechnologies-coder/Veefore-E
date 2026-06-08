#!/bin/bash

# Google OAuth Configuration Diagnostic Script
# This script helps diagnose Google OAuth sign-in issues in production

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Google OAuth Configuration Diagnostic"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track issues found
ISSUES_FOUND=0

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check required tools
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Checking Required Tools"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command_exists curl; then
  echo -e "${GREEN}✓${NC} curl is installed"
else
  echo -e "${RED}✗${NC} curl is not installed"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if command_exists jq; then
  echo -e "${GREEN}✓${NC} jq is installed"
else
  echo -e "${YELLOW}⚠${NC} jq is not installed (optional, for better JSON formatting)"
fi

echo ""

# Check environment variables
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Checking Environment Variables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check .env file
if [ -f ".env" ]; then
  echo -e "${GREEN}✓${NC} .env file found"
  
  # Check Firebase variables
  if grep -q "VITE_FIREBASE_API_KEY" .env; then
    echo -e "${GREEN}✓${NC} VITE_FIREBASE_API_KEY is set"
  else
    echo -e "${RED}✗${NC} VITE_FIREBASE_API_KEY is missing"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
  
  if grep -q "VITE_FIREBASE_PROJECT_ID" .env; then
    PROJECT_ID=$(grep "VITE_FIREBASE_PROJECT_ID" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    echo -e "${GREEN}✓${NC} VITE_FIREBASE_PROJECT_ID is set: ${PROJECT_ID}"
  else
    echo -e "${RED}✗${NC} VITE_FIREBASE_PROJECT_ID is missing"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
  
  if grep -q "VITE_FIREBASE_APP_ID" .env; then
    echo -e "${GREEN}✓${NC} VITE_FIREBASE_APP_ID is set"
  else
    echo -e "${RED}✗${NC} VITE_FIREBASE_APP_ID is missing"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
else
  echo -e "${RED}✗${NC} .env file not found"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# Check production domain
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Testing Production Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Try production domains
DOMAINS=("https://veefore.com" "https://app.veefore.com")

for DOMAIN in "${DOMAINS[@]}"; do
  echo ""
  echo "Testing domain: ${DOMAIN}"
  echo "────────────────────────────────────────────────────────"
  
  # Test health endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/health" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Health endpoint accessible (${HTTP_CODE})"
  else
    echo -e "${YELLOW}⚠${NC} Health endpoint returned ${HTTP_CODE} (might be normal)"
  fi
  
  # Test Firebase auth handler endpoint (should return something, not 404)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/__/auth/handler" 2>/dev/null)
  if [ "$HTTP_CODE" = "404" ]; then
    echo -e "${RED}✗${NC} Firebase auth handler returns 404 - OAuth will fail!"
    echo -e "   Expected redirect URI: ${DOMAIN}/__/auth/handler"
    echo -e "   This URI must be added to Google Cloud Console"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    echo -e "${GREEN}✓${NC} Firebase auth handler exists (${HTTP_CODE})"
  fi
  
  # Test auth endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/api/auth/session" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Auth API endpoint accessible (${HTTP_CODE})"
  else
    echo -e "${YELLOW}⚠${NC} Auth API endpoint returned ${HTTP_CODE}"
  fi
done

echo ""

# Test early access check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Testing Early Access Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Enter an email to test early access validation (or press Enter to skip):"
read -r TEST_EMAIL

if [ -n "$TEST_EMAIL" ]; then
  echo ""
  echo "Testing early access check for: ${TEST_EMAIL}"
  
  # Try production domain
  RESPONSE=$(curl -s -X POST "https://veefore.com/api/auth/check-early-access" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\"}" 2>/dev/null)
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://veefore.com/api/auth/check-early-access" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\"}" 2>/dev/null)
  
  echo "Response code: ${HTTP_CODE}"
  
  if command_exists jq; then
    echo "Response body:"
    echo "$RESPONSE" | jq '.'
  else
    echo "Response body:"
    echo "$RESPONSE"
  fi
  
  # Interpret response
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} User has early access"
  elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}⚠${NC} User does not have early access (this is expected for unapproved users)"
    echo "   Check the response above for the specific reason"
  else
    echo -e "${RED}✗${NC} Unexpected response code"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
else
  echo "Skipped early access test"
fi

echo ""

# Check Firebase configuration file
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Checking Firebase Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "client/src/lib/firebase.ts" ]; then
  echo -e "${GREEN}✓${NC} Firebase configuration file found"
  
  # Check authDomain logic
  if grep -q "getAuthDomain" client/src/lib/firebase.ts; then
    echo -e "${GREEN}✓${NC} Dynamic authDomain configuration detected"
    echo "   This should use production domain in production"
  else
    echo -e "${YELLOW}⚠${NC} Static authDomain might be configured"
  fi
  
  # Check if googleProvider is configured
  if grep -q "GoogleAuthProvider" client/src/lib/firebase.ts; then
    echo -e "${GREEN}✓${NC} Google Auth Provider is configured"
  else
    echo -e "${RED}✗${NC} Google Auth Provider not found"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
else
  echo -e "${RED}✗${NC} Firebase configuration file not found"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Diagnostic Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
  echo -e "${GREEN}✓ No critical issues detected${NC}"
  echo ""
  echo "If OAuth is still not working, check:"
  echo "1. Firebase Console → Authorized domains"
  echo "2. Google Cloud Console → OAuth credentials"
  echo "3. Browser console for JavaScript errors"
else
  echo -e "${RED}✗ Found ${ISSUES_FOUND} issue(s)${NC}"
  echo ""
  echo "Please fix the issues above and re-run this script"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Required Configuration Checklist"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Firebase Console (console.firebase.google.com):"
echo "  □ Project: veefore-b84c8"
echo "  □ Authorized domains includes: veefore.com, app.veefore.com"
echo "  □ Google sign-in is enabled"
echo ""
echo "Google Cloud Console (console.cloud.google.com):"
echo "  □ Authorized JavaScript origins:"
echo "    - https://veefore.com"
echo "    - https://app.veefore.com"
echo "  □ Authorized redirect URIs:"
echo "    - https://veefore.com/__/auth/handler"
echo "    - https://app.veefore.com/__/auth/handler"
echo "    - https://veefore-b84c8.firebaseapp.com/__/auth/handler"
echo ""
echo "Production Environment:"
echo "  □ VITE_FIREBASE_API_KEY is set"
echo "  □ VITE_FIREBASE_PROJECT_ID is set"
echo "  □ VITE_FIREBASE_APP_ID is set"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "For detailed fix instructions, see: MANUAL_FIX_GUIDE.md"
echo ""
