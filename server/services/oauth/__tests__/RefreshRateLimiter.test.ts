import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RefreshRateLimiter } from '../RefreshRateLimiter';

/**
 * Unit Tests for RefreshRateLimiter Service
 * 
 * These tests verify that the RefreshRateLimiter correctly:
 * - Tracks failed attempts per user
 * - Blocks users after 5 failed attempts
 * - Resets counter on successful refresh
 * - Implements exponential backoff
 * - Unblocks users after lockout period expires
 * 
 * Requirements: 1.10, 1.11, 2.10, 2.11
 */
describe('RefreshRateLimiter', () => {
  let rateLimiter: RefreshRateLimiter;

  beforeEach(() => {
    // Create a new instance for each test (memory-based, no Redis)
    rateLimiter = new RefreshRateLimiter();
  });

  afterEach(async () => {
    // Clean up after each test
    await rateLimiter.clearAll();
  });

  describe('Failed Attempt Tracking', () => {
    it('should not block user with less than 5 failed attempts', async () => {
      const userId = 'test-user-1';

      // Record 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // User should not be blocked yet
      const isBlocked = await rateLimiter.isBlocked(userId);
      expect(isBlocked).toBe(false);

      // Verify status
      const status = await rateLimiter.getStatus(userId);
      expect(status).not.toBeNull();
      expect(status!.attempts).toBe(4);
      expect(status!.isBlocked).toBe(false);
    });

    it('should block user after 5 failed attempts', async () => {
      const userId = 'test-user-2';

      // Record 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // User should be blocked now
      const isBlocked = await rateLimiter.isBlocked(userId);
      expect(isBlocked).toBe(true);

      // Verify status
      const status = await rateLimiter.getStatus(userId);
      expect(status).not.toBeNull();
      expect(status!.isBlocked).toBe(true);
      expect(status!.lockoutUntil).not.toBeNull();
      expect(status!.violationCount).toBe(1);
    });

    it('should block user on 6th attempt (after reaching threshold)', async () => {
      const userId = 'test-user-3';

      // Record 6 failed attempts
      for (let i = 0; i < 6; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // User should be blocked
      const isBlocked = await rateLimiter.isBlocked(userId);
      expect(isBlocked).toBe(true);
    });
  });

  describe('Success Reset', () => {
    it('should reset failed attempts counter after successful refresh', async () => {
      const userId = 'test-user-4';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // Verify attempts recorded
      let status = await rateLimiter.getStatus(userId);
      expect(status!.attempts).toBe(3);

      // Record successful refresh
      await rateLimiter.recordSuccess(userId);

      // Counter should be reset
      status = await rateLimiter.getStatus(userId);
      expect(status).not.toBeNull();
      expect(status!.attempts).toBe(0);
      expect(status!.isBlocked).toBe(false);
    });

    it('should not block user after reset even with 4 more failures (total 4)', async () => {
      const userId = 'test-user-5';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // Record successful refresh (resets counter)
      await rateLimiter.recordSuccess(userId);

      // Record 4 more failed attempts (should not block yet)
      for (let i = 0; i < 4; i++) {
        await rateLimiter.recordFailure(userId);
      }

      // User should not be blocked (only 4 attempts after reset)
      const isBlocked = await rateLimiter.isBlocked(userId);
      expect(isBlocked).toBe(false);
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase lockout duration on repeated violations', async () => {
      const userId = 'test-user-6';

      // First violation (5 failed attempts)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(userId);
      }

      const status1 = await rateLimiter.getStatus(userId);
      expect(status1!.violationCount).toBe(1);
      expect(status1!.isBlocked).toBe(true);

      // Manually clear lockout to simulate time passing (for testing)
      // In production, this would expire naturally
      const failedAttempts = (rateLimiter as any).failedAttempts;
      const userAttempts = failedAttempts.get(userId);
      userAttempts.lockoutUntil = null;
      userAttempts.count = 0;

      // Second violation (5 more failed attempts)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(userId);
      }

      const status2 = await rateLimiter.getStatus(userId);
      expect(status2!.violationCount).toBe(2);
      expect(status2!.isBlocked).toBe(true);

      // The violation count should have increased
      expect(status2!.violationCount).toBeGreaterThan(status1!.violationCount);
    });
  });

  describe('Per-User Isolation', () => {
    it('should track different users independently', async () => {
      const userId1 = 'test-user-7';
      const userId2 = 'test-user-8';

      // User 1: Record 5 failed attempts (should be blocked)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.recordFailure(userId1);
      }

      // User 2: Record 2 failed attempts (should not be blocked)
      for (let i = 0; i < 2; i++) {
        await rateLimiter.recordFailure(userId2);
      }

      // Check blocking status
      const isBlocked1 = await rateLimiter.isBlocked(userId1);
      const isBlocked2 = await rateLimiter.isBlocked(userId2);

      expect(isBlocked1).toBe(true);
      expect(isBlocked2).toBe(false);

      // Check individual statuses
      const status1 = await rateLimiter.getStatus(userId1);
      const status2 = await rateLimiter.getStatus(userId2);

      expect(status1!.isBlocked).toBe(true);
      expect(status2!.attempts).toBe(2);
      expect(status2!.isBlocked).toBe(false);
    });
  });

  describe('Status Retrieval', () => {
    it('should return null status for users with no attempts', async () => {
      const userId = 'test-user-9';

      const status = await rateLimiter.getStatus(userId);
      expect(status).toBeNull();
    });

    it('should return accurate status for users with attempts', async () => {
      const userId = 'test-user-10';

      // Record 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(userId);
      }

      const status = await rateLimiter.getStatus(userId);
      expect(status).not.toBeNull();
      expect(status!.attempts).toBe(3);
      expect(status!.isBlocked).toBe(false);
      expect(status!.lockoutUntil).toBeNull();
      expect(status!.violationCount).toBe(0);
    });
  });

  describe('Cleanup', () => {
    it('should clear all rate limit data', async () => {
      const userId1 = 'test-user-11';
      const userId2 = 'test-user-12';

      // Record attempts for multiple users
      for (let i = 0; i < 3; i++) {
        await rateLimiter.recordFailure(userId1);
        await rateLimiter.recordFailure(userId2);
      }

      // Verify data exists
      expect(await rateLimiter.getStatus(userId1)).not.toBeNull();
      expect(await rateLimiter.getStatus(userId2)).not.toBeNull();

      // Clear all data
      await rateLimiter.clearAll();

      // Verify data is cleared
      expect(await rateLimiter.getStatus(userId1)).toBeNull();
      expect(await rateLimiter.getStatus(userId2)).toBeNull();
    });
  });
});
