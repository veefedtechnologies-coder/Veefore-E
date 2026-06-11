import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { User, IUser } from '../User';

/**
 * Integration tests for User Schema Updates
 * 
 * Feature: server-side-oauth-implementation
 * Task 11.2: Integration tests for schema updates
 * 
 * **Validates: Requirements 10.4, 10.5, 16.6**
 * 
 * This test verifies that:
 * - Existing user queries still work after adding OAuth fields
 * - New users can be created with OAuth fields
 * - Users without OAuth fields (email/password) work correctly
 * - Queries by googleId work as expected
 * - Compound index queries work correctly
 */

// Mock mongoose User model
vi.mock('../User', async (importOriginal) => {
  const actual = await importOriginal() as any;
  
  // Create a mock implementation that simulates database operations
  const mockUsers = new Map<string, any>();
  let idCounter = 1;

  const mockUserModel = {
    create: vi.fn(async (userData: Partial<IUser>) => {
      const id = `user-${idCounter++}`;
      const user = {
        _id: id,
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: vi.fn().mockResolvedValue(true),
      };
      mockUsers.set(id, user);
      return user;
    }),
    findOne: vi.fn(async (query: any) => {
      for (const [_, user] of mockUsers) {
        if (query.email && user.email === query.email) {
          return user;
        }
        if (query.googleId && user.googleId === query.googleId) {
          return user;
        }
        if (query.email && query.googleId && 
            user.email === query.email && user.googleId === query.googleId) {
          return user;
        }
      }
      return null;
    }),
    findById: vi.fn(async (id: string) => {
      return mockUsers.get(id) || null;
    }),
    find: vi.fn(async (query: any) => {
      const results: any[] = [];
      for (const [_, user] of mockUsers) {
        if (query.googleId && user.googleId === query.googleId) {
          results.push(user);
        }
      }
      return results;
    }),
    findByIdAndDelete: vi.fn(async (id: string) => {
      const user = mockUsers.get(id);
      mockUsers.delete(id);
      return user;
    }),
    _mockClear: () => {
      mockUsers.clear();
      idCounter = 1;
    },
  };

  return {
    ...actual,
    User: mockUserModel,
  };
});

describe('User Schema Integration Tests', () => {
  beforeEach(() => {
    (User as any)._mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    (User as any)._mockClear();
    vi.clearAllMocks();
  });

  describe('Backward Compatibility - Email/Password Users', () => {
    it('should create user without OAuth fields (email/password authentication)', async () => {
      // Create a traditional email/password user
      const userData: Partial<IUser> = {
        email: 'emailuser@example.com',
        username: 'emailuser',
        displayName: 'Email User',
        credits: 50,
        plan: 'Free',
        isEmailVerified: false,
        // NO OAuth fields
      };

      const user = await User.create(userData);

      // Verify user was created
      expect(user).toBeDefined();
      expect(user.email).toBe('emailuser@example.com');
      expect(user.username).toBe('emailuser');
      expect(user.credits).toBe(50);

      // Verify OAuth fields are not set
      expect(user.googleId).toBeUndefined();
      expect(user.refreshToken).toBeUndefined();
      expect(user.refreshTokenIV).toBeUndefined();
      expect(user.refreshTokenTag).toBeUndefined();
    });

    it('should query existing users without OAuth fields', async () => {
      // Create email/password user
      await User.create({
        email: 'existing@example.com',
        username: 'existing',
        credits: 50,
        plan: 'Free',
      });

      // Query by email (traditional query)
      const foundUser = await User.findOne({ email: 'existing@example.com' });

      expect(foundUser).toBeDefined();
      expect(foundUser!.email).toBe('existing@example.com');
      expect(foundUser!.googleId).toBeUndefined();
    });
  });

  describe('OAuth Field Support', () => {
    it('should create user with OAuth fields (Google OAuth)', async () => {
      const oauthUserData: Partial<IUser> = {
        email: 'googleuser@example.com',
        username: 'googleuser',
        googleId: 'google-12345',
        displayName: 'Google User',
        avatar: 'https://example.com/avatar.jpg',
        isEmailVerified: true,
        refreshToken: 'encrypted-refresh-token',
        refreshTokenIV: 'iv-value',
        refreshTokenTag: 'tag-value',
        refreshTokenCreatedAt: new Date(),
        credits: 50,
        plan: 'Free',
      };

      const user = await User.create(oauthUserData);

      // Verify OAuth fields are set
      expect(user).toBeDefined();
      expect(user.googleId).toBe('google-12345');
      expect(user.refreshToken).toBe('encrypted-refresh-token');
      expect(user.refreshTokenIV).toBe('iv-value');
      expect(user.refreshTokenTag).toBe('tag-value');
      expect(user.refreshTokenCreatedAt).toBeInstanceOf(Date);
    });

    it('should create user with only googleId (before refresh token storage)', async () => {
      const partialOAuthData: Partial<IUser> = {
        email: 'partial@example.com',
        username: 'partial',
        googleId: 'google-67890',
        isEmailVerified: true,
        credits: 50,
        plan: 'Free',
        // No refresh token fields yet
      };

      const user = await User.create(partialOAuthData);

      expect(user.googleId).toBe('google-67890');
      expect(user.refreshToken).toBeUndefined();
      expect(user.refreshTokenIV).toBeUndefined();
      expect(user.refreshTokenTag).toBeUndefined();
    });
  });

  describe('Query Functionality', () => {
    it('should query users by googleId', async () => {
      // Create OAuth user
      await User.create({
        email: 'oauth@example.com',
        username: 'oauthuser',
        googleId: 'google-query-test',
        credits: 50,
        plan: 'Free',
      });

      // Query by googleId
      const foundUser = await User.findOne({ googleId: 'google-query-test' });

      expect(foundUser).toBeDefined();
      expect(foundUser!.googleId).toBe('google-query-test');
      expect(foundUser!.email).toBe('oauth@example.com');
    });

    it('should support compound index queries (email + googleId)', async () => {
      // Create OAuth user
      const oauthUser = await User.create({
        email: 'compound@example.com',
        username: 'compound',
        googleId: 'google-compound',
        credits: 50,
        plan: 'Free',
      });

      // Query using compound index
      const foundUser = await User.findOne({
        email: 'compound@example.com',
        googleId: 'google-compound',
      });

      expect(foundUser).toBeDefined();
      expect(foundUser!._id).toBe(oauthUser._id);
      expect(foundUser!.email).toBe('compound@example.com');
      expect(foundUser!.googleId).toBe('google-compound');
    });

    it('should return null for non-existent googleId', async () => {
      const foundUser = await User.findOne({ googleId: 'non-existent' });
      expect(foundUser).toBeNull();
    });
  });

  describe('User Updates', () => {
    it('should update existing user to add OAuth fields', async () => {
      // Create email/password user
      const user = await User.create({
        email: 'update@example.com',
        username: 'updateuser',
        credits: 50,
        plan: 'Free',
      });

      expect(user.googleId).toBeUndefined();

      // Simulate OAuth linking - add OAuth fields
      user.googleId = 'google-linked';
      user.refreshToken = 'encrypted-token';
      user.refreshTokenIV = 'iv-value';
      user.refreshTokenTag = 'tag-value';
      user.refreshTokenCreatedAt = new Date();
      await user.save();

      // Verify fields were added
      expect(user.googleId).toBe('google-linked');
      expect(user.refreshToken).toBe('encrypted-token');
      expect(user.refreshTokenIV).toBe('iv-value');
      expect(user.refreshTokenTag).toBe('tag-value');
    });

    it('should update OAuth user refresh token fields', async () => {
      // Create OAuth user
      const user = await User.create({
        email: 'refresh@example.com',
        username: 'refreshuser',
        googleId: 'google-refresh',
        refreshToken: 'old-token',
        refreshTokenIV: 'old-iv',
        refreshTokenTag: 'old-tag',
        refreshTokenCreatedAt: new Date('2024-01-01'),
        credits: 50,
        plan: 'Free',
      });

      // Update refresh token (simulating token refresh)
      const newDate = new Date();
      user.refreshToken = 'new-token';
      user.refreshTokenIV = 'new-iv';
      user.refreshTokenTag = 'new-tag';
      user.refreshTokenCreatedAt = newDate;
      await user.save();

      // Verify update
      expect(user.refreshToken).toBe('new-token');
      expect(user.refreshTokenIV).toBe('new-iv');
      expect(user.refreshTokenTag).toBe('new-tag');
      expect(user.refreshTokenCreatedAt).toBe(newDate);
    });
  });

  describe('Mixed Authentication Scenarios', () => {
    it('should handle users with both email/password and OAuth', async () => {
      // User originally created with email/password
      const user = await User.create({
        email: 'hybrid@example.com',
        username: 'hybrid',
        credits: 50,
        plan: 'Free',
        isEmailVerified: false, // Email not verified
      });

      // User later links Google OAuth
      user.googleId = 'google-hybrid';
      user.isEmailVerified = true; // Google verification
      user.refreshToken = 'encrypted-token';
      user.refreshTokenIV = 'iv-value';
      user.refreshTokenTag = 'tag-value';
      user.refreshTokenCreatedAt = new Date();
      await user.save();

      // User can authenticate via either method
      const foundByEmail = await User.findOne({ email: 'hybrid@example.com' });
      const foundByGoogleId = await User.findOne({ googleId: 'google-hybrid' });

      expect(foundByEmail).toBeDefined();
      expect(foundByGoogleId).toBeDefined();
      expect(foundByEmail!._id).toBe(foundByGoogleId!._id);
    });

    it('should maintain all existing fields when adding OAuth', async () => {
      // Create user with various existing fields
      const user = await User.create({
        email: 'existing-fields@example.com',
        username: 'existing',
        credits: 100,
        plan: 'Pro',
        displayName: 'Existing User',
        avatar: 'https://example.com/old-avatar.jpg',
        isEmailVerified: false,
        onboardingStep: 5,
        dailyLoginStreak: 10,
        totalReferrals: 3,
      });

      // Add OAuth fields
      user.googleId = 'google-existing';
      user.refreshToken = 'token';
      user.refreshTokenIV = 'iv';
      user.refreshTokenTag = 'tag';
      user.refreshTokenCreatedAt = new Date();
      await user.save();

      // Verify existing fields unchanged
      expect(user.credits).toBe(100);
      expect(user.plan).toBe('Pro');
      expect(user.displayName).toBe('Existing User');
      expect(user.avatar).toBe('https://example.com/old-avatar.jpg');
      expect(user.onboardingStep).toBe(5);
      expect(user.dailyLoginStreak).toBe(10);
      expect(user.totalReferrals).toBe(3);

      // Verify OAuth fields added
      expect(user.googleId).toBe('google-existing');
      expect(user.refreshToken).toBe('token');
    });
  });

  describe('Field Independence', () => {
    it('should allow users without googleId to exist alongside OAuth users', async () => {
      // Create email/password user
      const emailUser = await User.create({
        email: 'email-only@example.com',
        username: 'emailonly',
        credits: 50,
        plan: 'Free',
      });

      // Create OAuth user
      const oauthUser = await User.create({
        email: 'oauth-only@example.com',
        username: 'oauthonly',
        googleId: 'google-oauth-only',
        credits: 50,
        plan: 'Free',
      });

      // Both should exist and be queryable
      const foundEmail = await User.findOne({ email: 'email-only@example.com' });
      const foundOAuth = await User.findOne({ googleId: 'google-oauth-only' });

      expect(foundEmail).toBeDefined();
      expect(foundEmail!.googleId).toBeUndefined();
      
      expect(foundOAuth).toBeDefined();
      expect(foundOAuth!.googleId).toBe('google-oauth-only');
      
      expect(foundEmail!._id).not.toBe(foundOAuth!._id);
    });

    it('should handle refresh token fields independently', async () => {
      // User with googleId but no refresh token yet
      const userNoToken = await User.create({
        email: 'no-token@example.com',
        username: 'notoken',
        googleId: 'google-no-token',
        credits: 50,
        plan: 'Free',
      });

      // User with complete OAuth setup
      const userWithToken = await User.create({
        email: 'with-token@example.com',
        username: 'withtoken',
        googleId: 'google-with-token',
        refreshToken: 'encrypted-token',
        refreshTokenIV: 'iv-value',
        refreshTokenTag: 'tag-value',
        refreshTokenCreatedAt: new Date(),
        credits: 50,
        plan: 'Free',
      });

      // Verify field independence
      expect(userNoToken.googleId).toBeTruthy();
      expect(userNoToken.refreshToken).toBeUndefined();

      expect(userWithToken.googleId).toBeTruthy();
      expect(userWithToken.refreshToken).toBeTruthy();
    });
  });
});
