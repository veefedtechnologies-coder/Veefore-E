import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

export const useFollowerAnalytics = (workspaceId?: string) => {
  const { data: followerData, isLoading, isFetching } = useQuery({
    queryKey: ['/api/workspaces/metrics/followers', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const response = await apiRequest(`/api/workspaces/${workspaceId}/metrics/followers`);
      return response;
    },
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  })

  return { followerData, isLoading, isFetching }
}
