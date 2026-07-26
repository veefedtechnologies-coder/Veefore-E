/**
 * FilterMultiSelect — a multi-select analytics filter built on the shared
 * DropdownMenu checkbox items (04-dashboard-architecture.md Ch 5). Used for
 * multi-choice filters like content types, tags, or platforms.
 */

import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS } from '../tokens'
import type { FilterOption } from '../types'

interface FilterMultiSelectProps {
  label: string
  options: FilterOption[]
  /** Currently selected values. */
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}

export function FilterMultiSelect({
  label,
  options,
  value,
  onChange,
  className,
}: FilterMultiSelectProps) {
  const toggle = (optionValue: string, checked: boolean) => {
    onChange(checked ? [...value, optionValue] : value.filter((v) => v !== optionValue))
  }

  const summary =
    value.length === 0
      ? 'All'
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? '1 selected'
        : `${value.length} selected`

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="sr-only" id={`ms-${label}`}>
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-labelledby={`ms-${label}`}
          className={cn(
            'inline-flex h-9 min-w-[9rem] items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
            FOCUS_RING_CLASS
          )}
        >
          <span className="truncate">
            <span className="text-gray-500 dark:text-gray-400">{label}: </span>
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={value.includes(opt.value)}
              onCheckedChange={(checked) => toggle(opt.value, checked)}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
