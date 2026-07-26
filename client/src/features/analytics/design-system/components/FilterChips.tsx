/**
 * FilterChips — shows the currently active filters as removable chips so users
 * always see what is applied (03-design-system.md Ch 10; 04-dashboard-
 * architecture.md Ch 5 "Active filters are always visible").
 */

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS } from '../tokens'

export interface FilterChip {
  id: string
  label: string
  onRemove: () => void
}

interface FilterChipsProps {
  chips: FilterChip[]
  className?: string
}

export function FilterChips({ chips, className }: FilterChipsProps) {
  if (chips.length === 0) return null

  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)}>
      {chips.map((chip) => (
        <li key={chip.id}>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove filter ${chip.label}`}
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-800/50',
                FOCUS_RING_CLASS
              )}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
