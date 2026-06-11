import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import { RefreshTokenStore } from '../RefreshTokenStore';
import { User } from '../../../models/User/User';

/**
 * Property-Based Tests for RefreshTokenStore
 * 
 * These tests use fast-check to generate random inputs and verify
 * universal properties hold across hundreds of test cases.
 * 
 * Feature: server-side-oauth-implementation
 */

// Mock the User model
vi.mock('../../../models/User/User', () => ({
  User: {
    findByIdAndUpdate: vi.fn(),
    findById: vi.fn(),
  },
}));

describe('RefreshTokenStore - Property-Based Tests', () => {
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

  /**
   * **Validates: Requirements 4.7**
   * 
   * Property 5: Refresh Token Encryption Round-Trip
   * 
   * For all refresh tokens of length 20-500 characters,
   * encrypting then decrypting must return the original value.
   * 
   * This verifies the encryption/decryption implementation is correct
   * and data integrity is maintained through the round-trip process.
   */
  it('Property 5: Refresh Token Encryption Round-Trip - encrypt then decrypt returns original value', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random refresh tokens between 20-500 characters
        fc.string({ minLength: 20, maxLength: 500 }),
        async (refreshToken) => {
          // Generate a unique user ID for each test case
          const userId = `user-${crypto.randomBytes(8).toString('hex')}`;

          // Setup mock for storage
          vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

          // Store the encrypted token
          await refreshTokenStore.storeRefreshToken(userId, refreshToken);

          // Capture the encrypted data that was stored
          const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
            vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
          ][1] as any;

          // Verify encryption components exist
          expect(storedData).toHaveProperty('refreshToken');
          expect(storedData).toHaveProperty('refreshTokenIV');
          expect(storedData).toHaveProperty('refreshTokenTag');
          expect(storedData).toHaveProperty('refreshTokenCreatedAt');

          // Setup mock for retrieval
          vi.mocked(User.findById).mockReturnValue({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData.refreshToken,
              refreshTokenIV: storedData.refreshTokenIV,
              refreshTokenTag: storedData.refreshTokenTag,
            }),
          } as any);

          // Retrieve and decrypt the token
          const decryptedToken = await refreshTokenStore.getRefreshToken(userId);

          // PROPERTY: Decrypt(Encrypt(token)) === token (round-trip property)
          expect(decryptedToken).toBe(refreshToken);

          // Additional invariants:
          // 1. Encrypted value should not be the same as plaintext
          expect(storedData.refreshToken).not.toBe(refreshToken);
          
          // 2. IV should be a valid hex string of correct length (16 bytes = 32 hex chars)
          expect(storedData.refreshTokenIV).toMatch(/^[0-9a-f]{32}$/);
          
          // 3. Auth tag should be a valid hex string of correct length (16 bytes = 32 hex chars)
          expect(storedData.refreshTokenTag).toMatch(/^[0-9a-f]{32}$/);
          
          // 4. Encrypted token should be a valid hex string
          expect(storedData.refreshToken).toMatch(/^[0-9a-f]+$/);
        }
      ),
      {
        // Run 100 iterations as specified in requirements
        numRuns: 100,
        // Verbose output to see which inputs are tested
        verbose: false,
      }
    );
  }, 30000); // 30 second timeout for property-based test

  /**
   * **Validates: Requirements 4.3, 17.9**
   * 
   * Property 6: Encryption IV Uniqueness
   * 
   * For all pairs of identical plaintext tokens,
   * encrypting each separately must generate different IVs
   * and therefore different ciphertexts.
   * 
   * This verifies that each encryption operation uses a unique IV,
   * which is critical for security (prevents pattern analysis attacks).
   */
  it('Property 6: Encryption IV Uniqueness - identical tokens encrypted separately produce unique IVs and ciphertexts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random refresh tokens to test with
        fc.string({ minLength: 20, maxLength: 500 }),
        async (refreshToken) => {
          // Clear mocks at the start of each property test iteration
          vi.clearAllMocks();
          
          // Generate two unique user IDs for encrypting the same token twice
          const userId1 = `user-${crypto.randomBytes(8).toString('hex')}`;
          const userId2 = `user-${crypto.randomBytes(8).toString('hex')}`;

          // Setup mock for storage
          vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

          // Encrypt the same token twice
          await refreshTokenStore.storeRefreshToken(userId1, refreshToken);
          const storedData1 = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as any;

          await refreshTokenStore.storeRefreshToken(userId2, refreshToken);
          const storedData2 = vi.mocked(User.findByIdAndUpdate).mock.calls[1][1] as any;

          // PROPERTY: IVs must be different for each encryption
          expect(storedData1.refreshTokenIV).not.toBe(storedData2.refreshTokenIV);

          // PROPERTY: Ciphertexts must be different (due to different IVs)
          expect(storedData1.refreshToken).not.toBe(storedData2.refreshToken);

          // PROPERTY: Auth tags must be different (since ciphertexts differ)
          expect(storedData1.refreshTokenTag).not.toBe(storedData2.refreshTokenTag);

          // Additional invariants:
          // 1. Both encryptions should still decrypt to the same plaintext
          vi.mocked(User.findById).mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData1.refreshToken,
              refreshTokenIV: storedData1.refreshTokenIV,
              refreshTokenTag: storedData1.refreshTokenTag,
            }),
          } as any);
          const decrypted1 = await refreshTokenStore.getRefreshToken(userId1);
          expect(decrypted1).toBe(refreshToken);

          vi.mocked(User.findById).mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData2.refreshToken,
              refreshTokenIV: storedData2.refreshTokenIV,
              refreshTokenTag: storedData2.refreshTokenTag,
            }),
          } as any);
          const decrypted2 = await refreshTokenStore.getRefreshToken(userId2);
          expect(decrypted2).toBe(refreshToken);

          // 2. IVs should be valid 16-byte hex strings (32 hex characters)
          expect(storedData1.refreshTokenIV).toMatch(/^[0-9a-f]{32}$/);
          expect(storedData2.refreshTokenIV).toMatch(/^[0-9a-f]{32}$/);
        }
      ),
      {
        // Run 100 iterations as specified in requirements
        numRuns: 100,
        // Verbose output disabled for cleaner test output
        verbose: false,
      }
    );
  }, 30000); // 30 second timeout for property-based test

  /**
   * Additional property test: Verify encryption with special characters
   * 
   * This ensures the encryption works correctly with tokens containing
   * various special characters that might appear in OAuth refresh tokens
   */
  it('Property 5 (extended): Encryption round-trip works with special characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate strings with ASCII printable characters (including special chars)
        fc.array(fc.integer({ min: 32, max: 126 }), { minLength: 20, maxLength: 500 })
          .map(arr => arr.map(n => String.fromCharCode(n)).join('')),
        async (refreshToken) => {
          const userId = `user-${crypto.randomBytes(8).toString('hex')}`;

          // Setup mocks
          vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
          await refreshTokenStore.storeRefreshToken(userId, refreshToken);

          const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
            vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
          ][1] as any;

          vi.mocked(User.findById).mockReturnValue({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData.refreshToken,
              refreshTokenIV: storedData.refreshTokenIV,
              refreshTokenTag: storedData.refreshTokenTag,
            }),
          } as any);

          // Retrieve and verify
          const decryptedToken = await refreshTokenStore.getRefreshToken(userId);

          // PROPERTY: Round-trip works with special characters
          expect(decryptedToken).toBe(refreshToken);
        }
      ),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  }, 30000);

  /**
   * Additional property test: Verify encryption with realistic OAuth tokens
   * 
   * This generates tokens that look like real OAuth refresh tokens
   * (base64url-encoded strings with typical characteristics)
   */
  it('Property 5 (realistic): Encryption round-trip works with realistic OAuth token format', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate base64url-like strings (alphanumeric + - and _)
        fc.array(
          fc.constantFrom(
            ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
          ),
          { minLength: 20, maxLength: 500 }
        ).map(arr => arr.join('')),
        async (refreshToken) => {
          const userId = `user-${crypto.randomBytes(8).toString('hex')}`;

          // Setup mocks
          vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);
          await refreshTokenStore.storeRefreshToken(userId, refreshToken);

          const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
            vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
          ][1] as any;

          vi.mocked(User.findById).mockReturnValue({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData.refreshToken,
              refreshTokenIV: storedData.refreshTokenIV,
              refreshTokenTag: storedData.refreshTokenTag,
            }),
          } as any);

          // Retrieve and verify
          const decryptedToken = await refreshTokenStore.getRefreshToken(userId);

          // PROPERTY: Round-trip works with realistic token formats
          expect(decryptedToken).toBe(refreshToken);
        }
      ),
      {
        numRuns: 100,
        verbose: false,
      }
    );
  }, 30000);

  /**
   * **Validates: Requirements 4.8, 17.12**
   * 
   * Property 7: Encrypted Token Confidentiality
   * 
   * For all refresh tokens stored in the database,
   * the plaintext must not be retrievable from the ciphertext alone
   * without the correct encryption key.
   * 
   * This verifies that:
   * 1. The ciphertext does not contain the plaintext
   * 2. Attempting to decrypt with a wrong key fails
   * 3. The encrypted data provides no information about the plaintext
   * 4. Database attacker without encryption key cannot recover tokens
   */
  it('Property 7: Encrypted Token Confidentiality - plaintext not retrievable without encryption key', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random refresh tokens between 20-500 characters
        fc.string({ minLength: 20, maxLength: 500 }),
        async (refreshToken) => {
          const userId = `user-${crypto.randomBytes(8).toString('hex')}`;

          // Setup mock for storage
          vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as any);

          // Encrypt and store the token
          await refreshTokenStore.storeRefreshToken(userId, refreshToken);

          // Capture the encrypted data that would be stored in MongoDB
          const storedData = vi.mocked(User.findByIdAndUpdate).mock.calls[
            vi.mocked(User.findByIdAndUpdate).mock.calls.length - 1
          ][1] as any;

          // PROPERTY 1: Ciphertext should not contain the plaintext
          // This verifies the token is actually encrypted, not just encoded
          expect(storedData.refreshToken).not.toContain(refreshToken);
          
          // Convert ciphertext to buffer and verify it doesn't match plaintext bytes
          const ciphertextBuffer = Buffer.from(storedData.refreshToken, 'hex');
          const plaintextBuffer = Buffer.from(refreshToken, 'utf8');
          
          // Check that no substring of plaintext appears in ciphertext
          for (let i = 0; i <= plaintextBuffer.length - 4; i++) {
            const plaintextChunk = plaintextBuffer.subarray(i, i + 4);
            let found = false;
            for (let j = 0; j <= ciphertextBuffer.length - 4; j++) {
              const ciphertextChunk = ciphertextBuffer.subarray(j, j + 4);
              if (plaintextChunk.equals(ciphertextChunk)) {
                found = true;
                break;
              }
            }
            // PROPERTY: No 4-byte chunk of plaintext should appear in ciphertext
            expect(found).toBe(false);
          }

          // PROPERTY 2: Attempting to decrypt with wrong key must fail
          // Create a new RefreshTokenStore with a different SESSION_SECRET
          const originalSecret = process.env.SESSION_SECRET;
          process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex'); // Different key
          const wrongKeyStore = new RefreshTokenStore();
          
          // Setup mock for retrieval with wrong key
          vi.mocked(User.findById).mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({
              refreshToken: storedData.refreshToken,
              refreshTokenIV: storedData.refreshTokenIV,
              refreshTokenTag: storedData.refreshTokenTag,
            }),
          } as any);

          // Attempt to decrypt with wrong key should return null (failure)
          const decryptedWithWrongKey = await wrongKeyStore.getRefreshToken(userId);
          
          // PROPERTY: Decryption with wrong key must fail
          expect(decryptedWithWrongKey).toBeNull();
          
          // Restore original secret
          process.env.SESSION_SECRET = originalSecret;

          // PROPERTY 3: IV alone should not reveal information about plaintext
          // The IV is random and should be different for each encryption
          const ivBuffer = Buffer.from(storedData.refreshTokenIV, 'hex');
          
          // Check that IV doesn't contain plaintext patterns
          for (let i = 0; i <= plaintextBuffer.length - 4; i++) {
            const plaintextChunk = plaintextBuffer.subarray(i, i + 4);
            let found = false;
            for (let j = 0; j <= ivBuffer.length - 4; j++) {
              const ivChunk = ivBuffer.subarray(j, j + 4);
              if (plaintextChunk.equals(ivChunk)) {
                found = true;
                break;
              }
            }
            // PROPERTY: No plaintext pattern should appear in IV
            expect(found).toBe(false);
          }

          // PROPERTY 4: Auth tag alone should not reveal information
          const authTagBuffer = Buffer.from(storedData.refreshTokenTag, 'hex');
          
          for (let i = 0; i <= plaintextBuffer.length - 4; i++) {
            const plaintextChunk = plaintextBuffer.subarray(i, i + 4);
            let found = false;
            for (let j = 0; j <= authTagBuffer.length - 4; j++) {
              const tagChunk = authTagBuffer.subarray(j, j + 4);
              if (plaintextChunk.equals(tagChunk)) {
                found = true;
                break;
              }
            }
            // PROPERTY: No plaintext pattern should appear in auth tag
            expect(found).toBe(false);
          }

          // PROPERTY 5: Verify ciphertext appears random (high entropy)
          // Count unique bytes in ciphertext - should have good distribution
          const byteFrequency = new Map<number, number>();
          for (const byte of ciphertextBuffer) {
            byteFrequency.set(byte, (byteFrequency.get(byte) || 0) + 1);
          }
          
          // For a sufficiently long ciphertext, we expect reasonable byte distribution
          if (ciphertextBuffer.length >= 32) {
            const uniqueBytes = byteFrequency.size;
            // Should have at least 20% unique bytes (indicating randomness)
            expect(uniqueBytes).toBeGreaterThanOrEqual(Math.min(32, ciphertextBuffer.length * 0.2));
          }

          // PROPERTY 6: Combining stored components without key should not yield plaintext
          // Simulate what an attacker with database access would try
          
          // Try XORing ciphertext with IV (common attack attempt)
          const xorResult = Buffer.alloc(Math.min(ciphertextBuffer.length, ivBuffer.length));
          for (let i = 0; i < xorResult.length; i++) {
            xorResult[i] = ciphertextBuffer[i] ^ ivBuffer[i % ivBuffer.length];
          }
          
          // PROPERTY: XOR of ciphertext and IV should not reveal plaintext
          const xorString = xorResult.toString('utf8', 0, Math.min(xorResult.length, refreshToken.length));
          // Allow for some noise, but shouldn't match more than 30% of plaintext
          const matchingChars = xorString.split('').filter((c, i) => i < refreshToken.length && c === refreshToken[i]).length;
          const matchRatio = matchingChars / Math.min(xorString.length, refreshToken.length);
          expect(matchRatio).toBeLessThan(0.3);

          // PROPERTY 7: Simple decoding attempts should fail
          // Try to decode ciphertext as various encodings (attacker would try this)
          const decodingAttempts = [
            storedData.refreshToken, // Raw hex
            Buffer.from(storedData.refreshToken, 'hex').toString('utf8'), // Direct UTF-8
            Buffer.from(storedData.refreshToken, 'hex').toString('base64'), // Base64
            Buffer.from(storedData.refreshToken, 'hex').toString('ascii'), // ASCII
          ];
          
          // PROPERTY: None of these simple decoding attempts should yield the plaintext
          for (const attempt of decodingAttempts) {
            expect(attempt).not.toBe(refreshToken);
            // Also check substring matches - shouldn't contain significant portions
            if (refreshToken.length > 8) {
              const significantSubstring = refreshToken.substring(0, 8);
              expect(attempt).not.toContain(significantSubstring);
            }
          }

          // SECURITY INVARIANT: Without the encryption key, an attacker with database
          // access (having ciphertext, IV, and auth tag) cannot recover the plaintext
          // This is verified by all the above properties combined
        }
      ),
      {
        // Run 100 iterations as specified in requirements
        numRuns: 100,
        // Verbose output disabled for cleaner test output
        verbose: false,
      }
    );
  }, 60000); // 60 second timeout for this comprehensive property test
});
