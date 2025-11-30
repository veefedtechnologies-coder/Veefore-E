import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { io, Socket } from 'socket.io-client'

interface CacheInvalidationEvent {
  type: 'cache-invalidation'
  event: 'data-change' | 'refresh-required' | 'force-refresh'
  changeType?: 'reach' | 'engagement' | 'followers' | 'posts' | 'all'
  oldValue?: any
  newValue?: any
  workspaceId: string
  reason?: string
  changes?: number
  timestamp: string
}

/**
 * Custom hook for real-time cache invalidation
 * Listens for WebSocket events and automatically refreshes React Query cache
 * when server data changes, providing instant UI updates
 */
export function useCacheInvalidation() {
  const queryClient = useQueryClient()
  const { currentWorkspace } = useCurrentWorkspace()
  const socketRef = useRef<Socket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  useEffect(() => {
    if (!currentWorkspace?.id) {
      console.log('[CACHE INVALIDATION] ⏸️ No workspace ID, skipping connection')
      return
    }

    const connectSocket = () => {
      // Add a small delay to avoid connection conflicts
      setTimeout(() => {
        attemptConnection()
      }, 100 + Math.random() * 1000) // Random delay between 100-1100ms
    }
    
    const attemptConnection = () => {
      try {
        // Check if WebSocket connections are disabled
        if (localStorage.getItem('disable-websocket') === 'true') {
          console.log('[CACHE INVALIDATION] ⏸️ WebSocket connections disabled by user preference')
          return
        }
        
        // CRITICAL FIX: Use correct WebSocket URL matching the Cloudflare tunnel
        const socketUrl = 'https://veefore-webhook.veefore.com'
        
        console.log('[CACHE INVALIDATION] 🔗 Connecting to Socket.IO:', socketUrl, {
          workspace: currentWorkspace.id,
          attempt: reconnectAttemptsRef.current + 1
        })
        
        // Get authentication token properly
        const getAuthToken = async () => {
          try {
            // Try to get Firebase auth token
            const { auth } = await import('@/lib/firebase')
            if (auth.currentUser) {
              return await auth.currentUser.getIdToken()
            }
          } catch (error) {
            console.log('[CACHE INVALIDATION] Could not get Firebase token:', error)
          }
          return 'anonymous'
        }
        
        const socket = io(socketUrl, {
          // CRITICAL FIX: Use the correct path that matches server configuration
          path: '/ws/metrics',
          transports: ['polling'], // Use polling only to avoid WebSocket frame issues
          auth: {
            token: 'anonymous' // Use anonymous for now to avoid auth issues
          },
          timeout: 15000, // Reduced timeout for faster failure
          forceNew: false, // Don't force new connections
          upgrade: false, // Disable WebSocket upgrade to prevent frame header errors
          rememberUpgrade: false, // Don't remember upgrade attempts
          autoConnect: true,
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionAttempts: 5,
          maxReconnectionAttempts: 5,
          // CRITICAL: Handle frame header errors
          parser: undefined, // Use default parser
          rejectUnauthorized: false, // Disable SSL validation for development
        })
        
        socket.on('connect', () => {
          console.log('[CACHE INVALIDATION] ✅ Connected successfully')
          socketRef.current = socket
          reconnectAttemptsRef.current = 0
          
          // Join workspace-specific room
          socket.emit('join-workspace', { workspaceId: currentWorkspace.id })
        })
        
        socket.on('cache-invalidation', (data: CacheInvalidationEvent) => {
          console.log('[CACHE INVALIDATION] 🔄 Received cache invalidation event:', data)
          
          // Only process events for current workspace
          if (data.workspaceId !== currentWorkspace.id) {
            console.log('[CACHE INVALIDATION] ⏭️ Skipping event for different workspace')
            return
          }
          
          // Handle different types of cache invalidation events
          switch (data.event) {
            case 'data-change':
              handleDataChange(data)
              break
            case 'refresh-required':
              handleRefreshRequired(data)
              break
            case 'force-refresh':
              handleForceRefresh(data)
              break
          }
        })
        
        socket.on('disconnect', () => {
          console.log('[CACHE INVALIDATION] ❌ Disconnected')
          socketRef.current = null
          
          // Attempt to reconnect
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
            console.log(`[CACHE INVALIDATION] 🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectSocket()
            }, delay)
          } else {
            console.log('[CACHE INVALIDATION] 🚨 Max reconnection attempts reached')
          }
        })
        
        socket.on('connect_error', (error: any) => {
          console.error('[CACHE INVALIDATION] ❌ Connection error:', {
            message: error.message,
            description: error.description,
            context: error.context,
          })
          // Don't treat this as a fatal error - let it retry
        })
        
        socket.on('error', (error) => {
          console.error('[CACHE INVALIDATION] ❌ Socket error:', error)
        })
        
        socket.on('connect_timeout', () => {
          console.warn('[CACHE INVALIDATION] ⏰ Connection timeout')
        })
        
      } catch (error) {
        console.error('[CACHE INVALIDATION] ❌ Connection error:', error)
      }
    }

    // Handle specific data change events
    const handleDataChange = (data: CacheInvalidationEvent) => {
      console.log(`[CACHE INVALIDATION] 📊 Data change detected: ${data.changeType}`, {
        oldValue: data.oldValue,
        newValue: data.newValue
      })
      
      // Invalidate specific queries based on change type
      const queriesToInvalidate = getQueriesForChangeType(data.changeType)
      
      queriesToInvalidate.forEach(queryKey => {
        console.log(`[CACHE INVALIDATION] 🔄 Invalidating query: ${queryKey}`)
        queryClient.invalidateQueries({ queryKey })
      })
    }

    // Handle general refresh required events
    const handleRefreshRequired = (data: CacheInvalidationEvent) => {
      console.log(`[CACHE INVALIDATION] 🔄 Refresh required (${data.changes} changes)`)
      
      // Invalidate all dashboard-related queries
      const dashboardQueries = [
        ['/api/dashboard/analytics', currentWorkspace.id],
        ['/api/social-accounts', currentWorkspace.id],
        ['/api/analytics/historical', currentWorkspace.id]
      ]
      
      dashboardQueries.forEach(queryKey => {
        console.log(`[CACHE INVALIDATION] 🔄 Invalidating dashboard query: ${queryKey}`)
        queryClient.invalidateQueries({ queryKey })
      })
    }

    // Handle force refresh events (manual triggers)
    const handleForceRefresh = (data: CacheInvalidationEvent) => {
      console.log(`[CACHE INVALIDATION] 🔄 Force refresh triggered: ${data.reason}`)
      
      // Force refetch all dashboard queries immediately
      const dashboardQueries = [
        ['/api/dashboard/analytics', currentWorkspace.id],
        ['/api/social-accounts', currentWorkspace.id],
        ['/api/analytics/historical', currentWorkspace.id]
      ]
      
      dashboardQueries.forEach(queryKey => {
        console.log(`[CACHE INVALIDATION] 🔄 Force refetching query: ${queryKey}`)
        queryClient.refetchQueries({ queryKey })
      })
    }

    // Get queries to invalidate based on change type
    const getQueriesForChangeType = (changeType?: string) => {
      const baseQueries = [
        ['/api/dashboard/analytics', currentWorkspace.id],
        ['/api/social-accounts', currentWorkspace.id]
      ]
      
      switch (changeType) {
        case 'reach':
          return [...baseQueries, ['/api/analytics/historical', currentWorkspace.id]]
        case 'engagement':
          return [...baseQueries, ['/api/analytics/historical', currentWorkspace.id]]
        case 'followers':
          return [...baseQueries]
        case 'posts':
          return [...baseQueries]
        default:
          return baseQueries
      }
    }

    // Connect to WebSocket
    connectSocket()

    // Cleanup on unmount or workspace change
    return () => {
      if (socketRef.current) {
        console.log('[CACHE INVALIDATION] 🔌 Disconnecting socket')
        socketRef.current.disconnect()
        socketRef.current = null
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      reconnectAttemptsRef.current = 0
    }
  }, [currentWorkspace?.id, queryClient])

  // Return connection status for debugging
  return {
    isConnected: socketRef.current?.connected || false,
    workspaceId: currentWorkspace?.id,
    connectionAttempts: reconnectAttemptsRef.current,
    // Helper function to disable WebSocket connections if needed
    disableWebSocket: () => {
      localStorage.setItem('disable-websocket', 'true')
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      console.log('[CACHE INVALIDATION] 🛑 WebSocket connections disabled')
    },
    // Helper function to re-enable WebSocket connections
    enableWebSocket: () => {
      localStorage.removeItem('disable-websocket')
      console.log('[CACHE INVALIDATION] ✅ WebSocket connections re-enabled')
    }
  }
}
