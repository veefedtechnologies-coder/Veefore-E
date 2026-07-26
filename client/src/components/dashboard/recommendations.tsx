import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MapPin, Image, Search, Clock, Calendar, Video, Hash, Users,
  Heart, MessageCircle, TrendingUp, Target, Sparkles, RefreshCw
} from 'lucide-react'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { useGrowthRecommendations, type GrowthRecommendation } from '@/hooks/useGrowthRecommendations'

// Map the AI-provided icon keys to real lucide icons. Keep in sync with the
// `allowedIcons` list in AIServiceManager.generateGrowthRecommendations.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  calendar: Calendar,
  image: Image,
  video: Video,
  hashtag: Hash,
  search: Search,
  users: Users,
  heart: Heart,
  message: MessageCircle,
  trending: TrendingUp,
  target: Target,
  sparkles: Sparkles,
  location: MapPin,
}

// Accent colour per icon so cards stay visually varied (same palette as before).
const ICON_COLORS: Record<string, string> = {
  clock: 'text-blue-600',
  calendar: 'text-blue-600',
  image: 'text-purple-600',
  video: 'text-pink-600',
  hashtag: 'text-indigo-600',
  search: 'text-green-600',
  users: 'text-cyan-600',
  heart: 'text-rose-600',
  message: 'text-amber-600',
  trending: 'text-emerald-600',
  target: 'text-orange-600',
  sparkles: 'text-violet-600',
  location: 'text-blue-600',
}

function RecommendationSkeleton() {
  return (
    <div className="flex items-start space-x-5 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-blue-50/30 dark:from-gray-700 dark:to-blue-900/30">
      <Skeleton className="w-12 h-12 flex-shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}

export function RecommendationsSkeleton() {
  return (
    <Card data-testid="recommendations-skeleton" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-6">
        {[1, 2, 3].map((i) => (
          <RecommendationSkeleton key={i} />
        ))}
      </CardContent>
    </Card>
  )
}

interface RecommendationsProps {
  isLoading?: boolean
}

export function Recommendations({ isLoading: externalLoading }: RecommendationsProps = {}) {
  const { currentWorkspace } = useCurrentWorkspace()
  const { validAccounts, isLoading: socialLoading } = useSocialAccounts(currentWorkspace?.id)
  const hasAccount = validAccounts.length > 0

  // Don't fetch recommendations or burn AI tokens if no social account is connected.
  // The AI has nothing real to analyse — followers=0, posts=0, no analytics.
  const { recommendations, isLoading, isFetching, isError, refetch } = useGrowthRecommendations(
    hasAccount ? currentWorkspace?.id : undefined
  )

  // While we're still figuring out if an account is connected, show skeleton.
  if (socialLoading) return <RecommendationsSkeleton />

  // No connected account → show a clear call-to-action instead of empty/fake recs.
  if (!hasAccount) {
    return (
      <Card data-testid="recommendations" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Your recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-center py-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-base font-semibold text-gray-800 dark:text-gray-200">Connect an account first</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              AI recommendations are powered by your real follower trends, post engagement, and audience insights.
              Connect your Instagram account to unlock personalised growth advice.
            </p>
            <a
              href="/settings?tab=social"
              className="inline-flex items-center gap-2 mt-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-4 py-2 rounded-xl transition-all"
            >
              Connect your account
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show skeleton while the AI analyses real account data.
  if (externalLoading || ((isLoading || isFetching) && recommendations.length === 0)) {
    return <RecommendationsSkeleton />
  }

  // If the AI genuinely couldn't produce recommendations, show a clean retry
  // state instead of fabricated/hardcoded advice.
  if (isError || recommendations.length === 0) {
    return (
      <Card data-testid="recommendations" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Your recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-center py-8 space-y-3">
            <Sparkles className="w-8 h-8 text-blue-500" />
            <p className="text-gray-600 dark:text-gray-400 max-w-sm">
              We couldn't generate growth recommendations right now. Connect an account and post some content so our AI has data to analyze.
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="recommendations" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Your recommendations</CardTitle>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
          aria-label="Refresh recommendations"
          title="Refresh recommendations"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </CardHeader>
      <CardContent className="space-y-6">
        {recommendations.map((rec: GrowthRecommendation, index: number) => {
          const Icon = ICONS[rec.icon] || Sparkles
          const color = ICON_COLORS[rec.icon] || 'text-blue-600'
          // Keep the original visual rhythm: highlight every second card with the
          // blue→purple gradient like the reference UI.
          const isHighlighted = index % 2 === 1
          return (
            <div
              key={index}
              className={`flex items-start space-x-5 p-4 rounded-2xl transition-all duration-300 group cursor-pointer ${
                isHighlighted
                  ? 'bg-gradient-to-r from-blue-50 to-purple-50/60 dark:from-blue-900/40 dark:to-purple-900/40 hover:from-blue-100 hover:to-purple-100/70 dark:hover:from-blue-900/60 dark:hover:to-purple-900/60'
                  : 'bg-gradient-to-r from-gray-50 to-blue-50/30 dark:from-gray-700 dark:to-blue-900/30 hover:from-blue-50 hover:to-purple-50/50 dark:hover:from-blue-900/50 dark:hover:to-purple-900/50'
              }`}
            >
              <div className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-700 ${color} dark:text-blue-400`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className={`font-bold mb-2 text-lg transition-colors duration-300 ${
                  isHighlighted
                    ? 'text-blue-700 dark:text-blue-400'
                    : 'text-gray-900 dark:text-gray-100 group-hover:text-blue-700 dark:group-hover:text-blue-400'
                }`}>
                  {rec.title}
                </h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{rec.description}</p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
