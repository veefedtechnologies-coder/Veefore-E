import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

export const usePerformanceData = (workspaceId?: string) => {
  const { data: analytics, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['/api/dashboard/analytics', workspaceId],
    queryFn: () => workspaceId ? apiRequest(`/api/dashboard/analytics?workspaceId=${workspaceId}`) : Promise.resolve({}),
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

  return { analytics, isLoading, isFetching, refetch }
}
