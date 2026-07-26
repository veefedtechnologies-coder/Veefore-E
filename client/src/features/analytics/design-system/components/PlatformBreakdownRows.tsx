/**
 * PlatformBreakdownRows — renders per-platform sub-rows inside a KpiCard.
 *
 * Displayed below the combined total when `platformSelection === 'all'` and a
 * `platformBreakdown` array is provided. Each row shows the platform's official
 * icon and its individual value.
 *
 * Rows where `supportLevel === 'NONE'` now render a "Not supported on [Platform]"
 * label via MetricUnavailableLabel — they are never silently skipped in All
 * Platforms mode (Requirement 6.5). This ensures the user always knows why a
 * platform slot shows no value.
 *
 * When a row carries an `unavailableReason` field, the metric fetch for that
 * platform partially failed. The row renders a "Data unavailable" label with a
 * reason tooltip instead of the numeric value. Successfully fetched rows are
 * unaffected — the entire platform section stays visible (Requirements 6.8, 9.7).
 *
 * Requirements: 5.4, 5.5, 5.6, 6.5, 6.8
 */

import { cn } from '@/lib/utils'
import { formatMetricValue } from '../format'
import type { MetricUnit } from '../types'
import type { PlatformContribution } from '../../widgets/types'
import type { PlatformId } from '@platform-registry/types'
import { DataUnavailableLabel } from './DataUnavailableLabel'
import { MetricUnavailableLabel } from './MetricUnavailableLabel'

// ---------------------------------------------------------------------------
// Platform icon mapping
// Each platform's icon is an SVG inline component so there is no runtime
// import of external assets — consistent with the existing design-system pattern.
// ---------------------------------------------------------------------------

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('h-3.5 w-3.5', className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* Instagram gradient-bordered camera icon */}
      <defs>
        <linearGradient id="ig-grad-kpi" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#ig-grad-kpi)" />
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="6.5" r="1" fill="white" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('h-3.5 w-3.5', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="24" height="24" rx="5" fill="#1877F2" />
      <path
        d="M16 8h-2a1 1 0 0 0-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2v3z"
        fill="white"
      />
    </svg>
  )
}

/** Generic fallback icon for future platforms. */
function GenericPlatformIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 text-[8px] font-bold text-gray-600 dark:text-gray-200',
        className,
      )}
      aria-hidden="true"
    >
      ?
    </span>
  )
}

/** Returns the appropriate platform icon component for a given platform ID. */
function PlatformIcon({ platform, className }: { platform: PlatformId; className?: string }) {
  if (platform === 'instagram') return <InstagramIcon className={className} />
  if (platform === 'facebook') return <FacebookIcon className={className} />
  return <GenericPlatformIcon className={className} />
}

/** Human-readable display name for a platform ID. */
function platformDisplayName(platform: PlatformId): string {
  const names: Partial<Record<PlatformId, string>> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    x: 'X',
    threads: 'Threads',
  }
  return names[platform] ?? platform
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PlatformBreakdownRowsProps {
  /**
   * List of platform contributions. Rows with `supportLevel === 'NONE'` are
   * now rendered with a MetricUnavailableLabel rather than silently skipped,
   * so the user sees "Not supported on [Platform]" in the All Platforms slot
   * (Requirement 6.5).
   */
  rows: PlatformContribution[]
  /** Unit used to format the per-platform value. */
  unit?: MetricUnit
}

/**
 * Renders platform sub-rows below a KpiCard's combined total.
 * Each row: platform icon + name on the left, value (or unavailability label) on the right.
 *
 * - `supportLevel === 'NONE'`: renders MetricUnavailableLabel ("Not supported on [Platform]")
 * - `unavailableReason` set: renders DataUnavailableLabel (partial fetch failure)
 * - Otherwise: renders the formatted numeric value (or "—" for null values)
 */
export function PlatformBreakdownRows({ rows, unit = 'count' }: PlatformBreakdownRowsProps) {
  if (rows.length === 0) return null

  return (
    <div
      className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-700/60"
      role="list"
      aria-label="Platform breakdown"
    >
      {rows.map((row) => (
        <div
          key={row.platform}
          className="flex items-center justify-between gap-2"
          role="listitem"
        >
          {/* Platform identifier: icon + label */}
          <div className="flex min-w-0 items-center gap-1.5">
            <PlatformIcon platform={row.platform} />
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">
              {platformDisplayName(row.platform)}
            </span>
          </div>

          {/* Value slot — three mutually exclusive states:
              1. NONE support: "Not supported on [Platform]" (Requirement 6.5)
              2. Partial fetch failure: "Data unavailable" with tooltip (Requirement 6.8)
              3. Normal: formatted numeric value or em-dash for null */}
          <span className="flex-shrink-0 text-xs font-medium text-gray-700 dark:text-gray-300">
            {row.supportLevel === 'NONE' ? (
              // Requirement 6.5: NONE-support metrics display this label in the
              // unsupported platform's slot — never a zero or empty cell.
              <MetricUnavailableLabel platform={row.platform} compact />
            ) : row.unavailableReason !== undefined ? (
              <DataUnavailableLabel reason={row.unavailableReason} />
            ) : row.value !== null && row.value !== undefined ? (
              formatMetricValue(row.value, unit)
            ) : (
              '—'
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
