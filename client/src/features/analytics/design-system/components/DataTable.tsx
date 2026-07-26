/**
 * DataTable — the standard enterprise analytics table
 * (04-dashboard-architecture.md Ch 7). Sticky header, sortable columns
 * (client-side by default, or controlled for server-side sorting), loading and
 * empty states, keyboard-accessible sort controls, and row drill-down.
 *
 * Column resizing, multi-sort, and virtualization are documented for later
 * phases (05-widget-library Ch 17); this is the accessible foundation.
 */

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS, SURFACE_CLASS } from '../tokens'
import type { SortDirection, SortState, TableColumn } from '../types'
import { TableSkeleton } from '../skeletons/TableSkeleton'

interface DataTableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  /** Stable row id extractor (used as React key and for row-click callbacks). */
  getRowId: (row: T) => string
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
  /** Controlled sort state (server-side). Omit for internal client-side sorting. */
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  /** Accessible table caption. */
  caption?: string
  className?: string
}

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading,
  emptyMessage,
  onRowClick,
  sort,
  onSortChange,
  caption,
  className,
}: DataTableProps<T>) {
  // Internal sort used only when the table is uncontrolled.
  const [internalSort, setInternalSort] = useState<SortState | undefined>(undefined)
  const activeSort = sort ?? internalSort
  const isControlled = sort !== undefined || typeof onSortChange === 'function'

  const handleSort = (columnId: string) => {
    const nextDirection: SortDirection =
      activeSort?.columnId === columnId && activeSort.direction === 'asc' ? 'desc' : 'asc'
    const next: SortState = { columnId, direction: nextDirection }
    if (isControlled) onSortChange?.(next)
    else setInternalSort(next)
  }

  const sortedRows = useMemo(() => {
    // Controlled tables are sorted by the server; render as-is.
    if (isControlled || !activeSort) return rows
    const col = columns.find((c) => c.id === activeSort.columnId)
    if (!col) return rows
    const dir = activeSort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.accessor(a)
      const bv = col.accessor(b)
      if (av === bv) return 0
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, columns, activeSort, isControlled])

  if (isLoading) {
    return (
      <div className={cn(SURFACE_CLASS, 'p-5', className)}>
        <TableSkeleton columns={columns.length} />
      </div>
    )
  }

  return (
    <div className={cn(SURFACE_CLASS, 'overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => {
                const sortable = col.sortable !== false
                const isSorted = activeSort?.columnId === col.id
                const ariaSort = isSorted
                  ? activeSort?.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={sortable ? ariaSort : undefined}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'sticky top-0 z-10 bg-gray-50 px-4 py-3 font-semibold text-gray-600 dark:bg-gray-900/60 dark:text-gray-300',
                      alignClass[col.align ?? 'left']
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded hover:text-gray-900 dark:hover:text-gray-100',
                          col.align === 'right' && 'flex-row-reverse',
                          FOCUS_RING_CLASS
                        )}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          activeSort?.direction === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage ?? 'No results found.'}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const id = getRowId(row)
                const clickable = typeof onRowClick === 'function'
                return (
                  <tr
                    key={id}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onRowClick?.(row)
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                    className={cn(
                      'border-b border-gray-100 last:border-0 dark:border-gray-700/60',
                      clickable &&
                        cn(
                          'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40',
                          FOCUS_RING_CLASS
                        )
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          'px-4 py-3 text-gray-700 dark:text-gray-200',
                          alignClass[col.align ?? 'left']
                        )}
                      >
                        {col.cell ? col.cell(row) : (col.accessor(row) ?? '—')}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
