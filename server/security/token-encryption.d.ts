interface EncryptedToken {
    encryptedData: string;
    iv: string;
    salt: string;
    tag: string;
}
export declare class TokenEncryptionService {
    private masterKey;
    constructor();
    /**
     * Generate a secure master key for development/testing
     * NOTE: In production, use a proper key management service (AWS KMS, HashiCorp Vault, etc.)
     */
    private generateMasterKey;
    /**
     * Derive encryption key from master key using PBKDF2
     */
    private deriveKey;
    /**
     * Encrypt a social media access token
     * @param token - Plain text access token to encrypt
     * @returns Encrypted token data with metadata
     */
    encryptToken(token: string): EncryptedToken;
    /**
     * Decrypt a social media access token with robust error handling
     * @param encryptedToken - Encrypted token data with metadata
     * @returns Plain text access token
     */
    decryptToken(encryptedToken: EncryptedToken): string;
    /**
     * Validate that an encrypted token can be successfully decrypted
     * @param encryptedToken - Encrypted token to validate
     * @returns True if token is valid and can be decrypted
     */
    validateEncryptedToken(encryptedToken: EncryptedToken): boolean;
    /**
     * Re-encrypt a token with a new salt/IV (for key rotation)
     * @param encryptedToken - Existing encrypted token
     * @returns Newly encrypted token with fresh cryptographic parameters
     */
    rotateTokenEncryption(encryptedToken: EncryptedToken): EncryptedToken;
    /**
     * Securely compare two tokens without exposing timing information
     * @param token1 - First encrypted token
     * @param token2 - Second encrypted token
     * @returns True if tokens contain the same plaintext value
     */
    secureTokenCompare(token1: EncryptedToken, token2: EncryptedToken): boolean;
    /**
     * Generate a summary of encryption status for monitoring
     */
    getEncryptionStatus(): {
        algorithm: string;
        keyLength: number;
        hasEnvironmentKey: boolean;
        version: string;
    };
}
export declare const tokenEncryption: TokenEncryptionService;
export type { EncryptedToken };
