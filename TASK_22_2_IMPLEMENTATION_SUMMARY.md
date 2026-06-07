# Task 22.2 Implementation Summary: Safety Flag System

## Overview
Task 22.2 implements a comprehensive safety flag system that allows AI-generated content with warnings, user feedback on false positives, and safety calibration without compromising actual protection.

**Requirements Addressed:**
- 11.4: THE Caption_Generator SHALL maintain authenticity while respecting safety boundaries by finding genuine alternatives rather than corporate-safe generic content
- 11.5: WHEN generating edgy or opinionated content that matches the user's voice, THE Caption_Generator SHALL include a "review recommended" flag for user awareness
- 11.6: THE Caption_Generator SHALL allow users to provide feedback on safety false positives to calibrate filters without compromising actual safety

## Implementation Details

### 1. Enhanced ContentSafetyResult Interface
**File:** `server/services/ContentSafetyService.ts`

Added new fields to `ContentSafetyResult`:
- `reviewRecommended: boolean` - Flags content for user review
- `reviewReason?: string` - Explains why review is recommended
- `edgyContentTypes?: string[]` - Categories of edgy content detected (controversial, opinionated, bold claims, challenges norms)

### 2. Edgy Content Detection
**File:** `server/services/ContentSafetyService.ts`

Implemented `detectEdgyContentMatchingVoice()` method that identifies:
- **Opinionated language**: "honestly", "real talk", "let's be real", "hot take", "unpopular opinion"
- **Bold claims**: "the truth is", "you need to", "you must", "stop", "start"
- **Challenging norms**: "actually", "contrary to", "myth", "misconception", "why you shouldn't"

The method checks if edgy content matches the user's voice profile (casual, conversational, humorous tones) to differentiate between authentic edginess and off-brand content.

### 3. Safety Calibration Data Models
**File:** `server/models/SafetyFeedback.ts`

Created two new Mongoose models:

#### SafetyFeedback Model
Stores user feedback on safety flags:
- `feedbackType`: 'false_positive' | 'missed_issue' | 'calibration_request'
- `userRating`: 'inappropriate' | 'acceptable' | 'authentic'
- `originalSafetyScore` and `originalFlags`: Context for the feedback
- `status`: 'pending' | 'reviewed' | 'calibrated'
- `calibrationApplied`: Tracks if feedback led to calibration changes

#### SafetyCalibration Model
Stores learned safety preferences:
- `allowedPatterns`: Patterns user marked as authentic (false positives)
- `sensitivePatterns`: Patterns user wants stricter filtering on
- `customRules`: User-defined pattern rules with actions (allow/flag/block)
- `falsePositiveCount` and `feedbackCount`: Track calibration accuracy

### 4. SafetyFeedbackService
**File:** `server/services/SafetyFeedbackService.ts`

New service providing:

#### Core Methods
- `submitFeedback()`: Records user feedback and triggers async calibration
- `getCalibration()`: Retrieves user's calibration settings
- `updateCalibration()`: Learns from feedback to adjust filters
- `getFeedbackStats()`: Returns accuracy metrics (false positive rate, etc.)
- `getRecentFeedback()`: Gets recent feedback submissions

#### Safety Methods
- `isPatternAllowed()`: Checks if a pattern is in user's allowed list
- `isPatternSensitive()`: Checks if a pattern needs stricter filtering
- `applyCalibrationToIssues()`: Filters issues based on calibration while preserving critical safety checks

**Key Feature:** Critical safety issues (hate speech, personal info exposure, etc.) are NEVER filtered out by calibration - they always trigger warnings.

### 5. Updated ContentSafetyService Integration
**File:** `server/services/ContentSafetyService.ts`

Enhanced `filterCaption()` method to:
- Accept optional `calibration` parameter
- Detect edgy content that matches user's voice
- Set `reviewRecommended` flag instead of blocking authentic edgy content
- Apply calibration to filter false positives while preserving critical checks

### 6. API Endpoints
**File:** `server/routes/v1/ai.routes.ts`

Added three new endpoints:

#### POST /api/v1/ai/safety-feedback
Submit safety feedback from users
```typescript
Body: {
  workspaceId: string;
  captionId?: string;
  feedbackType: 'false_positive' | 'missed_issue' | 'calibration_request';
  flaggedIssue: string;
  userRating: 'inappropriate' | 'acceptable' | 'authentic';
  comment?: string;
  caption: string;
  safetyLevel: 'off' | 'standard' | 'strict';
  originalSafetyScore: number;
  originalFlags: string[];
}
```

#### GET /api/v1/ai/safety-calibration/:workspaceId
Get user's current calibration settings and statistics
```typescript
Returns: {
  calibration: {
    allowedPatterns: string[];
    sensitivePatterns: string[];
    customRules: [...];
    falsePositiveCount: number;
    feedbackCount: number;
  };
  statistics: {
    totalFeedback: number;
    falsePositives: number;
    missedIssues: number;
    calibrationRequests: number;
    calibrationAccuracy: number;
  };
}
```

#### GET /api/v1/ai/safety-feedback/:workspaceId
Get recent feedback submissions
```typescript
Query params: limit (default: 10)
Returns: {
  feedback: SafetyFeedback[];
  count: number;
}
```

### 7. Domain Types
**File:** `server/domain/types.ts`

Added type definitions:
- `SafetyFeedback` and `InsertSafetyFeedback`
- `SafetyCalibration` and `InsertSafetyCalibration`

## How It Works

### 1. Content Generation Flow
```
1. Caption generated by AI
2. ContentSafetyService.filterCaption() checks safety
3. If edgy content matches user's voice:
   - Set reviewRecommended = true
   - Add reviewReason explaining why
   - Tag edgyContentTypes (opinionated, bold claims, etc.)
4. Apply user's calibration to filter false positives
5. Return result with review recommendation but allow content
```

### 2. User Feedback Flow
```
1. User sees caption with safety warning/review recommendation
2. User provides feedback via POST /api/v1/ai/safety-feedback
3. SafetyFeedbackService.submitFeedback() stores feedback
4. If feedback is "authentic" false positive:
   - Async updateCalibration() triggered
   - Pattern added to user's allowedPatterns
   - Future similar content won't be flagged
5. If feedback is "inappropriate" missed issue:
   - Pattern added to user's sensitivePatterns
   - Future similar content gets stricter filtering
```

### 3. Calibration Application
```
1. Next caption generation includes calibration parameter
2. ContentSafetyService applies calibration via applyCalibrationToIssues()
3. Issues matching allowedPatterns are filtered out
4. EXCEPT: Critical safety issues (hate speech, PII, etc.) always preserved
5. Result: Fewer false positives while maintaining core safety
```

## Safety Guarantees

### Always Protected
The calibration system NEVER removes warnings for:
- Hate speech
- Discriminatory language
- Personal information exposure (SSN, credit cards, etc.)
- Prohibited topics (user-defined)

These are identified by `CRITICAL_ISSUE_KEYWORDS` in `applyCalibrationToIssues()`.

### Calibration Learns
- False positive patterns → Added to allowedPatterns
- Missed issue patterns → Added to sensitivePatterns
- Accuracy tracked via false positive rate
- User gets stats showing calibration improvement

## Example Usage

### Frontend Integration
```typescript
// 1. Generate caption
const result = await fetch('/api/v1/ai/generate-caption', {
  method: 'POST',
  body: JSON.stringify({ title: 'My bold opinion' })
});

const { variations } = await result.json();

// 2. Check for review recommendation
const variation = variations[0];
if (variation.safetyResult?.reviewRecommended) {
  // Show user: "⚠️ Review recommended: Contains opinionated content"
  // Allow user to review before publishing
  showReviewDialog(variation.safetyResult.reviewReason);
}

// 3. User says "This is authentic to my brand"
await fetch('/api/v1/ai/safety-feedback', {
  method: 'POST',
  body: JSON.stringify({
    workspaceId: 'workspace-123',
    feedbackType: 'false_positive',
    flaggedIssue: 'opinionated content',
    userRating: 'authentic',
    caption: variation.caption,
    safetyLevel: 'standard',
    originalSafetyScore: variation.safetyResult.safetyScore,
    originalFlags: ['opinionated']
  })
});

// 4. Future similar content won't be flagged
// The system learned this pattern is authentic for this user
```

### Checking Calibration Stats
```typescript
const stats = await fetch('/api/v1/ai/safety-calibration/workspace-123');
const { calibration, statistics } = await stats.json();

console.log(`Calibration accuracy: ${statistics.calibrationAccuracy}%`);
console.log(`False positives reduced: ${calibration.allowedPatterns.length}`);
```

## Testing Recommendations

### Manual Testing
1. Generate captions with opinionated/bold language
2. Verify `reviewRecommended` flag is set appropriately
3. Submit feedback marking as "authentic"
4. Generate similar caption again
5. Verify no longer flagged for review

### Edge Cases
1. Verify hate speech ALWAYS flagged regardless of calibration
2. Test calibration accuracy tracking
3. Test pattern normalization (handles variations in spacing, punctuation)
4. Test workspace isolation (calibration per workspace)

## Future Enhancements

### Phase 2 (Not in this task)
- ML-based pattern learning instead of simple string matching
- Sentiment analysis for more nuanced edgy content detection
- Brand voice consistency scoring
- A/B testing safety thresholds
- Admin dashboard for monitoring false positive rates across users

## Files Modified/Created

### Created
- `server/models/SafetyFeedback.ts` - Mongoose models
- `server/services/SafetyFeedbackService.ts` - Core feedback/calibration logic
- `TASK_22_2_IMPLEMENTATION_SUMMARY.md` - This file

### Modified
- `server/services/ContentSafetyService.ts` - Added review flags, edgy content detection, calibration support
- `server/routes/v1/ai.routes.ts` - Added 3 new API endpoints
- `server/domain/types.ts` - Added SafetyFeedback and SafetyCalibration types

## Completion Status

✅ Task 22.2 Requirements Met:
- ✅ Create "review recommended" flag for edgy content
- ✅ Add user feedback on false positives
- ✅ Implement safety calibration without compromising protection

**Status:** COMPLETE

The safety flag system is fully implemented and ready for frontend integration and testing.
