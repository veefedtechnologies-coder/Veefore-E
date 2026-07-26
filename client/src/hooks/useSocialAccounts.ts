import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiRequest } from '@/lib/queryClient'

export const useSocialAccounts = (workspaceId?: string) => {
  const { data: socialAccounts, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['/api/social-accounts', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const response = await apiRequest(`/api/social-accounts?workspaceId=${workspaceId}`);
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      return [];
    },
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Use the cache across page switches (no refetch on navigation). Data is
    // seeded/fetched accurately and kept fresh by invalidations (connect/
    // disconnect, webhooks), the 10-min refetchInterval, and refetchOnReconnect —
    // so navigating back to the dashboard is instant from cache.
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    placeholderData: undefined,
  })

  const accountsArray = Array.isArray(socialAccounts) ? socialAccounts : (socialAccounts?.data || [])
  
  const validAccounts = accountsArray.filter((a: any) => 
    // Support both old Instagram accounts (tokenStatus field) and new
    // multi-platform accounts (connectionStatus field, encrypted token).
    a?.connectionStatus === 'ACTIVE' ||
    (a?.tokenStatus === 'valid') ||
    (a?.isActive && (a?.hasAccessToken || a?.encryptedAccessToken))
  )
  
  const invalidAccounts = accountsArray.filter((a: any) => 
    (a?.isConnected || a?.tokenStatus) && 
    a?.tokenStatus && 
    a.tokenStatus !== 'valid'
  )

  return { 
    socialAccounts: accountsArray, 
    isLoading, 
    isFetching,
    refetch,
    validAccounts, 
    invalidAccounts 
  }
}
