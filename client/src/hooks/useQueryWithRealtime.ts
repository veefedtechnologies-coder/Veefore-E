import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient, UseQueryOptions, QueryKey } from '@tanstack/react-query'
import { useRealtimeUpdates, DataType } from './useRealtimeUpdates'
import { useRealtimeContext, ConnectionStatus } from '@/contexts/RealtimeContext'

interface UseQueryWithRealtimeOptions<TData, TError = Error> 
  extends Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  realtimeDataType?: DataType
  realtimeEnabled?: boolean
  mergeStrategy?: 'replace' | 'merge' | 'custom'
  customMerge?: (currentData: TData | undefined, realtimeData: any) => TData
  onRealtimeUpdate?: (data: any) => void
}

interface UseQueryWithRealtimeResult<TData, TError = Error> {
  data: TData | undefined
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: TError | null
  refetch: () => Promise<any>
  isRealtime: boolean
  lastRealtimeUpdate: Date | null
  connectionStatus: ConnectionStatus
  isConnected: boolean
}

export function useQueryWithRealtime<TData, TError = Error>(
  options: UseQueryWithRealtimeOptions<TData, TError>
): UseQueryWithRealtimeResult<TData, TError> {
  const {
    queryKey,
    queryFn,
    realtimeDataType,
    realtimeEnabled = true,
    mergeStrategy = 'replace',
    customMerge,
    onRealtimeUpdate,
    ...queryOptions
  } = options

  const queryClient = useQueryClient()
  const [isRealtime, setIsRealtime] = useState(false)
  const [lastRealtimeUpdate, setLastRealtimeUpdate] = useState<Date | null>(null)
  const isRealtimeRef = useRef(false)

  const queryResult = useQuery({
    queryKey,
    queryFn,
    ...queryOptions,
  })

  const handleRealtimeUpdate = useCallback(
    (realtimeData: any) => {
      console.log('[useQueryWithRealtime] Received realtime update for:', queryKey)
      
      if (realtimeData === null || realtimeData === undefined) {
        console.warn('[useQueryWithRealtime] Ignoring null/undefined realtime data')
        return
      }

      const currentData = queryClient.getQueryData<TData>(queryKey)
      let newData: TData

      switch (mergeStrategy) {
        case 'merge':
          if (currentData && typeof currentData === 'object' && !Array.isArray(currentData)) {
            if (typeof realtimeData !== 'object' || Array.isArray(realtimeData)) {
              console.warn('[useQueryWithRealtime] Shape mismatch: current is object but realtime is not')
              newData = currentData
            } else {
              newData = { ...currentData, ...realtimeData } as TData
            }
          } else if (Array.isArray(currentData)) {
            if (!Array.isArray(realtimeData)) {
              console.warn('[useQueryWithRealtime] Shape mismatch: current is array but realtime is not, skipping update')
              newData = currentData
            } else {
              newData = [...realtimeData] as TData
            }
          } else {
            newData = realtimeData as TData
          }
          break
        case 'custom':
          if (customMerge) {
            newData = customMerge(currentData, realtimeData)
          } else {
            newData = realtimeData as TData
          }
          break
        case 'replace':
        default:
          if (currentData !== undefined) {
            const currentIsArray = Array.isArray(currentData)
            const realtimeIsArray = Array.isArray(realtimeData)
            if (currentIsArray !== realtimeIsArray) {
              console.warn('[useQueryWithRealtime] Shape mismatch on replace: array/object type differs, invalidating instead')
              queryClient.invalidateQueries({ queryKey })
              return
            }
          }
          newData = realtimeData as TData
          break
      }

      queryClient.setQueryData(queryKey, newData)
      setLastRealtimeUpdate(new Date())
      setIsRealtime(true)
      isRealtimeRef.current = true

      if (onRealtimeUpdate) {
        onRealtimeUpdate(realtimeData)
      }

      setTimeout(() => {
        setIsRealtime(false)
        isRealtimeRef.current = false
      }, 2000)
    },
    [queryClient, queryKey, mergeStrategy, customMerge, onRealtimeUpdate]
  )

  const shouldEnableRealtime = realtimeEnabled && !!realtimeDataType

  const { connectionStatus, isConnected } = useRealtimeUpdates({
    dataType: realtimeDataType || 'analytics',
    onUpdate: handleRealtimeUpdate,
    enabled: shouldEnableRealtime,
  })

  useEffect(() => {
    if (!isConnected && realtimeEnabled && realtimeDataType) {
      console.log('[useQueryWithRealtime] WebSocket disconnected, falling back to polling')
    }
  }, [isConnected, realtimeEnabled, realtimeDataType])

  return {
    data: queryResult.data,
    isLoading: queryResult.isLoading,
    isFetching: queryResult.isFetching,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
    isRealtime,
    lastRealtimeUpdate,
    connectionStatus,
    isConnected,
  }
}

interface UseRealtimeInvalidationOptions {
  dataType: DataType
  queryKeys: QueryKey[]
  enabled?: boolean
  invalidateOnUpdate?: boolean
  refetchOnUpdate?: boolean
}

export function useRealtimeInvalidation(options: UseRealtimeInvalidationOptions): {
  lastUpdate: Date | null
  connectionStatus: ConnectionStatus
  isConnected: boolean
} {
  const {
    dataType,
    queryKeys,
    enabled = true,
    invalidateOnUpdate = true,
    refetchOnUpdate = false,
  } = options

  const queryClient = useQueryClient()
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const handleUpdate = useCallback(
    async (_data: any) => {
      console.log(`[useRealtimeInvalidation] Received ${dataType} update, invalidating queries`)
      setLastUpdate(new Date())

      for (const queryKey of queryKeys) {
        if (invalidateOnUpdate) {
          await queryClient.invalidateQueries({ queryKey })
        }
        if (refetchOnUpdate) {
          await queryClient.refetchQueries({ queryKey, type: 'active' })
        }
      }
    },
    [queryClient, queryKeys, dataType, invalidateOnUpdate, refetchOnUpdate]
  )

  const { connectionStatus, isConnected } = useRealtimeUpdates({
    dataType,
    onUpdate: handleUpdate,
    enabled,
  })

  return {
    lastUpdate,
    connectionStatus,
    isConnected,
  }
}

export function useRealtimeCacheUpdater<TData>(
  queryKey: QueryKey,
  dataType: DataType,
  transform?: (realtimeData: any, currentData: TData | undefined) => TData
): {
  isConnected: boolean
  lastUpdate: Date | null
} {
  const queryClient = useQueryClient()
  const { isConnected } = useRealtimeContext()
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const handleUpdate = useCallback(
    (realtimeData: any) => {
      const currentData = queryClient.getQueryData<TData>(queryKey)
      
      const newData = transform 
        ? transform(realtimeData, currentData)
        : realtimeData as TData

      queryClient.setQueryData(queryKey, newData)
      setLastUpdate(new Date())
      
      console.log(`[useRealtimeCacheUpdater] Updated cache for:`, queryKey)
    },
    [queryClient, queryKey, transform]
  )

  useRealtimeUpdates({
    dataType,
    onUpdate: handleUpdate,
    enabled: true,
  })

  return {
    isConnected,
    lastUpdate,
  }
}
