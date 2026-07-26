import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

export interface FollowerAnalyticsData {
  currentFollowers: number
  instagramFollowers: number
  facebookFollowers: number
  // Current period
  dailyGrowth: number
  dailyGained: number
  dailyLost: number
  weeklyGrowth: number
  weeklyGained: number
  weeklyLost: number
  monthlyGrowth: number
  monthlyGained: number
  monthlyLost: number
  // Previous period (for % change)
  prevDailyGrowth: number
  prevDailyGained: number
  prevDailyLost: number
  prevWeeklyGrowth: number
  prevWeeklyGained: number
  prevWeeklyLost: number
  prevMonthlyGrowth: number
  prevMonthlyGained: number
  prevMonthlyLost: number
  growthPercentage: number
  trend: 'up' | 'down' | 'flat'
}

export const useFollowerAnalytics = (workspaceId?: string) => {
  const { data: followerData, isLoading, isFetching } = useQuery({
    queryKey: ['/api/workspaces/metrics/followers', workspaceId],
    queryFn: async (): Promise<FollowerAnalyticsData | null> => {
      if (!workspaceId) return null;
      const response = await apiRequest(`/api/workspaces/${workspaceId}/metrics/followers`);
      return response ?? null;
    },
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  return { followerData, isLoading, isFetching }
}
