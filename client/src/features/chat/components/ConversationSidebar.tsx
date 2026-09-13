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
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
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
  ChevronUp,
  PanelLeft,
  Settings,
  CreditCard,
  LogOut,
  Images,
  Video
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { apiRequest } from '@/lib/queryClient'
import { logout } from '@/lib/auth'
import { ChatConversation } from '../types/chat.types'
import { Skeleton } from '@/components/ui/skeleton'
import { useVeeGPTTransition } from '@/features/veegpt/VeeGPTTransition'

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
  /** Open the in-page Auto Pilot view (keeps the VeeGPT sidebar). When omitted
   *  the button falls back to navigating to the /autopilot route. */
  onOpenAutoPilot?: () => void
  /** Highlight the Auto Pilot nav item when its view is active. */
  autopilotActive?: boolean
  /** Open the in-page Album (gallery of generated/edited images). */
  onOpenAlbum?: () => void
  /** Highlight the Album nav item when its view is active. */
  albumActive?: boolean
  /** Open the in-page Video Editor (conversational AI video editing). */
  onOpenVideoEditor?: () => void
  /** Highlight the Video Editor nav item when its view is active. */
  videoEditorActive?: boolean
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
  onOpenAutoPilot,
  autopilotActive,
  onOpenAlbum,
  albumActive,
  onOpenVideoEditor,
  videoEditorActive,
  userData,
  userLoading,
  refreshKey
}) => {
  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null)
  const [newChatTitle, setNewChatTitle] = useState('')
  // Whether the chats list has been scrolled (drives the header shadow).
  const [chatsScrolled, setChatsScrolled] = useState(false)
  // Whether the chats list section is collapsed (hidden).
  const [chatsCollapsed, setChatsCollapsed] = useState(false)
  // Fixed-position anchor for the currently open "..." menu (rendered in a portal).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  // Bottom profile account menu (Settings / Billing / Log out), rendered in a
  // portal above the profile row so it can't be clipped by the sidebar overflow.
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuPos, setProfileMenuPos] = useState<{
    left: number
    bottom: number
    width: number
  } | null>(null)

  const openMenu = (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (dropdownOpen === conversationId) {
      setDropdownOpen(null)
      return
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const MENU_W = 176
    setMenuPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
    })
    setDropdownOpen(conversationId)
  }

  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const veegptTransition = useVeeGPTTransition()

  // Return to the main VeeFore app (with the cinematic transition when available).
  const handleReturnToApp = (e: React.MouseEvent) => {
    if (veegptTransition.enabled) {
      veegptTransition.exitVeeGPT(e)
    } else {
      setLocation('/')
    }
  }

  // Toggle the bottom profile account menu. Anchored to the profile row and
  // opened UPWARD (it sits at the very bottom of the sidebar).
  const toggleProfileMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (profileMenuOpen) {
      setProfileMenuOpen(false)
      return
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setProfileMenuPos({
      left: r.left,
      bottom: window.innerHeight - r.top + 6,
      width: Math.max(r.width, 220),
    })
    setProfileMenuOpen(true)
  }

  // Navigate to a main-app route from the profile menu. VeeGPT is a full-screen
  // surface, so leave it first (exit transition when available) then route.
  const goToAppRoute = (url: string) => {
    setProfileMenuOpen(false)
    if (veegptTransition.enabled) {
      // Play VeeGPT's slide-out, then land on the target route.
      veegptTransition.exitVeeGPT(undefined, url)
    } else {
      setLocation(url)
    }
  }

  const handleLogout = async () => {
    setProfileMenuOpen(false)
    try {
      await logout()
    } catch {
      /* logout clears client state + redirects even on error */
    }
  }

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
    <div className={`${sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'} relative z-10 bg-gray-50 dark:bg-slate-950/50 dark:backdrop-blur-xl border-r border-gray-200/70 dark:border-white/[0.06] shadow-[6px_0_16px_-8px_rgba(0,0,0,0.12)] dark:shadow-[6px_0_20px_-10px_rgba(0,0,0,0.55)] flex flex-col transition-all duration-500 ease-out`}>
      {/* Fixed top region — header + primary nav stay put while chats scroll.
          Casts a subtle shadow once the list below is scrolled. */}
      <div className={`shrink-0 relative z-20 bg-gray-50 dark:bg-slate-950/50 transition-shadow duration-200 ${chatsScrolled ? 'shadow-[0_10px_18px_-12px_rgba(0,0,0,0.4)]' : ''}`}>
        {/* Top Header with Logo — fixed h-14 + matching border so it lines up
            flush with the chat header on the right (one continuous top bar). */}
        <div className={`h-14 px-2.5 flex items-center border-b border-gray-200/70 dark:border-white/[0.06] transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {sidebarCollapsed ? (
            <button 
              onClick={() => setSidebarCollapsed(false)}
              className="group w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200/70 dark:hover:bg-white/10 transition-colors"
              title="Open sidebar"
            >
              <img src="/veefore-logo.png" alt="VeeFore" className="w-[22px] h-[22px] group-hover:hidden" />
              <PanelLeft className="w-5 h-5 text-gray-500 dark:text-gray-400 hidden group-hover:block" />
            </button>
          ) : (
            <>
              <button
                onClick={handleReturnToApp}
                className="group flex items-end rounded-lg py-1 pl-1.5 pr-2 transition-colors hover:bg-gray-200/70 dark:hover:bg-white/10"
                title="Back to VeeFore app"
              >
                <img src="/veefore.svg" alt="V" className="h-[22px] w-auto shrink-0 transition-transform group-hover:scale-105" />
                <span className="-ml-[5px] text-[19px] font-semibold leading-none tracking-tight text-gray-900 dark:text-white">eeGPT</span>
              </button>
              <button 
                onClick={() => setSidebarCollapsed(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
                title="Close sidebar"
              >
                <PanelLeft className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
        </div>

        {/* Primary navigation (New chat + options share one spacing rhythm) */}
        <div className="px-2 pt-3 pb-3 space-y-0.5 transition-all duration-300">
          <button
            onClick={onStartNewChat}
            className="group w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] rounded-lg transition-colors duration-150"
            title={sidebarCollapsed ? "New chat" : ""}
          >
            <span className={`flex items-center justify-center flex-shrink-0 rounded-md transition-all duration-300 ${sidebarCollapsed ? 'mx-auto' : ''}`}>
              <Edit className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors" />
            </span>
            <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-2.5'}`}>New chat</span>
          </button>

          <button 
            onClick={() => (onOpenSearch ? onOpenSearch() : setShowSearchInput(!showSearchInput))}
            className="group w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors duration-150"
            title={sidebarCollapsed ? "Search chats" : ""}
          >
            <Search className={`w-[18px] h-[18px] flex-shrink-0 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`} />
            <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-2.5'}`}>Search chats</span>
          </button>
          
          <button 
            onClick={() => onOpenAlbum?.()}
            className={`group w-full flex items-center px-2.5 py-2 text-[14px] font-medium rounded-lg transition-colors duration-150 ${
              albumActive
                ? 'bg-gray-200/80 dark:bg-white/[0.08] text-gray-900 dark:text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white'
            }`}
            title={sidebarCollapsed ? "Album" : ""}
          >
            <Images className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${albumActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'} ${sidebarCollapsed ? 'mx-auto' : ''}`} />
            <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-2.5'}`}>Album</span>
          </button>
          
          {!sidebarCollapsed && (
            <button 
              onClick={() => (onOpenAutoPilot ? onOpenAutoPilot() : setLocation('/autopilot'))}
              className={`group w-full flex items-center px-2.5 py-2 text-[14px] font-medium rounded-lg transition-colors duration-150 ${
                autopilotActive
                  ? 'bg-gray-200/80 dark:bg-white/[0.08] text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Auto Pilot"
            >
              <Rocket className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${autopilotActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'}`} />
              <span className="ml-2.5">Auto Pilot</span>
            </button>
          )}

          <button
            onClick={() => onOpenVideoEditor?.()}
            className={`group w-full flex items-center px-2.5 py-2 text-[14px] font-medium rounded-lg transition-colors duration-150 ${
              videoEditorActive
                ? 'bg-gray-200/80 dark:bg-white/[0.08] text-gray-900 dark:text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white'
            }`}
            title={sidebarCollapsed ? 'Video Editor' : ''}
          >
            <Video className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${videoEditorActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'} ${sidebarCollapsed ? 'mx-auto' : ''}`} />
            <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden ml-0' : 'opacity-100 w-auto ml-2.5'}`}>Video Editor</span>
          </button>
          
          {!sidebarCollapsed && (
            <button 
              className="group w-full flex items-center px-2.5 py-2 text-[14px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors duration-150"
              title="AI Models"
            >
              <div className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
                <div className="w-[9px] h-[9px] bg-gradient-to-br from-blue-400 to-blue-600 rounded-full shadow-sm shadow-blue-500/40"></div>
              </div>
              <span className="ml-2.5">AI Models</span>
            </button>
          )}
        </div>

        {/* Chats label — stays fixed above the scrolling list. The chevron
            collapses/expands the conversation list. */}
        {!sidebarCollapsed && (
          <button
            onClick={() => setChatsCollapsed((v) => !v)}
            className="group flex w-full items-center justify-between px-4 pt-2 pb-3 text-[11px] font-semibold tracking-wide text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={chatsCollapsed ? 'Expand chats' : 'Collapse chats'}
          >
            <span>Chats</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${chatsCollapsed ? '-rotate-90' : 'rotate-0'}`} />
          </button>
        )}
      </div>

      {/* Scrollable region — only the chats list scrolls */}
      <div
        onScroll={(e) => setChatsScrolled(e.currentTarget.scrollTop > 0)}
        className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll px-2 pb-2"
      >
        {/* Search Input */}
        {showSearchInput && !sidebarCollapsed && (
          <div className="pb-3">
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

        {/* Conversations list — animated collapse/expand */}
        {!sidebarCollapsed && (
          <AnimatePresence initial={false}>
            {!chatsCollapsed && (
              <motion.div
                key="chats-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                {conversationsLoading ? (
                  <ConversationListSkeleton />
                ) : (
                  <div className="space-y-1">
                    {filteredConversations.map((conversation) => {
                      const isActive = currentConversationId === conversation.id
                      const isRenaming = renamingChatId === conversation.id
                      const isMenuOpen = dropdownOpen === conversation.id
                      return (
                        <div
                          key={conversation.id}
                          className={`group relative rounded-lg transition-colors duration-150 ${
                            isRenaming
                              ? ''
                              : isActive || isMenuOpen
                                ? 'bg-gray-200/80 dark:bg-white/[0.08]'
                                : 'hover:bg-gray-200/70 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          {isRenaming ? (
                            <input
                              type="text"
                              value={newChatTitle}
                              onChange={(e) => setNewChatTitle(e.target.value)}
                              onBlur={() => handleRenameSubmit(conversation.id)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit(conversation.id)
                              }}
                              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-2 text-[14px] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          ) : (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => onSelectConversation(conversation.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onSelectConversation(conversation.id)
                                }
                              }}
                              className={`w-full text-left pl-2.5 pr-9 py-2 text-[14px] rounded-lg cursor-pointer truncate ${
                                isActive
                                  ? 'text-gray-900 dark:text-white font-medium'
                                  : 'text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'
                              }`}
                              title={conversation.title}
                            >
                              <span className="block truncate whitespace-nowrap">{conversation.title}</span>
                            </div>
                          )}

                          {/* Options trigger — no background box of its own, so
                              the whole row shows a single unified highlight. The
                              menu is rendered in a portal (below). */}
                          {!isRenaming && (
                            <button
                              type="button"
                              onClick={(e) => openMenu(conversation.id, e)}
                              className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-md transition ${
                                isMenuOpen
                                  ? 'opacity-100 text-gray-900 dark:text-white'
                                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                              }`}
                              title="Options"
                              aria-label="Conversation options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Conversation "..." menu — portaled to the body so it floats above the
          sidebar's scroll/overflow. A full-screen catcher closes it on any
          outside click. */}
      {dropdownOpen !== null && menuPos && createPortal(
        (() => {
          const conv = conversations.find((c) => c.id === dropdownOpen)
          if (!conv) return null
          return (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setDropdownOpen(null)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: 176 }}
                className="z-[61] bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl py-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setRenamingChatId(conv.id)
                    setNewChatTitle(conv.title)
                    setDropdownOpen(null)
                  }}
                  className="w-full text-left px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Rename</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    archiveConversationMutation.mutate(conv.id)
                    setDropdownOpen(null)
                  }}
                  className="w-full text-left px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3"
                >
                  <Archive className="w-4 h-4" />
                  <span>Archive</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConversation(conv.id)}
                  className="w-full text-left px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-3"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </motion.div>
            </>
          )
        })(),
        document.body
      )}

      {/* Bottom User Section - Fixed */}
      {/* NOTE: no `key={refreshKey}` here — remounting this subtree whenever user
          data changed made the profile button flicker on hover and swallowed the
          first click (mousedown/mouseup landed on different element instances).
          The profile updates reactively from `userData` props, so no remount is
          needed. */}
      <div className="p-2 border-t border-gray-200/70 dark:border-white/[0.06]">
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
          <button
            type="button"
            onClick={toggleProfileMenu}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            title={sidebarCollapsed ? (userData?.displayName || 'Account') : 'Account'}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
              profileMenuOpen ? 'bg-gray-200/70 dark:bg-white/[0.08]' : 'hover:bg-gray-200/70 dark:hover:bg-white/[0.06]'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
              {userData?.avatar ? (
                <img 
                  src={userData.avatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-white text-[13px] font-semibold">
                  {userData?.displayName?.charAt(0)?.toUpperCase() || 
                   userData?.email?.charAt(0)?.toUpperCase() || 
                   'U'}
                </span>
              )}
            </div>
            <div className={`flex-1 min-w-0 text-left transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
              <div className="text-[13px] font-medium text-gray-900 dark:text-white truncate leading-tight">
                {userData?.displayName || 
                 userData?.email?.split('@')[0] || 
                 'User'}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 capitalize leading-tight mt-0.5">
                {userData?.plan || 'Free'} plan
              </div>
            </div>
            {profileMenuOpen ? (
              <ChevronUp className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-all duration-500 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`} />
            )}
          </button>
        )}
      </div>

      {/* Account menu — portal (above the profile row) so it can't be clipped by
          the sidebar's overflow. A full-screen catcher closes it on outside click. */}
      {profileMenuOpen && profileMenuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[998]"
            onClick={() => setProfileMenuOpen(false)}
          />
          <div
            role="menu"
            className="fixed z-[999] rounded-xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-slate-900 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150"
            style={{
              left: profileMenuPos.left,
              bottom: profileMenuPos.bottom,
              width: profileMenuPos.width,
            }}
          >
            {/* Header: who's signed in */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-white/10">
              <div className="text-[13px] font-medium text-gray-900 dark:text-white truncate">
                {userData?.displayName || userData?.email?.split('@')[0] || 'User'}
              </div>
              {userData?.email && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {userData.email}
                </div>
              )}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => goToAppRoute('/settings')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => goToAppRoute('/settings/billing')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <CreditCard className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span>Billing &amp; plan</span>
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-white/10" />
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
