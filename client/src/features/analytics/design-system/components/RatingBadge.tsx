/**
 * RatingBadge — shows a metric's qualitative rating vs. its benchmark
 * (Excellent / Good / Average / Poor / Critical). Colour-independent text label
 * ensures it is not conveyed by colour alone (WCAG; CODING_RULES Rule 14).
 *
 * Ratings require benchmark ranges which are pending specification
 * (OPEN_SPEC_ITEMS ASI-003); this component renders whatever rating it is given.
 */

import { cn } from '@/lib/utils'

import { RATING_BADGE, RATING_LABEL } from '../tokens'
import type { RatingBand } from '../types'

interface RatingBadgeProps {
  rating: RatingBand
  className?: string
}

export function RatingBadge({ rating, className }: RatingBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        RATING_BADGE[rating],
        className
      )}
    >
      {RATING_LABEL[rating]}
    </span>
  )
}
