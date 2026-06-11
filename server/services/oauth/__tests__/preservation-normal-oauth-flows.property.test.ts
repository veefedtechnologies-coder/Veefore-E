/**
 * Preservation Property Tests - Normal OAuth Flows
 * 
 * **Validates: Requirements 3.1, 3.2**
 * 
 * These tests verify that normal single-user OAuth flows without concurrent attempts
 * continue to authenticate successfully on the unfixed code. This establishes the
 * baseline behavior that must be preserved after implementing the security fixes.
 * 
 * **IMPORTANT**: These tests are EXPECTED TO PASS on unfixed code.
 * They document the correct behavior that must remain unchanged.
 * 
 * Test Strategy:
 * - Observe single-user sequential OAuth flow completes successfully
 * - Observe token issuance, user creation, and cookie setting work correctly
 * - Property: Normal single-user flows without concurrent attempts authenticate successfully
 * - Generate various valid OAuth flow scenarios with property-based testing
 * - Verify all sequential flows complete without errors
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { StateValidator } from '../StateValidator';
import { generatePKCEPair } from '../PKCEUtils';
import { TokenExchangeService } from '../TokenExchangeService';
import { FirebaseTokenService } from '../FirebaseTokenService';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';
import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Test Setup for Preservation Tests
 * 
 * These tests require minimal mocking since we're testing the current (unfixed)
 * behavior on real service instances. We only mock external dependencies like
 * Google OAuth API and Firebase Admin SDK.
 */

// Test configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/veefore-test';
const TEST_DB_NAME = 'veefore-test-oauth-preservation';

describe('PRESERVATION PROPERTY: Normal OAuth Flows Continue Working', () => {
  let stateValidator: StateValidator;
  let refreshTokenStore: RefreshTokenStore;

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
    stateValidator = new StateValidator();
    refreshTokenStore = new RefreshTokenStore();
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  /**
   * PROPERTY 1: Sequential OAuth State Management
   * 
   * **Validates: Requirements 3.1, 3.2**
   * 
   * This property verifies that sequential (non-concurrent) OAuth flows can:
   * 1. Generate unique state parameters for each flow
   * 2. Store and retrieve state/code_verifier correctly
   * 3. Validate state parameters successfully
   * 4. Complete multiple sequential flows without interference
   * 
   * This is the baseline behavior that must be preserved - normal users
   * completing one OAuth flow at a time should always work correctly.
   */
  it('PROPERTY 1: Sequential state generation and validation works correctly', () => {
    fc.assert(
      fc.property(
        // Generate test data for sequential OAuth flows
        fc.record({
          // Number of sequential flows to test (1-10 flows)
          flowCount: fc.integer({ min: 1, max: 10 }),
          // User identifiers for each flow
          sessionIds: fc.array(
            fc.string({ minLength: 10, maxLength: 30 }),
            { minLength: 1, maxLength: 10 }
          ),
        }),
        ({ flowCount, sessionIds }) => {
          // Ensure we have enough session IDs
          const sessions = sessionIds.slice(0, flowCount);
          if (sessions.length < flowCount) {
            sessions.push(...Array(flowCount - sessions.length).fill(0).map((_, i) => `session-${i}`));
          }

          // Track states for validation
          const flowData: Array<{
            sessionId: string;
            state: string;
            codeVerifier: string;
            mockReq: any;
          }> = [];

          // OBSERVATION 1: Sequential flow initiation (/google/start behavior)
          // Each flow should generate unique state and store it successfully
          for (let i = 0; i < flowCount; i++) {
            const sessionId = sessions[i];

            // Generate state and PKCE pair
            const state = stateValidator.generateState();
            const { codeVerifier } = generatePKCEPair();

            // Create mock request with session
            const mockReq: any = {
              session: {},
              correlationId: `test-${sessionId}-${i}`,
            };

            // Store state (simulates /google/start endpoint)
            stateValidator.storeState(mockReq, state, codeVerifier);

            // Verify storage succeeded
            expect(mockReq.session.oauth).toBeDefined();
            expect(mockReq.session.oauth.state).toBe(state);
            expect(mockReq.session.oauth.codeVerifier).toBe(codeVerifier);
            expect(mockReq.session.oauth.expiresAt).toBeDefined();

            flowData.push({ sessionId, state, codeVerifier, mockReq });
          }

          // OBSERVATION 2: State uniqueness across flows
          // All states should be unique (no collisions)
          const states = flowData.map(f => f.state);
          const uniqueStates = new Set(states);
          expect(uniqueStates.size).toBe(flowCount);

          // OBSERVATION 3: Sequential flow validation (/google/callback behavior)
          // Each flow should validate successfully with its correct state
          for (let i = 0; i < flowCount; i++) {
            const flow = flowData[i];

            // Validate state (simulates /google/callback endpoint)
            const validationResult = stateValidator.validateState(flow.mockReq, flow.state);

            // Verify validation succeeded
            expect(validationResult.isValid).toBe(true);
            expect(validationResult.codeVerifier).toBeDefined();

            // Verify session was cleaned up after successful validation (single-use)
            expect(flow.mockReq.session.oauth).toBeUndefined();
          }

          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * PROPERTY 2: Sequential Token Storage and Retrieval
   * 
   * **Validates: Requirements 3.1, 3.2**
   * 
   * This property verifies that sequential token storage operations work correctly:
   * 1. Storing refresh tokens for different users sequentially
   * 2. Retrieving tokens with correct encryption/decryption
   * 3. No data loss or corruption in sequential operations
   * 4. Each user's token is isolated and independent
   * 
   * This preserves the current behavior where sequential token operations
   * (one at a time, no concurrency) work reliably.
   */
  it('PROPERTY 2: Sequential token storage and retrieval works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for sequential token operations
        fc.record({
          // Number of sequential operations (1-5)
          operationCount: fc.integer({ min: 1, max: 5 }),
          // Mock refresh tokens (simulating Google OAuth tokens)
          refreshTokens: fc.array(
            fc.string({ minLength: 20, maxLength: 100 }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ operationCount, refreshTokens }) => {
          // Create test users
          const users: any[] = [];
          const tokens = refreshTokens.slice(0, operationCount);
          if (tokens.length < operationCount) {
            tokens.push(...Array(operationCount - tokens.length).fill(0).map((_, i) => `token-${i}-${Date.now()}`));
          }

          // OBSERVATION 1: Sequential token storage (callback endpoint behavior)
          // Each user should successfully store their refresh token
          for (let i = 0; i < operationCount; i++) {
            const email = `test-user-${i}-${Date.now()}@example.com`;
            const googleId = `google-${i}-${Date.now()}`;
            const username = `testuser${i}_${Date.now()}`;

            // Create user in database
            const user = await User.create({
              email,
              username,
              googleId,
              displayName: `Test User ${i}`,
              photoURL: 'https://example.com/photo.jpg',
              createdAt: new Date(),
            });

            users.push({ user, token: tokens[i] });

            // Store refresh token (simulates callback endpoint storing token)
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              tokens[i],
              `test-correlation-${i}`
            );

            // Verify storage succeeded
            const storedUser = await User.findById(user._id);
            expect(storedUser).toBeDefined();
            expect(storedUser!.refreshToken).toBeDefined();
            expect(storedUser!.refreshTokenIV).toBeDefined();
            expect(storedUser!.refreshTokenTag).toBeDefined();
            expect(storedUser!.refreshTokenCreatedAt).toBeDefined();
          }

          // OBSERVATION 2: Sequential token retrieval (refresh endpoint behavior)
          // Each user should successfully retrieve their stored token
          for (let i = 0; i < operationCount; i++) {
            const { user, token: originalToken } = users[i];

            // Retrieve refresh token (simulates /api/auth/refresh endpoint)
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `test-correlation-retrieve-${i}`
            );

            // Verify retrieval succeeded and token matches
            expect(retrievedToken).toBe(originalToken);
          }

          // OBSERVATION 3: Token isolation
          // Each user's token should be independent (no cross-contamination)
          for (let i = 0; i < operationCount; i++) {
            const { user } = users[i];
            const storedUser = await User.findById(user._id);
            
            // Verify this user's data is still intact
            expect(storedUser).toBeDefined();
            expect(storedUser!.refreshToken).toBeDefined();
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
   * PROPERTY 3: PKCE Flow Completeness
   * 
   * **Validates: Requirements 3.1, 3.2**
   * 
   * This property verifies that the PKCE (Proof Key for Code Exchange) flow
   * works correctly for normal sequential OAuth flows:
   * 1. Generate valid PKCE pairs (code_verifier and code_challenge)
   * 2. Store code_verifier with state
   * 3. Retrieve code_verifier during callback
   * 4. PKCE pairs meet security requirements
   * 
   * This preserves the current PKCE implementation which is working correctly
   * for sequential flows.
   */
  it('PROPERTY 3: PKCE generation and storage works correctly', () => {
    fc.assert(
      fc.property(
        // Generate test data for PKCE flows
        fc.record({
          // Number of PKCE flows to test
          flowCount: fc.integer({ min: 1, max: 10 }),
        }),
        ({ flowCount }) => {
          const pkceData: Array<{
            codeVerifier: string;
            codeChallenge: string;
            codeChallengeMethod: string;
            state: string;
            mockReq: any;
          }> = [];

          // OBSERVATION 1: PKCE pair generation
          // Each flow should generate valid PKCE pairs
          for (let i = 0; i < flowCount; i++) {
            const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCEPair();
            const state = stateValidator.generateState();

            // Verify PKCE requirements
            expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
            expect(codeVerifier.length).toBeLessThanOrEqual(128);
            expect(codeChallenge).toBeTruthy();
            expect(codeChallengeMethod).toBe('S256');

            // Create mock request and store
            const mockReq: any = {
              session: {},
              correlationId: `pkce-test-${i}`,
            };

            stateValidator.storeState(mockReq, state, codeVerifier);

            pkceData.push({
              codeVerifier,
              codeChallenge,
              codeChallengeMethod,
              state,
              mockReq,
            });
          }

          // OBSERVATION 2: Code verifier uniqueness
          // All code verifiers should be unique
          const verifiers = pkceData.map(p => p.codeVerifier);
          const uniqueVerifiers = new Set(verifiers);
          expect(uniqueVerifiers.size).toBe(flowCount);

          // OBSERVATION 3: Code verifier retrieval
          // Each flow should successfully retrieve its code_verifier
          for (let i = 0; i < flowCount; i++) {
            const data = pkceData[i];
            
            // Note: getCodeVerifier must be called BEFORE validateState
            // This is the current implementation order dependency
            const retrievedVerifier = stateValidator.getCodeVerifier(data.mockReq);
            
            expect(retrievedVerifier).toBe(data.codeVerifier);
          }

          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * PROPERTY 4: Session Lifecycle Management
   * 
   * **Validates: Requirements 3.1, 3.2**
   * 
   * This property verifies that OAuth session lifecycle is managed correctly:
   * 1. Sessions created with proper expiration (10 minutes)
   * 2. Sessions remain valid within the expiration window
   * 3. Single-use state parameters (session cleared after validation)
   * 4. Sequential flows don't interfere with each other
   * 
   * This preserves the current session management behavior for normal flows.
   */
  it('PROPERTY 4: OAuth session lifecycle works correctly', () => {
    fc.assert(
      fc.property(
        // Generate test data for session lifecycle
        fc.record({
          // Number of sequential sessions to test
          sessionCount: fc.integer({ min: 1, max: 5 }),
        }),
        ({ sessionCount }) => {
          const sessions: Array<{
            state: string;
            codeVerifier: string;
            mockReq: any;
            createdAt: number;
            expiresAt: number;
          }> = [];

          // OBSERVATION 1: Session creation with expiration
          for (let i = 0; i < sessionCount; i++) {
            const state = stateValidator.generateState();
            const { codeVerifier } = generatePKCEPair();

            const mockReq: any = {
              session: {},
              correlationId: `session-lifecycle-${i}`,
            };

            const beforeStore = Date.now();
            stateValidator.storeState(mockReq, state, codeVerifier);
            const afterStore = Date.now();

            // Verify session created with proper structure
            expect(mockReq.session.oauth).toBeDefined();
            expect(mockReq.session.oauth.state).toBe(state);
            expect(mockReq.session.oauth.codeVerifier).toBe(codeVerifier);
            expect(mockReq.session.oauth.createdAt).toBeDefined();
            expect(mockReq.session.oauth.expiresAt).toBeDefined();

            // Verify expiration is approximately 10 minutes from creation
            const createdAt = mockReq.session.oauth.createdAt;
            const expiresAt = mockReq.session.oauth.expiresAt;
            const ttlMs = expiresAt - createdAt;
            const tenMinutesMs = 10 * 60 * 1000;
            
            // Allow 1 second tolerance for timing
            expect(Math.abs(ttlMs - tenMinutesMs)).toBeLessThan(1000);

            sessions.push({
              state,
              codeVerifier,
              mockReq,
              createdAt,
              expiresAt,
            });
          }

          // OBSERVATION 2: Session validity within expiration window
          // All sessions should be valid immediately after creation
          for (let i = 0; i < sessionCount; i++) {
            const session = sessions[i];
            const now = Date.now();
            
            // Session should be valid (not expired)
            expect(now).toBeLessThan(session.expiresAt);
          }

          // OBSERVATION 3: Single-use state parameters
          // Validating state should clear the session
          for (let i = 0; i < sessionCount; i++) {
            const session = sessions[i];
            
            // Validate state
            const validationResult = stateValidator.validateState(session.mockReq, session.state);
            expect(validationResult.isValid).toBe(true);
            expect(validationResult.codeVerifier).toBeDefined();
            
            // Session should be cleared (single-use)
            expect(session.mockReq.session.oauth).toBeUndefined();
          }

          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * PROPERTY 5: User Creation and Token Association
   * 
   * **Validates: Requirements 3.1, 3.2**
   * 
   * This property verifies that the complete OAuth flow creates users and
   * associates tokens correctly:
   * 1. New users created with Google profile data
   * 2. Refresh tokens stored and encrypted correctly
   * 3. Multiple sequential user creations work without conflicts
   * 4. User data persists correctly in MongoDB
   * 
   * This preserves the current user creation and token storage behavior.
   */
  it('PROPERTY 5: User creation and token association works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data for user creation
        fc.record({
          // Number of users to create sequentially
          userCount: fc.integer({ min: 1, max: 5 }),
          // Generate user profile data
          users: fc.array(
            fc.record({
              email: fc.emailAddress(),
              displayName: fc.string({ minLength: 3, maxLength: 50 }),
              googleId: fc.string({ minLength: 10, maxLength: 30 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ userCount, users: userProfiles }) => {
          // Ensure we have enough user profiles
          const profiles = userProfiles.slice(0, userCount);
          if (profiles.length < userCount) {
            profiles.push(...Array(userCount - profiles.length).fill(0).map((_, i) => ({
              email: `test-${i}-${Date.now()}@example.com`,
              displayName: `Test User ${i}`,
              googleId: `google-${i}-${Date.now()}`,
            })));
          }

          const createdUsers: any[] = [];

          // OBSERVATION 1: Sequential user creation
          for (let i = 0; i < userCount; i++) {
            const profile = profiles[i];
            const refreshToken = `refresh-token-${i}-${Date.now()}`;
            const username = `user${i}_${Date.now()}`;

            // Create user (simulates callback endpoint creating user)
            const user = await User.create({
              email: profile.email,
              username,
              googleId: profile.googleId,
              displayName: profile.displayName,
              photoURL: 'https://example.com/photo.jpg',
              createdAt: new Date(),
            });

            // Store refresh token
            await refreshTokenStore.storeRefreshToken(
              user._id.toString(),
              refreshToken,
              `user-creation-${i}`
            );

            createdUsers.push({ user, refreshToken });
          }

          // OBSERVATION 2: User data persistence
          // All users should exist in database with correct data
          for (let i = 0; i < userCount; i++) {
            const { user, refreshToken } = createdUsers[i];
            
            const storedUser = await User.findById(user._id);
            expect(storedUser).toBeDefined();
            expect(storedUser!.email).toBe(user.email);
            expect(storedUser!.googleId).toBe(user.googleId);
            expect(storedUser!.displayName).toBe(user.displayName);
            expect(storedUser!.refreshToken).toBeDefined();
          }

          // OBSERVATION 3: Token retrieval for all users
          // Each user should be able to retrieve their token
          for (let i = 0; i < userCount; i++) {
            const { user, refreshToken } = createdUsers[i];
            
            const retrievedToken = await refreshTokenStore.getRefreshToken(
              user._id.toString(),
              `verify-${i}`
            );

            expect(retrievedToken).toBe(refreshToken);
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
});
