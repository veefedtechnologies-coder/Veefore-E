/**
 * MetricUnavailableLabel — displayed in place of a metric value whenever
 * `CapabilityGuard.getMetricSupport(platform, metricKey)` returns `'NONE'`.
 *
 * The label renders "Not supported on [Platform]" in a clearly distinct,
 * muted style with an info icon so it is visually differentiated from real
 * metric values and from loading / error states.
 *
 * Rules:
 *  - NEVER rendered alongside a numeric value — it entirely replaces the cell.
 *  - NEVER shows a zero, dash, or blank when support is NONE (Requirement 6.5).
 *  - The `platform` prop drives only the human-readable name in the message;
 *    the caller is responsible for consulting CapabilityGuard before rendering
 *    this component.
 *
 * Requirements: 6.5
 */

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlatformId } from '@platform-registry/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export interface MetricUnavailableLabelProps {
  /**
   * The platform for which the metric is unsupported.
   * Used to compose the "Not supported on [Platform]" message.
   */
  platform: PlatformId
  /**
   * Optional extra CSS classes applied to the wrapper element.
   * Use to adjust sizing or spacing in different layout contexts.
   */
  className?: string
  /**
   * When `true`, renders a compact inline variant suitable for use inside
   * narrow cells such as PlatformBreakdownRows.
   * Defaults to `false` (standard card-level size).
   */
  compact?: boolean
}

/**
 * Renders a "Not supported on [Platform]" label with a muted style and an
 * info icon. Used wherever `CapabilityGuard.getMetricSupport` returns `'NONE'`
 * to prevent zero values or blank cells (Requirement 6.5).
 *
 * @example — standard (KpiCard level):
 * ```tsx
 * <MetricUnavailableLabel platform="facebook" />
 * // → "ℹ Not supported on Facebook"
 * ```
 *
 * @example — compact (PlatformBreakdownRows):
 * ```tsx
 * <MetricUnavailableLabel platform="instagram" compact />
 * ```
 */
export function MetricUnavailableLabel({
  platform,
  className,
  compact = false,
}: MetricUnavailableLabelProps) {
  const label = `Not supported on ${platformDisplayName(platform)}`

  if (compact) {
    // Compact inline variant — used inside PlatformBreakdownRows where space is tight.
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 italic',
          className,
        )}
        title={label}
        aria-label={label}
      >
        <Info
          className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <span>{label}</span>
      </span>
    )
  }

  // Standard variant — replaces the metric value inside a KpiCard.
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1.5',
        'dark:bg-gray-700/40',
        className,
      )}
      role="note"
      aria-label={label}
    >
      <Info
        className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      />
      <span className="text-xs font-normal text-gray-400 dark:text-gray-500 italic">{label}</span>
    </div>
  )
}
