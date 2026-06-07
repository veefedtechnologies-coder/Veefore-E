# FeedbackCaptureService Documentation

## Overview

The `FeedbackCaptureService` is a core component of the Authentic Instagram Caption Generation system that captures and analyzes user feedback on generated captions. It enables continuous learning and voice profile improvements by tracking user interactions with AI-generated content.

**Requirements:** 10.1, 10.2, 10.6

## Purpose

This service implements three critical feedback mechanisms:

1. **Caption Selection Tracking** - Records which caption variations users choose and which they reject
2. **Edit Analysis Engine** - Analyzes how users modify captions before publishing
3. **Rejection Pattern Analyzer** - Identifies patterns, hooks, and styles users consistently avoid

## Database Schema

### CaptionFeedback Collection

```typescript
{
  userId: string;
  workspaceId: string;
  generatedCaptionId: string; // Reference to GeneratedCaption
  
  // Feedback Type
  feedbackType: 'selection' | 'edit' | 'rejection' | 'regeneration';
  
  // Selection Details
  selectedVariation?: number;
  rejectedVariations?: number[];
  
  // Edit Details
  editsMade?: {
    type: 'vocabulary' | 'structure' | 'emoji' | 'length' | 'tone' | 'other';
    before: string;
    after: string;
    reason?: string;
  }[];
  
  // Pattern Preferences
  preferredPatterns?: string[]; // Pattern IDs from selected variation
  rejectedPatterns?: string[];  // Pattern IDs from rejected variations
  
  // Metadata
  timestamp: Date;
  niche?: string;
  postType?: 'post' | 'story' | 'reel';
}
```

## Core Methods

### recordSelection()

Records when a user selects a caption variation, capturing which patterns they preferred and rejected.

**Signature:**
```typescript
async recordSelection(
  userId: string,
  workspaceId: string,
  feedback: SelectionFeedback
): Promise<void>
```

**Parameters:**
- `userId` - The user's ID
- `workspaceId` - The workspace ID
- `feedback` - Selection details including:
  - `generatedCaptionId` - The generated caption ID
  - `selectedVariationIndex` - Index of chosen variation (0-2)
  - `rejectedVariationIndices` - Indices of rejected variations

**What it does:**
1. Fetches the generated caption with all variations
2. Extracts patterns and hooks from selected variation
3. Extracts patterns and hooks from rejected variations
4. Stores feedback in `captionfeedback` collection
5. Updates the generated caption with selection index

**Use Cases:**
- User chooses "Variation 2" from 3 options
- System learns user prefers "Story-Insight-Question" pattern
- System learns user dislikes "Hot Take" hooks

**Example:**
```typescript
await feedbackService.recordSelection(userId, workspaceId, {
  generatedCaptionId: '507f1f77bcf86cd799439011',
  selectedVariationIndex: 1,
  rejectedVariationIndices: [0, 2]
});
```

### analyzeEdit()

Analyzes how users modify generated captions before publishing, detecting specific change types.

**Signature:**
```typescript
async analyzeEdit(
  userId: string,
  workspaceId: string,
  generatedCaptionId: string,
  originalCaption: string,
  editedCaption: string
): Promise<EditAnalysis>
```

**Parameters:**
- `userId` - The user's ID
- `workspaceId` - The workspace ID
- `generatedCaptionId` - The generated caption ID
- `originalCaption` - AI-generated caption
- `editedCaption` - User-modified caption

**Returns:**
```typescript
{
  originalCaption: string;
  editedCaption: string;
  changes: IEditChange[];
  editDistance: number; // Levenshtein distance
  changeTypes: {
    vocabulary: number;
    structure: number;
    emoji: number;
    length: number;
    tone: number;
    other: number;
  };
}
```

**Change Detection:**

1. **Length Changes** - Detects when user expands or shortens content significantly (>50 chars)
2. **Emoji Changes** - Tracks added, removed, or replaced emojis
3. **Structure Changes** - Identifies line break additions/removals
4. **Vocabulary Changes** - Detects word replacements and additions
5. **Tone Changes** - Tracks punctuation changes (exclamations, questions)

**Example:**
```typescript
const original = "Check out this amazing workout! 💪";
const edited = "Look at this incredible training session! 💪🔥";

const analysis = await feedbackService.analyzeEdit(
  userId,
  workspaceId,
  captionId,
  original,
  edited
);

// analysis.changes:
// [
//   { type: 'vocabulary', before: 'check, amazing, workout', after: 'look, incredible, training, session' },
//   { type: 'emoji', before: '💪', after: '💪 🔥', reason: 'Added emojis' }
// ]
```

**Learning Insights:**
- User consistently replaces formal words with casual alternatives
- User always adds more emojis than AI suggests
- User prefers shorter, punchier sentences

### analyzeRejections()

Identifies patterns, hooks, and styles users consistently reject to improve future generations.

**Signature:**
```typescript
async analyzeRejections(
  userId: string,
  workspaceId: string
): Promise<RejectionAnalysis>
```

**Returns:**
```typescript
{
  userId: string;
  workspaceId: string;
  totalRejections: number;
  mostRejectedPatterns: RejectionPattern[];
  mostRejectedHooks: RejectionPattern[];
  rejectionTrends: {
    rejectionsLastWeek: number;
    rejectionsLastMonth: number;
    rejectionRate: number; // % of captions rejected
  };
}
```

**What it analyzes:**
- Which patterns users reject most frequently
- Which hooks users consistently avoid
- Rejection trends over time
- Overall rejection rate

**Example:**
```typescript
const analysis = await feedbackService.analyzeRejections(userId, workspaceId);

// analysis.mostRejectedPatterns:
// [
//   { pattern: 'hot-take-hook', rejectionCount: 15, lastRejectedAt: Date },
//   { pattern: 'question-only-structure', rejectionCount: 12, lastRejectedAt: Date }
// ]

// analysis.rejectionTrends:
// {
//   rejectionsLastWeek: 3,
//   rejectionsLastMonth: 15,
//   rejectionRate: 23.5 // 23.5% of captions rejected
// }
```

**Use Cases:**
- Avoid patterns user has rejected >10 times
- Flag when rejection rate increases (declining quality)
- Prioritize patterns user has never rejected

## Helper Methods

### getPreferredPatterns()

Returns user's most frequently selected patterns for prioritization.

```typescript
async getPreferredPatterns(
  userId: string,
  workspaceId: string
): Promise<string[]>
```

**Returns:** Array of pattern IDs sorted by selection frequency (top 10)

### getRecentFeedback()

Retrieves recent feedback events for analysis.

```typescript
async getRecentFeedback(
  userId: string,
  workspaceId: string,
  limit: number = 50
): Promise<ICaptionFeedback[]>
```

### getFeedbackByType()

Filters feedback by type (selection, edit, rejection, regeneration).

```typescript
async getFeedbackByType(
  userId: string,
  workspaceId: string,
  feedbackType: 'selection' | 'edit' | 'rejection' | 'regeneration',
  limit: number = 50
): Promise<ICaptionFeedback[]>
```

## Technical Details

### Levenshtein Distance

The service uses Levenshtein distance algorithm to calculate edit distance between original and edited captions. This measures the minimum number of single-character edits (insertions, deletions, substitutions) required to change one string into another.

**Implementation:**
- Dynamic programming approach
- O(m*n) time complexity where m, n are string lengths
- Returns integer representing edit distance

**Use Case:**
- Edit distance < 10: Minor tweaks
- Edit distance 10-50: Moderate changes
- Edit distance > 50: Major rewrite

### Emoji Extraction

Uses Unicode regex pattern to extract emojis:
```typescript
/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
```

Covers:
- Emoticons & symbols
- Transport & map symbols  
- Miscellaneous symbols

## Integration Points

### With VoiceProfileService

Feedback data is used to update user voice profiles:
- `VoiceProfileService.updateFromEdit()` - Uses edit analysis
- `VoiceProfileService.updateFromSelection()` - Uses selection data

### With GeneratedCaptionModel

Updates caption records with:
- Selected variation index
- Edit flags and distances
- Original vs edited text

### With ViralPatternService

Pattern performance tracking:
- Increment usage count for selected patterns
- Decrease scores for rejected patterns
- Update pattern success rates

## Usage Examples

### Complete Workflow Example

```typescript
import { FeedbackCaptureService } from './services/FeedbackCaptureService';
import { MongoClient } from 'mongodb';

const mongoClient = new MongoClient(process.env.MONGODB_URI);
await mongoClient.connect();

const feedbackService = new FeedbackCaptureService(
  mongoClient, 
  'veefore_production'
);

// 1. User generates 3 caption variations
const captionId = generatedCaption._id.toString();

// 2. User selects variation 1, rejects 0 and 2
await feedbackService.recordSelection(userId, workspaceId, {
  generatedCaptionId: captionId,
  selectedVariationIndex: 1,
  rejectedVariationIndices: [0, 2]
});

// 3. User edits the selected caption
const original = generatedCaption.variations[1].caption;
const edited = userEditedVersion;

const editAnalysis = await feedbackService.analyzeEdit(
  userId,
  workspaceId,
  captionId,
  original,
  edited
);

console.log(`User made ${editAnalysis.changes.length} changes`);
console.log(`Edit distance: ${editAnalysis.editDistance}`);

// 4. Periodically analyze rejection patterns
const rejectionAnalysis = await feedbackService.analyzeRejections(
  userId,
  workspaceId
);

if (rejectionAnalysis.rejectionTrends.rejectionRate > 30) {
  console.warn('High rejection rate - consider voice profile recalibration');
}

// 5. Get preferred patterns for next generation
const preferredPatterns = await feedbackService.getPreferredPatterns(
  userId,
  workspaceId
);

console.log('Prioritize these patterns:', preferredPatterns);
```

### API Endpoint Integration

```typescript
// POST /api/ai/record-caption-feedback
app.post('/api/ai/record-caption-feedback', async (req, res) => {
  const { userId, workspaceId } = req.user;
  const { 
    generatedCaptionId, 
    selectedVariationIndex, 
    rejectedVariationIndices,
    originalCaption,
    editedCaption
  } = req.body;

  try {
    // Record selection
    if (selectedVariationIndex !== undefined) {
      await feedbackService.recordSelection(userId, workspaceId, {
        generatedCaptionId,
        selectedVariationIndex,
        rejectedVariationIndices
      });
    }

    // Analyze edits if caption was modified
    if (originalCaption && editedCaption && originalCaption !== editedCaption) {
      const editAnalysis = await feedbackService.analyzeEdit(
        userId,
        workspaceId,
        generatedCaptionId,
        originalCaption,
        editedCaption
      );

      res.json({
        success: true,
        message: 'Feedback recorded',
        editAnalysis
      });
    } else {
      res.json({
        success: true,
        message: 'Selection recorded'
      });
    }
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// GET /api/ai/rejection-analysis
app.get('/api/ai/rejection-analysis', async (req, res) => {
  const { userId, workspaceId } = req.user;

  try {
    const analysis = await feedbackService.analyzeRejections(userId, workspaceId);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing rejections:', error);
    res.status(500).json({ error: 'Failed to analyze rejections' });
  }
});
```

## Performance Considerations

### Indexing

The service relies on these indexes for optimal performance:
- `{ userId: 1, workspaceId: 1, timestamp: -1 }` - Recent feedback queries
- `{ userId: 1, feedbackType: 1 }` - Type filtering
- `{ generatedCaptionId: 1 }` - Caption lookup

### Query Optimization

- Uses lean queries when full Mongoose documents aren't needed
- Limits result sets appropriately (default 50)
- Aggregates rejection data efficiently with Map structures

### Scalability

- Asynchronous feedback processing doesn't block user experience
- Feedback storage is append-only (no updates to historical data)
- Can be moved to background job queue for high-volume scenarios

## Testing

Comprehensive test suite covers:
- ✅ Selection tracking with pattern preferences
- ✅ Vocabulary change detection
- ✅ Emoji change detection
- ✅ Structure change detection
- ✅ Length change detection
- ✅ Tone change detection
- ✅ Rejection pattern analysis
- ✅ Preferred pattern extraction
- ✅ Levenshtein distance calculation
- ✅ Error handling for missing captions

**Run tests:**
```bash
npm test -- FeedbackCaptureService.test.ts --run
```

## Future Enhancements

1. **ML-Based Change Classification** - Use machine learning to better classify edit types
2. **Sentiment Analysis** - Detect if edits make captions more/less positive
3. **A/B Testing Support** - Track performance of different pattern combinations
4. **Real-time Feedback** - WebSocket integration for instant learning
5. **Collaborative Filtering** - Learn from similar users' preferences

## Related Services

- `VoiceProfileService` - Uses feedback to update voice profiles
- `ViralPatternService` - Updates pattern performance based on selections
- `EngagementPredictor` - Improves predictions using actual performance data
- `AIContentGenerator` - Consumes feedback to improve generation quality

## Maintenance

### Monitoring

Monitor these metrics:
- Average edit distance (should stabilize as system learns)
- Rejection rate by user (flag outliers)
- Feedback capture rate (ensure users are providing feedback)
- Pattern selection diversity (avoid over-reliance on single pattern)

### Data Retention

Consider retention policy for feedback data:
- Keep recent 6 months for active learning
- Archive older data for trend analysis
- Aggregate monthly statistics for long-term insights
