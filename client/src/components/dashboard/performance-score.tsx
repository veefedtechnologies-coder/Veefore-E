import { useLocation } from 'wouter'
import { useState, useEffect } from 'react'
import { detectInvalidAccounts, getReconnectCopy, startReconnectFlow } from '@/lib/reconnect'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, Users, RefreshCw, Instagram, Facebook, Twitter, Linkedin, Youtube } from 'lucide-react'
import { usePerformanceData } from '@/hooks/usePerformanceData'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { useHistoricalData } from '@/hooks/useHistoricalData'
import { DataStory } from './DataStory'
import { MetricsGrid, MetricsGridSkeleton } from './MetricsGrid'
import { PlatformCard } from './PlatformCard'
import { PerformanceBreakdown } from './PerformanceBreakdown'

function TikTokIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" fill="none">
      <path d="M14 4v7.5c0 2.485-2.015 4.5-4.5 4.5S5 13.985 5 11.5c0-2.2 1.59-4.037 3.675-4.424" stroke="#111" strokeWidth="1.5"/>
      <path d="M14 4c.6 1.8 2.1 3.2 4 3.8v2.2c-1.9-.4-3.6-1.5-4-2.2V4z" fill="#FE2C55"/>
      <path d="M9.5 9.5c1.4 0 2.5 1.1 2.5 2.5 0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9c0-.3.05-.7.15-1" fill="#25F4EE"/>
    </svg>
  )
}

export function PerformanceScoreSkeleton() {
  return (
    <Card data-testid="performance-score-skeleton" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0 rounded-3xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-6 w-48" />
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <Skeleton className="h-8 w-16 rounded-md mx-1" />
            <Skeleton className="h-8 w-20 rounded-md mx-1" />
            <Skeleton className="h-8 w-24 rounded-md mx-1" />
          </div>
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex items-center space-x-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-white/20" />
                <Skeleton className="h-6 w-32 bg-white/20" />
              </div>
              <Skeleton className="h-4 w-full max-w-md bg-white/20" />
              <Skeleton className="h-4 w-3/4 bg-white/20" />
              <Skeleton className="h-3 w-2/3 bg-white/20" />
            </div>
            <Skeleton className="w-6 h-6 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-6 w-40" />
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="w-8 h-8 rounded-full" />
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <MetricsGridSkeleton />
      </CardContent>
    </Card>
  )
}

export function PerformanceScore() {
  const [, setLocation] = useLocation()
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('month')
  const workspaceData = useCurrentWorkspace()
  const { currentWorkspace, isReady, isLoading: workspaceLoading } = workspaceData || { currentWorkspace: undefined, isReady: false, isLoading: true }
  const [showDataStory, setShowDataStory] = useState(false)
  const [storyAnimation, setStoryAnimation] = useState(0)
  const [reconnectVisible, setReconnectVisible] = useState(true)
  const [isClosingReconnect, setIsClosingReconnect] = useState(false)

  const { analytics, isLoading: analyticsLoading } = usePerformanceData(currentWorkspace?.id)
  const { socialAccounts: socialAccountsArray, validAccounts, invalidAccounts } = useSocialAccounts(currentWorkspace?.id)
  const { historicalData } = useHistoricalData(currentWorkspace?.id, selectedPeriod)

  useEffect(() => {
    setShowDataStory(true)
    setStoryAnimation(prev => prev + 1)
  }, [selectedPeriod])

  const generateDataStory = (currentData: any) => {
    const followerCount = Number(currentData?.followers) || 4
    const engagement = Number(currentData?.engagement) || 0
    const reach = Number(currentData?.reach) || 135
    const posts = Number(currentData?.posts) || 15
    const period = currentData?.period || selectedPeriod

    const safeEngagementStr = engagement.toFixed(0)
    const safePostsPerDay = posts > 0 ? (posts / 30).toFixed(1) : '0.0'
    const safeAmplification = followerCount > 0 ? Math.round(reach / followerCount) : 0

    const stories = {
      day: {
        emoji: "⚡",
        title: "Right Now Mode",
        story: engagement > 100 
          ? `🔥 Your content is ON FIRE today! ${safeEngagementStr}% engagement means every post gets massive love`
          : `📊 Today's snapshot: ${followerCount} followers are watching. Time to drop that viral content!`,
        insight: posts > 0 ? "Peak activity detected! Your audience is most active right now." : "Perfect timing to post - your audience is waiting!",
        color: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600",
        textColor: "text-gray-100 dark:text-gray-200"
      },
      week: {
        emoji: "🎯", 
        title: "Weekly Pulse",
        story: reach > followerCount 
          ? `🚀 VIRAL ALERT! You reached ${reach} people with just ${followerCount} followers. That's ${safeAmplification}x amplification!`
          : `📈 This week: ${posts} posts, ${followerCount} loyal followers, building your empire one post at a time`,
        insight: "Weekly patterns reveal your content's true impact. Consistency is key!",
        color: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600", 
        textColor: "text-gray-100 dark:text-gray-200"
      },
      month: {
        emoji: "💎",
        title: "Growth Journey", 
        story: posts >= 10 
          ? `🏆 CONTENT MACHINE! ${posts} posts this month = ${safePostsPerDay} posts/day. You're building a media empire!`
          : `💪 ${posts} quality posts, ${followerCount} engaged followers. Quality > Quantity strategy in action!`,
        insight: engagement > 300 ? "Your content strategy is working! Keep this momentum going." : "Steady growth foundation set. Ready to scale up?",
        color: "bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600",
        textColor: "text-gray-100 dark:text-gray-200"  
      }
    }
    return stories[period]
  }

  useEffect(() => {
    if (!isReady || !currentWorkspace) return;
    const invalidInfo = detectInvalidAccounts(socialAccountsArray || [])
    const hasAnyInvalid = invalidInfo.count > 0
    if (!hasAnyInvalid) setReconnectVisible(false)
    else setReconnectVisible(true)
  }, [socialAccountsArray, isReady, currentWorkspace])

  if (!isReady || workspaceLoading || !currentWorkspace) {
    return <PerformanceScoreSkeleton />
  }

  const invalidInfo = detectInvalidAccounts(socialAccountsArray)
  const hasAnyInvalid = invalidInfo.count > 0
  const hasAnyValid = socialAccountsArray.some((a: any) => a?.tokenStatus === 'valid' || a?.hasAccessToken)

  const calculateRealGrowthData = (historicalData: any, currentData: any, period: string) => {
    if (!historicalData || !historicalData.length) {
      return {
        followers: { value: '+0.0%', isPositive: true },
        engagement: { value: '+100%', isPositive: true },
        reach: { value: '+100%', isPositive: true },
        posts: { value: `+${currentData.posts}`, isPositive: currentData.posts > 0 },
        contentScore: { value: '+100%', isPositive: true }
      }
    }

    const sortedData = historicalData.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const oldestRecord = sortedData[0]
    const previousRecord = sortedData[sortedData.length - 2] || oldestRecord

    const followerGrowth = oldestRecord.followers === 0 ? 0 : ((currentData.followers - oldestRecord.followers) / oldestRecord.followers) * 100
    const engagementGrowth = previousRecord.engagement === 0 ? 0 : ((currentData.engagement - previousRecord.engagement) / previousRecord.engagement) * 100
    const reachGrowth = previousRecord.reach === 0 ? 0 : ((currentData.reach - previousRecord.reach) / previousRecord.reach) * 100
    const postGrowth = oldestRecord.metrics?.posts === 0 ? 0 : ((currentData.posts - (oldestRecord.metrics?.posts || 0)) / (oldestRecord.metrics?.posts || 1)) * 100
    const oldContentScore = oldestRecord.metrics?.contentScore?.score || 5
    const currentContentScore = 7.5
    const contentScoreGrowth = ((currentContentScore - oldContentScore) / oldContentScore) * 100

    return {
      followers: { value: `${followerGrowth >= 0 ? '+' : ''}${followerGrowth.toFixed(1)}%`, isPositive: followerGrowth >= 0 },
      engagement: { value: `${engagementGrowth >= 0 ? '+' : ''}${Math.abs(engagementGrowth) > 999 ? '999+' : engagementGrowth.toFixed(1)}%`, isPositive: engagementGrowth >= 0 },
      reach: { value: `${reachGrowth >= 0 ? '+' : ''}${Math.abs(reachGrowth) > 999 ? '999+' : reachGrowth.toFixed(1)}%`, isPositive: reachGrowth >= 0 },
      posts: { value: `${postGrowth >= 0 ? '+' : ''}${postGrowth.toFixed(1)}%`, isPositive: postGrowth >= 0 },
      contentScore: { value: `${contentScoreGrowth >= 0 ? '+' : ''}${contentScoreGrowth.toFixed(1)}%`, isPositive: contentScoreGrowth >= 0 }
    }
  }

  const isInitialLoading = analyticsLoading && !analytics
  const ICON_LIMIT = 6
  const invalidIconList = invalidAccounts.slice(0, ICON_LIMIT)
  const invalidRemainder = Math.max(0, invalidAccounts.length - ICON_LIMIT)

  const connectedPlatforms = validAccounts.map((account: any, index: number) => ({
    id: account.id || `platform-${index}`,
    name: account.platform === 'instagram' ? 'Instagram' : 
          account.platform === 'youtube' ? 'YouTube' : 
          account.platform === 'twitter' ? 'Twitter' : 
          account.platform === 'linkedin' ? 'LinkedIn' : 
          account.platform === 'facebook' ? 'Facebook' : 'TikTok',
    logo: account.platform === 'instagram' ? <Instagram className="w-4 h-4 text-pink-600" /> : 
          account.platform === 'youtube' ? <Youtube className="w-4 h-4 text-red-600" /> : 
          account.platform === 'twitter' ? <Twitter className="w-4 h-4 text-blue-500" /> : 
          account.platform === 'linkedin' ? <Linkedin className="w-4 h-4 text-blue-700" /> : 
          account.platform === 'facebook' ? <Facebook className="w-4 h-4 text-blue-600" /> : <TikTokIcon className="w-4 h-4" />,
    color: account.platform === 'instagram' ? 'from-pink-500 to-orange-500' : 
           account.platform === 'youtube' ? 'from-red-500 to-red-700' : 
           account.platform === 'twitter' ? 'from-blue-400 to-blue-600' : 
           account.platform === 'linkedin' ? 'from-blue-700 to-blue-900' : 
           account.platform === 'facebook' ? 'from-blue-600 to-blue-700' : 'from-gray-700 to-black',
    followers: account.followersCount || account.followers || 0,
    engagement: account.avgEngagement ? `${account.avgEngagement.toFixed(1)}%` : '0%',
    reach: account.totalReach || 0,
    posts: account.mediaCount || account.posts || 0,
    username: account.username
  }))

  const totalFollowers = analytics?.totalFollowers || connectedPlatforms.reduce((sum: number, platform: any) => sum + platform.followers, 0)
  const totalReach = analytics?.totalReach || connectedPlatforms.reduce((sum: number, platform: any) => sum + platform.reach, 0)
  const avgEngagement = connectedPlatforms.length > 0 ? parseFloat(connectedPlatforms[0].engagement) || 0 : 0
  const totalPosts = analytics?.totalPosts || connectedPlatforms.reduce((sum: number, platform: any) => sum + platform.posts, 0)

  const calculateContentScore = () => {
    if (connectedPlatforms.length === 0) return { score: 0, rating: 'No Data' }
    let score = 0
    const engagementScore = Math.min(avgEngagement / 10, 10)
    score += engagementScore * 0.4
    const activityScore = Math.min(totalPosts / 10, 10)
    score += activityScore * 0.3
    const reachEfficiency = totalFollowers > 0 ? Math.min((totalReach / totalFollowers) / 5, 10) : 0
    score += reachEfficiency * 0.2
    const consistencyScore = Math.min(connectedPlatforms.length * 2.5, 10)
    score += consistencyScore * 0.1
    const finalScore = Math.min(score, 10)
    let rating = 'Poor'
    if (finalScore >= 9) rating = 'Exceptional'
    else if (finalScore >= 7.5) rating = 'Excellent'  
    else if (finalScore >= 6) rating = 'Very Good'
    else if (finalScore >= 4.5) rating = 'Good'
    else if (finalScore >= 3) rating = 'Fair'
    return { score: finalScore, rating }
  }
  
  const contentScore = calculateContentScore()

  const calculateTimeBasedData = (period: 'day' | 'week' | 'month') => {
    const totalFollowersBase = totalFollowers || 0
    const totalReachBase = totalReach || 0
    const totalPostsBase = totalPosts || 0
    const realEngagementRate = analytics?.engagementRate || 0
    const avgEngagementBase = realEngagementRate > 0 ? realEngagementRate : avgEngagement || 0

    const periodData = {
      reach: totalReachBase,
      posts: totalPostsBase,
      engagement: avgEngagementBase,
      followerGains: 0,
      followerTotal: totalFollowersBase
    }

    const growthPercentages = calculateRealGrowthData(historicalData, {
      followers: totalFollowersBase,
      engagement: avgEngagementBase,
      reach: totalReachBase,
      posts: totalPostsBase
    }, period)

    return { periodData, growthPercentages }
  }

  const { periodData, growthPercentages } = calculateTimeBasedData(selectedPeriod)

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getPlatformIcon = (platform: string) => {
    if (platform === 'instagram') return <Instagram className="w-3 h-3 text-pink-600" />
    if (platform === 'youtube') return <Youtube className="w-3 h-3 text-red-600" />
    if (platform === 'twitter') return <Twitter className="w-3 h-3 text-blue-500" />
    if (platform === 'linkedin') return <Linkedin className="w-3 h-3 text-blue-700" />
    if (platform === 'facebook') return <Facebook className="w-3 h-3 text-blue-600" />
    return <TikTokIcon className="w-3 h-3" />
  }

  return (
    <Card data-testid="performance-score" className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div className="flex items-center space-x-3">
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">Performance Overview</CardTitle>
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['day', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 capitalize ${
                  selectedPeriod === period
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                data-testid={`period-${period}`}
              >
                {period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-indigo-700 dark:hover:text-indigo-400 rounded-xl px-6 font-semibold">
            View Details
          </Button>
        </div>
      </CardHeader>

      {showDataStory && (() => {
        const currentStory = generateDataStory({
          followers: totalFollowers,
          engagement: avgEngagement, 
          reach: totalReach,
          posts: totalPosts,
          period: selectedPeriod
        })
        return <DataStory story={currentStory} onClose={() => setShowDataStory(false)} storyAnimation={storyAnimation} />
      })()}

      <CardContent className="space-y-8">
        {isInitialLoading && <MetricsGridSkeleton />}
        
        {!(hasAnyInvalid && reconnectVisible) && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Connected Platforms</h3>
              {hasAnyInvalid && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-600 hover:bg-orange-50 dark:hover:bg-gray-600 rounded-xl px-3 font-semibold transition-all duration-[400ms] ease-out transform ${
                    reconnectVisible ? 'opacity-0 translate-x-3 pointer-events-none' : 'opacity-100 translate-x-0'
                  }`}
                  onClick={async () => {
                    const res = await startReconnectFlow(socialAccountsArray, currentWorkspace?.id)
                    if (res?.type === 'integrations') setLocation('/integration')
                  }}
                  aria-label="Reconnect social accounts"
                >
                  <span className="mr-2 whitespace-nowrap">Reconnect</span>
                  <div className="flex flex-wrap items-center gap-1 ml-1">
                    {invalidIconList.map((acc: any, index: number) => (
                      <div key={acc.id || `invalid-icon-${index}`} className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        {getPlatformIcon(acc.platform)}
                      </div>
                    ))}
                    {invalidRemainder > 0 && (
                      <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">+{invalidRemainder}</span>
                      </div>
                    )}
                  </div>
                </Button>
              )}
              <div className="flex items-center space-x-2">
                {connectedPlatforms.map((platform: any) => (
                  <div key={platform.id} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    {platform.logo}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>{connectedPlatforms.length} Active</span>
            </div>
          </div>
        )}

        {hasAnyInvalid && reconnectVisible ? (
          <div
            className={`flex items-center justify-center py-20 transition-all duration-[400ms] ease-out transform ${
              isClosingReconnect ? '-translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
            }`}
            style={{ willChange: 'transform, opacity' }}
            aria-live="polite"
          >
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-orange-600 dark:text-orange-400" />
              </div>
              {(() => { const c = getReconnectCopy(socialAccountsArray); return (
                <>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{c.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">{c.description}</p>
                  {invalidIconList.length > 0 && (
                    <div className="flex items-center justify-center gap-2 mb-6">
                      {invalidIconList.map((acc: any, index: number) => (
                        <div key={acc.id || `invalid-center-${index}`} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          {getPlatformIcon(acc.platform)}
                        </div>
                      ))}
                      {invalidRemainder > 0 && (
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">+{invalidRemainder}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )})()}
              <Button
                onClick={async () => {
                  const res = await startReconnectFlow(socialAccountsArray, currentWorkspace?.id)
                  if (res?.type === 'integrations') setLocation('/integration')
                }}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg text-sm"
                aria-label="Reconnect social accounts"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                <span className="whitespace-nowrap">Reconnect Now</span>
              </Button>
              {hasAnyValid && (
                <button
                  type="button"
                  className="ml-3 inline-flex items-center text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 rounded-md"
                  aria-label="Dismiss reconnect prompt"
                  onClick={() => {
                    setIsClosingReconnect(true)
                    setTimeout(() => {
                      setReconnectVisible(false)
                      setIsClosingReconnect(false)
                    }, 400)
                  }}
                >
                  Close
                </button>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
                After reconnecting, your performance metrics will appear here automatically
              </p>
            </div>
          </div>
        ) : (
          <>
            {connectedPlatforms.length > 0 ? (
              <MetricsGrid 
                periodData={periodData} 
                growthPercentages={growthPercentages} 
                selectedPeriod={selectedPeriod}
                formatNumber={formatNumber}
              />
            ) : (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-3xl p-12 text-center mb-8 border-2 border-dashed border-gray-300 dark:border-gray-600">
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <Users className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Connect Your Social Platforms</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
                  Start tracking your social media performance by connecting your accounts. Get insights on followers, engagement, reach, and more across all your platforms.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mb-8">
                  <div className="flex items-center space-x-2 bg-pink-50 dark:bg-pink-900/30 px-4 py-2 rounded-full border border-pink-200 dark:border-pink-600">
                    <span>📷</span>
                    <span className="text-sm font-medium text-pink-700 dark:text-pink-300">Instagram</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-red-50 dark:bg-red-900/30 px-4 py-2 rounded-full border border-red-200 dark:border-red-600">
                    <span>🎥</span>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">YouTube</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full border border-blue-200 dark:border-blue-600">
                    <span>🐦</span>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Twitter</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full border border-blue-200 dark:border-blue-600">
                    <span>💼</span>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">LinkedIn</span>
                  </div>
                </div>
                <Button 
                  onClick={() => setLocation('/integration')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold text-lg"
                >
                  Connect Your First Platform
                </Button>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">Performance Breakdown</h4>
              
              <div className={`grid gap-4 mb-8 ${
                connectedPlatforms.length === 1 ? 'grid-cols-1' :
                connectedPlatforms.length === 2 ? 'grid-cols-2' :
                connectedPlatforms.length === 3 ? 'grid-cols-3' :
                connectedPlatforms.length === 4 ? 'grid-cols-2 lg:grid-cols-4' :
                connectedPlatforms.length === 5 ? 'grid-cols-2 lg:grid-cols-5' :
                'grid-cols-2 lg:grid-cols-6'
              }`}>
                {connectedPlatforms.map((platform: any) => (
                  <PlatformCard key={platform.id} platform={platform} formatNumber={formatNumber} />
                ))}
              </div>

              {connectedPlatforms.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">No connected platforms found. Connect your social accounts to see performance metrics.</p>
                </div>
              )}

              <PerformanceBreakdown
                connectedPlatforms={connectedPlatforms}
                contentScore={contentScore}
                avgEngagement={avgEngagement}
                totalPosts={totalPosts}
                selectedPeriod={selectedPeriod}
                growthPercentages={growthPercentages}
                formatNumber={formatNumber}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
