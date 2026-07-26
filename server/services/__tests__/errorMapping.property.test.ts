import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapMetaErrorToUserMessage, rateLimitConfig } from '../../config/rateLimitConfig';

/**
 * Property-Based Tests for Error Code Mapping
 *
 * Property 10: Error Code Mapping Produces User-Friendly Messages
 *
 * For any Meta API error code (including 80002, 429, and all other mapped codes),
 * the error mapping function shall produce a non-empty, plain-language message that
 * does not contain the numeric error code, HTTP status code, or Meta's raw error string.
 *
 * **Validates: Requirements 8.5, 8.8**
 */

// ---------------------------------------------------------------------------
// Constants: Meta-specific strings that must never appear in user messages
// ---------------------------------------------------------------------------

const META_ERROR_STRINGS = [
  'OAuthException',
  'GraphMethodException',
  'GraphException',
  'ApiException',
  'FacebookApiException',
  'IGApiException',
  'InstagramApiException',
  'OAuthError',
  'GraphError',
  'API Error',
  'error_code',
  'error_subcode',
  'fbtrace_id',
];

const HTTP_STATUS_CODES = [
  '400', '401', '403', '404', '405', '408',
  '429', '500', '502', '503', '504',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a string contains ALL_CAPS words longer than 3 characters.
 * This detects technical identifiers like "HTTP", "API", "BUC", "OAUTH" etc.
 * Common plain-language words are excluded.
 */
function containsAllCapsWord(message: string): boolean {
  // Match words of 4+ characters that are entirely uppercase
  const allCapsPattern = /\b[A-Z]{4,}\b/g;
  const matches = message.match(allCapsPattern);
  if (!matches) return false;

  // Allow common plain-language acronyms that are acceptable in user messages
  const allowedAcronyms = new Set(['ASAP', 'INFO', 'OKAY', 'NOTE']);
  return matches.some((match) => !allowedAcronyms.has(match));
}

/**
 * Checks if a string contains camelCase identifiers (e.g., "errorCode", "apiLimit").
 */
function containsCamelCase(message: string): boolean {
  // Matches words starting with lowercase followed by an uppercase letter
  const camelCasePattern = /\b[a-z]+[A-Z][a-zA-Z]*\b/;
  return camelCasePattern.test(message);
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: instagram-rate-limit-architecture, Property 10: Error Code Mapping Produces User-Friendly Messages', () => {
  describe('Property 10.1: All known error codes produce non-empty, plain-language messages', () => {
    const knownCodes = Object.keys(rateLimitConfig.errorMessageMap).filter((k) => k !== 'default');

    it('every mapped code produces a non-empty string', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...knownCodes),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            expect(message).toBeTruthy();
            expect(message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no mapped message contains the numeric error code itself', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...knownCodes),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            // The numeric code should not appear as a standalone word/token in the message
            const codePattern = new RegExp(`\\b${code}\\b`);
            expect(codePattern.test(message)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no mapped message contains Meta-specific error strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...knownCodes),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            for (const metaStr of META_ERROR_STRINGS) {
              expect(message.toLowerCase()).not.toContain(metaStr.toLowerCase());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no mapped message contains HTTP status codes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...knownCodes),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            for (const statusCode of HTTP_STATUS_CODES) {
              const statusPattern = new RegExp(`\\b${statusCode}\\b`);
              expect(statusPattern.test(message)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no mapped message contains ALL_CAPS words > 3 chars or camelCase identifiers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...knownCodes),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            expect(containsAllCapsWord(message)).toBe(false);
            expect(containsCamelCase(message)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10.2: Arbitrary string/number codes always return a non-empty string (default fallback)', () => {
    it('arbitrary string codes always produce a non-empty message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            expect(message).toBeTruthy();
            expect(typeof message).toBe('string');
            expect(message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('arbitrary number codes always produce a non-empty message', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          (code) => {
            const message = mapMetaErrorToUserMessage(code);
            expect(message).toBeTruthy();
            expect(typeof message).toBe('string');
            expect(message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Property 10.3: No message contains HTTP status codes', () => {
    it('messages for any error code never contain HTTP status code patterns', () => {
      // Generate both known codes and random codes
      const allInputs = fc.oneof(
        fc.constantFrom(...Object.keys(rateLimitConfig.errorMessageMap)),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 99999 }).map(String)
      );

      fc.assert(
        fc.property(allInputs, (code) => {
          const message = mapMetaErrorToUserMessage(code);
          for (const statusCode of HTTP_STATUS_CODES) {
            const statusPattern = new RegExp(`\\b${statusCode}\\b`);
            expect(statusPattern.test(message)).toBe(false);
          }
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Property 10.4: Messages are plain language (no ALL_CAPS > 3 chars, no camelCase)', () => {
    it('messages for any error code are plain language without technical identifiers', () => {
      const allInputs = fc.oneof(
        fc.constantFrom(...Object.keys(rateLimitConfig.errorMessageMap)),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 99999 }).map(String)
      );

      fc.assert(
        fc.property(allInputs, (code) => {
          const message = mapMetaErrorToUserMessage(code);
          expect(containsAllCapsWord(message)).toBe(false);
          expect(containsCamelCase(message)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });
});
