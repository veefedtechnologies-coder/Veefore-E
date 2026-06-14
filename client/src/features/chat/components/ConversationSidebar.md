# ConversationSidebar Component

## Overview

The `ConversationSidebar` component is a comprehensive sidebar interface for managing chat conversations. It was extracted from the monolithic `VeeGPT.tsx` file as part of Task 6.2 in the codebase refactoring initiative.

## Features

- **Conversation List**: Displays all user conversations with real-time updates
- **Search & Filter**: Search conversations by title
- **New Chat**: Create new conversations
- **Conversation Management**: Rename, archive, and delete conversations
- **Collapsible Sidebar**: Toggle between expanded and collapsed states
- **User Profile**: Display user information with avatar and plan
- **Navigation Menu**: Quick access to features like Content Studio and Auto Pilot
- **Loading States**: Skeleton loaders for conversations and user profile
- **Responsive Design**: Smooth transitions and animations

## Usage

```tsx
import { ConversationSidebar } from '@/features/chat/components'

function ChatPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['/api/chat/conversations'],
    queryFn: () => apiRequest('/api/chat/conversations')
  })
  
  const { userData, loading: userLoading } = useUser()
  
  return (
    <div className="flex h-screen">
      <ConversationSidebar
        conversations={conversations}
        conversationsLoading={conversationsLoading}
        currentConversationId={currentConversationId}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onSelectConversation={setCurrentConversationId}
        onStartNewChat={() => setCurrentConversationId(null)}
        userData={userData}
        userLoading={userLoading}
      />
      
      {/* Main chat content */}
    </div>
  )
}
```

## Props

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `conversations` | `ChatConversation[]` | Array of conversation objects |
| `conversationsLoading` | `boolean` | Loading state for conversations |
| `currentConversationId` | `number \| null` | ID of the currently selected conversation |
| `sidebarCollapsed` | `boolean` | Whether the sidebar is collapsed |
| `setSidebarCollapsed` | `(collapsed: boolean) => void` | Function to toggle sidebar collapse state |
| `onSelectConversation` | `(id: number) => void` | Callback when a conversation is selected |
| `onStartNewChat` | `() => void` | Callback to start a new chat |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `userData` | `UserData \| null` | `null` | User profile data |
| `userLoading` | `boolean` | `false` | Loading state for user data |
| `refreshKey` | `number` | `0` | Key to force re-render user section |

## Types

```typescript
type ChatConversation = {
  id: number
  userId: string
  workspaceId: string
  title: string
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

type UserData = {
  displayName?: string
  email?: string
  avatar?: string
  plan?: string
}
```

## Features in Detail

### Search and Filter

The sidebar includes a search feature that filters conversations by title:

1. Click "Search chats" to show the search input
2. Type to filter conversations in real-time
3. Search is case-insensitive
4. Empty search shows all conversations

### Conversation Management

Each conversation supports three actions via a dropdown menu:

- **Rename**: Click to edit the conversation title inline
- **Archive**: Archive the conversation (removes from main list)
- **Delete**: Permanently delete the conversation (with confirmation)

### Collapsible Sidebar

The sidebar can be collapsed to save space:

- Collapsed width: 64px (w-16)
- Expanded width: 256px (w-64)
- Smooth transitions with 500ms duration
- Icons remain visible when collapsed
- Hover shows tooltips for actions

### User Profile Section

The user profile section is fixed at the bottom and displays:

- User avatar (or initials if no avatar)
- Display name (or email username if no display name)
- Subscription plan (Free, Pro, etc.)
- Verification checkmark for authenticated users

## Styling

The component uses Tailwind CSS with a dark theme:

- Background: `bg-gray-900`
- Text colors: `text-white`, `text-gray-300`, `text-gray-400`
- Hover states: `hover:bg-gray-800`
- Active states: `bg-gray-800`
- Transitions: `transition-all duration-500 ease-out`

## State Management

The component uses React Query for server state:

- `useQuery` for fetching conversations
- `useMutation` for rename, delete, and archive operations
- Automatic cache invalidation after mutations
- Optimistic updates for better UX

## Accessibility

- All interactive elements are proper `<button>` elements
- Hover states for better interaction feedback
- Title attributes for collapsed state
- Keyboard navigation support
- Focus states for inputs

## Performance Considerations

- Search filtering is done client-side for instant results
- Conversations are virtualized (not implemented yet for <100 items)
- Smooth animations using GPU-accelerated transforms
- Debounced search input (can be added for large lists)

## Integration with VeeGPT

The `ConversationSidebar` is designed to be integrated back into `VeeGPT.tsx`:

```tsx
// In VeeGPT.tsx
import { ConversationSidebar } from '@/features/chat/components'

function VeeGPTContent() {
  // ... existing state and logic
  
  return (
    <div className="flex h-full">
      <ConversationSidebar
        conversations={conversations}
        conversationsLoading={conversationsLoading}
        currentConversationId={currentConversationId}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onSelectConversation={selectConversation}
        onStartNewChat={startNewChat}
        userData={finalUserData}
        userLoading={userLoading}
        refreshKey={refreshKey}
      />
      
      {/* Existing chat interface */}
    </div>
  )
}
```

## Testing

The component includes comprehensive tests covering:

- Basic rendering of conversations
- Sidebar collapse/expand functionality
- New chat creation
- Conversation selection
- Search and filtering
- Rename, archive, delete actions
- Loading states
- Empty states
- User profile display
- Accessibility features

Run tests with:
```bash
npm test ConversationSidebar.test.tsx
```

## Related Components

- `ChatInterface`: Main chat message display
- `MessageList`: Individual message rendering
- `useWebSocketChat`: WebSocket hook for real-time updates

## Requirements Mapping

This component fulfills the following requirements:

- **Requirement 2.2**: Component extraction following Single Responsibility Principle
- **Requirement 14.1**: VeeGPT chat interface refactoring - ConversationSidebar extraction

## Future Enhancements

- Virtual scrolling for large conversation lists (>100 items)
- Conversation grouping (Today, Yesterday, Last 7 days, etc.)
- Conversation pinning
- Batch operations (select multiple, bulk delete/archive)
- Conversation search with advanced filters (date range, message count)
- Conversation export functionality
- Conversation sharing
- Keyboard shortcuts (Cmd+K for search, etc.)

## File Location

```
/client/src/features/chat/components/ConversationSidebar.tsx
```

## Dependencies

- React
- Lucide Icons
- @tanstack/react-query
- Tailwind CSS
- Custom UI components (Skeleton)

## Version History

- **v1.0.0** (Task 6.2): Initial extraction from VeeGPT.tsx
  - Conversation list display
  - Search and filter
  - Management actions (rename, archive, delete)
  - Collapsible sidebar
  - User profile section
