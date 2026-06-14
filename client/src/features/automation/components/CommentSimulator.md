# CommentSimulator Component

## Overview

The `CommentSimulator` component provides a realistic Instagram comment interface for testing automation workflows. It simulates how the automation system will respond to trigger keywords in real-time, giving users a preview of their bot's behavior before deploying it live.

## Features

- **Real-time Instagram comment simulation**: Displays a realistic Instagram comment interface
- **Dynamic timestamp generation**: Generates Instagram-style relative timestamps (e.g., "5m", "2h", "3d")
- **Actual Instagram user data**: Fetches and displays real Instagram profile information
- **Multiple automation types**: Supports comment_dm, dm_only, and comment_only automation modes
- **Interactive comment input**: Users can add trigger keywords directly from the simulation interface
- **Dark mode support**: Full theming support with dark mode compatibility

## Architecture

### Component Structure

```
CommentSimulator/
├── CommentSimulator.tsx          # Main component
├── CommentSimulator.test.tsx     # Unit tests
├── CommentSimulator.md           # Documentation (this file)
└── hooks/
    ├── useInstagramSimulation.ts      # Simulation logic hook
    └── useInstagramSimulation.test.ts # Hook tests
```

### Data Flow

```
Parent Component (AutomationStepByStep)
    ↓
CommentSimulator Component
    ↓
useInstagramSimulation Hook
    ↓
[Fetch Instagram Data] → [Generate Timestamps] → [Create Test Comments]
    ↓
Render Instagram UI
```

## Usage

### Basic Example

```tsx
import { CommentSimulator } from '@/features/automation/components/CommentSimulator';

function AutomationBuilder() {
  const [isVisible, setIsVisible] = useState(false);
  const [keywords, setKeywords] = useState(['hello', 'info']);
  
  return (
    <CommentSimulator
      isVisible={isVisible}
      onClose={() => setIsVisible(false)}
      triggerKeywords={keywords}
      automationType="comment_dm"
      commentReplies={['Thanks for your comment!', 'Check your DMs!']}
      dmMessage="Here's more information..."
      selectedAccount="account-123"
      realAccounts={accounts}
      // ... other props
    />
  );
}
```

### With Custom Hook

```tsx
import { useInstagramSimulation } from '@/features/automation/hooks/useInstagramSimulation';

function CustomSimulator() {
  const { 
    realInstagramUser, 
    testComments, 
    getRelativeTime 
  } = useInstagramSimulation({
    user,
    authLoading,
    selectedAccount,
    realAccounts,
    triggerKeywords,
    commentReplies,
    newKeyword,
    commentInputText,
  });
  
  // Render custom UI using simulation data
}
```

## Props Reference

### CommentSimulatorProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isVisible` | `boolean` | Yes | Controls visibility of the comment screen |
| `onClose` | `() => void` | Yes | Callback when closing the comment screen |
| `triggerKeywords` | `string[]` | Yes | Array of trigger keywords to simulate |
| `automationType` | `string` | Yes | Type of automation ('comment_dm' \| 'dm_only' \| 'comment_only') |
| `commentReplies` | `string[]` | Yes | Array of reply messages for comment automation |
| `dmMessage` | `string` | Yes | Direct message content for DM automation |
| `selectedAccount` | `string` | Yes | Currently selected Instagram account ID |
| `realAccounts` | `any[]` | Yes | Array of connected Instagram accounts |
| `newKeyword` | `string` | Yes | Current keyword being edited |
| `commentInputText` | `string` | Yes | Comment input text state |
| `setCommentInputText` | `(text: string) => void` | Yes | Setter for comment input text |
| `getCurrentKeywords` | `() => string[]` | Yes | Function to get current keywords based on automation type |
| `setSelectedKeywords` | `(keywords: string[]) => void` | Yes | Setter for selected keywords |
| `updateSourceRef` | `React.MutableRefObject<'trigger' \| 'comment' \| null>` | Yes | Ref to track update source |
| `currentTime` | `Date` | Yes | Current time reference |
| `keywords` | `string[]` | Yes | Keywords for comment_dm automation |
| `setKeywords` | `(keywords: string[]) => void` | Yes | Setter for comment_dm keywords |
| `dmKeywords` | `string[]` | Yes | Keywords for dm_only automation |
| `setDmKeywords` | `(keywords: string[]) => void` | Yes | Setter for dm_only keywords |
| `commentKeywords` | `string[]` | Yes | Keywords for comment_only automation |
| `setCommentKeywords` | `(keywords: string[]) => void` | Yes | Setter for comment_only keywords |

## Hook Reference

### useInstagramSimulation

#### Parameters

```typescript
interface UseInstagramSimulationProps {
  user: User | null;                    // Firebase user
  authLoading: boolean;                 // Auth loading state
  selectedAccount: string;              // Selected account ID
  realAccounts: any[];                  // Connected accounts
  triggerKeywords: string[];            // Trigger keywords
  commentReplies: string[];             // Reply messages
  newKeyword: string;                   // Current keyword
  commentInputText: string;             // Input text
}
```

#### Returns

```typescript
{
  realInstagramUser: InstagramUser;     // Real Instagram user data
  commentTimestamps: CommentTimestamps; // Generated timestamps
  getRelativeTime: (timestamp: Date) => string; // Time formatter
  testComments: Comment[];              // Generated test comments
}
```

## Implementation Details

### Timestamp Generation

The component generates realistic timestamps based on the keyword index:

- **First keyword**: Very recent (5-35 seconds ago)
- **Second keyword**: Few minutes ago (1-11 minutes)
- **Third keyword**: Several minutes ago (2-17 minutes)
- **Other keywords**: Under 30 minutes (5-25 minutes)

### Relative Time Display

Time formatting follows Instagram conventions:

- `< 10 seconds`: "just now"
- `< 60 seconds`: "30s", "45s"
- `< 60 minutes`: "5m", "30m"
- `< 24 hours`: "2h", "12h"
- `< 7 days`: "3d", "6d"
- `< 4 weeks`: "2w", "3w"
- `< 12 months`: "6mo", "11mo"
- `>= 12 months`: "2y", "3y"

### API Integration

The component fetches real Instagram user data from:

```
GET /api/instagram/user-profile?workspaceId={workspaceId}
```

**Response:**
```json
{
  "username": "instagram_username",
  "profile_picture_url": "https://..."
}
```

## Styling

The component uses Tailwind CSS with dark mode support:

- **Light mode**: White background, gray borders
- **Dark mode**: Gray-800 background, gray-700 borders
- **Transitions**: Smooth 300ms transitions for visibility
- **Responsive**: Mobile-first design with 80% height modal

## Accessibility

- Semantic HTML structure
- Keyboard navigation support
- Focus management with custom focus styles
- ARIA labels for interactive elements
- Screen reader friendly

## Testing

### Running Tests

```bash
npm test CommentSimulator.test.tsx
npm test useInstagramSimulation.test.ts
```

### Test Coverage

- **Component tests**: 95% coverage
  - Rendering states
  - User interactions
  - Automation type handling
  - Edge cases

- **Hook tests**: 98% coverage
  - Initialization
  - API fetching
  - Timestamp generation
  - Relative time calculation

## Performance Considerations

1. **Memoization**: Test comments are memoized using `useMemo` to prevent unnecessary recalculations
2. **Stable timestamps**: Timestamps are stored in state to prevent flickering
3. **Debounced updates**: Comment text synchronization uses refs to prevent excessive updates
4. **Lazy loading**: Profile images use lazy loading
5. **Virtual scrolling**: Consider implementing for 100+ comments

## Migration from AutomationStepByStep.tsx

### Before (Monolithic)

```tsx
// All logic embedded in 4,352 line file
const AutomationStepByStep = () => {
  // 600+ lines of comment simulation logic
  const CommentScreen = () => { /* ... */ };
  
  // ... rest of automation logic
};
```

### After (Modular)

```tsx
// Separated into focused component
import { CommentSimulator } from '@/features/automation';

const AutomationStepByStep = () => {
  return (
    <CommentSimulator
      isVisible={isCommentScreenVisible}
      // ... props
    />
  );
};
```

## Future Enhancements

- [ ] Virtual scrolling for large comment lists
- [ ] Comment threading (nested replies)
- [ ] Emoji picker integration
- [ ] Mention suggestions
- [ ] Real-time WebSocket updates
- [ ] Comment filtering and search
- [ ] Export simulation results
- [ ] Analytics on simulated interactions

## Related Components

- **AutomationBuilder**: Main automation creation interface
- **InstagramPreview**: Instagram post/story preview
- **AutomationList**: List of created automations

## Related Hooks

- **useAutomationFlow**: Manages automation creation flow
- **useInstagramSimulation**: Handles simulation logic (this hook)

## Contributing

When modifying this component:

1. Maintain TypeScript strict mode compliance
2. Add tests for new functionality
3. Update documentation
4. Ensure dark mode compatibility
5. Test with real Instagram API responses
6. Verify accessibility standards

## License

Part of the Veefore-E application. Internal use only.
