/**
 * AnalyticsBreadcrumb — renders the location trail for the current analytics
 * page (e.g. Analytics › Audience › Growth).
 *
 * Docs: 01-product-foundation.md (Ch 5 Navigation Behavior — breadcrumb),
 * 06-dashboard-specifications.md (Ch 1 — Breadcrumb).
 */

import { Fragment } from 'react'
import { useLocation } from 'wouter'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { AnalyticsBreadcrumbEntry } from '../types'

interface AnalyticsBreadcrumbProps {
  entries: AnalyticsBreadcrumbEntry[]
  className?: string
}

export function AnalyticsBreadcrumb({ entries, className }: AnalyticsBreadcrumbProps) {
  const [, setLocation] = useLocation()

  if (entries.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1
          return (
            <Fragment key={`${entry.label}-${index}`}>
              <li className="flex items-center">
                {entry.path && !isLast ? (
                  <a
                    href={entry.path}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      setLocation(entry.path as string)
                    }}
                    className="rounded transition-colors hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {entry.label}
                  </a>
                ) : (
                  <span
                    className={cn(isLast && 'font-medium text-gray-900 dark:text-gray-100')}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {entry.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
