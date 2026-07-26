/**
 * DataUnavailableLabel — inline indicator shown when a specific metric's data
 * could not be fetched due to a partial failure.
 *
 * Renders the text "Data unavailable" with an optional tooltip that surfaces
 * the human-readable reason for the failure. This satisfies the per-metric
 * unavailability requirement: successfully fetched metrics continue to display
 * normally while only the failed metric shows this label.
 *
 * Used by `PlatformBreakdownRows` when a `PlatformContribution` carries an
 * `unavailableReason` field.  Also exported for direct use in analytics tables
 * and the report engine preview (Requirements 6.8, 9.7).
 *
 * Accessibility: the `<abbr>` title provides the tooltip for non-pointer
 * devices; the `aria-label` on the wrapping span ensures screen readers
 * announce the reason when present.
 *
 * Requirements: 6.8, 9.7
 */

import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DataUnavailableLabelProps {
  /**
   * Optional human-readable reason for the metric being unavailable.
   * When provided it is shown as a native tooltip via the `title` attribute and
   * included in the accessible label.  When omitted, only "Data unavailable" is
   * communicated.
   */
  reason?: string
  /** Additional CSS classes for layout overrides. */
  className?: string
}

/**
 * Renders "Data unavailable" with an optional tooltip showing `reason`.
 *
 * Intentionally lightweight — no Radix/Shadcn tooltip dependency so that the
 * component can be used in report-engine preview contexts where the full design
 * system may not be mounted.  The native `title` attribute provides the tooltip;
 * this keeps the bundle impact zero.
 */
export function DataUnavailableLabel({ reason, className }: DataUnavailableLabelProps) {
  const label = 'Data unavailable'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400',
        className,
      )}
      // Include the reason in the accessible label so assistive technologies
      // announce the full context, not just "Data unavailable".
      aria-label={reason ? `${label}: ${reason}` : label}
      // Native tooltip — works on all pointer devices without JS overhead.
      title={reason}
    >
      <AlertCircle
        className="h-3 w-3 flex-shrink-0"
        aria-hidden="true"
        focusable={false}
      />
      {/* Use <abbr> when a reason is available so that the dotted underline
          gives a visual affordance that more information is accessible on hover. */}
      {reason ? (
        <abbr title={reason} className="cursor-help no-underline">
          {label}
        </abbr>
      ) : (
        <span>{label}</span>
      )}
    </span>
  )
}
