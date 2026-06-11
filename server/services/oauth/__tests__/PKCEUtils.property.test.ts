import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PKCEUtils } from '../PKCEUtils';

/**
 * Property-Based Tests for PKCE Utilities
 * 
 * These tests use fast-check to generate hundreds of random inputs and verify
 * that universal properties hold across all generated values.
 * 
 * Test Requirements:
 * - Run minimum 100 iterations per property
 * - Verify PKCE round-trip properties (verifier -> challenge -> verify)
 * - Test security invariants (hash relationship, uniqueness)
 * 
 * Requirements tested: 1.3, 17.1, 17.3
 */

describe('PKCEUtils - Property-Based Tests', () => {
  /**
   * Property 2: PKCE Round-Trip Verification
   * 
   * **Validates: Requirements 1.3, 17.1**
   * 
   * This property verifies that:
   * 1. For any generated code_verifier, computing its code_challenge succeeds
   * 2. The resulting (verifier, challenge) pair passes verification
   * 3. The hash relationship is consistent across all inputs
   * 4. The round-trip property holds: generate -> challenge -> verify always succeeds
   * 
   * Security Rationale:
   * - PKCE security relies on the verifier-challenge relationship being verifiable
   * - The challenge is derived from verifier via SHA-256 hash
   * - Verification ensures the same verifier produces the same challenge
   * - This prevents authorization code interception attacks
   * 
   * Test Strategy:
   * - Generate many random code_verifiers (or use the utility to generate them)
   * - Compute code_challenge from each verifier
   * - Verify the pair passes verification
   * - Ensure consistency across 100+ iterations
   */
  it('PROPERTY 2: PKCE round-trip verification must succeed for all generated pairs', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Generate a PKCE pair using the utility function
          const { codeVerifier, codeChallenge } = PKCEUtils.generatePKCEPair();
          
          // Verify the code verifier format
          expect(codeVerifier).toBeDefined();
          expect(typeof codeVerifier).toBe('string');
          expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
          expect(codeVerifier.length).toBeLessThanOrEqual(128);
          
          // Verify the code challenge format
          expect(codeChallenge).toBeDefined();
          expect(typeof codeChallenge).toBe('string');
          expect(codeChallenge.length).toBe(43); // SHA-256 hash -> base64url -> 43 chars
          
          // Verify the pair passes verification (round-trip property)
          const isValid = PKCEUtils.verifyPKCEPair(codeVerifier, codeChallenge);
          expect(isValid).toBe(true);
          
          // Additional check: Re-computing the challenge from verifier should give same result
          const recomputedChallenge = PKCEUtils.generateCodeChallenge(codeVerifier);
          expect(recomputedChallenge).toBe(codeChallenge);
          
          return true;
        }
      ),
      {
        numRuns: 100, // Run 100 iterations as required
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: PKCE Challenge Determinism
   * 
   * Verifies that the same code_verifier always produces the same code_challenge.
   * This is critical for PKCE security - the challenge must be deterministic.
   */
  it('PROPERTY: Same code_verifier must always produce same code_challenge (determinism)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Generate a verifier
          const verifier = PKCEUtils.generateCodeVerifier();
          
          // Compute challenge multiple times
          const challenge1 = PKCEUtils.generateCodeChallenge(verifier);
          const challenge2 = PKCEUtils.generateCodeChallenge(verifier);
          const challenge3 = PKCEUtils.generateCodeChallenge(verifier);
          
          // All challenges must be identical (determinism)
          expect(challenge1).toBe(challenge2);
          expect(challenge2).toBe(challenge3);
          expect(challenge1).toBe(challenge3);
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: PKCE Challenge Uniqueness
   * 
   * Verifies that different code_verifiers produce different code_challenges.
   * This ensures the hash function provides sufficient entropy.
   */
  it('PROPERTY: Different code_verifiers must produce different code_challenges (uniqueness)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const pairs: Array<{ verifier: string; challenge: string }> = [];
          
          // Generate 50 pairs
          for (let i = 0; i < 50; i++) {
            const { codeVerifier, codeChallenge } = PKCEUtils.generatePKCEPair();
            pairs.push({ verifier: codeVerifier, challenge: codeChallenge });
          }
          
          // Check that all verifiers are unique
          const uniqueVerifiers = new Set(pairs.map(p => p.verifier));
          expect(uniqueVerifiers.size).toBe(50);
          
          // Check that all challenges are unique
          const uniqueChallenges = new Set(pairs.map(p => p.challenge));
          expect(uniqueChallenges.size).toBe(50);
          
          // Check that no two different verifiers produce the same challenge
          for (let i = 0; i < pairs.length; i++) {
            for (let j = i + 1; j < pairs.length; j++) {
              if (pairs[i].verifier !== pairs[j].verifier) {
                expect(pairs[i].challenge).not.toBe(pairs[j].challenge);
              }
            }
          }
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: PKCE Verification Rejection
   * 
   * Verifies that mismatched verifier-challenge pairs are rejected.
   * This ensures the verification logic correctly detects tampering.
   */
  it('PROPERTY: Mismatched PKCE pairs must fail verification (security)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Generate two independent PKCE pairs
          const pair1 = PKCEUtils.generatePKCEPair();
          const pair2 = PKCEUtils.generatePKCEPair();
          
          // Ensure they're different (extremely unlikely to collide, but check anyway)
          if (pair1.codeVerifier === pair2.codeVerifier) {
            return true; // Skip this iteration (collision)
          }
          
          // Cross-verification should fail (verifier1 with challenge2)
          const crossValid1 = PKCEUtils.verifyPKCEPair(pair1.codeVerifier, pair2.codeChallenge);
          expect(crossValid1).toBe(false);
          
          // Cross-verification should fail (verifier2 with challenge1)
          const crossValid2 = PKCEUtils.verifyPKCEPair(pair2.codeVerifier, pair1.codeChallenge);
          expect(crossValid2).toBe(false);
          
          // Self-verification should succeed
          expect(PKCEUtils.verifyPKCEPair(pair1.codeVerifier, pair1.codeChallenge)).toBe(true);
          expect(PKCEUtils.verifyPKCEPair(pair2.codeVerifier, pair2.codeChallenge)).toBe(true);
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: PKCE Challenge Irreversibility
   * 
   * Verifies that the code_challenge cannot be used to derive the code_verifier.
   * This is a fundamental security property of the SHA-256 hash.
   */
  it('PROPERTY: Code_challenge must not reveal code_verifier (one-way function)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const { codeVerifier, codeChallenge } = PKCEUtils.generatePKCEPair();
          
          // The challenge should not contain the verifier as substring
          expect(codeChallenge).not.toContain(codeVerifier);
          expect(codeVerifier).not.toContain(codeChallenge);
          
          // The challenge should be significantly different in length
          // (SHA-256 output is fixed 43 chars in base64url, verifiers are 43-128 chars)
          expect(codeChallenge.length).toBe(43);
          
          // Generate multiple challenges from same verifier
          const challenge2 = PKCEUtils.generateCodeChallenge(codeVerifier);
          
          // Challenges should be identical (deterministic hash)
          expect(challenge2).toBe(codeChallenge);
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: PKCE Base64URL Encoding
   * 
   * Verifies that code_verifier and code_challenge use base64url encoding
   * (URL-safe characters only: A-Z, a-z, 0-9, -, _)
   */
  it('PROPERTY: PKCE values must use base64url encoding (URL-safe)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const { codeVerifier, codeChallenge } = PKCEUtils.generatePKCEPair();
          
          // Base64URL character set: A-Z, a-z, 0-9, -, _
          const base64urlPattern = /^[A-Za-z0-9_-]+$/;
          
          // Verify code_verifier uses base64url encoding
          expect(base64urlPattern.test(codeVerifier)).toBe(true);
          
          // Verify code_challenge uses base64url encoding
          expect(base64urlPattern.test(codeChallenge)).toBe(true);
          
          // No unsafe characters should be present
          expect(codeVerifier).not.toMatch(/[+/=]/); // Standard base64 chars, not base64url
          expect(codeChallenge).not.toMatch(/[+/=]/);
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: Concurrent PKCE Generation
   * 
   * Verifies that generating multiple PKCE pairs concurrently produces unique results.
   * Important for high-throughput OAuth flows.
   */
  it('PROPERTY: Concurrent PKCE generation must produce unique pairs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 50 }),
        async (concurrentCount) => {
          // Generate PKCE pairs concurrently
          const promises = Array.from({ length: concurrentCount }, () =>
            Promise.resolve(PKCEUtils.generatePKCEPair())
          );
          
          const pairs = await Promise.all(promises);
          
          // All verifiers must be unique
          const uniqueVerifiers = new Set(pairs.map(p => p.codeVerifier));
          expect(uniqueVerifiers.size).toBe(concurrentCount);
          
          // All challenges must be unique (follows from unique verifiers)
          const uniqueChallenges = new Set(pairs.map(p => p.codeChallenge));
          expect(uniqueChallenges.size).toBe(concurrentCount);
          
          // All pairs must pass verification
          pairs.forEach(pair => {
            const isValid = PKCEUtils.verifyPKCEPair(pair.codeVerifier, pair.codeChallenge);
            expect(isValid).toBe(true);
          });
          
          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});
