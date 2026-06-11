import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';
import mongoose from 'mongoose';

/**
 * Bug Exploration Property-Based Test for Refresh Token Expiration
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * Refresh tokens stored in MongoDB have a `refreshTokenCreatedAt` timestamp but no expiration
 * checking or cleanup mechanism. Expired and revoked tokens accumulate indefinitely, causing
 * database bloat and security risks. The system attempts to use stale tokens without checking
 * their age, resulting in failed refresh attempts with poor error messages.
 * 
 * Current Code (RefreshTokenStore.ts):
 *   - storeRefreshToken() sets refreshTokenCreatedAt field (line 74)
 *   - getRefreshToken() retrieves and decrypts token (line 91-130)
 *   - NO expiration checking logic exists
 *   - NO maximum lifetime enforcement (should be 90 days)
 * 
 * Bug Condition:
 * 1. User authenticates and system stores refresh token with refreshTokenCreatedAt timestamp
 * 2. Time passes (e.g., 91 days)
 * 3. User attempts to refresh their session
 * 4. System retrieves and uses the stale token without checking age
 * 5. Refresh fails with cryptic error, OR succeeds but uses expired credential
 * 
 * Expected Behavior (after fix):
 * - System should enforce maximum token lifetime (90 days)
 * - System should check refreshTokenCreatedAt before returning token
 * - System should return null for expired tokens
 * - System should log clear expiration message
 * - System should create MongoDB TTL index for automatic cleanup
 * - Background job should remove expired tokens to prevent database bloat
 * 
 * Requirements tested: 1.7, 1.8, 1.9, 2.7, 2.8, 2.9
 * 
 * **Validates: Requirements 1.7, 1.8, 1.9, 2.7, 2.8, 2.9**
 */

describe('RefreshTokenStore - Bug Exploration: No Token Expiration/Cleanup', () => {
  let testUserId: string;
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
    const testUser = await User.create({
      email: `test-${timestamp}-${random}@example.com`,
      username: `testuser-${timestamp}-${random}`,
      displayName: 'Test User',
      googleId: `google-${timestamp}-${random}`,
      firebaseUid: `firebase-${timestamp}-${random}`,
      referralCode: `ref-${timestamp}-${random}`,
    });
    testUserId = testUser._id.toString();
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
   * Property 1: Bug Condition - No Token Expiration/Cleanup
   * 
   * **Validates: Requirements 1.7, 1.8, 1.9, 2.7, 2.8, 2.9**
   * 
   * This property tests the concrete scenario where a refresh token is older than 90 days.
   * It creates a token with refreshTokenCreatedAt set to 91 days ago, then attempts to
   * retrieve it using getRefreshToken().
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - System should check token age before returning it
   * - Tokens older than 90 days should be rejected (return null)
   * - System should log clear expiration message
   * - Expired token should be deleted from database
   * - User should be prompted to re-authenticate
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - getRefreshToken() retrieves token without checking refreshTokenCreatedAt (line 91-130)
   * - No expiration validation logic exists
   * - Old token (91 days) is returned as if it were fresh
   * - System attempts to use expired credential
   * - Refresh may fail with cryptic error, or worse, succeed with compromised security
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - Token older than 90 days must be rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate realistic OAuth refresh tokens
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          // Test with tokens ranging from 91 to 365 days old
          ageInDays: fc.integer({ min: 91, max: 365 }),
        }),
        async ({ refreshToken, ageInDays }) => {
          const store = new RefreshTokenStore();

          // PHASE 1: Store token with recent timestamp (simulate initial creation)
          await store.storeRefreshToken(testUserId, refreshToken, 'test-phase-1');

          // Verify token was stored with current timestamp
          let user = await User.findById(testUserId).select('refreshTokenCreatedAt');
          expect(user?.refreshTokenCreatedAt).toBeDefined();

          // PHASE 2: Manually modify refreshTokenCreatedAt to simulate old token
          // This simulates a token that was created ageInDays days ago
          const oldTimestamp = new Date();
          oldTimestamp.setDate(oldTimestamp.getDate() - ageInDays);

          await User.findByIdAndUpdate(testUserId, {
            refreshTokenCreatedAt: oldTimestamp,
          });

          // Verify the timestamp was updated correctly
          user = await User.findById(testUserId).select('refreshTokenCreatedAt');
          const tokenAge = Date.now() - user!.refreshTokenCreatedAt!.getTime();
          const tokenAgeInDays = tokenAge / (1000 * 60 * 60 * 24);
          expect(tokenAgeInDays).toBeGreaterThanOrEqual(ageInDays - 1); // Allow 1 day margin

          // PHASE 3: Attempt to retrieve expired token
          // This is where the bug manifests - token should be rejected but isn't
          const retrievedToken = await store.getRefreshToken(testUserId, 'test-phase-3');

          // EXPECTED BEHAVIOR (after fix): Token should be rejected (null)
          // The fixed implementation should:
          // 1. Check refreshTokenCreatedAt timestamp
          // 2. Calculate token age
          // 3. Compare against maximum lifetime (90 days)
          // 4. Return null if expired
          // 5. Log expiration message with token age
          // 6. Delete expired token from database

          // ACTUAL BEHAVIOR (unfixed code): retrievedToken will be the decrypted token
          // The current implementation:
          // - Does NOT check refreshTokenCreatedAt (no expiration logic exists)
          // - Returns the decrypted token regardless of age
          // - Allows 91+ day old tokens to be used
          // - No cleanup, no logging of expiration

          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms the bug exists
          expect(retrievedToken).toBeNull();

          // Additional verification: Expired token should have been deleted
          user = await User.findById(testUserId).select('refreshToken refreshTokenCreatedAt');
          expect(user?.refreshToken).toBeUndefined();
          expect(user?.refreshTokenCreatedAt).toBeUndefined();

          return true;
        }
      ),
      {
        numRuns: 20, // Test with 20 different token ages (91-365 days)
        verbose: true,
      }
    );
  });

  /**
   * Property 2: Bug Documentation - Tokens Within Lifetime Should Be Accepted
   * 
   * This property documents that fresh tokens (< 90 days) should still work correctly.
   * This ensures the fix doesn't break valid token retrieval.
   */
  it('PROPERTY 2: Preservation - Tokens within 90-day lifetime should be accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          // Test with tokens ranging from 0 to 89 days old (within lifetime)
          ageInDays: fc.integer({ min: 0, max: 89 }),
        }),
        async ({ refreshToken, ageInDays }) => {
          const store = new RefreshTokenStore();

          // Store token
          await store.storeRefreshToken(testUserId, refreshToken, 'test-fresh-token');

          // Modify timestamp to simulate token of specific age (but still valid)
          const timestamp = new Date();
          timestamp.setDate(timestamp.getDate() - ageInDays);

          await User.findByIdAndUpdate(testUserId, {
            refreshTokenCreatedAt: timestamp,
          });

          // Attempt to retrieve valid (non-expired) token
          const retrievedToken = await store.getRefreshToken(testUserId, 'test-retrieve-fresh');

          // EXPECTED BEHAVIOR: Token should be successfully retrieved
          // Fresh tokens (< 90 days) should continue to work
          expect(retrievedToken).toBe(refreshToken);
          expect(retrievedToken).not.toBeNull();

          return true;
        }
      ),
      {
        numRuns: 20, // Test with 20 different fresh token ages (0-89 days)
        verbose: true,
      }
    );
  });

  /**
   * Property 3: Bug Documentation - No TTL Index Exists
   * 
   * This property verifies that the User model does not have a TTL index on
   * refreshTokenCreatedAt, meaning expired tokens are never automatically cleaned up.
   */
  it('PROPERTY 3: Bug Condition - No TTL index for automatic cleanup', async () => {
    // Check the User model indexes
    const indexes = User.schema.indexes();

    // Look for a TTL index on refreshTokenCreatedAt
    const ttlIndex = indexes.find((index: any) => {
      const indexFields = index[0];
      const indexOptions = index[1];
      return (
        indexFields.refreshTokenCreatedAt &&
        indexOptions &&
        'expireAfterSeconds' in indexOptions
      );
    });

    // BUG CONFIRMATION: No TTL index exists
    // This means expired tokens accumulate indefinitely in the database
    // 
    // EXPECTED (after fix): A TTL index should exist:
    // UserSchema.index(
    //   { refreshTokenCreatedAt: 1 },
    //   { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
    // );
    //
    // ACTUAL (unfixed): No TTL index - confirms database bloat issue
    expect(ttlIndex).toBeUndefined();

    // The lack of TTL index means:
    // 1. Expired tokens are never automatically removed
    // 2. Database grows indefinitely with stale tokens
    // 3. Manual cleanup required (but no background job exists)
    // 4. Security risk: revoked tokens remain accessible

    return true;
  });

  /**
   * Property 4: Bug Documentation - No Background Cleanup Job
   * 
   * This property documents that multiple expired tokens accumulate without cleanup,
   * simulating the database bloat issue over time.
   */
  it('PROPERTY 4: Bug Condition - Expired tokens accumulate causing database bloat', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Simulate multiple users with expired tokens
          expiredTokens: fc.array(
            fc.record({
              token: fc.string({ minLength: 100, maxLength: 200 }),
              ageInDays: fc.integer({ min: 91, max: 730 }), // 91 days to 2 years old
            }),
            { minLength: 5, maxLength: 10 }
          ),
        }),
        async ({ expiredTokens }) => {
          const store = new RefreshTokenStore();
          const userIds: string[] = [];
          const baseTimestamp = Date.now();

          try {
            // Create multiple test users with expired tokens
            for (let i = 0; i < expiredTokens.length; i++) {
              const uniqueId = `${baseTimestamp}-${i}-${Math.random()}`;
              const user = await User.create({
                email: `expired-user-${uniqueId}@example.com`,
                username: `expired-user-${uniqueId}`,
                googleId: `google-${uniqueId}`,
                firebaseUid: `firebase-${uniqueId}`,
                referralCode: `ref-${uniqueId}`,
              });
              userIds.push(user._id.toString());

              // Store token
              await store.storeRefreshToken(userIds[i], expiredTokens[i].token, `user-${i}-store`);

              // Make token expired by modifying timestamp
              const oldTimestamp = new Date();
              oldTimestamp.setDate(oldTimestamp.getDate() - expiredTokens[i].ageInDays);

              await User.findByIdAndUpdate(userIds[i], {
                refreshTokenCreatedAt: oldTimestamp,
              });
            }

            // Verify all expired tokens are still in database
            const usersWithExpiredTokens = await User.find({
              _id: { $in: userIds },
              refreshToken: { $exists: true },
            }).select('refreshToken refreshTokenCreatedAt');

            // BUG CONFIRMATION: All expired tokens remain in database
            // EXPECTED (after fix): Expired tokens should be automatically removed
            // ACTUAL (unfixed): All tokens remain, causing database bloat
            expect(usersWithExpiredTokens.length).toBe(expiredTokens.length);

            // Calculate total "bloat" - expired tokens that should have been cleaned up
            const now = Date.now();
            const bloatedTokens = usersWithExpiredTokens.filter(user => {
              const tokenAge = now - user.refreshTokenCreatedAt!.getTime();
              const tokenAgeInDays = tokenAge / (1000 * 60 * 60 * 24);
              return tokenAgeInDays > 90;
            });

            // All tokens in this test are expired (>90 days), so all contribute to bloat
            expect(bloatedTokens.length).toBe(expiredTokens.length);

            // The absence of cleanup means:
            // 1. Database size grows indefinitely
            // 2. Query performance degrades over time
            // 3. Storage costs increase
            // 4. Security risk: old tokens remain accessible if encryption is compromised

            return true;
          } finally {
            // Clean up test users
            for (const userId of userIds) {
              await User.findByIdAndDelete(userId);
            }
          }
        }
      ),
      {
        numRuns: 10, // Test with 10 different bloat scenarios
        verbose: true,
      }
    );
  });

  /**
   * Property 5: Bug Documentation - No Expiration Logging
   * 
   * This property verifies that when a stale token is retrieved, there is no
   * logging or indication that it's expired, making debugging difficult.
   */
  it('PROPERTY 5: Bug Condition - No expiration detection or logging', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          ageInDays: fc.integer({ min: 91, max: 365 }),
        }),
        async ({ refreshToken, ageInDays }) => {
          const store = new RefreshTokenStore();

          // Store token
          await store.storeRefreshToken(testUserId, refreshToken, 'test-logging');

          // Make token expired
          const oldTimestamp = new Date();
          oldTimestamp.setDate(oldTimestamp.getDate() - ageInDays);

          await User.findByIdAndUpdate(testUserId, {
            refreshTokenCreatedAt: oldTimestamp,
          });

          // Retrieve expired token
          const retrievedToken = await store.getRefreshToken(testUserId, 'test-logging-retrieve');

          // CURRENT BEHAVIOR (unfixed code):
          // - Token is retrieved without age check
          // - No log message about expiration
          // - No indication of security issue
          // - Debugging is difficult when refresh fails downstream
          
          // BUG CONFIRMATION: Token is returned (not null)
          // EXPECTED (after fix): Should return null with expiration log
          // ACTUAL (unfixed): Returns token, no expiration detection
          expect(retrievedToken).not.toBeNull(); // This documents the bug

          // After fix, this should be:
          // expect(retrievedToken).toBeNull();
          // And logs should contain: 'Refresh token expired'

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: true,
      }
    );
  });

  /**
   * Property 6: Edge Case - Token at Exactly 90 Days
   * 
   * This property tests the boundary condition where a token is exactly 90 days old.
   * After fix, system should accept tokens at 90 days, reject at 90 days + 1 second.
   */
  it('PROPERTY 6: Edge Case - Token at 90-day boundary', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          // Test at exactly 90 days, and slightly over
          extraSeconds: fc.integer({ min: 0, max: 86400 }), // 0 to 24 hours extra
        }),
        async ({ refreshToken, extraSeconds }) => {
          const store = new RefreshTokenStore();

          // Store token
          await store.storeRefreshToken(testUserId, refreshToken, 'test-boundary');

          // Set token to exactly 90 days + extraSeconds old
          const timestamp = new Date();
          const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
          timestamp.setTime(timestamp.getTime() - ninetyDaysInMs - (extraSeconds * 1000));

          await User.findByIdAndUpdate(testUserId, {
            refreshTokenCreatedAt: timestamp,
          });

          // Retrieve token
          const retrievedToken = await store.getRefreshToken(testUserId, 'test-boundary-retrieve');

          // EXPECTED BEHAVIOR (after fix):
          // - Token at exactly 90 days (extraSeconds = 0): should be accepted
          // - Token at 90 days + 1 second: should be rejected
          //
          // This tests the boundary condition logic:
          // if (tokenAge > 90 * 24 * 60 * 60 * 1000) { reject } else { accept }

          if (extraSeconds === 0) {
            // At exactly 90 days, should still be valid
            expect(retrievedToken).toBe(refreshToken);
          } else {
            // Over 90 days, should be rejected
            expect(retrievedToken).toBeNull();
          }

          return true;
        }
      ),
      {
        numRuns: 20,
        verbose: true,
      }
    );
  });
});
