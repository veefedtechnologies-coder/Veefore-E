# Voice Profile Setup Component

A multi-step wizard component for analyzing users' writing styles and creating voice profiles for authentic Instagram caption generation.

## Features

- **4-Step Wizard Interface**
  1. Introduction/explanation screen
  2. Caption input form (minimum 5 captions)
  3. Analysis in progress state with loading indicators
  4. Results display with voice profile summary

- **Voice Profile Analysis**
  - Vocabulary patterns and signature phrases
  - Tone markers (casual, professional, humorous, etc.)
  - Emoji usage patterns (frequency, placement, top emojis)
  - Punctuation style (exclamations, questions, ellipsis)
  - Sentence length distribution
  - Paragraph structure preferences

- **User Experience**
  - Responsive design (mobile and desktop)
  - Progress tracking with visual indicators
  - Error handling for API failures
  - Validation for minimum caption requirements
  - Real-time feedback on caption count

## Usage

### Basic Usage

```tsx
import { VoiceProfileSetup } from '@/components/voice-profile'

function MyComponent() {
  const handleComplete = (profile) => {
    console.log('Voice profile created:', profile)
    // Handle completion (e.g., navigate, show toast, update state)
  }

  const handleSkip = () => {
    console.log('User skipped setup')
    // Handle skip action
  }

  return (
    <VoiceProfileSetup
      workspaceId="workspace-123"
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  )
}
```

### In a Dialog/Modal

```tsx
import { VoiceProfileSetup } from '@/components/voice-profile'
import { Dialog, DialogContent } from '@/components/ui/dialog'

function MyComponent() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <VoiceProfileSetup
          workspaceId="workspace-123"
          onComplete={(profile) => {
            setOpen(false)
            // Handle completion
          }}
          onSkip={() => {
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
```

### As a Full Page

```tsx
import { VoiceProfileSetup } from '@/components/voice-profile'

function VoiceProfileSetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <VoiceProfileSetup
        workspaceId="workspace-123"
        onComplete={(profile) => {
          // Navigate to dashboard
          window.location.href = '/dashboard'
        }}
        onSkip={() => {
          // Navigate to dashboard
          window.location.href = '/dashboard'
        }}
      />
    </div>
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | `string` | Yes | The workspace ID to associate the voice profile with |
| `onComplete` | `(profile: VoiceProfile) => void` | No | Callback function called when setup is completed successfully |
| `onSkip` | `() => void` | No | Callback function called when user skips the setup |

## API Integration

The component calls the following API endpoint:

**POST** `/api/voice-profile/analyze`

Request body:
```json
{
  "workspaceId": "workspace-123",
  "sampleCaptions": [
    "Caption 1 text...",
    "Caption 2 text...",
    "Caption 3 text...",
    "Caption 4 text...",
    "Caption 5 text..."
  ]
}
```

Expected response:
```json
{
  "success": true,
  "voiceProfile": {
    "userId": "user-123",
    "workspaceId": "workspace-123",
    "vocabularyFrequency": { ... },
    "signaturePhrases": [ ... ],
    "sentenceLengthDistribution": { ... },
    "emojiUsagePattern": { ... },
    "toneMarkers": { ... },
    "confidence": 0.85,
    "sampleSize": 5,
    ...
  }
}
```

## Voice Profile Structure

```typescript
interface VoiceProfile {
  userId: string
  workspaceId: string
  vocabularyFrequency: Record<string, number>
  signaturePhrases: string[]
  sentenceLengthDistribution: {
    short: number    // 0-1 (percentage)
    medium: number   // 0-1 (percentage)
    long: number     // 0-1 (percentage)
  }
  paragraphStructure: 'single' | 'short-breaks' | 'long-form'
  emojiUsagePattern: {
    frequency: 'none' | 'minimal' | 'moderate' | 'heavy'
    placement: 'inline' | 'end' | 'both'
    topEmojis: string[]
  }
  punctuationStyle: {
    exclamationUsage: 'rare' | 'moderate' | 'frequent'
    questionUsage: 'rare' | 'moderate' | 'frequent'
    ellipsisUsage: boolean
  }
  toneMarkers: {
    casual: number         // 0-1
    professional: number   // 0-1
    humorous: number       // 0-1
    inspirational: number  // 0-1
    educational: number    // 0-1
    conversational: number // 0-1
  }
  hookPatterns: string[]
  engagementQuestionStyle: string[]
  storytellingStructure: string
  sampleSize: number
  confidence: number  // 0-1
  lastUpdated: Date
  createdAt: Date
}
```

## Styling

The component uses Tailwind CSS and follows the project's design system with:
- Gradient backgrounds (purple-pink theme)
- Responsive layouts
- Consistent spacing and typography
- Smooth animations and transitions
- Accessible UI components from `@/components/ui`

## Dependencies

- React (hooks: useState)
- UI Components: Card, Button, Textarea, Label, Progress, Badge
- Icons: lucide-react (ChevronRight, ChevronLeft, Sparkles, MessageSquare, CheckCircle2, AlertCircle, Loader2, Info)
- API client: `@/lib/queryClient`

## Error Handling

The component handles the following error scenarios:
- API request failures
- Network errors
- Invalid response format
- Insufficient caption data

Errors are displayed to the user with clear messaging and options to retry.

## Accessibility

- Semantic HTML structure
- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Screen reader friendly

## Future Enhancements

Potential improvements:
- Instagram account connection flow
- Voice profile preview before analysis
- Ability to edit/update profile after creation
- Comparison with other creators' styles
- Export/import voice profiles
- Multi-language support

## Related Components

- `VoiceProfileViewer` - View and edit existing voice profiles
- `CaptionVariationSelector` - Use voice profiles for caption generation

## Support

For issues or questions, please refer to the main project documentation or contact the development team.
