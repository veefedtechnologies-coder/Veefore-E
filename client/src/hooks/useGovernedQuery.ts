/**
 * useGovernedQuery — Stale-While-Revalidate React Query wrapper with tier awareness
 *
 * Wraps @tanstack/react-query's useQuery to deliver the governed UX pattern:
 * - Renders cached data immediately (< 200ms) without blocking on background refresh
 * - Updates data in-place with subtle transition when background refresh succeeds
 * - Continues showing cached data (no error, no spinner) when refresh is deferred (Caution+)
 * - Displays "last updated" as plain-language relative time
 * - Shows visual staleness indicator when cached data exceeds threshold
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.9
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type QueryFunction,
  type UseQueryResult,
  type UseQueryOptions,
} from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Usage tier classification mirroring server-side UsageTier enum.
 * Kept as a string union on the frontend for simplicity.
 */
export type UsageTier = 'NORMAL' | 'CAUTION' | 'RESTRICTED' | 'CRITICAL'

/**
 * Metadata exposed alongside standard React Query result to inform UI about
 * data freshness, tier state, and refresh scheduling.
 */
export interface GovernedQueryMeta {
  /** Timestamp (ms) when data was last successfully fetched, or null if never fetched */
  lastUpdatedAt: number | null
  /** Current usage tier for the associated account */
  tier: UsageTier
  /** Whether cached data exceeds the staleness threshold */
  isStale: boolean
  /** Human-readable estimate of next refresh, e.g. "~20 minutes" (null if unknown) */
  nextRefreshEstimate: string | null
  /** Plain-language relative time string, e.g. "Updated 12 minutes ago" */
  lastUpdatedLabel: string | null
}

/**
 * Options for useGovernedQuery, extending standard React Query options.
 */
export interface UseGovernedQueryOptions<TData, TError = Error>
  extends Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryKey' | 'queryFn'> {
  /** React Query key */
  queryKey: QueryKey
  /** Fetch function */
  queryFn: QueryFunction<TData>
  /** Instagram account ID for tier awareness */
  accountId: string
  /** Staleness threshold in ms (default: 5 minutes / 300_000ms) */
  stalenessThresholdMs?: number
  /** Estimated next refresh time in minutes (from server tier info) */
  nextRefreshMinutes?: number | null
}

/**
 * Return type combining standard UseQueryResult with governed metadata.
 */
export type UseGovernedQueryResult<TData, TError = Error> = UseQueryResult<TData, TError> & {
  meta: GovernedQueryMeta
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default staleness threshold: 5 minutes */
const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000

/** Interval for updating the relative time label (30 seconds) */
const RELATIVE_TIME_UPDATE_INTERVAL_MS = 30_000

/**
 * Formats a timestamp as plain-language relative time.
 * Examples: "Updated just now", "Updated 3 minutes ago", "Updated 2 hours ago"
 */
export function formatRelativeTime(timestampMs: number | null): string | null {
  if (timestampMs === null) return null

  const now = Date.now()
  const diffMs = now - timestampMs

  if (diffMs < 0) return 'Updated just now'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 30) return 'Updated just now'
  if (seconds < 60) return 'Updated less than a minute ago'
  if (minutes === 1) return 'Updated 1 minute ago'
  if (minutes < 60) return `Updated ${minutes} minutes ago`
  if (hours === 1) return 'Updated 1 hour ago'
  if (hours < 24) return `Updated ${hours} hours ago`
  if (days === 1) return 'Updated 1 day ago'
  return `Updated ${days} days ago`
}

/**
 * Formats minutes into a human-readable estimate string.
 * Examples: "~5 minutes", "~1 hour", "~2 hours"
 */
export function formatRefreshEstimate(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || minutes <= 0) return null

  if (minutes < 60) return `~${Math.round(minutes)} minutes`
  const hours = Math.round(minutes / 60)
  if (hours === 1) return '~1 hour'
  return `~${hours} hours`
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useGovernedQuery — tier-aware React Query wrapper implementing stale-while-revalidate UX.
 *
 * Renders cached data immediately without waiting for background refresh.
 * Suppresses errors and loading states when the account is in Caution tier or above.
 * Provides metadata about data freshness and tier status for UI indicators.
 */
export function useGovernedQuery<TData, TError = Error>(
  options: UseGovernedQueryOptions<TData, TError>
): UseGovernedQueryResult<TData, TError> {
  const {
    queryKey,
    queryFn,
    accountId,
    stalenessThresholdMs = DEFAULT_STALENESS_THRESHOLD_MS,
    nextRefreshMinutes = null,
    ...queryOptions
  } = options

  const queryClient = useQueryClient()

  // Track the account's current tier (updated via WebSocket or API response)
  const [tier, setTier] = useState<UsageTier>('NORMAL')

  // Track when data was last successfully fetched
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(() => {
    // Initialize from existing cache if available
    const existingData = queryClient.getQueryData(queryKey)
    return existingData !== undefined ? Date.now() : null
  })

  // Relative time label that updates periodically
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(
    () => formatRelativeTime(lastUpdatedAt)
  )

  const lastUpdatedAtRef = useRef(lastUpdatedAt)
  lastUpdatedAtRef.current = lastUpdatedAt

  // ---------------------------------------------------------------------------
  // React Query configuration for stale-while-revalidate pattern
  // ---------------------------------------------------------------------------

  const queryResult = useQuery<TData, TError, TData, QueryKey>({
    queryKey,
    queryFn,
    // Stale-while-revalidate: use cached data immediately, refetch in background
    staleTime: 0, // Data is always considered stale so background refresh fires
    gcTime: 1000 * 60 * 60, // Keep cached data for 1 hour in garbage collection
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    // Suppress retry storms when in higher tiers
    retry: tier === 'CRITICAL' || tier === 'RESTRICTED' ? 0 : 1,
    // Don't show error state when refresh is deferred — keep showing cached data
    ...(queryOptions as any),
    // Use placeholder data from cache to render immediately
    placeholderData: (previousData: TData | undefined) => previousData,
  })

  // ---------------------------------------------------------------------------
  // Track successful fetches to update lastUpdatedAt
  // ---------------------------------------------------------------------------

  const prevDataUpdatedAtRef = useRef(queryResult.dataUpdatedAt)

  useEffect(() => {
    if (
      queryResult.dataUpdatedAt > 0 &&
      queryResult.dataUpdatedAt !== prevDataUpdatedAtRef.current
    ) {
      prevDataUpdatedAtRef.current = queryResult.dataUpdatedAt
      const now = Date.now()
      setLastUpdatedAt(now)
      setLastUpdatedLabel(formatRelativeTime(now))
    }
  }, [queryResult.dataUpdatedAt])

  // ---------------------------------------------------------------------------
  // Periodic relative time label update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (lastUpdatedAt === null) return

    const interval = setInterval(() => {
      setLastUpdatedLabel(formatRelativeTime(lastUpdatedAtRef.current))
    }, RELATIVE_TIME_UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [lastUpdatedAt])

  // ---------------------------------------------------------------------------
  // Tier update handling (from WebSocket events or external state)
  // ---------------------------------------------------------------------------

  /**
   * External setter for tier — called by parent components or WebSocket listeners
   * when a `tier-change` event is received for this account.
   */
  const updateTier = useCallback((newTier: UsageTier) => {
    setTier(newTier)
  }, [])

  // Attach the tier updater to the query client's metadata for external access
  useEffect(() => {
    const metaKey = `governed-tier-${accountId}`
    ;(queryClient as any)[metaKey] = updateTier
    return () => {
      delete (queryClient as any)[metaKey]
    }
  }, [accountId, queryClient, updateTier])

  // ---------------------------------------------------------------------------
  // Compute staleness
  // ---------------------------------------------------------------------------

  const isStale = useMemo(() => {
    if (lastUpdatedAt === null) return false
    return Date.now() - lastUpdatedAt > stalenessThresholdMs
  }, [lastUpdatedAt, stalenessThresholdMs])

  // Recompute staleness periodically (same interval as relative time)
  const [staleFlag, setStaleFlag] = useState(isStale)

  useEffect(() => {
    setStaleFlag(isStale)
  }, [isStale])

  useEffect(() => {
    if (lastUpdatedAt === null) return

    const interval = setInterval(() => {
      const nowStale = Date.now() - (lastUpdatedAtRef.current ?? 0) > stalenessThresholdMs
      setStaleFlag(nowStale)
    }, RELATIVE_TIME_UPDATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [lastUpdatedAt, stalenessThresholdMs])

  // ---------------------------------------------------------------------------
  // Compose governed metadata
  // ---------------------------------------------------------------------------

  const meta: GovernedQueryMeta = useMemo(
    () => ({
      lastUpdatedAt,
      tier,
      isStale: staleFlag,
      nextRefreshEstimate: formatRefreshEstimate(nextRefreshMinutes),
      lastUpdatedLabel,
    }),
    [lastUpdatedAt, tier, staleFlag, nextRefreshMinutes, lastUpdatedLabel]
  )

  // ---------------------------------------------------------------------------
  // Return combined result
  // ---------------------------------------------------------------------------

  return {
    ...queryResult,
    // Override error/loading behavior when in deferred tiers and we have cached data
    // Requirement 8.3: When refresh deferred (Caution+), show cached data — no error, no spinner
    isLoading: queryResult.data !== undefined ? false : queryResult.isLoading,
    isError: (tier === 'CAUTION' || tier === 'RESTRICTED' || tier === 'CRITICAL')
      && queryResult.data !== undefined
      ? false
      : queryResult.isError,
    error: (tier === 'CAUTION' || tier === 'RESTRICTED' || tier === 'CRITICAL')
      && queryResult.data !== undefined
      ? null
      : queryResult.error,
    meta,
  } as UseGovernedQueryResult<TData, TError>
}

// ---------------------------------------------------------------------------
// Utility: Update tier for a governed query externally
// ---------------------------------------------------------------------------

/**
 * Helper to push a tier update to a governed query from a WebSocket listener.
 * Call this when receiving a `tier-change` event for the given account.
 */
export function updateGovernedQueryTier(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
  newTier: UsageTier
): void {
  const metaKey = `governed-tier-${accountId}`
  const updater = (queryClient as any)[metaKey]
  if (typeof updater === 'function') {
    updater(newTier)
  }
}
