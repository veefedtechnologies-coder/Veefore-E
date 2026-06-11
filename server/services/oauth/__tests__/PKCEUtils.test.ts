import crypto from 'crypto';
import {
  PKCEUtils,
  generatePKCEPair,
  generateCodeVerifier,
  generateCodeChallenge,
  verifyPKCEPair,
} from '../PKCEUtils';

/**
 * Unit tests for PKCE (Proof Key for Code Exchange) utilities
 * 
 * Tests cover:
 * - Code verifier generation (length, format, uniqueness)
 * - Code challenge generation (SHA-256 hashing, base64url encoding)
 * - PKCE pair generation (complete verifier + challenge)
 * - PKCE verification (round-trip testing)
 * - Format validation
 * - Edge cases and error handling
 * 
 * Requirements tested: 1.3, 17.1, 17.3
 */

describe('PKCEUtils', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a code verifier', () => {
      // Requirement 1.3: Implement generateCodeVerifier using crypto.randomBytes(32)
      const verifier = PKCEUtils.generateCodeVerifier();
      
      expect(verifier).toBeDefined();
      expect(typeof verifier).toBe('string');
      expect(verifier.length).toBeGreaterThan(0);
    });

    it('should generate a code verifier of correct length (43 characters)', () => {
      // 32 bytes encoded as base64url = ~43 characters
      const verifier = PKCEUtils.generateCodeVerifier();
      
      expect(verifier.length).toBe(43);
    });

    it('should generate base64url-encoded strings (URL-safe)', () => {
      // Base64url uses: A-Z, a-z, 0-9, -, _
      // Does NOT use: +, /, = (padding)
      const verifier = PKCEUtils.generateCodeVerifier();
      
      // Should only contain base64url characters
      expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
      
      // Should not contain standard base64 special chars
      expect(verifier).not.toContain('+');
      expect(verifier).not.toContain('/');
      expect(verifier).not.toContain('=');
    });

    it('should generate unique code verifiers', () => {
      // Requirement 17.3: Use cryptographically secure random number generation
      const verifiers = new Set<string>();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const verifier = PKCEUtils.generateCodeVerifier();
        verifiers.add(verifier);
      }
      
      // All verifiers should be unique
      expect(verifiers.size).toBe(iterations);
    });

    it('should generate different verifiers on consecutive calls', () => {
      const verifier1 = PKCEUtils.generateCodeVerifier();
      const verifier2 = PKCEUtils.generateCodeVerifier();
      
      expect(verifier1).not.toBe(verifier2);
    });

    it('should meet RFC 7636 minimum length requirement (43 characters)', () => {
      // RFC 7636 requires code_verifier to be 43-128 characters
      const verifier = PKCEUtils.generateCodeVerifier();
      
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('should use cryptographically secure random bytes', () => {
      // Verify high entropy by checking uniqueness in large sample
      const verifiers = new Set<string>();
      const largeSample = 1000;
      
      for (let i = 0; i < largeSample; i++) {
        verifiers.add(PKCEUtils.generateCodeVerifier());
      }
      
      // Should have no collisions in 1000 attempts
      expect(verifiers.size).toBe(largeSample);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a code challenge from code verifier', () => {
      // Requirement 1.3: Implement generateCodeChallenge using SHA-256 hash
      const verifier = 'test-code-verifier';
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('should generate base64url-encoded challenges', () => {
      // Requirement 1.3: Implement base64url encoding for code_challenge
      const verifier = 'test-verifier-123';
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      // Should only contain base64url characters
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
      
      // Should not contain standard base64 special chars
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
      expect(challenge).not.toContain('=');
    });

    it('should generate a 43-character challenge (SHA-256 hash)', () => {
      // SHA-256 produces 32 bytes -> 43 characters when base64url encoded
      const verifier = 'any-verifier';
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(challenge.length).toBe(43);
    });

    it('should generate same challenge for same verifier (deterministic)', () => {
      const verifier = 'consistent-verifier';
      
      const challenge1 = PKCEUtils.generateCodeChallenge(verifier);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = 'verifier-one';
      const verifier2 = 'verifier-two';
      
      const challenge1 = PKCEUtils.generateCodeChallenge(verifier1);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier2);
      
      expect(challenge1).not.toBe(challenge2);
    });

    it('should throw error for empty code verifier', () => {
      expect(() => {
        PKCEUtils.generateCodeChallenge('');
      }).toThrow('Code verifier cannot be empty');
    });

    it('should use SHA-256 algorithm correctly', () => {
      // Verify SHA-256 hashing by comparing with manual implementation
      const verifier = 'test-sha256-verifier';
      
      const pkceChallenge = PKCEUtils.generateCodeChallenge(verifier);
      
      // Manual SHA-256 computation
      const manualChallenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
      
      expect(pkceChallenge).toBe(manualChallenge);
    });

    it('should handle long verifiers correctly', () => {
      const longVerifier = 'a'.repeat(128); // Max length per RFC 7636
      
      expect(() => {
        const challenge = PKCEUtils.generateCodeChallenge(longVerifier);
        expect(challenge).toBeDefined();
        expect(challenge.length).toBe(43); // SHA-256 always produces same length
      }).not.toThrow();
    });

    it('should handle special characters in verifier', () => {
      const specialVerifier = 'test-_~.!@#$%^&*()';
      
      expect(() => {
        const challenge = PKCEUtils.generateCodeChallenge(specialVerifier);
        expect(challenge).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('generatePKCEPair', () => {
    it('should generate a complete PKCE pair', () => {
      // Requirement 1.3: Generate PKCE code_verifier and code_challenge parameters
      const pair = PKCEUtils.generatePKCEPair();
      
      expect(pair).toBeDefined();
      expect(pair.codeVerifier).toBeDefined();
      expect(pair.codeChallenge).toBeDefined();
      expect(pair.codeChallengeMethod).toBeDefined();
    });

    it('should generate valid code verifier', () => {
      const pair = PKCEUtils.generatePKCEPair();
      
      expect(pair.codeVerifier.length).toBe(43);
      expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should generate valid code challenge', () => {
      const pair = PKCEUtils.generatePKCEPair();
      
      expect(pair.codeChallenge.length).toBe(43);
      expect(pair.codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should set code challenge method to S256', () => {
      // Requirement 1.3: Add code_challenge_method=S256 parameter
      const pair = PKCEUtils.generatePKCEPair();
      
      expect(pair.codeChallengeMethod).toBe('S256');
    });

    it('should generate matching verifier and challenge', () => {
      // Requirement 17.1: Implement PKCE for all OAuth authorization requests
      const pair = PKCEUtils.generatePKCEPair();
      
      // Manually compute challenge from verifier
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(pair.codeVerifier)
        .digest('base64url');
      
      expect(pair.codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique pairs on each call', () => {
      const pairs = new Map<string, string>();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const pair = PKCEUtils.generatePKCEPair();
        pairs.set(pair.codeVerifier, pair.codeChallenge);
      }
      
      // All pairs should be unique
      expect(pairs.size).toBe(iterations);
    });

    it('should generate different pairs on consecutive calls', () => {
      const pair1 = PKCEUtils.generatePKCEPair();
      const pair2 = PKCEUtils.generatePKCEPair();
      
      expect(pair1.codeVerifier).not.toBe(pair2.codeVerifier);
      expect(pair1.codeChallenge).not.toBe(pair2.codeChallenge);
    });
  });

  describe('verifyPKCEPair', () => {
    it('should verify a valid PKCE pair', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      const isValid = PKCEUtils.verifyPKCEPair(verifier, challenge);
      
      expect(isValid).toBe(true);
    });

    it('should reject mismatched verifier and challenge', () => {
      const verifier1 = PKCEUtils.generateCodeVerifier();
      const verifier2 = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier1);
      
      const isValid = PKCEUtils.verifyPKCEPair(verifier2, challenge);
      
      expect(isValid).toBe(false);
    });

    it('should verify pair generated by generatePKCEPair', () => {
      const pair = PKCEUtils.generatePKCEPair();
      
      const isValid = PKCEUtils.verifyPKCEPair(
        pair.codeVerifier,
        pair.codeChallenge
      );
      
      expect(isValid).toBe(true);
    });

    it('should handle empty verifier gracefully', () => {
      const isValid = PKCEUtils.verifyPKCEPair('', 'some-challenge');
      
      expect(isValid).toBe(false);
    });

    it('should handle empty challenge gracefully', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      
      const isValid = PKCEUtils.verifyPKCEPair(verifier, '');
      
      expect(isValid).toBe(false);
    });

    it('should handle invalid challenge format gracefully', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      const invalidChallenge = 'not-a-valid-base64url!!!';
      
      // Should not throw, just return false
      const isValid = PKCEUtils.verifyPKCEPair(verifier, invalidChallenge);
      
      expect(isValid).toBe(false);
    });
  });

  describe('isValidCodeVerifier', () => {
    it('should validate correct code verifier format', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      
      const isValid = PKCEUtils.isValidCodeVerifier(verifier);
      
      expect(isValid).toBe(true);
    });

    it('should reject verifiers shorter than 43 characters', () => {
      const shortVerifier = 'a'.repeat(42);
      
      const isValid = PKCEUtils.isValidCodeVerifier(shortVerifier);
      
      expect(isValid).toBe(false);
    });

    it('should reject verifiers longer than 128 characters', () => {
      const longVerifier = 'a'.repeat(129);
      
      const isValid = PKCEUtils.isValidCodeVerifier(longVerifier);
      
      expect(isValid).toBe(false);
    });

    it('should accept verifiers exactly 43 characters (minimum)', () => {
      const minVerifier = 'a'.repeat(43);
      
      const isValid = PKCEUtils.isValidCodeVerifier(minVerifier);
      
      expect(isValid).toBe(true);
    });

    it('should accept verifiers exactly 128 characters (maximum)', () => {
      const maxVerifier = 'a'.repeat(128);
      
      const isValid = PKCEUtils.isValidCodeVerifier(maxVerifier);
      
      expect(isValid).toBe(true);
    });

    it('should accept unreserved characters: A-Z a-z 0-9 - . _ ~', () => {
      const validVerifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'; // 43 chars
      
      expect(PKCEUtils.isValidCodeVerifier(validVerifier)).toBe(true);
      expect(PKCEUtils.isValidCodeVerifier('a'.repeat(42) + '-')).toBe(true);
      expect(PKCEUtils.isValidCodeVerifier('a'.repeat(42) + '.')).toBe(true);
      expect(PKCEUtils.isValidCodeVerifier('a'.repeat(42) + '_')).toBe(true);
      expect(PKCEUtils.isValidCodeVerifier('a'.repeat(42) + '~')).toBe(true);
    });

    it('should reject verifiers with invalid characters', () => {
      const invalidChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
      
      for (const char of invalidChars) {
        const verifier = 'a'.repeat(42) + char;
        expect(PKCEUtils.isValidCodeVerifier(verifier)).toBe(false);
      }
    });

    it('should reject empty verifier', () => {
      const isValid = PKCEUtils.isValidCodeVerifier('');
      
      expect(isValid).toBe(false);
    });

    it('should reject null/undefined verifier', () => {
      expect(PKCEUtils.isValidCodeVerifier(null as any)).toBe(false);
      expect(PKCEUtils.isValidCodeVerifier(undefined as any)).toBe(false);
    });

    it('should reject verifiers with spaces', () => {
      const verifierWithSpaces = 'a'.repeat(20) + ' ' + 'a'.repeat(22);
      
      const isValid = PKCEUtils.isValidCodeVerifier(verifierWithSpaces);
      
      expect(isValid).toBe(false);
    });
  });

  describe('convenience function exports', () => {
    it('should export generatePKCEPair convenience function', () => {
      const pair = generatePKCEPair();
      
      expect(pair).toBeDefined();
      expect(pair.codeVerifier).toBeDefined();
      expect(pair.codeChallenge).toBeDefined();
      expect(pair.codeChallengeMethod).toBe('S256');
    });

    it('should export generateCodeVerifier convenience function', () => {
      const verifier = generateCodeVerifier();
      
      expect(verifier).toBeDefined();
      expect(verifier.length).toBe(43);
    });

    it('should export generateCodeChallenge convenience function', () => {
      const verifier = 'test-verifier';
      const challenge = generateCodeChallenge(verifier);
      
      expect(challenge).toBeDefined();
      expect(challenge.length).toBe(43);
    });

    it('should export verifyPKCEPair convenience function', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      
      const isValid = verifyPKCEPair(verifier, challenge);
      
      expect(isValid).toBe(true);
    });
  });

  describe('security properties', () => {
    it('should generate high-entropy verifiers', () => {
      // Test entropy by checking for patterns in large sample
      const verifiers: string[] = [];
      const sampleSize = 100;
      
      for (let i = 0; i < sampleSize; i++) {
        verifiers.push(PKCEUtils.generateCodeVerifier());
      }
      
      // All should be unique (no collisions)
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(sampleSize);
      
      // Should have varied character distribution
      const firstChars = verifiers.map(v => v[0]);
      const uniqueFirstChars = new Set(firstChars);
      // Should have at least 20 different first characters
      expect(uniqueFirstChars.size).toBeGreaterThan(20);
    });

    it('should prevent code challenge reversal (one-way hash)', () => {
      // Challenge should not reveal information about verifier
      const verifier = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      // Challenge and verifier should be completely different
      expect(challenge).not.toBe(verifier);
      expect(challenge).not.toContain(verifier);
      expect(verifier).not.toContain(challenge);
      
      // Challenge should always be 43 characters (SHA-256)
      expect(challenge.length).toBe(43);
    });

    it('should use SHA-256 (secure hash function)', () => {
      // Verify that small changes in verifier produce completely different challenges
      const verifier1 = 'verifier-test-1';
      const verifier2 = 'verifier-test-2'; // Only last char different
      
      const challenge1 = PKCEUtils.generateCodeChallenge(verifier1);
      const challenge2 = PKCEUtils.generateCodeChallenge(verifier2);
      
      // Challenges should be completely different (avalanche effect)
      expect(challenge1).not.toBe(challenge2);
      
      // Count different characters (should be most of them)
      let differentChars = 0;
      for (let i = 0; i < challenge1.length; i++) {
        if (challenge1[i] !== challenge2[i]) differentChars++;
      }
      
      // At least 80% of characters should be different (SHA-256 avalanche effect)
      expect(differentChars).toBeGreaterThan(challenge1.length * 0.8);
    });

    it('should meet RFC 7636 requirements', () => {
      // RFC 7636 specifies PKCE requirements
      const pair = PKCEUtils.generatePKCEPair();
      
      // Code verifier: 43-128 characters, unreserved chars
      expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pair.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
      
      // Code challenge: base64url-encoded SHA-256 hash
      expect(pair.codeChallenge.length).toBe(43); // SHA-256 -> 32 bytes -> 43 chars
      expect(pair.codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
      
      // Code challenge method: S256 (SHA-256)
      expect(pair.codeChallengeMethod).toBe('S256');
    });

    it('should generate cryptographically secure random verifiers', () => {
      // Test for non-predictability by generating large sample
      const verifiers = new Set<string>();
      const iterations = 10000;
      
      for (let i = 0; i < iterations; i++) {
        verifiers.add(PKCEUtils.generateCodeVerifier());
      }
      
      // Should have zero collisions in 10,000 attempts
      expect(verifiers.size).toBe(iterations);
    });
  });

  describe('edge cases', () => {
    it('should handle consecutive generation without issues', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          PKCEUtils.generatePKCEPair();
        }
      }).not.toThrow();
    });

    it('should handle challenge generation with minimum length verifier', () => {
      const minVerifier = 'a'.repeat(43);
      
      expect(() => {
        const challenge = PKCEUtils.generateCodeChallenge(minVerifier);
        expect(challenge).toBeDefined();
      }).not.toThrow();
    });

    it('should handle challenge generation with maximum length verifier', () => {
      const maxVerifier = 'a'.repeat(128);
      
      expect(() => {
        const challenge = PKCEUtils.generateCodeChallenge(maxVerifier);
        expect(challenge).toBeDefined();
      }).not.toThrow();
    });

    it('should handle unicode characters in verifier', () => {
      const unicodeVerifier = 'test-验证器-тест-🔐-'.padEnd(43, 'a');
      
      expect(() => {
        const challenge = PKCEUtils.generateCodeChallenge(unicodeVerifier);
        expect(challenge).toBeDefined();
      }).not.toThrow();
    });

    it('should generate consistent challenges for identical verifiers', () => {
      const verifier = 'consistent-test-verifier';
      const challenges: string[] = [];
      
      for (let i = 0; i < 100; i++) {
        challenges.push(PKCEUtils.generateCodeChallenge(verifier));
      }
      
      // All challenges should be identical
      expect(new Set(challenges).size).toBe(1);
    });
  });

  describe('round-trip verification', () => {
    it('should verify round-trip for generated pairs', () => {
      // Property: For all generated PKCE pairs, verification should succeed
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const pair = PKCEUtils.generatePKCEPair();
        const isValid = PKCEUtils.verifyPKCEPair(
          pair.codeVerifier,
          pair.codeChallenge
        );
        
        expect(isValid).toBe(true);
      }
    });

    it('should verify manually constructed pairs', () => {
      const verifier = PKCEUtils.generateCodeVerifier();
      const challenge = PKCEUtils.generateCodeChallenge(verifier);
      
      expect(PKCEUtils.verifyPKCEPair(verifier, challenge)).toBe(true);
    });

    it('should reject pairs with swapped verifier and challenge', () => {
      const pair = PKCEUtils.generatePKCEPair();
      
      // Try to verify with swapped values
      const isValid = PKCEUtils.verifyPKCEPair(
        pair.codeChallenge,
        pair.codeVerifier
      );
      
      expect(isValid).toBe(false);
    });
  });
});
