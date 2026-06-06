import React, { useState } from 'react'
import { useParams, useLocation } from 'wouter'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, RefreshCw, Eye, ThumbsUp, MessageCircle, Share2, Bookmark, Users, MapPin, Activity, Clock, Target, Info, Play, Timer, FastForward, Rewind, XCircle, MessageSquare, TrendingUp, TrendingDown, Sparkles, LineChart as LineChartIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

const isVideoUrl = (url: string) => {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  const urlWithoutQuery = lowerUrl.split('?')[0]
  if (urlWithoutQuery.match(/\.(jpeg|jpg|png|gif|webp)$/i)) return false
  return urlWithoutQuery.match(/\.(mp4|mov|webm|ogg)$/i) || lowerUrl.includes('/video/upload')
}

const getPostMediaUrl = (post: any) => {
  if (!post?.contentData) return ''
  return post.contentData.mediaUrls?.[0] || 
         post.contentData.media?.[0] ||
         post.contentData.mediaUrl || 
         post.contentData.thumbnailUrl || 
         ''
}

const MetricCard = ({ title, value, icon: Icon, description, trend }: any) => (
  <Card className="bg-white dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 shadow-sm backdrop-blur-xl hover:shadow-md transition-shadow relative overflow-hidden">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{title}</p>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {typeof value === 'number' ? value.toLocaleString() : (value || '0')}
            </h3>
            {typeof trend === 'number' && (
              <div className={`flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${trend > 0 ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' : trend < 0 ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10' : 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'}`}>
                {trend > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : trend < 0 ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
                {trend > 0 ? '+' : ''}{trend}%
              </div>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center">
              <Info className="w-3 h-3 mr-1" />
              {description}
            </p>
          )}
        </div>
        <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
          <Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>
    </CardContent>
  </Card>
)

export default function PostAnalyticsPage() {
  const { contentId } = useParams()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['content', contentId, 'analytics'],
    queryFn: async () => {
      try {
        const res = await apiRequest(`/api/content/${contentId}/analytics`)
        console.log('Analytics response:', res)
        return res
      } catch (err) {
        console.error('Analytics error:', err)
        throw err
      }
    },
    enabled: !!contentId
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const syncIdMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/content/${contentId}/sync-id`, { method: 'POST' })
    },
    onSuccess: () => {
      refetch()
    },
    onError: (err: any) => {
      console.error('Failed to sync ID:', err)
      alert(err.message || 'Failed to sync ID. The post may not exist on Instagram.')
    }
  })

  console.log('Render PostAnalyticsPage, isLoading:', isLoading, 'data:', data, 'error:', error)

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Skeleton className="h-[600px] w-full rounded-2xl" />
          <div className="col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!data?.data?.content) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Post not found or analytics not available.</p>
        <Button variant="link" onClick={() => setLocation('/published-posts')}>Go back</Button>
      </div>
    )
  }

  const { content, metrics, demographics, benchmark, historicalData, aiInsight } = data.data
  const mediaUrl = getPostMediaUrl(content)
  const isVideo = isVideoUrl(mediaUrl) || content.type === 'video' || content.type === 'reel'
  const isStory = content.type === 'story'
  const isReel = content.type === 'reel' || content.type === 'video'
  const hasInstagramId = !!(content.instagramPostId || content.contentData?.externalId)
  
  // Try to use snapshotted data if available
  const username = content.contentData?.username || 'user'
  const profilePic = content.contentData?.profilePictureUrl

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => window.history.back()}
            className="rounded-full bg-white dark:bg-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Post Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Published on {content.publishedAt ? format(new Date(content.publishedAt), 'PPP at p') : 'Unknown'}
            </p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="bg-white dark:bg-gray-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Post Preview */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden sticky top-8">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
              {profilePic ? (
                <img src={profilePic} alt={username} className="w-10 h-10 rounded-full border border-gray-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{username}</p>
                <p className="text-xs text-gray-500">Instagram {content.type}</p>
              </div>
            </div>
            
            <div className="relative aspect-[4/5] bg-black overflow-hidden flex items-center justify-center">
              {mediaUrl ? (
                isVideo ? (
                  <video src={mediaUrl} className="w-full h-full object-cover" controls playsInline />
                ) : (
                  <img src={mediaUrl} className="w-full h-full object-cover" alt="Post media" />
                )
              ) : (
                <p className="text-gray-500">No media available</p>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-900/30">
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {content.contentData?.text || content.title}
              </p>
            </div>
            
            {metrics?.lastSyncAt && (
              <div className="p-3 text-xs text-center text-gray-500 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                Last updated: {format(new Date(metrics.lastSyncAt), 'PPp')}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Analytics Data */}
        <div className="lg:col-span-2 space-y-8">
          
          {!hasInstagramId ? (
            <Card className="bg-white dark:bg-gray-800/80 border-orange-200 dark:border-orange-900/50 shadow-sm backdrop-blur-xl">
              <CardContent className="p-12 text-center">
                <Info className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Analytics Unavailable</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
                  This post is missing its unique Instagram Post ID, which means we cannot fetch its performance data from Instagram. This usually happens if the publishing process encountered an error or timed out before completion.
                </p>
                <Button 
                  onClick={() => syncIdMutation.mutate()} 
                  disabled={syncIdMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {syncIdMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="w-4 h-4 mr-2" />
                  )}
                  {syncIdMutation.isPending ? 'Syncing ID...' : 'Sync ID from Instagram'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* AI Insights Card */}
              {aiInsight && (
                <div className="mb-6">
                  <Card className="bg-slate-900 border border-slate-800 shadow-xl overflow-hidden relative">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-500 opacity-20 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-teal-500 opacity-20 rounded-full blur-3xl"></div>
                    
                    <CardContent className="p-6 sm:p-8 relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                      <div className="p-4 bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shrink-0 shadow-inner">
                        <Sparkles className="w-8 h-8 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 flex items-center">
                          AI Performance Analysis
                        </h3>
                        <p className="text-slate-100 text-lg font-medium leading-relaxed">
                          {aiInsight}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Key Metrics */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-indigo-500" />
                  Performance Metrics
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard title="Reach" value={metrics?.reach} trend={benchmark?.growthReach} icon={Users} description="Unique accounts that saw this" />
                  {!isStory && (
                    <>
                      <MetricCard title="Impressions" value={metrics?.impressions} icon={Eye} description="Total times this was seen" />
                      <MetricCard title="Likes" value={metrics?.likes} trend={benchmark?.growthLikes} icon={ThumbsUp} />
                      <MetricCard title="Comments" value={metrics?.comments} trend={benchmark?.growthComments} icon={MessageCircle} />
                      <MetricCard title="Shares" value={metrics?.shares} icon={Share2} />
                      <MetricCard title="Saves" value={metrics?.saves} icon={Bookmark} />
                    </>
                  )}
                </div>
              </div>

              {/* Advanced Reel Metrics */}
              {isReel && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <Play className="w-5 h-5 mr-2 text-pink-500" />
                    Advanced Reel Metrics
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <MetricCard title="Total Plays" value={metrics?.plays} icon={Play} description="Including replays" />
                    <MetricCard 
                      title="Total Watch Time" 
                      value={metrics?.ig_reels_video_view_total_time ? `${(metrics.ig_reels_video_view_total_time / 1000).toFixed(1)}s` : null} 
                      icon={Timer} 
                      description="Total time watched" 
                    />
                    <MetricCard 
                      title="Avg Watch Time" 
                      value={metrics?.ig_reels_avg_watch_time ? `${(metrics.ig_reels_avg_watch_time / 1000).toFixed(1)}s` : null} 
                      icon={Timer} 
                      description="Average duration" 
                    />
                  </div>
                </div>
              )}

              {/* Story Specific Metrics */}
              {isStory && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2 text-orange-500" />
                    Story Performance
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <MetricCard title="Replies" value={metrics?.replies} icon={MessageSquare} description="Direct messages" />
                  </div>
                </div>
              )}

          {/* Historical Growth Chart */}
          {historicalData && historicalData.length > 1 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <LineChartIcon className="w-5 h-5 mr-2 text-indigo-500" />
                Historical Growth Trends
              </h2>
              <Card className="bg-white dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 shadow-sm backdrop-blur-xl">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Performance compared to your last 10 published posts of this type.
                  </p>
                  <div className="h-[300px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historicalData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line yAxisId="left" type="monotone" dataKey="reach" name="Reach" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        {!isStory && <Line yAxisId="right" type="monotone" dataKey="likes" name="Likes" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                        {(isStory || isReel) && <Line yAxisId="right" type="monotone" dataKey={isStory ? 'replies' : 'plays'} name={isStory ? 'Replies' : 'Plays'} stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Audience Demographics (Global) */}
          {demographics && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-indigo-500" />
                Global Audience Demographics
              </h2>
              <Card className="bg-white dark:bg-gray-800/80 border-gray-200/60 dark:border-gray-700/60 shadow-sm backdrop-blur-xl">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Note: Instagram API provides demographic data at the account level, representing your overall audience composition.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Top Cities */}
                    {demographics.audienceCity && Object.keys(demographics.audienceCity).length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                          Top Cities
                        </h3>
                        <div className="space-y-3">
                          {Object.entries(demographics.audienceCity)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .slice(0, 5)
                            .map(([city, count]) => (
                              <div key={city} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300 truncate pr-4">{city.replace(/_/g, '.')}</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{(count as number).toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Top Countries */}
                    {demographics.audienceCountry && Object.keys(demographics.audienceCountry).length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                          Top Countries
                        </h3>
                        <div className="space-y-3">
                          {Object.entries(demographics.audienceCountry)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .slice(0, 5)
                            .map(([country, count]) => (
                              <div key={country} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300 truncate pr-4">{country}</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{(count as number).toLocaleString()}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
