/**
 * FeatureLockedGate
 *
 * Wraps a page/section that requires a specific plan feature. When the user's
 * current plan does NOT include the feature, it renders a friendly "locked"
 * screen with an upgrade CTA instead of the children. When the plan DOES include
 * it (or while the subscription is still loading), it renders the children
 * normally.
 *
 * The server still enforces access on every API call — this is the client-side
 * UX layer so the user sees a clear locked state and upgrade path rather than a
 * broken page full of 403s.
 */

import React from 'react'
import { useLocation } from 'wouter'
import { Lock, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeatureAccess, type PlanFeatureKey } from '@/hooks/useFeatureAccess'

interface FeatureLockedGateProps {
  /** The plan feature required to view the children. */
  feature: PlanFeatureKey
  /** Human-readable feature name shown in the locked screen. */
  title: string
  /** Short description of what the feature does / why to upgrade. */
  description?: string
  /** Minimum plan name to display (e.g. "Creator", "Pro"). */
  requiredPlan?: string
  children: React.ReactNode
}

export function FeatureLockedGate({
  feature,
  title,
  description,
  requiredPlan,
  children,
}: FeatureLockedGateProps) {
  const { hasFeature, isLoading } = useFeatureAccess()
  const [, setLocation] = useLocation()

  // While loading, render children optimistically — the server still guards
  // every API call, so a brief flash can't leak data.
  if (isLoading || hasFeature(feature)) {
    return <>{children}</>
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div
        className={cn(
          'w-full max-w-md rounded-2xl bg-white dark:bg-gray-900',
          'border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden',
        )}
      >
        <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-5">
            <Lock className="w-8 h-8 text-indigo-500" />
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {title} is a {requiredPlan ?? 'paid'} feature
          </h2>

          {description && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {description}
            </p>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600 dark:text-green-400 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            Your existing data is safe — upgrade any time to unlock it.
          </div>

          <button
            onClick={() => setLocation('/settings/billing')}
            className={cn(
              'mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm',
              'hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg',
            )}
          >
            Upgrade to unlock {title}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default FeatureLockedGate
