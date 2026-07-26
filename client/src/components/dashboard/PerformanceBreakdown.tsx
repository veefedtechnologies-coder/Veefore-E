import { ReactNode } from 'react'
import { TrendingUp, Sparkles, MessageCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

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

interface TopPerformerData {
  title?: string
  type?: string
  platform?: string
  likes: number
  comments: number
  shares: number
  saves: number
  views: number
  reach: number
  engagement: number
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
  // Real period-scoped data from the backend (optional — graceful fallback to derived values)
  overviewData?: {
    posts: { current: number; previous: number; changePercent: number; isPositive: boolean }
    contentScore: { current: number; previous: number; changePercent: number; isPositive: boolean; rating: string }
    engagement: { rate: number; changePercent: number; isPositive: boolean }
    topPerformer: TopPerformerData | null
  } | null
  overviewLoading?: boolean
}

function BreakdownSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl p-4 bg-gray-100 dark:bg-gray-800">
          <Skeleton className="h-4 w-28 mb-3 rounded" />
          <Skeleton className="h-8 w-20 mb-2 rounded" />
          <Skeleton className="h-3 w-full rounded mb-1" />
          <Skeleton className="h-2 w-full rounded" />
        </div>
      ))}
    </div>
  )
}

export function PerformanceBreakdown({
  connectedPlatforms,
  contentScore: derivedContentScore,
  avgEngagement,
  totalPosts,
  selectedPeriod,
  growthPercentages,
  formatNumber,
  overviewData,
  overviewLoading,
}: PerformanceBreakdownProps) {
  if (overviewLoading) return <BreakdownSkeleton />

  // ── Content Score ───────────────────────────────────────────────────────
  // Use server-computed score when available; fall back to client-derived score.
  const csScore = overviewData?.contentScore.current ?? derivedContentScore.score
  const csRating = overviewData?.contentScore.rating ?? derivedContentScore.rating
  const csChangePct = overviewData?.contentScore.changePercent ?? 0
  const csChangePositive = overviewData?.contentScore.isPositive ?? true

  // ── Post Frequency ──────────────────────────────────────────────────────
  // Use server-computed period-scoped post count when available, else fall back
  // to the lifetime totalPosts value (which is all the client currently has).
  const periodPostCount = overviewData?.posts.current ?? totalPosts
  const postChangePct = overviewData?.posts.changePercent ?? parseFloat(growthPercentages.posts.value)
  const postChangePositive = overviewData?.posts.isPositive ?? growthPercentages.posts.isPositive

  // ── Top Performer ───────────────────────────────────────────────────────
  // Use the highest-engagement post from the server if available; otherwise show
  // the first connected platform (legacy behaviour).
  const topPost = overviewData?.topPerformer ?? null
  const topEngRate = overviewData?.engagement.rate ?? avgEngagement
  // Engagement bar: clamp 0–100% (avg eng rates rarely exceed 20%, so scale ×5)
  const engBarWidth = `${Math.min(100, topEngRate * 5)}%`

  const periodLabel = selectedPeriod === 'day' ? 'today' : selectedPeriod === 'week' ? 'this week' : 'this month'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* ── Top Performer ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Performer</h5>
          <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>

        {topPost ? (
          <>
            <div className="flex items-center space-x-2 mb-2">
              <div className="text-sm font-bold text-blue-600 dark:text-blue-400 truncate leading-tight">
                {topPost.title ? topPost.title.slice(0, 40) : (topPost.type || 'Post')}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Engagements</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {formatNumber(topPost.engagement)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">
                  {selectedPeriod === 'day' ? 'Today\'s' : selectedPeriod === 'week' ? 'This week\'s' : 'This month\'s'} best
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400 capitalize">
                  {topPost.type || 'post'}
                </span>
              </div>
              <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: topPost.reach > 0 ? `${Math.min(100, (topPost.engagement / Math.max(topPost.reach, 1)) * 500)}%` : '40%' }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center space-x-2 mb-2">
              {connectedPlatforms[0] && (
                <>
                  <span className="text-lg">{connectedPlatforms[0].logo}</span>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {connectedPlatforms[0].name}
                  </div>
                </>
              )}
              {!connectedPlatforms[0] && (
                <div className="text-sm text-gray-400 dark:text-gray-500">No platform connected</div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Engagement Rate</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{topEngRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: engBarWidth }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Content Score ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Content Score</h5>
          <div className="flex items-center space-x-2">
            {csChangePct !== 0 && (
              <div className={`flex items-center text-xs font-semibold ${
                csChangePositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {csChangePositive
                  ? <ArrowUpRight className="w-3 h-3 mr-1" />
                  : <ArrowDownRight className="w-3 h-3 mr-1" />}
                <span>{csChangePct >= 0 ? '+' : ''}{csChangePct.toFixed(1)}%</span>
              </div>
            )}
            <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
          {csScore.toFixed(1)}/10
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Quality Rating</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{csRating}</span>
          </div>
          <div className="w-full bg-white/60 dark:bg-gray-600/60 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${(csScore / 10) * 100}%` }}
            />
          </div>
          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-600">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Performance over {periodLabel}
            </div>
          </div>
        </div>
      </div>

      {/* ── Post Frequency ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Post Frequency</h5>
          <div className="flex items-center space-x-2">
            {(overviewData || growthPercentages.posts.value !== '+0.0%') && (
              <div className={`flex items-center text-xs font-semibold ${
                postChangePositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {postChangePositive
                  ? <ArrowUpRight className="w-3 h-3 mr-1" />
                  : <ArrowDownRight className="w-3 h-3 mr-1" />}
                <span>
                  {overviewData
                    ? `${postChangePct >= 0 ? '+' : ''}${postChangePct.toFixed(1)}%`
                    : growthPercentages.posts.value}
                </span>
              </div>
            )}
            <MessageCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-2">
          {periodPostCount}
        </div>
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
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, Math.max(5, (periodPostCount / 30) * 100))}%` }}
            />
          </div>
          <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-600">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Activity trends for {periodLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
