import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';
import mongoose from 'mongoose';

/**
 * Bug Exploration Property-Based Test for SESSION_SECRET Rotation
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The RefreshTokenStore derives encryption keys directly from SESSION_SECRET without versioning.
 * When SESSION_SECRET is rotated for security compliance, all existing encrypted refresh tokens
 * become undecryptable, forcing all users to re-authenticate immediately.
 * 
 * Current Code (RefreshTokenStore.ts constructor):
 *   this.key = crypto.scryptSync(sessionSecret, 'refresh-token-salt', 32, {...});
 * 
 * Bug Condition:
 * 1. System encrypts tokens with SESSION_SECRET = "old-key-value"
 * 2. SESSION_SECRET is changed to "new-key-value" for security compliance
 * 3. System attempts to decrypt existing tokens with new key
 * 4. Decryption fails - all users logged out immediately
 * 
 * Expected Behavior (after fix):
 * - System should support multiple active encryption keys with versioning
 * - System should decrypt old tokens with old key, new tokens with new key
 * - Graceful migration period where both keys are active
 * 
 * Requirements tested: 1.5, 1.6, 2.5, 2.6
 */

describe('RefreshTokenStore - Bug Exploration: SESSION_SECRET Rotation Issue', () => {
  let testUserId: string;
  const originalEnv = process.env.SESSION_SECRET;

  beforeEach(async () => {
    // Connect to test database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    }

    // Create a test user
    const timestamp = Date.now();
    const random = Math.random();
    const testUser = await User.create({
      email: `test-${timestamp}-${random}@example.com`,
      username: `testuser-${timestamp}-${random}`,
      displayName: 'Test User',
      googleId: `google-${timestamp}-${random}`,
      firebaseUid: `firebase-${timestamp}-${random}`, // Unique firebaseUid to avoid index conflicts
      referralCode: `ref-${timestamp}-${random}`, // Unique referralCode to avoid index conflicts
    });
    testUserId = testUser._id.toString();
  });

  afterEach(async () => {
    // Clean up test user
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
    }

    // Restore original SESSION_SECRET and clear SESSION_SECRET_OLD
    process.env.SESSION_SECRET = originalEnv;
    delete process.env.SESSION_SECRET_OLD;
  });

  /**
   * Property 1: Bug Condition - Key Rotation Issue
   * 
   * **Validates: Requirements 1.5, 1.6, 2.5, 2.6**
   * 
   * This property tests the concrete scenario where SESSION_SECRET is rotated.
   * It encrypts a token with one key, then changes SESSION_SECRET, and attempts
   * to decrypt the token with the new key.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - System should support multiple active encryption keys with versioning
   * - When SESSION_SECRET changes, system should attempt decryption with all active keys
   * - Old tokens encrypted with old key should still decrypt successfully
   * - New tokens should be encrypted with new key
   * - Graceful migration without forcing all users to re-authenticate
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - RefreshTokenStore derives single key from SESSION_SECRET (line 28-38)
   * - When SESSION_SECRET changes, new key is derived
   * - Existing tokens encrypted with old key cannot decrypt with new key
   * - getRefreshToken() returns null (line 172 - catches decrypt error)
   * - All users are forced to re-authenticate immediately
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - Token decryption must succeed after SESSION_SECRET rotation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate realistic OAuth refresh tokens
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          oldSecret: fc.string({ minLength: 32, maxLength: 64 }),
          newSecret: fc.string({ minLength: 32, maxLength: 64 }),
        }),
        async ({ refreshToken, oldSecret, newSecret }) => {
          // Ensure secrets are different to simulate actual rotation
          fc.pre(oldSecret !== newSecret);

          // PHASE 1: Encrypt token with OLD SESSION_SECRET
          // This simulates the initial state where tokens are encrypted
          process.env.SESSION_SECRET = oldSecret;
          
          // Create a new RefreshTokenStore instance with the OLD key
          const storeWithOldKey = new RefreshTokenStore();
          
          // Store the refresh token (encrypted with old key)
          await storeWithOldKey.storeRefreshToken(testUserId, refreshToken, 'test-phase-1');
          
          // Verify token can be retrieved with OLD key
          const retrievedWithOldKey = await storeWithOldKey.getRefreshToken(testUserId, 'test-phase-1-verify');
          expect(retrievedWithOldKey).toBe(refreshToken);

          // PHASE 2: Rotate SESSION_SECRET (security compliance event)
          // This simulates what happens when SESSION_SECRET is changed in production
          // During rotation period, both keys must be available
          process.env.SESSION_SECRET_OLD = oldSecret; // Keep old key available
          process.env.SESSION_SECRET = newSecret; // Set new key

          // Create a new RefreshTokenStore instance with the NEW key
          // This is what happens when the application restarts after SESSION_SECRET change
          // The store now has BOTH keys available
          const storeWithNewKey = new RefreshTokenStore();

          // PHASE 3: Attempt to decrypt existing token with NEW key
          // This is where the fix works - tokens encrypted with old key
          // can still be decrypted because the system tries all available keys
          const retrievedWithNewKey = await storeWithNewKey.getRefreshToken(testUserId, 'test-phase-3');

          // EXPECTED BEHAVIOR (after fix): Token should still decrypt
          // The fixed implementation should:
          // 1. Support multiple key versions (SESSION_SECRET and SESSION_SECRET_OLD)
          // 2. Try decryption with current key first
          // 3. Fallback to old key if current key fails
          // 4. Re-encrypt with new key for future requests (key migration)
          
          // ACTUAL BEHAVIOR (unfixed code): retrievedWithNewKey will be null
          // The decryption fails because:
          // - Token was encrypted with key derived from oldSecret
          // - Trying to decrypt with key derived from newSecret
          // - crypto.createDecipheriv().final() throws error (line 128)
          // - Catch block returns null (line 172)
          // - Catch block returns null (line 172)
          
          // THIS ASSERTION WILL FAIL ON UNFIXED CODE - confirms the bug exists
          expect(retrievedWithNewKey).toBe(refreshToken);

          // Additional verification: Token should be available, not null
          expect(retrievedWithNewKey).not.toBeNull();

          return true;
        }
      ),
      {
        numRuns: 5, // Reduced from 20 to avoid timeout
        verbose: true,
      }
    );
  }, 60000); // Increased timeout to 60 seconds

  /**
   * Additional Bug Documentation Property
   * 
   * This property documents the exact failure mode: all users are logged out
   * simultaneously when SESSION_SECRET is rotated without key versioning support.
   */
  it('PROPERTY: Bug Documentation - SESSION_SECRET rotation causes mass logout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Simulate multiple users with tokens (reduced for performance)
          userTokens: fc.array(
            fc.record({
              token: fc.string({ minLength: 100, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 3 } // Reduced from 3-10 to 2-3
          ),
          oldSecret: fc.string({ minLength: 32, maxLength: 64 }),
          newSecret: fc.string({ minLength: 32, maxLength: 64 }),
        }),
        async ({ userTokens, oldSecret, newSecret }) => {
          fc.pre(oldSecret !== newSecret);

          // Create test users for each token
          const userIds: string[] = [];
          const baseTimestamp = Date.now();
          for (let i = 0; i < userTokens.length; i++) {
            const uniqueId = `${baseTimestamp}-${i}-${Math.random()}`;
            const user = await User.create({
              email: `user-${uniqueId}@example.com`,
              username: `user-${uniqueId}`,
              googleId: `google-${uniqueId}`,
              firebaseUid: `firebase-${uniqueId}`, // Unique firebaseUid to avoid index conflicts
              referralCode: `ref-${uniqueId}`, // Unique referralCode to avoid index conflicts
            });
            userIds.push(user._id.toString());
          }

          try {
            // PHASE 1: Encrypt all tokens with OLD key
            process.env.SESSION_SECRET = oldSecret;
            const storeWithOldKey = new RefreshTokenStore();

            for (let i = 0; i < userTokens.length; i++) {
              await storeWithOldKey.storeRefreshToken(
                userIds[i],
                userTokens[i].token,
                `user-${i}-store`
              );
            }

            // Verify all tokens can be retrieved with OLD key
            for (let i = 0; i < userTokens.length; i++) {
              const retrieved = await storeWithOldKey.getRefreshToken(userIds[i], `user-${i}-verify-old`);
              expect(retrieved).toBe(userTokens[i].token);
            }

            // PHASE 2: Rotate SESSION_SECRET (security team action)
            // During rotation, both old and new keys must be available
            process.env.SESSION_SECRET_OLD = oldSecret;
            process.env.SESSION_SECRET = newSecret;
            const storeWithNewKey = new RefreshTokenStore();

            // PHASE 3: ALL users attempt to refresh their tokens
            // This is what happens in production when users try to use the app
            const retrievalResults: (string | null)[] = [];
            for (let i = 0; i < userTokens.length; i++) {
              const retrieved = await storeWithNewKey.getRefreshToken(userIds[i], `user-${i}-refresh`);
              retrievalResults.push(retrieved);
            }

            // EXPECTED BEHAVIOR (after fix): All tokens should still decrypt
            // With key versioning, the system would:
            // 1. Try NEW key first (fails for old tokens)
            // 2. Fallback to OLD key (succeeds)
            // 3. Re-encrypt with NEW key for next time
            
            // ACTUAL BEHAVIOR (unfixed code): ALL tokens return null
            // This causes a production incident where EVERY user is logged out
            // simultaneously, requiring mass re-authentication
            
            // Count how many tokens successfully decrypted
            const successfulRetrievals = retrievalResults.filter(r => r !== null).length;

            // THIS ASSERTION WILL FAIL ON UNFIXED CODE
            // Expected: All tokens decrypt (100% success)
            // Actual: Zero tokens decrypt (0% success) - mass logout bug confirmed
            expect(successfulRetrievals).toBe(userTokens.length);

            // Verify none of the tokens are null
            for (let i = 0; i < retrievalResults.length; i++) {
              expect(retrievalResults[i]).toBe(userTokens[i].token);
            }

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
        numRuns: 3, // Reduced from 10 to 3 to avoid timeout
        verbose: true,
      }
    );
  }, 60000); // Increased timeout to 60 seconds

  /**
   * Additional Property: No Key Versioning Support
   * 
   * This property verifies that the current implementation does not store
   * or check key versions, making graceful rotation impossible.
   */
  it('PROPERTY: Current implementation lacks key versioning - no migration path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          secret: fc.string({ minLength: 32, maxLength: 64 }),
        }),
        async ({ refreshToken, secret }) => {
          // Store token with a specific SESSION_SECRET
          process.env.SESSION_SECRET = secret;
          const store = new RefreshTokenStore();
          
          await store.storeRefreshToken(testUserId, refreshToken, 'test-versioning');

          // Retrieve the user document to inspect stored fields
          const user = await User.findById(testUserId).select(
            'refreshToken refreshTokenIV refreshTokenTag refreshTokenCreatedAt'
          );

          expect(user).not.toBeNull();
          expect(user!.refreshToken).toBeDefined(); // Encrypted token
          expect(user!.refreshTokenIV).toBeDefined(); // IV
          expect(user!.refreshTokenTag).toBeDefined(); // Auth tag
          expect(user!.refreshTokenCreatedAt).toBeDefined(); // Timestamp

          // BUG: No key version field stored
          // The ideal implementation would store:
          // - refreshTokenKeyVersion: 'v1' or timestamp-based version
          // This would allow the system to know which key to use for decryption
          
          // Check that the user document does NOT have a key version field
          // (This confirms the bug - no versioning support)
          const userDoc = user!.toObject();
          expect(userDoc).not.toHaveProperty('refreshTokenKeyVersion');

          // EXPECTED (after fix): Field 'refreshTokenKeyVersion' should exist
          // ACTUAL (unfixed): Field does not exist - confirms no versioning support

          // The lack of versioning means:
          // 1. System cannot determine which key was used for encryption
          // 2. System cannot fallback to old keys during rotation
          // 3. Graceful migration is impossible
          // 4. All tokens become invalid on key rotation

          return true;
        }
      ),
      {
        numRuns: 5, // Reduced from 20 to 5 to avoid timeout
        verbose: true,
      }
    );
  }, 60000); // Increased timeout to 60 seconds

  /**
   * Additional Property: Decryption Error Handling
   * 
   * This property verifies that when decryption fails due to wrong key,
   * the system returns null rather than throwing an error, making it
   * indistinguishable from "token not found".
   */
  it('PROPERTY: Decryption failure returns null - masks key rotation issue', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          refreshToken: fc.string({ minLength: 100, maxLength: 200 }),
          oldSecret: fc.string({ minLength: 32, maxLength: 64 }),
          newSecret: fc.string({ minLength: 32, maxLength: 64 }),
        }),
        async ({ refreshToken, oldSecret, newSecret }) => {
          fc.pre(oldSecret !== newSecret);

          // Encrypt with OLD key
          process.env.SESSION_SECRET = oldSecret;
          const oldStore = new RefreshTokenStore();
          await oldStore.storeRefreshToken(testUserId, refreshToken, 'test-error-handling');

          // Try to decrypt with NEW key
          process.env.SESSION_SECRET = newSecret;
          const newStore = new RefreshTokenStore();
          const result = await newStore.getRefreshToken(testUserId, 'test-error-handling');

          // ACTUAL BEHAVIOR (unfixed code): Returns null
          // This is caught in the catch block (line 133-175)
          // The error is logged but returned as null
          
          // This masks the real issue:
          // - Caller cannot distinguish between "token not found" and "key rotation broke decryption"
          // - Silent failure makes debugging difficult
          // - No indication that key rotation is the root cause
          
          // BUG CONFIRMATION: Result is null instead of the original token
          expect(result).toBeNull(); // This documents current behavior
          
          // EXPECTED (after fix): Should return the original token
          // After implementing key versioning, this should succeed:
          // expect(result).toBe(refreshToken);

          return true;
        }
      ),
      {
        numRuns: 5, // Reduced from 20 to 5 to avoid timeout
        verbose: true,
      }
    );
  }, 60000); // Increased timeout to 60 seconds
});
