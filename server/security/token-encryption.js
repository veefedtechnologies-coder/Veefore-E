import crypto from 'crypto';
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
// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (correct for GCM mode)
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits
export class TokenEncryptionService {
    constructor() {
        // P1-6.2: Enhanced key management integration
        // Get master key from environment - CRITICAL for production security
        this.masterKey = process.env.TOKEN_ENCRYPTION_KEY || this.generateMasterKey();
        if (!process.env.TOKEN_ENCRYPTION_KEY) {
            // CRITICAL: Fail fast in production environments for security
            if (process.env.NODE_ENV === 'production') {
                console.error('🚨 CRITICAL SECURITY ERROR: TOKEN_ENCRYPTION_KEY is required in production');
                console.error('💀 Exiting to prevent insecure operation');
                process.exit(1);
            }
            // Only warn once in development, not on every startup
            if (process.env.NODE_ENV === 'development') {
                console.log('🔧 Development mode: Auto-generating temporary encryption key');
            }
        }
    }
    /**
     * Generate a secure master key for development/testing
     * NOTE: In production, use a proper key management service (AWS KMS, HashiCorp Vault, etc.)
     */
    generateMasterKey() {
        return crypto.randomBytes(KEY_LENGTH).toString('hex');
    }
    /**
     * Derive encryption key from master key using PBKDF2
     */
    deriveKey(salt) {
        return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
    }
    /**
     * Encrypt a social media access token
     * @param token - Plain text access token to encrypt
     * @returns Encrypted token data with metadata
     */
    encryptToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                throw new Error('Invalid token: must be a non-empty string');
            }
            // Generate random salt and IV for this encryption
            const salt = crypto.randomBytes(SALT_LENGTH);
            const iv = crypto.randomBytes(IV_LENGTH);
            // Derive encryption key from master key + salt
            const key = this.deriveKey(salt);
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
                tag: tag.toString('base64')
            };
        }
        catch (error) {
            console.error('🚨 TOKEN ENCRYPTION ERROR:', error);
            throw new Error('Failed to encrypt token');
        }
    }
    /**
     * Decrypt a social media access token with robust error handling
     * @param encryptedToken - Encrypted token data with metadata
     * @returns Plain text access token
     */
    decryptToken(encryptedToken) {
        try {
            if (!encryptedToken || !encryptedToken.encryptedData) {
                throw new Error('Invalid encrypted token data');
            }
            
            // BACKWARD COMPATIBILITY: Handle old format tokens
            if (encryptedToken.encryptedData && !encryptedToken.iv && !encryptedToken.salt && !encryptedToken.tag) {
                console.log('🔄 Using backward compatibility for old token format');
                try {
                    return Buffer.from(encryptedToken.encryptedData, 'base64').toString('utf8');
                } catch (error) {
                    throw new Error('Failed to decode legacy base64 token');
                }
            }
            
            const { encryptedData, iv, salt, tag } = encryptedToken;
            // Validate all required fields exist
            if (!encryptedData || !iv || !salt || !tag) {
                throw new Error('Missing encryption metadata fields');
            }
            // Convert base64 strings back to buffers with validation
            let ivBuffer, saltBuffer, tagBuffer;
            try {
                ivBuffer = Buffer.from(iv, 'base64');
                saltBuffer = Buffer.from(salt, 'base64');
                tagBuffer = Buffer.from(tag, 'base64');
            }
            catch (parseError) {
                throw new Error('Invalid base64 encoding in token metadata');
            }
            // Validate buffer lengths
            if (ivBuffer.length !== IV_LENGTH) {
                throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${ivBuffer.length}`);
            }
            if (saltBuffer.length !== SALT_LENGTH) {
                throw new Error(`Invalid salt length: expected ${SALT_LENGTH}, got ${saltBuffer.length}`);
            }
            if (tagBuffer.length !== TAG_LENGTH) {
                throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBuffer.length}`);
            }
            // Derive the same encryption key
            const key = this.deriveKey(saltBuffer);
            // Create decipher with proper AES-256-GCM
            const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
            decipher.setAuthTag(tagBuffer);
            // Decrypt the token
            let decryptedData;
            try {
                decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
                decryptedData += decipher.final('utf8');
            }
            catch (cryptoError) {
                // Handle specific GCM authentication failures
                if (cryptoError.message.includes('Unsupported state') ||
                    cryptoError.message.includes('unable to authenticate')) {
                    throw new Error('Token authentication failed - key mismatch or corrupted data');
                }
                throw cryptoError;
            }
            return decryptedData;
        }
        catch (error) {
            // Provide detailed error information for debugging
            console.warn('🚨 P2-FIX: Token decryption failed with detailed error:', {
                error: error.message,
                hasEncryptedData: !!encryptedToken?.encryptedData,
                hasIV: !!encryptedToken?.iv,
                hasSalt: !!encryptedToken?.salt,
                hasTag: !!encryptedToken?.tag,
                algorithmUsed: ALGORITHM
            });
            throw new Error(`Token decryption failed: ${error.message}`);
        }
    }
    /**
     * Validate that an encrypted token can be successfully decrypted
     * @param encryptedToken - Encrypted token to validate
     * @returns True if token is valid and can be decrypted
     */
    validateEncryptedToken(encryptedToken) {
        try {
            this.decryptToken(encryptedToken);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Re-encrypt a token with a new salt/IV (for key rotation)
     * @param encryptedToken - Existing encrypted token
     * @returns Newly encrypted token with fresh cryptographic parameters
     */
    rotateTokenEncryption(encryptedToken) {
        const plainToken = this.decryptToken(encryptedToken);
        return this.encryptToken(plainToken);
    }
    /**
     * Securely compare two tokens without exposing timing information
     * @param token1 - First encrypted token
     * @param token2 - Second encrypted token
     * @returns True if tokens contain the same plaintext value
     */
    secureTokenCompare(token1, token2) {
        try {
            const plain1 = this.decryptToken(token1);
            const plain2 = this.decryptToken(token2);
            // Use constant-time comparison to prevent timing attacks
            return crypto.timingSafeEqual(Buffer.from(plain1, 'utf8'), Buffer.from(plain2, 'utf8'));
        }
        catch {
            return false;
        }
    }
    /**
     * Generate a summary of encryption status for monitoring
     */
    getEncryptionStatus() {
        return {
            algorithm: ALGORITHM,
            keyLength: KEY_LENGTH * 8, // Convert to bits
            hasEnvironmentKey: !!process.env.TOKEN_ENCRYPTION_KEY,
            version: '1.0.0'
        };
    }
}
// Export singleton instance
export const tokenEncryption = new TokenEncryptionService();
