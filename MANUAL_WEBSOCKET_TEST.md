# Manual WebSocket Testing Guide for Task 6.6

## Objective
Verify that VeeGPT WebSocket real-time functionality is working correctly after refactoring.

## Prerequisites
- Application running locally (`npm run dev`)
- User authenticated (signed in)
- Browser DevTools open

## Test Procedures

### 1. WebSocket Connection Test

**Steps:**
1. Open the application in browser
2. Navigate to `/veegpt` route
3. Open DevTools (F12)
4. Go to Network tab > WS (WebSocket) filter
5. Observe WebSocket connection

**Expected Results:**
- ✅ WebSocket connection establishes automatically
- ✅ Connection status shows "101 Switching Protocols"
- ✅ Console log shows: "WebSocket Connected successfully for streaming"
- ✅ Connection URL matches: `ws://localhost:5000` or `wss://` for production

**Screenshot Location:** Network tab showing active WebSocket connection

---

### 2. Message Streaming Test

**Steps:**
1. In VeeGPT interface, type a message: "Explain artificial intelligence in 100 words"
2. Click Send or press Enter
3. Observe the response streaming in real-time

**Expected Results:**
- ✅ Message appears immediately in chat
- ✅ AI response streams character by character (not all at once)
- ✅ No delays or buffering between chunks
- ✅ Markdown formatting renders correctly
- ✅ Response completes with full content

**WebSocket Events to Verify (in DevTools > Network > WS > Messages):**
```json
// User message event
{
  "type": "userMessage",
  "message": {
    "id": 123,
    "content": "Explain artificial intelligence..."
  }
}

// AI processing status
{
  "type": "status",
  "content": "🧠 Routing to GPT-4o for optimal results..."
}

// AI message start
{
  "type": "aiMessageStart",
  "messageId": 124
}

// Streaming chunks (many of these)
{
  "type": "chunk",
  "messageId": 124,
  "content": "Artificial"
}
{
  "type": "chunk",
  "messageId": 124,
  "content": " intelligence"
}

// Stream complete
{
  "type": "complete"
}
```

---

### 3. AI Status Updates Test

**Steps:**
1. Send different types of messages to trigger different AI routing:
   - "What's trending on social media today?" (should route to Perplexity)
   - "Generate creative content ideas for Instagram" (should route to Gemini)
   - "Create a marketing strategy for my brand" (should route to GPT-4o)

**Expected Results:**
- ✅ Status message appears before streaming: "🔍 Analyzing trends and routing to Perplexity..."
- ✅ Status updates in real-time
- ✅ Status clears when streaming content starts
- ✅ Different messages show appropriate routing logic

---

### 4. Conversation Persistence Test

**Steps:**
1. Send 3-5 messages in a conversation
2. Note the conversation title in sidebar
3. Refresh the browser page (F5)
4. Wait for page to reload

**Expected Results:**
- ✅ Conversation history loads correctly
- ✅ All messages persist across refresh
- ✅ Message order is maintained
- ✅ Timestamps are preserved
- ✅ Current conversation is automatically selected

**Database Verification:**
```bash
# If you have database access, verify:
- Conversations table has entry
- Messages table has all sent messages
- Foreign key relationships are correct
```

---

### 5. Stop Generation Test

**Steps:**
1. Send a message requesting a long response: "Write a 500-word essay about climate change"
2. Wait for streaming to start (first few chunks appear)
3. Click the "Stop" button (square icon) in the input area
4. Observe the streaming behavior

**Expected Results:**
- ✅ Streaming stops immediately after clicking Stop
- ✅ Button changes from "Stop" (square) back to "Send" (arrow)
- ✅ Partial response is saved and visible
- ✅ `isGenerating` state resets to false
- ✅ No additional chunks arrive after stopping
- ✅ Can send new message immediately

**WebSocket Event to Verify:**
```json
// Stop generation API call
POST /api/chat/conversations/:id/stop
{
  "conversationId": 123
}
```

---

### 6. WebSocket Reconnection Test

**Steps:**
1. Open DevTools > Network tab
2. Enable "Offline" mode in Network tab
3. Wait 5 seconds
4. Disable "Offline" mode
5. Observe reconnection behavior

**Expected Results:**
- ✅ WebSocket detects disconnection
- ✅ Console log shows: "WebSocket Connection closed"
- ✅ Automatic reconnection attempt after 5 seconds
- ✅ WebSocket successfully reconnects
- ✅ Console log shows: "Reconnecting... (Attempt X of 3)"
- ✅ Chat functionality resumes normally after reconnect
- ✅ Pending messages are handled correctly

**Note:** Max 3 reconnection attempts in production, 1 in development to prevent excessive reconnections during hot reloads.

---

### 7. Conversation Sidebar Test

**Steps:**
1. Create 3-4 conversations with different messages
2. Test sidebar interactions:
   - Click on a conversation to switch
   - Hover over a conversation (should show actions menu)
   - Click three-dot menu > Rename
   - Click three-dot menu > Archive
   - Click three-dot menu > Delete
   - Use search to filter conversations

**Expected Results:**
- ✅ Switching conversations loads correct messages
- ✅ Actions menu appears on hover
- ✅ Rename updates conversation title
- ✅ Archive removes from main list
- ✅ Delete prompts confirmation and removes conversation
- ✅ Search filters conversations in real-time
- ✅ Sidebar collapse/expand works smoothly

---

### 8. Multi-Tab Sync Test (Advanced)

**Steps:**
1. Open VeeGPT in two browser tabs
2. Send a message in Tab 1
3. Observe Tab 2

**Expected Results:**
- ✅ New message appears in Tab 2 automatically
- ✅ Conversation list updates in both tabs
- ✅ WebSocket maintains separate connections for each tab
- ✅ No conflicts or race conditions

---

### 9. Error Handling Test

**Steps:**
1. Send a very long message (>10,000 characters)
2. Send a message with special characters: `<script>alert('test')</script>`
3. Rapidly send 10 messages in quick succession

**Expected Results:**
- ✅ Long messages are handled gracefully (possibly truncated or validated)
- ✅ Special characters are escaped/sanitized
- ✅ Rapid messages don't break streaming or cause errors
- ✅ Rate limiting (if implemented) works correctly
- ✅ Error messages are user-friendly

---

### 10. Performance Test

**Steps:**
1. Send a message requesting a very long response
2. Monitor browser performance:
   - Open DevTools > Performance tab
   - Start recording
   - Send message and wait for complete streaming
   - Stop recording

**Expected Results:**
- ✅ No memory leaks during streaming
- ✅ CPU usage stays reasonable (<30% for single conversation)
- ✅ Smooth scrolling during streaming
- ✅ No lag or jank in UI updates
- ✅ Frame rate stays above 30fps

---

## Test Results Template

Copy and fill out after testing:

```
### Test Session Results

**Date:** [YYYY-MM-DD]
**Tester:** [Your Name]
**Environment:** [Development/Production]
**Browser:** [Chrome/Firefox/Safari + Version]

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | WebSocket Connection | ☐ Pass ☐ Fail | |
| 2 | Message Streaming | ☐ Pass ☐ Fail | |
| 3 | AI Status Updates | ☐ Pass ☐ Fail | |
| 4 | Conversation Persistence | ☐ Pass ☐ Fail | |
| 5 | Stop Generation | ☐ Pass ☐ Fail | |
| 6 | WebSocket Reconnection | ☐ Pass ☐ Fail | |
| 7 | Conversation Sidebar | ☐ Pass ☐ Fail | |
| 8 | Multi-Tab Sync | ☐ Pass ☐ Fail | |
| 9 | Error Handling | ☐ Pass ☐ Fail | |
| 10 | Performance | ☐ Pass ☐ Fail | |

**Overall Status:** ☐ All Tests Pass ☐ Some Tests Fail

**Issues Found:**
1. [Description of issue]
2. [Description of issue]

**Screenshots/Videos:**
- [Link to evidence]

**Additional Notes:**
[Any other observations]
```

---

## Debugging Tips

If tests fail, check:

1. **Console Logs:**
   - Look for WebSocket connection logs
   - Check for JavaScript errors
   - Verify API response formats

2. **Network Tab:**
   - Inspect WebSocket messages (WS filter)
   - Check HTTP API calls for errors
   - Verify request/response payloads

3. **Application Logs:**
   - Check server logs for WebSocket events
   - Look for database query errors
   - Verify AI service API calls

4. **Common Issues:**
   - **WebSocket won't connect:** Check firewall/proxy settings
   - **No streaming:** Verify WebSocket URL is correct
   - **Messages don't persist:** Check database connection
   - **High CPU usage:** Look for infinite loops or memory leaks

---

## Success Criteria

Task 6.6 is **COMPLETE** when:
- [x] All 10 tests pass successfully
- [x] No critical bugs found
- [x] Performance is acceptable
- [x] Documentation is updated
- [x] Code is committed to repository

---

## Next Steps After Testing

1. Document test results
2. Create bug tickets for any issues found
3. Update task status in tasks.md
4. Proceed to next task (Task 7 Checkpoint)
