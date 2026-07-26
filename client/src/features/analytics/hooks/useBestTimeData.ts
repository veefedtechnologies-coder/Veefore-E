/**
 * useBestTimeData — fetches the three Best Time to Post grids:
 *   1. weeklyGrid      — audience online (Max Reach)
 *   2. reachGrid       — average post reach by slot (Boost Visibility)
 *   3. engGrid         — average engagement rate by slot (Drive Engagement)
 *
 * All data is served from the backend, no direct Meta API calls.
 *
 * Supports an optional `platforms` filter (Requirements 6.1, 6.2, 6.4):
 * pass the active PlatformSelection to scope results to a specific platform.
 */

import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import type { PlatformSelection } from '../context/PlatformFilterContext'

export interface SlotValue { dow: number; hour: number; count: number }

export interface RankedSlot {
  dow: number
  dayName: string
  hour: number
  hourLabel: string
  score: number
}

export interface DailyBest {
  dow: number
  dayName: string
  hour: number
  hourLabel: string
  score: number
  dayScore: number
}

/** Unified best-time recommendation combining audience + engagement + reach. */
export interface SmartBestTime {
  combinedGrid: Record<string, number>
  bestSlot: RankedSlot | null
  bestDay: { dow: number; dayName: string; score: number; bestHour: number; hourLabel: string } | null
  dailyBest: DailyBest[]
  topSlots: RankedSlot[]
  confidence: number
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'Learning'
  signals: { audience: boolean; engagement: boolean; reach: boolean }
  meta: { postsAnalyzed: number; usablePosts: number; audienceSlots: number; zScore: number }
  summary: string
  /** Next upcoming date/time that hits a qualifying high-opportunity slot. */
  nextOccurrence: { date: string; dow: number; dayName: string; hour: number; hourLabel: string; score: number } | null
}

export interface BestTimeData {
  // Tab 1 — Max Reach
  activeTime: Record<string, number>
  weeklyGrid: Record<string, number>
  peakHours: Array<{ hour: number; count: number }>
  topDays: SlotValue[]
  // Tab 2 — Boost Visibility
  reachGrid: Record<string, number>
  topReachSlots: SlotValue[]
  // Tab 3 — Drive Engagement
  engGrid: Record<string, number>
  topEngSlots: SlotValue[]
  // Smart — unified recommendation
  smart: SmartBestTime

  hasData: boolean
  hasPostData: boolean
}

export interface BestTimeOptions {
  /** Active platform selection from PlatformFilterContext.
   *  'all' → omit the param (backend returns merged results);
   *  'instagram' | 'facebook' → scopes results to that platform.
   *  Requirements: 6.1, 6.2, 6.4 */
  platforms?: PlatformSelection
}

export function useBestTimeData(options: BestTimeOptions = {}) {
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { platforms } = options

  return useQuery({
    queryKey: ['/api/v1/analytics/best-time', currentWorkspaceId, platforms],
    queryFn: async (): Promise<BestTimeData> => {
      const params = new URLSearchParams({ workspaceId: currentWorkspaceId as string })
      // Thread the platform selection as ?platforms= only when a specific
      // platform is selected — 'all' means no filter (backend default).
      if (platforms && platforms !== 'all') {
        params.set('platforms', platforms)
      }
      return apiRequest(`/api/v1/analytics/best-time?${params}`)
    },
    enabled: !!currentWorkspaceId,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
