/**
 * DataQualityBadge — labels a metric value as Verified / Calculated / Estimated /
 * Predicted, so users can distinguish facts from estimates and forecasts
 * (CODING_RULES Rule 16; 07-data-event-architecture.md Ch 9).
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { QUALITY_META } from '../tokens'
import type { DataQuality } from '../types'

interface DataQualityBadgeProps {
  quality: DataQuality
  className?: string
}

export function DataQualityBadge({ quality, className }: DataQualityBadgeProps) {
  const meta = QUALITY_META[quality]

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              meta.className,
              className
            )}
          >
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{meta.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
