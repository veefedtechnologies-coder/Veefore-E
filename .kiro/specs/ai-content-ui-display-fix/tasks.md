# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - AI Content State Update on Successful Response
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the response doesn't reach the state or UI
  - **Diagnostic Approach**: Add comprehensive console logging at each step of the data flow to identify where the response is lost
  - Add logging in `handleGenerateAI` immediately after `await apiRequest(...)`:
    - Log full response object: `console.log('[AI GENERATE DEBUG] Full response:', JSON.stringify(response, null, 2))`
    - Log response type: `console.log('[AI GENERATE DEBUG] Response type:', typeof response)`
    - Log success flag: `console.log('[AI GENERATE DEBUG] response.success:', response?.success)`
  - Add logging before `if (response.success)` block:
    - Log: `console.log('[AI GENERATE DEBUG] About to check response.success')`
  - Add logging inside `if (response.success)` block:
    - Log: `console.log('[AI GENERATE DEBUG] Inside success block, setting state with:', { caption: response.caption?.substring(0, 50), hashtagCount: response.hashtags?.length })`
  - Add logging in `setAiGeneratedData` using callback form:
    - Use: `setAiGeneratedData(prev => { console.log('[AI GENERATE DEBUG] State update callback, prev:', prev); return { caption: response.caption, ... }; })`
  - Trigger AI generation with test workspace ID `684402c2fd2cd4eb6521b386`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS - logs will show one of these patterns:
    - Pattern A: Response is undefined or null after `apiRequest`
    - Pattern B: Response exists but `response.success` is undefined/false despite backend success
    - Pattern C: Conditional block never executes (no "Inside success block" log)
    - Pattern D: State update callback never executes (no "State update callback" log)
  - Document the exact failure pattern found in logs
  - Mark task complete when diagnostic logging is added, test is run, and failure pattern is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Error Handling and Manual Content Entry
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Trigger 402 insufficient credits error on unfixed code - verify error toast appears and `aiGeneratedData` remains null
  - Observe: Trigger 503 service unavailable error on unfixed code - verify configuration error toast appears
  - Observe: Type caption manually in textarea on unfixed code - verify `postContent` state updates correctly
  - Observe: Manually set `aiGeneratedData` state and click "Apply AI Caption" on unfixed code - verify caption transfers to `postContent`
  - Write property-based tests capturing these observed behaviors:
    - Test 1: For any error response (status 400, 402, 500, 503), verify error toast is shown and `aiGeneratedData` remains null
    - Test 2: For any manual text input in caption textarea, verify `postContent` updates independently of AI state
    - Test 3: For any `aiGeneratedData` state with valid caption, verify "Apply AI Caption" transfers to `postContent`
    - Test 4: For any `aiGeneratedData` state with valid hashtags, verify "Apply AI Hashtags" appends to `hashtags` array
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix AI content UI display bug

  - [x] 3.1 Implement diagnostic logging and response verification
    - Add comprehensive logging in `handleGenerateAI` function (create-post.tsx, line ~449)
    - Log the full response immediately after `await apiRequest(...)`:
      ```typescript
      const response = await apiRequest('/api/v1/ai/generate-content', { ... });
      console.log('[AI GENERATE DEBUG] Full response:', JSON.stringify(response, null, 2));
      console.log('[AI GENERATE DEBUG] Response type:', typeof response);
      console.log('[AI GENERATE DEBUG] response.success:', response?.success);
      ```
    - Add defensive response validation before accessing properties:
      ```typescript
      if (!response) {
        console.error('[AI GENERATE ERROR] Empty response received');
        throw new Error('Empty response from server');
      }
      if (typeof response !== 'object') {
        console.error('[AI GENERATE ERROR] Invalid response type:', typeof response);
        throw new Error('Invalid response format');
      }
      ```
    - Add logging in `apiRequest` function (queryClient.ts, line ~155) before returning:
      ```typescript
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log('[apiRequest DEBUG] Parsed JSON data:', data);
        return data;
      }
      ```
    - Verify response structure matches expected format from design
    - _Bug_Condition: isBugCondition(response) where backendReturned200Status AND response.success=true AND frontendState.aiGeneratedData=null_
    - _Expected_Behavior: Response reaches handleGenerateAI correctly and logs show proper structure_
    - _Preservation: Error responses continue to throw and show error toasts_
    - _Requirements: 1.3, 2.3_

  - [x] 3.2 Fix response handling and state update
    - Based on diagnostic logs from step 3.1, identify the exact issue:
      - If response is undefined: Fix `apiRequest` to ensure it returns the parsed JSON
      - If response.success is undefined: Check if response is wrapped (e.g., `{ data: { success: true, ... } }`) and unwrap it
      - If conditional block doesn't execute: Fix the conditional check to handle the actual response structure
      - If state update doesn't execute: Fix the setState call or add error handling
    - Implement the fix based on findings:
      - Option A (response wrapping): If response is `{ data: { success, caption, ... } }`, unwrap with `const { data } = response; if (data.success) { ... }`
      - Option B (direct fix): If response is correct structure, ensure no silent errors by wrapping in try-catch
      - Option C (async fix): If promise isn't resolving, verify `await` is used correctly
    - Use callback form of setState to ensure execution and add logging:
      ```typescript
      setAiGeneratedData(prev => {
        console.log('[AI GENERATE DEBUG] State update executing, prev:', prev);
        const newData = {
          caption: response.caption,
          hashtags: response.hashtags,
          engagementScore: response.engagementScore,
          viralityScore: response.viralityScore,
          ctaRecommendation: response.ctaRecommendation
        };
        console.log('[AI GENERATE DEBUG] New state:', newData);
        return newData;
      });
      ```
    - Add error boundary around the entire response processing:
      ```typescript
      try {
        if (response.success) {
          // ... state update
        }
      } catch (error) {
        console.error('[AI GENERATE ERROR] State update failed:', error);
        throw error; // Re-throw to be caught by outer catch
      }
      ```
    - _Bug_Condition: isBugCondition(response) from design_
    - _Expected_Behavior: State update populates aiGeneratedData correctly_
    - _Preservation: Manual edits and error handling preserved_
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - AI Content State Update on Successful Response
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior with diagnostic logging
    - Trigger AI generation with test workspace ID `684402c2fd2cd4eb6521b386`
    - Verify logs show:
      - Response is received correctly with proper structure
      - `response.success` is true
      - Conditional block executes (log shows "Inside success block")
      - State update callback executes (log shows "State update callback")
      - `aiGeneratedData` state is populated with all expected fields
      - AI content panel renders in UI with caption, hashtags, engagement scores visible
    - **EXPECTED OUTCOME**: Test PASSES - all logs show correct data flow and UI renders generated content
    - Verify caption textarea remains with placeholder (AI content shows in separate panel, not directly in textarea until "Apply" is clicked)
    - Verify toast notification shows "AI Content Generated! ✨" with hashtag count
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Error Handling and Manual Content Entry
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run all preservation tests:
      - Test error responses (402, 503) still show error toasts
      - Test manual caption entry still updates `postContent` correctly
      - Test "Apply AI Caption" still transfers caption correctly
      - Test "Apply AI Hashtags" still appends hashtags correctly
      - Test "Apply All" still transfers both and clears `aiGeneratedData`
      - Test dismissing AI panel (X button) still clears `aiGeneratedData`
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
    - Verify no changes to error handling behavior
    - Verify manual editing still works independently
    - Verify all Apply button functions work correctly

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run bug condition exploration test with real AI generation request
  - Verify AI content panel renders with all generated data visible
  - Verify caption shows in preview panel (not directly in textarea until applied)
  - Verify hashtags show in preview panel with count
  - Verify engagement and virality scores render correctly
  - Verify CTA recommendation displays if present
  - Run all preservation tests - verify no regressions
  - Test edge cases:
    - Very long captions (1000+ characters)
    - Many hashtags (20+)
    - Empty caption or no hashtags returned
    - Response with missing optional fields (no CTA recommendation)
  - If any issues arise, document them and ask user for guidance
  - Confirm credits are deducted correctly and remaining credits are accurate
