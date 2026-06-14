# useAutomationFlow Hook

## Overview

The `useAutomationFlow` custom hook provides comprehensive state management for the automation creation workflow. It encapsulates all the logic for managing automation triggers, actions, validation, and saving automations to the backend.

**Requirements:** 2.2, 5.2

## Features

- **State Management**: Manages the complete automation flow state including triggers, actions, and advanced settings
- **Validation**: Comprehensive validation logic for all automation types (comment_dm, dm_only, comment_only)
- **API Integration**: Handles saving automations to the backend with error handling
- **Cache Management**: Auto-saves and restores automation state for better UX
- **Helper Methods**: Provides convenience methods for managing keywords, buttons, and replies

## Usage

```typescript
import { useAutomationFlow } from '@/features/automation/hooks/useAutomationFlow'

function MyComponent() {
  const {
    flow,
    currentStep,
    isValid,
    isSaving,
    updateTrigger,
    addAction,
    validateFlow,
    saveAutomation
  } = useAutomationFlow(1, user?.uid)

  // Update trigger configuration
  const handleAccountSelect = (accountId: string) => {
    updateTrigger({ selectedAccount: accountId })
  }

  // Add action configuration
  const handleDmMessageChange = (message: string) => {
    addAction({ dmMessage: message })
  }

  // Validate before saving
  const handleSave = async () => {
    const validation = validateFlow()
    if (validation.isValid) {
      await saveAutomation(workspaceId)
    }
  }

  return (
    // Your JSX here
  )
}
```

## API Reference

### Hook Parameters

```typescript
useAutomationFlow(
  initialStep?: number,  // Default: 1
  userId?: string        // For cache management
): UseAutomationFlowReturn
```

### Return Interface

```typescript
interface UseAutomationFlowReturn {
  // State
  flow: AutomationFlowState           // Current flow state
  currentStep: number                  // Current workflow step (1-5)
  isValid: boolean                     // Whether flow is valid
  isSaving: boolean                    // Whether save operation is in progress
  
  // Update Methods
  updateTrigger: (updates: TriggerUpdate) => void
  addAction: (updates: ActionUpdate) => void
  updateAdvancedSettings: (updates: AdvancedSettingsUpdate) => void
  updateFlow: (updates: Partial<AutomationFlowState>) => void
  
  // Core Operations
  validateFlow: () => ValidationResult
  saveAutomation: (workspaceId: string) => Promise<void>
  resetFlow: () => void
  setCurrentStep: (step: number) => void
  canProceed: (step: number) => boolean
  
  // Helper Methods
  addKeyword: (keyword: string) => void
  removeKeyword: (keyword: string) => void
  addCommentReply: (reply: string) => void
  removeCommentReply: (index: number) => void
  addDmButton: (button: DmButton) => void
  updateDmButton: (index: number, button: Partial<DmButton>) => void
  removeDmButton: (index: number) => void
  
  // Cache Management
  loadFromCache: (userId: string) => void
  saveToCache: (userId: string) => void
  clearCache: (userId?: string) => void
}
```

### Update Payloads

#### TriggerUpdate

```typescript
interface TriggerUpdate {
  selectedAccount?: string
  contentType?: string
  selectedPost?: ContentPost | null
  automationType?: 'comment_dm' | 'dm_only' | 'comment_only'
  matchMode?: 'exact' | 'contains' | 'intent' | 'any'
  keywords?: string[]
  dmKeywords?: string[]
  commentKeywords?: string[]
  negativeKeywords?: string[]
  aiIntents?: string[]
}
```

#### ActionUpdate

```typescript
interface ActionUpdate {
  commentReplies?: string[]
  dmMessage?: string
  dmAutoReply?: string
  publicReply?: string
  dmButtons?: DmButton[]
  followerGateEnabled?: boolean
  followerGateMessage?: string
  followerGateVisitLabel?: string
  followerGateConfirmLabel?: string
  followerGateRetryMessage?: string
  followerGateDelay?: string
}
```

#### AdvancedSettingsUpdate

```typescript
interface AdvancedSettingsUpdate {
  maxRepliesPerDay?: number
  cooldownPeriod?: number
  aiPersonality?: 'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'witty'
  activeHours?: { start: string; end: string }
  activeDays?: boolean[]
  commentDelay?: number
  commentDelayUnit?: 'seconds' | 'minutes' | 'hours'
}
```

### Validation Result

```typescript
interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

interface ValidationError {
  field: string
  message: string
  step?: number
}

interface ValidationWarning {
  field: string
  message: string
  step?: number
}
```

## Validation Rules

The hook implements comprehensive validation for automation flows:

### Step 1 Validation
- `selectedAccount` - Required
- `contentType` - Required
- `selectedPost` - Required

### Step 2 Validation
- `automationType` - Required
- `keywords` - At least one keyword required

**For comment_dm type:**
- `commentReplies` - At least one reply required
- `dmMessage` - Required (validated in Step 3)

**For dm_only type:**
- `dmAutoReply` - Required

**For comment_only type:**
- `publicReply` - Required

### Step 4 Validation
- `maxRepliesPerDay` - Must be >= 1

### Warnings
- DM buttons with empty URLs
- Follower gate enabled without message

## Examples

### Basic Automation Flow

```typescript
const {
  flow,
  updateTrigger,
  addAction,
  saveAutomation,
  validateFlow
} = useAutomationFlow(1, user?.uid)

// Step 1: Select account and post
updateTrigger({
  selectedAccount: 'account-123',
  contentType: 'post',
  selectedPost: myPost
})

// Step 2: Configure trigger
updateTrigger({
  automationType: 'comment_dm',
  keywords: ['help', 'info', 'price']
})

addAction({
  commentReplies: ['Message sent!', 'Sent just now!']
})

// Step 3: Configure DM
addAction({
  dmMessage: 'Hello! How can I help you today?'
})

// Validate and save
const validation = validateFlow()
if (validation.isValid) {
  await saveAutomation(workspaceId)
}
```

### Managing Keywords

```typescript
const { addKeyword, removeKeyword, flow } = useAutomationFlow()

// Add keywords
addKeyword('help')
addKeyword('support')
addKeyword('  price  ') // Whitespace trimmed automatically

// Remove keyword
removeKeyword('support')

// Check current keywords
console.log(flow.keywords) // ['help', 'price']
```

### Managing DM Buttons

```typescript
const { addDmButton, updateDmButton, removeDmButton } = useAutomationFlow()

// Add button
addDmButton({
  type: 'web_url',
  text: 'Visit Website',
  url: 'https://example.com',
  payload: ''
})

// Update button
updateDmButton(0, {
  text: 'Updated Text',
  url: 'https://newurl.com'
})

// Remove button
removeDmButton(0)
```

### Step Navigation

```typescript
const { currentStep, setCurrentStep, canProceed } = useAutomationFlow()

// Check if can proceed from current step
if (canProceed(currentStep)) {
  setCurrentStep(currentStep + 1)
}
```

### Cache Management

```typescript
const { loadFromCache, saveToCache, clearCache } = useAutomationFlow()

// Load cached state
loadFromCache(user.uid)

// Save to cache
saveToCache(user.uid)

// Clear cache
clearCache(user.uid)
```

## Integration with AutomationBuilder

The hook is designed to be used with the `AutomationBuilder` component but can be used independently. Here's how they integrate:

```typescript
// AutomationBuilder.tsx
function AutomationBuilder() {
  const { user } = useAuth()
  const { currentWorkspace } = useCurrentWorkspace()
  
  const {
    flow,
    currentStep,
    isValid,
    isSaving,
    updateTrigger,
    addAction,
    validateFlow,
    saveAutomation,
    setCurrentStep,
    canProceed
  } = useAutomationFlow(1, user?.uid)

  const handleNext = () => {
    if (canProceed(currentStep)) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleSave = async () => {
    await saveAutomation(currentWorkspace?.id!)
  }

  return (
    // Render steps with flow state
  )
}
```

## Error Handling

The hook includes comprehensive error handling:

- **Validation Errors**: Returned by `validateFlow()` with detailed error messages
- **API Errors**: Displayed via toast notifications
- **Cache Errors**: Silently handled, falls back to default state

## Performance Considerations

- **Memoized Callbacks**: All update methods are memoized with `useCallback`
- **Selective Re-renders**: Only necessary state updates trigger re-renders
- **Cached State**: Auto-saves to localStorage to prevent data loss

## Testing

Unit tests are provided in `useAutomationFlow.test.ts` covering:
- State initialization
- Update methods
- Keyword management
- DM button management
- Validation logic
- Step navigation
- Reset functionality

**Note**: Tests require jsdom environment. Update vitest.config.ts:

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',  // Changed from 'node'
    // ... other config
  }
})
```

## File Structure

```
client/src/features/automation/hooks/
├── useAutomationFlow.ts        # Main hook implementation
├── useAutomationFlow.test.ts   # Unit tests
├── useInstagramSimulation.ts   # Instagram preview simulation hook
└── README.md                   # This file
```

## Related Files

- `../types/automation.types.ts` - Type definitions
- `../utils/automationHelpers.ts` - Helper functions
- `../utils/dataTransformers.ts` - Data transformation utilities
- `../components/AutomationBuilder.tsx` - Main UI component

## Future Enhancements

- [ ] Add undo/redo functionality
- [ ] Support automation templates
- [ ] Add batch keyword import
- [ ] Support automation scheduling
- [ ] Add analytics integration
