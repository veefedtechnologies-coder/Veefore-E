# Chat Feature

This directory contains the chat feature components extracted from VeeGPT.tsx as part of the codebase refactoring initiative (Task 6.1).

## Structure

```
chat/
├── components/
│   ├── ChatInterface.tsx    # Main chat UI component (~400 lines)
│   └── index.ts              # Component exports
├── types/
│   └── chat.types.ts         # TypeScript type definitions
└── README.md                 # This file
```

## Components

### ChatInterface

Main chat UI component that handles:
- Message display with markdown rendering
- Real-time streaming content updates
- Message input with contentEditable div
- Send/Stop generation buttons
- Typing indicators and AI status display
- Connection status indicators
- Auto-scrolling to latest messages

**Props:**
- `messages`: Array of chat messages to display
- `messagesLoading`: Loading state for messages
- `isGenerating`: Whether AI is currently generating a response
- `aiStatus`: Current AI processing status message
- `inputText`: Current input text value
- `streamingContent`: Real-time streaming content by message ID
- `onInputChange`: Handler for input text changes
- `onSendMessage`: Handler for sending messages
- `onStopGeneration`: Handler for stopping AI generation
- `onKeyPress`: Handler for keyboard events (Enter to send)

**Features:**
- Markdown rendering with ReactMarkdown and remark-gfm
- Custom markdown heading conversion
- Streaming content display during AI generation
- Message timestamps
- User/Assistant message differentiation
- Responsive layout with floating input
- Glassmorphism UI design

## Usage Example

```tsx
import { ChatInterface } from '@/features/chat/components'

function MyChat() {
  const [messages, setMessages] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [inputText, setInputText] = useState('')
  const [streamingContent, setStreamingContent] = useState({})
  const [aiStatus, setAiStatus] = useState(null)

  return (
    <ChatInterface
      messages={messages}
      messagesLoading={false}
      isGenerating={isGenerating}
      aiStatus={aiStatus}
      inputText={inputText}
      streamingContent={streamingContent}
      onInputChange={setInputText}
      onSendMessage={handleSendMessage}
      onStopGeneration={handleStopGeneration}
      onKeyPress={handleKeyPress}
    />
  )
}
```

## Integration with VeeGPT.tsx

To integrate this component back into VeeGPT.tsx:

1. Import the ChatInterface component
2. Pass the necessary props from VeeGPT state
3. Replace the inline chat UI JSX with the ChatInterface component

Example integration:

```tsx
// In VeeGPT.tsx
import { ChatInterface } from '@/features/chat/components'

// ... existing code ...

return (
  <div className="flex-1 flex flex-col">
    {/* Header and other UI */}
    
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

## Type Safety

All types are defined in `types/chat.types.ts`:
- `ChatConversation`: Conversation metadata
- `ChatMessage`: Individual message structure
- `StreamingContent`: Real-time streaming content mapping
- `WebSocketMessage`: WebSocket event types

## Dependencies

- `react`: Core React library
- `react-markdown`: Markdown rendering
- `remark-gfm`: GitHub Flavored Markdown support
- `lucide-react`: Icon components
- `@/components/ui/button`: UI button component
- `@/components/ui/skeleton`: Loading skeleton components

## Refactoring Benefits

1. **Reduced file size**: Extracted ~400 lines from VeeGPT.tsx
2. **Better separation of concerns**: Chat UI is now isolated
3. **Improved testability**: Component can be tested independently
4. **Reusability**: Can be used in other parts of the application
5. **Type safety**: Explicit TypeScript interfaces for props
6. **Maintainability**: Easier to understand and modify

## Future Improvements

- Extract WebSocket logic into a custom hook (useWebSocketChat)
- Extract message rendering into a separate MessageList component
- Extract input controls into a MessageInput component
- Add unit tests for the ChatInterface component
- Add property-based tests for markdown conversion
- Extract conversation sidebar into ConversationSidebar component

## Requirements Mapping

This extraction addresses:
- **Requirement 2.2**: Large file decomposition (VeeGPT.tsx 2,365 lines)
- **Requirement 14.1**: Chat interface optimization and refactoring
