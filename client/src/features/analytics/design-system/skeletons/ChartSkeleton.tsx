/**
 * ChartSkeleton — loading placeholder for a chart body (CODING_RULES Rule 13).
 */

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ChartSkeleton({ height = 288, className }: { height?: number; className?: string }) {
  return (
    <div className={cn('w-full', className)} style={{ height }} aria-hidden="true">
      <Skeleton variant="chart" className="h-full w-full" />
    </div>
  )
}
