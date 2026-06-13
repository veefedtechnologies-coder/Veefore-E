# ChatInterface Integration Guide

This guide shows how to integrate the extracted ChatInterface component back into VeeGPT.tsx or use it in other components.

## Step 1: Import the Component

```tsx
import { ChatInterface } from '@/features/chat/components'
import type { ChatMessage } from '@/features/chat/types/chat.types'
```

## Step 2: Prepare Required State

The ChatInterface component requires these state variables from your parent component:

```tsx
// Message data
const [messages, setMessages] = useState<ChatMessage[]>([])
const [messagesLoading, setMessagesLoading] = useState(false)

// Generation state
const [isGenerating, setIsGenerating] = useState(false)
const [aiStatus, setAiStatus] = useState<string | null>(null)

// Input state
const [inputText, setInputText] = useState('')

// Streaming state
const [streamingContent, setStreamingContent] = useState<{[key: number]: string}>({})
```

## Step 3: Implement Event Handlers

```tsx
// Handle input changes
const handleInputChange = (text: string) => {
  setInputText(text)
}

// Handle sending messages
const handleSendMessage = async () => {
  if (!inputText.trim()) return
  
  // Your message sending logic here
  // Example:
  // await sendMessageMutation.mutateAsync({ content: inputText })
  
  setInputText('')
}

// Handle stopping generation
const handleStopGeneration = async () => {
  setIsGenerating(false)
  // Your stop generation logic here
  // Example:
  // await stopGenerationMutation.mutateAsync(conversationId)
}

// Handle keyboard events
const handleKeyPress = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendMessage()
  }
}
```

## Step 4: Render the Component

```tsx
return (
  <div className="h-full w-full flex">
    {/* Sidebar (if any) */}
    <Sidebar />
    
    {/* Main chat area */}
    <div className="flex-1 flex flex-col">
      {/* Header (if any) */}
      <ChatHeader />
      
      {/* ChatInterface component */}
      <ChatInterface
        messages={messages}
        messagesLoading={messagesLoading}
        isGenerating={isGenerating}
        aiStatus={aiStatus}
        inputText={inputText}
        streamingContent={streamingContent}
        onInputChange={handleInputChange}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        onKeyPress={handleKeyPress}
      />
    </div>
  </div>
)
```

## Complete Integration Example for VeeGPT.tsx

Here's how to refactor VeeGPT.tsx to use the ChatInterface component:

### Before (Original VeeGPT.tsx):
```tsx
// 2,366 lines with inline chat UI
return (
  <div className="flex-1 flex flex-col">
    {/* 400+ lines of message rendering and input UI */}
    <div className="flex-1 overflow-y-auto">
      {messages.map(message => (
        // Message rendering logic
      ))}
    </div>
    {/* Input UI */}
  </div>
)
```

### After (Refactored VeeGPT.tsx):
```tsx
import { ChatInterface } from '@/features/chat/components'

// ... existing state and logic ...

return (
  <div className="flex-1 flex flex-col">
    <ChatHeader />
    <ChatInterface
      messages={displayMessages}
      messagesLoading={messagesLoading}
      isGenerating={isGenerating}
      aiStatus={aiStatus}
      inputText={inputText}
      streamingContent={streamingContent}
      onInputChange={setInputText}
      onSendMessage={handleSendMessage}
      onStopGeneration={handleStopGeneration}
      onKeyPress={handleKeyPress}
    />
  </div>
)
```

## WebSocket Integration

The ChatInterface component expects streaming content to be managed by the parent. Here's how to integrate with WebSocket:

```tsx
// In your parent component (e.g., VeeGPT.tsx)
useEffect(() => {
  const ws = new WebSocket(wsUrl)
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    
    switch (data.type) {
      case 'status':
        setAiStatus(data.status)
        break
        
      case 'aiMessageStart':
        setIsGenerating(true)
        setStreamingContent(prev => ({
          ...prev,
          [data.messageId]: ''
        }))
        break
        
      case 'chunk':
        setStreamingContent(prev => ({
          ...prev,
          [data.messageId]: (prev[data.messageId] || '') + data.content
        }))
        break
        
      case 'complete':
        setIsGenerating(false)
        setAiStatus(null)
        // Refresh messages from server
        break
    }
  }
  
  return () => ws.close()
}, [])
```

## Testing the Component

Example test setup:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInterface } from '@/features/chat/components'

describe('ChatInterface', () => {
  const mockProps = {
    messages: [
      {
        id: 1,
        conversationId: 1,
        role: 'user' as const,
        content: 'Hello',
        tokensUsed: 5,
        createdAt: new Date()
      }
    ],
    messagesLoading: false,
    isGenerating: false,
    aiStatus: null,
    inputText: '',
    streamingContent: {},
    onInputChange: jest.fn(),
    onSendMessage: jest.fn(),
    onStopGeneration: jest.fn(),
    onKeyPress: jest.fn()
  }
  
  it('renders messages correctly', () => {
    render(<ChatInterface {...mockProps} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
  
  it('calls onSendMessage when send button is clicked', () => {
    render(<ChatInterface {...mockProps} inputText="Test message" />)
    const sendButton = screen.getByRole('button', { name: /send/i })
    fireEvent.click(sendButton)
    expect(mockProps.onSendMessage).toHaveBeenCalled()
  })
})
```

## Styling Considerations

The ChatInterface component uses:
- Tailwind CSS classes for styling
- Inline styles for the floating input (glassmorphism effect)
- Dark mode support via `dark:` prefixes
- Responsive design with max-width constraints

Make sure your parent component provides the necessary layout context:
- Background colors
- Full height container
- Proper z-index stacking

## Performance Notes

- Auto-scrolling is optimized with useRef and smooth scrolling
- Messages are rendered only when data changes
- Streaming content updates trigger minimal re-renders
- ContentEditable input provides better UX than textarea for multi-line input

## Accessibility

The component includes:
- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support (Enter to send, Shift+Enter for new line)
- Color contrast compliance in both light and dark modes

## Known Limitations

1. File attachment button is currently non-functional (placeholder)
2. Voice input button is currently non-functional (placeholder)
3. Brand voice and image generation controls are not included (should be added to parent)
4. Markdown conversion is hardcoded (could be made configurable)

## Next Steps

Consider these additional extractions:
1. Create `useWebSocketChat` hook for WebSocket logic
2. Extract `MessageList` component for message rendering
3. Extract `MessageInput` component for input controls
4. Create `ConversationSidebar` component for chat history
5. Add comprehensive unit and integration tests
