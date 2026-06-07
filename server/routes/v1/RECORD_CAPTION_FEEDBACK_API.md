# Record Caption Feedback API

## Endpoint: POST /api/v1/ai/record-caption-feedback

This endpoint records user feedback on generated captions to enable continuous learning and voice profile improvements.

### Authentication
- Requires authentication token
- User must own the workspace specified in the request

### Request Body

```typescript
{
  captionId: string;        // ID of the generated caption (required)
  workspaceId: string;      // ID of the workspace (required)
  feedbackType: 'selected' | 'edited' | 'rejected'; // Type of feedback (required)
  editedVersion?: string;   // Required if feedbackType is 'edited'
  rejectionReason?: string; // Optional reason for rejection
}
```

### Feedback Types

#### 1. Selected (`feedbackType: 'selected'`)
Records when a user selects and uses a generated caption variation.

**Example:**
```json
{
  "captionId": "507f1f77bcf86cd799439011",
  "workspaceId": "507f191e810c19729de860ea",
  "feedbackType": "selected"
}
```

**Behavior:**
- Records which variation was selected
- Marks other variations as rejected
- Updates voice profile preferences based on selected patterns
- Learns preferred hooks, styles, and tone

#### 2. Edited (`feedbackType: 'edited'`)
Records when a user edits a generated caption before publishing.

**Example:**
```json
{
  "captionId": "507f1f77bcf86cd799439011",
  "workspaceId": "507f191e810c19729de860ea",
  "feedbackType": "edited",
  "editedVersion": "This is my edited caption with personalized touches! 🎨\n\nWhat do you think?"
}
```

**Behavior:**
- Analyzes differences between original and edited captions
- Detects changes in: vocabulary, structure, emoji usage, length, tone
- Calculates edit distance (Levenshtein)
- Updates voice profile to match editing preferences
- Learns which words/phrases user prefers to use or avoid

#### 3. Rejected (`feedbackType: 'rejected'`)
Records when a user rejects all generated caption variations.

**Example:**
```json
{
  "captionId": "507f1f77bcf86cd799439011",
  "workspaceId": "507f191e810c19729de860ea",
  "feedbackType": "rejected",
  "rejectionReason": "Too formal, doesn't match my brand voice"
}
```

**Behavior:**
- Records rejection in feedback database
- Tracks which patterns/hooks were rejected
- Helps identify patterns to avoid in future generations

### Response

**Success (200 OK):**
```json
{
  "success": true,
  "feedbackId": "507f1f77bcf86cd799439011",
  "message": "Feedback recorded successfully",
  "feedbackType": "edited",
  "updates": {
    "voiceProfileUpdated": true,
    "patternLearningTriggered": true
  }
}
```

**Errors:**

- **400 Bad Request:** Invalid request body or missing required fields
  ```json
  {
    "error": "editedVersion is required for edited feedback type"
  }
  ```

- **403 Forbidden:** User doesn't own the workspace
  ```json
  {
    "error": "Access denied to workspace"
  }
  ```

- **404 Not Found:** Workspace or caption not found
  ```json
  {
    "error": "Caption not found"
  }
  ```

- **500 Internal Server Error:** Server error
  ```json
  {
    "error": "Failed to record feedback",
    "details": "Error message details"
  }
  ```

## Learning Mechanisms

### Voice Profile Updates

When feedback is recorded, the system updates the user's voice profile:

1. **Selection Feedback:**
   - Boosts vocabulary frequency from selected caption
   - Updates preferred emoji usage patterns
   - Adjusts tone markers toward selected style
   - Records preferred hook patterns
   - Updates engagement question preferences

2. **Edit Feedback:**
   - Analyzes vocabulary changes (words added/removed)
   - Detects emoji usage changes
   - Tracks sentence length preferences
   - Monitors punctuation style changes
   - Extracts new signature phrases

3. **Rejection Feedback:**
   - Records rejected patterns for avoidance
   - Tracks which hooks/styles consistently fail
   - Helps refine generation parameters

### Pattern Learning

The system correlates feedback with:
- Viral patterns used in generation
- Hooks selected for each variation
- Niche-specific language choices
- Engagement prediction accuracy

This enables continuous improvement of:
- Pattern effectiveness rankings
- Voice profile accuracy
- Authenticity scoring
- Engagement predictions

## Integration Requirements

### Frontend Integration

The frontend should call this endpoint:

1. **After caption selection:** When user chooses a variation to publish
2. **After caption editing:** When user modifies before publishing
3. **After rejection:** When user rejects all variations

**Example Integration:**

```typescript
// When user selects a caption variation
async function handleCaptionSelection(captionId: string, workspaceId: string) {
  await fetch('/api/v1/ai/record-caption-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      captionId,
      workspaceId,
      feedbackType: 'selected'
    })
  });
}

// When user edits a caption
async function handleCaptionEdit(
  captionId: string, 
  workspaceId: string, 
  editedCaption: string
) {
  await fetch('/api/v1/ai/record-caption-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      captionId,
      workspaceId,
      feedbackType: 'edited',
      editedVersion: editedCaption
    })
  });
}

// When user rejects all variations
async function handleCaptionRejection(
  captionId: string, 
  workspaceId: string,
  reason?: string
) {
  await fetch('/api/v1/ai/record-caption-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      captionId,
      workspaceId,
      feedbackType: 'rejected',
      rejectionReason: reason
    })
  });
}
```

## Database Impact

### Collections Updated

1. **captionfeedback** - Stores all feedback records
2. **generatedcaptions** - Updates with selection and edit information
3. **voiceprofiles** - Incrementally updated based on feedback

### Indexes Used

- `userId + workspaceId + timestamp` for feedback queries
- `generatedCaptionId` for linking feedback to captions
- `feedbackType + timestamp` for filtering by type

## Performance Considerations

- Feedback recording is synchronous (blocks response)
- Voice profile updates are synchronous (ensure consistency)
- Pattern learning is triggered but not awaited
- MongoDB connection is properly closed after operation

## Testing

See `server/routes/v1/ai.routes.test.ts` for endpoint tests.

### Manual Testing

```bash
# Test selection feedback
curl -X POST http://localhost:3000/api/v1/ai/record-caption-feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "captionId": "507f1f77bcf86cd799439011",
    "workspaceId": "507f191e810c19729de860ea",
    "feedbackType": "selected"
  }'

# Test edit feedback
curl -X POST http://localhost:3000/api/v1/ai/record-caption-feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "captionId": "507f1f77bcf86cd799439011",
    "workspaceId": "507f191e810c19729de860ea",
    "feedbackType": "edited",
    "editedVersion": "My edited caption! 🎨"
  }'

# Test rejection feedback
curl -X POST http://localhost:3000/api/v1/ai/record-caption-feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "captionId": "507f1f77bcf86cd799439011",
    "workspaceId": "507f191e810c19729de860ea",
    "feedbackType": "rejected",
    "rejectionReason": "Not my style"
  }'
```

## Related Endpoints

- `POST /api/v1/ai/generate-caption` - Generates caption variations
- `POST /api/v1/ai/record-performance` - Records actual engagement metrics (Task 16.1)
- `POST /api/voice-profile/analyze` - Analyzes sample captions for voice profile
- `POST /api/voice-profile/recalibrate` - Manually recalibrates voice profile

## Requirements Satisfied

- **Requirement 10.1:** Captures user edits to analyze preferences
- **Requirement 10.2:** Tracks caption selection patterns
- **Requirement 15.3:** Creates feedback recording endpoint with validation

## Future Enhancements

1. Add support for specifying which variation was selected (variation index)
2. Add batch feedback recording for multiple captions
3. Add feedback analytics dashboard endpoint
4. Add webhook support for async feedback processing
5. Add feedback deletion/correction endpoint
