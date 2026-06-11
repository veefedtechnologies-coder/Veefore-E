/**
 * Preservation Property Tests - Token Refresh
 * 
 * **Validates: Requirements 3.3, 3.4**
 * 
 * These tests verify that token refresh for users with valid, non-expired tokens
 * continues to work correctly on the unfixed code. This establishes the baseline
 * behavior that must be preserved after implementing the security fixes.
 * 
 * **IMPORTANT**: These tests are EXPECTED TO PASS on unfixed code.
 * They document the correct behavior that must remain unchanged.
 * 
 * Test Strategy:
 * - Observe: Refresh with valid 30-day-old token succeeds on unfixed code
 * - Observe: Firebase custom tokens issued correctly with proper claims
 * - Property: Token refresh for users with valid tokens continues to work
 * - Generate various valid token refresh scenarios with property-based testing
 * - Verify all valid token refreshes complete without errors
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import * as fc from 'fast-check';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { FirebaseTokenService, GoogleUserInfo } from '../FirebaseTokenService';
import { User } from '../../../models/User/User';
import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Test Setup for Preservation Tests
 * 
 * These tests verify the current (unfixed) behavior on real service instances.
 * We mock Firebase Admin SDK but use real encryption and database operations.
 */

// Test configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/veefore-test';
const TEST_DB_NAME = 'test-token-refresh-pres';

// Mock Firebase Admin SDK
vi.mock('../../../firebase-admin', () => ({
  getFirebaseAdmin: vi.fn(() => ({
    auth: () => ({
      createCustomToken: vi.fn(async (uid: string, claims?: any) => {
        // Simulate Firebase custom token creation
        // Return a mock JWT-like token with embedded claims
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
        const payload = Buffer.from(JSON.stringify({
          uid,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
          ...claims,
        })).toString('base64');
        const signature = crypto.randomBytes(32).toString('base64');
        return `${header}.${payload}.${signature}`;
      }),
      verifyIdToken: vi.fn(async (token: string) => {
        // Simulate token verification
        const parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid token format');
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload;
      }),
    }),
  })),
}));

describe('PRESERVATION PROPERTY: Valid Token Refresh Continues Working', () => {
  let refreshTokenStore: RefreshTokenStore;
  let firebaseTokenService: FirebaseTokenService;

  beforeAll(async () => {
    // Set up test database connection
    process.env.MONGODB_URI = `${MONGODB_URI.split('/').slice(0, -1).join('/')}/${TEST_DB_NAME}`;
    
    // Close any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI);
  }, 30000); // 30 second timeout for connection

  afterAll(async () => {
    // Clean up test database
    try {
      await mongoose.connection.dropDatabase();
    } catch (error) {
      console.error('Error dropping test database:', error);
    }
    
    // Close connection
    await mongoose.connection.close();
  }, 30000);

  beforeEach(async () => {
    // Set up SESSION_SECRET for encryption
    if (!process.env.SESSION_SECRET) {
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    }

    // Clear any existing test data
    await User.deleteMany({});

    // Initialize services
    refreshTokenStore = new RefreshTokenStore();
    firebaseTokenService = new FirebaseTokenService();
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  /**
   * PROPERTY 1: Valid Token Refresh Success
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * This property verifies that token refresh works correctly for valid tokens:
   * 1. Users with valid refresh tokens can retrieve them successfully
   * 2. Retrieved tokens match the originally stored tokens
   * 3. Encryption/decryption round-trip works correctly
   * 4. Multiple sequential refresh operations work without errors
   * 
   * This is the baseline behavior that must be preserved - users with valid
   * tokens should always be able to refresh their authentication.
   */
  it('PROPERTY 1: Valid refresh tokens can be retrieved successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for valid token refresh scenarios
        fc.record({
          // Number of users to test (1-5)
          userCount: fc.integer({ min: 1, max: 5 }),
          // Generate valid refresh tokens (simulating Google OAuth tokens)
          refreshTokens: fc.array(
            fc.string({ minLength: 40, maxLength: 120 }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ userCount, refreshTokens }) => {
          // Ensure we have enough tokens
          const tokens = refreshTokens.slice(0, userCount);
          if (tokens.length < userCount) {
            tokens.push(...Array(userCount - tokens.length).fill(0).map((_, i) => 
              `valid-refresh-token-${i}-${Date.now()}-${crypto.randomBytes(20).toString('hex')}`
            ));
          }

          const testUsers: Array<{
            user: any;
            originalToken: string;
          }> = [];

          // OBSERVATION 1: Token storage for valid users
          // Store refresh tokens for multiple users
          for (let i = 0; i < userCount; i++) {
            const email = `refresh-test-${i}-${Date.now()}@example.com`;
            const googleId = `google-refresh-${i}-${Date.now()}`;
            const username = `refreshuser${i}_${Date.now()}`;

            // Create user in database
            const user = await User.create({
              email,
              username,
              googleId,
              displayName: `Refresh Test User ${i}`,
              photoURL: 'https://example.com/photo.jpg',
              createdAt: new Date(),
              lastLoginAt: new Date(),
            });

            // Store refresh token (simulates callback endpoint storing token)
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              tokens[i],
              `test-store-${i}`
            );

            testUsers.push({ user, originalToken: tokens[i] });
          }

          // OBSERVATION 2: Token retrieval for valid tokens
          // All users should successfully retrieve their tokens
          for (let i = 0; i < userCount; i++) {
            const { user, originalToken } = testUsers[i];

            // Retrieve refresh token (simulates /api/auth/refresh endpoint)
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `test-retrieve-${i}`
            );

            // Verify retrieval succeeded
            expect(retrievedToken).toBeDefined();
            expect(retrievedToken).not.toBeNull();
            expect(retrievedToken).toBe(originalToken);
          }

          // OBSERVATION 3: Multiple sequential retrievals work
          // Same token can be retrieved multiple times (idempotent)
          for (let i = 0; i < userCount; i++) {
            const { user, originalToken } = testUsers[i];

            // Retrieve token again
            const secondRetrieval = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `test-second-retrieve-${i}`
            );

            // Should still work
            expect(secondRetrieval).toBe(originalToken);
          }

          return true;
        }
      ),
      {
        numRuns: 20, // Reduced runs due to database and encryption operations
        verbose: true,
      }
    );
  }, 60000); // 60 second timeout for database operations

  /**
   * PROPERTY 2: Token Age Tolerance
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * This property verifies that tokens within their lifetime (< 90 days) work:
   * 1. Recently created tokens work (age < 1 day)
   * 2. Moderately old tokens work (age 30 days)
   * 3. Older tokens work (age 60 days)
   * 4. Token age doesn't affect retrieval for valid tokens
   * 
   * This preserves the current behavior where valid tokens work regardless
   * of age (within the max lifetime).
   */
  it('PROPERTY 2: Tokens of various ages (< 90 days) work correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for tokens of various ages
        fc.record({
          // Test different age ranges within valid lifetime
          tokenAges: fc.array(
            fc.record({
              // Age in days (0-89 days, well within the 90-day limit)
              ageInDays: fc.integer({ min: 0, max: 89 }),
              token: fc.string({ minLength: 40, maxLength: 120 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ tokenAges }) => {
          const testCases: Array<{
            user: any;
            originalToken: string;
            ageInDays: number;
            createdAt: Date;
          }> = [];

          // OBSERVATION 1: Store tokens with various creation timestamps
          for (let i = 0; i < tokenAges.length; i++) {
            const { ageInDays, token } = tokenAges[i];
            const email = `age-test-${i}-${Date.now()}@example.com`;
            const googleId = `google-age-${i}-${Date.now()}`;
            const username = `ageuser${i}_${Date.now()}`;

            // Calculate creation timestamp (ageInDays ago)
            const createdAt = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000);

            // Create user with specific creation timestamp
            const user = await User.create({
              email,
              username,
              googleId,
              displayName: `Age Test User ${i}`,
              photoURL: 'https://example.com/photo.jpg',
              createdAt: createdAt,
              lastLoginAt: new Date(),
            });

            // Store refresh token with specific timestamp
            // First store normally
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              token,
              `age-test-store-${i}`
            );

            // Then update the timestamp to simulate an older token
            await User.findByIdAndUpdate(user._id, {
              refreshTokenCreatedAt: createdAt,
            });

            testCases.push({
              user,
              originalToken: token,
              ageInDays,
              createdAt,
            });
          }

          // OBSERVATION 2: All valid-age tokens should retrieve successfully
          for (let i = 0; i < testCases.length; i++) {
            const { user, originalToken, ageInDays } = testCases[i];

            // Retrieve token (simulates refresh endpoint)
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `age-test-retrieve-${i}`
            );

            // Verify retrieval works for tokens within valid lifetime
            expect(retrievedToken).toBeDefined();
            expect(retrievedToken).not.toBeNull();
            expect(retrievedToken).toBe(originalToken);

            // Log for observation
            console.log(`Token aged ${ageInDays} days retrieved successfully`);
          }

          return true;
        }
      ),
      {
        numRuns: 15, // Reduced runs due to database operations
        verbose: true,
      }
    );
  }, 90000); // 90 second timeout for database operations

  /**
   * PROPERTY 3: Firebase Token Creation for Refresh
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * This property verifies that Firebase custom tokens are created correctly
   * during the refresh flow:
   * 1. Firebase tokens created with correct user ID
   * 2. Tokens include proper claims (email, emailVerified, googleId)
   * 3. Token creation succeeds for all valid users
   * 4. Tokens have proper structure and expiration
   * 
   * This preserves the current Firebase token creation behavior.
   */
  it('PROPERTY 3: Firebase custom tokens created correctly for valid users', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for Firebase token creation
        fc.record({
          // Number of users to test
          userCount: fc.integer({ min: 1, max: 5 }),
          // Generate Google user info
          userInfos: fc.array(
            fc.record({
              email: fc.emailAddress(),
              displayName: fc.string({ minLength: 3, maxLength: 50 }),
              googleId: fc.string({ minLength: 10, maxLength: 30 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ userCount, userInfos }) => {
          // Ensure we have enough user infos
          const infos = userInfos.slice(0, userCount);
          if (infos.length < userCount) {
            infos.push(...Array(userCount - infos.length).fill(0).map((_, i) => ({
              email: `firebase-test-${i}-${Date.now()}@example.com`,
              displayName: `Firebase Test User ${i}`,
              googleId: `google-firebase-${i}-${Date.now()}`,
            })));
          }

          const testUsers: Array<{
            user: any;
            googleUserInfo: GoogleUserInfo;
          }> = [];

          // OBSERVATION 1: Create users and Firebase tokens
          for (let i = 0; i < userCount; i++) {
            const info = infos[i];
            const username = `firebaseuser${i}_${Date.now()}`;

            // Create Google user info
            const googleUserInfo: GoogleUserInfo = {
              sub: info.googleId,
              email: info.email,
              email_verified: true,
              name: info.displayName,
              picture: 'https://example.com/photo.jpg',
            };

            // Create user in database (simulates existing user)
            const user = await User.create({
              email: info.email,
              username,
              googleId: info.googleId,
              displayName: info.displayName,
              photoURL: 'https://example.com/photo.jpg',
              isEmailVerified: true,
              createdAt: new Date(),
              lastLoginAt: new Date(),
            });

            testUsers.push({ user, googleUserInfo });
          }

          // OBSERVATION 2: Firebase token creation succeeds for all users
          for (let i = 0; i < userCount; i++) {
            const { user, googleUserInfo } = testUsers[i];

            // Create Firebase custom token (simulates refresh endpoint creating new token)
            const result = await firebaseTokenService.createFirebaseToken(googleUserInfo);

            // Verify token creation succeeded
            expect(result).toBeDefined();
            expect(result.customToken).toBeDefined();
            expect(result.customToken).toBeTruthy();
            expect(result.user).toBeDefined();
            expect(result.isNewUser).toBe(false); // Existing user

            // Verify token structure (JWT format)
            const tokenParts = result.customToken.split('.');
            expect(tokenParts.length).toBe(3); // header.payload.signature

            // Verify token payload contains expected claims
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            expect(payload.uid).toBe(user._id.toString());
            expect(payload.email).toBe(googleUserInfo.email);
            expect(payload.emailVerified).toBe(true);
            expect(payload.googleId).toBe(googleUserInfo.sub);

            // Verify token expiration is set (should be in the future)
            expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
            
            // Verify token expiration is approximately 1 hour (Firebase default)
            const tokenLifetimeSeconds = payload.exp - payload.iat;
            expect(tokenLifetimeSeconds).toBeGreaterThan(3500); // At least 58 minutes
            expect(tokenLifetimeSeconds).toBeLessThan(3700); // At most 62 minutes
          }

          return true;
        }
      ),
      {
        numRuns: 15, // Reduced runs due to database operations
        verbose: true,
      }
    );
  }, 60000); // 60 second timeout for database operations

  /**
   * PROPERTY 4: Complete Refresh Flow
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * This property verifies the complete token refresh flow:
   * 1. User exists with stored refresh token
   * 2. Refresh token retrieved successfully
   * 3. Firebase custom token created successfully
   * 4. User's lastLoginAt updated
   * 5. Complete flow succeeds without errors
   * 
   * This preserves the end-to-end refresh behavior.
   */
  it('PROPERTY 4: Complete refresh flow works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for complete refresh flows
        fc.record({
          // Number of complete refresh flows to test
          flowCount: fc.integer({ min: 1, max: 3 }),
          // Generate user and token data
          flows: fc.array(
            fc.record({
              email: fc.emailAddress(),
              displayName: fc.string({ minLength: 3, maxLength: 50 }),
              googleId: fc.string({ minLength: 10, maxLength: 30 }),
              refreshToken: fc.string({ minLength: 40, maxLength: 120 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        async ({ flowCount, flows }) => {
          // Ensure we have enough flows
          const testFlows = flows.slice(0, flowCount);
          if (testFlows.length < flowCount) {
            testFlows.push(...Array(flowCount - testFlows.length).fill(0).map((_, i) => ({
              email: `complete-test-${i}-${Date.now()}@example.com`,
              displayName: `Complete Test User ${i}`,
              googleId: `google-complete-${i}-${Date.now()}`,
              refreshToken: `complete-refresh-token-${i}-${Date.now()}-${crypto.randomBytes(20).toString('hex')}`,
            })));
          }

          const testUsers: Array<{
            user: any;
            googleUserInfo: GoogleUserInfo;
            refreshToken: string;
          }> = [];

          // OBSERVATION 1: Set up users with refresh tokens
          for (let i = 0; i < flowCount; i++) {
            const flow = testFlows[i];
            const username = `completeuser${i}_${Date.now()}`;

            // Create user
            const user = await User.create({
              email: flow.email,
              username,
              googleId: flow.googleId,
              displayName: flow.displayName,
              photoURL: 'https://example.com/photo.jpg',
              isEmailVerified: true,
              createdAt: new Date(),
              lastLoginAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
            });

            // Store refresh token
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              flow.refreshToken,
              `complete-setup-${i}`
            );

            const googleUserInfo: GoogleUserInfo = {
              sub: flow.googleId,
              email: flow.email,
              email_verified: true,
              name: flow.displayName,
              picture: 'https://example.com/photo.jpg',
            };

            testUsers.push({ user, googleUserInfo, refreshToken: flow.refreshToken });
          }

          // OBSERVATION 2: Complete refresh flow for each user
          for (let i = 0; i < flowCount; i++) {
            const { user, googleUserInfo, refreshToken: originalToken } = testUsers[i];

            // Step 1: Retrieve refresh token (simulates /api/auth/refresh)
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `complete-retrieve-${i}`
            );

            // Verify token retrieval
            expect(retrievedToken).toBe(originalToken);

            // Step 2: Create new Firebase custom token
            const tokenResult = await firebaseTokenService.createFirebaseToken(googleUserInfo);

            // Verify token creation
            expect(tokenResult).toBeDefined();
            expect(tokenResult.customToken).toBeTruthy();
            expect(tokenResult.user).toBeDefined();
            expect(tokenResult.isNewUser).toBe(false);

            // Step 3: Verify user update (lastLoginAt should be updated)
            const updatedUser = await User.findById(user._id);
            expect(updatedUser).toBeDefined();
            expect(updatedUser!.lastLoginAt).toBeDefined();
            
            // lastLoginAt should be more recent than the original (1 hour ago)
            const timeSinceLastLogin = Date.now() - updatedUser!.lastLoginAt!.getTime();
            expect(timeSinceLastLogin).toBeLessThan(10000); // Updated within last 10 seconds

            // Step 4: Verify complete flow success
            expect(retrievedToken).toBeTruthy();
            expect(tokenResult.customToken).toBeTruthy();
            expect(updatedUser!.refreshToken).toBeTruthy();
          }

          return true;
        }
      ),
      {
        numRuns: 10, // Reduced runs due to complex operations
        verbose: true,
      }
    );
  }, 90000); // 90 second timeout for database operations

  /**
   * PROPERTY 5: Encryption Integrity for Refresh Tokens
   * 
   * **Validates: Requirements 3.3, 3.4**
   * 
   * This property verifies that encryption/decryption maintains data integrity:
   * 1. Encrypted tokens decrypt to exact original value
   * 2. No data loss or corruption during encryption round-trip
   * 3. Tokens of various lengths and characters work correctly
   * 4. Encryption is deterministic for retrieval
   * 
   * This preserves the current encryption behavior for valid tokens.
   */
  it('PROPERTY 5: Encryption maintains token integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for encryption integrity
        fc.record({
          // Generate tokens of various characteristics
          tokens: fc.array(
            fc.record({
              // Various token lengths
              token: fc.oneof(
                fc.string({ minLength: 40, maxLength: 60 }), // Short tokens
                fc.string({ minLength: 80, maxLength: 100 }), // Medium tokens
                fc.string({ minLength: 100, maxLength: 150 }), // Long tokens
              ),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ tokens }) => {
          const testCases: Array<{
            user: any;
            originalToken: string;
          }> = [];

          // OBSERVATION 1: Store tokens of various lengths
          for (let i = 0; i < tokens.length; i++) {
            const { token } = tokens[i];
            const email = `integrity-test-${i}-${Date.now()}@example.com`;
            const googleId = `google-integrity-${i}-${Date.now()}`;
            const username = `integrityuser${i}_${Date.now()}`;

            // Create user
            const user = await User.create({
              email,
              username,
              googleId,
              displayName: `Integrity Test User ${i}`,
              photoURL: 'https://example.com/photo.jpg',
              createdAt: new Date(),
            });

            // Store token with encryption
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              token,
              `integrity-store-${i}`
            );

            testCases.push({ user, originalToken: token });
          }

          // OBSERVATION 2: Verify encryption/decryption integrity
          for (let i = 0; i < testCases.length; i++) {
            const { user, originalToken } = testCases[i];

            // Retrieve token (decrypts internally)
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `integrity-retrieve-${i}`
            );

            // Verify exact match (no data loss or corruption)
            expect(retrievedToken).toBe(originalToken);
            expect(retrievedToken?.length).toBe(originalToken.length);

            // Verify character-by-character match
            if (retrievedToken) {
              for (let j = 0; j < originalToken.length; j++) {
                expect(retrievedToken[j]).toBe(originalToken[j]);
              }
            }
          }

          return true;
        }
      ),
      {
        numRuns: 20, // Test with various token characteristics
        verbose: true,
      }
    );
  }, 60000); // 60 second timeout for database operations
});
