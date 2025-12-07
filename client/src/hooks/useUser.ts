import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useFirebaseAuth } from './useFirebaseAuth'

export const useUser = () => {
  const { user, loading: authLoading } = useFirebaseAuth()

  const { data: response, isLoading: userDataLoading, error } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: !!user && !authLoading,
    retry: 2,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: true
  })

  const userData = response?.user || response?.data || response

  return {
    user,
    userData,
    loading: authLoading || userDataLoading,
    error,
    isAuthenticated: !!user,
    isOnboarded: userData?.isOnboarded || false
  }
}
