/**
 * useWebSocketChat Hook - Usage Examples
 * 
 * This file demonstrates how to use the useWebSocketChat hook
 * in your React components for real-time chat functionality.
 */

import React, { useEffect, useState } from 'react'
import { useWebSocketChat } from './useWebSocketChat'

/**
 * Example 1: Basic Chat Component
 * 
 * Shows how to set up a basic chat component with WebSocket connection
 */
export function BasicChatExample() {
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [inputText, setInputText] = useState('')
  
  const {
    connectionStatus,
    aiStatus,
    isGenerating,
    streamingContent,
    subscribeToConversation,
    sendMessage,
    stopGeneration
  } = useWebSocketChat()

  // Subscribe to conversation when it changes
  useEffect(() => {
    if (conversationId) {
      subscribeToConversation(conversationId)
    }
  }, [conversationId, subscribeToConversation])

  const handleSendMessage = async () => {
    if (!conversationId || !inputText.trim()) return
    
    try {
      await sendMessage(conversationId, inputText)
      setInputText('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  return (
    <div>
      {/* Connection Status Indicator */}
      <div>Status: {connectionStatus}</div>
      
      {/* AI Status (during generation) */}
      {aiStatus && <div>{aiStatus}</div>}
      
      {/* Message Input */}
      <input
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={isGenerating}
      />
      
      {/* Send or Stop Button */}
      {isGenerating ? (
        <button onClick={stopGeneration}>Stop</button>
      ) : (
        <button onClick={handleSendMessage}>Send</button>
      )}
      
      {/* Streaming Content Display */}
      {Object.entries(streamingContent).map(([messageId, content]) => (
        <div key={messageId}>
          Streaming: {content}
        </div>
      ))}
    </div>
  )
}

/**
 * Example 2: Advanced Chat with Connection Management
 * 
 * Demonstrates advanced features like manual reconnection
 * and connection error handling
 */
export function AdvancedChatExample() {
  const {
    connectionStatus,
    reconnectAttempts,
    reconnect,
    disconnect,
    subscribeToConversation
  } = useWebSocketChat({
    maxReconnectAttempts: 5,
    reconnectDelay: 3000,
    connectionTimeout: 15000
  })

  return (
    <div>
      <div>
        Connection: {connectionStatus}
        {reconnectAttempts > 0 && ` (Attempt ${reconnectAttempts})`}
      </div>
      
      {connectionStatus === 'error' && (
        <button onClick={reconnect}>Retry Connection</button>
      )}
      
      {connectionStatus === 'connected' && (
        <button onClick={disconnect}>Disconnect</button>
      )}
    </div>
  )
}

/**
 * Example 3: Integration with React Query
 * 
 * Shows how to integrate useWebSocketChat with React Query
 * for message history and conversation management
 */
export function ReactQueryIntegrationExample() {
  const [conversationId, setConversationId] = useState<number | null>(null)
  
  const {
    streamingContent,
    isGenerating,
    subscribeToConversation,
    sendMessage,
    clearStreamingContent
  } = useWebSocketChat()

  // Subscribe when conversation changes
  useEffect(() => {
    if (conversationId) {
      subscribeToConversation(conversationId)
    }
  }, [conversationId, subscribeToConversation])

  // Clear streaming content when switching conversations
  useEffect(() => {
    clearStreamingContent()
  }, [conversationId, clearStreamingContent])

  const handleSendMessage = async (content: string) => {
    if (!conversationId) return
    
    try {
      await sendMessage(conversationId, content)
    } catch (error) {
      console.error('Send failed:', error)
    }
  }

  return (
    <div>
      {/* Your chat UI here */}
      <div>Generation status: {isGenerating ? 'Generating...' : 'Ready'}</div>
    </div>
  )
}

/**
 * Example 4: Custom Hook Composition
 * 
 * Create a higher-level hook that combines useWebSocketChat
 * with other chat-related functionality
 */
export function useChatConversation(conversationId: number | null) {
  const webSocketChat = useWebSocketChat()
  const [messages, setMessages] = useState<any[]>([])

  useEffect(() => {
    if (conversationId) {
      webSocketChat.subscribeToConversation(conversationId)
    }
    
    return () => {
      webSocketChat.unsubscribeFromConversation()
    }
  }, [conversationId, webSocketChat])

  const sendMessage = async (content: string) => {
    if (!conversationId) return
    return webSocketChat.sendMessage(conversationId, content)
  }

  return {
    ...webSocketChat,
    messages,
    sendMessage
  }
}
