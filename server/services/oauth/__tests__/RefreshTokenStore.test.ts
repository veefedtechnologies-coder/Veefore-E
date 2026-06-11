import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';

// Mock the User model
vi.mock('../../../models/User/User', () => ({
  User: {
    findByIdAndUpdate: vi.fn(),
    findById: vi.fn(),
  },
}));

describe('RefreshTokenStore', () => {
  let refreshTokenStore: RefreshTokenStore;
  const originalEnv = process.env.SESSION_SECRET;

  beforeEach(() => {
    // Set a valid SESSION_SECRET for testing
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    refreshTokenStore = new RefreshTokenStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env.SESSION_SECRET = originalEnv;
  });

  describe('constructor', () => {
    it('should throw error if SESSION_SECRET is not set', () => {
      delete process.env.SESSION_SECRET;
      expect(() => new RefreshTokenStore()).toThrow(
        'SESSION_SECRET environment variable is required for RefreshTokenStore'
      );
    });

    it('should throw error if SESSION_SECRET is less than 32 characters', () => {
      process.env.SESSION_SECRET = 'short-secret';
      expect(() => new RefreshTokenStore()).toThrow(
        'SESSION_SECRET must be at least 32 characters'
      );
    });

    it('should successfully initialize with valid SESSION_SECRET', () => {
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      expect(() => new RefreshTokenStore()).not.toThrow();
    });
  });

  describe('storeRefreshToken', () => {
    it('should encrypt and store refresh token successfully', async () => {
      const userId = 'test-user-id';
      const refreshToken = 'test-refresh-token-12345';

      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

      await refreshTokenStore.storeRefreshToken(userId, refreshToken);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          refreshToken: expect.any(String),
          refreshTokenIV: expect.any(String),
          refreshTokenTag: expect.any(String),
          refreshTokenCreatedAt: expect.any(Date),
        })
      );

      // Verify that the stored values are hex strings
      const callArgs = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;
      expect(callArgs.refreshToken).toMatch(/^[0-9a-f]+$/);
      expect(callArgs.refreshTokenIV).toMatch(/^[0-9a-f]+$/);
      expect(callArgs.refreshTokenTag).toMatch(/^[0-9a-f]+$/);
    });

    it('should use different IVs for identical tokens', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      const refreshToken = 'same-token-value';

      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

      await refreshTokenStore.storeRefreshToken(userId1, refreshToken);
      const call1Args = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;
      const iv1 = call1Args.refreshTokenIV;
      const encrypted1 = call1Args.refreshToken;

      await refreshTokenStore.storeRefreshToken(userId2, refreshToken);
      const call2Args = vi.mocked(User.findByIdAndUpdate).mock.calls[1][1] as any;
      const iv2 = call2Args.refreshTokenIV;
      const encrypted2 = call2Args.refreshToken;

      // IVs should be different
      expect(iv1).not.toBe(iv2);
      // Encrypted values should be different due to different IVs
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error with user-friendly message on database failure', async () => {
      const userId = 'test-user-id';
      const refreshToken = 'test-token';

      vi.mocked(User.findByIdAndUpdate).mockRejectedValue(new Error('Database error'));

      await expect(refreshTokenStore.storeRefreshToken(userId, refreshToken)).rejects.toThrow(
        'Failed to secure refresh token'
      );
    });
  });

  describe('getRefreshToken', () => {
    it('should decrypt and return refresh token successfully', async () => {
      const userId = 'test-user-id';
      const originalToken = 'original-refresh-token-value';

      // First store the token to get encrypted values
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
      await refreshTokenStore.storeRefreshToken(userId, originalToken);

      // Get the stored encrypted values
      const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

      // Mock findById to return the encrypted data
      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          refreshToken: storedData.refreshToken,
          refreshTokenIV: storedData.refreshTokenIV,
          refreshTokenTag: storedData.refreshTokenTag,
        }),
      } as any);

      // Retrieve and decrypt the token
      const decryptedToken = await refreshTokenStore.getRefreshToken(userId);

      expect(decryptedToken).toBe(originalToken);
    });

    it('should return null if refresh token is not found', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any);

      const result = await refreshTokenStore.getRefreshToken(userId);

      expect(result).toBeNull();
    });

    it('should return null if refreshTokenIV is missing', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          refreshToken: 'encrypted-token',
          refreshTokenTag: 'auth-tag',
          // Missing refreshTokenIV
        }),
      } as any);

      const result = await refreshTokenStore.getRefreshToken(userId);

      expect(result).toBeNull();
    });

    it('should return null if refreshTokenTag is missing', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          refreshToken: 'encrypted-token',
          refreshTokenIV: 'iv-value',
          // Missing refreshTokenTag
        }),
      } as any);

      const result = await refreshTokenStore.getRefreshToken(userId);

      expect(result).toBeNull();
    });

    it('should return null if decryption fails with corrupted ciphertext', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          refreshToken: 'corrupted-ciphertext',
          refreshTokenIV: crypto.randomBytes(16).toString('hex'),
          refreshTokenTag: crypto.randomBytes(16).toString('hex'),
        }),
      } as any);

      const result = await refreshTokenStore.getRefreshToken(userId);

      expect(result).toBeNull();
    });

    it('should return null if decryption fails with wrong encryption key', async () => {
      const userId = 'test-user-id';
      const originalToken = 'test-token';

      // Store with one key
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
      await refreshTokenStore.storeRefreshToken(userId, originalToken);
      const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

      // Change SESSION_SECRET (simulates key rotation)
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      const newStore = new RefreshTokenStore();

      // Try to decrypt with different key
      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue({
          refreshToken: storedData.refreshToken,
          refreshTokenIV: storedData.refreshTokenIV,
          refreshTokenTag: storedData.refreshTokenTag,
        }),
      } as any);

      const result = await newStore.getRefreshToken(userId);

      expect(result).toBeNull();
    });
  });

  describe('deleteRefreshToken', () => {
    it('should delete all refresh token fields', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

      await refreshTokenStore.deleteRefreshToken(userId);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        $unset: {
          refreshToken: '',
          refreshTokenIV: '',
          refreshTokenTag: '',
          refreshTokenCreatedAt: '',
        },
      });
    });

    it('should throw error on database failure', async () => {
      const userId = 'test-user-id';

      vi.mocked(User.findByIdAndUpdate).mockRejectedValue(new Error('Database error'));

      await expect(refreshTokenStore.deleteRefreshToken(userId)).rejects.toThrow(
        'Failed to delete refresh token'
      );
    });
  });

  describe('encryption round-trip property', () => {
    it('should successfully encrypt and decrypt various token values', async () => {
      const testTokens = [
        'short',
        'a'.repeat(100),
        'token-with-special-chars!@#$%^&*()',
        '1234567890',
        'MixedCaseToken123!@#',
        'very-long-token-' + 'x'.repeat(500),
      ];

      for (const token of testTokens) {
        const userId = `user-${crypto.randomBytes(8).toString('hex')}`;

        // Store token
        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await refreshTokenStore.storeRefreshToken(userId, token);

        // Get stored encrypted data
        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
          vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
        ][1] as any;

        // Mock retrieval
        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        // Decrypt and verify
        const decrypted = await refreshTokenStore.getRefreshToken(userId);
        expect(decrypted).toBe(token);
      }
    });
  });

  /**
   * Edge Case Tests for RefreshTokenStore
   * 
   * Requirements: 4.6, 15.9
   * 
   * These tests verify error handling and security for edge cases:
   * - Encryption with empty key (should fail at initialization)
   * - Decryption with missing IV or auth tag
   * - Decryption with corrupted ciphertext
   * - Decryption with wrong encryption key
   */
  describe('edge cases', () => {
    describe('encryption with empty key', () => {
      it('should fail at initialization when SESSION_SECRET is empty', () => {
        // Requirements: 4.6 - Verify error handling when encryption key is empty
        // Empty string is caught by the !sessionSecret check
        process.env.SESSION_SECRET = '';
        
        expect(() => new RefreshTokenStore()).toThrow(
          'SESSION_SECRET environment variable is required for RefreshTokenStore'
        );
      });

      it('should fail at initialization when SESSION_SECRET is undefined', () => {
        // Requirements: 4.6 - Verify error handling when encryption key is missing
        delete process.env.SESSION_SECRET;
        
        expect(() => new RefreshTokenStore()).toThrow(
          'SESSION_SECRET environment variable is required for RefreshTokenStore'
        );
      });

      it('should fail at initialization when SESSION_SECRET is too short', () => {
        // Requirements: 4.6 - Verify minimum key length requirement
        const shortSecrets = [
          '1',
          'short',
          'less-than-32-chars',
          crypto.randomBytes(15).toString('hex'), // 30 characters
        ];

        for (const secret of shortSecrets) {
          process.env.SESSION_SECRET = secret;
          
          expect(() => new RefreshTokenStore()).toThrow(
            'SESSION_SECRET must be at least 32 characters'
          );
        }
      });
    });

    describe('decryption with missing IV or auth tag', () => {
      it('should return null when refreshTokenIV is missing', async () => {
        // Requirements: 4.6, 15.9 - Verify graceful handling of missing IV
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: 'some-encrypted-token',
            refreshTokenTag: crypto.randomBytes(16).toString('hex'),
            // Missing refreshTokenIV
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when refreshTokenTag is missing', async () => {
        // Requirements: 4.6, 15.9 - Verify graceful handling of missing auth tag
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: 'some-encrypted-token',
            refreshTokenIV: crypto.randomBytes(16).toString('hex'),
            // Missing refreshTokenTag
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when both IV and auth tag are missing', async () => {
        // Requirements: 4.6, 15.9 - Verify graceful handling of missing encryption components
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: 'some-encrypted-token',
            // Missing both refreshTokenIV and refreshTokenTag
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when refreshToken is missing but IV and tag exist', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of missing ciphertext
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshTokenIV: crypto.randomBytes(16).toString('hex'),
            refreshTokenTag: crypto.randomBytes(16).toString('hex'),
            // Missing refreshToken (ciphertext)
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when user document does not exist', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of non-existent user
        const userId = 'non-existent-user';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue(null),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });
    });

    describe('decryption with corrupted ciphertext', () => {
      it('should return null when ciphertext is corrupted (invalid hex)', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of corrupted ciphertext data
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: 'invalid-hex-string-not-hex',
            refreshTokenIV: crypto.randomBytes(16).toString('hex'),
            refreshTokenTag: crypto.randomBytes(16).toString('hex'),
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when ciphertext is partially corrupted', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of partially corrupted ciphertext
        const userId = 'test-user-id';
        const originalToken = 'test-refresh-token-value';

        // First, encrypt a token properly
        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await refreshTokenStore.storeRefreshToken(userId, originalToken);

        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

        // Corrupt the ciphertext by flipping some bits
        const corruptedCiphertext = storedData.refreshToken.substring(0, 10) + 
          'ffffff' + // Corrupted section
          storedData.refreshToken.substring(16);

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: corruptedCiphertext,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when ciphertext has wrong length', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of ciphertext with incorrect length
        const userId = 'test-user-id';

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: 'ab', // Too short to be valid ciphertext
            refreshTokenIV: crypto.randomBytes(16).toString('hex'),
            refreshTokenTag: crypto.randomBytes(16).toString('hex'),
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when IV is corrupted (invalid hex)', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of corrupted IV
        const userId = 'test-user-id';
        const originalToken = 'test-token';

        // Store a valid token first
        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await refreshTokenStore.storeRefreshToken(userId, originalToken);
        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

        // Try to decrypt with corrupted IV
        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: 'invalid-iv-not-hex',
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });

      it('should return null when auth tag is corrupted', async () => {
        // Requirements: 4.6, 15.9 - Verify auth tag verification (tamper detection)
        const userId = 'test-user-id';
        const originalToken = 'test-token-for-tamper-detection';

        // Store a valid token
        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await refreshTokenStore.storeRefreshToken(userId, originalToken);
        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

        // Corrupt the auth tag (simulates tampering)
        const corruptedTag = storedData.refreshTokenTag.substring(0, 16) + 
          'aaaa' + 
          storedData.refreshTokenTag.substring(20);

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: corruptedTag,
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        // Decryption should fail due to auth tag mismatch (tamper detection)
        expect(result).toBeNull();
      });

      it('should return null when IV has wrong length', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of IV with incorrect length
        const userId = 'test-user-id';
        const originalToken = 'test-token';

        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await refreshTokenStore.storeRefreshToken(userId, originalToken);
        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

        // Use IV with wrong length (should be 16 bytes = 32 hex chars)
        const wrongLengthIV = crypto.randomBytes(8).toString('hex'); // Only 16 hex chars

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: wrongLengthIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await refreshTokenStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });
    });

    describe('decryption with wrong encryption key', () => {
      it('should return null when decrypting with different SESSION_SECRET', async () => {
        // Requirements: 4.6, 15.9 - Verify key-based access control
        const userId = 'test-user-id';
        const originalToken = 'secret-refresh-token';

        // Encrypt with first key
        const firstSecret = crypto.randomBytes(32).toString('hex');
        process.env.SESSION_SECRET = firstSecret;
        const firstStore = new RefreshTokenStore();

        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await firstStore.storeRefreshToken(userId, originalToken);

        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
          vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
        ][1] as any;

        // Try to decrypt with different key
        const secondSecret = crypto.randomBytes(32).toString('hex');
        process.env.SESSION_SECRET = secondSecret;
        const secondStore = new RefreshTokenStore();

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await secondStore.getRefreshToken(userId);

        // Decryption should fail with wrong key
        expect(result).toBeNull();
      });

      it('should return null after SESSION_SECRET rotation', async () => {
        // Requirements: 4.6, 15.9 - Verify behavior after key rotation
        const userId = 'test-user-id';
        const originalToken = 'token-before-rotation';

        // Store with original key
        const originalSecret = crypto.randomBytes(32).toString('hex');
        process.env.SESSION_SECRET = originalSecret;
        const originalStore = new RefreshTokenStore();

        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await originalStore.storeRefreshToken(userId, originalToken);

        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
          vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
        ][1] as any;

        // Simulate key rotation
        const rotatedSecret = crypto.randomBytes(32).toString('hex');
        process.env.SESSION_SECRET = rotatedSecret;
        const rotatedStore = new RefreshTokenStore();

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await rotatedStore.getRefreshToken(userId);

        // Old tokens should not be decryptable after key rotation
        expect(result).toBeNull();
      });

      it('should handle multiple wrong key attempts gracefully', async () => {
        // Requirements: 4.6, 15.9 - Verify no information leakage on repeated failures
        const userId = 'test-user-id';
        const originalToken = 'multi-attempt-token';

        // Store with original key
        const correctSecret = crypto.randomBytes(32).toString('hex');
        process.env.SESSION_SECRET = correctSecret;
        const correctStore = new RefreshTokenStore();

        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await correctStore.storeRefreshToken(userId, originalToken);

        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
          vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
        ][1] as any;

        // Try decryption with multiple wrong keys
        const wrongSecrets = [
          crypto.randomBytes(32).toString('hex'),
          crypto.randomBytes(32).toString('hex'),
          crypto.randomBytes(32).toString('hex'),
        ];

        for (const wrongSecret of wrongSecrets) {
          process.env.SESSION_SECRET = wrongSecret;
          const wrongStore = new RefreshTokenStore();

          vi.mocked(User.findById).mockReturnValue({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData.refreshToken,
              refreshTokenIV: storedData.refreshTokenIV,
              refreshTokenTag: storedData.refreshTokenTag,
            }),
          } as any);

          const result = await wrongStore.getRefreshToken(userId);

          // Each attempt should return null (no information leakage)
          expect(result).toBeNull();
        }

        // Verify correct key still works
        process.env.SESSION_SECRET = correctSecret;
        const verifyStore = new RefreshTokenStore();

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const correctResult = await verifyStore.getRefreshToken(userId);
        expect(correctResult).toBe(originalToken);
      });

      it('should return null when key is completely different format', async () => {
        // Requirements: 4.6, 15.9 - Verify handling of key format mismatch
        const userId = 'test-user-id';
        const originalToken = 'format-test-token';

        // Store with hex-formatted key
        process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        const hexStore = new RefreshTokenStore();

        vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
        await hexStore.storeRefreshToken(userId, originalToken);

        const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
          vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
        ][1] as any;

        // Try with a different format key (same length but different content)
        process.env.SESSION_SECRET = 'a'.repeat(64); // All 'a' characters
        const differentStore = new RefreshTokenStore();

        vi.mocked(User.findById).mockReturnValue({
          select: vi.fn().mockResolvedValue({
            refreshToken: storedData.refreshToken,
            refreshTokenIV: storedData.refreshTokenIV,
            refreshTokenTag: storedData.refreshTokenTag,
          }),
        } as any);

        const result = await differentStore.getRefreshToken(userId);

        expect(result).toBeNull();
      });
    });
  });
});
