# Bug Condition Exploration Test - Instructions

## Task 1: Bug Condition Exploration Test
**Status**: Diagnostic Logging Added ✅

## What Was Done

### 1. Added Comprehensive Diagnostic Logging

#### In `create-post.tsx` (`handleGenerateAI` function):
- ✅ Log full response object after `apiRequest` returns
- ✅ Log response type to verify it's an object
- ✅ Log `response.success` value
- ✅ Log before checking the `if (response.success)` conditional
- ✅ Log inside the success block with caption preview and hashtag count
- ✅ Modified `setAiGeneratedData` to use callback form with logging
- ✅ Log previous state and new state data in the callback

#### In `queryClient.ts` (`apiRequest` function):
- ✅ Log the parsed JSON data before returning
- ✅ Log data type to verify structure
- ✅ Log whether the `success` property exists

## How to Run the Test

### Prerequisites
1. Ensure the development server is running:
   ```bash
   npm run dev
   npm run client:dev
   ```

2. Ensure you're logged in to the application with a valid Firebase account

3. Ensure the test workspace ID `684402c2fd2cd4eb6521b386` exists and has AI credits

### Test Execution Steps

1. **Navigate to Create Post Page**
   - Open the application in your browser
   - Go to the "Create Post" section
   - Ensure you're working with workspace ID: `684402c2fd2cd4eb6521b386`

2. **Select an Account**
   - Choose an Instagram account from the account dropdown

3. **Upload Media (Optional)**
   - Upload an image or video if you want to test with media
   - This is optional but recommended for more comprehensive testing

4. **Open Browser DevTools**
   - Press F12 or right-click and select "Inspect"
   - Go to the "Console" tab
   - Clear any existing console messages

5. **Trigger AI Content Generation**
   - Click the "Generate AI Content" button (Sparkles icon)
   - Watch the console for diagnostic logs

6. **Observe the Console Logs**
   The logs will appear in this sequence if the code is working:
   ```
   [apiRequest DEBUG] Parsed JSON data: { ... }
   [apiRequest DEBUG] Data type: object
   [apiRequest DEBUG] Has success property: true
   [AI GENERATE DEBUG] Full response: { ... }
   [AI GENERATE DEBUG] Response type: object
   [AI GENERATE DEBUG] response.success: true
   [AI GENERATE DEBUG] About to check response.success
   [AI GENERATE DEBUG] Inside success block, setting state with: { ... }
   [AI GENERATE DEBUG] State update callback, prev: null
   [AI GENERATE DEBUG] New state data: { ... }
   ```

7. **Check the UI**
   - Does the AI-generated content panel appear?
   - Does it show the caption, hashtags, engagement scores?
   - Does the caption textarea still show the placeholder?

## Expected Failure Patterns

Based on the bugfix design, the test SHOULD FAIL on unfixed code with one of these patterns:

### Pattern A: Response is undefined or null
```
[AI GENERATE DEBUG] Full response: null
[AI GENERATE DEBUG] Response type: undefined
```
**Interpretation**: The `apiRequest` function is not returning the response properly.

### Pattern B: Response exists but `response.success` is undefined/false
```
[apiRequest DEBUG] Parsed JSON data: { success: true, caption: "...", ... }
[AI GENERATE DEBUG] Full response: { /* different structure */ }
[AI GENERATE DEBUG] response.success: undefined
```
**Interpretation**: The response is being wrapped or transformed after `apiRequest` returns.

### Pattern C: Conditional block never executes
```
[AI GENERATE DEBUG] About to check response.success
(No "Inside success block" log)
```
**Interpretation**: The `if (response.success)` conditional is evaluating to false despite backend success.

### Pattern D: State update callback never executes
```
[AI GENERATE DEBUG] Inside success block, setting state with: { ... }
(No "State update callback" log)
```
**Interpretation**: The `setAiGeneratedData` function is not executing or the callback is not being called.

## Documentation Required

After running the test, document:

1. **Complete Console Output**: Copy all console logs from `[apiRequest DEBUG]` through to any errors
2. **Failure Pattern**: Which pattern (A, B, C, or D) matches the observed behavior
3. **UI State**: Does the AI content panel render? Is `aiGeneratedData` populated?
4. **Backend Logs**: Check server logs to confirm the backend returned a successful response
5. **Network Tab**: Check the Network tab in DevTools to see the actual response from `/api/v1/ai/generate-content`

## Task Completion Criteria

This task is complete when:
- ✅ Diagnostic logging is added to both `handleGenerateAI` and `apiRequest`
- ✅ Test is run with workspace ID `684402c2fd2cd4eb6521b386`
- ✅ Failure pattern is documented
- ✅ Console logs are captured and analyzed

## Next Steps

After documenting the failure pattern:
- Task 2: Write preservation property tests on unfixed code
- Task 3: Implement the fix based on the identified failure pattern
- Task 4: Verify the bug condition test now passes after the fix
