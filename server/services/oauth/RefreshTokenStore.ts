import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../../models/User/User';
import { logger } from '../../config/logger';

/**
 * RefreshTokenStore - Secure storage for OAuth refresh tokens
 * 
 * Implements AES-256-GCM encryption for storing refresh tokens in MongoDB.
 * Each token is encrypted with a unique initialization vector (IV) and
 * includes an authentication tag for integrity verification.
 * 
 * Security properties:
 * - Confidentiality: Tokens encrypted with AES-256-GCM
 * - Authenticity: GCM authentication tag prevents tampering
 * - Unique IVs: Each encryption uses a fresh random IV
 * - Key Derivation: Key derived from SESSION_SECRET using scrypt
 * - Graceful Key Rotation: Supports multiple active keys with versioning
 * - Token Lifecycle: Enforces 90-day maximum lifetime with automatic expiration
 * 
 * Key Rotation:
 * - Supports SESSION_SECRET and SESSION_SECRET_OLD for graceful migration
 * - Stores key version with encrypted tokens for proper decryption
 * - Attempts decryption with all available keys, falling back as needed
 * - Automatically re-encrypts with new key when decrypting with old key
 * 
 * Token Expiration:
 * - Maximum token lifetime: 90 days (REFRESH_TOKEN_MAX_AGE_MS)
 * - Checks token age before returning from getRefreshToken()
 * - Automatically deletes expired tokens
 * - MongoDB TTL index provides automatic cleanup
 * - Background cleanup job removes orphaned expired tokens
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 18.5, 2.5, 2.6, 2.7, 2.8, 2.9
 */
export class RefreshTokenStore {
  private algorithm = 'aes-256-gcm' as const;
  private keys: Map<string, Buffer> = new Map();
  private currentKeyVersion: string;

  // Maximum refresh token lifetime (90 days)
  // Requirement 2.7: Enforce maximum token lifetime
  private static readonly REFRESH_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor() {
    let sessionSecret = process.env.SESSION_SECRET;

    if (!sessionSecret) {
      if (process.env.NODE_ENV === "testing" || process.env.NODE_ENV === "test") {
        process.env.SESSION_SECRET = "test-session-secret-for-ci-pipelines";
        sessionSecret = process.env.SESSION_SECRET;
      } else {
      throw new Error("SESSION_SECRET environment variable is required for RefreshTokenStore");
      }
    }

    if (sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters');
    }

    // Derive current encryption key
    this.currentKeyVersion = process.env.KEY_VERSION || 'v1';
    this.keys.set(this.currentKeyVersion, this.deriveKey(sessionSecret));

    // Support old key for graceful rotation
    const oldSessionSecret = process.env.SESSION_SECRET_OLD;
    if (oldSessionSecret) {
      if (oldSessionSecret.length < 32) {
        throw new Error('SESSION_SECRET_OLD must be at least 32 characters');
      }

      // Validate that old and new secrets are different
      if (oldSessionSecret === sessionSecret) {
        logger.warn('SESSION_SECRET_OLD is the same as SESSION_SECRET - old key ignored', {
          component: 'OAuth.RefreshTokenStore',
        });
      } else {
        const oldKeyVersion = process.env.KEY_VERSION_OLD || 'v0';
        this.keys.set(oldKeyVersion, this.deriveKey(oldSessionSecret));
        
        logger.info('RefreshTokenStore initialized with key rotation support', {
          component: 'OAuth.RefreshTokenStore',
          currentVersion: this.currentKeyVersion,
          oldVersion: oldKeyVersion,
          keysAvailable: this.keys.size,
        });
      }
    }
  }

  /**
   * Derive encryption key from session secret using scrypt
   * 
   * @param secret - Session secret to derive key from
   * @returns 32-byte encryption key
   */
  private deriveKey(secret: string): Buffer {
    return crypto.scryptSync(
      secret,
      'refresh-token-salt', // Application-specific salt
      32, // 256 bits
      {
        N: 16384, // CPU/memory cost parameter
        r: 8,     // Block size parameter
        p: 1,     // Parallelization parameter
      }
    );
  }

  /**
   * Store encrypted refresh token for user
   * 
   * Requirement 4.2: Uses unique encryption key derived from SESSION_SECRET
   * Requirement 4.3: Generates random 16-byte IV for each encryption
   * Requirement 4.4: Stores encrypted token, IV, auth tag, and key version in MongoDB
   * Requirement 2.3: Uses MongoDB transactions to prevent race conditions
   * Requirement 2.4: Ensures atomic updates for concurrent operations
   * Requirement 2.5: Stores key version for graceful rotation support
   * 
   * @param userId - MongoDB user ID
   * @param refreshToken - Plaintext Google refresh token
   * @param requestId - Optional request correlation ID for logging
   * @throws Error if encryption fails or database update fails
   */
  async storeRefreshToken(userId: string, refreshToken: string, requestId?: string): Promise<void> {
    // Maximum number of retries for transaction conflicts
    const MAX_RETRIES = 3;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
      const session = await mongoose.startSession();
      
      try {
        // Start a transaction for atomic updates
        await session.withTransaction(async () => {
          // Requirement 4.3: Generate random 16-byte initialization vector (IV)
          // Using a unique IV for each encryption prevents pattern analysis
          const iv = crypto.randomBytes(16);

          // Get the current key for encryption
          const currentKey = this.keys.get(this.currentKeyVersion);
          if (!currentKey) {
            throw new Error(`Current encryption key version ${this.currentKeyVersion} not found`);
          }

          // Create cipher with AES-256-GCM
          const cipher = crypto.createCipheriv(this.algorithm, currentKey, iv);

          // Encrypt the refresh token
          let encrypted = cipher.update(refreshToken, 'utf8', 'hex');
          encrypted += cipher.final('hex');

          // Get GCM authentication tag (16 bytes)
          // This tag is used to verify the ciphertext hasn't been tampered with
          const authTag = cipher.getAuthTag();

          // Requirement 2.3, 2.4, 2.5: Store encrypted token, IV, auth tag, and key version in MongoDB
          // Using transaction ensures atomicity for concurrent operations
          await User.findByIdAndUpdate(
            userId,
            {
              refreshToken: encrypted,
              refreshTokenIV: iv.toString('hex'),
              refreshTokenTag: authTag.toString('hex'),
              refreshTokenKeyVersion: this.currentKeyVersion, // Store key version for rotation support
              refreshTokenCreatedAt: new Date(),
            },
            { session } // Pass session for transaction
          );
        });

        // Transaction succeeded - end the session and log success
        await session.endSession();

        // Requirement 18.5: Log refresh token storage with DEBUG level
        logger.debug('Refresh token encrypted and stored', {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
          retryCount,
          keyVersion: this.currentKeyVersion,
        });

        // Success - exit the retry loop
        return;
      } catch (error) {
        // End the session on error
        await session.endSession();

        // Check if this is a transient transaction error that we can retry
        const isTransientError = 
          error instanceof Error && 
          (error.message.includes('TransientTransactionError') ||
           error.message.includes('WriteConflict'));

        if (isTransientError && retryCount < MAX_RETRIES - 1) {
          retryCount++;
          
          // Log retry attempt
          logger.warn('Transaction conflict detected, retrying', {
            component: 'OAuth.RefreshTokenStore',
            userId,
            requestId,
            retryCount,
            errorType: error instanceof Error ? error.name : 'Unknown',
          });

          // Brief exponential backoff before retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 10));
          continue; // Retry the transaction
        }

        // Requirement 18.5: Log encryption/storage failure with ERROR level
        logger.error('Failed to store refresh token', error, {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
          retryCount,
          errorType: error instanceof Error ? error.name : 'Unknown',
        });
        
        throw new Error('Failed to secure refresh token');
      }
    }

    // Should not reach here, but handle the case where all retries failed
    throw new Error('Failed to secure refresh token after maximum retries');
  }

  /**
   * Retrieve and decrypt refresh token for user
   * 
   * Supports graceful key rotation by attempting decryption with multiple key versions.
   * When decrypting with an old key, automatically re-encrypts with the current key.
   * 
   * Enforces token lifecycle management by checking token age before returning.
   * Expired tokens (older than 90 days) are rejected and deleted automatically.
   * 
   * Requirement 2.5: Attempts decryption with all active key versions
   * Requirement 2.6: Falls back gracefully when decryption fails with current key
   * Requirement 2.7: Enforces maximum token lifetime (90 days)
   * Requirement 2.8: Checks refreshTokenCreatedAt before returning token
   * Requirement 2.9: Automatically removes expired tokens
   * 
   * @param userId - MongoDB user ID
   * @param requestId - Optional request correlation ID for logging
   * @returns Decrypted refresh token or null if not found or expired
   * @throws Error if decryption fails (wrong key, corrupted data, tampered ciphertext)
   */
  async getRefreshToken(userId: string, requestId?: string): Promise<string | null> {
    try {
      // Retrieve user document with encrypted token components
      const user = await User.findById(userId).select(
        'refreshToken refreshTokenIV refreshTokenTag refreshTokenKeyVersion refreshTokenCreatedAt'
      );

      // Check if all required encryption components exist
      if (!user?.refreshToken || !user.refreshTokenIV || !user.refreshTokenTag) {
        logger.debug('Refresh token not found', {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
        });
        return null;
      }

      // Requirement 2.7, 2.8: Check token expiration before proceeding with decryption
      if (user.refreshTokenCreatedAt) {
        const tokenAge = Date.now() - user.refreshTokenCreatedAt.getTime();
        
        if (tokenAge > RefreshTokenStore.REFRESH_TOKEN_MAX_AGE_MS) {
          const ageInDays = Math.floor(tokenAge / (1000 * 60 * 60 * 24));
          
          logger.warn('Refresh token expired', {
            component: 'OAuth.RefreshTokenStore',
            userId,
            requestId,
            ageMs: tokenAge,
            ageInDays,
            maxAgeInDays: 90,
          });

          // Requirement 2.9: Automatically delete expired token
          await this.deleteRefreshToken(userId, requestId);
          
          return null;
        }
      }

      // Convert stored hex strings back to buffers
      const iv = Buffer.from(user.refreshTokenIV, 'hex');
      const authTag = Buffer.from(user.refreshTokenTag, 'hex');
      const storedKeyVersion = user.refreshTokenKeyVersion || 'v0'; // Default to v0 for tokens without version

      // Try to decrypt with the stored key version first
      let decrypted = this.tryDecrypt(user.refreshToken, storedKeyVersion, iv, authTag);
      let usedKeyVersion = storedKeyVersion;

      // If decryption failed with stored version, try all available keys
      if (!decrypted) {
        logger.debug('Decryption failed with stored key version, trying all available keys', {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
          storedKeyVersion,
          availableVersions: Array.from(this.keys.keys()),
        });

        for (const [version, key] of this.keys) {
          if (version === storedKeyVersion) {
            continue; // Already tried this one
          }

          decrypted = this.tryDecrypt(user.refreshToken, version, iv, authTag);
          if (decrypted) {
            usedKeyVersion = version;
            logger.info('Successfully decrypted with fallback key version', {
              component: 'OAuth.RefreshTokenStore',
              userId,
              requestId,
              storedKeyVersion,
              usedKeyVersion: version,
            });
            break;
          }
        }
      }

      // If still no success, return null
      if (!decrypted) {
        logger.error('Failed to decrypt refresh token with any available key version', null, {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
          storedKeyVersion,
          availableVersions: Array.from(this.keys.keys()),
        });
        return null;
      }

      // Requirement 18.5: Log refresh token retrieval with DEBUG level
      logger.debug('Refresh token decrypted', {
        component: 'OAuth.RefreshTokenStore',
        userId,
        requestId,
        keyVersion: usedKeyVersion,
      });

      // If we decrypted with an old key, re-encrypt with the current key for future requests
      if (usedKeyVersion !== this.currentKeyVersion) {
        logger.info('Re-encrypting token with current key version for key migration', {
          component: 'OAuth.RefreshTokenStore',
          userId,
          requestId,
          oldVersion: usedKeyVersion,
          newVersion: this.currentKeyVersion,
        });

        // Re-encrypt with current key (fire and forget - don't block the response)
        this.storeRefreshToken(userId, decrypted, `${requestId}-migration`).catch((error) => {
          logger.error('Failed to re-encrypt token with current key', error, {
            component: 'OAuth.RefreshTokenStore',
            userId,
            requestId,
          });
        });
      }

      return decrypted;
    } catch (error) {
      // Decryption failure could indicate:
      // - Wrong encryption key (SESSION_SECRET changed)
      // - Corrupted ciphertext
      // - Tampered data (auth tag verification failed)
      
      // Requirement 18.5: Log decryption failure with ERROR level
      logger.error('Failed to decrypt refresh token', error, {
        component: 'OAuth.RefreshTokenStore',
        userId,
        requestId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      
      // Return null instead of throwing to allow graceful handling
      // The caller should treat this as "token not found"
      return null;
    }
  }

  /**
   * Try to decrypt refresh token with a specific key version
   * 
   * @param encrypted - Hex-encoded encrypted token
   * @param keyVersion - Key version to try
   * @param iv - Initialization vector
   * @param authTag - Authentication tag
   * @returns Decrypted token or null if decryption fails
   */
  private tryDecrypt(
    encrypted: string,
    keyVersion: string,
    iv: Buffer,
    authTag: Buffer
  ): string | null {
    try {
      const key = this.keys.get(keyVersion);
      if (!key) {
        return null;
      }

      // Create decipher with AES-256-GCM
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

      // Set authentication tag for verification
      // If the ciphertext was tampered with, decryption will fail
      decipher.setAuthTag(authTag);

      // Decrypt the refresh token
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      // Decryption failed - could be wrong key, corrupted data, or tampered ciphertext
      return null;
    }
  }

  /**
   * Delete refresh token for user
   * 
   * @param userId - MongoDB user ID
   * @param requestId - Optional request correlation ID for logging
   */
  async deleteRefreshToken(userId: string, requestId?: string): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, {
        $unset: {
          refreshToken: '',
          refreshTokenIV: '',
          refreshTokenTag: '',
          refreshTokenKeyVersion: '',
          refreshTokenCreatedAt: '',
        },
      });

      logger.debug('Refresh token deleted', {
        component: 'OAuth.RefreshTokenStore',
        userId,
        requestId,
      });
    } catch (error) {
      logger.error('Failed to delete refresh token', error, {
        component: 'OAuth.RefreshTokenStore',
        userId,
        requestId,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });
      
      throw new Error('Failed to delete refresh token');
    }
  }
}

// Export singleton instance
export const refreshTokenStore = new RefreshTokenStore();
