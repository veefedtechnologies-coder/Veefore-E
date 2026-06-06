import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiRequest } from '@/lib/queryClient'

export const useSocialAccounts = (workspaceId?: string) => {
  const { data: socialAccounts, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['/api/social-accounts', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      console.log('[useSocialAccounts] Fetching for workspace:', workspaceId);
      const response = await apiRequest(`/api/social-accounts?workspaceId=${workspaceId}`);
      console.log('[useSocialAccounts] Raw API response:', JSON.stringify(response).slice(0, 500));
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      console.warn('[useSocialAccounts] Unexpected response shape, returning empty array');
      return [];
    },
    enabled: !!workspaceId,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    placeholderData: undefined,
  })

  const accountsArray = Array.isArray(socialAccounts) ? socialAccounts : (socialAccounts?.data || [])
  
  const validAccounts = accountsArray.filter((a: any) => 
    (a?.isConnected || a?.tokenStatus) && 
    (a?.tokenStatus === 'valid' || a?.hasAccessToken || a?.accessToken)
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
