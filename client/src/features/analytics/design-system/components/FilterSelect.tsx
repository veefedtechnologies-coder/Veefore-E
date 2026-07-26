/**
 * FilterSelect — a single-select analytics filter built on the shared Select
 * primitive (04-dashboard-architecture.md Ch 5 Filter Bar). Reused for platform,
 * account, and other single-choice filters.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type { FilterOption } from '../types'

interface FilterSelectProps {
  /** Accessible label (visually hidden if `showLabel` is false). */
  label: string
  options: FilterOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  showLabel?: boolean
  className?: string
  triggerClassName?: string
}

export function FilterSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  showLabel = false,
  className,
  triggerClassName,
}: FilterSelectProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        className={cn(
          'text-xs font-medium text-gray-500 dark:text-gray-400',
          !showLabel && 'sr-only'
        )}
      >
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className={cn(
            'h-9 min-w-[9rem] border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
