import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

type Period = 'day' | 'week' | 'month'

export const useHistoricalData = (workspaceId?: string, period: Period = 'month') => {
  const days = period === 'day' ? 7 : period === 'week' ? 30 : 90

  const { data: historicalData, isLoading, isFetching } = useQuery({
    queryKey: ['/api/analytics/historical', period, workspaceId],
    queryFn: () => workspaceId 
      ? apiRequest(`/api/analytics/historical?period=${period}&days=${days}&workspaceId=${workspaceId}`) 
      : Promise.resolve([]),
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    placeholderData: undefined,
  })

  return { historicalData, isLoading, isFetching }
}
