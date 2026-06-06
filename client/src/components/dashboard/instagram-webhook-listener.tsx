import React, { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { io, Socket } from 'socket.io-client'

/**
 * Instagram Webhook Listener Component
 * 
 * This component listens for Instagram webhook events and provides real-time updates
 * while respecting Meta's rate limits. It uses a combination of:
 * 1. WebSocket connections for real-time updates
 * 2. Smart polling as fallback
 * 3. User activity detection for immediate updates
 */
export function InstagramWebhookListener() {
  const queryClient = useQueryClient()
  const { currentWorkspace } = useCurrentWorkspace()
  const socketRef = useRef<Socket | null>(null)
  const webhookFailureCountRef = useRef(0)
  const maxWebhookFailures = 3 // Enable polling fallback after 3 webhook failures

  // Enable polling fallback when webhooks fail (for webhook-supported events only)
  const enablePollingFallback = () => {
    console.log('[Instagram Webhook] 🚨 Enabling polling fallback for webhook-supported events due to webhook failures')
    // Trigger the fallback refetches directly instead of inside setQueryData
    queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
  }

  useEffect(() => {
    if (!currentWorkspace?.id) return

    const connectSocket = () => {
      try {
        const socketUrl = `${window.location.protocol}//${window.location.host}`
        
        console.log('[Instagram Webhook] Connecting to Socket.IO:', socketUrl)
        const socket = io(socketUrl, {
          path: '/ws/metrics',
          transports: ['polling'], // Use only polling to avoid WebSocket frame errors
          auth: {
            token: localStorage.getItem('firebase-token') || 'anonymous'
          },
          timeout: 20000,
          forceNew: true,
          upgrade: false, // Disable WebSocket upgrade to avoid frame errors
          rememberUpgrade: false,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000
        })
        
        socket.on('connect', () => {
          console.log('[Instagram Webhook] Connected successfully')
          socketRef.current = socket
          webhookFailureCountRef.current = 0
          
          // Join workspace-specific room
          socket.emit('join-workspace', { workspaceId: currentWorkspace.id })
        })
        
        socket.on('instagram_comment', (data) => {
          try {
            console.log('🎉 FRONTEND DEBUG: Received instagram_comment event!')
            console.log('🎉 FRONTEND DEBUG: Comment data:', JSON.stringify(data, null, 2))
            console.log('🎉 FRONTEND DEBUG: Current workspace:', currentWorkspace?.id)
            console.log('[Instagram Webhook] Received comment update:', data)
            console.log('[Instagram Webhook] New Instagram comment, refreshing immediately')
            
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram/comments'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram-content'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            
            console.log('🎉 FRONTEND DEBUG: ✅ Comment update processed and UI refreshed')
            console.log('[Instagram Webhook] ✅ Comment webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('🎉 FRONTEND DEBUG: ❌ Error processing comment update:', error)
            console.error('[Instagram Webhook] Error processing comment update:', error)
          }
        })

        socket.on('instagram_mention', (data) => {
          try {
            console.log('[Instagram Webhook] Received mention update:', data)
            console.log('[Instagram Webhook] New Instagram mention, refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram/mentions'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram-content'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Mention webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing mention update:', error)
          }
        })

        socket.on('instagram_story_insight', (data) => {
          try {
            console.log('[Instagram Webhook] Received story insight update:', data)
            console.log('[Instagram Webhook] New Instagram story insight, refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram/story-insights'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Story insight webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing story insight update:', error)
          }
        })

        socket.on('instagram_message', (data) => {
          try {
            console.log('[Instagram Webhook] Received message update:', data)
            console.log('[Instagram Webhook] New Instagram Direct message, refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram/messages'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Message webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing message update:', error)
          }
        })

        socket.on('instagram_account_review', (data) => {
          try {
            console.log('[Instagram Webhook] Received account review update:', data)
            console.log('[Instagram Webhook] Account review update, refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Account review webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing account review update:', error)
          }
        })

        socket.on('instagram_media_update', (data) => {
          try {
            console.log('[Instagram Webhook] Received media update:', data)
            console.log('[Instagram Webhook] Media update (new posts/stories), refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram/media'] })
            queryClient.invalidateQueries({ queryKey: ['/api/instagram-content'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Media update webhook processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing media update:', error)
          }
        })

        socket.on('instagram_data_update', (data) => {
          try {
            console.log('[Instagram Webhook] 🔄 Received data update from smart polling:', data)
            console.log('[Instagram Webhook] Instagram data update (followers/likes/engagement), refreshing immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Data update webhook processed - dashboard refreshed with latest metrics')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing data update:', error)
          }
        })

        // Legacy event handler for backward compatibility
        socket.on('instagram_metrics_update', (data) => {
          try {
            console.log('[Instagram Webhook] Received metrics update:', data)
            console.log('[Instagram Webhook] Instagram metrics updated, refreshing data immediately')
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts', currentWorkspace?.id] })
            queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })
            console.log('[Instagram Webhook] ✅ Metrics update processed - social accounts data refreshed')
          } catch (error) {
            console.error('[Instagram Webhook] Error processing metrics update:', error)
          }
        })

        socket.on('disconnect', (reason) => {
          console.log('[Instagram Webhook] Socket disconnected:', reason)
          if (reason === 'io server disconnect' || reason === 'io client disconnect') {
            socketRef.current = null
          }
        })

        socket.on('connect_error', (error) => {
          console.error('[Instagram Webhook] Connection error:', error)
          webhookFailureCountRef.current++
          
          if (webhookFailureCountRef.current === maxWebhookFailures) {
            console.log('[Instagram Webhook] Too many webhook failures, enabling polling fallback')
            enablePollingFallback()
          }
        })
        
        socket.io.on('reconnect_failed', () => {
          console.log('[Instagram Webhook] Max reconnection attempts reached by Socket.io, enabling polling fallback')
          enablePollingFallback()
        })
        

        
      } catch (error) {
        console.error('[Instagram Webhook] Failed to connect:', error)
      }
    }

    // Connect to webhook Socket.IO
    connectSocket()

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [currentWorkspace?.id, queryClient])

  // This component doesn't render anything
  return null
}

export default InstagramWebhookListener
