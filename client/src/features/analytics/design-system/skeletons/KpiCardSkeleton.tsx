/**
 * KpiCardSkeleton — loading placeholder mirroring the KpiCard layout
 * (CODING_RULES Rule 13; 04-dashboard-architecture.md Ch 3 KPI states).
 */

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { SURFACE_CLASS } from '../tokens'

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(SURFACE_CLASS, 'p-5', className)} aria-hidden="true">
      <div className="flex items-start justify-between">
        <Skeleton variant="text" className="h-4 w-24" />
        <Skeleton variant="pill" className="h-5 w-16" />
      </div>
      <Skeleton variant="text" className="mt-4 h-8 w-28" />
      <div className="mt-3 flex items-center justify-between">
        <Skeleton variant="text" className="h-4 w-20" />
        <Skeleton variant="rectangle" className="h-10 w-24" />
      </div>
    </div>
  )
}
