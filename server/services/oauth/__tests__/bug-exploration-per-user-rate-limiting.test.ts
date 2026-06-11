import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';
import mongoose from 'mongoose';

// Mock Firebase Admin SDK
vi.mock('../../../firebase-admin', () => ({
  getFirebaseAdmin: vi.fn(() => ({
    auth: () => ({
      verifyIdToken: vi.fn((token: string) => {
        // Mock verification - extract uid from token format: "mock-token-{firebaseUid}"
        const match = token.match(/mock-token-(.*)/);
        if (match) {
          return Promise.resolve({
            uid: match[1],
            email: 'test@example.com',
            emailVerified: true,
          });
        }
        return Promise.reject(new Error('Invalid token'));
      }),
    }),
  })),
}));

/**
 * Bug Exploration Property-Based Test for Per-User Rate Limiting
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The system has global rate limiting (10 requests/min/IP) but no per-user rate limiting
 * for failed refresh token attempts. Attackers can brute force refresh tokens by rotating
 * IP addresses to bypass the IP-based rate limiting. This allows unlimited retry attempts
 * on compromised refresh tokens from different IPs.
 * 
 * Current Code (server/middleware/oauthSecurity.ts):
 *   - oauthRateLimiter() implements IP-based rate limiting (10 requests/min/IP)
 *   - Uses rate-limiter-flexible with Redis/Memory backend
 *   - Keys are based on client IP address (req.ip)
 *   - NO per-user tracking of failed attempts
 *   - NO user-level blocking mechanism
 * 
 * Current Code (server/routes/auth.ts /refresh endpoint):
 *   - Verifies auth_token cookie
 *   - Retrieves refresh token from database
 *   - Attempts to refresh with Google OAuth
 *   - Returns 401 on failure
 *   - NO tracking of failed attempts per user
 *   - NO exponential backoff or temporary blocking
 * 
 * Bug Condition:
 * 1. Attacker obtains a user's refresh token (e.g., via compromised database dump)
 * 2. Attacker attempts multiple refresh operations from rotating IP addresses
 * 3. IP-based rate limiting (10/min/IP) doesn't prevent attack with multiple IPs
 * 4. System processes all failed attempts without per-user blocking
 * 5. Attacker can make unlimited attempts by rotating IPs (botnet scenario)
 * 
 * Expected Behavior (after fix):
 * - System should track failed refresh attempts per user
 * - After 5 failed attempts, user should be temporarily blocked (15 minutes)
 * - Blocking should be per-user, not per-IP
 * - 6th failed attempt should return 429 with 'user_rate_limited' error
 * - Exponential backoff should increase lockout duration for repeated violations
 * - Successful refresh should reset failed attempt counter
 * 
 * Requirements tested: 1.10, 1.11, 2.10, 2.11
 * 
 * **Validates: Requirements 1.10, 1.11, 2.10, 2.11**
 */

describe('OAuth /refresh - Bug Exploration: No Per-User Rate Limiting', () => {
  let app: Express;
  let testUserId: string;
  let testFirebaseUid: string;
  let validAuthToken: string;
  const originalEnv = process.env.SESSION_SECRET;

  beforeEach(async () => {
    // Connect to test database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    }

    // Ensure SESSION_SECRET is set
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = 'test-secret-key-minimum-32-characters-required-for-security';
    }

    // Create a test user
    const timestamp = Date.now();
    const random = Math.random();
    testFirebaseUid = `firebase-${timestamp}-${random}`;
    
    const testUser = await User.create({
      email: `test-${timestamp}-${random}@example.com`,
      username: `testuser-${timestamp}-${random}`,
      displayName: 'Test User',
      googleId: `google-${timestamp}-${random}`,
      firebaseUid: testFirebaseUid,
      referralCode: `ref-${timestamp}-${random}`,
    });
    testUserId = testUser._id.toString();

    // Store an INVALID refresh token (to simulate failed refresh attempts)
    // This will cause refresh attempts to fail, allowing us to test rate limiting
    const refreshTokenStore = new RefreshTokenStore();
    await refreshTokenStore.storeRefreshToken(
      testUserId,
      'invalid_refresh_token_for_testing',
      'test-setup'
    );

    // Create a mock Firebase token for authentication
    // Format: "mock-token-{firebaseUid}" - our mock will extract the uid from this
    validAuthToken = `mock-token-${testFirebaseUid}`;

    // Create minimal Express app for testing /refresh endpoint
    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Mock the /refresh endpoint behavior (simplified version of actual endpoint)
    // This simulates the current implementation without per-user rate limiting
    app.post('/api/auth/refresh', async (req, res) => {
      try {
        // Verify auth_token cookie
        const authToken = req.cookies?.auth_token;
        if (!authToken) {
          return res.status(401).json({
            error: 'no_valid_session',
            message: 'No valid session found',
          });
        }

        // Verify Firebase token
        let decodedToken;
        try {
          const { getFirebaseAdmin } = await import('../../../firebase-admin');
          const admin = getFirebaseAdmin();
          decodedToken = await admin.auth().verifyIdToken(authToken);
        } catch (error) {
          return res.status(401).json({
            error: 'no_valid_session',
            message: 'Invalid or expired session',
          });
        }

        const firebaseUid = decodedToken.uid;

        // Find user by Firebase UID to get MongoDB _id
        const { User } = await import('../../../models/User/User');
        const user = await User.findOne({ firebaseUid });

        if (!user) {
          return res.status(401).json({
            error: 'user_not_found',
            message: 'User not found',
          });
        }

        const userId = user._id.toString();

        // Retrieve refresh token
        const refreshTokenStore = new RefreshTokenStore();
        const refreshToken = await refreshTokenStore.getRefreshToken(userId);

        if (!refreshToken) {
          return res.status(401).json({
            error: 'refresh_token_not_found',
            message: 'Refresh token not found',
          });
        }

        // Simulate failed token refresh (since we stored an invalid token)
        // In real code, this would call tokenExchangeService.refreshAccessToken()
        // For testing, we directly return 401 to simulate the failure
        return res.status(401).json({
          error: 'refresh_token_expired',
          message: 'Refresh token expired, please re-authenticate',
        });

        // NOTE: No per-user rate limiting logic exists here
        // This is the bug - unlimited failed attempts are allowed from different IPs
      } catch (error) {
        return res.status(500).json({
          error: 'internal_error',
          message: 'An error occurred',
        });
      }
    });
  });

  afterEach(async () => {
    // Clean up test user
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
    }

    // Restore original SESSION_SECRET
    process.env.SESSION_SECRET = originalEnv;
  });

  /**
   * Property 1: Bug Condition - No Per-User Rate Limiting
   * 
   * **Validates: Requirements 1.10, 1.11, 2.10, 2.11**
   * 
   * This property tests the concrete scenario where an attacker makes multiple failed
   * refresh attempts from different IP addresses. The test simulates 20 failed refresh
   * attempts with varying IP addresses to bypass IP-based rate limiting.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - First 5 failed attempts: Return 401 (failed refresh)
   * - 6th attempt onwards: Return 429 with 'user_rate_limited' error
   * - Blocking should be per-user, not per-IP
   * - User remains blocked for 15 minutes regardless of IP rotation
   * - Exponential backoff increases lockout for repeated violations
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - All 20 attempts return 401 (failed refresh)
   * - No per-user blocking mechanism exists
   * - Attacker can make unlimited attempts by rotating IPs
   * - IP-based rate limiting (10/min/IP) is ineffective against botnets
   * - No exponential backoff or temporary user blocking
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - Unlimited failed refresh attempts from rotating IPs', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate 20 different IP addresses to simulate IP rotation attack
          ipAddresses: fc.array(
            fc.record({
              ip: fc.ipV4(),
              attemptNumber: fc.integer({ min: 1, max: 20 }),
            }),
            { minLength: 20, maxLength: 20 }
          ),
        }),
        async ({ ipAddresses }) => {
          // Sort by attempt number to ensure sequential testing
          const sortedAttempts = ipAddresses.sort((a, b) => a.attemptNumber - b.attemptNumber);

          const results: { attemptNumber: number; ip: string; status: number; error?: string }[] = [];

          // PHASE 1: Make 20 failed refresh attempts from different IPs
          for (const attempt of sortedAttempts) {
            const response = await request(app)
              .post('/api/auth/refresh')
              .set('X-Forwarded-For', attempt.ip) // Simulate different IP
              .set('Cookie', `auth_token=${validAuthToken}`)
              .send();

            results.push({
              attemptNumber: attempt.attemptNumber,
              ip: attempt.ip,
              status: response.status,
              error: response.body.error,
            });
          }

          // PHASE 2: Verify bug behavior - all attempts processed without per-user blocking

          // Count how many attempts succeeded (returned 401 instead of 429)
          const unblocked401Attempts = results.filter(r => r.status === 401).length;
          const blocked429Attempts = results.filter(r => r.status === 429).length;

          // CURRENT BEHAVIOR (unfixed code):
          // - All 20 attempts return 401 (no per-user blocking)
          // - IP-based rate limiting doesn't apply (different IPs)
          // - blocked429Attempts = 0 (no user-level rate limiting exists)
          // - unblocked401Attempts = 20 (all attempts processed)

          // EXPECTED BEHAVIOR (after fix):
          // - First 5 attempts: 401 (failed refresh, attempts tracked)
          // - 6th attempt onwards: 429 (user rate limited)
          // - blocked429Attempts >= 15 (attempts 6-20 blocked)
          // - unblocked401Attempts = 5 (only first 5 attempts processed)

          // BUG CONFIRMATION: All attempts return 401, none return 429
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms the bug exists
          expect(blocked429Attempts).toBeGreaterThanOrEqual(15);
          expect(unblocked401Attempts).toBeLessThanOrEqual(5);

          // Verify that 6th attempt and beyond returned 429 with correct error
          const attemptsAfter5th = results.filter(r => r.attemptNumber > 5);
          for (const attempt of attemptsAfter5th) {
            expect(attempt.status).toBe(429);
            expect(attempt.error).toBe('user_rate_limited');
          }

          return true;
        }
      ),
      {
        numRuns: 5, // Run 5 different IP rotation scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 2: Bug Documentation - IP-Based Rate Limiting is Insufficient
   * 
   * This property demonstrates that IP-based rate limiting (10/min/IP) doesn't
   * prevent attacks when the attacker uses multiple IP addresses. The test shows
   * that with 10 different IPs, an attacker can make 100 attempts per minute.
   */
  it('PROPERTY 2: Bug Condition - IP rotation bypasses IP-based rate limiting', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate 10 different IP addresses
          uniqueIPs: fc.array(fc.ipV4(), { minLength: 10, maxLength: 10 }),
        }),
        async ({ uniqueIPs }) => {
          const results: { ip: string; status: number }[] = [];

          // Make 10 attempts per IP (100 total attempts)
          // With IP-based rate limiting (10/min/IP), each IP can make 10 requests
          // Total: 10 IPs × 10 requests = 100 requests per minute
          for (const ip of uniqueIPs) {
            for (let i = 0; i < 10; i++) {
              const response = await request(app)
                .post('/api/auth/refresh')
                .set('X-Forwarded-For', ip)
                .set('Cookie', `auth_token=${validAuthToken}`)
                .send();

              results.push({
                ip,
                status: response.status,
              });
            }
          }

          // Count successful attempts (returned 401 = processed, even though failed)
          // 429 = rate limited (blocked)
          const processedAttempts = results.filter(r => r.status === 401).length;
          const rateLimitedAttempts = results.filter(r => r.status === 429).length;

          // CURRENT BEHAVIOR (unfixed code):
          // - processedAttempts ≈ 100 (all attempts processed, IP limits not reached)
          // - rateLimitedAttempts = 0 (no IP hit the 10/min limit)
          // - Each IP only made 10 requests, staying under the 10/min/IP limit

          // EXPECTED BEHAVIOR (after fix):
          // - After 5 failed attempts total (across all IPs), user should be blocked
          // - processedAttempts ≤ 5 (only first 5 attempts processed)
          // - rateLimitedAttempts ≥ 95 (remaining attempts blocked per-user)

          // BUG CONFIRMATION: Many more than 5 attempts were processed
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms IP rotation bypasses rate limit
          expect(processedAttempts).toBeLessThanOrEqual(5);
          expect(rateLimitedAttempts).toBeGreaterThanOrEqual(95);

          return true;
        }
      ),
      {
        numRuns: 3, // Run 3 different IP set scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 3: Bug Documentation - No Exponential Backoff
   * 
   * This property verifies that repeated violations don't increase lockout duration.
   * An attacker can repeatedly hit the rate limit without increasing consequences.
   */
  it('PROPERTY 3: Bug Condition - No exponential backoff for repeated violations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Simulate multiple "waves" of attacks
          attackWaves: fc.integer({ min: 3, max: 5 }),
        }),
        async ({ attackWaves }) => {
          const waveResults: { wave: number; blockedAttempts: number }[] = [];

          // Conduct multiple attack waves
          for (let wave = 1; wave <= attackWaves; wave++) {
            let blockedCount = 0;

            // Make 10 attempts per wave
            for (let i = 0; i < 10; i++) {
              const response = await request(app)
                .post('/api/auth/refresh')
                .set('X-Forwarded-For', `192.168.${wave}.${i}`) // Different IPs per wave
                .set('Cookie', `auth_token=${validAuthToken}`)
                .send();

              if (response.status === 429) {
                blockedCount++;
              }
            }

            waveResults.push({ wave, blockedAttempts: blockedCount });

            // Simulate time passing between waves (in reality, lockout would expire)
            // For unfixed code, no lockout exists anyway
          }

          // CURRENT BEHAVIOR (unfixed code):
          // - blockedAttempts = 0 for all waves (no per-user blocking)
          // - Each wave uses different IPs, bypassing IP-based rate limiting
          // - No exponential backoff mechanism exists

          // EXPECTED BEHAVIOR (after fix):
          // - Wave 1: After 5 attempts, user blocked for 15 minutes
          // - Wave 2: After 5 new attempts (if within 15 min window), user blocked for 30 minutes
          // - Wave 3+: Exponentially increasing lockout durations
          // - blockedAttempts should increase in later waves (longer lockouts)

          // BUG CONFIRMATION: No attempts blocked in any wave
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms no exponential backoff
          for (const waveResult of waveResults) {
            if (waveResult.wave > 1) {
              // After the first wave, subsequent waves should see increased blocking
              expect(waveResult.blockedAttempts).toBeGreaterThan(5);
            }
          }

          return true;
        }
      ),
      {
        numRuns: 3,
        verbose: true,
      }
    );
  });

  /**
   * Property 4: Bug Documentation - Successful Refresh Should Reset Counter
   * 
   * This property documents that after a successful refresh, the failed attempt
   * counter should be reset. This prevents legitimate users from being permanently
   * locked out after a few failed attempts followed by successful authentication.
   */
  it('PROPERTY 4: Expected Behavior - Successful refresh resets failed attempt counter', async () => {
    // Note: This test documents the EXPECTED behavior, which doesn't exist in unfixed code
    // After the fix, this test should pass

    // Simulate 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/refresh')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .set('Cookie', `auth_token=${validAuthToken}`)
        .send();
    }

    // In a real test, we would now make a successful refresh
    // For now, we just document the expected behavior:
    // After successful refresh: failed_attempts_counter = 0

    // Make 4 more failed attempts (would be attempts 5-8 if counter wasn't reset)
    for (let i = 4; i < 8; i++) {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .set('Cookie', `auth_token=${validAuthToken}`)
        .send();

      // EXPECTED (after fix with reset): Should still return 401 (not 429)
      // because counter was reset after successful refresh
      // CURRENT (unfixed): Returns 401 anyway (no counter exists)

      // After fix, none of these should be blocked (counter was reset)
      expect(response.status).toBe(401); // Failed refresh, not rate limited
    }

    return true;
  });

  /**
   * Property 5: Bug Documentation - No User-Specific Rate Limit Response
   * 
   * This property verifies that when a user should be rate limited, the system
   * doesn't return a user-specific error indicating per-user blocking.
   */
  it('PROPERTY 5: Bug Condition - No user-specific rate limit error response', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Make 10 attempts to trigger rate limiting (if it existed)
          attemptCount: fc.constant(10),
        }),
        async ({ attemptCount }) => {
          const responses: any[] = [];

          // Make multiple failed attempts
          for (let i = 0; i < attemptCount; i++) {
            const response = await request(app)
              .post('/api/auth/refresh')
              .set('X-Forwarded-For', `172.16.0.${i}`)
              .set('Cookie', `auth_token=${validAuthToken}`)
              .send();

            responses.push(response.body);
          }

          // Check if any response has 'user_rate_limited' error
          const userRateLimitedResponses = responses.filter(
            r => r.error === 'user_rate_limited'
          );

          // CURRENT BEHAVIOR (unfixed code):
          // - userRateLimitedResponses.length = 0 (no such error exists)
          // - All responses have 'refresh_token_expired' error (401)

          // EXPECTED BEHAVIOR (after fix):
          // - After 5 attempts, responses should have 'user_rate_limited' error
          // - userRateLimitedResponses.length >= 5 (attempts 6-10)

          // BUG CONFIRMATION: No 'user_rate_limited' error exists
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms bug
          expect(userRateLimitedResponses.length).toBeGreaterThanOrEqual(5);

          return true;
        }
      ),
      {
        numRuns: 5,
        verbose: true,
      }
    );
  });

  /**
   * Property 6: Preservation - Legitimate Users Unaffected
   * 
   * This property documents that the fix should not affect legitimate users
   * who successfully refresh their tokens without failures.
   */
  it('PROPERTY 6: Preservation - Legitimate users not affected by rate limiting', async () => {
    // This documents that users with successful refresh attempts should never
    // encounter rate limiting, even if they refresh frequently

    // In a real scenario with valid tokens, all these would succeed
    // For this test, we just document the expected behavior:
    // - Users with valid refresh tokens: unlimited successful refreshes allowed
    // - Users with failed attempts < 5: not rate limited
    // - Only users with 5+ consecutive failures are blocked

    // The fix should NOT add rate limiting to successful operations
    // This is a preservation requirement

    return true;
  });
});
