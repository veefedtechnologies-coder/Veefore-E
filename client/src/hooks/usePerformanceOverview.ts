import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

type Period = 'day' | 'week' | 'month'

export interface PerformanceOverviewData {
  period: Period
  posts: {
    current: number
    previous: number
    changePercent: number
    isPositive: boolean
  }
  contentScore: {
    current: number
    previous: number
    changePercent: number
    isPositive: boolean
    rating: string
  }
  engagement: {
    rate: number
    changePercent: number
    isPositive: boolean
  }
  topPerformer: null | {
    title: string
    type: string
    platform: string
    likes: number
    comments: number
    shares: number
    saves: number
    views: number
    reach: number
    engagement: number
    publishedAt: string
  }
}

export const usePerformanceOverview = (workspaceId?: string, period: Period = 'month') => {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['/api/analytics/performance-overview', workspaceId, period],
    queryFn: async (): Promise<PerformanceOverviewData | null> => {
      if (!workspaceId) return null
      const response = await apiRequest(
        `/api/v1/analytics/workspace/${workspaceId}/performance-overview?period=${period}`
      )
      if (response?.success && response?.data) return response.data as PerformanceOverviewData
      return null
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

  return { overviewData: data ?? null, isLoading, isFetching }
}
