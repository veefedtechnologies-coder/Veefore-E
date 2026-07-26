import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * EncryptionHealthSkeleton — Page_Skeleton for `pages/EncryptionHealth.tsx`
 * (the `/encryption-health` route, rendered inside the `DashboardLayout`
 * `<main className="… p-6 …">` Suspense region).
 *
 * Reproduces the real page slot pixel-for-pixel: the `max-w-3xl mx-auto`
 * wrapper containing a single `bg-white dark:bg-gray-800` card with an
 * icon + "Encryption Health" title header and a `space-y-2 text-sm` body of
 * key/value status lines (algorithm, key size, KDF iterations, rotation days,
 * rotation active, environment).
 *
 * The status body is fetched on mount and `unknown` during load, so only the
 * populated key/value variant is rendered (R9.2). Pure and presentational — no
 * data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.1, R5.1, R5.2, R5.3, R8.2, R8.3, R10.1).
 */
function EncryptionHealthSkeletonImpl() {
  return (
    <div data-testid="encryption-health-skeleton" className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Card header: icon + title */}
        <div className="p-6 pb-0">
          <div className="flex items-center space-x-2">
            <Skeleton variant="rectangle" className="w-5 h-5 rounded" />
            <Skeleton variant="text" className="h-5 w-40" />
          </div>
        </div>

        {/* Card body: 6 key/value status lines */}
        <div className="p-6 space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="text" className="h-4 w-48" />
          ))}
        </div>
      </div>
    </div>
  )
}

export const EncryptionHealthSkeleton = React.memo(EncryptionHealthSkeletonImpl)
EncryptionHealthSkeleton.displayName = 'EncryptionHealthSkeleton'
