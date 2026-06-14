/**
 * MessageList Component - Usage Examples
 * 
 * This file demonstrates various use cases for the MessageList component.
 * Copy and adapt these examples for your implementation.
 */

import React, { useState, useEffect } from 'react'
import { MessageList, ChatMessage } from './MessageList'

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

export function BasicMessageListExample() {
  const [messages] = useState<ChatMessage[]>([
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'Hello! Can you help me with React?',
      tokensUsed: 8,
      createdAt: new Date('2024-01-01T10:00:00Z')
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: 'Of course! I\'d be happy to help you with React. What would you like to know?',
      tokensUsed: 15,
      createdAt: new Date('2024-01-01T10:00:05Z')
    }
  ])

  return (
    <div className="h-screen p-6">
      <MessageList messages={messages} />
    </div>
  )
}

// ============================================================================
// Example 2: With Streaming Content
// ============================================================================

export function StreamingMessageListExample() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'Write a function to sort an array',
      tokensUsed: 7,
      createdAt: new Date()
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: '', // Content will be streamed
      tokensUsed: 0,
      createdAt: new Date()
    }
  ])

  const [streamingContent, setStreamingContent] = useState<Record<number, string>>({})
  const [isGenerating, setIsGenerating] = useState(true)

  // Simulate streaming
  useEffect(() => {
    const fullResponse = `Here's a simple sorting function in JavaScript:

\`\`\`javascript
function sortArray(arr) {
  return arr.sort((a, b) => a - b);
}
\`\`\`

This uses the built-in sort method with a comparison function.`

    let currentIndex = 0
    const interval = setInterval(() => {
      if (currentIndex < fullResponse.length) {
        setStreamingContent({ 2: fullResponse.substring(0, currentIndex + 1) })
        currentIndex++
      } else {
        clearInterval(interval)
        setIsGenerating(false)
        // Update the actual message
        setMessages(prev => prev.map(msg => 
          msg.id === 2 ? { ...msg, content: fullResponse, tokensUsed: 50 } : msg
        ))
        setStreamingContent({})
      }
    }, 50)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-screen p-6">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isGenerating={isGenerating}
      />
    </div>
  )
}

// ============================================================================
// Example 3: With Message Actions
// ============================================================================

export function InteractiveMessageListExample() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'What is React?',
      tokensUsed: 4,
      createdAt: new Date()
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: 'React is a JavaScript library for building user interfaces.',
      tokensUsed: 12,
      createdAt: new Date()
    }
  ])

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    alert('Message copied to clipboard!')
  }

  const handleEditMessage = (messageId: number) => {
    const newContent = prompt('Edit message:')
    if (newContent) {
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, content: newContent } : msg
      ))
    }
  }

  const handleDeleteMessage = (messageId: number) => {
    if (confirm('Are you sure you want to delete this message?')) {
      setMessages(prev => prev.filter(msg => msg.id !== messageId))
    }
  }

  return (
    <div className="h-screen p-6">
      <MessageList
        messages={messages}
        onCopyMessage={handleCopyMessage}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
      />
    </div>
  )
}

// ============================================================================
// Example 4: Large Conversation (Virtual Scrolling)
// ============================================================================

export function LargeMessageListExample() {
  // Generate 200 messages to demonstrate virtual scrolling
  const [messages] = useState<ChatMessage[]>(
    Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      conversationId: 1,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `This is message number ${i + 1}. ${
        i % 2 === 0
          ? 'This is from the user.'
          : 'This is a response from the assistant with some helpful information.'
      }`,
      tokensUsed: 10,
      createdAt: new Date(Date.now() - (200 - i) * 60000) // Stagger times
    }))
  )

  return (
    <div className="h-screen p-6">
      <h2 className="text-xl font-bold mb-4">Large Conversation (200 messages)</h2>
      <div className="h-[calc(100vh-100px)]">
        <MessageList messages={messages} />
      </div>
    </div>
  )
}

// ============================================================================
// Example 5: Markdown Content
// ============================================================================

export function MarkdownMessageListExample() {
  const [messages] = useState<ChatMessage[]>([
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'Can you explain the SOLID principles?',
      tokensUsed: 7,
      createdAt: new Date()
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: `# SOLID Principles

The SOLID principles are five design principles for object-oriented programming:

## Single Responsibility Principle
A class should have only one reason to change.

## Open/Closed Principle
Software entities should be open for extension but closed for modification.

## Liskov Substitution Principle
Subtypes must be substitutable for their base types.

## Interface Segregation Principle
Clients should not be forced to depend on interfaces they don't use.

## Dependency Inversion Principle
High-level modules should not depend on low-level modules. Both should depend on abstractions.

### Example Code

\`\`\`typescript
// Good: Single Responsibility
class User {
  constructor(public name: string) {}
}

class UserRepository {
  save(user: User) {
    // Save logic
  }
}
\`\`\`

These principles help create more maintainable and scalable code.`,
      tokensUsed: 150,
      createdAt: new Date()
    }
  ])

  return (
    <div className="h-screen p-6">
      <MessageList messages={messages} />
    </div>
  )
}

// ============================================================================
// Example 6: Integration with WebSocket (Pseudo-code)
// ============================================================================

export function WebSocketIntegratedExample() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState<Record<number, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    // Pseudo-code for WebSocket integration
    const ws = new WebSocket('ws://localhost:3000')

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'userMessage':
          setMessages(prev => [...prev, data.message])
          break

        case 'aiMessageStart':
          setIsGenerating(true)
          setStreamingContent(prev => ({ ...prev, [data.messageId]: '' }))
          // Add placeholder message
          setMessages(prev => [...prev, {
            id: data.messageId,
            conversationId: data.conversationId,
            role: 'assistant',
            content: '',
            tokensUsed: 0,
            createdAt: new Date()
          }])
          break

        case 'chunk':
          setStreamingContent(prev => ({
            ...prev,
            [data.messageId]: (prev[data.messageId] || '') + data.content
          }))
          break

        case 'complete':
          setIsGenerating(false)
          // Move streaming content to actual message
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, content: streamingContent[data.messageId] || '', tokensUsed: data.tokensUsed }
              : msg
          ))
          setStreamingContent(prev => {
            const updated = { ...prev }
            delete updated[data.messageId]
            return updated
          })
          break
      }
    }

    return () => ws.close()
  }, [streamingContent])

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="h-screen p-6">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isGenerating={isGenerating}
        onCopyMessage={handleCopyMessage}
      />
    </div>
  )
}

// ============================================================================
// Example 7: Empty State
// ============================================================================

export function EmptyMessageListExample() {
  const [messages] = useState<ChatMessage[]>([])

  return (
    <div className="h-screen p-6 flex flex-col">
      <h2 className="text-xl font-bold mb-4">Empty Conversation</h2>
      <div className="flex-1 flex items-center justify-center">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">No messages yet</p>
            <p className="text-sm">Start a conversation to see messages here</p>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Example 8: With Custom Styling
// ============================================================================

export function CustomStyledMessageListExample() {
  const [messages] = useState<ChatMessage[]>([
    {
      id: 1,
      conversationId: 1,
      role: 'user',
      content: 'Custom styled message',
      tokensUsed: 4,
      createdAt: new Date()
    },
    {
      id: 2,
      conversationId: 1,
      role: 'assistant',
      content: 'Response with custom container styling',
      tokensUsed: 6,
      createdAt: new Date()
    }
  ])

  return (
    <div className="h-screen p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900 dark:to-blue-900">
      <div className="max-w-4xl mx-auto h-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl h-full p-6 overflow-hidden">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Custom Styled Chat
          </h2>
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            <MessageList messages={messages} />
          </div>
        </div>
      </div>
    </div>
  )
}
