import { useEffect, useRef, useState } from 'react'
import { useRealtimeContext, RealtimeEventType, ConnectionStatus } from '@/contexts/RealtimeContext'

export type DataType = 'analytics' | 'social-accounts' | 'content' | 'notifications'

const DATA_TYPE_TO_EVENT: Record<DataType, RealtimeEventType> = {
  'analytics': 'analytics:update',
  'social-accounts': 'social-account:update',
  'content': 'content:update',
  'notifications': 'notification:new',
}

interface UseRealtimeUpdatesOptions<T> {
  dataType: DataType
  onUpdate?: (data: T) => void
  enabled?: boolean
}

interface UseRealtimeUpdatesResult {
  connectionStatus: ConnectionStatus
  isConnected: boolean
  lastUpdate: Date | null
  reconnect: () => void
}

export function useRealtimeUpdates<T = any>(
  options: UseRealtimeUpdatesOptions<T>
): UseRealtimeUpdatesResult {
  const { dataType, onUpdate, enabled = true } = options
  const { subscribe, connectionStatus, isConnected, reconnect } = useRealtimeContext()
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const callbackRef = useRef(onUpdate)

  useEffect(() => {
    callbackRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (!enabled) return

    const event = DATA_TYPE_TO_EVENT[dataType]
    if (!event) {
      console.warn(`[useRealtimeUpdates] Unknown data type: ${dataType}`)
      return
    }

    const handleUpdate = (data: T) => {
      console.log(`[useRealtimeUpdates] Received ${event}:`, data)
      setLastUpdate(new Date())
      if (callbackRef.current) {
        callbackRef.current(data)
      }
    }

    const unsubscribe = subscribe(event, handleUpdate)
    console.log(`[useRealtimeUpdates] Listening for ${dataType} updates`)

    return () => {
      unsubscribe()
      console.log(`[useRealtimeUpdates] Stopped listening for ${dataType} updates`)
    }
  }, [dataType, enabled, subscribe])

  return {
    connectionStatus,
    isConnected,
    lastUpdate,
    reconnect,
  }
}

interface UseMultipleRealtimeUpdatesOptions {
  dataTypes: DataType[]
  onUpdate?: (dataType: DataType, data: any) => void
  enabled?: boolean
}

export function useMultipleRealtimeUpdates(
  options: UseMultipleRealtimeUpdatesOptions
): UseRealtimeUpdatesResult {
  const { dataTypes, onUpdate, enabled = true } = options
  const { subscribe, connectionStatus, isConnected, reconnect } = useRealtimeContext()
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const callbackRef = useRef(onUpdate)

  useEffect(() => {
    callbackRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (!enabled || dataTypes.length === 0) return

    const unsubscribes: (() => void)[] = []

    dataTypes.forEach((dataType) => {
      const event = DATA_TYPE_TO_EVENT[dataType]
      if (!event) {
        console.warn(`[useMultipleRealtimeUpdates] Unknown data type: ${dataType}`)
        return
      }

      const handleUpdate = (data: any) => {
        console.log(`[useMultipleRealtimeUpdates] Received ${event}:`, data)
        setLastUpdate(new Date())
        if (callbackRef.current) {
          callbackRef.current(dataType, data)
        }
      }

      const unsubscribe = subscribe(event, handleUpdate)
      unsubscribes.push(unsubscribe)
    })

    console.log(`[useMultipleRealtimeUpdates] Listening for: ${dataTypes.join(', ')}`)

    return () => {
      unsubscribes.forEach((unsub) => unsub())
      console.log(`[useMultipleRealtimeUpdates] Stopped listening for: ${dataTypes.join(', ')}`)
    }
  }, [dataTypes, enabled, subscribe])

  return {
    connectionStatus,
    isConnected,
    lastUpdate,
    reconnect,
  }
}

export function useRealtimeConnectionStatus(): {
  status: ConnectionStatus
  isConnected: boolean
  reconnect: () => void
} {
  const { connectionStatus, isConnected, reconnect } = useRealtimeContext()
  
  return {
    status: connectionStatus,
    isConnected,
    reconnect,
  }
}
