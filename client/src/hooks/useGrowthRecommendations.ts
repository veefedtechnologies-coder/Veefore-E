import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiClient } from '@/lib/api'

export interface GrowthRecommendation {
  icon: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  category: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetches AI-generated, data-grounded growth recommendations for the workspace.
 *
 * Architecture:
 * - The BACKEND offloads the heavy MongoDB aggregation + AI generation to a
 *   BullMQ worker and caches the result in Redis. The endpoint returns either a
 *   ready result or { status: 'pending' } — so we POLL until the worker finishes.
 * - Once produced, the result is served from Redis, so plain page refreshes and
 *   tab switches don't re-query MongoDB. It only regenerates when the underlying
 *   data changes (worker recomputes signature) or on a manual refresh.
 */
async function fetchRecommendations(workspaceId: string, forceRefresh = false): Promise<GrowthRecommendation[]> {
  const MAX_ATTEMPTS = 14
  // Fast early backoff so a finished worker result surfaces ~2s sooner than a
  // fixed 3s tick, then ease off. Total budget stays ~30s.
  const POLL_DELAYS = [800, 1000, 1300, 1700, 2200, 2800, 3000]
  const delayFor = (attempt: number) => POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await ApiClient.post(
      `/api/v1/analytics/workspace/${workspaceId}/growth-recommendations`,
      // Only force on the first attempt; subsequent polls just read the result.
      { forceRefresh: forceRefresh && attempt === 0 }
    )

    if (res?.success && res.status === 'ready' && Array.isArray(res.recommendations)) {
      return res.recommendations as GrowthRecommendation[]
    }
    // Generation failed (e.g. AI quota) — stop polling, surface empty so the UI
    // shows its retry state instead of looping and burning quota.
    if (res?.status === 'error') {
      return []
    }
    // Inline (no-queue) fallback returns recommendations without a pending status.
    if (res?.success && res.status !== 'pending' && Array.isArray(res.recommendations) && res.recommendations.length > 0) {
      return res.recommendations as GrowthRecommendation[]
    }
    if (res?.status === 'pending') {
      await sleep(delayFor(attempt))
      continue
    }
    // Anything else → stop.
    return Array.isArray(res?.recommendations) ? (res.recommendations as GrowthRecommendation[]) : []
  }
  return []
}

export const useGrowthRecommendations = (workspaceId?: string) => {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const queryKey = ['/api/v1/analytics/growth-recommendations', workspaceId]

  const query = useQuery<GrowthRecommendation[]>({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return []
      return fetchRecommendations(workspaceId, false)
    },
    enabled: !!workspaceId,
    staleTime: Infinity, // backend (Redis + data signature) decides freshness
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
  })

  // Manual refresh: force the worker to regenerate, then write the fresh result
  // straight into the query cache.
  const refresh = useCallback(async () => {
    if (!workspaceId) return
    setIsRefreshing(true)
    try {
      const recs = await fetchRecommendations(workspaceId, true)
      if (recs.length > 0) {
        queryClient.setQueryData(queryKey, recs)
      }
    } catch (e) {
      console.error('Failed to refresh recommendations:', e)
    } finally {
      setIsRefreshing(false)
    }
  }, [workspaceId, queryClient])

  return {
    recommendations: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching || isRefreshing,
    isError: query.isError,
    refetch: refresh,
  }
}
