import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorModal } from '@/components/ui/error-modal'
import { 
  Instagram, 
  Facebook, 
  Twitter, 
  Linkedin, 
  Youtube, 
  Video,
  Plus,
  Check,
  Zap,
  Users,
  BarChart3,
  Calendar,
  Settings,
  RefreshCw,
  Shield,
  Sparkles,
  Key,
  CheckCircle,
  Lock,
  ArrowUpDown
} from 'lucide-react'
// import { TokenConverter } from '../components/dashboard/token-converter' // Commented out for now
import { useCurrentWorkspace } from '../components/WorkspaceSwitcher'

interface SocialAccount {
  id: string
  platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok'
  username: string
  displayName?: string
  followers?: number
  isConnected: boolean
  isVerified?: boolean
  lastSync?: string
  profilePicture?: string
  accessToken?: string
  hasAccessToken?: boolean
  tokenStatus?: 'valid' | 'expired' | 'invalid' | 'missing'
}

const platformConfig = {
  instagram: {
    name: 'Instagram',
    icon: Instagram,
    color: 'from-pink-500 to-rose-500',
    bgColor: 'bg-gradient-to-br from-pink-50 to-rose-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-700',
    description: 'Connect your Instagram Business account to schedule posts, stories, and reels',
    features: ['Auto-posting', 'Stories & Reels', 'Analytics', 'DM Management'],
    pricing: 'Free'
  },
  facebook: {
    name: 'Facebook',
    icon: Facebook,
    color: 'from-blue-600 to-blue-700',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    description: 'Connect your Facebook Page to manage posts and engage with your audience',
    features: ['Page posting', 'Audience insights', 'Ad integration', 'Events'],
    pricing: 'Free'
  },
  twitter: {
    name: 'Twitter',
    icon: Twitter,
    color: 'from-sky-400 to-sky-600',
    bgColor: 'bg-gradient-to-br from-sky-50 to-cyan-50',
    borderColor: 'border-sky-200',
    textColor: 'text-sky-700',
    description: 'Connect your Twitter account to schedule tweets and monitor engagement',
    features: ['Tweet scheduling', 'Thread posting', 'Engagement tracking', 'Hashtag analytics'],
    pricing: 'Pro'
  },
  linkedin: {
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'from-blue-700 to-blue-800',
    bgColor: 'bg-gradient-to-br from-blue-50 to-slate-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    description: 'Connect your LinkedIn profile or company page for professional networking',
    features: ['Professional posts', 'Company updates', 'Network analytics', 'Lead generation'],
    pricing: 'Pro'
  },
  youtube: {
    name: 'YouTube',
    icon: Youtube,
    color: 'from-red-500 to-red-600',
    bgColor: 'bg-gradient-to-br from-red-50 to-orange-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    description: 'Connect your YouTube channel to manage video content and analytics',
    features: ['Video scheduling', 'Thumbnail design', 'Analytics dashboard', 'Community posts'],
    pricing: 'Business'
  },
  tiktok: {
    name: 'TikTok',
    icon: Video,
    color: 'from-black to-gray-800',
    bgColor: 'bg-gradient-to-br from-gray-50 to-slate-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-700',
    description: 'Connect your TikTok account to schedule viral content and track trends',
    features: ['Video scheduling', 'Trend analysis', 'Hashtag research', 'Performance metrics'],
    pricing: 'Business'
  }
}

export default function Integration() {
  return (
    <>
      <SEO 
        {...seoConfig.analytics}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <IntegrationContent />
    </>
  )
}

function IntegrationContent() {
  const queryClient = useQueryClient()
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false)
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'error' | 'warning' | 'constraint'
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'error'
  })

  console.log('Integration component rendering...')

  // Get current workspace (reactive to workspace switching) - MOVED UP to fix reference error
  const { currentWorkspace, workspaces } = useCurrentWorkspace();

  // Real-time WebSocket listener for instant social account updates
  useEffect(() => {
    if (!currentWorkspace?.id) return

    const handleSocialAccountUpdate = (data: any) => {
      console.log('🔄 Real-time social account update received:', data)
      // Instantly update React Query cache without loading state
      queryClient.setQueryData(['/api/social-accounts', currentWorkspace.id], (oldData) => {
        if (!oldData) return oldData
        if (data.type === 'connected') {
          return Array.isArray(oldData) ? [...oldData, data.account] : [data.account]
        } else if (data.type === 'disconnected') {
          return Array.isArray(oldData) ? oldData.filter((acc: any) => acc.id !== data.accountId) : []
        }
        return oldData
      })
    }

    // Listen for real-time updates (assuming WebSocket is available)
    if ((window as any).socket) {
      (window as any).socket.on('social-account-update', handleSocialAccountUpdate)
      return () => (window as any).socket.off('social-account-update', handleSocialAccountUpdate)
    }
  }, [currentWorkspace?.id, queryClient])

  // Check for OAuth callback success and refresh data (only once)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get('success')
    const connected = urlParams.get('connected')
    const error = urlParams.get('error')
    
    // Only process if there are OAuth parameters
    if (!success && !connected && !error) return
    
    setIsProcessingOAuth(true)
    
    if (success === 'true' || connected === 'instagram' || connected === 'youtube') {
      console.log('✅ OAuth callback success detected, triggering IMMEDIATE data refresh...')
      
      // Clean up URL parameters first to prevent double execution
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
      const username = urlParams.get('username')
      
      // ✅ IMMEDIATE REFETCH - Force fetch fresh data right now (not background)
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] }),
        queryClient.refetchQueries({ queryKey: ['/api/social-accounts'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['/api/workspaces'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['/api/dashboard/analytics'], type: 'active' })
      ]).then(async () => {
        // Trigger an immediate force sync to populate initial metrics
        try {
          if (currentWorkspace?.id) {
            await apiRequest('/api/instagram/force-sync', {
              method: 'POST',
              body: JSON.stringify({ workspaceId: currentWorkspace.id })
            })
            // Refetch social accounts after force sync completes
            await queryClient.refetchQueries({ queryKey: ['/api/social-accounts'], type: 'active' })
          }
        } catch (e) {
          console.error('Immediate force-sync after OAuth failed:', e)
        }
        console.log('✅ OAuth success: IMMEDIATE data refresh complete - real metrics should now be visible!')
        console.log(`✅ Connected account: @${username || 'unknown'}`)
        setIsProcessingOAuth(false)
      }).catch((err) => {
        console.error('❌ OAuth success but data refresh failed:', err)
        setIsProcessingOAuth(false)
      })
    } else if (error) {
      console.log('OAuth callback error detected:', error)
      
      // Clean up URL parameters first (don't invalidate queries for errors)
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
      
      // Handle specific error messages with modal
      let errorTitle = "Connection Failed"
      let errorDescription = "Failed to connect your social media account."
      let errorType: 'error' | 'warning' | 'constraint' = 'error'
      
      if (error.includes('already connected') || error.includes('another workspace')) {
        errorTitle = "Account Already Connected"
        errorDescription = decodeURIComponent(error)
        errorType = 'constraint'
      } else if (error === 'token_exchange_failed') {
        errorDescription = "Authentication failed. Please try again."
      } else if (error === 'profile_fetch_failed') {
        errorDescription = "Could not fetch your profile information. Please try again."
      } else if (error === 'missing_code_or_state') {
        errorDescription = "Authentication flow was interrupted. Please try again."
      } else if (error === 'invalid_state') {
        errorDescription = "Invalid authentication state. Please try again."
      } else {
        errorDescription = decodeURIComponent(error)
      }
      
      setErrorModal({
        isOpen: true,
        title: errorTitle,
        message: errorDescription,
        type: errorType
      })
      
      // Don't trigger loading state for errors
      setIsProcessingOAuth(false)
    }
  }, [])

  // Advanced: Always show page immediately - even without workspace data
  const { data: connectedAccounts = [], isLoading } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspace?.id || 'loading'],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const response = await apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`);
      // API returns { success: true, data: [...] } - extract the data array
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      return [];
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    notifyOnChangeProps: ['data'],
    placeholderData: []
  })

  // Show skeleton only when a workspace exists and data is loading
  const shouldShowSkeleton = !!currentWorkspace?.id && isLoading

  console.log('Integration state:', { 
    isLoading, 
    connectedAccounts: connectedAccounts?.length || 0, 
    workspaces: workspaces?.length || 0,
    currentWorkspace: currentWorkspace?.id || 'none'
  });

  // Advanced: Optimistic updates - immediately show "connecting" state without waiting
  const handleOptimisticConnect = (platform: string) => {
    if (!currentWorkspace) return

    // Optimistically add "connecting" account to UI
    const optimisticAccount = {
      id: `temp-${Date.now()}`,
      platform,
      username: 'Connecting...',
      isConnecting: true,
      profilePictureUrl: null
    }

    queryClient.setQueryData(['/api/social-accounts', currentWorkspace.id], (oldData: any = []) => [
      ...oldData,
      optimisticAccount
    ])
  }

  // Handle real OAuth connection for Instagram and YouTube
  const handleOAuthConnect = async (platform: string) => {
    if (!currentWorkspace) {
      setErrorModal({
        isOpen: true,
        title: "No Workspace Found",
        message: "Please create a workspace first to connect social accounts.",
        type: "error"
      })
      return
    }

    try {
      setConnectingPlatform(platform)
      handleOptimisticConnect(platform) // Show immediate feedback
      
      if (platform === 'instagram') {
        // Use secure reconnect/start which validates workspace ownership and cleans tokens
        const response = await apiRequest(`/api/instagram/reconnect/start`, {
          method: 'POST',
          body: JSON.stringify({ workspaceId: currentWorkspace.id })
        })
        const url = (response as any).url || (response as any).authUrl
        if (url) {
          window.location.href = url
        } else {
          throw new Error('No auth URL returned from server')
        }
      } else if (platform === 'youtube') {
        // Get YouTube OAuth URL
        const response = await apiRequest(`/api/youtube/auth?workspaceId=${currentWorkspace.id}`)
        if (response.authUrl) {
          window.location.href = response.authUrl
        }
      } else {
        // For other platforms, use mock connection for now
        await new Promise(resolve => setTimeout(resolve, 2000))
        await apiRequest(`/api/social-accounts/connect/${platform}`, {
          method: 'POST'
        })
        
        // Success - no modal needed for success messages
        queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
        setConnectingPlatform(null)
      }
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        title: "Connection Failed",
        message: `Failed to connect ${platformConfig[platform as keyof typeof platformConfig].name}: ${error.message}`,
        type: "error"
      })
      setConnectingPlatform(null)
    }
  }

  // Connect social account mutation
  const connectMutation = useMutation({
    mutationFn: handleOAuthConnect,
    onError: (error: any, platform) => {
      setErrorModal({
        isOpen: true,
        title: "Connection Failed",
        message: `Failed to connect ${platformConfig[platform as keyof typeof platformConfig].name}: ${error.message}`,
        type: "error"
      })
      setConnectingPlatform(null)
    }
  })

  // Disconnect social account mutation
  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}`, {
        method: 'DELETE'
      })
    },
    onSuccess: () => {
      // Success - no modal needed for success messages
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
    },
    onError: (error: any) => {
      setErrorModal({
        isOpen: true,
        title: "Disconnect Failed",
        message: `Failed to disconnect account: ${error.message}`,
        type: "error"
      })
    }
  })

  // Refresh/sync social account data mutation
  const refreshMutation = useMutation({
    mutationFn: async (platform: string) => {
      if (platform === 'instagram') {
        return apiRequest('/api/instagram/force-sync', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: currentWorkspace?.id })
        })
      }
      throw new Error('Platform not supported for refresh')
    },
    onSuccess: () => {
      // Success - no modal needed for success messages
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
    },
    onError: (error: any, platform: string) => {
      setErrorModal({
        isOpen: true,
        title: "Refresh Failed",
        message: `Failed to refresh ${platformConfig[platform as keyof typeof platformConfig].name}: ${error.message}`,
        type: "error"
      })
    }
  })

  // Token conversion mutation
  const tokenConversionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/instagram/convert-tokens', {
        method: 'POST'
      })
    },
    onSuccess: () => {
      setErrorModal({
        isOpen: true,
        title: "Token Conversion Initiated",
        message: "Personal tokens are being converted to business tokens. This may take a few moments.",
        type: "warning"
      })
    },
    onError: (error: any) => {
      setErrorModal({
        isOpen: true,
        title: "Token Conversion Failed",
        message: error.message || "Failed to convert tokens. Please try again.",
        type: "error"
      })
    }
  })

  // Handle token conversion
  const handleTokenConversion = () => {
    tokenConversionMutation.mutate()
  }

  const isAccountConnected = (platform: string) => {
    return Array.isArray(connectedAccounts) && connectedAccounts.some((account: SocialAccount) => account.platform === platform)
  }

  const getConnectedAccount = (platform: string) => {
    return Array.isArray(connectedAccounts) ? connectedAccounts.find((account: SocialAccount) => account.platform === platform) : undefined
  }

  const formatFollowersCount = (count: number | undefined) => {
    if (!count || count === 0) return '0'
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
  }

  const hasValidAccessToken = (account: SocialAccount | undefined) => {
    if (!account) return false
    if (account.tokenStatus) return account.tokenStatus === 'valid'
    if (typeof account.hasAccessToken === 'boolean') return account.hasAccessToken
    return !!(account.accessToken && account.accessToken.trim() !== '')
  }

  const renderPlatformCard = (platform: keyof typeof platformConfig) => {
    const config = platformConfig[platform]
    const Icon = config.icon
    const isConnected = isAccountConnected(platform)
    const connectedAccount = getConnectedAccount(platform)
    const isConnecting = connectingPlatform === platform
    const hasAccessToken = hasValidAccessToken(connectedAccount)

    return (
      <Card key={platform} className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg border-2 ${config.borderColor} ${config.bgColor}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-xl bg-gradient-to-r ${config.color} shadow-lg`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">{config.name}</CardTitle>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant={config.pricing === 'Free' ? 'default' : 'secondary'} className="text-xs">
                    {config.pricing}
                  </Badge>
                  {isConnected && (
                    <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-600">
                      <Check className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {isConnected && connectedAccount?.isVerified && (
              <div className="flex items-center">
                <Shield className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <CardDescription className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {config.description}
          </CardDescription>

          {/* Connected Account Info */}
          {isConnected && connectedAccount && (
            <>
              <div className="mb-4 p-3 bg-white/60 dark:bg-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-3">
                  {connectedAccount.profilePicture && (
                    <img 
                      src={connectedAccount.profilePicture} 
                      alt={connectedAccount.displayName || connectedAccount.username}
                      className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-600 shadow-sm"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">@{connectedAccount.username}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{formatFollowersCount(connectedAccount.followers)} followers</p>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Last synced: {connectedAccount.lastSync ? new Date(connectedAccount.lastSync).toLocaleDateString() : 'Never'}
                </div>
              </div>

              {/* Warning Banner for Missing/Invalid Token */}
              {(() => {
                const params = new URLSearchParams(window.location.search)
                const oauthSuccess = params.get('success') === 'true' && params.get('connected') === 'instagram'
                const isInvalid = (!hasAccessToken || connectedAccount.tokenStatus === 'expired' || connectedAccount.tokenStatus === 'invalid' || connectedAccount.tokenStatus === 'missing')
                return isInvalid && !oauthSuccess
              })() && (
                <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-600 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Reconnection Required</p>
                      <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                        Your access token has expired or is missing. Please reconnect to continue using analytics and posting features.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Features */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Features</h4>
            <div className="grid grid-cols-2 gap-2">
              {config.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Sparkles className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {isConnected ? (
              !hasAccessToken ? (
                <Button
                  onClick={() => connectMutation.mutate(platform)}
                  disabled={isConnecting || connectMutation.isPending}
                  className={`w-full bg-gradient-to-r ${config.color} hover:opacity-90 text-white shadow-lg`}
                >
                  {isConnecting ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  {isConnecting ? 'Reconnecting...' : 'Reconnect Account'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshMutation.mutate(platform)}
                    disabled={refreshMutation.isPending}
                    className="flex-1"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(connectedAccount!.id)}
                    disabled={disconnectMutation.isPending}
                    className="flex-1 text-red-600 dark:text-red-400 border-red-200 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Disconnect
                  </Button>
                </>
              )
            ) : (
              <Button
                onClick={() => connectMutation.mutate(platform)}
                disabled={isConnecting || connectMutation.isPending}
                className={`w-full bg-gradient-to-r ${config.color} hover:opacity-90 text-white shadow-lg`}
              >
                {isConnecting ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {isConnecting ? 'Connecting...' : 'Connect Account'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Skeleton Loading Components for better UX
  const PlatformCardSkeleton = () => (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          </div>
          <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="space-y-2 mb-4">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
        </div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </CardContent>
    </Card>
  )

  const StatCardSkeleton = () => (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  console.log('Integration - rendering main content')

  // CRITICAL: Always render page structure immediately - no conditional returns
  const pageStructure = (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header - Always visible immediately */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-xl">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-gray-900 via-blue-800 to-purple-900 bg-clip-text text-transparent mb-4">
            Connect Your Social Accounts
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Integrate your social media accounts to streamline content creation, scheduling, and analytics across all platforms
          </p>
        </div>

        {/* Stats Cards - Show skeleton while loading */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {shouldShowSkeleton ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-blue-200 dark:border-blue-600">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{connectedAccounts?.length || 0}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Connected Accounts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-600">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <BarChart3 className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {Array.isArray(connectedAccounts) ? connectedAccounts.reduce((total: number, account: SocialAccount) => total + (account.followers || 0), 0) : 0}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Followers</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border-purple-200 dark:border-purple-600">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">24/7</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Auto Scheduling</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Available Platforms */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
            <Settings className="w-6 h-6 mr-3 text-blue-600" />
            Available Platforms
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shouldShowSkeleton ? (
              // Show skeleton cards while loading
              <>
                <PlatformCardSkeleton />
                <PlatformCardSkeleton />
                <PlatformCardSkeleton />
                <PlatformCardSkeleton />
                <PlatformCardSkeleton />
                <PlatformCardSkeleton />
              </>
            ) : (
              Object.keys(platformConfig).map((platform) => 
                renderPlatformCard(platform as keyof typeof platformConfig)
              )
            )}
          </div>
        </div>

        {/* Connected Accounts Section */}
        {Array.isArray(connectedAccounts) && connectedAccounts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
              <CheckCircle className="w-6 h-6 mr-3 text-green-600" />
              Connected Accounts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {connectedAccounts.map((account: any) => (
                <Card key={account.id} className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-600">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          {(() => {
                            const IconComponent = platformConfig[account.platform as keyof typeof platformConfig]?.icon;
                            return IconComponent ? <IconComponent className="w-6 h-6" /> : null;
                          })()}
                        </div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                          {account.platform}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">@{account.username}</p>
                      </div>
                    </div>
                    
                    {account.profilePictureUrl && (
                      <div className="flex items-center space-x-3 mb-4">
                        <img 
                          src={account.profilePictureUrl} 
                          alt={`${account.username} profile`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {account.displayName || account.username}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {formatFollowersCount(account.followers)} followers
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Status:</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">Connected</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Last Sync:</span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {account.lastSync ? new Date(account.lastSync).toLocaleDateString() : 'Never'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Instagram Token Converter */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
            <Key className="w-6 h-6 mr-3 text-blue-600" />
            Instagram Token Converter
          </h2>
          <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 border-orange-200 dark:border-orange-600">
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <RefreshCw className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Convert Personal to Business Token
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    If you have a personal Instagram account connected, convert it to a business account 
                    to unlock advanced features like analytics and scheduling.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Advanced Analytics</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Scheduled Publishing</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Story Insights</span>
                    </div>
                  </div>
                  <Button 
                    onClick={handleTokenConversion}
                    disabled={tokenConversionMutation.isPending}
                    className="mt-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                  >
                    {tokenConversionMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                    )}
                    Convert to Business
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Advanced Features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border-purple-200 dark:border-purple-600">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Real-time Sync
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatic data synchronization every 30 seconds
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Live metrics updates</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Instant notifications</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Background refresh</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 border-emerald-200 dark:border-emerald-600">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Secure & Private
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enterprise-grade security and privacy protection
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">OAuth 2.0 authentication</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Encrypted data storage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">No password storage</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Error Modal */}
      <ErrorModal 
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
        title={errorModal.title}
        message={errorModal.message}
        type={errorModal.type}
      />
    </div>
  )

  return pageStructure
}
