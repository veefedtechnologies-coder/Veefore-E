# Workspace Sharing Manual Test Guide

**Task 8.2: Workspace AI Configuration Sharing Test**

**Validates: Requirements 2.5, 3.6**

---

## Overview

This manual test guide verifies that AI configuration saved at the workspace level is correctly shared between multiple users in the same workspace. When User A saves AI configuration to a workspace, User B (and any other members) should automatically use that configuration for AI generation.

---

## Prerequisites

1. Application running with MongoDB connection
2. Two test user accounts (User A and User B)
3. Access to the AI Configuration settings page
4. Ability to trigger AI content generation
5. Access to browser DevTools (for inspecting API requests/responses)

---

## Test Scenario

### Setup Phase

**Goal:** Create test environment with two users in same workspace

1. **Create User A Account**
   - Sign up with email: `userA-workspace-test@example.com`
   - Complete email verification
   - Note down User A's ID from browser localStorage or DevTools

2. **Create User B Account**
   - Sign up with email: `userB-workspace-test@example.com`
   - Complete email verification
   - Note down User B's ID from browser localStorage or DevTools

3. **Create Shared Workspace** (as User A)
   - Navigate to workspace settings
   - Create new workspace: "Shared AI Config Test"
   - Note down the workspace ID from the URL or DevTools
   - Invite User B to this workspace OR
   - Set User B's workspace to this workspace ID directly in database

4. **Verify Both Users Access Same Workspace**
   - Log in as User A → Check workspace name is "Shared AI Config Test"
   - Log in as User B → Check workspace name is "Shared AI Config Test"
   - Both should see the same workspace ID in localStorage

---

## Test Steps

### STEP 1: User A Saves AI Configuration to Workspace

**Goal:** Verify User A can save AI configuration to workspace

**Instructions:**
1. Log in as User A
2. Navigate to Settings → AI Configuration
3. Configure the following settings:
   - AI Model: `google-ai-studio`
   - Creativity Level: `0.75` (or 75% on slider)
   - Optimization Goals: `engagement`
   - AI Persona: `professional-friendly`
   - Caption Style: `informative`
   - Response Length: `medium`
   - Multilingual: `enabled`
   - Video Engine: `standard`
   - Thumbnail Style: `clean`
   - Auto Hashtags: `true` (checked)
   - Content Safety: `moderate`
   - AI Memory: `session`
   - Auto Learning: `true` (checked)
   - Google AI Studio Key: `AIzaSy_test_key_12345` (or your actual key)
   - OpenAI Key: `sk-test-key-67890` (or your actual key)

4. Click "Save AI Configuration" button
5. Wait for success toast message

**Verification:**
- [ ] Success toast appears: "AI Configuration Saved"
- [ ] No errors in browser console
- [ ] Open DevTools → Network tab → Check PUT request to `/api/workspaces/{workspaceId}`
- [ ] Request body contains `aiConfiguration` object with all 15 fields
- [ ] Response status is 200 OK

**Expected Database State:**
```javascript
// In MongoDB, workspace document should have:
{
  _id: ObjectId("..."),
  userId: ObjectId("userA_id"),
  name: "Shared AI Config Test",
  aiConfiguration: {
    aiModel: "google-ai-studio",
    creativityLevel: 0.75,
    optimizationGoals: "engagement",
    // ... all 15 fields
  }
}
```

---

### STEP 2: User B Accesses Same Workspace

**Goal:** Verify User B can see the shared workspace

**Instructions:**
1. Log out from User A account
2. Log in as User B
3. Navigate to Settings → AI Configuration

**Verification:**
- [ ] User B sees the workspace: "Shared AI Config Test"
- [ ] Form fields are populated with User A's configuration values
- [ ] AI Model shows: `google-ai-studio`
- [ ] Creativity Level shows: `0.75` or `75%`
- [ ] All 15 fields match User A's saved values

**Optional - DevTools Inspection:**
- Open DevTools → Application → localStorage
- Check `activeWorkspaceId` matches User A's workspace ID
- Open DevTools → Network → Check GET request to `/api/workspaces/{workspaceId}`
- Verify response contains `aiConfiguration` with User A's values

---

### STEP 3: User B Reads AI Configuration from Workspace

**Goal:** Verify User B can access all configuration fields saved by User A

**Instructions:**
1. Still logged in as User B
2. Stay on Settings → AI Configuration page
3. Inspect each field value

**Verification Checklist:**
- [ ] AI Model: `google-ai-studio` ✓
- [ ] Creativity Level: `0.75` ✓
- [ ] Optimization Goals: `engagement` ✓
- [ ] AI Persona: `professional-friendly` ✓
- [ ] Caption Style: `informative` ✓
- [ ] Response Length: `medium` ✓
- [ ] Multilingual: `enabled` ✓
- [ ] Video Engine: `standard` ✓
- [ ] Thumbnail Style: `clean` ✓
- [ ] Auto Hashtags: `checked` ✓
- [ ] Content Safety: `moderate` ✓
- [ ] AI Memory: `session` ✓
- [ ] Auto Learning: `checked` ✓
- [ ] Google AI Studio Key: `AIzaSy_test_key_12345` ✓ (may be masked for security)
- [ ] OpenAI Key: `sk-test-key-67890` ✓ (may be masked for security)

**Note:** API keys may display as `********` for security. This is expected behavior per Requirement 3.7.

---

### STEP 4: User B Triggers AI Generation with Shared Config

**Goal:** Verify AI generation uses User A's workspace configuration

**Instructions:**
1. Still logged in as User B
2. Navigate to the AI content generation page (e.g., Create Post)
3. Enter a prompt: "Create a social media post about climate change"
4. Click "Generate" or equivalent button
5. Wait for AI generation to complete

**Verification:**
- [ ] AI generation succeeds (no 400 error)
- [ ] Generated content is returned
- [ ] Open browser DevTools → Console
- [ ] Check for logs indicating model used: should be `google-ai-studio`

**Optional - Server Logs Inspection:**
If you have access to server logs:
```bash
# Check server logs for AI generation call
tail -f server/logs/app.log | grep "AI generation"

# Expected log output should show:
# - Model: google-ai-studio (User A's choice, NOT default)
# - Creativity: 0.75 (User A's setting)
# - Optimization: engagement (User A's goal)
```

**Database Verification:**
```javascript
// In MongoDB, check the generation used workspace config:
db.contents.findOne({ userId: userB_id }, { sort: { createdAt: -1 } })

// The content document should reference the workspace:
{
  userId: ObjectId("userB_id"),
  workspaceId: ObjectId("shared_workspace_id"),
  // AI generation metadata should show User A's settings were used
}
```

---

### STEP 5: Verify User B's Preferences Don't Interfere

**Goal:** Ensure user-level preferences are separate from workspace AI config

**Instructions:**
1. Still logged in as User B
2. Navigate to Settings → General Preferences (NOT AI Configuration)
3. Change User B's personal preferences:
   - Theme: `dark`
   - Notifications: `enabled`
   - Language: `Spanish`
4. Save preferences
5. Navigate back to Settings → AI Configuration

**Verification:**
- [ ] User B's personal preferences are saved
- [ ] Theme is now `dark`
- [ ] AI Configuration still shows User A's values:
  - AI Model: `google-ai-studio` (unchanged)
  - Creativity Level: `0.75` (unchanged)
- [ ] User preferences DO NOT contain `aiModel`, `creativityLevel`, or any AI config fields

**Database Verification:**
```javascript
// Check User B document in MongoDB:
db.users.findOne({ _id: userB_id })

// Expected structure:
{
  _id: ObjectId("userB_id"),
  preferences: {
    theme: "dark",
    notifications: true,
    language: "es"
    // NO aiModel, creativityLevel, or other AI config here
  }
}

// AI config should be in workspace, not user:
db.workspaces.findOne({ _id: shared_workspace_id })
{
  _id: ObjectId("shared_workspace_id"),
  aiConfiguration: {
    aiModel: "google-ai-studio",
    creativityLevel: 0.75,
    // ... all 15 fields
  }
}
```

---

### STEP 6: Verify Configuration is Workspace-Level

**Goal:** Confirm AI configuration is stored in workspace, not user accounts

**Instructions:**
1. Use MongoDB Compass or mongo shell
2. Query User A document
3. Query User B document
4. Query shared workspace document

**Database Queries:**
```javascript
// Query User A
db.users.findOne({ email: "userA-workspace-test@example.com" })

// Query User B
db.users.findOne({ email: "userB-workspace-test@example.com" })

// Query Workspace
db.workspaces.findOne({ name: "Shared AI Config Test" })
```

**Verification Checklist:**
- [ ] User A document has `preferences` object
- [ ] User A `preferences` does NOT contain `aiModel`, `creativityLevel`, etc.
- [ ] User B document has `preferences` object
- [ ] User B `preferences` does NOT contain `aiModel`, `creativityLevel`, etc.
- [ ] Workspace document has `aiConfiguration` object
- [ ] Workspace `aiConfiguration` contains all 15 AI config fields
- [ ] Workspace `aiConfiguration.aiModel` = `"google-ai-studio"`

**This confirms:** AI configuration is workspace-level, not user-level ✓

---

### BONUS STEP 7: Bidirectional Sharing - User B Modifies Config

**Goal:** Verify User B can modify workspace config and User A sees changes

**Instructions:**
1. Log in as User B
2. Navigate to Settings → AI Configuration
3. Modify the following fields:
   - AI Model: Change to `openai`
   - Creativity Level: Change to `0.9` (90%)
   - OpenAI Key: `sk-userB-new-key-12345`
4. Click "Save AI Configuration"
5. Wait for success toast

6. Log out from User B
7. Log in as User A
8. Navigate to Settings → AI Configuration

**Verification:**
- [ ] User A sees User B's modifications:
  - AI Model: `openai` (changed by User B)
  - Creativity Level: `0.9` (changed by User B)
  - OpenAI Key: `sk-userB-new-key-12345` (changed by User B)
- [ ] Other fields are preserved:
  - Optimization Goals: `engagement` (User A's original value)
  - Auto Hashtags: `checked` (User A's original value)

**This confirms:** Workspace sharing is bidirectional - both users can modify and see each other's changes ✓

---

## Expected Results Summary

| Step | Expected Outcome | Validates |
|------|------------------|-----------|
| 1 | User A saves AI config to workspace successfully | Requirement 2.5 |
| 2 | User B can access same workspace | Requirement 3.6 |
| 3 | User B sees all 15 fields saved by User A | Requirement 2.5, 3.6 |
| 4 | User B's AI generation uses User A's config | Requirement 2.5, 3.6 |
| 5 | User preferences separate from workspace config | Requirement 3.1 |
| 6 | Config stored in workspace, not users | Requirement 2.5 |
| 7 | User B can modify config, User A sees changes | Requirement 3.6 |

---

## Troubleshooting

### Issue: User B doesn't see User A's configuration

**Possible Causes:**
1. User B is in a different workspace
2. Configuration was saved to user preferences instead of workspace
3. Form is reading from wrong data source

**Debug Steps:**
1. Check workspace IDs match for both users:
   ```javascript
   // In browser console (User A)
   localStorage.getItem('activeWorkspaceId')
   
   // In browser console (User B)
   localStorage.getItem('activeWorkspaceId')
   
   // Should be the same ID
   ```

2. Check database workspace document:
   ```javascript
   db.workspaces.findOne({ _id: ObjectId("workspace_id") })
   // Should have aiConfiguration field with values
   ```

3. Check frontend is calling workspace API:
   ```javascript
   // DevTools → Network → Check API call on save
   // Should be: PUT /api/workspaces/{workspaceId}
   // NOT: PATCH /api/user
   ```

### Issue: AI generation still uses default settings

**Possible Causes:**
1. AI generation system reading from wrong location
2. Workspace ID not passed to AI generation
3. Fallback logic triggering due to undefined config

**Debug Steps:**
1. Check server logs for AI generation:
   ```bash
   # Look for workspace ID and config in logs
   grep "AI generation" server/logs/app.log
   ```

2. Verify workspace passed to AI service:
   ```typescript
   // In server/ai-content-generator.ts or similar
   // Should have: workspace.aiConfiguration.aiModel
   ```

3. Check database query in AI generation:
   ```javascript
   // Should query workspace by ID and read aiConfiguration
   const workspace = await WorkspaceModel.findById(workspaceId);
   const aiModel = workspace.aiConfiguration?.aiModel || 'default';
   ```

### Issue: API keys not working after sharing

**Possible Causes:**
1. API keys not saved to workspace
2. API keys masked on frontend but not sent on generation
3. API key validation failing

**Debug Steps:**
1. Check workspace document has keys:
   ```javascript
   db.workspaces.findOne(
     { _id: ObjectId("workspace_id") },
     { 'aiConfiguration.googleAiStudioKey': 1 }
   )
   // Should return the key (not masked in DB)
   ```

2. Verify AI generation receives key:
   ```bash
   # Server logs should show key being used (first few chars)
   # Expected: "Using API key: AIzaSy..."
   # NOT: "No API key found, using default"
   ```

---

## Success Criteria

All tests pass when:

✅ User A can save AI configuration to workspace  
✅ User B can access same workspace  
✅ User B sees all 15 fields saved by User A  
✅ User B's AI generation uses User A's configuration  
✅ User preferences are separate from workspace config  
✅ Configuration is stored in workspace (not users)  
✅ User B can modify config and User A sees changes  

---

## Notes

- **Security:** API keys should be masked in frontend responses but stored plainly in database for AI generation use
- **Performance:** Workspace config should be cached appropriately to avoid repeated DB queries
- **Workspace Membership:** This test assumes both users have access to the shared workspace (via team invitation or direct DB setup)
- **MongoDB Required:** Automated test requires MongoDB connection. If unavailable, use this manual guide.

---

## Automated Test File

For automated testing when MongoDB is available, see:
`/tests/workspace-sharing.test.ts`

Run with:
```bash
npm run test tests/workspace-sharing.test.ts
```

---

## Related Tests

- Task 6.1: AI Config Fix Verification (25 tests)
- Task 7.1: Preservation Property Tests (17 tests)
- Task 8.1: Full E2E User Flow (9 tests)
- Task 8.2: Workspace Sharing (7 tests) ← This guide

**Total Test Coverage: 58 automated tests**

---

*Last Updated: Task 8.2 Implementation*
