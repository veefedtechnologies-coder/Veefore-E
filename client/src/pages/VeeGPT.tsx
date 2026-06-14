/**
 * VeeGPT Page
 *
 * Thin page wrapper (~150 lines) orchestrating extracted chat components.
 * All heavy logic has been moved to:
 *   - useWebSocketChat hook  → WebSocket + streaming state management
 *   - ChatInterface          → Message display + input area
 *   - ConversationSidebar   → Conversation list + navigation
 *
 * Task 6.6 - Requirements: 2.2, 14.1, 14.2, 14.5
 */

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import {
  Mic, Send, Lightbulb, TrendingUp, Camera,
  Target, Rocket, Edit3, Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/queryClient'
import { useUser } from '@/hooks/useUser'

import { ChatInterface } from '@/features/chat/components/ChatInterface'
import { ConversationSidebar } from '@/features/chat/components/ConversationSidebar'
import { useWebSocketChat } from '@/features/chat/hooks/useWebSocketChat'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type ChatMessage = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  tokensUsed: number
  createdAt: Date | string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: Lightbulb, text: 'Inspire me!' },
  { icon: TrendingUp, text: "What's trending in my industry?" },
  { icon: Camera, text: 'Caption an image' },
  { icon: Target, text: 'I need a campaign idea' },
  { icon: Rocket, text: 'How can I boost engagement?' },
  { icon: Edit3, text: 'Draft a TikTok script' },
  { icon: Edit3, text: 'Write an Instagram post' },
  { icon: Calendar, text: 'Draft a posting schedule for next month' },
]

// Cache helpers (localStorage, 24-hour expiry)
const CACHE_KEY = 'veegpt-state'
const getCachedState = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Date.now() - parsed.timestamp < 86_400_000) return parsed
    }
  } catch (_) {}
  return null
}
const setCachedState = (conversationId: number | null, hasSentFirstMessage: boolean) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ conversationId, hasSentFirstMessage, timestamp: Date.now() })) } catch (_) {}
}
const clearCachedState = () => {
  try { localStorage.removeItem(CACHE_KEY) } catch (_) {}
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function VeeGPT() {
  return (
    <>
      <SEO {...seoConfig.veeGPT} structuredData={generateStructuredData.softwareApplication()} />
      <VeeGPTContent />
    </>
  )
}

// ─── Page Orchestrator ────────────────────────────────────────────────────────

function VeeGPTContent() {
  const { userData, loading: userLoading, user: firebaseUser } = useUser()
  const queryClient = useQueryClient()

  // Normalize user data across Firebase / API sources
  const displayUserData = userData || (firebaseUser ? {
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    avatar: firebaseUser.photoURL,
    plan: 'Free',
  } : null)
  const finalUserData = displayUserData ? {
    displayName: displayUserData.displayName || (displayUserData as any).username,
    email: displayUserData.email,
    avatar: displayUserData.avatar || (displayUserData as any).photoURL,
    plan: displayUserData.plan || 'Free',
  } : null

  // ── Local page state ──────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0)
  const [inputText, setInputText] = useState('')
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)
  const [hasUserStartedNewChat, setHasUserStartedNewChat] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── WebSocket chat hook ───────────────────────────────────────────────────
  const {
    isGenerating,
    aiStatus,
    streamingContent,
    subscribeToConversation,
    sendMessage: wsSendMessage,
    stopGeneration,
    clearStreamingContent,
    isGeneratingRef,
  } = useWebSocketChat()

  // Debounce refreshKey when user data changes
  useEffect(() => {
    if (finalUserData) {
      const t = setTimeout(() => setRefreshKey(k => k + 1), 100)
      return () => clearTimeout(t)
    }
  }, [finalUserData])

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ChatConversation[]>({
    queryKey: ['/api/chat/conversations'],
    queryFn: () => apiRequest('/api/chat/conversations'),
  })

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/conversations', currentConversationId, 'messages'],
    queryFn: () => apiRequest(`/api/chat/conversations/${currentConversationId}/messages`),
    enabled: !!currentConversationId,
  })

  // ── Display messages composition ─────────────────────────────────────────
  let displayMessages: ChatMessage[] = [...messages]
  if (optimisticMessages.length > 0 && (!currentConversationId || messages.length === 0)) {
    displayMessages = [...optimisticMessages]
  }

  // Clear optimistic messages once real messages load
  useEffect(() => {
    if (currentConversationId && messages.length > 0 && optimisticMessages.length > 0) {
      setOptimisticMessages([])
    }
  }, [currentConversationId, messages.length, optimisticMessages.length])

  // Clear streaming content when real message arrives
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      Object.keys(streamingContent).forEach(id => {
        const numId = parseInt(id)
        const real = messages.find(m => m.id === numId)
        if (real?.content?.trim()) clearStreamingContent(numId)
      })
    }
  }, [currentConversationId, messages, streamingContent, clearStreamingContent])

  // Inject streaming placeholders into display list
  Object.keys(streamingContent).forEach(id => {
    const numId = parseInt(id)
    if (!displayMessages.some(m => m.id === numId)) {
      displayMessages.push({ id: numId, conversationId: currentConversationId || 0, role: 'assistant', content: '', tokensUsed: 0, createdAt: new Date() })
    }
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createConversationMutation = useMutation({
    mutationFn: async (content: string) => {
      isGeneratingRef.current = true
      const response = await apiRequest('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ content }),
        headers: { 'Content-Type': 'application/json' },
      })
      setCurrentConversationId(response.conversation.id)
      setHasSentFirstMessage(true)
      return response
    },
    onMutate: (content: string) => {
      setOptimisticMessages([{ id: Date.now(), conversationId: 0, role: 'user', content, tokensUsed: 0, createdAt: new Date() }])
      setHasSentFirstMessage(true)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', data.conversation.id, 'messages'] })
    },
    onError: () => {
      setHasSentFirstMessage(false)
      setCurrentConversationId(null)
      isGeneratingRef.current = false
      setOptimisticMessages([])
    },
  })

  const stopGenerationMutation = useMutation({
    mutationFn: (convId: number) => apiRequest(`/api/chat/conversations/${convId}/stop`, { method: 'POST' }),
    onSuccess: () => {
      if (currentConversationId) {
        queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', currentConversationId, 'messages'] })
      }
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    const content = inputText.trim()
    if (!content) return

    setInputText('')
    if (textareaRef.current) textareaRef.current.value = ''

    isGeneratingRef.current = true

    try {
      if (!currentConversationId) {
        const result = await createConversationMutation.mutateAsync(content)
        if (result?.conversation?.id) {
          subscribeToConversation(result.conversation.id)
        }
      } else {
        await wsSendMessage(currentConversationId, content)
      }
    } catch (err) {
      setInputText(content)
      if (textareaRef.current) textareaRef.current.value = content
    }
  }

  const handleStopGeneration = async () => {
    stopGeneration()
    if (currentConversationId) {
      try {
        await stopGenerationMutation.mutateAsync(currentConversationId)
        queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', currentConversationId, 'messages'] })
        queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
      } catch (_) {}
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setHasSentFirstMessage(false)
    setHasUserStartedNewChat(true)
    setInputText('')
    clearStreamingContent()
    setOptimisticMessages([])
    clearCachedState()
  }

  const selectConversation = (id: number) => {
    setCurrentConversationId(id)
    setHasSentFirstMessage(true)
    subscribeToConversation(id)
    clearStreamingContent()
    setOptimisticMessages([])
  }

  // ── Cache / init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cached = getCachedState()
    if (cached) {
      setCurrentConversationId(cached.conversationId)
      setHasSentFirstMessage(cached.hasSentFirstMessage)
      setIsInitializing(false)
    } else {
      const t = setTimeout(() => setIsInitializing(false), 100)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!isInitializing) setCachedState(currentConversationId, hasSentFirstMessage)
  }, [currentConversationId, hasSentFirstMessage, isInitializing])

  // Auto-select first conversation on first load if no cache
  useEffect(() => {
    if (conversations.length > 0 && !currentConversationId && !hasUserStartedNewChat && !hasSentFirstMessage) {
      if (!getCachedState()) {
        setHasSentFirstMessage(true)
        setCurrentConversationId(conversations[0].id)
      }
    }
  }, [conversations, currentConversationId, hasUserStartedNewChat, hasSentFirstMessage])

  // ── Render helpers ────────────────────────────────────────────────────────
  const shouldShowSidebar = conversations.length > 0 || conversationsLoading
  const showWelcomeScreen = !isInitializing && !conversationsLoading && !currentConversationId && (!hasSentFirstMessage || hasUserStartedNewChat) && optimisticMessages.length === 0

  // ── Background decoration (shared between both views) ─────────────────────
  const Background = () => (
    <div className="absolute inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900" />
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 15 }, (_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-blue-400 dark:bg-blue-300 rounded-full animate-slow-float"
            style={{ left: `${(i * 7.3) % 100}%`, top: `${(i * 6.1) % 100}%`, animationDelay: `${i * 3}s`, animationDuration: `${18 + (i % 5) * 2}s` }}
          />
        ))}
      </div>
      <div className="absolute bottom-0 left-0 w-full h-32 opacity-10">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="absolute bottom-0 bg-gradient-to-t from-blue-500/40 to-purple-500/20 dark:from-blue-400/30 dark:to-purple-400/15 rounded-t-lg animate-slow-pulse"
            style={{ left: `${10 + i * 10}%`, width: '6%', height: `${20 + (i * 8) % 60}%`, animationDelay: `${i * 2}s` }}
          />
        ))}
      </div>
    </div>
  )

  // ── Welcome Screen ────────────────────────────────────────────────────────
  if (showWelcomeScreen) {
    return (
      <div className="h-full w-full bg-gray-50 dark:bg-gray-900 flex relative overflow-hidden">
        <Background />
        <div className="relative z-10 w-full h-full flex">
          {shouldShowSidebar && (
            <ConversationSidebar
              conversations={conversations as any}
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
          )}

          {/* Welcome content */}
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-4xl">
              <div className="text-center mb-10">
                <h1 className="text-4xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  How can VeeGPT help?
                  <span className="ml-3 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium rounded">Beta</span>
                </h1>
              </div>

              {/* Main input */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm mb-8" style={{ border: '1px solid #d1d5db', borderRadius: '16px' }}>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.max(48, e.target.scrollHeight) + 'px'
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask VeeGPT a question"
                  className="w-full px-5 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
                  style={{ fontSize: '16px', height: '48px', lineHeight: '24px', border: 'none', boxShadow: 'none', wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                  rows={1}
                />
                <div className="flex items-center justify-between px-5 pb-4">
                  <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-400">
                    <Mic className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || createConversationMutation.isPending}
                    className={`p-2 rounded-lg transition-all duration-300 ${inputText.trim() ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'bg-gray-200 text-gray-400'}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick prompts */}
              <div className="space-y-3">
                {[QUICK_PROMPTS.slice(0, 4), QUICK_PROMPTS.slice(4, 7), QUICK_PROMPTS.slice(7)].map((row, ri) => (
                  <div key={ri} className="flex flex-wrap gap-2 justify-center">
                    {row.map((p, pi) => (
                      <button
                        key={pi}
                        onClick={() => setInputText(p.text)}
                        className="flex items-center space-x-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                      >
                        <p.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-base font-semibold">{p.text}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="text-center mt-10">
                <p className="text-xs text-gray-500 dark:text-gray-400">VeeGPT can make mistakes. Check important info.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Chat Interface ────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full bg-gray-50 dark:bg-gray-900 flex relative overflow-hidden">
      <Background />
      <div className="relative z-10 w-full h-full flex">
        {shouldShowSidebar && (
          <ConversationSidebar
            conversations={conversations as any}
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
        )}

        <ChatInterface
          messages={displayMessages as any}
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
    </div>
  )
}
