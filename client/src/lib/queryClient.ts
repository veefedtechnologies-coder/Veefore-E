import { QueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

// Create a client with optimized caching to prevent unnecessary refetches
// Data is cached for 10 minutes before becoming stale - this prevents refetch on navigation
// When data becomes stale, it will be refetched on next mount to ensure freshness
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutes - data is fresh for 10 min (prevents refetch on navigation)
      retry: 1, // Retry once for transient errors
      refetchOnWindowFocus: false, // Don't refetch when window regains focus (user preference)
      refetchOnReconnect: true, // Refetch on reconnect to ensure data is fresh after connection loss
      refetchOnMount: true, // Refetch on mount only if data is stale (default React Query behavior)
      refetchInterval: false, // Disable automatic polling
      refetchIntervalInBackground: false, // Disable background polling
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep cached data in memory for 24h
    },
  },
})

// Create persister for localStorage
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
})

// Persist the query client to localStorage
persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
})

// Get the correct API base URL based on current environment
function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl) return envUrl as string;
  return window.location.origin;
}

// API request function with authentication
export async function apiRequest(url: string, options: RequestInit = {}) {
  const { getAuth, onAuthStateChanged } = await import('firebase/auth')
  const auth = getAuth()

  const ensureUser = async (): Promise<any> => {
    if (auth.currentUser) return auth.currentUser
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('auth-timeout'))
      }, 2000)
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        clearTimeout(timer)
        unsubscribe()
        if (u) resolve(u); else reject(new Error('no-user'))
      }, (err) => { clearTimeout(timer); unsubscribe(); reject(err) })
    })
  }
  const user = await ensureUser().catch(() => null)

  // Ensure URL is absolute
  if (!url.startsWith('http')) {
    const baseUrl = getApiBaseUrl();
    url = `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
  }

  let headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...options.headers,
  }

  // Add auth token if user is authenticated
  if (user) {
    try {
      const token = await user.getIdToken(true)
      headers = {
        ...headers,
        'Authorization': `Bearer ${token}`,
      }
      console.log('API Request with auth token to:', url)
    } catch (error) {
      console.error('Failed to get Firebase auth token:', error)
      throw new Error('Authentication failed - please refresh the page')
    }
  } else {
    console.error('No authenticated user found for API request:', url)
    throw new Error('Please sign in to continue')
  }

  const controller = new AbortController()
  let timeoutMs = 15000
  const pathname = (() => {
    try { const u = new URL(url); return u.pathname || '' } catch { return url }
  })()
  if (pathname.includes('/api/user') || pathname.includes('/api/social-accounts') || pathname.includes('/api/workspaces')) {
    timeoutMs = 45000
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers,
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (response.status === 304) {
    return []
  }
  if (!response.ok) {
    const errorData = await response.text()
    console.error('API Error:', response.status, response.statusText, errorData)
    throw new Error(`${response.status}: ${response.statusText} - ${errorData}`)
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  }
  
  return response.text()
}
