import { Users, Heart, Eye, Share, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface GrowthData {
  value: string
  isPositive: boolean
}

interface MetricsGridProps {
  periodData: {
    followerTotal: number
    followerGains: number
    likes: number
    reach: number
    views: number
  }
  growthPercentages: {
    followers: GrowthData
    likes: GrowthData
    reach: GrowthData
    views: GrowthData
  }
  selectedPeriod: 'day' | 'week' | 'month'
  formatNumber: (num: number) => string
  isLoading?: boolean
}

function SkeletonMetricGridCard() {
  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800/60 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <Skeleton className="h-3 w-24 mb-3 rounded" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <Skeleton className="w-10 h-10 rounded-lg" />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800/50 flex justify-between">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-3 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}

export function MetricsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <SkeletonMetricGridCard />
      <SkeletonMetricGridCard />
    </div>
  )
}

export function MetricsGrid({ periodData, growthPercentages, selectedPeriod, formatNumber, isLoading }: MetricsGridProps) {
  if (isLoading) {
    return <MetricsGridSkeleton />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Followers Card */}
      <div className="group relative bg-blue-50 dark:bg-gray-800 rounded-xl p-6 transition-all duration-300 hover:shadow-md border border-blue-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">
                {selectedPeriod === 'day' ? 'Today\'s New Followers' : 
                 selectedPeriod === 'week' ? 'Weekly New Followers' : 
                 'Monthly New Followers'}
              </div>
              <div className="text-4xl font-extrabold text-blue-900 dark:text-white tracking-tight">
                {periodData.followerGains > 0 ? '+' : ''}{formatNumber(periodData.followerGains)}
              </div>
            </div>
            <div className="p-3 bg-blue-200/50 dark:bg-blue-500/20 rounded-xl text-blue-700 dark:text-blue-400 shadow-sm border border-blue-300/50 dark:border-blue-400/30">
              <Users className="w-6 h-6" />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-500/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-800/70 dark:text-gray-400 font-medium">vs previous period</span>
              <div className={`flex items-center font-bold ${
                growthPercentages.followers.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {growthPercentages.followers.isPositive ? 
                  <ArrowUpRight className="w-4 h-4 mr-1" /> : 
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                }
                <span>{growthPercentages.followers.value}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Reach Card */}
      <div className="group relative bg-purple-50 dark:bg-gray-800 rounded-xl p-6 transition-all duration-300 hover:shadow-md border border-purple-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-400/20 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-2">
                {selectedPeriod === 'day' ? 'Today\'s Reach' : 
                 selectedPeriod === 'week' ? 'Weekly Reach' : 
                 'Monthly Reach'}
              </div>
              <div className="text-4xl font-extrabold text-purple-900 dark:text-white tracking-tight">
                {formatNumber(periodData.reach)}
              </div>
            </div>
            <div className="p-3 bg-purple-200/50 dark:bg-purple-500/20 rounded-xl text-purple-700 dark:text-purple-400 shadow-sm border border-purple-300/50 dark:border-purple-400/30">
              <Eye className="w-6 h-6" />
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-purple-200/50 dark:border-purple-500/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-purple-800/70 dark:text-gray-400 font-medium">vs previous period</span>
              <div className={`flex items-center font-bold ${
                growthPercentages.reach.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {growthPercentages.reach.isPositive ? 
                  <ArrowUpRight className="w-4 h-4 mr-1" /> : 
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                }
                <span>{growthPercentages.reach.value}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
