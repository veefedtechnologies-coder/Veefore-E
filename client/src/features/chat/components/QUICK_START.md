# ConversationSidebar Quick Start Guide

## Installation

The component is already available in your project. No installation needed.

## Basic Usage

```tsx
import { ConversationSidebar } from '@/features/chat/components'

function MyChat() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  
  return (
    <div className="flex h-screen">
      <ConversationSidebar
        conversations={conversations}
        conversationsLoading={false}
        currentConversationId={currentConversationId}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onSelectConversation={setCurrentConversationId}
        onStartNewChat={() => setCurrentConversationId(null)}
      />
      
      {/* Your chat content */}
    </div>
  )
}
```

## Required Props

| Prop | Type | What to pass |
|------|------|--------------|
| `conversations` | `ChatConversation[]` | Your conversation list from API |
| `conversationsLoading` | `boolean` | Loading state from query |
| `currentConversationId` | `number \| null` | ID of selected conversation |
| `sidebarCollapsed` | `boolean` | Collapse state (start with `false`) |
| `setSidebarCollapsed` | `function` | State setter for collapse |
| `onSelectConversation` | `function` | Called when user clicks conversation |
| `onStartNewChat` | `function` | Called when user clicks "New chat" |

## Optional Props

```tsx
<ConversationSidebar
  // ... required props ...
  userData={{
    displayName: 'John Doe',
    email: 'john@example.com',
    avatar: 'https://...',
    plan: 'Pro'
  }}
  userLoading={false}
  refreshKey={0}
/>
```

## With React Query

```tsx
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

function MyChat() {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['/api/chat/conversations'],
    queryFn: () => apiRequest('/api/chat/conversations')
  })
  
  return (
    <ConversationSidebar
      conversations={conversations}
      conversationsLoading={isLoading}
      // ... other props ...
    />
  )
}
```

## Common Patterns

### Pattern 1: Basic Chat App

```tsx
function ChatApp() {
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  
  const { data: conversations = [] } = useQuery({
    queryKey: ['/api/conversations'],
    queryFn: fetchConversations
  })
  
  return (
    <div className="flex h-screen">
      <ConversationSidebar
        conversations={conversations}
        conversationsLoading={false}
        currentConversationId={conversationId}
        sidebarCollapsed={collapsed}
        setSidebarCollapsed={setCollapsed}
        onSelectConversation={setConversationId}
        onStartNewChat={() => setConversationId(null)}
      />
      
      <ChatMessages conversationId={conversationId} />
    </div>
  )
}
```

### Pattern 2: With User Data

```tsx
function ChatApp() {
  const { userData } = useUser()
  
  return (
    <ConversationSidebar
      // ... other props ...
      userData={{
        displayName: userData?.displayName,
        email: userData?.email,
        avatar: userData?.photoURL,
        plan: userData?.plan || 'Free'
      }}
      userLoading={!userData}
    />
  )
}
```

### Pattern 3: With Mobile Support

```tsx
function ChatApp() {
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  // Auto-collapse on mobile
  useEffect(() => {
    if (isMobile) setCollapsed(true)
  }, [isMobile])
  
  return (
    <ConversationSidebar
      sidebarCollapsed={collapsed}
      setSidebarCollapsed={setCollapsed}
      // ... other props ...
    />
  )
}
```

## Troubleshooting

### Conversations not showing?
- Check that `conversations` array has data
- Verify `conversationsLoading` is `false`
- Check browser console for errors

### Sidebar not collapsing?
- Ensure `setSidebarCollapsed` is provided
- Check that `sidebarCollapsed` state updates
- Verify Tailwind CSS is configured

### User profile not showing?
- Pass `userData` prop with user info
- Check `userData` object structure
- Ensure avatar URLs are accessible

### Search not working?
- Search is built-in, no extra config needed
- Check conversations have `title` field
- Verify data structure matches `ChatConversation` type

## Type Definitions

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

## Styling

The component uses Tailwind CSS classes. To customize:

```tsx
// Component handles all styling internally
// No custom CSS needed

// Sidebar width:
// - Collapsed: 64px (w-16)
// - Expanded: 256px (w-64)

// Colors:
// - Background: bg-gray-900
// - Text: text-white, text-gray-300
// - Hover: hover:bg-gray-800
```

## API Requirements

Your backend should support these endpoints:

```
GET  /api/chat/conversations         - List conversations
POST /api/chat/conversations         - Create conversation
PATCH /api/chat/conversations/:id    - Rename conversation
DELETE /api/chat/conversations/:id   - Delete conversation
POST /api/chat/conversations/:id/archive - Archive conversation
```

## Testing

```bash
# Run component tests
npm test -- ConversationSidebar.test.ts --run

# Check TypeScript
npx tsc --noEmit
```

## Examples in Action

Check these files for working examples:
- `/client/src/pages/VeeGPT.tsx` - Original implementation
- `/client/src/features/chat/components/ConversationSidebar.md` - Full docs

## Getting Help

- 📖 Read: `ConversationSidebar.md` for detailed docs
- 🔧 Integration: See `CONVERSATION_SIDEBAR_INTEGRATION.md`
- 🧪 Tests: Check `ConversationSidebar.test.ts` for usage examples
- 💬 Issues: File a bug with reproduction steps

## Next Steps

1. Import the component
2. Pass required props
3. Handle conversation selection
4. Add user data (optional)
5. Test in your app

That's it! The component handles everything else internally.
