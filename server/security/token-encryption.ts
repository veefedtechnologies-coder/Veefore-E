import crypto from 'crypto';
import { Logger } from '../utils/logger';

/**
 * CRITICAL SECURITY SERVICE: Social Media Token Encryption
 * 
 * Implements AES-256-GCM encryption for social media access tokens at rest
 * to prevent credential theft and meet security compliance requirements.
 * 
 * Features:
 * - AES-256-GCM encryption (authenticated encryption)
 * - Secure key derivation with salt
 * - IV (Initialization Vector) for each encryption
 * - Encrypted data integrity verification
 */

// Default configurations for lazy initialization
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits (correct for GCM mode)
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16;  // 128 bits

interface EncryptedToken {
  encryptedData: string;
  iv: string;
  salt: string;
  tag: string;
  kdf?: number;
}

export class TokenDecryptionError extends Error {
  public readonly isAuthFailure: boolean;
  constructor(message: string, isAuthFailure: boolean = false) {
    super(message);
    this.name = 'TokenDecryptionError';
    this.isAuthFailure = isAuthFailure;
  }
}

export class TokenEncryptionService {
  private _masterKey: string | null = null;
  private _globalSalt: Buffer | null = null;
  private _iterations: number | null = null;

  /**
   * Lazy-loaded master key from environment OR generated fallback
   */
  private get masterKey(): string {
    if (this._masterKey) return this._masterKey;

    const envKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (envKey) {
      this._masterKey = envKey;
      Logger.info('TokenEncryption', '🛡️ [SECURITY] Using persistent TOKEN_ENCRYPTION_KEY from environment');
    } else {
      if (process.env.NODE_ENV === 'production') {
        console.error('🚨 CRITICAL SECURITY ERROR: TOKEN_ENCRYPTION_KEY is required in production');
        process.exit(1);
      }
      this._masterKey = this.generateMasterKey();
      console.warn('🔧 [SECURITY] TOKEN_ENCRYPTION_KEY missing. Using temporary development key. TOKENS WILL BE LOST ON RESTART!');
    }
    return this._masterKey;
  }

  /**
   * Lazy-loaded global salt
   */
  private get globalSalt(): Buffer | null {
    if (this._globalSalt !== null) return this._globalSalt;

    const saltStr = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT;
    if (saltStr) {
      this._globalSalt = Buffer.from(saltStr, 'utf8');
      Logger.info('TokenEncryption', '🛡️ [SECURITY] Using TOKEN_ENCRYPTION_GLOBAL_SALT from environment');
    } else {
      this._globalSalt = Buffer.alloc(0); // Empty buffer instead of null for easy concatenation
    }
    return this._globalSalt;
  }

  /**
   * Lazy-loaded KDF iterations
   */
  private get iterations(): number {
    if (this._iterations !== null) return this._iterations;
    const envIter = process.env.TOKEN_KDF_ITERATIONS;
    this._iterations = envIter ? parseInt(envIter, 10) : 100000;
    return this._iterations;
  }

  constructor() {
    // Constructor is now minimal to support lazy loading
  }

  /**
   * Generate a secure master key for development/testing
   * NOTE: In production, use a proper key management service (AWS KMS, HashiCorp Vault, etc.)
   */
  private generateMasterKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
  }

  /**
   * Derive encryption key from master key using PBKDF2
   */
  private deriveKey(salt: Buffer, iterations: number): Buffer {
    const saltWithGlobal = this.globalSalt && this.globalSalt.length > 0
      ? Buffer.concat([salt, this.globalSalt])
      : salt;
    return crypto.pbkdf2Sync(this.masterKey, saltWithGlobal, iterations, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt a social media access token
   * @param token - Plain text access token to encrypt
   * @returns Encrypted token data with metadata
   */
  public encryptToken(token: string): EncryptedToken {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token: must be a non-empty string');
      }

      // Generate random salt and IV for this encryption
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive encryption key from master key + salt
      const iterations = this.iterations;
      const key = this.deriveKey(salt, iterations);

      // SECURITY FIX: Create cipher with proper AES-256-GCM using IV
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      cipher.setAutoPadding(true);

      // Encrypt the token
      let encryptedData = cipher.update(token, 'utf8', 'base64');
      encryptedData += cipher.final('base64');

      // Get authentication tag for integrity verification
      const tag = cipher.getAuthTag();

      return {
        encryptedData,
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        tag: tag.toString('base64'),
        kdf: iterations
      };
    } catch (error) {
      console.error('🚨 TOKEN ENCRYPTION ERROR:', error);
      throw new Error('Failed to encrypt token');
    }
  }

  /**
   * Decrypt a social media access token with robust error handling
   * @param encryptedToken - Encrypted token data with metadata
   * @returns Plain text access token
   */
  public decryptToken(encryptedToken: EncryptedToken): string {
    try {
      if (!encryptedToken || !encryptedToken.encryptedData) {
        throw new TokenDecryptionError('Invalid encrypted token data');
      }

      Logger.info('TokenEncryption', '🛡️ [DIAGNOSTIC] TokenEncryptionService.decryptToken called with:', {
        hasEncryptedData: !!encryptedToken.encryptedData,
        hasIV: !!encryptedToken.iv,
        hasSalt: !!encryptedToken.salt,
        hasTag: !!encryptedToken.tag
      });

      const { encryptedData, iv, salt, tag } = encryptedToken;

      // Validate all required fields exist and are strings (P2-FIX: prevents TypeError)
      if (typeof encryptedData !== 'string' || typeof iv !== 'string' || typeof salt !== 'string' || typeof tag !== 'string') {
        const missing = [];
        if (typeof encryptedData !== 'string') missing.push('encryptedData');
        if (typeof iv !== 'string') missing.push('iv');
        if (typeof salt !== 'string') missing.push('salt');
        if (typeof tag !== 'string') missing.push('tag');

        throw new TokenDecryptionError(`Invalid or missing encryption metadata fields: ${missing.join(', ')}`);
      }

      // Convert base64 strings back to buffers with validation
      let ivBuffer: Buffer, saltBuffer: Buffer, tagBuffer: Buffer;

      try {
        ivBuffer = Buffer.from(iv, 'base64');
        saltBuffer = Buffer.from(salt, 'base64');
        tagBuffer = Buffer.from(tag, 'base64');
      } catch (parseError) {
        throw new TokenDecryptionError('Invalid base64 encoding in token metadata');
      }

      // Validate buffer lengths
      if (ivBuffer.length !== IV_LENGTH) {
        throw new TokenDecryptionError(`Invalid IV length: expected ${IV_LENGTH}, got ${ivBuffer.length}`);
      }
      if (saltBuffer.length !== SALT_LENGTH) {
        throw new TokenDecryptionError(`Invalid salt length: expected ${SALT_LENGTH}, got ${saltBuffer.length}`);
      }
      if (tagBuffer.length !== TAG_LENGTH) {
        throw new TokenDecryptionError(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBuffer.length}`);
      }

      // Derive the same encryption key
      const iterations = typeof (encryptedToken as any).kdf === 'number' ? Number((encryptedToken as any).kdf) : this.iterations;
      const key = this.deriveKey(saltBuffer, iterations);

      // Create decipher with proper AES-256-GCM
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      // Decrypt the token
      let decryptedData: string;
      try {
        decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
        decryptedData += decipher.final('utf8');
      } catch (cryptoError: unknown) {
        // Handle specific GCM authentication failures
        const errorMessage = cryptoError instanceof Error ? cryptoError.message : 'Unknown crypto error';
        if (errorMessage.includes('Unsupported state') ||
          errorMessage.includes('unable to authenticate')) {
          throw new TokenDecryptionError('Token authentication failed - key mismatch or corrupted data', true);
        }
        throw new TokenDecryptionError(`Cryptography error: ${errorMessage}`);
      }

      return decryptedData;
    } catch (error: unknown) {
      // Provide detailed error information for debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('🚨 P2-FIX: Token decryption failed with detailed error:', {
        error: errorMessage,
        hasEncryptedData: !!encryptedToken?.encryptedData,
        hasIV: !!encryptedToken?.iv,
        hasSalt: !!encryptedToken?.salt,
        hasTag: !!encryptedToken?.tag,
        algorithmUsed: ALGORITHM
      });
      throw new Error(`Token decryption failed: ${errorMessage}`);
    }
  }

  /**
   * Validate that an encrypted token can be successfully decrypted
   * @param encryptedToken - Encrypted token to validate
   * @returns True if token is valid and can be decrypted
   */
  public validateEncryptedToken(encryptedToken: EncryptedToken): boolean {
    try {
      this.decryptToken(encryptedToken);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt a token with a new salt/IV (for key rotation)
   * @param encryptedToken - Existing encrypted token
   * @returns Newly encrypted token with fresh cryptographic parameters
   */
  public rotateTokenEncryption(encryptedToken: EncryptedToken): EncryptedToken {
    const plainToken = this.decryptToken(encryptedToken);
    return this.encryptToken(plainToken);
  }

  /**
   * Securely compare two tokens without exposing timing information
   * @param token1 - First encrypted token
   * @param token2 - Second encrypted token
   * @returns True if tokens contain the same plaintext value
   */
  public secureTokenCompare(token1: EncryptedToken, token2: EncryptedToken): boolean {
    try {
      const plain1 = this.decryptToken(token1);
      const plain2 = this.decryptToken(token2);

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(plain1, 'utf8'),
        Buffer.from(plain2, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate a summary of encryption status for monitoring
   */
  public getEncryptionStatus(): {
    algorithm: string;
    keyLength: number;
    hasEnvironmentKey: boolean;
    version: string;
    kdfIterations: number;
    rotationDays: number;
    rotationActive: boolean;
  } {
    return {
      algorithm: ALGORITHM,
      keyLength: KEY_LENGTH * 8, // Convert to bits
      hasEnvironmentKey: !!process.env.TOKEN_ENCRYPTION_KEY,
      version: '1.0.0',
      kdfIterations: this.iterations,
      rotationDays: parseInt(process.env.TOKEN_ROTATION_DAYS || '0', 10),
      rotationActive: (process.env.NODE_ENV === 'production') && parseInt(process.env.TOKEN_ROTATION_DAYS || '0', 10) > 0
    };
  }
}

// Export singleton instance
export const tokenEncryption = new TokenEncryptionService();

// Export types for use in storage layer
export type { EncryptedToken };
