/**
 * ConversationSidebar Component
 * 
 * Handles conversation list display, search, filtering, and management actions
 * Extracted from VeeGPT.tsx as part of Task 6.2
 * 
 * Features:
 * - Conversation list with real-time updates
 * - Search and filter conversations
 * - New conversation button
 * - Conversation actions (rename, archive, delete)
 * - Collapsible sidebar
 * - User profile display
 * 
 * Requirements: 2.2, 14.1
 */

import React, { useState } from 'react'
import { 
  Edit,
  Search,
  MoreHorizontal,
  Edit3,
  Rocket,
  Archive,
  Trash2,
  Edit2,
  ChevronDown,
  PanelLeft
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { ChatConversation } from '../types/chat.types'
import { Skeleton } from '@/components/ui/skeleton'

interface ConversationSidebarProps {
  conversations: ChatConversation[]
  conversationsLoading: boolean
  currentConversationId: number | null
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  onSelectConversation: (conversationId: number) => void
  onStartNewChat: () => void
  /** Open the ChatGPT-style search-chats modal. */
  onOpenSearch?: () => void
  userData?: {
    displayName?: string
    email?: string
    avatar?: string
    plan?: string
  } | null
  userLoading?: boolean
  refreshKey?: number
}

const ConversationListSkeleton = () => (
  <div className="space-y-1">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center space-x-3 px-3 py-2.5 rounded-lg">
        <Skeleton className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-700" />
        <Skeleton className="h-4 flex-1 rounded bg-gray-300 dark:bg-gray-700" />
      </div>
    ))}
  </div>
)

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  conversationsLoading,
  currentConversationId,
  sidebarCollapsed,
  setSidebarCollapsed,
  onSelectConversation,
  onStartNewChat,
  onOpenSearch,
  userData,
  userLoading,
  refreshKey
}) => {
  const [hoveredChatId, setHoveredChatId] = useState<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null)
  const [newChatTitle, setNewChatTitle] = useState('')
  
  const queryClient = useQueryClient()

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Rename conversation mutation
  const renameConversationMutation = useMutation({
    mutationFn: async ({ conversationId, newTitle }: { conversationId: number, newTitle: string }) => {
      return apiRequest(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle })
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
      setRenamingChatId(null)
      setNewChatTitle('')
    }
  })

  // Delete conversation mutation
  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      return apiRequest(`/api/chat/conversations/${conversationId}`, {
        method: 'DELETE'
      })
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
      // If the deleted conversation was the current one, clear it
      if (currentConversationId === conversationId) {
        onStartNewChat()
      }
    }
  })

  // Archive conversation mutation
  const archiveConversationMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      return apiRequest(`/api/chat/conversations/${conversationId}/archive`, {
        method: 'POST'
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] })
    }
  })

  const handleRenameSubmit = (conversationId: number) => {
    if (newChatTitle.trim()) {
      renameConversationMutation.mutate({
        conversationId,
        newTitle: newChatTitle.trim()
      })
    }
    setRenamingChatId(null)
    setNewChatTitle('')
  }

  const handleDeleteConversation = (conversationId: number) => {
    if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      deleteConversationMutation.mutate(conversationId)
    }
    setDropdownOpen(null)
  }

  return (
    <div className={`${sidebarCollapsed ? 'w-16' : 'w-[17.5rem]'} bg-gray-100/80 dark:bg-slate-950/50 dark:backdrop-blur-xl border-r border-gray-200/80 dark:border-white/10 flex flex-col transition-all duration-500 ease-out`}>
      {/* Scrollable Content Area - Everything scrolls except user profile */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll">
        {/* Top Header with Logo */}
        <div className={`p-3 flex items-center transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {sidebarCollapsed ? (
            <button 
              onClick={() => setSidebarCollapsed(false)}
              className="group w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200/70 dark:hover:bg-white/10 transition-colors"
              title="Open sidebar"
            >
              <img src="/veefore-logo.png" alt="VeeFore" className="w-7 h-7 group-hover:hidden" />
              <PanelLeft className="w-5 h-5 text-gray-500 dark:text-gray-400 hidden group-hover:block" />
            </button>
          ) : (
            <>
              <img src="/veefore-logo.png" alt="VeeFore" className="w-8 h-8" />
              <button 
                onClick={() => setSidebarCollapsed(true)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200/70 dark:hover:bg-white/10 transition-colors"
                title="Close sidebar"
              >
                <PanelLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </>
          )}
        </div>

        {/* New Chat Button */}
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-4 transition-all duration-300`}>
          <button
            onClick={onStartNewChat}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/20 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200"
            title={sidebarCollapsed ? "New chat" : ""}
          >
            <Edit className={`w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5] mx-auto' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>New chat</span>
          </button>
        </div>

        {/* Navigation Menu */}
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-5 space-y-0.5 transition-all duration-300`}>
          <button 
            onClick={() => (onOpenSearch ? onOpenSearch() : setShowSearchInput(!showSearchInput))}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white rounded-lg transition-all duration-200"
            title={sidebarCollapsed ? "Search chats" : ""}
          >
            <Search className={`w-[18px] h-[18px] flex-shrink-0 text-gray-400 dark:text-gray-500 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5] mx-auto' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>Search chats</span>
          </button>
          
          <button 
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white rounded-lg transition-all duration-200"
            title={sidebarCollapsed ? "Content Studio" : ""}
          >
            <Edit3 className={`w-[18px] h-[18px] flex-shrink-0 text-gray-400 dark:text-gray-500 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5] mx-auto' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>Content Studio</span>
          </button>
          
          {!sidebarCollapsed && (
            <button 
              className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white rounded-lg transition-all duration-200"
              title="Auto Pilot"
            >
              <Rocket className="w-[18px] h-[18px] flex-shrink-0 text-gray-400 dark:text-gray-500 transition-all duration-500" />
              <span className="transition-all duration-500 opacity-100 w-auto ml-3">Auto Pilot</span>
            </button>
          )}
          
          {!sidebarCollapsed && (
            <button 
              className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white rounded-lg transition-all duration-200"
              title="AI Models"
            >
              <div className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center transition-all duration-500">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full shadow-sm shadow-blue-500/40"></div>
              </div>
              <span className="transition-all duration-500 opacity-100 w-auto ml-3">AI Models</span>
            </button>
          )}
        </div>

        {/* Search Input */}
        {showSearchInput && !sidebarCollapsed && (
          <div className="px-3 pb-4">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              autoFocus
            />
          </div>
        )}

        {/* Conversations Section */}
        {!sidebarCollapsed && (
          <div className="px-3">
            <div className={`text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-2 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
              Chats
            </div>
            {conversationsLoading ? (
              <ConversationListSkeleton />
            ) : (
              <div className="space-y-1">
                {filteredConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="relative"
                    onMouseEnter={() => setHoveredChatId(conversation.id)}
                    onMouseLeave={() => {
                      setHoveredChatId(null)
                      if (dropdownOpen === conversation.id) {
                        setTimeout(() => setDropdownOpen(null), 200)
                      }
                    }}
                  >
                    <button
                      onClick={() => onSelectConversation(conversation.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all duration-200 group relative truncate ${
                        currentConversationId === conversation.id
                          ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none'
                          : 'text-gray-900 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                      }`}
                      title={sidebarCollapsed ? conversation.title : ""}
                    >
                      {currentConversationId === conversation.id && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-blue-600" />
                      )}
                      {!sidebarCollapsed && (
                        renamingChatId === conversation.id ? (
                          <input
                            type="text"
                            value={newChatTitle}
                            onChange={(e) => setNewChatTitle(e.target.value)}
                            onBlur={() => handleRenameSubmit(conversation.id)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameSubmit(conversation.id)
                              }
                            }}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="block truncate whitespace-nowrap pr-1">{conversation.title}</span>
                        )
                      )}
                      {/* Hover menu — overlays the title's end with a fade mask so
                          the title can use the FULL row width when not hovered. */}
                      {(hoveredChatId === conversation.id || dropdownOpen === conversation.id) && !sidebarCollapsed && renamingChatId !== conversation.id && (
                        <div
                          className={`absolute right-1 top-1/2 -translate-y-1/2 pl-6 ${
                            currentConversationId === conversation.id
                              ? 'bg-gradient-to-l from-white via-white dark:from-[#1a2233] dark:via-[#1a2233]'
                              : 'bg-gradient-to-l from-gray-200/95 via-gray-200/95 dark:from-slate-800 dark:via-slate-800'
                          } to-transparent`}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDropdownOpen(dropdownOpen === conversation.id ? null : conversation.id)
                            }}
                            className="p-1 rounded-md hover:bg-gray-300/70 dark:hover:bg-white/10"
                          >
                            <MoreHorizontal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </button>

                          {dropdownOpen === conversation.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-lg py-1 z-10 min-w-[150px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setRenamingChatId(conversation.id)
                                  setNewChatTitle(conversation.title)
                                  setDropdownOpen(null)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3"
                              >
                                <Edit2 className="w-4 h-4" />
                                <span>Rename</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  archiveConversationMutation.mutate(conversation.id)
                                  setDropdownOpen(null)
                                }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                                >
                                  <Archive className="w-4 h-4" />
                                  <span>Archive</span>
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteConversation(conversation.id)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom User Section - Fixed */}
      <div key={refreshKey} className="p-2.5 border-t border-gray-200/80 dark:border-white/10">
        {userLoading && !userData ? (
          <div className="flex items-center space-x-3 px-2 py-2">
            <Skeleton variant="avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton variant="text" className="h-4 w-full" />
                  <Skeleton variant="text" className="h-3 w-12" />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-3 px-2 py-2 hover:bg-gray-200/70 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-white/10 shadow-sm">
              {userData?.avatar ? (
                <img 
                  src={userData.avatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-white text-sm font-bold">
                  {userData?.displayName?.charAt(0)?.toUpperCase() || 
                   userData?.email?.charAt(0)?.toUpperCase() || 
                   'U'}
                </span>
              )}
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {userData?.displayName || 
                 userData?.email?.split('@')[0] || 
                 'User'}
                {userData && ' ✅'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {userData?.plan || 'Free'}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`} />
          </div>
        )}
      </div>
    </div>
  )
}
