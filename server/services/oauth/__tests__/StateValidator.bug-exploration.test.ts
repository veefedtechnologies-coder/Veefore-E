import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { StateValidator } from '../StateValidator';

/**
 * Bug Exploration Property-Based Test for StateValidator Race Condition
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The OAuth callback endpoint has a fragile ordering dependency where validateState()
 * MUST be called AFTER getCodeVerifier() because validateState() deletes the OAuth session.
 * If code is refactored to call validateState() first, the code verifier will be lost,
 * causing authentication to fail.
 * 
 * Current Code (auth.ts line 174-181):
 *   const codeVerifier = stateValidator.getCodeVerifier(req);  // Called FIRST
 *   stateValidator.validateState(req, receivedState);          // Called SECOND
 * 
 * Bug Condition (if refactored):
 *   stateValidator.validateState(req, receivedState);          // Deletes session
 *   const codeVerifier = stateValidator.getCodeVerifier(req);  // Returns null - BUG!
 * 
 * Requirements tested: 1.1, 1.2, 2.1, 2.2
 */

describe('StateValidator - Bug Exploration: Race Condition in Callback Refactoring', () => {
  const validator = new StateValidator();

  /**
   * Property 1: Bug Condition - Race Condition in /callback Endpoint
   * 
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   * 
   * This property tests the concrete scenario where validateState() is called before
   * getCodeVerifier(). This simulates a refactoring where the developer reorders the
   * operations in the callback endpoint.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - When validateState() is called first, it should return both validation result
   *   AND code_verifier atomically
   * - Code verifier should be available without requiring a separate getCodeVerifier() call
   * - Order of operations should not matter for correctness
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - validateState() deletes the OAuth session (line 154 in StateValidator.ts)
   * - getCodeVerifier() returns null because session was already deleted
   * - Authentication fails because code verifier is missing
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - Atomic state validation must provide code_verifier without order dependency', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate valid OAuth session data
          state: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          codeVerifier: fc.string({ minLength: 43, maxLength: 128 }),
        }),
        ({ state, codeVerifier }) => {
          // SCENARIO 1: Current implementation (working order)
          // This tests the CURRENT code order in auth.ts (line 174-181)
          const mockReq1: any = {
            session: {},
            correlationId: 'test-scenario-1-current-order',
          };

          const now = Date.now();
          const tenMinutesMs = 10 * 60 * 1000;
          
          mockReq1.session.oauth = {
            state,
            codeVerifier,
            createdAt: now,
            expiresAt: now + tenMinutesMs,
            correlationId: 'test-scenario-1',
          };

          // Current order: getCodeVerifier FIRST, validateState SECOND
          const codeVerifier1 = validator.getCodeVerifier(mockReq1);
          const validationResult1 = validator.validateState(mockReq1, state);

          // Verify current implementation works
          expect(codeVerifier1).toBe(codeVerifier);
          expect(validationResult1.isValid).toBe(true);
          expect(validationResult1.codeVerifier).toBe(codeVerifier);

          // SCENARIO 2: Refactored implementation (bug-triggering order)
          // This tests what happens if code is refactored to call validateState FIRST
          const mockReq2: any = {
            session: {},
            correlationId: 'test-scenario-2-refactored-order',
          };

          mockReq2.session.oauth = {
            state,
            codeVerifier,
            createdAt: now,
            expiresAt: now + tenMinutesMs,
            correlationId: 'test-scenario-2',
          };

          // Refactored order: validateState FIRST, getCodeVerifier SECOND
          const validationResult2 = validator.validateState(mockReq2, state);

          // FIXED BEHAVIOR: validateState now returns both validation result and code_verifier atomically
          // The code verifier is available in the validation result, no need for separate getCodeVerifier call
          const codeVerifier2 = validationResult2.codeVerifier;

          // EXPECTED BEHAVIOR (after fix): Code verifier should be available
          // This assertion now PASSES because validateState returns code_verifier atomically
          expect(codeVerifier2).toBe(codeVerifier);
          expect(validationResult2.isValid).toBe(true);

          // The fix implements the atomic operation design:
          // interface StateValidationResult {
          //   isValid: boolean;
          //   codeVerifier: string | null;
          //   error?: string;
          // }
          // 
          // This ensures code verifier is retrievable regardless of call order,
          // providing atomic operation semantics and eliminating race conditions

          return true;
        }
      ),
      {
        numRuns: 100, // Test with 100 different OAuth sessions
        verbose: true,
      }
    );
  });

  /**
   * Additional Bug Documentation Property
   * 
   * This property documents the exact failure mode and counterexamples.
   * It verifies that the current code has an order dependency that breaks atomicity.
   */
  it('PROPERTY: Bug Documentation - validateState() has side effect that breaks getCodeVerifier()', () => {
    fc.assert(
      fc.property(
        fc.record({
          state: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          codeVerifier: fc.string({ minLength: 43, maxLength: 128 }),
        }),
        ({ state, codeVerifier }) => {
          const mockReq: any = {
            session: {},
            correlationId: 'test-side-effect',
          };

          const now = Date.now();
          const tenMinutesMs = 10 * 60 * 1000;
          
          mockReq.session.oauth = {
            state,
            codeVerifier,
            createdAt: now,
            expiresAt: now + tenMinutesMs,
            correlationId: 'test',
          };

          // Verify session exists before validation
          expect(mockReq.session.oauth).toBeDefined();
          expect(mockReq.session.oauth.codeVerifier).toBe(codeVerifier);

          // Call validateState - this now returns both validation result and code_verifier atomically
          const validationResult = validator.validateState(mockReq, state);

          // FIXED: Session is now deleted (as before), but code_verifier was retrieved atomically
          expect(mockReq.session.oauth).toBeUndefined();

          // FIXED: Code verifier is available from the validation result
          expect(validationResult.isValid).toBe(true);
          expect(validationResult.codeVerifier).toBe(codeVerifier);

          // Calling getCodeVerifier still returns null (session deleted), but this is now expected
          // because the atomic API provides code_verifier in the validation result
          const retrievedCodeVerifier = validator.getCodeVerifier(mockReq);
          expect(retrievedCodeVerifier).toBeNull();

          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });

  /**
   * Additional Property: Non-Atomic API Design
   * 
   * This property demonstrates that the current API requires consumers to know
   * about internal implementation details (session deletion timing), which is
   * a violation of encapsulation and atomic operation principles.
   */
  it('PROPERTY: Current API design lacks atomicity - forces caller to know implementation details', () => {
    fc.assert(
      fc.property(
        fc.record({
          state: fc.array(
            fc.integer({ min: 0, max: 15 }).map(n => n.toString(16)),
            { minLength: 64, maxLength: 64 }
          ).map(arr => arr.join('')),
          codeVerifier: fc.string({ minLength: 43, maxLength: 128 }),
        }),
        ({ state, codeVerifier }) => {
          const mockReq: any = {
            session: {},
            correlationId: 'test-atomicity',
          };

          const now = Date.now();
          const tenMinutesMs = 10 * 60 * 1000;
          
          mockReq.session.oauth = {
            state,
            codeVerifier,
            createdAt: now,
            expiresAt: now + tenMinutesMs,
            correlationId: 'test',
          };

          // The ideal atomic operation would be:
          // const result = validator.validateState(req, state);
          // return result.isValid && result.codeVerifier
          // 
          // This returns BOTH validation status AND code verifier in one call,
          // eliminating the order dependency and race condition vulnerability.
          // 
          // Fixed interface:
          // interface StateValidationResult {
          //   isValid: boolean;
          //   codeVerifier: string | null;
          //   error?: string;
          // }

          // Test that both pieces of data can be retrieved atomically
          // In the fixed version, validateState returns BOTH values
          const validationResult = validator.validateState(mockReq, state);

          // FIXED: Both validation status and code_verifier available atomically
          expect(validationResult.isValid).toBe(true);
          expect(validationResult.codeVerifier).toBe(codeVerifier);

          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });
});
