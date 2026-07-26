/**
 * FacebookReconnectBanner
 *
 * A persistent in-page notification shown at the top of the Social Accounts
 * page whenever one or more Facebook accounts have
 * `connectionStatus === 'REQUIRES_RECONNECT'`.
 *
 * Design decisions:
 * - One banner per affected account (if multiple pages need reconnecting the
 *   user sees each individually so the page name and reason are unambiguous).
 * - Dismissible within the current browser session via `sessionStorage`.
 *   Once the account is successfully reconnected the banner disappears
 *   automatically because `connectionStatus` will no longer be
 *   `REQUIRES_RECONNECT`.
 * - The "Reconnect Now" CTA hits `GET /api/facebook/auth?workspaceId=...`
 *   (task 3.4) which returns `{ authUrl }` and then redirects the browser to
 *   the Facebook OAuth dialog.
 * - Matches the existing Veefore alert/notification colour palette
 *   (amber warning strip with an inline action button) — no new design tokens.
 *
 * Requirements: 2.10, 2.11, 4.5
 */

import React, { useCallback, useState } from 'react'
import { AlertTriangle, X, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/queryClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimum account shape required by the banner — platform-agnostic. */
export interface ReconnectableAccount {
  _id?: string
  id?: string
  platform: string
  pageName?: string
  username?: string
  connectionStatus?: string
  tokenStatus?: string
  tokenExpiresAt?: string | Date | null
}

export interface FacebookReconnectBannerProps {
  /** All accounts for the current workspace — the component filters internally. */
  accounts: ReconnectableAccount[]
  /** Active workspace ID — forwarded to the OAuth redirect URL. */
  workspaceId: string | undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Session-storage key for a dismissed banner (one per account ID). */
function dismissKey(accountId: string): string {
  return `fb-reconnect-dismissed-${accountId}`
}

/** Checks whether the user already dismissed the banner this session. */
function isDismissed(accountId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(accountId)) === '1'
  } catch {
    return false
  }
}

/** Persist the dismiss flag for the current browser session. */
function persistDismiss(accountId: string): void {
  try {
    sessionStorage.setItem(dismissKey(accountId), '1')
  } catch {
    // sessionStorage unavailable (private browsing edge-cases) — graceful no-op
  }
}

/** Derive a human-readable reason from the account data. */
function resolveReason(account: ReconnectableAccount): string {
  if (account.tokenStatus === 'expired') {
    return 'Token expired — please reconnect to restore access.'
  }
  if (account.tokenExpiresAt) {
    const expiresAt = new Date(account.tokenExpiresAt)
    if (expiresAt < new Date()) {
      return 'Token expired — please reconnect to restore access.'
    }
  }
  if (account.connectionStatus === 'REQUIRES_RECONNECT') {
    return 'Permission revoked — please reconnect to restore access.'
  }
  return 'Reconnection required to continue syncing this page.'
}

/** Return the best display label for a Facebook account. */
function resolveDisplayName(account: ReconnectableAccount): string {
  return account.pageName ?? account.username ?? 'Facebook Page'
}

// ---------------------------------------------------------------------------
// Single-account banner item
// ---------------------------------------------------------------------------

interface BannerItemProps {
  account: ReconnectableAccount
  workspaceId: string | undefined
}

function BannerItem({ account, workspaceId }: BannerItemProps) {
  const accountId = account._id ?? account.id ?? ''
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissed(accountId))
  const [isRedirecting, setIsRedirecting] = useState(false)

  const handleDismiss = useCallback(() => {
    persistDismiss(accountId)
    setDismissed(true)
  }, [accountId])

  const handleReconnect = useCallback(async () => {
    if (!workspaceId) return
    setIsRedirecting(true)
    try {
      // Hit GET /api/facebook/auth — returns { authUrl } (task 3.4)
      const response = await apiRequest(
        `/api/facebook/auth?workspaceId=${encodeURIComponent(workspaceId)}`
      )
      const authUrl: string | undefined = (response as any)?.authUrl
      if (authUrl) {
        window.location.href = authUrl
      } else {
        // Fallback: direct OAuth redirect using the generic auth path
        window.location.href = `/api/social-auth/facebook/authorize?workspaceId=${encodeURIComponent(workspaceId)}`
      }
    } catch {
      // If the API call fails fall back to the generic OAuth path so the
      // user can still attempt reconnection.
      window.location.href = `/api/social-auth/facebook/authorize?workspaceId=${encodeURIComponent(workspaceId)}`
    }
  }, [workspaceId])

  if (dismissed) return null

  const displayName = resolveDisplayName(account)
  const reason = resolveReason(account)

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="facebook-reconnect-banner"
      className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30"
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <AlertTriangle
          className="w-5 h-5 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 leading-snug">
          Your Facebook Page{' '}
          <span className="font-bold">{displayName}</span>{' '}
          requires reconnection
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-snug">
          {reason}
        </p>
      </div>

      {/* Reconnect CTA */}
      <Button
        size="sm"
        onClick={handleReconnect}
        disabled={isRedirecting}
        className="shrink-0 h-8 px-3 text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-none shadow-sm"
        aria-label={`Reconnect ${displayName}`}
      >
        <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
        {isRedirecting ? 'Redirecting…' : 'Reconnect Now'}
      </Button>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 mt-0.5 p-1 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        aria-label={`Dismiss reconnect notification for ${displayName}`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * `FacebookReconnectBanner` — renders one banner strip per Facebook account
 * whose `connectionStatus === 'REQUIRES_RECONNECT'`.
 *
 * Renders nothing when no accounts need reconnection.
 *
 * Requirements: 2.10, 2.11, 4.5
 */
export function FacebookReconnectBanner({
  accounts,
  workspaceId,
}: FacebookReconnectBannerProps) {
  const reconnectAccounts = accounts.filter(
    (a) =>
      a.platform === 'facebook' &&
      (a.connectionStatus === 'REQUIRES_RECONNECT' ||
        // Also surface accounts with an expired tokenStatus that haven't yet
        // had their connectionStatus updated server-side.
        a.tokenStatus === 'expired')
  )

  if (reconnectAccounts.length === 0) return null

  return (
    <div
      className="space-y-2"
      role="region"
      aria-label="Facebook account reconnection required"
    >
      {reconnectAccounts.map((account) => (
        <BannerItem
          key={account._id ?? account.id ?? account.pageName ?? account.username}
          account={account}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  )
}

export default FacebookReconnectBanner
