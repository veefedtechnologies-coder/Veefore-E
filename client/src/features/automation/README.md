# Automation Feature Module

This module contains the refactored automation components extracted from the monolithic `AutomationStepByStep.tsx` file (originally 4,352 lines).

## Structure

```
automation/
├── components/
│   └── AutomationBuilder.tsx       # Main orchestrator component (~419 lines)
├── types/
│   └── automation.types.ts         # TypeScript interfaces and types
├── utils/
│   ├── automationHelpers.ts        # Business logic utilities
│   └── dataTransformers.ts         # API data transformation utilities
├── index.ts                        # Central exports
└── README.md                       # This file
```

## Components

### AutomationBuilder

Main orchestrator component that manages the automation creation workflow.

**Props:**
- `currentStep?: number` - Current step in the workflow (1-5)
- `onStepChange?: (step: number) => void` - Callback when step changes
- `showList?: boolean` - Whether to show the automation list instead of builder
- `onToggleList?: (show: boolean) => void` - Callback when toggling between builder and list

**Features:**
- Multi-step workflow orchestration
- Account and content selection
- Automation type configuration (comment_dm, dm_only, comment_only)
- DM message configuration with buttons and follower gate
- Advanced settings (timing, AI personality, active hours)
- Review and activation

**Usage:**
```tsx
import { AutomationBuilder } from '@/features/automation'

function MyPage() {
  const [step, setStep] = useState(1)
  
  return (
    <AutomationBuilder
      currentStep={step}
      onStepChange={setStep}
    />
  )
}
```

## Types

All TypeScript interfaces are defined in `types/automation.types.ts`:

- `AutomationBuilderProps` - Component props
- `SocialAccount` - Social media account data structure
- `ContentPost` - Social media post data structure
- `AutomationFlowState` - Complete automation flow state
- `DmButton` - DM button configuration
- `AutomationRule` - Automation rule for API
- `Step` - Workflow step definition

## Utilities

### automationHelpers.ts

Business logic functions:
- `getCurrentKeywords(flowState)` - Get keywords based on automation type
- `getCurrentResponses(flowState)` - Build responses object for API
- `getSteps(automationType)` - Get workflow steps based on automation type
- `canProceedToNext(currentStep, flowState)` - Validate step completion
- `getInitialFlowState()` - Get default flow state

### dataTransformers.ts

API data transformation functions:
- `transformSocialAccounts(data)` - Transform API account data to UI format
- `transformPosts(data)` - Transform API post data to UI format

## Design Principles

1. **Single Responsibility** - Each file has one clear purpose
2. **Type Safety** - Full TypeScript coverage with proper interfaces
3. **Testability** - Pure functions separated from React components
4. **Maintainability** - Logical organization with clear structure
5. **Reusability** - Utility functions can be used across the feature

## Future Enhancements

The following components will be added in subsequent tasks:
- `TriggerSelector` - Account and trigger configuration UI
- `ActionConfigurator` - Response and action configuration UI
- `PreviewPanel` - Real-time preview of automation
- `AutomationList` - List view of existing automations
- `InstagramPreview` - Instagram post preview component
- `CommentSimulator` - Comment simulation interface

## Requirements Satisfied

- **Requirement 2.1**: File size analysis and classification
- **Requirement 2.2**: Large file decomposition following Single Responsibility Principle
- **Requirement 2.3**: Code duplication elimination through shared utilities

## Testing

The refactored components maintain all existing functionality from the original file while improving:
- Readability (419 lines vs 4,352 lines for main component)
- Maintainability (clear separation of concerns)
- Testability (pure functions separated from React logic)
- Type safety (explicit TypeScript interfaces)
