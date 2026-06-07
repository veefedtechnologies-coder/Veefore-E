# VoiceProfileEvolution Component

## Overview

The `VoiceProfileEvolution` component displays how a user's voice profile has evolved over time, showing learning progress, milestones achieved, and acceptance rate trends. This component helps users understand how the AI is learning their writing style and improving caption generation accuracy.

## Features

- **Timeline View**: Shows snapshots of voice profile changes over time with key metrics
- **Milestones View**: Displays learning achievements and improvements
- **Acceptance Rate Trends**: Tracks how often users accept AI-generated captions without edits
- **Growth Metrics**: Shows confidence growth, sample growth, and time span
- **Compact Mode**: Simplified view for dashboards and sidebars
- **Responsive Design**: Works on all screen sizes
- **Empty States**: Informative messages when no data is available
- **Loading States**: Smooth loading experience with spinners

## Props

```typescript
interface VoiceProfileEvolutionProps {
  workspaceId: string     // Required: Workspace ID to load evolution data for
  compact?: boolean       // Optional: Show compact view (default: false)
}
```

## Usage

### Basic Usage

```tsx
import { VoiceProfileEvolution } from '@/components/voice-profile'

function MyComponent() {
  return (
    <VoiceProfileEvolution workspaceId="workspace-123" />
  )
}
```

### Compact View

```tsx
import { VoiceProfileEvolution } from '@/components/voice-profile'

function DashboardSidebar() {
  return (
    <div className="space-y-4">
      <VoiceProfileEvolution 
        workspaceId="workspace-123" 
        compact={true}
      />
    </div>
  )
}
```

## Data Structure

### Voice Profile Snapshot

```typescript
interface VoiceProfileSnapshot {
  date: Date
  confidence: number
  sampleSize: number
  toneMarkers: {
    casual: number
    professional: number
    humorous: number
    inspirational: number
    educational: number
    conversational: number
  }
  topVocabulary: string[]
  signaturePhrases: string[]
  acceptanceRate?: number
}
```

### Learning Milestone

```typescript
interface LearningMilestone {
  id: string
  date: Date
  type: 'pattern_discovered' | 'accuracy_improved' | 'profile_updated' | 'feedback_integrated'
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
}
```

### Acceptance Rate Trend

```typescript
interface AcceptanceRateTrend {
  date: string
  acceptanceRate: number
  totalGenerated: number
  totalAccepted: number
}
```

## API Endpoint

The component fetches data from:

```
GET /api/voice-profile/:workspaceId/evolution
```

Expected response:

```json
{
  "success": true,
  "snapshots": [/* VoiceProfileSnapshot[] */],
  "milestones": [/* LearningMilestone[] */],
  "acceptanceTrend": [/* AcceptanceRateTrend[] */]
}
```

## Tabs

### 1. Timeline Tab
- Displays chronological snapshots of voice profile changes
- Shows confidence score, primary tone, sample size
- Displays top vocabulary and signature phrases for each snapshot
- Highlights the current/latest snapshot

### 2. Milestones Tab
- Lists learning achievements and improvements
- Categorized by milestone type (pattern discovered, accuracy improved, etc.)
- Shows impact level (high/medium/low) for each milestone
- Ordered by most recent first

### 3. Acceptance Rate Tab
- Tracks caption acceptance trends over time
- Shows monthly acceptance rates with progress bars
- Displays ratio of accepted vs total generated captions
- Includes informative banner about improving acceptance

## Styling

The component uses:
- Tailwind CSS for styling
- Lucide React for icons
- shadcn/ui components (Card, Badge, Progress, Tabs)
- Responsive grid layouts
- Dark mode support (via dark: classes)

## States

### Loading State
- Shows spinner with "Loading evolution data..." message
- Centered layout for better UX

### Error State
- Displays error message in red-bordered card
- Includes "Try Again" button to retry loading

### Empty State
- Shows when no evolution data exists
- Informative message explaining data will be tracked over time

### No Data States (per tab)
- Specific empty states for each tab
- Icon and message indicating no data for that view

## Compact Mode

When `compact={true}`:
- Shows simplified card with key metrics
- Displays confidence change and sample growth
- Shows most recent milestone
- Ideal for sidebars and dashboard widgets
- Takes up less vertical space

## Full Mode Features

1. **Growth Overview Cards**
   - Confidence growth percentage
   - Sample growth count
   - Milestone count

2. **Timeline View**
   - Reverse chronological order (latest first)
   - Current snapshot highlighted with purple border
   - Shows all profile characteristics per snapshot
   - Expandable vocabulary and phrase lists

3. **Milestone Cards**
   - Visual icons per milestone type
   - Impact level badges
   - Detailed descriptions
   - Hover effects for interactivity

4. **Acceptance Rate Chart**
   - Progress bars showing monthly trends
   - Detailed metrics (accepted/total)
   - Informative tip about improvement

## Dependencies

- React
- @/components/ui/card
- @/components/ui/badge
- @/components/ui/progress
- @/components/ui/tabs
- lucide-react
- @/lib/utils (cn function)
- @/lib/queryClient (apiRequest)

## Related Components

- `VoiceProfileViewer`: Shows current voice profile details
- `VoiceProfileSetup`: Handles initial voice profile creation
- `CaptionPerformanceInsights`: Shows caption performance analytics

## Notes

- The component automatically loads data on mount
- Data is refetched when `workspaceId` changes
- All dates are formatted using locale-aware formatting
- Percentages are rounded to 1 decimal place for readability
- Growth calculations require at least 2 snapshots
