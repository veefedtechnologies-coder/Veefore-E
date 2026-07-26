import React from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * PerformanceScoreSkeleton — placeholder for the dashboard performance-score
 * widget (see `components/dashboard/performance-score.tsx`).
 *
 * Mirrors the real card layout pixel-for-pixel: the glassmorphism rounded-3xl
 * card, the header (title + trending icon chip and the period toggle + action
 * button), the gradient banner, the platform-avatar row, and the two-up metric
 * grid. Pure and presentational — no data, no effects.
 *
 * Spec: pixel-perfect-skeleton-loading (R4.2, R5.1, R5.2, R5.4, R10.2–R10.4).
 */
function MetricsGridSkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800/60 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <Skeleton variant="text" className="h-3 w-24 mb-3 rounded" />
            <Skeleton variant="text" className="h-8 w-20 rounded-lg" />
          </div>
          <Skeleton variant="rectangle" className="w-10 h-10 rounded-lg" />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800/50 flex justify-between">
          <Skeleton variant="text" className="h-3 w-28 rounded" />
          <Skeleton variant="text" className="h-3 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}

function PerformanceScoreSkeletonImpl() {
  return (
    <Card
      data-testid="performance-score-skeleton"
      className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0 rounded-3xl overflow-hidden"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div className="flex items-center space-x-3">
          <Skeleton variant="text" className="h-6 w-48" />
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <Skeleton variant="button" className="h-8 w-16 rounded-md mx-1" />
            <Skeleton variant="button" className="h-8 w-20 rounded-md mx-1" />
            <Skeleton variant="button" className="h-8 w-24 rounded-md mx-1" />
          </div>
          <Skeleton variant="button" className="h-9 w-28 rounded-xl" />
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Gradient banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex items-center space-x-3">
                <Skeleton variant="rectangle" className="w-10 h-10 rounded-lg bg-white/20" />
                <Skeleton variant="text" className="h-6 w-32 bg-white/20" />
              </div>
              <Skeleton variant="text" className="h-4 w-full max-w-md bg-white/20" />
              <Skeleton variant="text" className="h-4 w-3/4 bg-white/20" />
              <Skeleton variant="text" className="h-3 w-2/3 bg-white/20" />
            </div>
            <Skeleton variant="circle" className="w-6 h-6 rounded-full bg-white/20" />
          </div>
        </div>

        {/* Platform avatar row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Skeleton variant="text" className="h-6 w-40" />
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="avatar" className="w-8 h-8 rounded-full" />
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton variant="circle" className="w-2 h-2 rounded-full" />
            <Skeleton variant="text" className="h-4 w-16" />
          </div>
        </div>

        {/* Two stat cards (MetricsGrid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <MetricsGridSkeletonCard />
          <MetricsGridSkeletonCard />
        </div>
      </CardContent>
    </Card>
  )
}

export const PerformanceScoreSkeleton = React.memo(PerformanceScoreSkeletonImpl)
PerformanceScoreSkeleton.displayName = 'PerformanceScoreSkeleton'
