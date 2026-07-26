import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

type Period = 'day' | 'week' | 'month'

export const useHistoricalData = (workspaceId?: string, period: Period = 'month') => {
  // We fetch exactly the number of days needed to calculate the growth for that period
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30

  const { data: historicalData, isLoading, isFetching } = useQuery({
    queryKey: ['/api/analytics/historical', period, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await apiRequest(`/api/analytics/historical?period=${period}&days=${days}&workspaceId=${workspaceId}`);
      // API returns { success: true, data: [...] } — extract the array
      if (response && response.data && Array.isArray(response.data)) {
        return response.data;
      }
      // Fallback: if it's already an array (legacy), use it directly
      if (Array.isArray(response)) return response;
      return [];
    },
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // serve cached data instantly; revalidate after 5 min
    gcTime: 30 * 60 * 1000,
    placeholderData: undefined,
  })

  return { historicalData, isLoading, isFetching }
}
