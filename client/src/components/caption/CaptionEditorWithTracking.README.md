# Caption Editor With Tracking Component

## Overview

The `CaptionEditorWithTracking` component is an intelligent caption editor that provides real-time authenticity scoring and engagement predictions as users edit their captions. It tracks all changes for voice profile learning, helping the AI improve future caption generation based on user preferences and editing patterns.

## Features

- **Real-time Authenticity Scoring**: Shows how human-like the caption sounds as you type (0-100 scale)
- **Live Engagement Predictions**: Updates predicted like rate, comment rate, save rate, and share rate in real-time
- **Change Tracking**: Automatically tracks edits for voice profile learning
- **Smart Feedback**: Provides contextual tips when authenticity score is below threshold
- **Character Count**: Displays character usage with visual warnings near limit
- **Debounced Calculations**: Optimized performance with 500ms debounce on metric updates
- **Save State Management**: Tracks unsaved changes and provides save functionality
- **Dark Mode Support**: Full theme support with adaptive colors

## Props

```typescript
interface CaptionEditorWithTrackingProps {
  // Initial caption text to edit
  initialCaption: string;
  
  // Optional initial variation data (includes initial scores)
  initialVariation?: CaptionVariation;
  
  // Callback when user saves the caption
  onSave: (editedCaption: string, originalCaption: string) => void;
  
  // Optional callback for real-time caption changes
  onChange?: (caption: string) => void;
  
  // Optional workspace ID for tracking context
  workspaceId?: string;
  
  // Optional caption ID for tracking context
  captionId?: string;
  
  // Character limit (default: 2200 for Instagram)
  maxLength?: number;
  
  // Placeholder text for empty editor
  placeholder?: string;
  
  // Disabled state
  disabled?: boolean;
}
```

## Usage Examples

### Basic Usage

```tsx
import { CaptionEditorWithTracking } from '@/components/caption';

function EditCaptionPage() {
  const [caption] = useState("Your initial caption here");

  const handleSave = async (editedCaption: string, originalCaption: string) => {
    console.log('Edited:', editedCaption);
    console.log('Original:', originalCaption);
    
    // Save to your backend
    await saveCaptionToDatabase(editedCaption);
  };

  return (
    <CaptionEditorWithTracking
      initialCaption={caption}
      onSave={handleSave}
    />
  );
}
```

### With Variation Data

```tsx
import { CaptionEditorWithTracking, CaptionVariation } from '@/components/caption';

function EditSelectedVariation() {
  const selectedVariation: CaptionVariation = {
    caption: "Great caption from AI",
    authenticityScore: 85,
    engagementPrediction: {
      likeRate: 0.05,
      commentRate: 0.02,
      saveRate: 0.01,
      shareRate: 0.005
    },
    styleCharacteristics: {
      type: 'authentic',
      description: 'Personal storytelling approach'
    }
  };

  const handleSave = async (editedCaption: string, originalCaption: string) => {
    // Record the edits for learning
    await recordCaptionFeedback({
      feedbackType: 'edited',
      originalCaption,
      editedCaption
    });
  };

  return (
    <CaptionEditorWithTracking
      initialCaption={selectedVariation.caption}
      initialVariation={selectedVariation}
      onSave={handleSave}
      workspaceId="workspace-123"
      captionId="caption-456"
    />
  );
}
```

### With Real-time Updates

```tsx
import { CaptionEditorWithTracking } from '@/components/caption';

function CreatePostWithLivePreview() {
  const [caption, setCaption] = useState("");
  const [previewCaption, setPreviewCaption] = useState("");

  const handleCaptionChange = (newCaption: string) => {
    setPreviewCaption(newCaption);
  };

  const handleSave = async (editedCaption: string) => {
    setCaption(editedCaption);
    await publishPost({ caption: editedCaption });
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <CaptionEditorWithTracking
          initialCaption={caption}
          onChange={handleCaptionChange}
          onSave={handleSave}
        />
      </div>
      <div className="preview">
        <h3>Live Preview</h3>
        <p>{previewCaption}</p>
      </div>
    </div>
  );
}
```

### Integration with Variation Selector

```tsx
import { 
  CaptionVariationSelector, 
  CaptionEditorWithTracking,
  CaptionVariation 
} from '@/components/caption';

function CaptionGenerationFlow() {
  const [variations, setVariations] = useState<CaptionVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<CaptionVariation | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [isEditing, setIsEditing] = useState(false);

  const handleSelectVariation = (index: number, variation: CaptionVariation) => {
    setSelectedIndex(index);
    setSelectedVariation(variation);
  };

  const handleEditSelected = () => {
    if (selectedVariation) {
      setIsEditing(true);
    }
  };

  const handleSaveEdited = async (editedCaption: string, originalCaption: string) => {
    // Record feedback for learning
    await apiRequest('/api/v1/ai/record-caption-feedback', {
      method: 'POST',
      body: JSON.stringify({
        feedbackType: 'edited',
        originalCaption,
        editedCaption,
        captionId: 'generated-caption-id',
        workspaceId: 'workspace-id'
      })
    });

    // Update voice profile asynchronously
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {!isEditing ? (
        <>
          <CaptionVariationSelector
            variations={variations}
            onSelectVariation={handleSelectVariation}
            onRegenerateAll={handleRegenerate}
            selectedIndex={selectedIndex}
          />
          
          {selectedVariation && (
            <Button onClick={handleEditSelected}>
              Edit Selected Caption
            </Button>
          )}
        </>
      ) : (
        <CaptionEditorWithTracking
          initialCaption={selectedVariation!.caption}
          initialVariation={selectedVariation!}
          onSave={handleSaveEdited}
          workspaceId="workspace-id"
          captionId="generated-caption-id"
        />
      )}
    </div>
  );
}
```

## Features Breakdown

### Authenticity Scoring

The component calculates authenticity score based on:

- **AI Tell Detection**: Identifies common AI phrases like "delve", "leverage", "transform", etc.
- **Corporate Jargon**: Flags business buzzwords like "synergy", "paradigm", "robust"
- **Positive Indicators**: 
  - Use of contractions (it's, don't, you're) +5 points
  - Questions (+3 points)
  - Emojis (+3 points)
  - Good sentence variety (+5 points)

**Score Interpretation:**
- 90-100: Excellent (Green) - Very human-like
- 80-89: Good (Blue) - Passes threshold
- 70-79: Fair (Yellow) - Needs improvement
- 0-69: Poor (Red) - Sounds AI-generated

### Engagement Predictions

The component predicts engagement based on:

- **Hook Strength**: Checks for viral hooks in first 10 words (POV, Hot take, etc.)
- **Engagement Questions**: Presence of questions increases comment rate
- **Educational Value**: Keywords like "tip", "guide", "how to" increase save rate
- **Controversial Content**: Opinion-related content increases comments and shares
- **Emotional Resonance**: Strong emotional words boost likes and shares
- **Length Optimization**: Sweet spot of 100-200 words for Instagram

**Base Rates (Instagram average):**
- Like Rate: 3%
- Comment Rate: 0.3%
- Save Rate: 0.5%
- Share Rate: 0.1%

Bonuses are added based on caption characteristics.

### Change Tracking

The component tracks:
1. **Character-level changes**: Monitors every keystroke
2. **Has changes flag**: Indicates if caption differs from original
3. **Original caption**: Preserved in ref for comparison
4. **Save state**: Manages when changes can be saved

When `onSave` is called, it provides both the edited caption and original caption, allowing the backend to:
- Calculate edit distance
- Identify preferred vocabulary changes
- Detect structural modifications
- Update voice profile based on patterns

### Performance Optimization

- **Debouncing**: 500ms debounce on metric calculations prevents lag
- **Memoized calculations**: Uses `useCallback` for score functions
- **Efficient re-renders**: Only updates when necessary
- **Cleanup**: Properly cleans up timers on unmount

## Visual States

### Character Count Colors
- **Normal**: Gray (0-89% of limit)
- **Warning**: Yellow (90-99% of limit)
- **At Limit**: Red (100% of limit)

### Authenticity Tips
Shows contextual tips when score is below 80:
- Use contractions for conversational tone
- Avoid corporate buzzwords
- Add personal touches
- Vary sentence lengths

## Accessibility

- Semantic HTML structure
- Keyboard navigation support
- ARIA labels for screen readers
- Color is not the only indicator (icons and text labels included)
- Focus management for textarea

## Responsive Design

- Full-width on mobile
- Adaptive spacing
- Touch-friendly textarea
- Readable font sizes on all devices

## Integration with Backend

### Expected API Calls

When saving edited captions, the component expects you to call:

```typescript
POST /api/v1/ai/record-caption-feedback
{
  captionId: string,
  workspaceId: string,
  feedbackType: 'edited',
  editedVersion: string,
  originalVersion?: string
}
```

This allows the backend `FeedbackCaptureService` to:
1. Calculate edit distance
2. Identify vocabulary changes
3. Detect structural preferences
4. Update voice profile asynchronously

### Voice Profile Updates

The backend will analyze edits to learn:
- Preferred vocabulary replacements
- Sentence structure preferences
- Emoji usage patterns
- Tone adjustments
- Hook modifications

## Testing

### Unit Tests

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CaptionEditorWithTracking } from './CaptionEditorWithTracking';

test('displays initial caption', () => {
  render(
    <CaptionEditorWithTracking
      initialCaption="Test caption"
      onSave={jest.fn()}
    />
  );
  
  expect(screen.getByDisplayValue('Test caption')).toBeInTheDocument();
});

test('updates metrics on caption change', async () => {
  const { getByRole } = render(
    <CaptionEditorWithTracking
      initialCaption=""
      onSave={jest.fn()}
    />
  );
  
  const textarea = getByRole('textbox');
  fireEvent.change(textarea, { 
    target: { value: "Amazing new caption with it's and you're!" } 
  });
  
  await waitFor(() => {
    expect(screen.getByText(/Authenticity:/)).toBeInTheDocument();
  }, { timeout: 1000 });
});

test('calls onSave with edited and original captions', async () => {
  const onSave = jest.fn();
  const { getByRole, getByText } = render(
    <CaptionEditorWithTracking
      initialCaption="Original"
      onSave={onSave}
    />
  );
  
  const textarea = getByRole('textbox');
  fireEvent.change(textarea, { target: { value: "Edited caption" } });
  
  await waitFor(() => {
    fireEvent.click(getByText('Save Changes'));
  });
  
  expect(onSave).toHaveBeenCalledWith("Edited caption", "Original");
});

test('disables save button when no changes', () => {
  render(
    <CaptionEditorWithTracking
      initialCaption="Test"
      onSave={jest.fn()}
    />
  );
  
  const saveButton = screen.getByRole('button', { name: /Save Changes/ });
  expect(saveButton).toBeDisabled();
});
```

### Integration Tests

Test the complete flow with variation selector and backend integration:

```tsx
test('complete edit and save flow', async () => {
  const mockVariation = {
    caption: 'AI generated caption',
    authenticityScore: 85,
    engagementPrediction: { likeRate: 0.05 },
    styleCharacteristics: { type: 'authentic', description: 'Test' }
  };

  const mockSave = jest.fn().mockResolvedValue({ success: true });

  const { getByRole, getByText } = render(
    <CaptionEditorWithTracking
      initialCaption={mockVariation.caption}
      initialVariation={mockVariation}
      onSave={mockSave}
      workspaceId="ws-123"
      captionId="cap-456"
    />
  );

  // Edit the caption
  const textarea = getByRole('textbox');
  fireEvent.change(textarea, { 
    target: { value: "Edited with my personal touch!" } 
  });

  // Wait for metrics to update
  await waitFor(() => {
    expect(getByText(/Unsaved changes/)).toBeInTheDocument();
  });

  // Save
  fireEvent.click(getByText('Save Changes'));

  await waitFor(() => {
    expect(mockSave).toHaveBeenCalled();
  });
});
```

## Spec Requirements Validation

This component implements Task 19.2 from the spec:

✅ **Edit captions with tracking** - Full textarea editor with change detection  
✅ **Track edit changes for learning** - Provides original and edited versions to onSave  
✅ **Show inline authenticity score** - Real-time score display with visual meter  
✅ **Show engagement predictions** - Live updates for all 4 engagement metrics  
✅ **Real-time updates** - Debounced calculations update as user types  

Maps to Requirements:
- **Requirement 10.1**: Edit analysis for voice profile learning
- **Requirement 4.2**: Authenticity score display
- **Requirement 9.2**: Engagement prediction display
- **Requirement 1.5**: Voice profile updates from edits

## Related Components

- `CaptionVariationSelector` - Selects from multiple AI-generated variations
- `VoiceProfileSetup` - Initial voice profile creation
- `VoiceProfileViewer` - View voice profile characteristics

## Future Enhancements

Potential improvements:
1. Real-time collaborative editing
2. Suggestion tooltips for improvement
3. Voice profile match indicator
4. Edit history/undo functionality
5. Template insertion shortcuts
6. Hashtag suggestions inline
7. Emoji picker integration
8. Voice profile comparison (before/after edit)
9. Advanced A/B testing suggestions
10. Integration with grammar/spelling check

## Technical Notes

### Why Client-side Scoring?

The authenticity and engagement scoring is done client-side for:
- **Performance**: Instant feedback without API calls
- **Cost**: No server resources for real-time calculations
- **Privacy**: Edit content stays local until save
- **UX**: Smooth, responsive experience

The client-side scores are simplified heuristics. The backend performs more sophisticated analysis when saving for voice profile updates.

### Debounce Strategy

The 500ms debounce balances:
- **Responsiveness**: Updates feel instant
- **Performance**: Avoids excessive calculations
- **Battery**: Reduces CPU usage on mobile
- **UX**: No lag during typing

## Browser Compatibility

Tested and working on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## License

Part of the Veefore E authentic Instagram caption generation system.
