/**
 * useWebSocketChat Hook
 * 
 * Custom hook for managing WebSocket connections for real-time chat functionality.
 * Extracted from VeeGPT.tsx (2,365 lines) as part of the refactoring initiative.
 * 
 * Features:
 * - WebSocket connection management with auto-reconnect
 * - Message streaming with real-time chunk handling
 * - Connection state tracking (connected, connecting, disconnected)
 * - Conversation subscription management
 * - AI status updates during message generation
 * - Stream event handling (status, userMessage, aiMessageStart, chunk, complete, error)
 * - Graceful error handling and reconnection logic
 * 
 * Requirements: 14.2, 14.5
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChatMessage, WebSocketMessage, StreamingContent } from '../types/chat.types'

export interface UseWebSocketChatOptions {
  /** Maximum number of reconnection attempts before giving up */
  maxReconnectAttempts?: number
  /** Delay in milliseconds before attempting reconnection */
  reconnectDelay?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Environment mode (affects reconnection behavior) */
  isDevelopment?: boolean
}

export interface WebSocketChatState {
  /** Current WebSocket connection status */
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  /** Current AI processing status message */
  aiStatus: string | null
  /** Whether AI is currently generating a response */
  isGenerating: boolean
  /** Whether content is actively streaming */
  isContentStreaming: boolean
  /** Streaming content keyed by message ID */
  streamingContent: StreamingContent
  /** Current reconnection attempt count */
  reconnectAttempts: number
}

export interface UseWebSocketChatReturn extends WebSocketChatState {
  /** Subscribe to a conversation for real-time updates */
  subscribeToConversation: (conversationId: number) => void
  /** Unsubscribe from current conversation */
  unsubscribeFromConversation: () => void
  /** Manually trigger WebSocket reconnection */
  reconnect: () => void
  /** Disconnect and cleanup WebSocket */
  disconnect: () => void
  /** Send a message through WebSocket (returns Promise for streaming completion) */
  sendMessage: (conversationId: number, content: string) => Promise<any>
  /** Stop current AI generation */
  stopGeneration: () => void
  /** Clear streaming content for a specific message or all messages */
  clearStreamingContent: (messageId?: number) => void
  /** Internal ref to track generation state (for external synchronization) */
  isGeneratingRef: React.MutableRefObject<boolean>
}

/**
 * Custom hook for WebSocket chat connection management
 */
export const useWebSocketChat = (
  options: UseWebSocketChatOptions = {}
): UseWebSocketChatReturn => {
  const {
    maxReconnectAttempts = process.env.NODE_ENV === 'development' ? 1 : 3,
    reconnectDelay = 5000,
    connectionTimeout = 10000,
    isDevelopment = process.env.NODE_ENV === 'development'
  } = options

  const queryClient = useQueryClient()

  // WebSocket connection ref
  const wsRef = useRef<WebSocket | null>(null)
  
  // Generation state refs (for synchronous access in event handlers)
  const isGeneratingRef = useRef<boolean>(false)
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const streamResolveRef = useRef<((value: any) => void) | null>(null)
  const currentConversationIdRef = useRef<number | null>(null)

  // State management
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected')
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isContentStreaming, setIsContentStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<StreamingContent>({})
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  /**
   * Handle incoming WebSocket stream events
   */
  const handleStreamEvent = useCallback((data: WebSocketMessage) => {
    console.log('[useWebSocketChat] Stream event received:', data.type, data)

    switch (data.type) {
      case 'status':
        // Real-time AI processing status updates - allow until content streaming starts
        if (!isContentStreaming) {
          console.log('[useWebSocketChat] Status update:', data.content || data.status)
          setAiStatus(data.content || data.status || null)
          
          // Clear any existing timeout
          if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current)
          }
          
          // Auto-clear status after 3 seconds
          statusTimeoutRef.current = setTimeout(() => {
            console.log('[useWebSocketChat] Status auto-timeout - clearing')
            setAiStatus(null)
          }, 3000)
        }
        break

      case 'userMessage':
        // Add user message to cache immediately
        if (currentConversationIdRef.current && data.message) {
          queryClient.setQueryData(
            ['/api/chat/conversations', currentConversationIdRef.current, 'messages'],
            (oldMessages: ChatMessage[] = []) => {
              // Check if message already exists to avoid duplicates
              const messageExists = oldMessages.some(msg => msg.id === data.message!.id)
              if (messageExists) return oldMessages
              return [...oldMessages, data.message!]
            }
          )
        }
        break

      case 'aiMessageStart':
        // Initialize streaming content for this message
        if (data.messageId) {
          console.log('[useWebSocketChat] Starting AI message stream for ID:', data.messageId)
          setStreamingContent(prev => ({
            ...prev,
            [data.messageId!]: ''
          }))
          
          // Ensure generation state is set
          setIsGenerating(true)
          isGeneratingRef.current = true
          
          // Add placeholder AI message to cache
          if (currentConversationIdRef.current) {
            const placeholderMessage: ChatMessage = {
              id: data.messageId,
              conversationId: currentConversationIdRef.current,
              role: 'assistant',
              content: '',
              tokensUsed: 0,
              createdAt: new Date().toISOString()
            }
            
            queryClient.setQueryData(
              ['/api/chat/conversations', currentConversationIdRef.current, 'messages'],
              (oldMessages: ChatMessage[] = []) => {
                const messageExists = oldMessages.some(msg => msg.id === data.messageId)
                if (messageExists) return oldMessages
                return [...oldMessages, placeholderMessage]
              }
            )
          }
        }
        break

      case 'chunk':
        console.log('[useWebSocketChat] Chunk received:', {
          messageId: data.messageId,
          content: data.content,
          isGenerating: isGeneratingRef.current
        })
        
        // Clear status immediately when streaming starts
        setAiStatus(null)
        setIsContentStreaming(true)
        
        // Clear status timeout
        if (statusTimeoutRef.current) {
          clearTimeout(statusTimeoutRef.current)
          statusTimeoutRef.current = null
        }
        
        // Ensure generation state is active
        setIsGenerating(true)
        isGeneratingRef.current = true
        
        // Update streaming content - accumulate chunks
        if (data.messageId && data.content !== undefined) {
          setStreamingContent(prev => {
            const currentContent = prev[data.messageId!] || ''
            const newContent = currentContent + data.content
            console.log('[useWebSocketChat] Streaming update - Message:', data.messageId, 'New total length:', newContent.length)
            
            return {
              ...prev,
              [data.messageId!]: newContent
            }
          })
          
          // Ensure placeholder message exists in cache
          if (currentConversationIdRef.current) {
            queryClient.setQueryData(
              ['/api/chat/conversations', currentConversationIdRef.current, 'messages'],
              (oldMessages: ChatMessage[] = []) => {
                const messageExists = oldMessages.some(msg => msg.id === data.messageId)
                if (!messageExists) {
                  const placeholderMessage: ChatMessage = {
                    id: data.messageId!,
                    conversationId: currentConversationIdRef.current!,
                    role: 'assistant',
                    content: '',
                    tokensUsed: 0,
                    createdAt: new Date().toISOString()
                  }
                  return [...oldMessages, placeholderMessage]
                }
                return oldMessages
              }
            )
          }
        }
        break

      case 'complete':
        console.log('[useWebSocketChat] Streaming completed')
        
        // Generation completed - reset states
        setIsGenerating(false)
        setIsContentStreaming(false)
        isGeneratingRef.current = false
        
        // Invalidate queries to get final message state from backend
        if (currentConversationIdRef.current) {
          queryClient.invalidateQueries({ 
            queryKey: ['/api/chat/conversations', currentConversationIdRef.current, 'messages'] 
          })
          queryClient.invalidateQueries({ 
            queryKey: ['/api/chat/conversations'] 
          })
        }
        
        // Resolve streaming promise
        if (streamResolveRef.current) {
          streamResolveRef.current({ success: true })
          streamResolveRef.current = null
        }
        break

      case 'error':
        console.error('[useWebSocketChat] Stream error:', data.error)
        setIsGenerating(false)
        setIsContentStreaming(false)
        isGeneratingRef.current = false
        setAiStatus(null)
        
        // Reject streaming promise
        if (streamResolveRef.current) {
          streamResolveRef.current({ success: false, error: data.error })
          streamResolveRef.current = null
        }
        break
    }
  }, [isContentStreaming, queryClient])

  /**
   * Establish WebSocket connection
   */
  const connectWebSocket = useCallback(() => {
    // Prevent excessive reconnections
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('[useWebSocketChat] Max reconnection attempts reached')
      setConnectionStatus('error')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}`
    
    console.log('[useWebSocketChat] Connecting to:', wsUrl, 'Attempt:', reconnectAttempts + 1)
    setConnectionStatus('connecting')
    
    const ws = new WebSocket(wsUrl)
    
    // Connection timeout
    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('[useWebSocketChat] Connection timeout')
        ws.close()
      }
    }, connectionTimeout)
    
    ws.onopen = () => {
      console.log('[useWebSocketChat] Connected successfully')
      clearTimeout(timeout)
      wsRef.current = ws
      setConnectionStatus('connected')
      setReconnectAttempts(0)
      
      // Subscribe to current conversation if exists
      if (currentConversationIdRef.current) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          conversationId: currentConversationIdRef.current
        }))
        console.log('[useWebSocketChat] Auto-subscribed to conversation:', currentConversationIdRef.current)
      }
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage
        handleStreamEvent(data)
      } catch (error) {
        console.error('[useWebSocketChat] Parse error:', error)
      }
    }
    
    ws.onclose = (event) => {
      console.log('[useWebSocketChat] Connection closed:', event.code, event.reason)
      clearTimeout(timeout)
      wsRef.current = null
      setConnectionStatus('disconnected')
      
      // Auto-reconnect for abnormal closures
      if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < maxReconnectAttempts) {
        console.log('[useWebSocketChat] Reconnecting in', reconnectDelay / 1000, 'seconds...')
        setTimeout(() => {
          setReconnectAttempts(prev => prev + 1)
        }, reconnectDelay)
      }
    }
    
    ws.onerror = (error) => {
      console.error('[useWebSocketChat] Connection error:', error)
      setConnectionStatus('error')
    }
    
    return () => {
      clearTimeout(timeout)
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [reconnectAttempts, maxReconnectAttempts, reconnectDelay, connectionTimeout, handleStreamEvent])

  /**
   * Subscribe to a conversation for real-time updates
   */
  const subscribeToConversation = useCallback((conversationId: number) => {
    currentConversationIdRef.current = conversationId
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        conversationId
      }))
      console.log('[useWebSocketChat] Subscribed to conversation:', conversationId)
    } else {
      console.log('[useWebSocketChat] WebSocket not ready, will subscribe when connected')
    }
  }, [])

  /**
   * Unsubscribe from current conversation
   */
  const unsubscribeFromConversation = useCallback(() => {
    if (currentConversationIdRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        conversationId: currentConversationIdRef.current
      }))
      console.log('[useWebSocketChat] Unsubscribed from conversation:', currentConversationIdRef.current)
    }
    currentConversationIdRef.current = null
  }, [])

  /**
   * Send a message through WebSocket
   */
  const sendMessage = useCallback(async (conversationId: number, content: string): Promise<any> => {
    console.log('[useWebSocketChat] Sending message via WebSocket')
    
    // Set generation state
    setIsGenerating(true)
    setIsContentStreaming(false)
    isGeneratingRef.current = true
    
    // Create optimistic user message
    const tempUserMessage: ChatMessage = {
      id: Date.now(),
      conversationId,
      role: 'user',
      content: content.trim(),
      tokensUsed: 0,
      createdAt: new Date().toISOString()
    }
    
    queryClient.setQueryData(
      ['/api/chat/conversations', conversationId, 'messages'],
      (old: ChatMessage[] = []) => [...old, tempUserMessage]
    )
    
    try {
      // Get auth token (assuming Firebase auth)
      const { getAuth } = await import('firebase/auth')
      const auth = getAuth()
      const user = auth.currentUser
      
      if (!user) {
        throw new Error('Please sign in to continue')
      }

      const token = await user.getIdToken()

      // Send message to server (response will stream via WebSocket)
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[useWebSocketChat] Message sent, streaming via WebSocket')
      return result

    } catch (error) {
      console.error('[useWebSocketChat] Send message error:', error)
      setIsGenerating(false)
      isGeneratingRef.current = false
      throw error
    }
  }, [queryClient])

  /**
   * Stop current AI generation
   */
  const stopGeneration = useCallback(() => {
    console.log('[useWebSocketChat] Stopping generation')
    setIsGenerating(false)
    setIsContentStreaming(false)
    isGeneratingRef.current = false
  }, [])

  /**
   * Clear streaming content
   */
  const clearStreamingContent = useCallback((messageId?: number) => {
    if (messageId !== undefined) {
      setStreamingContent(prev => {
        const updated = { ...prev }
        delete updated[messageId]
        return updated
      })
    } else {
      setStreamingContent({})
    }
  }, [])

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(() => {
    console.log('[useWebSocketChat] Manual reconnection triggered')
    if (wsRef.current) {
      wsRef.current.close()
    }
    setReconnectAttempts(0)
  }, [])

  /**
   * Disconnect and cleanup
   */
  const disconnect = useCallback(() => {
    console.log('[useWebSocketChat] Disconnecting')
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionStatus('disconnected')
    setReconnectAttempts(0)
  }, [])

  // Initialize WebSocket connection on mount
  useEffect(() => {
    // In development, add delay to prevent reconnections during hot reloads
    if (isDevelopment) {
      const timer = setTimeout(connectWebSocket, 1000)
      return () => clearTimeout(timer)
    } else {
      return connectWebSocket()
    }
  }, [connectWebSocket, isDevelopment])

  // Auto-reconnect when reconnectAttempts changes
  useEffect(() => {
    if (reconnectAttempts > 0 && reconnectAttempts < maxReconnectAttempts) {
      connectWebSocket()
    }
  }, [reconnectAttempts, maxReconnectAttempts, connectWebSocket])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return {
    // State
    connectionStatus,
    aiStatus,
    isGenerating,
    isContentStreaming,
    streamingContent,
    reconnectAttempts,
    
    // Methods
    subscribeToConversation,
    unsubscribeFromConversation,
    reconnect,
    disconnect,
    sendMessage,
    stopGeneration,
    clearStreamingContent,
    
    // Refs (for external synchronization)
    isGeneratingRef
  }
}
