/**
 * FilterBarSkeleton — loading placeholder for the global filter bar
 * (CODING_RULES Rule 13).
 */

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { SURFACE_CLASS } from '../tokens'

export function FilterBarSkeleton({ controls = 4, className }: { controls?: number; className?: string }) {
  return (
    <div className={cn(SURFACE_CLASS, 'flex flex-wrap items-center gap-3 p-4', className)} aria-hidden="true">
      {Array.from({ length: controls }).map((_, i) => (
        <Skeleton key={i} variant="button" className="h-9 w-36" />
      ))}
    </div>
  )
}
