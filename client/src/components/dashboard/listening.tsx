import React, { useState, useEffect } from 'react'
import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { apiRequest } from '@/lib/queryClient'
import { Skeleton } from '@/components/ui/skeleton'
import { clampListCount } from '@/components/skeletons/render-state'
import { 
  TrendingUp, 
  Search, 
  Filter, 
  BarChart3, 
  Eye, 
  MessageCircle, 
  Hash,
  Globe,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Activity,
  Loader2
} from 'lucide-react'

// Compact number formatting (1.2K, 3.4M) shared across this widget.
const fmtCompact = (n: number) => {
  if (!n || n < 1000) return String(Math.round(n || 0))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

// Animated multi-step status while a live search runs (fetch + AI analysis).
const SEARCH_STEPS = [
  'Scanning Reddit, YouTube, HN & News…',
  'Collecting matching posts…',
  'Scoring relevance to your query…',
  'Running AI sentiment analysis…',
  'Aggregating mentions & hashtags…',
  'Finalizing insights…',
]

function SearchLoadingStatus() {
  const [step, setStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t1 = setInterval(() => setStep((s) => Math.min(s + 1, SEARCH_STEPS.length - 1)), 4000)
    const t2 = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])
  const pct = Math.min(95, (step + 1) * (100 / SEARCH_STEPS.length))
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 text-center">{SEARCH_STEPS[step]}</p>
      <p className="text-xs text-gray-400 mb-3">{elapsed}s · live search takes 20–60s</p>
      <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Listening() {
  const { currentWorkspace } = useCurrentWorkspace()
  const workspaceId = currentWorkspace?.id
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSearch, setActiveSearch] = useState('')

  // Resolve the user's niche (required by every social-listening endpoint).
  const { data: userResp } = useQuery({
    queryKey: ['social-listening-user-niche'],
    queryFn: async () => await apiRequest('/api/v1/user'),
  })
  const resolvedUser = userResp?.data || userResp?.user || userResp || null
  const niche = (resolvedUser?.niche || resolvedUser?.preferences?.contentNiche || '').trim()
  const nicheQ = encodeURIComponent(niche)

  // Only show listening data when the workspace has at least one connected social account.
  // Niche-sharing can copy trend data to workspaces without accounts — don't show that data
  // as it would be confusing (no account = nothing to act on).
  const { validAccounts, isLoading: socialLoading } = useSocialAccounts(workspaceId)
  const hasSocialAccount = !socialLoading && validAccounts.length > 0

  const enabled = !!workspaceId && !!niche && hasSocialAccount

  // Header summary (keywords monitored / mentions / active alerts).
  const { data: summaryResp } = useQuery({
    queryKey: ['dash-listening-summary', workspaceId],
    queryFn: async () => await apiRequest(`/api/social-listening/dashboard/summary/${workspaceId}?niche=${nicheQ}`),
    enabled,
  })
  const summary = summaryResp?.data || null

  // Trending topics.
  const { data: trendingResp, isLoading: trendingLoading } = useQuery({
    queryKey: ['dash-listening-trending', workspaceId],
    queryFn: async () => await apiRequest(`/api/social-listening/dashboard/trending/${workspaceId}?niche=${nicheQ}`),
    enabled,
  })
  const trendingTopics = trendingResp?.topics || []

  // Alerts.
  const { data: alertsResp, isLoading: alertsLoading } = useQuery({
    queryKey: ['dash-listening-alerts', workspaceId],
    queryFn: async () => await apiRequest(`/api/social-listening/alerts/${workspaceId}?niche=${nicheQ}`),
    enabled,
  })
  const alerts = alertsResp?.alerts || []

  // Search results (only fetched when a search has been triggered).
  const { data: searchResp, isLoading: searchLoading } = useQuery({
    queryKey: ['dash-listening-search', workspaceId, activeSearch],
    queryFn: async () => await apiRequest(`/api/social-listening/search/${workspaceId}?niche=${nicheQ}&q=${encodeURIComponent(activeSearch)}`),
    enabled: enabled && !!activeSearch,
  })
  const searchResults = searchResp?.results || []

  const runSearch = (term: string) => {
    const t = term.trim()
    if (!t) return
    setSearchTerm(t)
    setActiveSearch(t)
  }

  return (
    <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Enhanced Header */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Social Listening</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Real-time trend analysis</p>
              </div>
            </div>
            <Link href="/social-listening">
              <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300">
                <BarChart3 className="w-4 h-4 mr-2" />
                See insights
              </Button>
            </Link>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Monitoring</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{summary?.keywordsMonitored ?? 0}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Keywords</div>
            </div>
            
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mentions</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtCompact(summary?.totalMentions ?? 0)}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Tracked</div>
            </div>
            
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alerts</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{alerts.length || summary?.activeAlerts || 0}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Active</div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        {!hasSocialAccount ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No social account connected</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Connect a social account to start monitoring trends for your niche.
            </p>
            <a href="/settings?tab=social" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              Connect account
            </a>
          </div>
        ) : (
        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="w-full bg-gray-50 dark:bg-gray-700 p-1 m-0 rounded-none border-b dark:border-gray-600">
            <TabsTrigger value="trending" className="flex-1">Trending</TabsTrigger>
            <TabsTrigger value="search" className="flex-1">Search</TabsTrigger>
            <TabsTrigger value="alerts" className="flex-1">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="mt-0">
            <div className="p-6 max-h-[680px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {/* Niche context */}
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Filter className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Interest Category</span>
                </div>
                <div className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 capitalize">
                  {niche || 'Set your niche in Settings'}
                </div>
              </div>

              {/* Trending Topics */}
              {trendingLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: clampListCount(2, { default: 2 }) }).map((_, i) => (
                    <Skeleton key={i} variant="card" className="h-40 w-full rounded-xl" />
                  ))}
                </div>
              ) : trendingTopics.length > 0 ? (
                <div className="space-y-4">
                  {trendingTopics.map((topic: any) => (
                    <div key={topic.id} className="bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-600 hover:shadow-lg transition-all duration-300 group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h5 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{topic.topic}</h5>
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${
                                topic.priority === 'high' ? 'bg-red-100 text-red-700' :
                                topic.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}
                            >
                              {topic.priority} priority
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                            {topic.description}
                          </p>
                          
                          {/* Hashtags */}
                          <div className="flex flex-wrap gap-2 mb-4">
                            {(topic.hashtags || []).map((hashtag: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center space-x-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                                <Hash className="w-3 h-3" />
                                <span>{hashtag.replace('#', '')}</span>
                              </span>
                            ))}
                          </div>

                          {/* Metrics */}
                          <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center space-x-2">
                              <MessageCircle className="w-4 h-4" />
                              <span className="font-medium">{fmtCompact(topic.mentions)}</span>
                              <span>mentions</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Eye className="w-4 h-4" />
                              <span className="font-medium">{fmtCompact(topic.engagement)}</span>
                              <span>engagement</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {topic.sentiment === 'negative' ? (
                                <ArrowDown className="w-4 h-4 text-red-600" />
                              ) : (
                                <ArrowUp className="w-4 h-4 text-green-600" />
                              )}
                              <span className={`font-medium ${topic.sentiment === 'negative' ? 'text-red-600' : 'text-green-600'}`}>
                                +{topic.growth}%
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Link href="/create">
                          <Button 
                            size="sm" 
                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:text-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Create post
                          </Button>
                        </Link>
                      </div>

                      {/* Trend Progress */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Trend momentum</span>
                          <span className="text-xs text-gray-500 dark:text-gray-500">{topic.status}</span>
                        </div>
                        <Progress 
                          value={Math.min(100, topic.velocity || 0)} 
                          className="h-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-gray-500 dark:text-gray-400 text-sm">
                  No trending topics yet. Open <Link href="/social-listening" className="text-blue-600 underline">Social Listening</Link> and click "Sync Live Data".
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <div className="p-6 max-h-[680px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Advanced Search</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Deep dive into topics, companies, hashtags, and competitor analysis
              </p>
              
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search keywords, hashtags, or @mentions"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchTerm) }}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <Button onClick={() => runSearch(searchTerm)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 hover:text-blue-100">
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>

                {/* Search results, or quick-search suggestions when idle */}
                {activeSearch ? (
                  searchLoading ? (
                    <SearchLoadingStatus />
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-3">
                      {/* Query type + summary */}
                      <div className="flex items-center flex-wrap gap-2 text-xs">
                        <span className={`font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          searchResp?.searchType === 'hashtag' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' :
                          searchResp?.searchType === 'mention' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' :
                          searchResp?.searchType === 'topic' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' :
                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        }`}>
                          {searchResp?.searchType || 'keyword'}
                        </span>
                        {searchResp?.summary && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {fmtCompact(searchResp.summary.totalMentions)} mentions · {fmtCompact(searchResp.summary.estimatedReach)} reach · 
                            <span className={`ml-1 font-semibold capitalize ${
                              searchResp.summary.overallSentiment === 'positive' ? 'text-green-600' :
                              searchResp.summary.overallSentiment === 'negative' ? 'text-red-600' : 'text-gray-500'
                            }`}>{searchResp.summary.overallSentiment}</span>
                          </span>
                        )}
                      </div>
                      {/* Top hashtags */}
                      {searchResp?.summary?.topHashtags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {searchResp.summary.topHashtags.slice(0, 6).map((h: string) => (
                            <span key={h} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 rounded-full px-2 py-0.5">
                              <Hash className="w-2.5 h-2.5" />{h}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Result posts */}
                      <div className="space-y-3 max-h-72 overflow-y-auto">
                        {searchResults.map((r: any) => (
                          <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{r.platform === 'hackernews' ? 'HN' : r.platform === 'news' ? 'News' : r.platform}</span>
                                <span className="text-[11px] text-gray-500">@{r.author || 'anonymous'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {r.sentiment && (
                                  <span className={`text-[10px] font-bold capitalize ${
                                    r.sentiment === 'positive' ? 'text-green-600' : r.sentiment === 'negative' ? 'text-red-600' : 'text-gray-400'
                                  }`}>{r.sentiment}</span>
                                )}
                                {typeof r.relevance === 'number' && <span className="text-[10px] font-semibold text-indigo-500">{r.relevance}%</span>}
                              </div>
                            </div>
                            <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 mb-1">{r.title || r.content}</p>
                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                              <span className="flex items-center"><MessageCircle className="w-3 h-3 mr-0.5" />{fmtCompact(r.metrics?.comments || 0)}</span>
                              {(r.metrics?.likes > 0) && <span className="flex items-center"><ArrowUp className="w-3 h-3 mr-0.5" />{fmtCompact(r.metrics.likes)}</span>}
                              {(r.metrics?.views > 0) && <span className="flex items-center"><Eye className="w-3 h-3 mr-0.5" />{fmtCompact(r.metrics.views)}</span>}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-sm">No mentions found for "{activeSearch}". Try a broader keyword.</div>
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {['#trending', '#tips', '@competitor', 'trending now'].map((suggestion, idx) => (
                      <button
                        key={idx}
                        className="p-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
                        onClick={() => runSearch(suggestion)}
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{suggestion}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Quick search</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="mt-0">
            <div className="p-6 max-h-[680px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Smart Alerts</h4>
              
              {alertsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: clampListCount(3, { default: 3 }) }).map((_, i) => (
                    <Skeleton key={i} variant="rectangle" className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : alerts.length > 0 ? (
                <div className="space-y-4">
                  {alerts.map((alert: any, idx: number) => {
                    const isRisk = alert.severity === 'high' && alert.type === 'risk'
                    const isGood = alert.severity === 'good' || alert.type === 'positive'
                    const palette = isRisk
                      ? { box: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600', icon: 'text-red-600 dark:text-red-400', title: 'text-red-900 dark:text-red-100', detail: 'text-red-700 dark:text-red-300', badge: 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300', label: 'High', Icon: AlertTriangle }
                      : isGood
                      ? { box: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600', icon: 'text-green-600 dark:text-green-400', title: 'text-green-900 dark:text-green-100', detail: 'text-green-700 dark:text-green-300', badge: 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300', label: 'Good', Icon: CheckCircle }
                      : { box: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600', icon: 'text-blue-600 dark:text-blue-400', title: 'text-blue-900 dark:text-blue-100', detail: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300', label: alert.severity === 'high' ? 'High' : 'Medium', Icon: Target }
                    const Icon = palette.Icon
                    return (
                      <div key={idx} className={`flex items-center space-x-3 p-4 border rounded-lg ${palette.box}`}>
                        <Icon className={`w-5 h-5 ${palette.icon}`} />
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${palette.title}`}>{alert.title}</div>
                          <div className={`text-xs ${palette.detail}`}>{alert.detail}</div>
                        </div>
                        <Badge className={palette.badge}>{palette.label}</Badge>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500 text-sm">No active alerts. Sync live data to generate alerts from your niche.</div>
              )}

              <Link href="/social-listening">
                <Button variant="outline" className="w-full mt-6 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-indigo-700 dark:hover:text-indigo-400">
                  Configure alert settings
                </Button>
              </Link>
            </div>
          </TabsContent>
        </Tabs>
        )}

        {/* Real-time Activity Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* skeleton-guard-allow: status-dot — live "monitoring active" status indicator, not a loading placeholder */}
              <div className={`w-2 h-2 rounded-full animate-pulse ${hasSocialAccount ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{hasSocialAccount ? 'Live monitoring active' : 'No account connected'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Niche: {niche || 'not set'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
