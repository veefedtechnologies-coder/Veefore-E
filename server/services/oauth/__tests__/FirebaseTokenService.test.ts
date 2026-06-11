import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FirebaseTokenService, GoogleUserInfo } from '../FirebaseTokenService';
import { User } from '../../../models/User/User';
import * as firebaseAdmin from '../../../firebase-admin';

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

describe('FirebaseTokenService', () => {
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

  describe('createFirebaseToken', () => {
    const mockGoogleUserInfo: GoogleUserInfo = {
      sub: 'google-user-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
      given_name: 'Test',
      family_name: 'User',
    };

    it('should create new user and Firebase token for first-time Google OAuth user', async () => {
      // Mock: User doesn't exist
      vi.mocked(User.findOne).mockResolvedValue(null);

      // Mock: User creation
      const mockUser = {
        _id: 'new-user-id',
        email: mockGoogleUserInfo.email,
        googleId: mockGoogleUserInfo.sub,
        displayName: mockGoogleUserInfo.name,
        avatar: mockGoogleUserInfo.picture,
        username: 'test',
        isEmailVerified: true,
        credits: 50,
        plan: 'Free',
        createdAt: expect.any(Date),
        lastLoginAt: expect.any(Date),
      };
      vi.mocked(User.create).mockResolvedValue(mockUser as any);

      // Mock: Firebase custom token creation
      const mockCustomToken = 'firebase-custom-token-xyz';
      mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

      // Execute
      const result = await firebaseTokenService.createFirebaseToken(mockGoogleUserInfo);

      // Verify user lookup
      expect(User.findOne).toHaveBeenCalledWith({ email: mockGoogleUserInfo.email });

      // Verify user creation
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: mockGoogleUserInfo.email,
          googleId: mockGoogleUserInfo.sub,
          displayName: mockGoogleUserInfo.name,
          avatar: mockGoogleUserInfo.picture,
          isEmailVerified: true,
          credits: 50,
          plan: 'Free',
        })
      );

      // Verify Firebase token creation
      expect(mockAuth.createCustomToken).toHaveBeenCalledWith(
        'new-user-id',
        expect.objectContaining({
          email: mockGoogleUserInfo.email,
          emailVerified: true,
          googleId: mockGoogleUserInfo.sub,
        })
      );

      // Verify result
      expect(result).toEqual({
        customToken: mockCustomToken,
        user: mockUser,
        isNewUser: true,
      });
    });

    it('should update existing user and create Firebase token', async () => {
      // Mock: Existing user
      const mockUser = {
        _id: 'existing-user-id',
        email: mockGoogleUserInfo.email,
        username: 'existinguser',
        displayName: null, // Not set, should be updated
        avatar: null,      // Not set, should be updated
        googleId: null,
        isEmailVerified: false,
        lastLoginAt: new Date('2024-01-01'),
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

      // Mock: Firebase custom token creation
      const mockCustomToken = 'firebase-custom-token-abc';
      mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

      // Execute
      const result = await firebaseTokenService.createFirebaseToken(mockGoogleUserInfo);

      // Verify user lookup
      expect(User.findOne).toHaveBeenCalledWith({ email: mockGoogleUserInfo.email });

      // Verify user was updated
      expect(mockUser.googleId).toBe(mockGoogleUserInfo.sub);
      expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
      // Avatar and displayName should be updated since they were null
      expect(mockUser.avatar).toBe(mockGoogleUserInfo.picture);
      expect(mockUser.displayName).toBe(mockGoogleUserInfo.name);
      expect(mockUser.save).toHaveBeenCalled();

      // Verify Firebase token creation
      expect(mockAuth.createCustomToken).toHaveBeenCalledWith(
        'existing-user-id',
        expect.objectContaining({
          email: mockGoogleUserInfo.email,
        })
      );

      // Verify result
      expect(result).toEqual({
        customToken: mockCustomToken,
        user: mockUser,
        isNewUser: false,
      });
    });

    it('should preserve existing googleId if already set', async () => {
      // Mock: Existing user with googleId
      const mockUser = {
        _id: 'existing-user-id',
        email: mockGoogleUserInfo.email,
        username: 'existinguser',
        googleId: 'existing-google-id',
        displayName: 'Existing Name',
        avatar: 'https://example.com/old-photo.jpg',
        isEmailVerified: true,
        lastLoginAt: new Date('2024-01-01'),
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

      // Mock: Firebase custom token creation
      const mockCustomToken = 'firebase-custom-token-def';
      mockAuth.createCustomToken.mockResolvedValue(mockCustomToken);

      // Execute
      const result = await firebaseTokenService.createFirebaseToken(mockGoogleUserInfo);

      // Verify googleId was NOT changed
      expect(mockUser.googleId).toBe('existing-google-id');
      
      // Verify lastLoginAt was updated
      expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
      expect(mockUser.lastLoginAt.getTime()).toBeGreaterThan(new Date('2024-01-01').getTime());

      // Verify save was called
      expect(mockUser.save).toHaveBeenCalled();

      // Verify result
      expect(result.isNewUser).toBe(false);
    });

    it('should throw error with user-friendly message on Firebase token creation failure', async () => {
      // Mock: Existing user
      const mockUser = {
        _id: 'user-id',
        email: mockGoogleUserInfo.email,
        username: 'testuser',
        googleId: 'google-123',
        isEmailVerified: true,
        lastLoginAt: new Date(),
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

      // Mock: Firebase token creation failure
      mockAuth.createCustomToken.mockRejectedValue(new Error('Firebase auth error'));

      // Execute & Assert
      await expect(
        firebaseTokenService.createFirebaseToken(mockGoogleUserInfo)
      ).rejects.toThrow('Failed to create authentication token');
    });

    it('should handle user creation with sanitized username', async () => {
      // Mock: User doesn't exist
      vi.mocked(User.findOne).mockResolvedValue(null);

      // Mock: User creation
      const mockUser = {
        _id: 'new-user-id',
        email: 'user+test@example.com',
        username: 'usertest',
        save: vi.fn(),
      };
      vi.mocked(User.create).mockResolvedValue(mockUser as any);

      // Mock: Firebase custom token creation
      mockAuth.createCustomToken.mockResolvedValue('token');

      const googleInfo: GoogleUserInfo = {
        sub: 'google-123',
        email: 'user+test@example.com',
        email_verified: true,
        name: 'User Test',
        picture: 'https://example.com/photo.jpg',
      };

      // Execute
      await firebaseTokenService.createFirebaseToken(googleInfo);

      // Verify username was sanitized (+ removed)
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user+test@example.com',
          username: expect.stringMatching(/^[a-z0-9]+$/),
        })
      );
    });
  });

  describe('verifyToken', () => {
    it('should successfully verify valid Firebase token', async () => {
      const mockToken = 'valid-firebase-id-token';
      const mockDecodedToken = {
        uid: 'user-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: 'test@example.com',
        email_verified: true,
      };

      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);

      const result = await firebaseTokenService.verifyToken(mockToken);

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual({
        uid: mockDecodedToken.uid,
        iat: mockDecodedToken.iat,
        exp: mockDecodedToken.exp,
        email: mockDecodedToken.email,
        emailVerified: mockDecodedToken.email_verified,
      });
    });

    it('should throw error for invalid token', async () => {
      const mockToken = 'invalid-token';

      mockAuth.verifyIdToken.mockRejectedValue(new Error('Token verification failed'));

      await expect(
        firebaseTokenService.verifyToken(mockToken)
      ).rejects.toThrow('Invalid or expired authentication token');
    });

    it('should throw error for expired token', async () => {
      const mockToken = 'expired-token';

      mockAuth.verifyIdToken.mockRejectedValue(new Error('Token expired'));

      await expect(
        firebaseTokenService.verifyToken(mockToken)
      ).rejects.toThrow('Invalid or expired authentication token');
    });
  });

  describe('username generation', () => {
    it('should handle username collision by appending random number', async () => {
      const googleInfo: GoogleUserInfo = {
        sub: 'google-123',
        email: 'test@example.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      };

      // Mock: User doesn't exist (first call for email lookup)
      // Then mock username collision (findOne returns existing user)
      // Then mock no collision on second attempt
      vi.mocked(User.findOne)
        .mockResolvedValueOnce(null) // Email lookup - no existing user
        .mockResolvedValueOnce({ username: 'test' } as any) // Username collision
        .mockResolvedValueOnce(null); // No collision with random suffix

      // Mock: User creation
      const mockUser = {
        _id: 'new-user-id',
        username: expect.stringMatching(/^test\d+$/),
      };
      vi.mocked(User.create).mockResolvedValue(mockUser as any);

      // Mock: Firebase token creation
      mockAuth.createCustomToken.mockResolvedValue('token');

      // Execute
      await firebaseTokenService.createFirebaseToken(googleInfo);

      // Verify User.findOne was called multiple times (email + username checks)
      expect(User.findOne).toHaveBeenCalledTimes(3);
      
      // Verify user was created with a username that has random suffix
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: expect.stringMatching(/^test\d+$/),
        })
      );
    });
  });
});
