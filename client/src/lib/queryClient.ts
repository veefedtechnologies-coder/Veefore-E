import { QueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

// Volatile query prefixes that should NEVER be persisted to localStorage.
// These queries change frequently and stale cached data causes the dashboard
// to show empty/"Connect" states even when accounts are connected.
// CRITICAL: Also include automation query keys - stale account/post data
// from previously connected accounts must never be served from cache.
const VOLATILE_QUERY_PREFIXES = [
  '/api/social-accounts',
  '/api/dashboard',
  '/api/analytics',
  '/api/instagram',
  'automation-social-accounts',
  'automation-instagram-content',
]

// Create a client with optimized caching to prevent unnecessary refetches
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes - reduced from 10min to prevent stale empty data from blocking fresh fetches
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

// Persist the query client to localStorage, but EXCLUDE volatile queries
// that change frequently (social accounts, dashboard, analytics).
// Persisting these caused stale empty arrays to block fresh data from rendering.
persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Only persist queries that are NOT in the volatile list
      const queryKey = query.queryKey[0]
      if (typeof queryKey === 'string') {
        return !VOLATILE_QUERY_PREFIXES.some(prefix => queryKey.startsWith(prefix))
      }
      return true
    },
  },
})

// ONE-TIME MIGRATION: Purge stale persisted data from localStorage.
// Previous versions persisted social-accounts and dashboard data which
// caused stale empty arrays to block fresh API data from rendering.
const CACHE_VERSION_KEY = 'REACT_QUERY_CACHE_VERSION'
const CURRENT_CACHE_VERSION = '3' // Incremented to purge stale arpit.10 account data from automation
if (localStorage.getItem(CACHE_VERSION_KEY) !== CURRENT_CACHE_VERSION) {
  console.log('[QueryClient] Purging stale persisted cache (version upgrade)')
  localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE')
  // Also remove the default tanstack persist key
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('tanstack') || key.includes('react-query')) {
      localStorage.removeItem(key)
    }
  }
  localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION)
}

// Get the correct API base URL based on current environment
// Returns empty string for relative URLs (recommended for dev) which auto-use current origin
function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl) return envUrl as string;
  // Use empty string for relative URLs - this automatically uses current page origin
  // Works correctly for both localhost and ngrok tunnel access
  return '';
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

  let headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  }

  if (options.body && options.body instanceof FormData) {
    // Let browser set the Content-Type automatically for FormData with boundary
  } else {
    headers['Content-Type'] = 'application/json'
  }

  headers = { ...headers, ...(options.headers as any) }

  // Add auth token if user is authenticated
  if (user) {
    try {
      const token = await user.getIdToken()
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
  if (pathname.includes('/api/user') || pathname.includes('/api/social-accounts') || pathname.includes('/api/workspaces') || pathname.includes('/api/content')) {
    timeoutMs = 60000
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
