/**
 * ConfidenceBadge — displays an AI/forecast confidence level. Every AI output
 * must show a confidence level (CODING_RULES Rule 16; 11-ai-intelligence-engine
 * Ch 13). Colour is paired with a text label so it is never conveyed by colour
 * alone (WCAG; Rule 14).
 */

import { cn } from '@/lib/utils'

import { CONFIDENCE_SHORT } from './utils'
import type { ConfidenceLevel } from './types'

const CONFIDENCE_CLASS: Record<ConfidenceLevel, string> = {
  very_high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  high: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

interface ConfidenceBadgeProps {
  confidence: ConfidenceLevel
  className?: string
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        CONFIDENCE_CLASS[confidence],
        className
      )}
    >
      {CONFIDENCE_SHORT[confidence]} confidence
    </span>
  )
}
