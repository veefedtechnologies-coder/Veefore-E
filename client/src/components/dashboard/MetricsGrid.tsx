import { Users, Heart, Eye, Share, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface GrowthData {
  value: string
  isPositive: boolean
}

interface MetricsGridProps {
  periodData: {
    followerTotal: number
    engagement: number
    reach: number
    posts: number
  }
  growthPercentages: {
    followers: GrowthData
    engagement: GrowthData
    reach: GrowthData
    posts: GrowthData
  }
  selectedPeriod: 'day' | 'week' | 'month'
  formatNumber: (num: number) => string
}

export function MetricsGrid({ periodData, growthPercentages, selectedPeriod, formatNumber }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-20">
          <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="relative z-10">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">{formatNumber(periodData.followerTotal)}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">Total Followers</div>
          <div className="flex items-center justify-between mb-2">
            <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5 mr-2">
              <div className="bg-blue-500 h-1.5 rounded-full w-3/4 transition-all duration-1000"></div>
            </div>
            <div className={`flex items-center text-xs font-semibold ${
              growthPercentages.followers.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {growthPercentages.followers.isPositive ? 
                <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                <ArrowDownRight className="w-3 h-3 mr-1" />
              }
              <span>{growthPercentages.followers.value}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-20">
          <Heart className="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
        <div className="relative z-10">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">{periodData.engagement.toFixed(1)}%</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">
            {selectedPeriod === 'day' ? 'Today\'s Engagement' : 
             selectedPeriod === 'week' ? 'Weekly Engagement' : 
             'Monthly Engagement'}
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5 mr-2">
              <div className="bg-green-500 h-1.5 rounded-full w-4/5 transition-all duration-1000"></div>
            </div>
            <div className={`flex items-center text-xs font-semibold ${
              growthPercentages.engagement.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {growthPercentages.engagement.isPositive ? 
                <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                <ArrowDownRight className="w-3 h-3 mr-1" />
              }
              <span>{growthPercentages.engagement.value}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-20">
          <Eye className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="relative z-10">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">{formatNumber(periodData.reach)}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">
            {selectedPeriod === 'day' ? 'Today\'s Reach' : 
             selectedPeriod === 'week' ? 'Weekly Reach' : 
             'Monthly Reach'}
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5 mr-2">
              <div className="bg-purple-500 h-1.5 rounded-full w-2/3 transition-all duration-1000"></div>
            </div>
            <div className={`flex items-center text-xs font-semibold ${
              growthPercentages.reach.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {growthPercentages.reach.isPositive ? 
                <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                <ArrowDownRight className="w-3 h-3 mr-1" />
              }
              <span>{growthPercentages.reach.value}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-20">
          <Share className="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="relative z-10">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-1">{periodData.posts}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">
            {selectedPeriod === 'day' ? 'Posts Today' : 
             selectedPeriod === 'week' ? 'Posts This Week' : 
             'Posts This Month'}
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5 mr-2">
              <div className="bg-orange-500 h-1.5 rounded-full w-5/6 transition-all duration-1000"></div>
            </div>
            <div className={`flex items-center text-xs font-semibold ${
              growthPercentages.posts.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {growthPercentages.posts.isPositive ? 
                <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                <ArrowDownRight className="w-3 h-3 mr-1" />
              }
              <span>{growthPercentages.posts.value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
