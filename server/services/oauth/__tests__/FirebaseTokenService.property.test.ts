import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { FirebaseTokenService, GoogleUserInfo } from '../FirebaseTokenService';
import { User } from '../../../models/User/User';
import * as firebaseAdmin from '../../../firebase-admin';

/**
 * Property-based tests for FirebaseTokenService
 * 
 * Feature: server-side-oauth-implementation
 * Property 13: Firebase Token Creation Round-Trip
 * 
 * **Validates: Requirements 3.4, 3.5, 3.8**
 * 
 * This test verifies that:
 * - Firebase custom tokens can be created for random Google user info payloads
 * - Created tokens can be verified to extract user identifiers
 * - Extracted identifiers match the original user data
 * - The round-trip (create → verify) preserves user identity
 */

// Mock the User model
vi.mock('../../../models/User/User', () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  },
}));

// Mock Firebase Admin
vi.mock('../../../firebase-admin', () => ({
  getFirebaseAdmin: vi.fn(),
  admin: {},
}));

describe('FirebaseTokenService Property Tests', () => {
  let firebaseTokenService: FirebaseTokenService;
  let mockAuth: any;
  let mockAdmin: any;

  beforeEach(() => {
    firebaseTokenService = new FirebaseTokenService();
    vi.clearAllMocks();

    // Setup Firebase Admin mock
    mockAuth = {
      createCustomToken: vi.fn(),
      verifyIdToken: vi.fn(),
    };

    mockAdmin = {
      auth: () => mockAuth,
    };

    vi.mocked(firebaseAdmin.getFirebaseAdmin).mockReturnValue(mockAdmin as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Property 13: Firebase Token Creation Round-Trip', () => {
    /**
     * Property: For all valid Google user info payloads, creating a Firebase custom token
     * then verifying it returns the original user identifier.
     * 
     * This property verifies:
     * 1. Token creation succeeds for arbitrary valid user data
     * 2. Token verification succeeds for all created tokens
     * 3. User ID is preserved through the round-trip
     * 4. Email is preserved through the round-trip
     * 5. Email verification status is preserved
     */
    it('should preserve user identity through create-verify round-trip (100 iterations)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Arbitrary Google user info generator
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 40 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            email: fc.emailAddress(),
            email_verified: fc.boolean(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            picture: fc.webUrl(),
            given_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            family_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          }),
          async (googleUserInfo: GoogleUserInfo) => {
            // Generate a unique user ID for this test
            const userId = `user-${googleUserInfo.sub.substring(0, 10)}`;

            // Mock: User doesn't exist (new user scenario)
            vi.mocked(User.findOne).mockResolvedValue(null);

            // Mock: User creation with the generated ID
            const mockUser = {
              _id: userId,
              email: googleUserInfo.email,
              googleId: googleUserInfo.sub,
              displayName: googleUserInfo.name,
              avatar: googleUserInfo.picture,
              username: googleUserInfo.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
              isEmailVerified: googleUserInfo.email_verified,
              credits: 50,
              plan: 'Free',
              createdAt: new Date(),
              lastLoginAt: new Date(),
            };
            vi.mocked(User.create).mockResolvedValue(mockUser as any);

            // Mock: Firebase custom token creation
            // In a real scenario, this would be a JWT token
            // For testing, we create a mock token that encodes the user ID
            const mockCustomToken = `firebase-token-${userId}`;
            mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

            // Mock: Firebase ID token verification (simulating what happens when the custom token is used)
            // In reality, the client would exchange the custom token for an ID token
            // We simulate the verification of that ID token here
            const mockDecodedToken = {
              uid: userId,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
              email: googleUserInfo.email,
              email_verified: googleUserInfo.email_verified,
            };
            mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

            // Step 1: Create Firebase token
            const createResult = await firebaseTokenService.createFirebaseToken(googleUserInfo);

            // Verify token was created
            expect(createResult).toBeDefined();
            expect(createResult.customToken).toBe(mockCustomToken);
            expect(createResult.user).toBeDefined();
            expect(createResult.user._id).toBe(userId);

            // Verify Firebase Admin was called correctly
            expect(mockAuth.createCustomToken).toHaveBeenCalledWith(
              userId,
              expect.objectContaining({
                email: googleUserInfo.email,
                emailVerified: googleUserInfo.email_verified,
                googleId: googleUserInfo.sub,
              })
            );

            // Step 2: Verify the token (simulating client exchanging custom token for ID token and verifying)
            const verifyResult = await firebaseTokenService.verifyToken(mockCustomToken);

            // Verify the round-trip preserved the user identity
            expect(verifyResult).toBeDefined();
            expect(verifyResult.uid).toBe(userId);
            expect(verifyResult.email).toBe(googleUserInfo.email);
            expect(verifyResult.emailVerified).toBe(googleUserInfo.email_verified);

            // Property assertion: User ID matches original
            expect(verifyResult.uid).toBe(createResult.user._id);
            
            // Property assertion: Email matches original
            expect(verifyResult.email).toBe(googleUserInfo.email);
            
            // Property assertion: Email verification status matches original
            expect(verifyResult.emailVerified).toBe(googleUserInfo.email_verified);
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * Property: Firebase token creation should handle existing users correctly
     * and preserve their existing IDs in the round-trip.
     */
    it('should preserve existing user ID through round-trip for existing users (100 iterations)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 40 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            email: fc.emailAddress(),
            email_verified: fc.boolean(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            picture: fc.webUrl(),
          }),
          fc.string({ minLength: 10, maxLength: 30 }), // Existing user ID
          async (googleUserInfo: GoogleUserInfo, existingUserId: string) => {
            // Mock: Existing user
            const mockUser = {
              _id: existingUserId,
              email: googleUserInfo.email,
              username: 'existinguser',
              googleId: null, // Will be updated
              displayName: 'Existing User',
              avatar: 'https://example.com/old.jpg',
              isEmailVerified: false,
              lastLoginAt: new Date('2024-01-01'),
              save: vi.fn().mockResolvedValue(true),
            };
            vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

            // Mock: Firebase custom token creation
            const mockCustomToken = `firebase-token-${existingUserId}`;
            mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

            // Mock: Firebase ID token verification
            const mockDecodedToken = {
              uid: existingUserId,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 3600,
              email: googleUserInfo.email,
              email_verified: googleUserInfo.email_verified,
            };
            mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

            // Step 1: Create Firebase token for existing user
            const createResult = await firebaseTokenService.createFirebaseToken(googleUserInfo);

            // Verify token was created with existing user's ID
            expect(createResult.customToken).toBe(mockCustomToken);
            expect(createResult.user._id).toBe(existingUserId);
            expect(createResult.isNewUser).toBe(false);

            // Step 2: Verify the token
            const verifyResult = await firebaseTokenService.verifyToken(mockCustomToken);

            // Property assertion: Existing user ID is preserved
            expect(verifyResult.uid).toBe(existingUserId);
            expect(verifyResult.uid).toBe(createResult.user._id);

            // Property assertion: Email matches
            expect(verifyResult.email).toBe(googleUserInfo.email);
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });

    /**
     * Property: Token expiration time should be correctly set and preserved
     */
    it('should create tokens with valid expiration times (100 iterations)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sub: fc.string({ minLength: 10, maxLength: 40 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            email: fc.emailAddress(),
            email_verified: fc.boolean(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            picture: fc.webUrl(),
          }),
          async (googleUserInfo: GoogleUserInfo) => {
            const userId = `user-${googleUserInfo.sub.substring(0, 10)}`;
            const currentTime = Math.floor(Date.now() / 1000);

            // Mock user creation
            vi.mocked(User.findOne).mockResolvedValue(null);
            vi.mocked(User.create).mockResolvedValue({
              _id: userId,
              email: googleUserInfo.email,
              googleId: googleUserInfo.sub,
            } as any);

            // Mock token creation
            const mockCustomToken = `firebase-token-${userId}`;
            mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

            // Mock token verification with realistic expiration (1 hour)
            const mockDecodedToken = {
              uid: userId,
              iat: currentTime,
              exp: currentTime + 3600, // 1 hour expiration
              email: googleUserInfo.email,
              email_verified: googleUserInfo.email_verified,
            };
            mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

            // Create token
            await firebaseTokenService.createFirebaseToken(googleUserInfo);

            // Verify token
            const verifyResult = await firebaseTokenService.verifyToken(mockCustomToken);

            // Property assertion: Token has valid timestamps
            expect(verifyResult.iat).toBeDefined();
            expect(verifyResult.exp).toBeDefined();
            expect(verifyResult.exp).toBeGreaterThan(verifyResult.iat);

            // Property assertion: Expiration is in the future
            expect(verifyResult.exp).toBeGreaterThan(currentTime);

            // Property assertion: Expiration is reasonable (between 1 minute and 24 hours)
            const expirationDuration = verifyResult.exp - verifyResult.iat;
            expect(expirationDuration).toBeGreaterThanOrEqual(60); // At least 1 minute
            expect(expirationDuration).toBeLessThanOrEqual(86400); // At most 24 hours
          }
        ),
        {
          numRuns: 100,
          verbose: true,
        }
      );
    });
  });
});
