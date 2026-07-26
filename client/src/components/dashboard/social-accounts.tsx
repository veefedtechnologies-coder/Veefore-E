import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SocialAccountCardSkeleton } from '@/components/skeletons'
import { useToast } from '@/hooks/use-toast'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { Users, TrendingUp, MessageSquare, Share2, Eye, Calendar, BarChart3, Heart, Instagram, Facebook, Twitter, Linkedin, Youtube, RefreshCw, Bookmark } from 'lucide-react'
import { detectInvalidAccounts, getReconnectCopy, startReconnectFlow } from '@/lib/reconnect'
import { RateLimitUsagePanel } from '@/components/dashboard/RateLimitUsagePanel'

export function SocialAccountsSkeleton() {
  return (
    <Card data-testid="social-accounts-skeleton" className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex space-x-2">
              <Skeleton className="h-8 w-28 rounded-lg" />
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
          </div>
          <div className="flex space-x-2 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-12 rounded-xl flex-shrink-0" />
            ))}
          </div>
        </div>
        <div className="p-6">
          <SocialAccountCardSkeleton />
        </div>
      </CardContent>
    </Card>
  )
}

export function SocialAccounts() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const workspaceData = useCurrentWorkspace()
  const { currentWorkspace, isReady, isLoading: workspaceLoading } = workspaceData || { currentWorkspace: undefined, isReady: false, isLoading: true }

  // NOTE: a previous version cleared the React Query + localStorage social-accounts
  // cache on every mount ("to ensure fresh data"). That defeated the cache and the
  // bootstrap seed, forcing a cold refetch (and a loading skeleton) on EVERY
  // dashboard open / sidebar navigation. Removed entirely — the query below is
  // configured to serve cached/seeded data instantly (refetchOnMount:false,
  // staleTime 5m) and is kept fresh by mutations, webhook events, and 10-min polling.

  // Fetch social accounts data for current workspace. Uses the SHARED cache
  // (same key as useSocialAccounts) so the bootstrap-seeded data and the 5-min
  // cache serve instantly instead of forcing a cold network round-trip on every
  // dashboard open. Background polling still keeps metrics fresh.
  const { data: socialAccounts, isLoading, isFetching, refetch: refetchAccounts } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const response = await apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`);
      // API returns { success: true, data: [...] } - extract the data array
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      return [];
    },
    enabled: !!currentWorkspace?.id,
    refetchInterval: 10 * 60 * 1000, // Smart polling every 10 minutes (Meta-friendly)
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000, // 30s stale time — ensures fresh data after OAuth connects
    refetchOnWindowFocus: true, // Refetch when user returns to tab (catches post-OAuth state)
    refetchOnMount: true, // Always check for fresh data on mount
    refetchOnReconnect: true,
    gcTime: 30 * 60 * 1000,
    placeholderData: undefined,
  })

  // Removed aggressive cache clearing that caused infinite loops when shares/saves were genuinely 0

  // Smart Instagram sync mutation with rate limit protection and immediate updates
  const syncMutation = useMutation({
    mutationFn: () => currentWorkspace?.id ? apiRequest('/api/instagram/force-sync', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: currentWorkspace.id
      })
    }) : Promise.reject(new Error('No workspace selected')),
    onSuccess: (data) => {
      console.log('Smart Instagram sync completed:', data)

      // Immediately trigger a refresh of all data for real-time updates
      refetchAccounts()
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
      queryClient.invalidateQueries({ queryKey: ['/api/instagram/polling-status'] })
      // Force immediate refetch for instant updates
      queryClient.refetchQueries({ queryKey: ['/api/social-accounts'] })

      toast({
        title: "🚀 Real-time sync complete!",
        description: `Instagram data refreshed instantly! ${data.newDataCount || 0} new updates fetched.`,
      })
    },
    onError: (error: any) => {
      console.error('Smart Instagram sync failed:', error)

      // Enhanced rate limit error handling
      if (error.message?.includes('rate limit') || error.message?.includes('429') || error.status === 429) {
        toast({
          title: "⏳ Rate limit protection active",
          description: "Instagram API rate limit reached. Smart sync will retry automatically in 2-3 minutes.",
          variant: "destructive"
        })
      } else if (error.message?.includes('timeout') || error.message?.includes('network')) {
        toast({
          title: "🔄 Network timeout",
          description: "Connection timeout. Will retry automatically.",
          variant: "destructive"
        })
      } else {
        toast({
          title: "❌ Sync failed",
          description: error.message || "Failed to sync Instagram data",
          variant: "destructive"
        })
      }
    }
  })

  // Smart refresh system with hybrid approach - Webhooks for comments/mentions + Polling for other metrics
  React.useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null
    let lastRefreshTime = 0
    let lastActivityTime = Date.now()
    const MIN_REFRESH_INTERVAL = 30 * 1000 // Minimum 30 seconds between refreshes to respect rate limits

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to page - check if we need fresh data
        const timeSinceLastActivity = Date.now() - lastActivityTime
        const timeSinceLastRefresh = Date.now() - lastRefreshTime
        const shouldRefresh = timeSinceLastActivity > 3 * 60 * 1000 && timeSinceLastRefresh > MIN_REFRESH_INTERVAL // 3 minutes

        if (shouldRefresh) {
          console.log('User returned after', Math.round(timeSinceLastActivity / 1000), 'seconds - refreshing data (hybrid mode)')
          // Debounce the refresh to prevent excessive API calls
          if (refreshTimeout) {
            clearTimeout(refreshTimeout)
          }

          refreshTimeout = setTimeout(() => {
            // User returned to page - refresh data with delay
            refetchAccounts()
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] })
            lastActivityTime = Date.now()
            lastRefreshTime = Date.now()
          }, 1000) // 1 second delay to prevent rapid refreshes
        }
      }
    }

    // Track user activity for smart refreshing
    const handleUserActivity = () => {
      lastActivityTime = Date.now()
    }

    // Listen for user activity
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('mousemove', handleUserActivity)
    document.addEventListener('keydown', handleUserActivity)
    document.addEventListener('click', handleUserActivity)

    console.log('[SOCIAL ACCOUNTS] Hybrid mode: Webhooks for comments/mentions + Smart polling for likes/followers/engagement')

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('mousemove', handleUserActivity)
      document.removeEventListener('keydown', handleUserActivity)
      document.removeEventListener('click', handleUserActivity)
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
    }
  }, [refetchAccounts, queryClient])

  // Polling status query - Hybrid approach with smart polling
  const { data: pollingStatus } = useQuery({
    queryKey: ['/api/instagram/polling-status', currentWorkspace?.id],
    queryFn: () => currentWorkspace?.id ? apiRequest(`/api/instagram/polling-status?workspaceId=${currentWorkspace.id}`) : Promise.resolve(null),
    refetchInterval: 3 * 60 * 1000, // Smart polling every 3 minutes (Meta-friendly)
    refetchIntervalInBackground: false, // Don't poll when tab is not active to save API calls
    staleTime: 1 * 60 * 1000, // Cache for 1 minute for faster updates
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    refetchOnReconnect: true, // Refresh when network reconnects
    enabled: !!currentWorkspace?.id && !!socialAccounts && (Array.isArray(socialAccounts) ? socialAccounts.length > 0 : (socialAccounts?.data?.length || 0) > 0)
  })

  // State hooks - must be before early return
  const [selectedAccount, setSelectedAccount] = useState('instagram')
  const [isSyncing, setIsSyncing] = useState(false)

  // Listen for sync status events from WebSocket
  React.useEffect(() => {
    const handleSyncStatus = (e: CustomEvent) => {
      setIsSyncing(e.detail?.syncing || false)
    }
    window.addEventListener('instagram-sync-status', handleSyncStatus as EventListener)
    return () => window.removeEventListener('instagram-sync-status', handleSyncStatus as EventListener)
  }, [])

  // Auto-poll every 5 seconds while initial sync is in progress to pick up completed sync
  // Must be before early returns to maintain consistent hook ordering
  const socialAccountsArrayForHook = Array.isArray(socialAccounts) ? socialAccounts : (socialAccounts?.data || [])
  const hasUnsyncedAccount = socialAccountsArrayForHook.some((acc: any) => 
    !acc.lastSyncAt && !acc.lastSync && acc.tokenStatus === 'valid'
  )
  React.useEffect(() => {
    if (!hasUnsyncedAccount || !currentWorkspace?.id) return
    const interval = setInterval(() => {
      refetchAccounts()
    }, 5000)
    return () => clearInterval(interval)
  }, [hasUnsyncedAccount, refetchAccounts, currentWorkspace?.id])

  // Early return if workspace not ready - placed AFTER all hooks but BEFORE calculations
  if (!isReady || workspaceLoading || !currentWorkspace) {
    return <SocialAccountsSkeleton />
  }

  // Show skeleton when initial data is loading
  if (isLoading && !Array.isArray(socialAccounts)) {
    return <SocialAccountsSkeleton />
  }

  // Extract array from API response (handles { success: true, data: [...] } format)
  const socialAccountsArray = Array.isArray(socialAccounts) ? socialAccounts : (socialAccounts?.data || [])

  // All calculations AFTER early return guard - workspace is guaranteed ready here
  const connectedAccounts = socialAccountsArray.filter((account: any) => {
    return account.isConnected || account.followersCount > 0 || account.accessToken
  }) || []

  const isInitialLoading = isLoading && !Array.isArray(socialAccounts)
  const currentAccount = connectedAccounts.find((acc: any) => acc.platform === selectedAccount) || connectedAccounts[0]
  
  // Determine if this account is in initial sync state (connected but never synced)
  const isInitialSync = !!(currentAccount && !currentAccount.lastSyncAt && !currentAccount.lastSync && currentAccount.tokenStatus === 'valid')

  // Debug logging (now safe - workspace ready)
  if (currentAccount) {
    console.log('[FRONTEND DEBUG] Current account being displayed:', {
      username: currentAccount.username,
      platform: currentAccount.platform,
      totalShares: currentAccount.totalShares,
      totalSaves: currentAccount.totalSaves,
      totalLikes: currentAccount.totalLikes,
      totalComments: currentAccount.totalComments,
      hasTotalShares: 'totalShares' in currentAccount,
      hasTotalSaves: 'totalSaves' in currentAccount,
      allKeys: Object.keys(currentAccount)
    })
  }

  // Format numbers for display
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num?.toString() || '0'
  }

  /**
   * Format a polling-timer duration (in ms) into a compact human-readable
   * string: "<1m", "45m", "2h 58m", "3h", "1d 4h". Avoids raw large-minute
   * values like "178m".
   */
  const formatPollTimer = (ms: number | undefined): string => {
    if (ms === undefined || ms === null || !Number.isFinite(ms)) return 'N/A'
    const totalMinutes = Math.max(0, Math.round(ms / 1000 / 60))
    if (totalMinutes < 1) return '<1m'
    if (totalMinutes < 60) return `${totalMinutes}m`

    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (totalHours < 24) {
      return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`
    }

    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }

  /**
   * Format a polling CADENCE (interval, in ms) as a stable "every X" label,
   * e.g. "every 1h", "every 2h", "every 6h", "every 30m". This is how OFTEN a
   * metric polls — distinct from the live countdown to the next poll.
   */
  const formatCadence = (ms: number | undefined): string => {
    if (ms === undefined || ms === null || !Number.isFinite(ms) || ms <= 0) return 'N/A'
    const totalMinutes = Math.round(ms / 1000 / 60)
    if (totalMinutes < 60) return `every ${totalMinutes}m`
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (totalHours < 24) {
      return minutes > 0 ? `every ${totalHours}h ${minutes}m` : `every ${totalHours}h`
    }
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return hours > 0 ? `every ${days}d ${hours}h` : `every ${days}d`
  }

  /**
   * Format a "last sync" timestamp relative to now, auto-picking the unit
   * (minutes / hours / days) so it reads "5 minutes ago" / "5 hours ago" /
   * "2 days ago" instead of "307 minutes ago".
   */
  const formatRelativeSync = (timestamp: string | number | Date): string => {
    const then = new Date(timestamp).getTime()
    if (!Number.isFinite(then)) return 'Never'
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    const diffMs = then - Date.now()
    const diffMinutes = Math.round(diffMs / (1000 * 60))
    const absMinutes = Math.abs(diffMinutes)

    if (absMinutes < 60) {
      return rtf.format(diffMinutes, 'minute')
    }
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour')
    }
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    return rtf.format(diffDays, 'day')
  }

  // Calculate real engagement rate from authentic data
  const calculateEngagement = (account: any) => {
    if (!account.followersCount || account.followersCount === 0) return '0.0'

    // Use the server-calculated engagement rate directly (no artificial caps)
    if (account.engagementRate !== undefined && account.engagementRate !== null) {
      return account.engagementRate.toFixed(1)
    }

    if (account.avgEngagement) {
      return account.avgEngagement.toFixed(1)
    }

    // Fallback calculation using real metrics
    const totalEngagement = (account.totalLikes || 0) + (account.totalComments || 0)
    const avgEngagementPerPost = account.mediaCount ? totalEngagement / account.mediaCount : 0
    const engagementRate = account.followersCount ? (avgEngagementPerPost / account.followersCount) * 100 : 0

    return engagementRate.toFixed(1)
  }

  // Get platform icon
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
      case 'instagram_advanced': return Instagram
      case 'facebook': return Facebook
      case 'twitter': return Twitter
      case 'linkedin': return Linkedin
      case 'youtube': return Youtube
      default: return Instagram
    }
  }

  // Get platform color
  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'instagram':
      case 'instagram_advanced': return 'from-purple-500 to-pink-500'
      case 'facebook': return 'from-blue-600 to-blue-700'
      case 'twitter': return 'from-blue-400 to-blue-600'
      case 'linkedin': return 'from-blue-700 to-blue-900'
      case 'youtube': return 'from-red-500 to-red-700'
      default: return 'from-gray-500 to-gray-600'
    }
  }

  // Get platform background color
  const getPlatformBgColor = (platform: string) => {
    switch (platform) {
      case 'instagram':
      case 'instagram_advanced': return 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-700'
      case 'facebook': return 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700'
      case 'twitter': return 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700'
      case 'linkedin': return 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700'
      case 'youtube': return 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-800 dark:to-slate-700'
      default: return 'bg-gradient-to-br from-gray-50 to-slate-50 dark:from-slate-800 dark:to-slate-700'
    }
  }

  const getSafeAvatarUrl = (acc: any) => {
    const id = acc.accountId || acc.id
    const platform = (acc.platform || '').toLowerCase().replace('_advanced', '')
    if (id && (platform === 'facebook' || platform === 'instagram')) {
      return `/api/image-proxy/social?accountId=${encodeURIComponent(id)}&platform=${encodeURIComponent(platform)}`
    }
    // fallback: use stored URL directly
    return acc.profilePictureUrl || acc.profilePicture || ''
  }

  return (
    <Card data-testid="social-accounts" className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Enhanced Header */}
        <div className="p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Social accounts</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your connected platforms</p>
            </div>
            <div className="flex space-x-2">
              {/* Polling status indicator */}
              {pollingStatus && pollingStatus.totalAccounts > 0 && (
                <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-600 rounded text-xs text-green-700 dark:text-green-400">
                  {/* skeleton-guard-allow: status-dot — live "polling active" status indicator, not a loading placeholder */}
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Live polling active</span>
                </div>
              )}

              {/* SMART sync button for Instagram with rate limit protection */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Trigger smart sync with rate limit protection
                  syncMutation.mutate()
                  // Also immediately refresh the UI data
                  refetchAccounts()
                }}
                disabled={syncMutation.isPending}
                className="bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                title="Smart sync with rate limit protection - gets fresh data while respecting Meta's limits"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Smart Syncing...' : '🧠 Smart Sync'}
              </Button>

              <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200">
                See all accounts
              </Button>
            </div>
          </div>

          {/* Account Selector */}
          {(() => { const issues = detectInvalidAccounts(socialAccountsArray); return issues.count > 0 })() && (
            <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-600 rounded-xl">
              <div className="flex items-start space-x-2">
                <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  {(() => {
                    const c = getReconnectCopy(socialAccountsArray); return (
                      <>
                        <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">{c.title}</p>
                        <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">{c.description}</p>
                      </>
                    )
                  })()}
                </div>
              </div>
              <div className="mt-3">
                <Button
                  onClick={async () => {
                    const res = await startReconnectFlow(socialAccountsArray, currentWorkspace?.id)
                    if (res?.type === 'integrations') setLocation('/integration')
                  }}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reconnect
                </Button>
              </div>
            </div>
          )}
          <div className="flex space-x-2 overflow-x-auto">
            {connectedAccounts.map((account: any, index: number) => {
              const PlatformIcon = getPlatformIcon(account.platform)
              const isSelected = selectedAccount === account.platform

              return (
                <button
                  key={account.id || `account-${index}`}
                  onClick={() => setSelectedAccount(account.platform)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 flex-shrink-0 ${isSelected
                      ? 'bg-white dark:bg-gray-700 shadow-md border-2 border-blue-200 dark:border-blue-500'
                      : 'bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-gray-200 dark:border-gray-600'
                    }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white bg-gradient-to-r ${getPlatformColor(account.platform)} overflow-hidden`}>
                    {account.accountId ? (
                      <img
                        src={getSafeAvatarUrl(account)}
                        alt={account.username}
                        className="w-8 h-8 rounded-full object-cover"
                        onError={(e) => {
                          const t = e.currentTarget as HTMLImageElement;
                          t.style.display = 'none';
                          const fb = t.nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <PlatformIcon className="w-4 h-4" style={{ display: account.accountId ? 'none' : 'block' }} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{account.username}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{account.platform}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {isInitialLoading && (
          <div className="p-6">
            <SocialAccountCardSkeleton />
          </div>
        )}


        {currentAccount && (
          <div className={`p-6 ${getPlatformBgColor(currentAccount.platform)}`}>
            {/* Reconnect Warning - Show only when token is invalid/expired/missing */}
            {(currentAccount.tokenStatus && currentAccount.tokenStatus !== 'valid') ? (
              <div className="bg-white dark:bg-gray-700 rounded-2xl p-8 shadow-sm border-2 border-orange-200 dark:border-orange-600">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Reconnect Your {currentAccount.platform === 'instagram' ? 'Instagram' : currentAccount.platform} Account
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Your access token is missing or expired. Reconnect your account to start syncing your real followers, posts, and engagement data.
                  </p>
                  <Button
                    onClick={async () => {
                      const res = await startReconnectFlow([currentAccount], currentWorkspace?.id)
                      if (res?.type === 'integrations') setLocation('/integration')
                    }}
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reconnect Account
                  </Button>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                    After reconnecting, your real Instagram data will appear here automatically
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-700 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-600">
                {/* Account Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white bg-gradient-to-r ${getPlatformColor(currentAccount.platform)} overflow-hidden`}>
                      <img
                        src={getSafeAvatarUrl(currentAccount)}
                        alt={currentAccount.username}
                        className="w-16 h-16 rounded-full object-cover"
                        style={{ display: currentAccount.accountId ? 'block' : 'none' }}
                        onError={(e) => {
                          const t = e.currentTarget as HTMLImageElement;
                          t.style.display = 'none';
                          const fallback = t.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <span
                        className="text-2xl font-bold"
                        style={{ display: currentAccount.accountId ? 'none' : 'flex' }}
                      >
                        {currentAccount.username?.[0]?.toUpperCase() || 'A'}
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-lg">@{currentAccount.username}</div>
                      <div className="flex items-center space-x-2">
                        {currentAccount.tokenStatus === 'valid' ? (
                          <Badge className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-600">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                            token valid
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-600">
                            <div className="w-2 h-2 bg-orange-500 rounded-full mr-1"></div>
                            token {currentAccount.tokenStatus}
                          </Badge>
                        )}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {(isSyncing || (!currentAccount.lastSyncAt && !currentAccount.lastSync && currentAccount.tokenStatus === 'valid')) ? (
                            <span className="inline-flex items-center text-blue-500 dark:text-blue-400">
                              <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Syncing your account...
                            </span>
                          ) : (
                            <>Last sync: {currentAccount.lastSyncAt ?
                              formatRelativeSync(currentAccount.lastSyncAt) :
                              currentAccount.lastSync ? new Date(currentAccount.lastSync).toLocaleDateString() : 'Never'
                            }</>
                          )}
                        </span>
                      </div>
                      
                      {/* Detailed Real-time polling status for this account */}
                      {(() => {
                         const status = pollingStatus?.accounts?.find((acc: any) => acc.username === currentAccount.username);
                         if (!status || (!status.metricsInterval && !status.metricsPollIn)) return null;
                         
                         return (
                           <div className="mt-3 bg-blue-50/80 dark:bg-blue-900/20 p-2.5 rounded-lg border border-blue-100 dark:border-blue-800/30">
                             <div className="text-xs text-blue-600 dark:text-blue-400 mb-2 flex items-center space-x-1.5 font-semibold">
                               {/* skeleton-guard-allow: status-dot — live "smart polling cadence" status indicator, not a loading placeholder */}
                               <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                               <span>Smart Polling Cadence:</span>
                             </div>
                             <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">Likes / Reach</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2" title={`Next in ${formatPollTimer(status.metricsPollIn?.likes)}`}>{formatCadence(status.metricsInterval?.likes)}</span>
                               </div>
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">Account Insights</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2" title={`Next in ${formatPollTimer(status.metricsPollIn?.reach)}`}>{formatCadence(status.metricsInterval?.reach)}</span>
                               </div>
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">Shares / Saves</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2" title={`Next in ${formatPollTimer(status.metricsPollIn?.shares)}`}>{formatCadence(status.metricsInterval?.shares)}</span>
                               </div>
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">Followers</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2" title={`Next in ${formatPollTimer(status.metricsPollIn?.followers)}`}>{formatCadence(status.metricsInterval?.followers)}</span>
                               </div>
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">New Posts</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2" title={`Next in ${formatPollTimer(status.metricsPollIn?.newPosts)}`}>{formatCadence(status.metricsInterval?.newPosts)}</span>
                               </div>
                               <div className="flex justify-between w-full border-b border-blue-100/50 dark:border-blue-800/20 pb-1">
                                  <span className="text-gray-500 dark:text-gray-400">Stories</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2">{status.metricsInterval?.stories !== undefined ? formatCadence(status.metricsInterval.stories) : 'Idle'}</span>
                               </div>
                             </div>
                           </div>
                         );
                      })()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">{isInitialSync ? '-' : (currentAccount.mediaCount || 0)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total Posts</div>
                  </div>
                </div>

                {/* Key Metrics - Expanded to include Shares and Saves */}
                <div className="grid grid-cols-5 gap-3 mb-6">
                  <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl">
                    <div className="flex items-center justify-center mb-2">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {isInitialSync ? '-' : formatNumber(currentAccount.followersCount || currentAccount.followers || 0)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Followers</div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl">
                    <div className="flex items-center justify-center mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">
                      {isInitialSync ? '-' : `${calculateEngagement(currentAccount)}%`}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Engagement</div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl">
                    <div className="flex items-center justify-center mb-2">
                      <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                      {isInitialSync ? '-' : (currentAccount.mediaCount || currentAccount.posts || 0)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Posts</div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-xl">
                    <div className="flex items-center justify-center mb-2">
                      <Share2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      {isInitialSync ? '-' : formatNumber(currentAccount.totalShares || 0)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Shares</div>
                  </div>
                  <div className="text-center p-3 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 rounded-xl">
                    <div className="flex items-center justify-center mb-2">
                      <Bookmark className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                      {isInitialSync ? '-' : formatNumber(currentAccount.totalSaves || 0)}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Saves</div>
                  </div>
                </div>

                {/* Enhanced Engagement Metrics - Including Shares and Saves */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">Account Reach <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(28d)</span></h4>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400" title="Unique accounts reached in the last 28 days (Meta account-level reach)">{currentAccount.accountReach ?? currentAccount.totalReach ?? 0}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    Total engagement: {isInitialSync ? '- likes • - comments • - shares • - saves' : `${currentAccount.totalLikes || 0} likes • ${currentAccount.totalComments || 0} comments • ${currentAccount.totalShares || 0} shares • ${currentAccount.totalSaves || 0} saves`}
                  </div>
                  <div className="w-full bg-white dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min((currentAccount.accountReach ?? currentAccount.totalReach ?? 0) / 500 * 100, 100)}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Performance: {Number(currentAccount.avgComments || 0).toFixed(1)} avg comments per post
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => setLocation('/create')}
                    variant="outline"
                    size="sm"
                    className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-green-700 dark:hover:text-green-400 flex items-center space-x-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Create post</span>
                  </Button>
                  <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-purple-700 dark:hover:text-purple-400 flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4" />
                    <span>View insights</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rate-limit usage — shows BOTH App-Level and Account-Level Meta limits */}
        {connectedAccounts.length > 0 && (
          <div className="mt-4">
            <RateLimitUsagePanel />
          </div>
        )}

        {/* No accounts message */}
        {connectedAccounts.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No connected social accounts found.</p>
            <Button
              onClick={() => setLocation('/integration')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Connect Account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
