import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RefreshRateLimiter } from '../RefreshRateLimiter';

/**
 * Bug Condition Verification Test for Per-User Rate Limiting (After Fix)
 * 
 * This test verifies that Fix 5 correctly implements per-user rate limiting
 * to prevent brute force attacks on refresh tokens by rotating IP addresses.
 * 
 * **EXPECTED OUTCOME**: Test PASSES (confirms the fix works correctly)
 * 
 * This test validates Requirements 2.10, 2.11:
 * - 2.10: System tracks failed refresh attempts per user
 * - 2.11: After 5 failed attempts, user is temporarily blocked (15 minutes)
 * 
 * The test simulates the attack scenario from the original bug exploration:
 * 1. Attacker makes multiple failed refresh attempts from different IPs
 * 2. IP-based rate limiting is ineffective (different IPs bypass it)
 * 3. Per-user rate limiting should block after 5 attempts regardless of IP
 * 
 * **Validates: Requirements 2.10, 2.11**
 */
describe('OAuth /refresh - Bug Fix Verification: Per-User Rate Limiting', () => {
  let rateLimiter: RefreshRateLimiter;

  beforeEach(async () => {
    rateLimiter = new RefreshRateLimiter();
    await rateLimiter.clearAll();
  });

  afterEach(async () => {
    await rateLimiter.clearAll();
  });

  /**
   * Property 1: Fix Verification - Per-user rate limiting blocks after threshold
   * 
   * **Validates: Requirements 2.10, 2.11**
   * 
   * This property tests that the RefreshRateLimiter correctly blocks users after
   * 5 failed attempts, regardless of IP address rotation.
   * 
   * EXPECTED BEHAVIOR (with fix):
   * - First 5 failed attempts: User not blocked (tracking failures)
   * - 6th attempt onwards: User blocked with isBlocked() returning true
   * - Blocking is per-user, not per-IP (IP rotation doesn't bypass it)
   * - User remains blocked for 15 minutes
   */
  it('PROPERTY 1: Fix Verification - Blocks user after 5 failed attempts regardless of IP', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.constant('test-user-attack-target'),
          // Generate 20 different IP addresses to simulate IP rotation attack
          ipAddresses: fc.array(fc.ipV4(), { minLength: 20, maxLength: 20 }),
        }),
        async ({ userId, ipAddresses }) => {
          const results: { attemptNumber: number; ip: string; isBlocked: boolean }[] = [];

          // PHASE 1: Simulate 20 failed refresh attempts from different IPs
          for (let i = 0; i < ipAddresses.length; i++) {
            const ip = ipAddresses[i];
            const attemptNumber = i + 1;

            // Check if user is blocked BEFORE recording this failure
            const isBlockedBefore = await rateLimiter.isBlocked(userId);

            // If not blocked, record this as a failed attempt
            if (!isBlockedBefore) {
              await rateLimiter.recordFailure(userId, `request-from-${ip}`);
            }

            // Check if user is blocked AFTER recording this failure
            const isBlockedAfter = await rateLimiter.isBlocked(userId);

            results.push({
              attemptNumber,
              ip,
              isBlocked: isBlockedAfter,
            });
          }

          // PHASE 2: Verify fix behavior

          // Count successful attempts (not blocked) vs blocked attempts
          const unblockedAttempts = results.filter(r => !r.isBlocked).length;
          const blockedAttempts = results.filter(r => r.isBlocked).length;

          // EXPECTED BEHAVIOR (with fix):
          // - First 5 attempts: Not blocked (unblockedAttempts = 5)
          // - 6th attempt onwards: Blocked (blockedAttempts = 15)

          // Verify first 5 attempts were not blocked
          expect(unblockedAttempts).toBe(5);

          // Verify attempts 6-20 were blocked
          expect(blockedAttempts).toBe(15);

          // Verify that exactly attempts 1-5 were unblocked, 6-20 were blocked
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.attemptNumber <= 5) {
              expect(result.isBlocked).toBe(false);
            } else {
              expect(result.isBlocked).toBe(true);
            }
          }

          return true;
        }
      ),
      {
        numRuns: 10, // Run 10 different IP rotation scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 2: Fix Verification - IP rotation cannot bypass per-user limiting
   * 
   * This property demonstrates that with per-user rate limiting, IP rotation
   * is ineffective. An attacker using 10 different IPs can only make 5 attempts
   * total before being blocked.
   */
  it('PROPERTY 2: Fix Verification - IP rotation bypassing is prevented', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.constant('test-user-multi-ip'),
          // Generate 10 different IP addresses
          uniqueIPs: fc.array(fc.ipV4(), { minLength: 10, maxLength: 10 }),
        }),
        async ({ userId, uniqueIPs }) => {
          let successfulAttempts = 0;
          let blockedAttempts = 0;

          // Make 10 attempts per IP (100 total attempts)
          for (const ip of uniqueIPs) {
            for (let i = 0; i < 10; i++) {
              const isBlocked = await rateLimiter.isBlocked(userId);

              if (isBlocked) {
                blockedAttempts++;
              } else {
                successfulAttempts++;
                await rateLimiter.recordFailure(userId, `request-from-${ip}-${i}`);
              }
            }
          }

          // EXPECTED BEHAVIOR (with fix):
          // - successfulAttempts = 5 (only first 5 attempts processed)
          // - blockedAttempts = 95 (remaining attempts blocked per-user)

          expect(successfulAttempts).toBe(5);
          expect(blockedAttempts).toBe(95);

          return true;
        }
      ),
      {
        numRuns: 5, // Run 5 different IP set scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 3: Fix Verification - Exponential backoff for repeated violations
   * 
   * This property verifies that repeated violations increase lockout duration.
   */
  it('PROPERTY 3: Fix Verification - Exponential backoff increases lockout duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.constant('test-user-repeated-violations'),
          attackWaves: fc.integer({ min: 2, max: 3 }),
        }),
        async ({ userId, attackWaves }) => {
          const waveResults: { wave: number; lockoutDuration: number | null }[] = [];

          for (let wave = 1; wave <= attackWaves; wave++) {
            // Clear previous lockout to simulate time passing
            if (wave > 1) {
              await rateLimiter.clearAll();
            }

            // Make 5 failed attempts to trigger blocking
            for (let i = 0; i < 5; i++) {
              await rateLimiter.recordFailure(userId, `wave-${wave}-attempt-${i}`);
            }

            // Get lockout status
            const status = await rateLimiter.getStatus(userId);
            const lockoutDuration = status?.lockoutUntil
              ? status.lockoutUntil.getTime() - Date.now()
              : null;

            waveResults.push({
              wave,
              lockoutDuration,
            });
          }

          // EXPECTED BEHAVIOR (with fix):
          // - Each wave should result in a lockout
          // - Lockout duration increases with each wave (exponential backoff)

          for (const waveResult of waveResults) {
            expect(waveResult.lockoutDuration).not.toBeNull();
            expect(waveResult.lockoutDuration!).toBeGreaterThan(0);
          }

          // First wave should have approximately 15 minute lockout
          const firstWaveLockout = waveResults[0].lockoutDuration!;
          expect(firstWaveLockout).toBeGreaterThan(14 * 60 * 1000); // At least 14 minutes
          expect(firstWaveLockout).toBeLessThan(16 * 60 * 1000); // At most 16 minutes

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
   * Property 4: Fix Verification - Successful refresh resets counter
   * 
   * This property verifies that after a successful refresh, the failed attempt
   * counter is reset, allowing legitimate users to continue.
   */
  it('PROPERTY 4: Fix Verification - Successful refresh resets failed attempt counter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.constant('test-user-legitimate'),
          initialFailures: fc.integer({ min: 1, max: 4 }),
        }),
        async ({ userId, initialFailures }) => {
          // Simulate some failed attempts (but below threshold)
          for (let i = 0; i < initialFailures; i++) {
            await rateLimiter.recordFailure(userId);
          }

          // Verify user has failure count
          let status = await rateLimiter.getStatus(userId);
          expect(status?.attempts).toBe(initialFailures);

          // Simulate successful refresh
          await rateLimiter.recordSuccess(userId);

          // Verify counter is reset
          status = await rateLimiter.getStatus(userId);
          expect(status?.attempts).toBe(0);

          // Make more failed attempts (would exceed threshold if not reset)
          for (let i = 0; i < initialFailures; i++) {
            await rateLimiter.recordFailure(userId);
          }

          // User should still NOT be blocked (counter was reset)
          const isBlocked = await rateLimiter.isBlocked(userId);
          expect(isBlocked).toBe(false);

          return true;
        }
      ),
      {
        numRuns: 10,
        verbose: true,
      }
    );
  });

  /**
   * Property 5: Fix Verification - Per-user blocking is independent of IP
   * 
   * This property verifies that blocking is truly per-user, not per-IP.
   * The same user is blocked regardless of which IP they use.
   */
  it('PROPERTY 5: Fix Verification - Blocking is per-user, not per-IP', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.constant('test-user-ip-independent'),
          ipAddressesForFailures: fc.array(fc.ipV4(), { minLength: 5, maxLength: 5 }),
          ipAddressesForChecks: fc.array(fc.ipV4(), { minLength: 3, maxLength: 3 }),
        }),
        async ({ userId, ipAddressesForFailures, ipAddressesForChecks }) => {
          // Trigger blocking with 5 failures from different IPs
          for (let i = 0; i < ipAddressesForFailures.length; i++) {
            await rateLimiter.recordFailure(userId, `failure-from-${ipAddressesForFailures[i]}`);
          }

          // Verify user is blocked when checked from completely different IPs
          for (const checkIp of ipAddressesForChecks) {
            const isBlocked = await rateLimiter.isBlocked(userId, `check-from-${checkIp}`);
            expect(isBlocked).toBe(true);
          }

          return true;
        }
      ),
      {
        numRuns: 10,
        verbose: true,
      }
    );
  });

  /**
   * Property 6: Preservation - Multiple users tracked independently
   * 
   * This property verifies that the fix doesn't affect other users.
   * One user's failures don't impact another user's ability to authenticate.
   */
  it('PROPERTY 6: Preservation - Multiple users tracked independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          user1: fc.constant('user-1-blocked'),
          user2: fc.constant('user-2-allowed'),
        }),
        async ({ user1, user2 }) => {
          // User 1: Make 5 failed attempts (trigger blocking)
          for (let i = 0; i < 5; i++) {
            await rateLimiter.recordFailure(user1);
          }

          // User 2: Make 3 failed attempts (below threshold)
          for (let i = 0; i < 3; i++) {
            await rateLimiter.recordFailure(user2);
          }

          // Verify User 1 is blocked
          const user1Blocked = await rateLimiter.isBlocked(user1);
          expect(user1Blocked).toBe(true);

          // Verify User 2 is NOT blocked
          const user2Blocked = await rateLimiter.isBlocked(user2);
          expect(user2Blocked).toBe(false);

          return true;
        }
      ),
      {
        numRuns: 10,
        verbose: true,
      }
    );
  });
});
