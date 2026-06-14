# AutomationList Component

## Overview

The `AutomationList` component displays a list of automation rules with filtering, sorting, and CRUD operations. It was extracted from the monolithic `AutomationStepByStep.tsx` file (~4,352 lines) as part of the codebase refactoring effort.

## Features

- **Search/Filter**: Search automations by name, type, or keywords
- **Status Filter**: Filter by active, paused, or all automations
- **Sorting**: Sort by date (newest/oldest), name (A-Z/Z-A), or status
- **CRUD Operations**: Toggle active/inactive status, delete automations
- **Statistics**: View total automations and active count
- **Pagination**: Built-in pagination via AutomationTable sub-component
- **Loading States**: Skeleton loading for better UX
- **Empty States**: User-friendly messages when no data exists

## Components

### AutomationList (Main Component)

The primary component that orchestrates filtering, sorting, and rendering of automation rules.

**Location**: `client/src/features/automation/components/AutomationList.tsx`

### AutomationTable (Sub-Component)

Handles the grid display of automation cards with pagination support.

**Location**: `client/src/features/automation/components/AutomationTable.tsx`

## Usage

```typescript
import { AutomationList } from '@/features/automation/components/AutomationList'
import { useQuery, useMutation } from '@tanstack/react-query'

function AutomationPage() {
  // Fetch automation rules
  const { data: automationRules, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: fetchAutomations
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: updateAutomation
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteAutomation
  })

  return (
    <AutomationList
      automationRules={automationRules || []}
      rulesLoading={isLoading}
      updateAutomationMutation={updateMutation}
      deleteAutomationMutation={deleteMutation}
      onCreateNew={() => navigate('/automations/create')}
    />
  )
}
```

## Props

### AutomationList Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `automationRules` | `AutomationRule[]` | Yes | Array of automation rules to display |
| `rulesLoading` | `boolean` | Yes | Loading state indicator |
| `updateAutomationMutation` | `MutationObject` | Yes | Mutation hook for updating rules |
| `deleteAutomationMutation` | `MutationObject` | Yes | Mutation hook for deleting rules |
| `onCreateNew` | `() => void` | No | Callback when create new button is clicked |

### AutomationTable Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `automations` | `AutomationRule[]` | Yes | Array of automations to display |
| `onToggleActive` | `(ruleId: string, isActive: boolean) => void` | Yes | Callback for toggling status |
| `onDelete` | `(ruleId: string) => void` | Yes | Callback for deleting automation |
| `isUpdating` | `boolean` | Yes | Loading state for update operations |
| `isDeleting` | `boolean` | Yes | Loading state for delete operations |
| `itemsPerPage` | `number` | No | Number of items per page (default: 6) |

## Data Structure

```typescript
interface AutomationRule {
  id?: string
  name: string
  workspaceId: string
  type: 'comment_dm' | 'dm_only' | 'comment_only'
  matchMode: 'exact' | 'contains' | 'intent' | 'any'
  negativeKeywords: string[]
  aiIntents: string[]
  keywords: string[]
  targetMediaIds: string[]
  responses: any
  isActive: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
}
```

## Features in Detail

### 1. Search Functionality

The search input filters automations by:
- Automation name (case-insensitive)
- Automation type
- Keywords associated with the automation

```typescript
// Example: Search for "welcome"
// Matches: "Welcome DM Campaign" (by name)
// Matches: Automations with "welcome" keyword
```

### 2. Status Filtering

Three filter options:
- **All**: Shows all automations
- **Active**: Shows only active automations
- **Paused**: Shows only paused automations

### 3. Sorting Options

- **Newest First** (default): Sort by creation date descending
- **Oldest First**: Sort by creation date ascending
- **Name (A-Z)**: Alphabetical ascending
- **Name (Z-A)**: Alphabetical descending
- **Status**: Active automations first

### 4. Pagination

- Default 6 items per page (configurable)
- Navigation controls (Previous/Next)
- Page numbers with smart ellipsis
- Shows current range (e.g., "Showing 1-6 of 10")

### 5. CRUD Operations

#### Toggle Active/Inactive

```typescript
// Clicking pause button on active automation
handleToggleActive('automation-id', true)
// Sets isActive to false

// Clicking play button on paused automation
handleToggleActive('automation-id', false)
// Sets isActive to true
```

#### Delete Automation

```typescript
// Shows confirmation dialog before deleting
handleDelete('automation-id')
// Requires user confirmation via window.confirm
```

## Styling

The component uses Tailwind CSS with the following theme:
- Gradient backgrounds for headers
- Dark mode support
- Hover effects and transitions
- Status indicators (animated pulse for active)
- Responsive grid layout (1 column mobile, 2 columns desktop)

## Empty States

### No Automations
Shown when no automations exist in the system.
- Icon: Bot with notification badge
- Message: "No automation rules yet"
- Action: "Create Your First Rule" button (if `onCreateNew` provided)

### No Search Results
Shown when search/filter returns no results.
- Icon: Search icon
- Message: "No results found"
- Shows search query
- Action: "Clear Search" button

## Loading States

### Initial Load
Shows skeleton placeholders (4 cards) when:
- `rulesLoading` is true
- No cached data exists

### With Cached Data
Shows actual data immediately when:
- `rulesLoading` is true
- Cached data exists (for instant navigation)

## Requirements Fulfilled

This component fulfills the following requirements from the spec:

- **Requirement 2.2**: Large file decomposition - Extracted from 4,352-line monolithic file
- **Requirement 2.3**: Code splitting - Separate AutomationList and AutomationTable components
- **Requirement 5.1**: Component architecture optimization - Extracted presentation logic
- **Requirement 7.3**: File size reduction - Each component is <500 lines

## File Structure

```
client/src/features/automation/
├── components/
│   ├── AutomationList.tsx         (~400 lines)
│   ├── AutomationTable.tsx        (~300 lines)
│   └── AutomationList.README.md   (this file)
├── types/
│   └── automation.types.ts
└── index.ts
```

## Performance Considerations

1. **Memoization**: Uses `useMemo` for filtering and sorting to prevent unnecessary recalculations
2. **Lazy Rendering**: Only renders visible page items via pagination
3. **Skeleton Loading**: Shows cached data immediately for instant navigation
4. **Optimized Filtering**: Efficient string matching and array operations

## Future Enhancements

Potential improvements for future iterations:

1. **Virtualization**: Implement virtual scrolling for very large lists
2. **Bulk Operations**: Select multiple automations for batch actions
3. **Export/Import**: Download/upload automation rules
4. **Advanced Filters**: Filter by creation date, keywords count, etc.
5. **Sorting Persistence**: Remember user's sort preference
6. **Search Highlighting**: Highlight matching text in search results

## Migration Notes

### From Original AutomationStepByStep.tsx

The AutomationListManager component from the original file has been:

1. **Renamed** to `AutomationList` for clarity
2. **Enhanced** with search, filter, and sort capabilities
3. **Split** into two components (AutomationList + AutomationTable)
4. **Improved** with better loading states and empty states
5. **Typed** with proper TypeScript interfaces

### Breaking Changes

None - the component maintains the same mutation interface and can be used as a drop-in replacement for the original AutomationListManager component.

## Related Components

- `AutomationBuilder`: Component for creating/editing automations
- `InstagramPreview`: Preview component for Instagram content
- `CommentSimulator`: Simulation interface for testing automations

## Support

For issues or questions about this component:
1. Check the spec document: `.kiro/specs/codebase-refactoring-optimization/design.md`
2. Review the requirements: `.kiro/specs/codebase-refactoring-optimization/requirements.md`
3. Check the parent task: Task 2.2 in `tasks.md`
