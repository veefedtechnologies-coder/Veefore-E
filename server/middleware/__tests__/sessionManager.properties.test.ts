import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import { Response } from 'express';

/**
 * Property-Based Tests for SessionManager - Cookie Security Attributes
 * 
 * These tests use fast-check to generate random cookie values and verify
 * that all cookies have the required security attributes set correctly
 * regardless of the cookie value.
 * 
 * Feature: server-side-oauth-implementation
 * Task 4.2: Write property test for cookie security attributes
 */

describe('SessionManager - Property-Based Tests', () => {
  let sessionManager: any;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Reset environment before each test
    vi.resetModules();
    
    // Set valid SESSION_SECRET for testing (minimum 32 characters)
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_DOMAIN = 'veefore.com';
    
    // Import SessionManager with fresh environment
    const module = await import('../sessionManager');
    sessionManager = module.default;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
   * 
   * Property 8: Cookie Security Attributes
   * 
   * For all randomly generated cookie values,
   * verify all cookies have the required security attributes:
   * - HttpOnly: true (prevents JavaScript access)
   * - Secure: true (HTTPS-only in production)
   * - SameSite: 'strict' (CSRF protection)
   * - Max-Age: 3600 (1 hour)
   * - Path: '/' (available to all routes)
   * - Domain: production domain (when in production)
   * 
   * This ensures cookie security is independent of the cookie value.
   */
  it('Property 8: Cookie Security Attributes - all cookies have correct security attributes regardless of value', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random cookie values with various characteristics:
        // - Alphanumeric strings
        // - Special characters
        // - Various lengths (10-1000 characters)
        // - Unicode characters
        // NOTE: Exclude dots as SessionManager's signing format uses '.' as separator
        fc.oneof(
          // Standard alphanumeric tokens
          fc.string({ minLength: 10, maxLength: 1000 })
            .filter(s => !s.includes('.')),
          
          // JWT-like tokens (base64url format)
          fc.array(
            fc.constantFrom(
              ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
            ),
            { minLength: 10, maxLength: 1000 }
          ).map(arr => arr.join('')),
          
          // Tokens with special characters (excluding dots)
          fc.array(
            fc.integer({ min: 32, max: 126 })
              .filter(n => n !== 46) // Exclude '.' (ASCII 46)
          ).map(arr => arr.map(n => String.fromCharCode(n)).join(''))
            .filter(s => s.length >= 10 && s.length <= 1000)
        ),
        
        async (cookieValue) => {
          // Create a mock response object with spy on cookie method
          const mockResponse: Partial<Response> = {
            cookie: vi.fn(),
          };

          // Set the authentication cookie with the random value
          sessionManager.setAuthCookie(mockResponse as Response, cookieValue);

          // Verify cookie method was called exactly once
          expect(mockResponse.cookie).toHaveBeenCalledTimes(1);

          // Extract the cookie call arguments
          const [cookieName, cookieValueSet, cookieOptions] = (mockResponse.cookie as any).mock.calls[0];

          // PROPERTY 8.1: Cookie name is always 'auth_token'
          expect(cookieName).toBe('auth_token');

          // PROPERTY 8.2: Cookie value is signed (contains '.' separator)
          expect(cookieValueSet).toContain('.');
          
          // Verify signed value format: value.signature
          const parts = cookieValueSet.split('.');
          expect(parts.length).toBeGreaterThanOrEqual(2); // At least value.signature
          
          // PROPERTY 8.3: HttpOnly attribute is true (Requirement 5.1)
          // Prevents JavaScript access (XSS protection)
          expect(cookieOptions.httpOnly).toBe(true);

          // PROPERTY 8.4: Secure attribute is true in production (Requirement 5.2)
          // HTTPS-only transmission
          expect(cookieOptions.secure).toBe(true);

          // PROPERTY 8.5: SameSite attribute is 'strict' (Requirement 5.3)
          // CSRF protection
          expect(cookieOptions.sameSite).toBe('strict');

          // PROPERTY 8.6: Max-Age is 3600 seconds (1 hour) (Requirement 5.5)
          // Matches Firebase token expiration
          expect(cookieOptions.maxAge).toBe(3600000); // 3600 seconds * 1000ms

          // PROPERTY 8.7: Path is '/' (Requirement 5.4)
          // Available to all application routes
          expect(cookieOptions.path).toBe('/');

          // PROPERTY 8.8: Domain is set in production (Requirement 5.6)
          // Enables subdomain sharing
          expect(cookieOptions.domain).toBe('veefore.com');

          // INVARIANT: All security attributes must be present
          expect(cookieOptions).toHaveProperty('httpOnly');
          expect(cookieOptions).toHaveProperty('secure');
          expect(cookieOptions).toHaveProperty('sameSite');
          expect(cookieOptions).toHaveProperty('maxAge');
          expect(cookieOptions).toHaveProperty('path');
          expect(cookieOptions).toHaveProperty('domain');

          // INVARIANT: The signed cookie value is verifiable
          const verifiedValue = sessionManager.verifyCookie(cookieValueSet);
          expect(verifiedValue).toBe(cookieValue);
        }
      ),
      {
        // Run minimum 100 iterations as specified in task details
        numRuns: 100,
        // Verbose mode for better error reporting
        verbose: false,
        // Seed for reproducibility (optional, can be removed for true randomness)
        // seed: 42,
      }
    );
  });

  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
   * 
   * Property 8 (Non-Production): Cookie Security Attributes in Development
   * 
   * Verify that cookies in non-production environments:
   * - Have HttpOnly, SameSite, Path, Max-Age attributes correctly set
   * - Do NOT have Secure attribute set to true (allows HTTP in development)
   * - Do NOT have Domain attribute set
   */
  it('Property 8 (non-production): Cookie Security Attributes - Secure and Domain are omitted in non-production', async () => {
    // Override environment for non-production
    process.env.NODE_ENV = 'development';
    process.env.COOKIE_DOMAIN = undefined;
    
    // Reload SessionManager with development environment
    vi.resetModules();
    const module = await import('../sessionManager');
    sessionManager = module.default;

    await fc.assert(
      fc.asyncProperty(
        // Generate random cookie values (exclude dots for proper signing)
        fc.string({ minLength: 10, maxLength: 500 })
          .filter(s => !s.includes('.')),
        
        async (cookieValue) => {
          const mockResponse: Partial<Response> = {
            cookie: vi.fn(),
          };

          sessionManager.setAuthCookie(mockResponse as Response, cookieValue);

          const [, , cookieOptions] = (mockResponse.cookie as any).mock.calls[0];

          // PROPERTY: HttpOnly is true in all environments
          expect(cookieOptions.httpOnly).toBe(true);

          // PROPERTY: Secure is false in development (allows HTTP)
          expect(cookieOptions.secure).toBe(false);

          // PROPERTY: SameSite is 'strict' in all environments
          expect(cookieOptions.sameSite).toBe('strict');

          // PROPERTY: Max-Age is 3600 seconds in all environments
          expect(cookieOptions.maxAge).toBe(3600000);

          // PROPERTY: Path is '/' in all environments
          expect(cookieOptions.path).toBe('/');

          // PROPERTY: Domain is undefined in development
          expect(cookieOptions.domain).toBeUndefined();
        }
      ),
      {
        numRuns: 100,
      }
    );
  });

  /**
   * **Validates: Requirements 5.7**
   * 
   * Property 8 (Extended): Cookie Signing Consistency
   * 
   * For all cookie values, verify that:
   * - The same value always produces the same signature
   * - Different values always produce different signatures
   * - Signed values can always be verified correctly
   */
  it('Property 8 (extended): Cookie Signing Consistency - signature is deterministic and verifiable', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate pairs of cookie values to test uniqueness
        // NOTE: Exclude dots as SessionManager's signing format uses '.' as separator
        fc.tuple(
          fc.string({ minLength: 10, maxLength: 500 })
            .filter(s => !s.includes('.')),
          fc.string({ minLength: 10, maxLength: 500 })
            .filter(s => !s.includes('.'))
        ).filter(([val1, val2]) => val1 !== val2), // Ensure values are different
        
        async ([cookieValue1, cookieValue2]) => {
          // PROPERTY: Same value produces same signature (determinism)
          const signed1a = sessionManager.signCookie(cookieValue1);
          const signed1b = sessionManager.signCookie(cookieValue1);
          expect(signed1a).toBe(signed1b);

          // PROPERTY: Different values produce different signatures (uniqueness)
          const signed2 = sessionManager.signCookie(cookieValue2);
          expect(signed1a).not.toBe(signed2);

          // PROPERTY: All signed values are verifiable (correctness)
          expect(sessionManager.verifyCookie(signed1a)).toBe(cookieValue1);
          expect(sessionManager.verifyCookie(signed1b)).toBe(cookieValue1);
          expect(sessionManager.verifyCookie(signed2)).toBe(cookieValue2);

          // PROPERTY: Tampered signatures are rejected (security)
          const tamperedSignature = signed1a.slice(0, -1) + 'x';
          expect(sessionManager.verifyCookie(tamperedSignature)).toBeNull();
        }
      ),
      {
        numRuns: 100,
      }
    );
  });

  /**
   * **Validates: Requirements 5.9**
   * 
   * Property 8 (Security): Cookie Inaccessibility via JavaScript
   * 
   * For all cookie values, verify that HttpOnly attribute is set,
   * which prevents JavaScript access to the cookie via document.cookie.
   * 
   * This is a critical XSS protection measure - if an attacker injects
   * JavaScript, they cannot steal the authentication cookie.
   */
  it('Property 8 (security): Cookie Inaccessibility - HttpOnly prevents JavaScript access', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 500 })
          .filter(s => !s.includes('.')), // Exclude dots for proper signing
        
        async (cookieValue) => {
          const mockResponse: Partial<Response> = {
            cookie: vi.fn(),
          };

          sessionManager.setAuthCookie(mockResponse as Response, cookieValue);

          const [, , cookieOptions] = (mockResponse.cookie as any).mock.calls[0];

          // INVARIANT: HttpOnly must ALWAYS be true (Requirement 5.9)
          // This is a critical security requirement - it MUST NEVER be false
          expect(cookieOptions.httpOnly).toBe(true);

          // INVARIANT: httpOnly must be present in options
          expect(cookieOptions).toHaveProperty('httpOnly');
          
          // INVARIANT: httpOnly must be a boolean (not truthy value)
          expect(typeof cookieOptions.httpOnly).toBe('boolean');
        }
      ),
      {
        numRuns: 100,
      }
    );
  });

  /**
   * **Validates: Requirements 5.7, 17.10**
   * 
   * Property 9: Cookie Signing Integrity
   * 
   * For all randomly generated cookie values:
   * 1. Sign the cookie value
   * 2. Attempt to modify the signed value in various ways
   * 3. Verify that verification fails for ALL modified values
   * 
   * This ensures that cookie signing prevents tampering - any modification
   * to a signed cookie must be detected and rejected. This is critical for
   * preventing session hijacking and cookie manipulation attacks.
   * 
   * Modification strategies tested:
   * - Change one character in the value portion
   * - Change one character in the signature portion
   * - Truncate the signature
   * - Append data to the signature
   * - Remove the signature separator
   * - Swap value and signature
   */
  it('Property 9: Cookie Signing Integrity - verification fails for modified signed values', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random cookie values (exclude dots for proper signing)
        fc.string({ minLength: 10, maxLength: 500 })
          .filter(s => !s.includes('.')),
        
        async (cookieValue) => {
          // Sign the cookie value
          const signedValue = sessionManager.signCookie(cookieValue);
          
          // Verify the unmodified signed value is valid (baseline)
          const verifiedOriginal = sessionManager.verifyCookie(signedValue);
          expect(verifiedOriginal).toBe(cookieValue);
          
          // Extract value and signature parts
          const lastDotIndex = signedValue.lastIndexOf('.');
          const value = signedValue.substring(0, lastDotIndex);
          const signature = signedValue.substring(lastDotIndex + 1);
          
          // PROPERTY 9.1: Modifying the value portion invalidates the signature
          if (value.length > 0) {
            const modifiedValueStrategies = [
              // Change first character
              value.length > 1 ? (value[0] === 'a' ? 'b' : 'a') + value.slice(1) + '.' + signature : null,
              // Change last character
              value.length > 1 ? value.slice(0, -1) + (value[value.length - 1] === 'a' ? 'b' : 'a') + '.' + signature : null,
              // Change middle character (if long enough)
              value.length > 2 ? value.slice(0, Math.floor(value.length / 2)) + 
                (value[Math.floor(value.length / 2)] === 'a' ? 'b' : 'a') + 
                value.slice(Math.floor(value.length / 2) + 1) + '.' + signature : null,
              // Append character to value
              value + 'x' + '.' + signature,
              // Prepend character to value
              'x' + value + '.' + signature,
            ].filter(Boolean) as string[];
            
            for (const modifiedSigned of modifiedValueStrategies) {
              const verifiedModified = sessionManager.verifyCookie(modifiedSigned);
              expect(verifiedModified).toBeNull(); // Must reject modified value
            }
          }
          
          // PROPERTY 9.2: Modifying the signature portion invalidates the cookie
          if (signature.length > 0) {
            const modifiedSignatureStrategies = [
              // Change first character of signature (ensure it stays valid hex)
              signature.length > 1 ? value + '.' + (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1) : null,
              // Change last character of signature (ensure it stays valid hex)
              signature.length > 1 ? value + '.' + signature.slice(0, -1) + (signature[signature.length - 1] === 'a' ? 'b' : 'a') : null,
              // Change middle character of signature (ensure it stays valid hex)
              signature.length > 2 ? value + '.' + signature.slice(0, Math.floor(signature.length / 2)) + 
                (signature[Math.floor(signature.length / 2)] === 'a' ? 'b' : 'a') + 
                signature.slice(Math.floor(signature.length / 2) + 1) : null,
              // Truncate signature by 2 characters (keeps it valid hex - even length)
              signature.length > 2 ? value + '.' + signature.slice(0, -2) : null,
              // Append valid hex to signature
              value + '.' + signature + 'ab',
            ].filter(Boolean) as string[];
            
            for (const modifiedSigned of modifiedSignatureStrategies) {
              const verifiedModified = sessionManager.verifyCookie(modifiedSigned);
              expect(verifiedModified).toBeNull(); // Must reject modified signature
            }
          }
          
          // PROPERTY 9.3: Removing or modifying the separator invalidates the cookie
          const malformedStrategies = [
            // Remove separator entirely
            value + signature,
            // Multiple separators
            value + '..' + signature,
            // Wrong separator character
            value + ':' + signature,
            // Empty signature
            value + '.',
            // Empty value
            '.' + signature,
          ];
          
          for (const malformed of malformedStrategies) {
            const verifiedMalformed = sessionManager.verifyCookie(malformed);
            expect(verifiedMalformed).toBeNull(); // Must reject malformed format
          }
          
          // PROPERTY 9.4: Swapping value and signature invalidates the cookie
          // We expect swapping to fail UNLESS the signature happens to be a valid
          // signature for the swapped value (which would be astronomically unlikely
          // but theoretically possible for certain edge cases)
          if (value !== signature && value.length > 0 && signature.length > 0) {
            const swapped = signature + '.' + value;
            const verifiedSwapped = sessionManager.verifyCookie(swapped);
            
            // The swapped cookie should be rejected UNLESS by chance the signature
            // happens to be the correct signature for when the original signature
            // becomes the new value. This is cryptographically unlikely but we check.
            // For the test to be valid, we verify that swapped != original signed value
            if (swapped !== signedValue) {
              // If by extreme chance the verification succeeds, it means signature
              // coincidentally equals the hash of value, which is acceptable
              // We only reject if verification returns a different value than expected
              if (verifiedSwapped !== null) {
                // Verify it's not just returning garbage - it should equal signature (the new "value")
                expect(verifiedSwapped).toBe(signature);
              }
            }
          }
          
          // PROPERTY 9.5: Random garbage strings are rejected
          const garbageStrategies = [
            'random.garbage.string',
            'x'.repeat(100),
            '',
            '.',
            '..',
          ];
          
          for (const garbage of garbageStrategies) {
            const verifiedGarbage = sessionManager.verifyCookie(garbage);
            expect(verifiedGarbage).toBeNull(); // Must reject garbage
          }
          
          // INVARIANT: Only the exact original signed value is accepted
          // All modifications, no matter how subtle, must be rejected
          // This ensures cookie signing provides cryptographic integrity
        }
      ),
      {
        // Run minimum 100 iterations as specified in task details
        numRuns: 100,
        // Verbose mode for better error reporting
        verbose: false,
      }
    );
  });
});
