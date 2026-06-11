import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { StateValidator, OAuthRequest } from '../StateValidator';

/**
 * Bug Exploration Property-Based Test for Concurrent OAuth Flow Protection
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * When a user opens multiple browser tabs and initiates OAuth in both simultaneously,
 * the second flow overwrites the first flow's session data (state, code_verifier),
 * causing state validation failures. There is no detection or prevention of concurrent
 * OAuth flows for the same session.
 * 
 * Current Code (server/services/oauth/StateValidator.ts):
 *   - storeState() simply overwrites req.session.oauth without checking
 *   - No tracking of in-progress OAuth flows
 *   - No detection of concurrent flow attempts
 *   - No cancellation or queuing of subsequent flows
 * 
 * Bug Condition:
 * 1. User opens Tab 1, clicks "Sign in with Google"
 *    - System calls storeState(req, state1, verifier1)
 *    - session.oauth = {state: state1, codeVerifier: verifier1, ...}
 * 
 * 2. User opens Tab 2, clicks "Sign in with Google" (while Tab 1 flow is in progress)
 *    - System calls storeState(req, state2, verifier2)
 *    - session.oauth = {state: state2, codeVerifier: verifier2, ...} (OVERWRITES Tab 1)
 * 
 * 3. OAuth provider redirects Tab 1 back with state1
 *    - System calls validateState(req, state1)
 *    - Validation fails: session.oauth.state is state2, not state1
 *    - User sees "Invalid state parameter" error
 * 
 * Expected Behavior (after fix):
 * - System should detect when a new OAuth flow starts while another is in progress
 * - Option 1: Cancel the old flow and start the new one
 * - Option 2: Reject the new flow and keep the old one active
 * - Option 3: Queue the new flow and process it after the old one completes/expires
 * - Second flow should either throw an error or cancel the first flow safely
 * - No silent data corruption where session data is overwritten
 * 
 * Requirements tested: 1.14, 1.15, 2.14, 2.15
 * 
 * **Validates: Requirements 1.14, 1.15, 2.14, 2.15**
 */

describe('OAuth StateValidator - Bug Exploration: No Concurrent Flow Protection', () => {
  let validator: StateValidator;

  beforeEach(() => {
    validator = new StateValidator();
  });

  /**
   * PROPERTY 1: Bug Condition - No Concurrent Flow Protection
   * 
   * This property-based test simulates concurrent OAuth flows where storeState
   * is called twice in quick succession for the same session.
   * 
   * Test Strategy:
   * 1. Generate two sets of OAuth parameters (state1, verifier1) and (state2, verifier2)
   * 2. Simulate Tab 1: storeState(state1, verifier1)
   * 3. Simulate Tab 2: storeState(state2, verifier2) - concurrent flow
   * 4. Simulate Tab 1 callback: validateState(state1)
   * 
   * Expected Behavior (after fix):
   * - System should detect concurrent flow and either:
   *   a) Throw error on second storeState call, OR
   *   b) Cancel first flow and track that it was cancelled, OR
   *   c) Preserve first flow and reject second flow
   * - Either way, first flow should be able to validate successfully OR get clear error
   * 
   * Bug Behavior (current - unfixed code):
   * - Second storeState silently overwrites first flow's session data
   * - First flow's validateState fails with "Invalid state parameter"
   * - This test will FAIL on unfixed code, confirming the bug exists
   * 
   * This test is EXPECTED TO FAIL on unfixed code. The failure confirms the bug exists.
   */
  it('PROPERTY 1: Bug Condition - Second concurrent flow overwrites first flow session data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // First OAuth flow (Tab 1)
          state1: fc.string({ minLength: 32, maxLength: 64 }),
          verifier1: fc.string({ minLength: 43, maxLength: 128 }),
          
          // Second OAuth flow (Tab 2) - concurrent
          state2: fc.string({ minLength: 32, maxLength: 64 }),
          verifier2: fc.string({ minLength: 43, maxLength: 128 }),
          
          // Ensure states are different (concurrent flows)
        }).filter(({ state1, state2 }) => state1 !== state2),
        
        async ({ state1, verifier1, state2, verifier2 }) => {
          // Shared session - simulates the same user session across tabs
          const mockReq = createMockRequest();
          
          // TAB 1: User initiates OAuth flow in first tab
          validator.storeState(mockReq, state1, verifier1);
          
          // Verify Tab 1's session is stored correctly
          expect(mockReq.session.oauth).toBeDefined();
          expect(mockReq.session.oauth?.state).toBe(state1);
          expect(mockReq.session.oauth?.codeVerifier).toBe(verifier1);
          
          // TAB 2: User initiates OAuth flow in second tab (CONCURRENT)
          // Expected behavior after fix: This should either:
          // - Throw an error indicating concurrent flow detected, OR
          // - Cancel the first flow and allow the second, OR
          // - Reject the second flow and preserve the first
          
          // Bug behavior (current): Silently overwrites first flow
          try {
            validator.storeState(mockReq, state2, verifier2);
            
            // If we reach here, no error was thrown (bug behavior)
            // The second storeState was allowed without any protection
            
            // Verify that session was overwritten (confirming bug)
            expect(mockReq.session.oauth?.state).toBe(state2);
            expect(mockReq.session.oauth?.codeVerifier).toBe(verifier2);
            
          } catch (error) {
            // If storeState throws an error, concurrent flow protection is working
            // This is the EXPECTED behavior after fix
            if (error instanceof Error && error.message.includes('concurrent')) {
              // Fix is applied - concurrent flow was detected and prevented
              return; // Test passes (bug is fixed)
            }
            throw error; // Unexpected error
          }
          
          // TAB 1 CALLBACK: OAuth provider redirects Tab 1 back with state1
          // Expected behavior after fix: Should validate successfully or give clear error
          // Bug behavior (current): Validation fails because session has state2
          
          try {
            validator.validateState(mockReq, state1);
            
            // If validation succeeds, either:
            // 1. Fix is applied (concurrent flow was prevented from overwriting)
            // 2. System properly tracked both flows and can validate both
            // This means the bug is FIXED
            // Test should FAIL on unfixed code and PASS after fix
            throw new Error('BUG NOT DETECTED: First flow validated successfully after second flow started. This indicates concurrent flow protection is working.');
            
          } catch (error) {
            if (error instanceof Error) {
              if (error.message.includes('Invalid state parameter')) {
                // BUG DETECTED: First flow's state was overwritten by second flow
                // This is the CURRENT BEHAVIOR on unfixed code
                // The test assertion should FAIL here, proving the bug exists
                throw new Error(
                  `BUG DETECTED: Concurrent OAuth flow corruption. ` +
                  `First flow (state: ${state1.substring(0, 8)}...) failed validation ` +
                  `because second flow (state: ${state2.substring(0, 8)}...) overwrote session data. ` +
                  `Session should either reject concurrent flows or handle them safely.`
                );
              }
              // Re-throw other errors
              throw error;
            }
          }
        }
      ),
      {
        numRuns: 100, // Run 100 iterations to ensure consistent behavior
        verbose: true, // Show detailed output on failure
      }
    );
  });

  /**
   * PROPERTY 2: Bug Condition - Multiple concurrent flows corrupt session state
   * 
   * This property extends the test to simulate MORE than 2 concurrent flows,
   * demonstrating that each subsequent flow overwrites the previous one.
   * 
   * Expected behavior after fix: System should prevent or safely handle multiple concurrent flows
   * Bug behavior (current): Each flow overwrites the previous, causing all but last to fail
   */
  it('PROPERTY 2: Bug Condition - Multiple concurrent flows all overwrite session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            state: fc.string({ minLength: 32, maxLength: 64 }),
            verifier: fc.string({ minLength: 43, maxLength: 128 }),
          }),
          { minLength: 3, maxLength: 5 } // 3-5 concurrent flows
        ).chain((flows) => {
          // Ensure all states are unique (different concurrent flows)
          const states = flows.map(f => f.state);
          const uniqueStates = new Set(states);
          if (uniqueStates.size !== states.length) {
            // Regenerate if states aren't unique
            return fc.array(
              fc.record({
                state: fc.string({ minLength: 32, maxLength: 64 }),
                verifier: fc.string({ minLength: 43, maxLength: 128 }),
              }),
              { minLength: 3, maxLength: 5 }
            );
          }
          return fc.constant(flows);
        }),
        
        async (flows) => {
          const mockReq = createMockRequest();
          
          // Simulate N concurrent OAuth flows (multiple tabs/windows)
          flows.forEach(({ state, verifier }) => {
            // Bug behavior: Each storeState silently overwrites the previous
            validator.storeState(mockReq, state, verifier);
          });
          
          // Bug verification: Only the LAST flow's session data is preserved
          const lastFlow = flows[flows.length - 1];
          expect(mockReq.session.oauth?.state).toBe(lastFlow.state);
          
          // Attempt to validate ALL PREVIOUS flows (all but the last)
          const previousFlows = flows.slice(0, -1);
          let failedValidations = 0;
          
          for (const { state } of previousFlows) {
            try {
              validator.validateState(mockReq, state);
              // If validation succeeds, bug is fixed
              throw new Error(
                `BUG NOT DETECTED: Previous flow validated successfully. ` +
                `Expected ${previousFlows.length} flows to fail, but flow with state ` +
                `${state.substring(0, 8)}... succeeded.`
              );
            } catch (error) {
              if (error instanceof Error && error.message.includes('Invalid state parameter')) {
                // Bug behavior: Previous flows fail validation
                failedValidations++;
              } else {
                throw error;
              }
            }
          }
          
          // BUG DETECTION: All previous flows should have failed
          if (failedValidations === previousFlows.length) {
            throw new Error(
              `BUG DETECTED: All ${failedValidations} previous flows failed validation ` +
              `because they were overwritten by subsequent flows. System should prevent ` +
              `concurrent flows or handle them safely.`
            );
          }
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });

  /**
   * PROPERTY 3: Bug Condition - Rapid successive storeState calls (race condition)
   * 
   * This property tests rapid succession calls, simulating double-click scenarios.
   * Bug behavior: Second call immediately overwrites first without any protection.
   */
  it('PROPERTY 3: Bug Condition - Rapid storeState calls create race condition', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          flow1: fc.record({
            state: fc.string({ minLength: 32, maxLength: 64 }),
            verifier: fc.string({ minLength: 43, maxLength: 128 }),
          }),
          flow2: fc.record({
            state: fc.string({ minLength: 32, maxLength: 64 }),
            verifier: fc.string({ minLength: 43, maxLength: 128 }),
          }),
        }).filter(({ flow1, flow2 }) => flow1.state !== flow2.state),
        
        async ({ flow1, flow2 }) => {
          const mockReq = createMockRequest();
          
          // Simulate RAPID concurrent calls (no await, no delay)
          validator.storeState(mockReq, flow1.state, flow1.verifier);
          validator.storeState(mockReq, flow2.state, flow2.verifier);
          
          // Bug verification: Second call overwrites first
          expect(mockReq.session.oauth?.state).toBe(flow2.state);
          
          // Attempt to validate first flow
          try {
            validator.validateState(mockReq, flow1.state);
            throw new Error(
              'BUG NOT DETECTED: First flow validated after being overwritten by second flow'
            );
          } catch (error) {
            if (error instanceof Error && error.message.includes('Invalid state parameter')) {
              // BUG DETECTED: Race condition caused first flow to fail
              throw new Error(
                `BUG DETECTED: Race condition in rapid storeState calls. ` +
                `First flow (${flow1.state.substring(0, 8)}...) was overwritten by ` +
                `second flow (${flow2.state.substring(0, 8)}...) without any protection.`
              );
            }
            throw error;
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * PROPERTY 4: Bug Condition - No warning or error when overwriting active flow
   * 
   * This property verifies that the system provides NO feedback when overwriting
   * an active OAuth flow, making the bug silent and difficult to diagnose.
   */
  it('PROPERTY 4: Bug Condition - Silent session corruption without warning', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          state1: fc.string({ minLength: 32, maxLength: 64 }),
          verifier1: fc.string({ minLength: 43, maxLength: 128 }),
          state2: fc.string({ minLength: 32, maxLength: 64 }),
          verifier2: fc.string({ minLength: 43, maxLength: 128 }),
        }).filter(({ state1, state2 }) => state1 !== state2),
        
        async ({ state1, verifier1, state2, verifier2 }) => {
          const mockReq = createMockRequest();
          
          // Store first flow - no error expected
          validator.storeState(mockReq, state1, verifier1);
          const firstState = mockReq.session.oauth?.state;
          
          // Store second flow - Bug: No error or warning
          let errorThrown = false;
          try {
            validator.storeState(mockReq, state2, verifier2);
          } catch (error) {
            errorThrown = true;
            // If error is thrown, concurrent flow protection is working
            if (error instanceof Error && error.message.includes('concurrent')) {
              return; // Fix is applied
            }
            throw error;
          }
          
          // BUG DETECTION: Second storeState succeeded without error
          if (!errorThrown) {
            // Verify silent corruption occurred
            const sessionCorrupted = mockReq.session.oauth?.state !== firstState;
            const firstFlowWillFail = mockReq.session.oauth?.state === state2;
            
            if (sessionCorrupted && firstFlowWillFail) {
              throw new Error(
                `BUG DETECTED: Silent session corruption. ` +
                `Second storeState (${state2.substring(0, 8)}...) silently ` +
                `overwrote first flow (${state1.substring(0, 8)}...) without ` +
                `throwing any error or warning. System should detect and ` +
                `prevent/handle concurrent flows.`
              );
            }
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});

/**
 * Helper function to create a mock Express request with session
 */
function createMockRequest(): OAuthRequest {
  return {
    session: {
      oauth: undefined,
    },
    correlationId: undefined,
  } as OAuthRequest;
}
