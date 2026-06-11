import crypto from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) Utilities
 * 
 * PKCE is a security extension to OAuth 2.0 for public clients (like SPAs)
 * that prevents authorization code interception attacks. It works by:
 * 
 * 1. Client generates a random code_verifier (43-128 characters)
 * 2. Client hashes code_verifier to create code_challenge
 * 3. Client sends code_challenge to authorization server
 * 4. Authorization server stores code_challenge
 * 5. Client exchanges authorization code + code_verifier for tokens
 * 6. Authorization server verifies hash(code_verifier) == code_challenge
 * 
 * Security Properties:
 * - Code verifier never leaves the server after initial generation
 * - Code challenge sent to Google is one-way hashed
 * - Attackers cannot derive code_verifier from code_challenge
 * - Even if authorization code is intercepted, it's useless without code_verifier
 * 
 * Requirements: 1.3, 17.1, 17.3
 */

/**
 * PKCE code verifier and challenge pair
 */
export interface PKCEPair {
  codeVerifier: string;      // Base64URL-encoded random string (43 characters)
  codeChallenge: string;     // SHA-256 hash of code_verifier (Base64URL-encoded)
  codeChallengeMethod: 'S256'; // Hash method (always S256 for SHA-256)
}

/**
 * PKCE utilities class providing code verifier and challenge generation
 */
export class PKCEUtils {
  /**
   * Code verifier length in bytes (before base64url encoding)
   * 32 bytes = ~43 characters when base64url encoded
   * Must be between 43-128 characters per RFC 7636
   * 
   * Requirement 17.3: Use cryptographically secure random generation
   */
  private static readonly CODE_VERIFIER_BYTES = 32;

  /**
   * Code challenge method (SHA-256)
   * S256 is the recommended method per RFC 7636
   * 
   * Requirement 1.3: Add code_challenge_method=S256 parameter
   */
  private static readonly CODE_CHALLENGE_METHOD = 'S256' as const;

  /**
   * Generate a cryptographically secure random code verifier
   * 
   * The code verifier is a high-entropy cryptographic random string
   * using base64url encoding (URL-safe, no padding). It must be:
   * - Between 43-128 characters long
   * - Uses unreserved characters [A-Z], [a-z], [0-9], "-", ".", "_", "~"
   * 
   * This implementation generates 32 random bytes which produces
   * a 43-character base64url string, meeting the minimum requirement.
   * 
   * @returns A base64url-encoded random string (~43 characters)
   * @throws Error if crypto.randomBytes fails
   * 
   * Requirement 1.3: Implement generateCodeVerifier using crypto.randomBytes(32)
   * Requirement 17.1: Implement PKCE for all OAuth authorization requests
   * Requirement 17.3: Use cryptographically secure random number generation
   */
  static generateCodeVerifier(): string {
    try {
      // Generate 32 random bytes and encode as base64url
      // base64url is URL-safe: uses - and _ instead of + and /, no padding
      return crypto
        .randomBytes(PKCEUtils.CODE_VERIFIER_BYTES)
        .toString('base64url');
    } catch (error) {
      throw new Error(
        `Failed to generate code verifier: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Generate code challenge from code verifier using SHA-256
   * 
   * The code challenge is created by:
   * 1. Taking the code verifier as ASCII string
   * 2. Hashing it with SHA-256
   * 3. Encoding the hash as base64url (URL-safe, no padding)
   * 
   * This one-way transformation ensures:
   * - Code verifier cannot be derived from code challenge
   * - Authorization server can verify code_verifier by recomputing hash
   * - Even if code_challenge is intercepted, attacker cannot use it
   * 
   * @param codeVerifier - The code verifier to hash
   * @returns Base64url-encoded SHA-256 hash of code verifier
   * @throws Error if code verifier is empty or hashing fails
   * 
   * Requirement 1.3: Implement generateCodeChallenge using SHA-256 hash
   * Requirement 1.3: Implement base64url encoding for code_challenge
   * Requirement 17.1: Implement PKCE for all OAuth authorization requests
   */
  static generateCodeChallenge(codeVerifier: string): string {
    if (!codeVerifier || codeVerifier.length === 0) {
      throw new Error('Code verifier cannot be empty');
    }

    try {
      // Hash the code verifier with SHA-256 and encode as base64url
      return crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    } catch (error) {
      throw new Error(
        `Failed to generate code challenge: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Generate both code verifier and code challenge
   * 
   * Convenience method that generates a complete PKCE pair:
   * - code_verifier: Random base64url string for client storage
   * - code_challenge: SHA-256 hash for authorization request
   * - code_challenge_method: Always "S256" indicating SHA-256
   * 
   * Usage flow:
   * 1. Call this method to get PKCE pair
   * 2. Store code_verifier in session (server-side)
   * 3. Send code_challenge + code_challenge_method to authorization server
   * 4. On callback, use code_verifier for token exchange
   * 
   * @returns Complete PKCE pair with verifier, challenge, and method
   * @throws Error if generation fails
   * 
   * Requirement 1.3: Generate PKCE code_verifier and code_challenge parameters
   * Requirement 1.3: Add code_challenge_method=S256 parameter
   * Requirement 17.1: Implement PKCE for all OAuth authorization requests
   */
  static generatePKCEPair(): PKCEPair {
    const codeVerifier = PKCEUtils.generateCodeVerifier();
    const codeChallenge = PKCEUtils.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: PKCEUtils.CODE_CHALLENGE_METHOD,
    };
  }

  /**
   * Verify that a code verifier produces the expected code challenge
   * 
   * This method is primarily for testing and validation.
   * In production, Google's OAuth server performs this verification.
   * 
   * Verification process:
   * 1. Hash the provided code_verifier with SHA-256
   * 2. Compare the result with the expected code_challenge
   * 3. Return true if they match, false otherwise
   * 
   * @param codeVerifier - The code verifier to test
   * @param expectedChallenge - The expected code challenge
   * @returns true if verification succeeds, false otherwise
   */
  static verifyPKCEPair(
    codeVerifier: string,
    expectedChallenge: string
  ): boolean {
    try {
      const computedChallenge = PKCEUtils.generateCodeChallenge(codeVerifier);
      return computedChallenge === expectedChallenge;
    } catch {
      return false;
    }
  }

  /**
   * Validate code verifier format
   * 
   * Checks that a code verifier meets RFC 7636 requirements:
   * - Length between 43-128 characters
   * - Contains only unreserved characters: [A-Z] [a-z] [0-9] - . _ ~
   * 
   * Note: Our implementation uses base64url which produces [A-Za-z0-9\-_]
   * but RFC 7636 allows the broader set of unreserved characters.
   * 
   * @param codeVerifier - The code verifier to validate
   * @returns true if valid, false otherwise
   */
  static isValidCodeVerifier(codeVerifier: string): boolean {
    if (!codeVerifier) return false;
    
    // Check length (43-128 characters per RFC 7636)
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
      return false;
    }
    
    // Check characters (unreserved characters per RFC 7636)
    // [A-Z] [a-z] [0-9] - . _ ~
    // Note: Need to escape the hyphen in regex or place it at start/end
    const validPattern = /^[A-Za-z0-9\-._~]+$/;
    return validPattern.test(codeVerifier);
  }
}

/**
 * Convenience function exports for common use cases
 */

/**
 * Generate a complete PKCE pair (verifier + challenge)
 * @returns PKCE pair with code_verifier, code_challenge, and code_challenge_method
 */
export function generatePKCEPair(): PKCEPair {
  return PKCEUtils.generatePKCEPair();
}

/**
 * Generate a code verifier only
 * @returns Base64url-encoded random string
 */
export function generateCodeVerifier(): string {
  return PKCEUtils.generateCodeVerifier();
}

/**
 * Generate a code challenge from a verifier
 * @param codeVerifier - The code verifier to hash
 * @returns Base64url-encoded SHA-256 hash
 */
export function generateCodeChallenge(codeVerifier: string): string {
  return PKCEUtils.generateCodeChallenge(codeVerifier);
}

/**
 * Verify a PKCE pair
 * @param codeVerifier - The code verifier
 * @param expectedChallenge - The expected code challenge
 * @returns true if verification succeeds
 */
export function verifyPKCEPair(
  codeVerifier: string,
  expectedChallenge: string
): boolean {
  return PKCEUtils.verifyPKCEPair(codeVerifier, expectedChallenge);
}
