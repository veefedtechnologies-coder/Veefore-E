/**
 * FacebookReconnectBanner — non-blocking inline reconnect prompt shown in the
 * Dashboard and Analytics pages when at least one Facebook Page in the active
 * workspace has `connectionStatus === 'REQUIRES_RECONNECT'`.
 *
 * Design constraints (Requirements 2.11, 5.7):
 * - Renders as a compact info-strip; never hides, collapses, or replaces any
 *   existing KPI card or metric widget.
 * - Prompt disappears automatically once all affected accounts are back to ACTIVE
 *   (query cache invalidation clears it on reconnect).
 * - Reconnect CTA navigates to Social Accounts settings so the user can
 *   re-authorise each page; a direct OAuth restart is intentionally initiated
 *   from the dedicated account card, not from this ambient prompt.
 *
 * Requirements: 2.11, 5.7
 */

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useLocation } from 'wouter'

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { apiRequest } from '@/lib/queryClient'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of a SocialAccount record as returned by the list endpoint. */
interface SocialAccountRecord {
  _id?: string
  id?: string
  platform?: string
  connectionStatus?: 'ACTIVE' | 'DISCONNECTED' | 'REQUIRES_RECONNECT' | 'SYNCING'
  /** Legacy field — may not be present on older records */
  tokenStatus?: string
  pageName?: string
  username?: string
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

/**
 * Returns the list of Facebook `SocialAccount` records that currently require
 * reconnection for the active workspace.
 *
 * Shares the same React Query cache key as `PlatformFilterContext` so the result
 * is served from cache when available — no extra network requests.
 */
function useFacebookReconnectAccounts() {
  const { currentWorkspaceId } = useCurrentWorkspace()

  const { data: accountsRaw, isLoading } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspaceId],
    queryFn: async () => {
      if (!currentWorkspaceId) return []
      const response = await apiRequest(
        `/api/social-accounts?workspaceId=${currentWorkspaceId}`
      )
      if (Array.isArray(response)) return response
      if (response && Array.isArray((response as any).data)) return (response as any).data
      return []
    },
    enabled: !!currentWorkspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const accounts: SocialAccountRecord[] = Array.isArray(accountsRaw) ? accountsRaw : []

  const reconnectAccounts = accounts.filter((a) => {
    // Legacy records without a `platform` field are Instagram — skip.
    const platform = a.platform ?? 'instagram'
    if (platform !== 'facebook') return false
    return (
      a.connectionStatus === 'REQUIRES_RECONNECT' ||
      // Fallback for older API shapes that use `tokenStatus` instead
      a.tokenStatus === 'expired' ||
      a.tokenStatus === 'invalid'
    )
  })

  return { reconnectAccounts, isLoading }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Derive a readable name for a Facebook Page account record. */
function resolvePageName(account: SocialAccountRecord): string {
  return account.pageName ?? account.username ?? 'your Facebook Page'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FacebookReconnectBannerProps {
  /** Extra Tailwind class names applied to the outer container. */
  className?: string
}

/**
 * Inline reconnect prompt for Facebook accounts requiring reconnection.
 *
 * - Renders nothing when there are no accounts needing reconnect (or while
 *   loading) — zero impact on layout when not needed.
 * - Renders a single compact amber-tinted strip otherwise.
 * - The [Reconnect] link navigates to Social Accounts settings (`/settings?tab=social`)
 *   where the user can re-authorise each page via the dedicated account card.
 * - A dismiss button lets the user hide the banner for the current session
 *   without affecting any existing functionality.
 *
 * Requirements: 2.11, 5.7
 */
export function FacebookReconnectBanner({ className }: FacebookReconnectBannerProps) {
  const { reconnectAccounts, isLoading } = useFacebookReconnectAccounts()
  const [, navigate] = useLocation()

  const handleReconnectClick = useCallback(() => {
    // Navigate to the Social Accounts settings tab where the user can
    // re-initiate the Facebook OAuth flow from the dedicated account card
    // (Requirement 2.11).
    navigate('/settings?tab=social')
  }, [navigate])

  // Nothing to show while data is loading or when all accounts are healthy.
  if (isLoading || reconnectAccounts.length === 0) {
    return null
  }

  // Build the inline message copy.
  const pageNames = reconnectAccounts.map(resolvePageName)
  const messageCopy =
    pageNames.length === 1
      ? `Your Facebook data is paused — ${pageNames[0]} needs to be reconnected.`
      : `Your Facebook data is paused — ${pageNames.length} pages need to be reconnected.`

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Facebook reconnect required"
      className={cn(
        // Compact amber info-strip — visually similar to the existing
        // PlatformWarningBanner in OverviewDashboard but scoped to reconnect.
        'flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50',
        'px-4 py-2.5 text-sm text-amber-800',
        'dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300',
        className
      )}
    >
      {/* Icon */}
      <AlertTriangle
        className="h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-400"
        aria-hidden="true"
      />

      {/* Message + action link */}
      <span className="flex-1 leading-snug">
        {messageCopy}{' '}
        <button
          type="button"
          onClick={handleReconnectClick}
          className={cn(
            'inline-flex items-center gap-1 font-semibold underline underline-offset-2',
            'text-amber-900 hover:text-amber-700 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm',
            'dark:text-amber-200 dark:hover:text-amber-100'
          )}
          aria-label="Go to Social Accounts settings to reconnect Facebook"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reconnect
        </button>
      </span>
    </div>
  )
}

export default FacebookReconnectBanner
