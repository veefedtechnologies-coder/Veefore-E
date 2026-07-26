/**
 * ComparisonUnavailableNotice — shown when a comparison was requested but the
 * previous period predates the platform's ~24-month data retention, so no
 * period-over-period delta can be computed. Mirrors Hootsuite's behaviour of
 * informing the user rather than silently showing nothing. Genuine, not
 * fabricated (CODING_RULES Rule 16): we surface the limitation instead of
 * inventing a comparison.
 */

import { Info } from 'lucide-react'

export function ComparisonUnavailableNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        Comparison isn’t available for this range — the previous period is older than Instagram’s
        ~24-month data window. It will appear automatically as your stored history grows.
      </span>
    </div>
  )
}
