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
  ChevronDown
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
        <Skeleton className="w-4 h-4 rounded bg-gray-700" />
        <Skeleton className="h-4 flex-1 rounded bg-gray-700" />
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
    <div className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-gray-900 dark:bg-gray-900 flex flex-col transition-all duration-500 ease-out`}>
      {/* Scrollable Content Area - Everything scrolls except user profile */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Top Header with Logo */}
        <div className={`p-3 flex items-center transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {sidebarCollapsed ? (
            <div className="relative group w-10 h-10 flex items-center justify-center">
              {/* VeeFore Logo Button - disappears on hover */}
              <button 
                onClick={() => setSidebarCollapsed(false)}
                className="absolute inset-0 flex items-center justify-center hover:bg-gray-800 rounded transition-all duration-200 opacity-100 group-hover:opacity-0"
                title="Open sidebar"
              >
                <img src="/veefore-logo.png" alt="VeeFore" className="w-8 h-8" />
              </button>
              
              {/* Close Button - appears on hover in same position */}
              <button 
                onClick={() => setSidebarCollapsed(false)}
                className="absolute inset-0 flex items-center justify-center hover:bg-gray-800 rounded transition-all duration-200 opacity-0 group-hover:opacity-100"
                title="Open sidebar"
              >
                <div className="border-2 border-white rounded flex items-center justify-end pr-1.5" style={{width: '17.284608px', height: '15.36px'}}>
                  <div className="w-0.5 h-full bg-white"></div>
                </div>
              </button>
            </div>
          ) : (
            <>
              <img src="/veefore-logo.png" alt="VeeFore" className="w-8 h-8" />
              <button 
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
              >
                <div className="w-5.5 h-5.5 border-2 border-white rounded flex items-center justify-start pl-1.5" style={{width: '17.284608px', height: '15.36px'}}>
                  <div className="w-0.5 h-full bg-white"></div>
                </div>
              </button>
            </>
          )}
        </div>

        {/* New Chat Button */}
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-4 transition-all duration-300`}>
          <button
            onClick={onStartNewChat}
            className="w-full flex items-center px-3 py-2.5 text-sm text-white hover:bg-gray-800 rounded-lg transition-all duration-500 font-medium"
            title={sidebarCollapsed ? "New chat" : ""}
          >
            <Edit className={`w-4 h-4 flex-shrink-0 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5]' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>New chat</span>
          </button>
        </div>

        {/* Navigation Menu */}
        <div className={`${sidebarCollapsed ? 'px-2' : 'px-3'} pb-6 space-y-1 transition-all duration-300`}>
          <button 
            onClick={() => setShowSearchInput(!showSearchInput)}
            className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-500"
            title={sidebarCollapsed ? "Search chats" : ""}
          >
            <Search className={`w-4 h-4 flex-shrink-0 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5]' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>Search chats</span>
          </button>
          
          <button 
            className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-500"
            title={sidebarCollapsed ? "Content Studio" : ""}
          >
            <Edit3 className={`w-4 h-4 flex-shrink-0 transition-all duration-500 ${sidebarCollapsed ? 'stroke-[2.5]' : ''}`} />
            <span className={`transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-3'}`}>Content Studio</span>
          </button>
          
          {!sidebarCollapsed && (
            <button 
              className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-500"
              title="Auto Pilot"
            >
              <Rocket className="w-4 h-4 flex-shrink-0 transition-all duration-500" />
              <span className="transition-all duration-500 opacity-100 w-auto ml-3">Auto Pilot</span>
            </button>
          )}
          
          {!sidebarCollapsed && (
            <button 
              className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-500"
              title="AI Models"
            >
              <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center transition-all duration-500">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"></div>
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
              className="w-full px-3 py-2 text-sm border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-800 text-gray-100 placeholder-gray-400"
              autoFocus
            />
          </div>
        )}

        {/* Conversations Section */}
        {!sidebarCollapsed && (
          <div className="px-3">
            <div className={`text-sm font-semibold text-gray-400 mb-3 px-2 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
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
                      className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors group ${
                        currentConversationId === conversation.id
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                      title={sidebarCollapsed ? conversation.title : ""}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {!sidebarCollapsed && (
                            <div className="truncate text-sm">
                              {renamingChatId === conversation.id ? (
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
                                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                conversation.title
                              )}
                            </div>
                          )}
                        </div>
                        {(hoveredChatId === conversation.id || dropdownOpen === conversation.id) && !sidebarCollapsed && renamingChatId !== conversation.id && (
                          <div className="relative ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDropdownOpen(dropdownOpen === conversation.id ? null : conversation.id)
                              }}
                              className="p-1 hover:bg-gray-700 rounded"
                            >
                              <MoreHorizontal className="w-4 h-4 text-gray-400" />
                            </button>
                            
                            {dropdownOpen === conversation.id && (
                              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRenamingChatId(conversation.id)
                                    setNewChatTitle(conversation.title)
                                    setDropdownOpen(null)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-3"
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
                                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-3"
                                >
                                  <Archive className="w-4 h-4" />
                                  <span>Archive</span>
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteConversation(conversation.id)
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center space-x-3"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom User Section - Fixed */}
      <div key={refreshKey} className="p-3 border-t border-gray-800">
        {userLoading && !userData ? (
          <div className="flex items-center space-x-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse"></div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-gray-700 rounded animate-pulse mb-1"></div>
                  <div className="h-3 bg-gray-700 rounded animate-pulse w-12"></div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-3 px-2 py-2 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
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
              <div className="text-sm font-medium text-white truncate">
                {userData?.displayName || 
                 userData?.email?.split('@')[0] || 
                 'User'}
                {userData && ' ✅'}
              </div>
              <div className="text-xs text-gray-400">
                {userData?.plan || 'Free'}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`} />
          </div>
        )}
      </div>
    </div>
  )
}
