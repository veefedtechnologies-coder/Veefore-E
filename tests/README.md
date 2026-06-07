# AI Generation Bug Exploration Tests

## Overview

This directory contains property-based tests for the AI Caption & Hashtag Generation System bug fix.

## Bug Being Tested

**Issue**: HTTP 400 "Invalid body data" errors when `mediaType` field is `undefined`, `null`, or omitted in requests to `/api/v1/ai/generate-content`

**Root Cause**: Zod schema validation fails even though `mediaType` is defined as optional with `.optional().nullable()`

## Test Files

### `ai-generation-bug-exploration.test.ts`

**Property 1: Bug Condition** - Optional MediaType Validation Failure

This test demonstrates the bug on UNFIXED code by:
- Sending requests with `mediaType: undefined`
- Sending requests with `mediaType: null`
- Sending requests with `mediaType` field omitted
- Using property-based testing to generate many test cases

**IMPORTANT**: This test is EXPECTED TO FAIL on unfixed code. Failure confirms the bug exists!

## Running the Tests

### Prerequisites

1. Set up environment variables:
   ```bash
   export TEST_AUTH_TOKEN="your-auth-token-here"
   export API_BASE_URL="http://localhost:3000"  # Optional, defaults to localhost:3000
   ```

2. Ensure the development server is running:
   ```bash
   npm run dev
   ```

### Run Bug Exploration Test

```bash
npm run test:bug-exploration
```

This will run the bug condition exploration test on the UNFIXED code.

### Run All Tests

```bash
npm test
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Interactive UI

```bash
npm run test:ui
```

## Expected Behavior

### On UNFIXED Code (Before Fix)

The test will **FAIL** with output like:

```
❌ BUG CONFIRMED: Request with undefined mediaType failed
Response: { error: 'Invalid body data' }

❌ BUG FOUND - Counterexample:
{
  requestBody: {
    mediaUrl: 'https://example.com/image.jpg',
    mediaType: undefined,
    platform: 'instagram'
  },
  response: { error: 'Invalid body data' }
}
```

**This is CORRECT!** The test failure proves the bug exists.

### After Fix (Expected to Pass)

After implementing the fix in `server/routes/v1/ai.routes.ts`, the test should **PASS** with output like:

```
✓ should accept request with mediaType: undefined
✓ should accept request with mediaType: null
✓ should accept request with mediaType field omitted
✓ PROPERTY: All requests with optional/missing mediaType should be accepted
```

## Test Documentation

### Counterexamples Found

The test documents counterexamples that demonstrate the bug:

1. **Request with `mediaType: undefined`**
   - Status: 400
   - Error: "Invalid body data"

2. **Request with `mediaType: null`**
   - Status: 400
   - Error: "Invalid body data"

3. **Request with mediaType omitted**
   - Status: 400
   - Error: "Invalid body data"

These confirm the root cause in the design document.

## Testing Framework

- **Vitest**: Modern, fast unit testing framework
- **fast-check**: Property-based testing library for generating test cases
- **Supertest**: HTTP assertion library for API testing

## Notes

- If `TEST_AUTH_TOKEN` is not set, tests will be skipped
- Tests require a running server instance
- Property-based tests generate 10 random test cases by default
- Tests verify the EXPECTED BEHAVIOR after the fix is implemented
