/**
 * DrillDownLink — a declarative, accessible link for progressive exploration
 * (03-design-system.md Ch 9). Renders a real anchor so modifier/middle clicks
 * open in a new tab, but performs client-side navigation on a plain click.
 *
 * Use for chart-point / table-row / KPI drill-downs that lead to a deeper view.
 */

import { useLocation } from 'wouter'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS } from '../../design-system/tokens'
import type { DrillDownTarget } from '../types'

interface DrillDownLinkProps {
  target: DrillDownTarget
  children: React.ReactNode
  /** Show a trailing drill-down arrow. Defaults to false. */
  showArrow?: boolean
  className?: string
}

export function DrillDownLink({ target, children, showArrow = false, className }: DrillDownLinkProps) {
  const [, setLocation] = useLocation()

  return (
    <a
      href={target.path}
      aria-label={target.label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        setLocation(target.path)
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded text-blue-600 hover:underline dark:text-blue-400',
        FOCUS_RING_CLASS,
        className
      )}
    >
      {children}
      {showArrow && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
    </a>
  )
}
