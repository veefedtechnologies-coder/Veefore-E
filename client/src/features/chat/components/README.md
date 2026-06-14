# Chat Components

This directory contains the chat feature components for the VeeGPT interface.

## MessageList Component

A performant, feature-rich message list component designed for chat interfaces with real-time streaming capabilities.

### Features

- ✅ **Virtual Scrolling**: Automatically uses react-window for lists with 100+ messages to maintain performance
- ✅ **Markdown Rendering**: Full markdown support with GitHub Flavored Markdown (GFM)
- ✅ **Syntax Highlighting**: Code blocks are rendered with syntax highlighting using react-syntax-highlighter
- ✅ **Real-time Streaming**: Supports streaming content updates for real-time AI responses
- ✅ **Performance Optimized**: Uses React.memo with custom comparison to prevent unnecessary re-renders
- ✅ **Message Actions**: Built-in support for copy, edit, and delete actions
- ✅ **Automatic Scrolling**: Auto-scrolls to the bottom when new messages arrive
- ✅ **Responsive Design**: Adapts to different screen sizes with proper word wrapping
- ✅ **Accessibility**: Proper ARIA labels and keyboard navigation support

### Installation

The component requires the following dependencies:

```bash
npm install react-window @types/react-window react-syntax-highlighter @types/react-syntax-highlighter react-markdown remark-gfm
```

### Usage

#### Basic Usage

```tsx
import { MessageList, ChatMessage } from '@/features/chat/components/MessageList'

const messages: ChatMessage[] = [
  {
    id: 1,
    conversationId: 1,
    role: 'user',
    content: 'Hello!',
    tokensUsed: 2,
    createdAt: new Date()
  },
  {
    id: 2,
    conversationId: 1,
    role: 'assistant',
    content: 'Hi! How can I help you today?',
    tokensUsed: 8,
    createdAt: new Date()
  }
]

function ChatInterface() {
  return (
    <MessageList messages={messages} />
  )
}
```

#### With Streaming Content

```tsx
import { MessageList } from '@/features/chat/components/MessageList'
import { useState } from 'react'

function ChatInterfaceWithStreaming() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState<Record<number, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)

  return (
    <MessageList
      messages={messages}
      streamingContent={streamingContent}
      isGenerating={isGenerating}
    />
  )
}
```

#### With Message Actions

```tsx
import { MessageList } from '@/features/chat/components/MessageList'

function ChatInterfaceWithActions() {
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    // Show toast notification
  }

  const handleEditMessage = (messageId: number) => {
    // Handle edit logic
  }

  const handleDeleteMessage = (messageId: number) => {
    // Handle delete logic
  }

  return (
    <MessageList
      messages={messages}
      onCopyMessage={handleCopyMessage}
      onEditMessage={handleEditMessage}
      onDeleteMessage={handleDeleteMessage}
    />
  )
}
```

### Props

#### MessageListProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `ChatMessage[]` | **Required** | Array of messages to display |
| `streamingContent` | `Record<number, string>` | `{}` | Object mapping message IDs to streaming content |
| `isGenerating` | `boolean` | `false` | Whether the AI is currently generating a response |
| `onCopyMessage` | `(content: string) => void` | `undefined` | Callback when copy button is clicked |
| `onEditMessage` | `(messageId: number) => void` | `undefined` | Callback when edit button is clicked (user messages only) |
| `onDeleteMessage` | `(messageId: number) => void` | `undefined` | Callback when delete button is clicked (user messages only) |

#### ChatMessage Type

```typescript
type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  tokensUsed: number
  createdAt: Date | string
}
```

### Performance Considerations

#### Virtual Scrolling

The component automatically switches to virtual scrolling when the message list exceeds 100 messages. This ensures smooth performance even with thousands of messages.

- **Small Lists (<100 messages)**: Uses standard rendering for simplicity
- **Large Lists (≥100 messages)**: Uses `react-window` for efficient virtualization

#### Memoization

The component uses `React.memo` with custom comparison functions to prevent unnecessary re-renders:

- **MessageList**: Only re-renders when messages array, streaming content, or isGenerating changes
- **MessageItem**: Only re-renders when message content, streaming content, or isGenerating changes

#### Dynamic Height Calculation

For virtual scrolling, the component dynamically calculates and caches row heights based on content, ensuring accurate scrolling behavior.

### Markdown Support

The component supports full GitHub Flavored Markdown including:

- Headers (H1-H6)
- Bold and italic text
- Lists (ordered and unordered)
- Code blocks with syntax highlighting
- Inline code
- Links
- Tables
- Blockquotes

#### Custom Markdown Conversion

The component includes a custom `convertToMarkdown` function that automatically converts common text patterns to proper markdown:

- `Title: Something` → `# Something`
- `Requirements:` → `## Requirements`
- Section headers with colons → H2 headers
- Sub-section patterns → H3 headers

### Syntax Highlighting

Code blocks are automatically highlighted based on the language specified in the markdown:

\`\`\`javascript
const greeting = "Hello, World!"
console.log(greeting)
\`\`\`

Supported languages include JavaScript, TypeScript, Python, Java, C++, and many more.

### Styling

The component uses Tailwind CSS for styling and adapts to dark mode automatically. Key styling features:

- **User Messages**: Right-aligned with gray background
- **Assistant Messages**: Left-aligned with transparent background
- **Code Blocks**: Dark theme with copy button on hover
- **Links**: Blue with hover underline
- **Tables**: Responsive with overflow scrolling

### Accessibility

The component follows accessibility best practices:

- Proper semantic HTML structure
- ARIA labels for user and assistant indicators
- Keyboard-accessible action buttons
- Screen reader-friendly timestamps
- High contrast text colors

### Testing

The component includes comprehensive tests covering:

- Basic rendering
- Streaming content updates
- Markdown rendering
- Message actions
- Virtual scrolling behavior
- Performance optimization
- Empty states
- Accessibility features

Run tests:

```bash
npm test MessageList.test.tsx
```

### Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

### Known Limitations

1. **Virtual Scrolling Height**: Initial height estimates may not be perfect for complex markdown. The component measures actual heights and adjusts automatically.
2. **Code Copy in Virtual Lists**: Copy buttons in code blocks work best with non-virtualized lists.
3. **Markdown Conversion**: The custom markdown conversion is opinionated and may not cover all edge cases.

### Future Enhancements

- [ ] Support for message reactions
- [ ] Message threading/replies
- [ ] File attachments display
- [ ] Voice message playback
- [ ] Search within messages
- [ ] Message pinning
- [ ] Export conversation

### Contributing

When modifying this component:

1. Maintain backward compatibility with existing props
2. Add tests for new features
3. Update this README with new functionality
4. Ensure accessibility is maintained
5. Test with both small and large message lists

### Related Components

- **ChatInterface**: Main chat interface component
- **ConversationSidebar**: Sidebar for conversation management
- **useWebSocketChat**: Hook for WebSocket-based chat

### License

MIT
