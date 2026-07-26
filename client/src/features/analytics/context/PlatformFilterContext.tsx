/**
 * PlatformFilterContext — provides platform selection state and visibility flag
 * for the analytics Dashboard and Analytics module.
 *
 * The filter control is shown only when BOTH Instagram AND Facebook accounts
 * are connected in the active workspace (Requirements 5.1, 5.2, 5.3).
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { apiRequest } from '@/lib/queryClient'
import useSubscription from '@/hooks/useSubscription'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three values a user may select in the platform filter control. */
export type PlatformSelection = 'instagram' | 'facebook' | 'all'

interface PlatformFilterContextValue {
  /** The currently active platform selection. Defaults to `'all'`. */
  selection: PlatformSelection
  /** Update the active platform selection. */
  setSelection: (selection: PlatformSelection) => void
  /**
   * `true` only when BOTH instagram AND facebook accounts are connected in the
   * active workspace. When `false` the filter control must not be rendered.
   */
  showFilter: boolean
  /** Deduplicated list of platform strings found in the workspace's connected accounts. */
  connectedPlatforms: string[]
  /**
   * Whether the plan includes cross-platform analytics (the combined "All
   * Platforms" view). Free plans get single-platform analytics only, so the
   * "All Platforms" option is locked and the selection is forced to a single
   * connected platform. Creator and above unlock the merged view.
   */
  canCrossPlatform: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PlatformFilterContext = createContext<PlatformFilterContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PlatformFilterProviderProps {
  children: ReactNode
}

/**
 * Wrap the dashboard tree (or any analytics tree) with this provider.
 * It queries connected SocialAccounts via the existing API, derives which
 * platforms are represented, and exposes the filter state.
 */
export function PlatformFilterProvider({ children }: PlatformFilterProviderProps) {
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { limits } = useSubscription()
  // Cross-platform analytics (the combined "All Platforms" view) is a Creator+
  // feature. Free plans get single-platform analytics only.
  const canCrossPlatform = limits?.features?.crossPlatformAnalytics === true
  const [selection, setSelection] = useState<PlatformSelection>('all')

  // Fetch connected social accounts for the active workspace.
  // We reuse the same query key pattern as `useSocialAccounts` so the result
  // is served from the React Query cache when already loaded elsewhere.
  const { data: accountsRaw } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspaceId],
    queryFn: async () => {
      if (!currentWorkspaceId) return []
      const response = await apiRequest(
        `/api/social-accounts?workspaceId=${currentWorkspaceId}`
      )
      if (Array.isArray(response)) return response
      if (response && Array.isArray(response.data)) return response.data
      return []
    },
    enabled: !!currentWorkspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const accountsArray: Array<{ platform?: string }> = Array.isArray(accountsRaw)
    ? accountsRaw
    : []

  // Extract the unique set of platform strings from connected accounts.
  const connectedPlatforms = useMemo<string[]>(() => {
    const seen = new Set<string>()
    for (const account of accountsArray) {
      // Accounts without an explicit `platform` field are legacy Instagram records.
      const platform = (account as any).platform ?? 'instagram'
      if (platform) seen.add(platform)
    }
    return Array.from(seen)
  }, [accountsArray])

  // The filter is visible only when both instagram AND facebook are present.
  // Requirements 5.1 (Instagram only → no filter), 5.2 (Facebook only → no filter),
  // 5.3 (both → show filter, default = 'all').
  const showFilter = useMemo(
    () =>
      connectedPlatforms.includes('instagram') &&
      connectedPlatforms.includes('facebook'),
    [connectedPlatforms]
  )

  // On plans without cross-platform analytics, the combined "All Platforms"
  // view is not allowed — force the selection to a single connected platform.
  useEffect(() => {
    if (!canCrossPlatform && selection === 'all') {
      const fallback: PlatformSelection = connectedPlatforms.includes('instagram')
        ? 'instagram'
        : connectedPlatforms.includes('facebook')
          ? 'facebook'
          : 'instagram'
      setSelection(fallback)
    }
  }, [canCrossPlatform, selection, connectedPlatforms])

  // Block selecting the combined "All Platforms" view when the plan doesn't
  // include cross-platform analytics.
  const guardedSetSelection = useCallback(
    (next: PlatformSelection) => {
      if (next === 'all' && !canCrossPlatform) return
      setSelection(next)
    },
    [canCrossPlatform]
  )

  const value = useMemo<PlatformFilterContextValue>(
    () => ({ selection, setSelection: guardedSetSelection, showFilter, connectedPlatforms, canCrossPlatform }),
    [selection, guardedSetSelection, showFilter, connectedPlatforms, canCrossPlatform]
  )

  return (
    <PlatformFilterContext.Provider value={value}>
      {children}
    </PlatformFilterContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Consume the platform filter context.
 * Must be used inside a `<PlatformFilterProvider>`.
 */
export function usePlatformFilter(): PlatformFilterContextValue {
  const context = useContext(PlatformFilterContext)
  if (!context) {
    throw new Error('usePlatformFilter must be used within a PlatformFilterProvider')
  }
  return context
}

/**
 * Like `usePlatformFilter` but returns `null` instead of throwing when used
 * outside a `<PlatformFilterProvider>`. Use this in components that may be
 * rendered both inside and outside a provider tree (e.g. KpiCard in isolation
 * during tests or Storybook).
 *
 * When the return value is `null`, treat the selection as `'all'` for
 * single-platform contexts where no filter control is visible.
 */
export function useOptionalPlatformFilter(): PlatformFilterContextValue | null {
  return useContext(PlatformFilterContext)
}
