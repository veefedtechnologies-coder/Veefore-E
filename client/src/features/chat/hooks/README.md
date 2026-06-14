# Chat Hooks

Custom React hooks for chat functionality, extracted from the VeeGPT.tsx refactoring initiative.

## Available Hooks

### `useWebSocketChat`

A comprehensive custom hook for managing WebSocket connections for real-time chat functionality.

#### Features

- ✅ **WebSocket Connection Management**: Automatic connection, reconnection, and cleanup
- ✅ **Auto-Reconnect**: Configurable reconnection attempts with exponential backoff
- ✅ **Message Streaming**: Real-time chunk-by-chunk message streaming
- ✅ **Connection State Tracking**: Know exactly when you're connected, connecting, or disconnected
- ✅ **Conversation Subscription**: Subscribe/unsubscribe to conversations for targeted updates
- ✅ **AI Status Updates**: Real-time status messages during AI processing
- ✅ **Stream Event Handling**: Handles all WebSocket event types (status, userMessage, aiMessageStart, chunk, complete, error)
- ✅ **Graceful Error Handling**: Built-in error recovery and user feedback
- ✅ **React Query Integration**: Seamlessly updates React Query cache with streaming data

#### Requirements

**Validates Requirements:** 14.2, 14.5

- **14.2**: The Refactoring_System SHALL create a useWebSocketChat custom hook that manages WebSocket connections, message streaming, and connection state
- **14.5**: WHEN the chat interface is refactored, THE Refactoring_System SHALL preserve real-time message streaming, conversation history, and markdown rendering capabilities

#### Installation

```typescript
import { useWebSocketChat } from '@/features/chat/hooks'
```

#### Basic Usage

```typescript
import { useWebSocketChat } from '@/features/chat/hooks'

function ChatComponent() {
  const {
    connectionStatus,
    aiStatus,
    isGenerating,
    streamingContent,
    subscribeToConversation,
    sendMessage,
    stopGeneration
  } = useWebSocketChat()

  // Subscribe to a conversation
  useEffect(() => {
    if (conversationId) {
      subscribeToConversation(conversationId)
    }
  }, [conversationId, subscribeToConversation])

  // Send a message
  const handleSend = async () => {
    await sendMessage(conversationId, messageText)
  }

  // Stop generation
  const handleStop = () => {
    stopGeneration()
  }

  return (
    <div>
      <div>Status: {connectionStatus}</div>
      {aiStatus && <div>{aiStatus}</div>}
      {/* Your chat UI */}
    </div>
  )
}
```

#### Advanced Configuration

```typescript
const {
  connectionStatus,
  reconnectAttempts,
  reconnect
} = useWebSocketChat({
  maxReconnectAttempts: 5,      // Max reconnection attempts (default: 3, dev: 1)
  reconnectDelay: 5000,          // Delay between reconnection attempts (default: 5000ms)
  connectionTimeout: 10000,      // Connection timeout (default: 10000ms)
  isDevelopment: false           // Development mode (default: NODE_ENV === 'development')
})
```

#### API Reference

##### State

| Property | Type | Description |
|----------|------|-------------|
| `connectionStatus` | `'connected' \| 'connecting' \| 'disconnected' \| 'error'` | Current WebSocket connection status |
| `aiStatus` | `string \| null` | Current AI processing status message |
| `isGenerating` | `boolean` | Whether AI is currently generating a response |
| `isContentStreaming` | `boolean` | Whether content is actively streaming |
| `streamingContent` | `StreamingContent` | Streaming content keyed by message ID |
| `reconnectAttempts` | `number` | Current reconnection attempt count |

##### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribeToConversation` | `(conversationId: number) => void` | Subscribe to a conversation for real-time updates |
| `unsubscribeFromConversation` | `() => void` | Unsubscribe from current conversation |
| `reconnect` | `() => void` | Manually trigger WebSocket reconnection |
| `disconnect` | `() => void` | Disconnect and cleanup WebSocket |
| `sendMessage` | `(conversationId: number, content: string) => Promise<any>` | Send a message through WebSocket |
| `stopGeneration` | `() => void` | Stop current AI generation |
| `clearStreamingContent` | `(messageId?: number) => void` | Clear streaming content for specific or all messages |

##### Refs

| Ref | Type | Description |
|-----|------|-------------|
| `isGeneratingRef` | `React.MutableRefObject<boolean>` | Ref for generation state (for external synchronization) |

#### WebSocket Event Types

The hook handles the following WebSocket event types:

1. **`status`**: AI processing status updates
2. **`userMessage`**: User message received and stored
3. **`aiMessageStart`**: AI response generation started
4. **`chunk`**: Streaming content chunk received
5. **`complete`**: Streaming completed successfully
6. **`error`**: Error occurred during streaming

#### Integration with React Query

The hook automatically updates React Query cache when:
- User messages are sent (optimistic updates)
- AI placeholder messages are created
- Streaming completes (invalidates queries to fetch final state)

#### Connection Management

The hook implements robust connection management:

1. **Automatic Connection**: Establishes WebSocket connection on mount
2. **Auto-Reconnect**: Attempts to reconnect on abnormal disconnections
3. **Max Attempts**: Stops reconnection after reaching max attempts
4. **Connection Timeout**: Closes hanging connections after timeout
5. **Clean Shutdown**: Properly closes connection on unmount

#### Development Mode

In development mode (`NODE_ENV === 'development'`):
- Reduces max reconnection attempts to 1 (to prevent excessive logs)
- Adds 1-second delay before initial connection (prevents hot-reload reconnections)

#### Error Handling

The hook gracefully handles:
- Connection failures
- Parse errors
- Authentication failures
- Server errors
- Network interruptions

#### Best Practices

1. **Subscribe on Mount**: Subscribe to conversations in `useEffect`
2. **Cleanup**: Unsubscribe when switching conversations
3. **Error Boundaries**: Wrap components using this hook in error boundaries
4. **Loading States**: Show loading indicators based on `connectionStatus`
5. **Optimistic Updates**: The hook handles optimistic UI updates automatically

#### Examples

See `useWebSocketChat.example.tsx` for comprehensive usage examples including:
- Basic chat component
- Advanced connection management
- React Query integration
- Custom hook composition

#### Architecture

```
useWebSocketChat
├── Connection Management
│   ├── Auto-connect on mount
│   ├── Reconnection logic
│   └── Cleanup on unmount
├── Event Handling
│   ├── Status updates
│   ├── Message streaming
│   └── Error handling
├── State Management
│   ├── Connection status
│   ├── Generation state
│   └── Streaming content
└── React Query Integration
    ├── Optimistic updates
    └── Cache invalidation
```

#### Performance Considerations

- **Efficient Re-renders**: Uses refs for synchronous state access in event handlers
- **Batch Updates**: Batches streaming content updates
- **Memory Management**: Cleans up timeouts and connections properly
- **Network Efficiency**: Reuses single WebSocket connection for all conversations

#### Troubleshooting

**Issue**: Connection keeps reconnecting
- **Solution**: Check max reconnection attempts, ensure server is running

**Issue**: Messages not streaming
- **Solution**: Verify conversation subscription, check WebSocket event handlers

**Issue**: Memory leaks
- **Solution**: Ensure proper cleanup in `useEffect` return functions

**Issue**: Duplicate messages
- **Solution**: Hook automatically handles deduplication in React Query cache

#### Migration from VeeGPT.tsx

This hook was extracted from `VeeGPT.tsx` (2,365 lines). If migrating existing code:

1. Replace direct WebSocket usage with `useWebSocketChat`
2. Remove manual connection management code
3. Use hook's `streamingContent` instead of local state
4. Leverage built-in reconnection instead of manual logic
5. Remove manual React Query cache updates (handled by hook)

#### Version History

- **v1.0.0** (Current): Initial extraction from VeeGPT.tsx
  - WebSocket connection management
  - Message streaming
  - Auto-reconnect
  - React Query integration

#### Related Components

- `ChatInterface.tsx`: Main chat UI component
- `MessageList.tsx`: Message display with virtual scrolling
- `ConversationSidebar.tsx`: Conversation list component

#### Contributing

When modifying this hook:
1. Maintain backward compatibility
2. Add comprehensive tests
3. Update this documentation
4. Test with development and production WebSocket servers
