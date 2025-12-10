import { ReactNode } from 'react'
import { TrendingUp, Sparkles, MessageCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface GrowthData {
  value: string
  isPositive: boolean
}

interface Platform {
  id: string
  name: string
  logo: ReactNode
  followers: number
  engagement: string
}

interface PerformanceBreakdownProps {
  connectedPlatforms: Platform[]
  contentScore: { score: number; rating: string }
  avgEngagement: number
  totalPosts: number
  selectedPeriod: 'day' | 'week' | 'month'
  growthPercentages: {
    posts: GrowthData
  }
  formatNumber: (num: number) => string
}

export function PerformanceBreakdown({
  connectedPlatforms,
  contentScore,
  avgEngagement,
  totalPosts,
  selectedPeriod,
  growthPercentages,
  formatNumber
}: PerformanceBreakdownProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Performer</h5>
          <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex items-center space-x-2 mb-2">
          {connectedPlatforms[0] && (
            <>
              <span className="text-lg">{connectedPlatforms[0].logo}</span>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{connectedPlatforms[0].name}</div>
            </>
          )}
          {!connectedPlatforms[0] && (
            <div className="text-sm text-gray-400 dark:text-gray-500">No platform connected</div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Engagement Rate</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{avgEngagement.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full w-5/6 transition-all duration-1000"></div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Content Score</h5>
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-xs font-semibold text-green-600 dark:text-green-400">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              <span>+85.0%</span>
            </div>
            <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">{contentScore.score.toFixed(1)}/10</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Quality Rating</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{contentScore.rating}</span>
          </div>
          <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
            <div 
              className="bg-green-500 h-1.5 rounded-full transition-all duration-1000" 
              style={{ width: `${(contentScore.score / 10) * 100}%` }}
            ></div>
          </div>
          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-600">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Performance over {selectedPeriod === 'day' ? 'today' : selectedPeriod === 'week' ? 'this week' : 'this month'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Post Frequency</h5>
          <div className="flex items-center space-x-2">
            <div className={`flex items-center text-xs font-semibold ${
              growthPercentages.posts.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {growthPercentages.posts.isPositive ? 
                <ArrowUpRight className="w-3 h-3 mr-1" /> : 
                <ArrowDownRight className="w-3 h-3 mr-1" />
              }
              <span>{growthPercentages.posts.value}</span>
            </div>
            <MessageCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-2">{totalPosts}</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">
              {selectedPeriod === 'day' ? 'Posts Today' : 
               selectedPeriod === 'week' ? 'Posts This Week' : 
               'Posts This Month'}
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {selectedPeriod === 'day' ? 'Daily' : selectedPeriod === 'week' ? 'Weekly' : 'Monthly'}
            </span>
          </div>
          <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
            <div className="bg-purple-500 h-1.5 rounded-full w-3/4 transition-all duration-1000"></div>
          </div>
          <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-600">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Activity trends for {selectedPeriod === 'day' ? 'today' : selectedPeriod === 'week' ? 'this week' : 'this month'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
