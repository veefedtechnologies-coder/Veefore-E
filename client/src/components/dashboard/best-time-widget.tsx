import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, TrendingUp, Sparkles, ArrowRight, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocation } from 'wouter'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

export function BestTimeWidgetSkeleton() {
  return (
    <Card className="relative overflow-hidden border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl group">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Clock className="w-4 h-4 text-blue-500" />
            Optimal Posting Time
          </CardTitle>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* Main Stat Skeleton */}
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-10 md:h-12 w-32 mb-3" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Mini Stats Grid Skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
             <Skeleton className="h-3 w-20 mb-2" />
             <Skeleton className="h-6 w-12 mb-2" />
             <Skeleton className="h-2 w-16 mt-1" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
             <Skeleton className="h-3 w-16 mb-2" />
             <Skeleton className="h-6 w-16 mb-2" />
             <Skeleton className="h-2 w-20 mt-1" />
          </div>
        </div>

        {/* Action Button Skeleton */}
        <Skeleton className="h-10 w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

export function BestTimeWidget() {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { validAccounts, isLoading, isFetching } = useSocialAccounts(currentWorkspace?.id)

  if (isLoading) {
    return <BestTimeWidgetSkeleton />
  }

  // Find the first account that has the aiBestActiveTime data computed
  const accountWithTime = validAccounts.find((acc: any) => acc?.aiBestActiveTime)
  const bestTimeData = accountWithTime?.aiBestActiveTime

  if (!bestTimeData) {
    // If we are still fetching data in the background, continue showing the skeleton
    // to avoid briefly flashing the "Gathering Data" empty state
    if (isFetching) {
      return <BestTimeWidgetSkeleton />
    }
    
    return (
      <Card className="relative overflow-hidden border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl group">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
              <Clock className="w-4 h-4 text-blue-500" />
              Optimal Posting Time
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md uppercase tracking-wider">
              No Data
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center space-y-4 py-10">
          <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800/80 rounded-full flex items-center justify-center mb-2 border border-gray-100 dark:border-gray-700">
            <Activity className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Gathering Data</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[250px] mx-auto">
              We need a bit more data to calculate your optimal posting times. Keep posting!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { best_hour_label, billboard_day, status, usable_posts, confidence = 0, z_score = 0 } = bestTimeData

  return (
    <Card className="relative overflow-hidden border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl group">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Clock className="w-4 h-4 text-blue-500" />
            Optimal Posting Time
          </CardTitle>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            AI Model
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* Main Stat */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Peak Engagement</div>
            <div className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
              {best_hour_label}
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              {billboard_day} Window
            </div>
          </div>
        </div>

        {/* Mini Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
             <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">AI Confidence</div>
             <div className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
               {Math.round(confidence * 100)}%
             </div>
             <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Z-Score: {Number(z_score).toFixed(2)}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
             <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Data Points</div>
             <div className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
               {usable_posts} Posts
             </div>
             <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">Strong Signals</div>
          </div>
        </div>

        {/* Action Button */}
        <Button 
          onClick={() => setLocation('/best-time')}
          variant="outline"
          className="w-full justify-between group border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          View Full Breakdown
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100 group-hover:translate-x-1 transition-all" />
        </Button>
      </CardContent>
    </Card>
  )
}
