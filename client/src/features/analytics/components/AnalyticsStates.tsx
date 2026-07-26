/**
 * AnalyticsStates — reusable non-data UI states for analytics pages.
 *
 * Every analytics page must handle loading, empty, error, and (for Phase 1)
 * "coming soon" states rather than a blank screen (CODING_RULES Rule 13,
 * 03-design-system.md Ch 11 Widget States, 04-dashboard-architecture.md Ch 8
 * Empty States). These primitives are shared so no page reinvents them.
 */

import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Compass, Inbox, Rocket, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StateShellProps {
  icon: LucideIcon
  title: string
  message: string
  iconClassName?: string
  children?: React.ReactNode
}

/** Shared centered layout for the messaging states below. */
function StateShell({ icon: Icon, title, message, iconClassName, children }: StateShellProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/40 px-6 py-16 text-center"
    >
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
          iconClassName ?? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        )}
      >
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-600 dark:text-gray-400">{message}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}

interface ComingSoonStateProps {
  /** Name of the destination, e.g. "Audience Growth". */
  featureName: string
  message?: string
}

/**
 * Phase 1 foundation placeholder shown for navigation destinations whose data
 * experience is scheduled for a later phase. Never shows fabricated analytics.
 */
export function AnalyticsComingSoon({ featureName, message }: ComingSoonStateProps) {
  return (
    <StateShell
      icon={Rocket}
      iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
      title={`${featureName} is coming soon`}
      message={
        message ??
        'This analytics experience is part of the Veefore Analytics rollout and will light up here once its data pipeline and widgets ship.'
      }
    />
  )
}

interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
}

/** Generic empty state (no data / nothing to show yet). */
export function AnalyticsEmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <StateShell
      icon={Inbox}
      iconClassName="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
      title={title ?? 'Nothing to show yet'}
      message={message ?? 'There is no data available for the selected filters.'}
    >
      {action}
    </StateShell>
  )
}

interface NoWorkspaceStateProps {
  message?: string
}

/** Shown when there is no active workspace to scope analytics to. */
export function AnalyticsNoWorkspace({ message }: NoWorkspaceStateProps) {
  return (
    <StateShell
      icon={Compass}
      iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
      title="Select a workspace"
      message={
        message ??
        'Analytics is scoped to a workspace. Choose or create a workspace to view its analytics.'
      }
    />
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

/** Generic error state with an optional retry action. */
export function AnalyticsErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <StateShell
      icon={AlertTriangle}
      iconClassName="bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
      title={title ?? 'Something went wrong'}
      message={message ?? 'We could not load this analytics view. Please try again.'}
    >
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </StateShell>
  )
}

/**
 * Generic loading skeleton for an analytics page body — a KPI-card strip plus
 * two chart placeholders, matching the documented dashboard section order.
 */
export function AnalyticsLoadingState() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-28 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton variant="chart" className="h-64 w-full" />
        <Skeleton variant="chart" className="h-64 w-full" />
      </div>
    </div>
  )
}

interface UpgradeStateProps {
  /** Feature/section name shown in the heading, e.g. "Audience Insights". */
  featureName: string
  /** Minimum plan that unlocks it, e.g. "Creator" or "Pro". */
  requiredPlan: string
  message?: string
}

/**
 * Upgrade prompt shown when the current plan doesn't include an analytics
 * section (cross-platform analytics, audience insights, content performance,
 * AI analytics insights, custom dashboards). Mirrors the server entitlement.
 */
export function AnalyticsUpgradeState({ featureName, requiredPlan, message }: UpgradeStateProps) {
  return (
    <StateShell
      icon={Lock}
      iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
      title={`${featureName} is a ${requiredPlan} feature`}
      message={
        message ??
        `Upgrade to ${requiredPlan} to unlock ${featureName.toLowerCase()} and get deeper insight into your performance.`
      }
    >
      <Button onClick={() => { window.location.href = '/settings/billing' }}>
        Upgrade to {requiredPlan}
      </Button>
    </StateShell>
  )
}
