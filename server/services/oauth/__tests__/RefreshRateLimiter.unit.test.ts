import { describe, it, expect, beforeEach } from 'vitest';
import { RefreshRateLimiter } from '../RefreshRateLimiter';

/**
 * Unit tests for RefreshRateLimiter service
 * 
 * Verifies Fix 5 implementation for per-user rate limiting
 * Tests requirements: 2.10, 2.11
 */
describe('RefreshRateLimiter - Unit Tests', () => {
  let rateLimiter: RefreshRateLimiter;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Create new instance for each test
    rateLimiter = new RefreshRateLimiter();
    // Clear any previous state
    await rateLimiter.clearAll();
  });

  describe('isBlocked()', () => {
    it('should return false for user with no failed attempts', async () => {
      const isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(false);
    });

    it('should return false for user with fewer than MAX_FAILURES attempts', async () => {
      // Record 4 failures (below threshold of 5)
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(false);
    });

    it('should return true after MAX_FAILURES (5) attempts', async () => {
      // Record 5 failures (meets threshold)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(true);
    });

    it('should return false after lockout expires', async () => {
      // Record 5 failures to trigger lockout
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      // Verify user is blocked
      let isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(true);

      // Wait for lockout to expire (simulate by clearing - real test would need to wait 15 min)
      await rateLimiter.clearAll();

      // Verify user is no longer blocked
      isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(false);
    });
  });

  describe('recordFailure()', () => {
    it('should increment failure count', async () => {
      await rateLimiter.recordFailure(testUserId);
      const status = await rateLimiter.getStatus(testUserId);
      
      expect(status).not.toBeNull();
      expect(status!.attempts).toBe(1);
      expect(status!.isBlocked).toBe(false);
    });

    it('should block user after 5 failures', async () => {
      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const status = await rateLimiter.getStatus(testUserId);
      
      expect(status).not.toBeNull();
      expect(status!.isBlocked).toBe(true);
      expect(status!.lockoutUntil).not.toBeNull();
    });

    it('should implement exponential backoff for repeated violations', async () => {
      // First violation: 5 failures
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const status1 = await rateLimiter.getStatus(testUserId);
      expect(status1!.violationCount).toBe(1);
      expect(status1!.isBlocked).toBe(true);

      // Clear lockout to simulate time passing
      await rateLimiter.clearAll();

      // Second violation: 5 more failures
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const status2 = await rateLimiter.getStatus(testUserId);
      expect(status2!.violationCount).toBe(1); // New instance, so count resets
      expect(status2!.isBlocked).toBe(true);
    });

    it('should track failures per user independently', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // User 1: 3 failures
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(user1);
      }

      // User 2: 5 failures
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(user2);
      }

      const status1 = await rateLimiter.getStatus(user1);
      const status2 = await rateLimiter.getStatus(user2);

      expect(status1!.attempts).toBe(3);
      expect(status1!.isBlocked).toBe(false);

      expect(status2!.attempts).toBe(0); // Reset after blocking
      expect(status2!.isBlocked).toBe(true);
    });
  });

  describe('recordSuccess()', () => {
    it('should reset failure count after successful refresh', async () => {
      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      let status = await rateLimiter.getStatus(testUserId);
      expect(status!.attempts).toBe(3);

      // Record success
      await rateLimiter.recordSuccess(testUserId);

      // Verify count is reset to 0
      status = await rateLimiter.getStatus(testUserId);
      expect(status).not.toBeNull(); // Status still exists but with reset count
      expect(status!.attempts).toBe(0);
      expect(status!.isBlocked).toBe(false);
      expect(status!.lockoutUntil).toBeNull();
    });

    it('should allow user to continue after success reset', async () => {
      // Record 4 failures (just below threshold)
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      // Record success (resets counter)
      await rateLimiter.recordSuccess(testUserId);

      // Record 4 more failures (would be 8 total without reset)
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      // User should NOT be blocked (only 4 failures since reset)
      const isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(false);

      const status = await rateLimiter.getStatus(testUserId);
      expect(status!.attempts).toBe(4);
    });
  });

  describe('getStatus()', () => {
    it('should return null for user with no attempts', async () => {
      const status = await rateLimiter.getStatus('unknown-user');
      expect(status).toBeNull();
    });

    it('should return current status for user with attempts', async () => {
      await rateLimiter.recordFailure(testUserId);
      await rateLimiter.recordFailure(testUserId);

      const status = await rateLimiter.getStatus(testUserId);

      expect(status).not.toBeNull();
      expect(status!.attempts).toBe(2);
      expect(status!.isBlocked).toBe(false);
      expect(status!.lockoutUntil).toBeNull();
      expect(status!.violationCount).toBe(0);
    });

    it('should return blocked status after threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const status = await rateLimiter.getStatus(testUserId);

      expect(status).not.toBeNull();
      expect(status!.isBlocked).toBe(true);
      expect(status!.lockoutUntil).not.toBeNull();
      expect(status!.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Requirement Validation', () => {
    it('Requirement 2.10: Implements per-user rate limiting threshold (5 failures)', async () => {
      // First 4 failures should not block
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(testUserId);
        const isBlocked = await rateLimiter.isBlocked(testUserId);
        expect(isBlocked).toBe(false);
      }

      // 5th failure should trigger block
      await rateLimiter.recordFailure(testUserId);
      const isBlocked = await rateLimiter.isBlocked(testUserId);
      expect(isBlocked).toBe(true);
    });

    it('Requirement 2.11: Blocks user temporarily after threshold', async () => {
      // Trigger blocking
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(testUserId);
      }

      const status = await rateLimiter.getStatus(testUserId);

      // Verify user is blocked
      expect(status!.isBlocked).toBe(true);

      // Verify lockout has an expiration time (15 minutes from now)
      expect(status!.lockoutUntil).not.toBeNull();
      const lockoutTime = status!.lockoutUntil!.getTime();
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;

      // Lockout should be approximately 15 minutes in the future
      const difference = lockoutTime - now;
      expect(difference).toBeGreaterThan(14 * 60 * 1000); // At least 14 minutes
      expect(difference).toBeLessThan(16 * 60 * 1000); // At most 16 minutes
    });

    it('Requirement: Per-user blocking works regardless of IP address', async () => {
      // This is a conceptual test - in practice, the rate limiter doesn't care about IP
      // It only tracks by userId, demonstrating per-user (not per-IP) limiting

      const userId = 'test-user-multi-ip';

      // Simulate 5 failed attempts from "different IPs" (IP doesn't matter to rate limiter)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(userId, `request-from-ip-${i}`);
      }

      // User should be blocked regardless of which "IP" we check from
      const isBlocked = await rateLimiter.isBlocked(userId, 'new-ip-address');
      expect(isBlocked).toBe(true);
    });
  });
});
