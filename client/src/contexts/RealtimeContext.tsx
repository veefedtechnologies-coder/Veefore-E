import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { auth } from '@/lib/firebase'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

export type RealtimeEventType = 
  | 'analytics:update'
  | 'social-account:update'
  | 'content:update'
  | 'notification:new'

interface RealtimeContextValue {
  socket: Socket | null
  connectionStatus: ConnectionStatus
  isConnected: boolean
  emit: (event: string, data?: any) => void
  subscribe: (event: RealtimeEventType, callback: (data: any) => void) => () => void
  reconnect: () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const RECONNECT_MULTIPLIER = 2

interface RealtimeProviderProps {
  children: React.ReactNode
}

export const RealtimeProvider: React.FC<RealtimeProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const getSocketUrl = useCallback(() => {
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL
    if (envUrl) return envUrl as string
    return window.location.origin
  }, [])

  const connectSocket = useCallback(async () => {
    if (socketRef.current?.connected) {
      console.log('[Realtime] Socket already connected')
      return
    }

    try {
      setConnectionStatus('connecting')
      
      let authToken: string | null = null
      const user = auth.currentUser
      if (user) {
        try {
          authToken = await user.getIdToken(true)
        } catch (error) {
          console.warn('[Realtime] Failed to get auth token:', error)
        }
      }

      const socketUrl = getSocketUrl()
      console.log('[Realtime] Connecting to:', socketUrl)

      const newSocket = io(socketUrl, {
        auth: authToken ? { token: authToken } : undefined,
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10000,
        forceNew: true,
      })

      newSocket.on('connect', () => {
        console.log('[Realtime] Connected successfully, socket id:', newSocket.id)
        setConnectionStatus('connected')
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
      })

      newSocket.on('disconnect', (reason) => {
        console.log('[Realtime] Disconnected:', reason)
        setConnectionStatus('disconnected')
        
        if (reason !== 'io client disconnect') {
          scheduleReconnect()
        }
      })

      newSocket.on('connect_error', (error) => {
        console.error('[Realtime] Connection error:', error.message)
        setConnectionStatus('disconnected')
        scheduleReconnect()
      })

      newSocket.on('error', (error) => {
        console.error('[Realtime] Socket error:', error)
      })

      socketRef.current = newSocket
      setSocket(newSocket)
    } catch (error) {
      console.error('[Realtime] Failed to create socket:', error)
      setConnectionStatus('disconnected')
      scheduleReconnect()
    }
  }, [getSocketUrl])

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    setConnectionStatus('reconnecting')
    const delay = reconnectDelayRef.current

    console.log(`[Realtime] Scheduling reconnect in ${delay}ms`)

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * RECONNECT_MULTIPLIER,
        MAX_RECONNECT_DELAY
      )
      connectSocket()
    }, delay)
  }, [connectSocket])

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setSocket(null)
    }
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
    connectSocket()
  }, [connectSocket])

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('[Realtime] Cannot emit, socket not connected')
    }
  }, [])

  const subscribe = useCallback((event: RealtimeEventType, callback: (data: any) => void) => {
    const currentSocket = socketRef.current
    if (currentSocket) {
      currentSocket.on(event, callback)
      console.log(`[Realtime] Subscribed to: ${event}`)
    }

    return () => {
      if (currentSocket) {
        currentSocket.off(event, callback)
        console.log(`[Realtime] Unsubscribed from: ${event}`)
      }
    }
  }, [])

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('[Realtime] User authenticated, connecting socket')
        connectSocket()
      } else {
        console.log('[Realtime] User signed out, disconnecting socket')
        if (socketRef.current) {
          socketRef.current.disconnect()
          socketRef.current = null
          setSocket(null)
          setConnectionStatus('disconnected')
        }
      }
    })

    return () => {
      unsubscribe()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [connectSocket])

  const value: RealtimeContextValue = {
    socket,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    emit,
    subscribe,
    reconnect,
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export const useRealtimeContext = (): RealtimeContextValue => {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtimeContext must be used within a RealtimeProvider')
  }
  return context
}

export default RealtimeContext
