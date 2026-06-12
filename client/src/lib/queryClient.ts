import { QueryClient } from '@tanstack/react-query'
// Removed insecure localStorage persistence modules

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
  'social-listening-overview',
  'social-listening-trends'
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

// REMOVED INSECURE PERSISTENCE: 
// Previously, persistQueryClient was used here with localStoragePersister.
// This exposed PII and auth tokens in plaintext localStorage.
// All query caching is now strictly in-memory.
// ONE-TIME MIGRATION: Purge stale persisted data from localStorage.
// Previous versions persisted social-accounts and dashboard data which
// caused stale empty arrays to block fresh API data from rendering.
const CACHE_VERSION_KEY = 'REACT_QUERY_CACHE_VERSION'
const CURRENT_CACHE_VERSION = '4' // Incremented to purge stale social-listening zero data
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
  // [AI CONTENT UI DISPLAY FIX - Task 3.2] Increase timeout for AI endpoints
  if (pathname.includes('/api/user') || pathname.includes('/api/social-accounts') || pathname.includes('/api/workspaces') || pathname.includes('/api/content') || pathname.includes('/api/v1/ai')) {
    timeoutMs = 60000
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  
  // [SERVER-SIDE OAUTH - Task 16.2] Include credentials for cookie-based authentication
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers,
    credentials: 'include', // Include HTTP-only cookies for server-side OAuth
    signal: controller.signal,
  })
  clearTimeout(timeout)

  // [SERVER-SIDE OAUTH - Task 16.2] Automatic token refresh on 401
  if (response.status === 401) {
    console.log('[Auth] Received 401, attempting token refresh...')
    
    // Try to refresh the token via server-side OAuth refresh endpoint
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include cookies
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (refreshResponse.ok) {
        console.log('[Auth] Token refresh successful, exchanging tokens...')
        
        // Get the custom token and exchange it for ID token
        const refreshData = await refreshResponse.json();
        const customToken = refreshData.customToken;
        
        if (customToken) {
          try {
            // Import Firebase auth dynamically to avoid circular dependencies
            const { auth } = await import('@/lib/firebase');
            const { signInWithCustomToken } = await import('firebase/auth');
            
            // Exchange custom token for ID token
            const userCredential = await signInWithCustomToken(auth, customToken);
            const idToken = await userCredential.user.getIdToken();
            
            // Update server cookie with ID token
            await fetch('/api/auth/update-token', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ idToken })
            });
            
            console.log('[Auth] Token exchange complete, retrying original request...');
          } catch (exchangeError) {
            console.error('[Auth] Token exchange failed:', exchangeError);
            throw exchangeError;
          }
        }
        
        // Retry the original request with new token
        const retryController = new AbortController()
        const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs)
        
        const retryResponse = await fetch(url, {
          ...options,
          cache: 'no-store',
          headers,
          credentials: 'include',
          signal: retryController.signal,
        })
        clearTimeout(retryTimeout)
        
        if (retryResponse.status === 304) {
          throw new Error('Not Modified')
        }
        if (!retryResponse.ok) {
          const errorData = await retryResponse.text()
          console.error('API Error (after refresh):', retryResponse.status, retryResponse.statusText, errorData)
          throw new Error(`${retryResponse.status}: ${retryResponse.statusText} - ${errorData}`)
        }
        
        const contentType = retryResponse.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const data = await retryResponse.json();
          console.log('[apiRequest DEBUG] Parsed JSON data (after refresh):', data);
          return data;
        }
        
        return retryResponse.text()
      } else {
        console.log('[Auth] Token refresh failed, redirecting to sign in...')
        // Redirect to sign in if refresh fails
        window.location.href = '/signin?expired=true'
        throw new Error('Session expired. Please sign in again.')
      }
    } catch (refreshError) {
      console.error('[Auth] Token refresh error:', refreshError)
      // If refresh fails, redirect to sign in
      window.location.href = '/signin?expired=true'
      throw new Error('Session expired. Please sign in again.')
    }
  }

  if (response.status === 304) {
    throw new Error('Not Modified') // Let React Query handle the error or HTTP cache handle it
  }
  if (!response.ok) {
    const errorData = await response.text()
    console.error('API Error:', response.status, response.statusText, errorData)
    throw new Error(`${response.status}: ${response.statusText} - ${errorData}`)
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    // [DIAGNOSTIC LOGGING - Task 1: Bug Condition Exploration]
    console.log('[apiRequest DEBUG] Parsed JSON data:', data);
    console.log('[apiRequest DEBUG] Data type:', typeof data);
    console.log('[apiRequest DEBUG] Has success property:', 'success' in data);
    return data;
  }

  return response.text()
}
