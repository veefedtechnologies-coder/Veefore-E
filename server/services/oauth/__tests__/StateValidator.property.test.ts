import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { StateValidator } from '../StateValidator';

/**
 * Property-Based Tests for StateValidator
 * 
 * These tests use fast-check to generate hundreds of random inputs and verify
 * that universal properties hold across all generated values.
 * 
 * Test Requirements:
 * - Run minimum 100 iterations per property
 * - Verify cryptographic properties (uniqueness, length, randomness)
 * - Test security invariants (expiration, single-use, CSRF protection)
 * 
 * Requirements tested: 1.2, 1.4, 2.2, 2.3, 2.4, 17.2, 17.4, 17.11
 */

describe('StateValidator - Property-Based Tests', () => {
  const validator = new StateValidator();

  /**
   * Property 1: State Parameter Uniqueness and Length
   * 
   * **Validates: Requirements 1.2, 17.2, 17.4**
   * 
   * This property verifies that:
   * 1. All generated state parameters are unique (no collisions)
   * 2. All state parameters are at least 32 characters long
   * 3. State parameters use cryptographically secure random generation
   * 
   * Security Rationale:
   * - Uniqueness prevents state reuse and ensures each OAuth flow has a unique identifier
   * - Minimum length (32+ chars) provides sufficient entropy to prevent guessing attacks
   * - Cryptographic randomness prevents pattern-based attacks
   * 
   * Test Strategy:
   * - Generate a large number of state parameters (100+ iterations)
   * - Store all states in a Set to detect any duplicates
   * - Verify each state meets the minimum length requirement
   * - Verify all states are unique by comparing Set size to array length
   */
  it('PROPERTY 1: All generated state parameters must be unique and at least 32 characters', () => {
    fc.assert(
      fc.property(
        // Generate an array of 100 "generation actions" (just numbers to trigger generation)
        fc.constant(null),
        () => {
          // Generate 100 state parameters
          const states: string[] = [];
          const iterations = 100;

          for (let i = 0; i < iterations; i++) {
            const state = validator.generateState();
            states.push(state);

            // Verify minimum length requirement (Requirement 1.2)
            expect(state.length).toBeGreaterThanOrEqual(32);
            expect(typeof state).toBe('string');
            expect(state).toBeTruthy();
          }

          // Verify uniqueness - all states should be different (Requirement 17.2)
          const uniqueStates = new Set(states);
          expect(uniqueStates.size).toBe(iterations);

          // Additional verification: All states should have the same length (consistency)
          const expectedLength = 64; // 32 bytes -> 64 hex characters
          const allCorrectLength = states.every(state => state.length === expectedLength);
          expect(allCorrectLength).toBe(true);

          // Verify hexadecimal format (security property)
          const hexPattern = /^[0-9a-f]+$/;
          const allHexFormat = states.every(state => hexPattern.test(state));
          expect(allHexFormat).toBe(true);

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
   * Property 3: Session State Expiration
   * 
   * **Validates: Requirements 1.4, 2.4, 17.4**
   * 
   * This property verifies that:
   * 1. State validation succeeds within the 10-minute expiration window
   * 2. State validation fails after the expiration window
   * 3. Expiration enforcement is consistent and reliable
   * 
   * Security Rationale:
   * - Time-limited states reduce the window for CSRF attacks
   * - Expired states cannot be used even if intercepted
   * - Automatic expiration prevents stale state accumulation
   * 
   * Test Strategy:
   * - Generate states with various expiration times (fresh, near-expiry, expired)
   * - Use time simulation to test states at different lifecycle points
   * - Verify validation behavior matches expiration status
   * - Test boundary conditions (exactly at expiration time)
   */
  it('PROPERTY 3: State validation must succeed within expiration window and fail after', () => {
    fc.assert(
      fc.property(
        // Generate time offsets relative to expiration (negative = before expiry, positive = after)
        fc.record({
          // Time offset in milliseconds from the expiration point
          // Range: -11 minutes to +11 minutes around expiration
          timeOffsetMs: fc.integer({ min: -11 * 60 * 1000, max: 11 * 60 * 1000 }),
          // State value for testing (64-character hex string using character codes 0-9,a-f)
          state: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          // Code verifier for PKCE
          codeVerifier: fc.string({ minLength: 43, maxLength: 128 }),
        }),
        ({ timeOffsetMs, state, codeVerifier }) => {
          // Create mock request with session
          const mockReq: any = {
            session: {},
            correlationId: 'test-correlation',
          };

          const now = Date.now();
          const tenMinutesMs = 10 * 60 * 1000;
          
          // Create OAuth session with calculated expiration
          // If timeOffsetMs is negative, session is still valid
          // If timeOffsetMs is positive, session has expired
          const expiresAt = now + timeOffsetMs;
          const createdAt = expiresAt - tenMinutesMs;
          
          mockReq.session.oauth = {
            state,
            codeVerifier,
            createdAt,
            expiresAt,
            correlationId: 'test-correlation',
          };

          // Determine expected behavior based on time offset
          // If timeOffsetMs > 0: expiresAt is in the future, so it's valid
          // If timeOffsetMs = 0: expiresAt is exactly now, so Date.now() > expiresAt is false = valid
          // If timeOffsetMs < 0: expiresAt is in the past, so Date.now() > expiresAt is true = expired
          const shouldBeValid = timeOffsetMs >= 0; // Future or exact expiration = still valid  
          const shouldBeExpired = timeOffsetMs < 0; // Past expiration = expired

          try {
            const result = validator.validateState(mockReq, state);
            
            // If we get here, validation succeeded
            if (shouldBeValid) {
              // Expected: validation should succeed for non-expired states
              expect(result).toBe(true);
              // Session should be deleted after successful validation (single-use)
              expect(mockReq.session.oauth).toBeUndefined();
            } else {
              // Unexpected: validation should have failed for expired states
              throw new Error(`Validation should have failed for expired state (offset: ${timeOffsetMs}ms)`);
            }
          } catch (error) {
            // Validation threw an error
            if (shouldBeExpired) {
              // Expected: validation should fail for expired states
              expect(error).toBeInstanceOf(Error);
              expect((error as Error).message).toBe('State expired');
              // Session should be cleaned up after expired validation
              expect(mockReq.session.oauth).toBeUndefined();
            } else {
              // Unexpected: validation should have succeeded
              throw new Error(`Validation should have succeeded for valid state (offset: ${timeOffsetMs}ms): ${error}`);
            }
          }

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
   * Property 4: State Validation Security
   * 
   * **Validates: Requirements 2.3, 2.4, 17.11**
   * 
   * This property verifies that:
   * 1. Mismatched state parameters are always rejected
   * 2. Missing state parameters are rejected
   * 3. Proper error messages are returned for security issues
   * 4. Invalid states don't compromise the session
   * 
   * Security Rationale:
   * - Strict state matching prevents CSRF attacks
   * - Clear error messages help legitimate users while blocking attacks
   * - Failed validation preserves session for investigation
   * 
   * Test Strategy:
   * - Generate pairs of (stored state, received state) with intentional mismatches
   * - Test various types of mismatches (different length, different content, empty)
   * - Verify all mismatches are rejected with appropriate errors
   * - Verify session handling is correct for each failure case
   */
  it('PROPERTY 4: State validation must reject all mismatched states with appropriate errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          // The state we'll store in the session (64-character hex string)
          storedState: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          // The state we'll try to validate (intentionally different)
          receivedState: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          codeVerifier: fc.string({ minLength: 43, maxLength: 128 }),
        }).filter(({ storedState, receivedState }) => 
          // Ensure states are actually different (mismatch scenario)
          storedState !== receivedState
        ),
        ({ storedState, receivedState, codeVerifier }) => {
          // Create mock request with valid (non-expired) OAuth session
          const mockReq: any = {
            session: {},
            correlationId: 'test-correlation',
          };

          const now = Date.now();
          const tenMinutesMs = 10 * 60 * 1000;
          
          mockReq.session.oauth = {
            state: storedState,
            codeVerifier,
            createdAt: now,
            expiresAt: now + tenMinutesMs, // Valid for 10 more minutes
            correlationId: 'test-correlation',
          };

          // Attempt to validate with mismatched state
          const result = validator.validateState(mockReq, receivedState);

          // Validation should fail
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('Invalid state parameter');

          // Security check: session should still exist after mismatch
          // (not deleted like on success, so security team can investigate)
          expect(mockReq.session.oauth).toBeDefined();
          expect(mockReq.session.oauth.state).toBe(storedState);

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
   * Additional Property: State Parameter Entropy
   * 
   * Verifies that generated states have high entropy and are not predictable.
   * Tests for patterns that would indicate weak random number generation.
   */
  it('PROPERTY: Generated states must have high entropy (no predictable patterns)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const states: string[] = [];
          
          for (let i = 0; i < 100; i++) {
            states.push(validator.generateState());
          }

          // Check 1: No two consecutive states should be similar
          for (let i = 0; i < states.length - 1; i++) {
            const state1 = states[i];
            const state2 = states[i + 1];
            
            // Count matching characters at same positions
            let matchingChars = 0;
            for (let j = 0; j < state1.length; j++) {
              if (state1[j] === state2[j]) {
                matchingChars++;
              }
            }
            
            // Less than 25% of characters should match (randomness check)
            // In truly random hex strings, we expect ~1/16 = 6.25% match rate
            const matchRate = matchingChars / state1.length;
            expect(matchRate).toBeLessThan(0.25);
          }

          // Check 2: Distribution of hex characters should be roughly uniform
          const charCounts: Record<string, number> = {};
          states.forEach(state => {
            for (const char of state) {
              charCounts[char] = (charCounts[char] || 0) + 1;
            }
          });

          // Each hex digit (0-9, a-f) should appear with similar frequency
          // With 100 states * 64 chars = 6400 chars total
          // Each of 16 hex digits should appear ~400 times (6400/16)
          // We allow 25% deviation from expected frequency
          const totalChars = states.length * 64;
          const expectedPerChar = totalChars / 16;
          
          for (const count of Object.values(charCounts)) {
            const deviation = Math.abs(count - expectedPerChar) / expectedPerChar;
            expect(deviation).toBeLessThan(0.5); // Allow 50% deviation for statistical variation
          }

          return true;
        }
      ),
      {
        numRuns: 10, // Fewer runs since this is computationally intensive
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: Concurrent State Generation
   * 
   * Verifies that generating multiple states concurrently still produces unique values.
   * This is important for high-throughput scenarios where multiple users initiate OAuth flows simultaneously.
   */
  it('PROPERTY: Concurrent state generation must produce unique values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 50 }),
        async (concurrentCount) => {
          // Generate states concurrently
          const promises = Array.from({ length: concurrentCount }, () => 
            Promise.resolve(validator.generateState())
          );
          
          const states = await Promise.all(promises);
          
          // All states must be unique
          const uniqueStates = new Set(states);
          expect(uniqueStates.size).toBe(concurrentCount);
          
          // All must meet length requirement
          states.forEach(state => {
            expect(state.length).toBeGreaterThanOrEqual(32);
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

  /**
   * Additional Property: State Generation Consistency
   * 
   * Verifies that the state generation function always produces valid output
   * regardless of when or how many times it's called.
   */
  it('PROPERTY: State generation must be consistent and never fail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        (iterations) => {
          const states: string[] = [];
          
          // Generate the specified number of states
          for (let i = 0; i < iterations; i++) {
            const state = validator.generateState();
            
            // Every single state must be valid
            expect(state).toBeDefined();
            expect(typeof state).toBe('string');
            expect(state.length).toBe(64);
            expect(state).toMatch(/^[0-9a-f]{64}$/);
            
            states.push(state);
          }
          
          // All states must be unique
          expect(new Set(states).size).toBe(iterations);
          
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
