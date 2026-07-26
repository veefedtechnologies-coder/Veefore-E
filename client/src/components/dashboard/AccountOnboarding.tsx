/**
 * AccountOnboarding — New Account Onboarding Transparency Component
 *
 * Displays onboarding messaging for newly connected low-ceiling Instagram accounts:
 * - Brief plain-language message explaining refresh frequency scales with activity
 * - Syncing indicator (spinner) during initial backfill
 * - Auto-dismisses syncing indicator when `sync-complete` event is received
 *
 * All messaging uses plain, non-technical language. No mention of API limits,
 * rate limits, or impressions formulas.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, Sparkles } from 'lucide-react'
import {
  useTierStatusListener,
  TIER_STATUS_EVENTS,
  type SyncCompleteEvent,
} from '@/hooks/useTierStatusListener'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountOnboardingProps {
  /** The Instagram account ID to show onboarding for */
  accountId: string
  /** Whether this is a newly connected account (no prior sync) */
  isNewAccount: boolean
  /** Whether this account is classified as low-ceiling (small/new account) */
  isLowCeiling: boolean
  /** Optional: override syncing state for testing */
  isSyncingOverride?: boolean
  /** Optional className for container */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountOnboarding({
  accountId,
  isNewAccount,
  isLowCeiling,
  isSyncingOverride,
  className = '',
}: AccountOnboardingProps) {
  const { getAccountStatus } = useTierStatusListener()
  const accountStatus = getAccountStatus(accountId)

  // Local syncing state — starts true for new accounts, dismissed on sync-complete
  const [isSyncing, setIsSyncing] = useState<boolean>(
    isSyncingOverride ?? (isNewAccount && !accountStatus?.syncPostsLoaded)
  )
  // Track whether sync has completed (to show success briefly)
  const [syncJustCompleted, setSyncJustCompleted] = useState(false)
  // Track dismissed state so users can close the onboarding banner
  const [isDismissed, setIsDismissed] = useState(false)

  /**
   * Listen for the sync-complete CustomEvent dispatched by useTierStatusListener.
   * When our account finishes backfill, dismiss the syncing indicator.
   */
  const handleSyncComplete = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<SyncCompleteEvent>).detail
      if (detail.accountId === accountId) {
        setIsSyncing(false)
        setSyncJustCompleted(true)
        // Auto-clear the success state after a few seconds
        setTimeout(() => setSyncJustCompleted(false), 5000)
      }
    },
    [accountId]
  )

  useEffect(() => {
    window.addEventListener(TIER_STATUS_EVENTS.SYNC_COMPLETE, handleSyncComplete)
    return () => {
      window.removeEventListener(TIER_STATUS_EVENTS.SYNC_COMPLETE, handleSyncComplete)
    }
  }, [handleSyncComplete])

  // Also react to tier status listener state changes (e.g., if hook reconnects)
  useEffect(() => {
    if (accountStatus && accountStatus.syncPostsLoaded !== null && !accountStatus.isSyncing) {
      setIsSyncing(false)
    }
  }, [accountStatus])

  // Respect override prop for testing
  useEffect(() => {
    if (isSyncingOverride !== undefined) {
      setIsSyncing(isSyncingOverride)
    }
  }, [isSyncingOverride])

  // Don't show anything if dismissed, or if account is not new/low-ceiling
  if (isDismissed) return null
  if (!isNewAccount && !isLowCeiling) return null
  // If sync already completed and success message faded, hide for non-low-ceiling
  if (!isSyncing && !syncJustCompleted && !isLowCeiling) return null

  return (
    <div
      data-testid="account-onboarding"
      className={`rounded-2xl border border-blue-100 dark:border-blue-800/50 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 transition-all duration-300 ${className}`}
    >
      <div className="flex items-start space-x-3">
        {/* Icon / spinner area */}
        <div className="flex-shrink-0 mt-0.5">
          {isSyncing ? (
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-800/40 flex items-center justify-center">
              {/* skeleton-guard-allow: action-spinner — active backfill/sync spinner, not a
                  primary page loader for a renderable structure */}
              <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
          ) : syncJustCompleted ? (
            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-800/40 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-800/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          )}
        </div>

        {/* Message area */}
        <div className="flex-1 min-w-0">
          {isSyncing ? (
            <>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Setting up your account
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                We're pulling in your recent posts and data. This usually takes just a moment.
              </p>
            </>
          ) : syncJustCompleted ? (
            <>
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                You're all set!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                Your posts and insights are ready to view.
              </p>
            </>
          ) : isLowCeiling ? (
            <>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Welcome aboard
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                Your data refreshes on a schedule that grows as your account grows. As you post more and your audience engages, updates will come in more frequently.
              </p>
            </>
          ) : null}
        </div>

        {/* Dismiss button (only for the static onboarding message, not syncing) */}
        {!isSyncing && !syncJustCompleted && isLowCeiling && (
          <button
            onClick={() => setIsDismissed(true)}
            className="flex-shrink-0 p-1 rounded-lg text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
            aria-label="Dismiss onboarding message"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Syncing progress indicator */}
      {isSyncing && (
        <div className="mt-3 ml-12">
          <div className="h-1.5 w-full rounded-full bg-blue-100 dark:bg-blue-800/40 overflow-hidden">
            {/* skeleton-guard-allow: progress — live backfill progress bar, not a content
                loading placeholder; it reflects ongoing sync work, not skeleton loading */}
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 animate-pulse w-2/3" />
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountOnboarding
