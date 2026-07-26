/**
 * useDashboardData — the single data seam every analytics dashboard reads from
 * (08-backend-api-architecture.md Ch 4; 09-data-contracts.md).
 *
 * Phase 9 wires this to the real dashboard-oriented endpoint
 * (`GET /api/v1/analytics/dashboards/:dashboardId`) via React Query + the shared
 * authenticated `apiRequest`. Dashboards render their widgets from the returned,
 * contract-shaped envelope (values computed on the backend, Rule 9).
 *
 * The endpoint is live now; until the MongoDB rollup store lands (Phase 10) it
 * returns a valid empty envelope (`partialData: true`) — never fabricated data.
 */

import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

import type { DashboardResponse } from './contracts'

/** Loading/availability status of a dashboard's data. */
export type DashboardDataStatus = 'loading' | 'ready' | 'empty' | 'error' | 'partial'

export interface DashboardDataResult<T> {
  status: DashboardDataStatus
  data?: T
  lastRefresh?: string
  isRefreshing?: boolean
  refetch: () => void
}

/** Query parameters for a dashboard request (mirrors the server query model). */
export interface DashboardQueryParams {
  from?: string
  to?: string
  compareFrom?: string
  compareTo?: string
  granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'lifetime'
  platforms?: string[]
  accounts?: string[]
}

/** Build the query string for the dashboard endpoint. */
function buildQueryString(workspaceId: string, params: DashboardQueryParams): string {
  const search = new URLSearchParams({ workspaceId })
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.compareFrom) search.set('compareFrom', params.compareFrom)
  if (params.compareTo) search.set('compareTo', params.compareTo)
  if (params.granularity) search.set('granularity', params.granularity)
  if (params.platforms && params.platforms.length) search.set('platforms', params.platforms.join(','))
  if (params.accounts && params.accounts.length) search.set('accounts', params.accounts.join(','))
  return search.toString()
}

/**
 * Read a dashboard's data by id, scoped to the current workspace and filters.
 * Returns a contract-shaped envelope plus a normalized status the dashboard maps
 * to widget states.
 */
export function useDashboardData(
  dashboardId: string,
  params: DashboardQueryParams = {}
): DashboardDataResult<DashboardResponse> {
  const { currentWorkspaceId } = useCurrentWorkspace()

  const query = useQuery({
    queryKey: ['/api/v1/analytics/dashboards', dashboardId, currentWorkspaceId, params],
    queryFn: async (): Promise<DashboardResponse> => {
      const qs = buildQueryString(currentWorkspaceId as string, params)
      return apiRequest(`/api/v1/analytics/dashboards/${dashboardId}?${qs}`)
    },
    enabled: !!currentWorkspaceId,
    staleTime: 30 * 1000, // 30s stale time — ensures fresh data after filters change
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    retry: 1,
  })

  const { data, isLoading, isError, isFetching, refetch } = query

  let status: DashboardDataStatus
  if (!currentWorkspaceId || isLoading) status = 'loading'
  else if (isError) status = 'error'
  else if (!data) status = 'empty'
  else if (data.meta.partialData) status = 'partial'
  else status = 'ready'

  return {
    status,
    data,
    lastRefresh: data?.meta.lastRefresh,
    isRefreshing: isFetching && !isLoading,
    refetch: () => void refetch(),
  }
}
