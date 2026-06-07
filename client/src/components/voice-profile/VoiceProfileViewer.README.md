# Voice Profile Viewer Component

A comprehensive component for displaying and managing voice profiles. Shows voice profile metrics, characteristics, and allows recalibration.

## Features

- **Two View Modes**
  - Full view: Complete profile details with all metrics and patterns
  - Compact view: Summary card for dashboards and sidebars

- **Voice Profile Display**
  - Confidence score visualization
  - Tone markers (casual, professional, humorous, etc.)
  - Emoji usage patterns (frequency, placement, top emojis)
  - Punctuation style (exclamations, questions, ellipsis)
  - Signature phrases and common vocabulary
  - Sentence length distribution
  - Paragraph structure preferences
  - Hook patterns and engagement question styles

- **Management Features**
  - Recalibrate profile based on recent captions
  - Edit samples (triggers onEdit callback)
  - Auto-refresh on load
  - Error handling and loading states

- **User Experience**
  - Responsive design (mobile and desktop)
  - Clean, organized layout with cards
  - Visual indicators (progress bars, badges)
  - Date formatting for metadata
  - Loading and error states

## Usage

### Full View

```tsx
import { VoiceProfileViewer } from '@/components/voice-profile'

function MyComponent() {
  const handleRecalibrate = () => {
    console.log('Profile recalibrated')
    // Show toast, refresh data, etc.
  }

  const handleEdit = () => {
    console.log('Edit samples')
    // Navigate to edit page or open modal
  }

  return (
    <VoiceProfileViewer
      workspaceId="workspace-123"
      onRecalibrate={handleRecalibrate}
      onEdit={handleEdit}
    />
  )
}
```

### Compact View (Dashboard/Sidebar)

```tsx
import { VoiceProfileViewer } from '@/components/voice-profile'

function Sidebar() {
  return (
    <div className="space-y-4">
      <VoiceProfileViewer
        workspaceId="workspace-123"
        compact={true}
        onEdit={() => navigate('/voice-profile')}
      />
      {/* Other sidebar components */}
    </div>
  )
}
```

### In a Settings Page

```tsx
import { VoiceProfileViewer } from '@/components/voice-profile'

function SettingsPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Voice Profile Settings</h1>
      <VoiceProfileViewer
        workspaceId={currentWorkspace.id}
        onRecalibrate={() => {
          toast.success('Voice profile recalibrated successfully!')
        }}
        onEdit={() => {
          navigate('/voice-profile/edit')
        }}
      />
    </div>
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceId` | `string` | Yes | The workspace ID to load the voice profile for |
| `onRecalibrate` | `() => void` | No | Callback function called when recalibration completes successfully |
| `onEdit` | `() => void` | No | Callback function called when user clicks edit button |
| `compact` | `boolean` | No | If true, displays compact summary view. Default: false |

## API Integration

The component calls the following API endpoints:

### GET Voice Profile

**GET** `/api/voice-profile/:workspaceId`

Expected response:
```json
{
  "success": true,
  "voiceProfile": {
    "userId": "user-123",
    "workspaceId": "workspace-123",
    "vocabularyFrequency": { "love": 15, "amazing": 12, ... },
    "signaturePhrases": ["let's be real", "here's the thing"],
    "sentenceLengthDistribution": {
      "short": 0.3,
      "medium": 0.5,
      "long": 0.2
    },
    "emojiUsagePattern": {
      "frequency": "moderate",
      "placement": "inline",
      "topEmojis": ["✨", "💪", "🔥"]
    },
    "toneMarkers": {
      "casual": 0.8,
      "professional": 0.3,
      "humorous": 0.6,
      ...
    },
    "confidence": 0.87,
    "sampleSize": 15,
    "lastUpdated": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-01T10:00:00Z",
    ...
  }
}
```

### Recalibrate Voice Profile

**PUT** `/api/voice-profile/:workspaceId/recalibrate`

Expected response:
```json
{
  "success": true,
  "voiceProfile": {
    // Updated voice profile object
    ...
  }
}
```

## Voice Profile Structure

```typescript
interface VoiceProfile {
  userId: string
  workspaceId: string
  
  // Vocabulary
  vocabularyFrequency: Record<string, number>  // word → count
  signaturePhrases: string[]
  
  // Structure
  sentenceLengthDistribution: {
    short: number    // 0-1 (percentage)
    medium: number   // 0-1 (percentage)
    long: number     // 0-1 (percentage)
  }
  paragraphStructure: 'single' | 'short-breaks' | 'long-form'
  
  // Style
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
  
  // Tone
  toneMarkers: {
    casual: number         // 0-1
    professional: number   // 0-1
    humorous: number       // 0-1
    inspirational: number  // 0-1
    educational: number    // 0-1
    conversational: number // 0-1
  }
  
  // Patterns
  hookPatterns: string[]
  engagementQuestionStyle: string[]
  storytellingStructure: string
  
  // Metadata
  sampleSize: number
  confidence: number  // 0-1
  lastUpdated: Date
  createdAt: Date
}
```

## View Modes

### Full View (compact=false)

Displays all voice profile information in a comprehensive layout:
- Header with title and action buttons
- Metadata cards (confidence, sample size, dates)
- Tone profile with progress bars
- Emoji and punctuation style cards
- Signature phrases and vocabulary
- Writing structure metrics
- Hook patterns
- Engagement question styles

### Compact View (compact=true)

Displays a summary card suitable for sidebars:
- Confidence score
- Top 3 tone markers
- Sample count and last updated date
- Recalibrate button

## Styling

The component uses Tailwind CSS and follows the project's design system with:
- Gradient backgrounds (purple-pink theme for primary actions)
- Responsive grid layouts
- Consistent spacing and typography
- Progress bars for visualizing scores
- Badge components for categories
- Card-based layout for organization

## Dependencies

- React (hooks: useState, useEffect)
- UI Components: Card, Button, Progress, Badge
- Icons: lucide-react (RefreshCw, Sparkles, MessageSquare, AlertCircle, Loader2, Calendar, TrendingUp, Edit3, ChevronRight)
- API client: `@/lib/queryClient`

## Error Handling

The component handles the following error scenarios:
- API request failures
- Network errors
- Missing voice profile (user hasn't created one yet)
- Invalid response format

Errors are displayed with clear messaging and options to retry.

## Loading States

The component shows appropriate loading states during:
- Initial profile load
- Recalibration process

Uses spinner animations and disabled states for better UX.

## Accessibility

- Semantic HTML structure
- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Screen reader friendly

## Usage Examples

### In a Settings Dashboard

```tsx
function VoiceProfileSettings() {
  const { currentWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const toast = useToast()

  return (
    <div className="container mx-auto py-8">
      <VoiceProfileViewer
        workspaceId={currentWorkspace.id}
        onRecalibrate={() => {
          toast({
            title: 'Profile Updated',
            description: 'Your voice profile has been recalibrated based on recent captions.',
          })
        }}
        onEdit={() => {
          navigate('/voice-profile/edit')
        }}
      />
    </div>
  )
}
```

### As a Dashboard Widget

```tsx
function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-2">
        {/* Main content */}
      </div>
      <div className="space-y-6">
        <VoiceProfileViewer
          workspaceId={workspaceId}
          compact={true}
          onEdit={() => navigate('/settings/voice-profile')}
        />
        {/* Other widgets */}
      </div>
    </div>
  )
}
```

### With Custom Styling

```tsx
function CustomVoiceProfileView() {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-8 rounded-xl">
      <VoiceProfileViewer
        workspaceId={workspaceId}
        onRecalibrate={handleRecalibrate}
        onEdit={handleEdit}
      />
    </div>
  )
}
```

## Related Components

- `VoiceProfileSetup` - Initial voice profile creation wizard
- `CaptionVariationSelector` - Uses voice profiles for caption generation
- `CaptionEditorWithTracking` - Updates voice profiles based on user edits

## Future Enhancements

Potential improvements:
- Export voice profile data
- Compare voice profiles over time
- Voice profile analytics (evolution, trends)
- Voice profile templates/presets
- Sharing voice profiles
- Multi-language support
- Voice profile versioning

## Support

For issues or questions, please refer to the main project documentation or contact the development team.
