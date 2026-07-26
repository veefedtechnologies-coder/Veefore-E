/**
 * TierStatusIndicator — Displays tier status and deferred operation messaging
 *
 * Shows plain-language messages based on the account's current rate-limit tier:
 * - Deferred operations: "Analytics for [account] will refresh again in about 20 minutes"
 * - Critical tier blocking: explains without jargon, provides estimated wait time
 * - Never exposes raw Meta error codes, HTTP status codes, or API error strings
 *
 * Requirements: 8.5, 8.6, 8.7, 8.8
 */

import React, { useMemo } from 'react'
import { Clock, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useTierStatusListener,
  type UsageTier,
  type AccountTierStatus,
} from '@/hooks/useTierStatusListener'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierStatusIndicatorProps {
  /** The Instagram account ID to display tier status for */
  accountId: string
  /** Optional account display name (username or label) shown in messages */
  accountName?: string
  /** Optional className for the root container */
  className?: string
  /** Whether to show a compact version (just a badge) vs full messaging */
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Plain-language message generators (Requirements 8.5, 8.6, 8.7, 8.8)
// Never show raw error codes or HTTP status codes.
// ---------------------------------------------------------------------------

/**
 * Generates a deferred operation message with estimated retry time.
 * Requirement 8.6: plain-language message indicating when operation will retry.
 */
function getDeferredOperationMessage(
  accountName: string,
  operation: string | null,
  estimatedMinutes: number | null
): string | null {
  if (!operation || estimatedMinutes === null || estimatedMinutes <= 0) {
    return null
  }

  // Format the operation name for display (convert snake_case/camelCase to readable)
  const readableOperation = formatOperationName(operation)
  const timeEstimate = formatMinutesEstimate(estimatedMinutes)

  return `${readableOperation} for ${accountName} will refresh again in about ${timeEstimate}`
}

/**
 * Generates a Critical tier blocking message.
 * Requirement 8.7: explain without jargon, provide estimated wait time.
 */
function getCriticalTierMessage(
  accountName: string,
  estimatedMinutesToRecover: number
): string {
  const timeEstimate = formatMinutesEstimate(estimatedMinutesToRecover)

  if (estimatedMinutesToRecover <= 0) {
    return `${accountName} is temporarily paused to stay within platform limits. It should resume shortly.`
  }

  return `${accountName} is temporarily paused to protect your account. Normal access will resume in about ${timeEstimate}.`
}

/**
 * Generates a Restricted tier message.
 */
function getRestrictedTierMessage(accountName: string): string {
  return `${accountName} is running with reduced activity to stay within platform limits. Only your active views are being refreshed.`
}

/**
 * Generates a Caution tier message.
 */
function getCautionTierMessage(accountName: string): string {
  return `Some background refreshes for ${accountName} are paused to manage usage. Your important actions still work normally.`
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Converts an operation identifier to a human-readable label.
 * e.g., "ANALYTICS_REFRESH" → "Analytics", "BACKFILL" → "Historical data sync"
 */
function formatOperationName(operation: string): string {
  const operationMap: Record<string, string> = {
    ANALYTICS_REFRESH: 'Analytics',
    BACKFILL: 'Historical data sync',
    POLLING: 'Data refresh',
    AUTOMATION_REPLY: 'Automated replies',
    SCHEDULED_POST: 'Scheduled post',
    USER_INITIATED: 'Your request',
    ACTIVE_VIEW: 'Live view refresh',
  }

  return operationMap[operation] ?? 'Data refresh'
}

/**
 * Formats minutes into a plain-language time estimate.
 * Examples: "5 minutes", "about an hour", "about 2 hours"
 */
function formatMinutesEstimate(minutes: number): string {
  if (minutes <= 0) return 'a few moments'
  if (minutes < 2) return '1 minute'
  if (minutes < 60) return `${Math.round(minutes)} minutes`
  const hours = Math.round(minutes / 60)
  if (hours === 1) return 'an hour'
  return `${hours} hours`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TierBadgeProps {
  tier: UsageTier
  className?: string
}

/**
 * Small visual badge indicating the current tier level.
 * Uses color coding but no technical jargon.
 */
function TierBadge({ tier, className }: TierBadgeProps) {
  const config = tierVisualConfig[tier]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.badgeClasses,
        className
      )}
    >
      <config.Icon className="w-3 h-3" />
      {config.badgeLabel}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tier visual configuration
// ---------------------------------------------------------------------------

interface TierVisualConfig {
  Icon: React.FC<{ className?: string }>
  badgeLabel: string
  badgeClasses: string
  containerClasses: string
  iconClasses: string
}

const tierVisualConfig: Record<UsageTier, TierVisualConfig> = {
  NORMAL: {
    Icon: CheckCircle2,
    badgeLabel: 'Active',
    badgeClasses: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    containerClasses: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/20',
    iconClasses: 'text-emerald-600 dark:text-emerald-400',
  },
  CAUTION: {
    Icon: Info,
    badgeLabel: 'Slowing down',
    badgeClasses: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    containerClasses: 'border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-900/20',
    iconClasses: 'text-amber-600 dark:text-amber-400',
  },
  RESTRICTED: {
    Icon: Clock,
    badgeLabel: 'Limited',
    badgeClasses: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    containerClasses: 'border-orange-200 bg-orange-50/50 dark:border-orange-800/40 dark:bg-orange-900/20',
    iconClasses: 'text-orange-600 dark:text-orange-400',
  },
  CRITICAL: {
    Icon: AlertTriangle,
    badgeLabel: 'Paused',
    badgeClasses: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    containerClasses: 'border-rose-200 bg-rose-50/50 dark:border-rose-800/40 dark:bg-rose-900/20',
    iconClasses: 'text-rose-600 dark:text-rose-400',
  },
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * TierStatusIndicator displays the current rate-limit tier status for an account
 * and shows deferred operation messaging when applicable.
 *
 * In compact mode, renders only a small badge.
 * In full mode, renders a message card with context about the current state.
 */
export function TierStatusIndicator({
  accountId,
  accountName,
  className,
  compact = false,
}: TierStatusIndicatorProps) {
  const { getAccountStatus } = useTierStatusListener()

  const status: AccountTierStatus | null = getAccountStatus(accountId)

  // Default to NORMAL if no status is tracked yet
  const tier: UsageTier = status?.currentTier ?? 'NORMAL'
  const displayName = accountName || 'your account'
  const config = tierVisualConfig[tier]

  // Determine the primary message to display
  const message = useMemo(() => {
    // Priority 1: Deferred operation messaging (Requirement 8.6)
    if (status?.lastDeferredOperation && status.lastDeferredRetryMinutes) {
      return getDeferredOperationMessage(
        displayName,
        status.lastDeferredOperation,
        status.lastDeferredRetryMinutes
      )
    }

    // Priority 2: Tier-specific messaging
    switch (tier) {
      case 'CRITICAL':
        return getCriticalTierMessage(
          displayName,
          status?.estimatedMinutesToRecover ?? 0
        )
      case 'RESTRICTED':
        return getRestrictedTierMessage(displayName)
      case 'CAUTION':
        return getCautionTierMessage(displayName)
      case 'NORMAL':
      default:
        return null // No message needed when everything is normal
    }
  }, [tier, status, displayName])

  // In compact mode, only show badge for non-Normal tiers
  if (compact) {
    if (tier === 'NORMAL') return null
    return <TierBadge tier={tier} className={className} />
  }

  // In full mode, don't render anything when Normal and no deferred operations
  if (tier === 'NORMAL' && !message) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-all duration-300',
        config.containerClasses,
        className
      )}
      role="status"
      aria-live="polite"
    >
      <config.Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.iconClasses)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <TierBadge tier={tier} />
        </div>
        {message && (
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standalone Deferred Message Component
// ---------------------------------------------------------------------------

export interface DeferredOperationMessageProps {
  /** Account display name */
  accountName: string
  /** Operation that was deferred (e.g., "ANALYTICS_REFRESH") */
  operation: string
  /** Estimated minutes until retry */
  estimatedRetryMinutes: number
  /** Optional className */
  className?: string
}

/**
 * Standalone component for displaying a single deferred operation message.
 * Useful when you need to show a deferred notification outside the main indicator.
 *
 * Requirement 8.6: plain-language message with estimated retry time.
 */
export function DeferredOperationMessage({
  accountName,
  operation,
  estimatedRetryMinutes,
  className,
}: DeferredOperationMessageProps) {
  const message = getDeferredOperationMessage(
    accountName,
    operation,
    estimatedRetryMinutes
  )

  if (!message) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-300">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Critical Tier Block Message Component
// ---------------------------------------------------------------------------

export interface CriticalTierBlockMessageProps {
  /** Account display name */
  accountName: string
  /** Minutes until access is regained */
  estimatedMinutesToRegainAccess: number
  /** Optional className */
  className?: string
}

/**
 * Standalone component for showing a message when a Critical tier prevents user action.
 * Requirement 8.7: explain without jargon, provide estimated wait time.
 */
export function CriticalTierBlockMessage({
  accountName,
  estimatedMinutesToRegainAccess,
  className,
}: CriticalTierBlockMessageProps) {
  const message = getCriticalTierMessage(accountName, estimatedMinutesToRegainAccess)

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-800/40 dark:bg-rose-900/20 p-4',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-rose-800 dark:text-rose-300 mb-1">
          Temporarily paused
        </p>
        <p className="text-sm text-rose-700 dark:text-rose-400 leading-relaxed">
          {message}
        </p>
        {estimatedMinutesToRegainAccess > 0 && (
          <p className="text-xs text-rose-600/70 dark:text-rose-400/60 mt-2">
            Estimated wait: {formatMinutesEstimate(estimatedMinutesToRegainAccess)}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default TierStatusIndicator

// Export helpers for testing
export { formatOperationName, formatMinutesEstimate, getDeferredOperationMessage, getCriticalTierMessage }
