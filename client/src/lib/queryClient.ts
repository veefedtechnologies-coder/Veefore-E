import { QueryClient } from '@tanstack/react-query'

export const SUBSCRIPTION_QUERY_KEY = ['subscription', 'me'] as const

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

/**
 * Keep the canonical subscription credit balance in sync after a metered API
 * operation. AI endpoints return `remainingCredits` either at the top level or
 * inside a streamed card. We patch the active header immediately, then refetch
 * `/subscription/me` in the background to reconcile all usage fields.
 */
export function syncAICreditsFromResponse(payload: unknown): void {
  const findRemainingCredits = (value: unknown, depth = 0): number | undefined => {
    if (!value || typeof value !== 'object' || depth > 4) return undefined

    const record = value as Record<string, unknown>
    if ('remainingCredits' in record) {
      const remaining = Number(record.remainingCredits)
      if (Number.isFinite(remaining) && remaining >= 0) return remaining
    }

    for (const key of ['data', 'result', 'card', 'cards', 'infoCard']) {
      const nested = record[key]
      if (Array.isArray(nested)) {
        for (const item of nested) {
          const remaining = findRemainingCredits(item, depth + 1)
          if (remaining !== undefined) return remaining
        }
      } else {
        const remaining = findRemainingCredits(nested, depth + 1)
        if (remaining !== undefined) return remaining
      }
    }

    return undefined
  }

  const remaining = findRemainingCredits(payload)
  if (remaining === undefined) return

  queryClient.setQueryData(SUBSCRIPTION_QUERY_KEY, (current: any) => {
    if (!current?.aiCredits) return current
    return {
      ...current,
      aiCredits: {
        ...current.aiCredits,
        remaining,
      },
    }
  })

  void queryClient.invalidateQueries({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    exact: true,
    refetchType: 'active',
  })
}

// Seed React Query from the server-injected bootstrap (SSR instant-load Phase 4)
// so the authenticated dashboard can render on the first byte with no /api/user
// round-trip. No-op when the server didn't inject data. Imported lazily to avoid
// a circular import and to keep this module side-effect-light.
import { hydrateQueryCacheFromBootstrap, getBootstrapUserData, syncActiveWorkspaceCookie } from './bootstrap'
hydrateQueryCacheFromBootstrap(queryClient)
// Mirror the active-workspace selection into the `vf_ws` cookie at startup so the
// NEXT load's SSR shell renders the correct workspace pill (no placeholder flash).
syncActiveWorkspaceCookie()

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
    } catch (error) {
      console.error('Failed to get Firebase auth token:', error)
      throw new Error('Authentication failed - please refresh the page')
    }
  } else if (getBootstrapUserData() != null) {
    // SSR instant-load: client Firebase session not restored yet, but the server
    // verified our session on this load — proceed with httpOnly session-cookie auth.
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
  if (pathname.includes('/api/user') || pathname.includes('/api/social-accounts') || pathname.includes('/api/workspaces') || pathname.includes('/api/content') || pathname.includes('/api/v1/ai') || pathname.includes('/api/social-listening') || pathname.includes('/api/chat/post-agent') || pathname.includes('/api/video/upload-image') || pathname.includes('/api/v1/analytics/reports')) {
    timeoutMs = 120000
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

  // Automatic token refresh on 401.
  //
  // The Firebase client SDK is the authoritative session: it persists across
  // restarts (browserLocalPersistence) and can always mint a fresh ID token via
  // getIdToken(true) as long as the user is still signed in — this works for BOTH
  // email/password users AND Google OAuth users (the latter were signed in via
  // signInWithCustomToken and hold a valid Firebase refresh token).
  //
  // Therefore the primary recovery path is to refresh the Firebase ID token and
  // retry. The server-side /api/auth/refresh (Google OAuth) endpoint is only a
  // fallback, and we NEVER force a logout while a live Firebase session exists —
  // doing so was the cause of spurious "automatic logouts".
  if (response.status === 401) {
    console.log('[Auth] Received 401, attempting token refresh...')

    // CROSS-TAB LOGOUT GUARD: if a logout just happened in any tab, do NOT try to
    // recover this 401 — recovering would mint a fresh token and re-create the
    // auth_token / __session cookies (via /api/auth/update-token), logging the
    // user back in. This tab is about to reload to a signed-out state.
    try {
      const { recentlyLoggedOut } = await import('./session')
      if (recentlyLoggedOut()) {
        throw new Error('Logged out')
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'Logged out') throw e
      /* import failure is non-fatal — continue with normal recovery */
    }

    // Helper: retry the original request with new headers and process the result.
    const retryOriginalRequest = async (retryHeaders: Record<string, string>) => {
      const retryController = new AbortController()
      const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs)
      try {
        return await fetch(url, {
          ...options,
          cache: 'no-store',
          headers: retryHeaders,
          credentials: 'include',
          signal: retryController.signal,
        })
      } finally {
        clearTimeout(retryTimeout)
      }
    }

    const processResponse = async (res: Response) => {
      if (res.status === 304) {
        throw new Error('Not Modified')
      }
      if (!res.ok) {
        const errorData = await res.text()
        console.error('API Error (after refresh):', res.status, res.statusText, errorData)
        throw new Error(`${res.status}: ${res.statusText} - ${errorData}`)
      }
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const payload = await res.json()
        if ((options.method || 'GET').toUpperCase() !== 'GET') {
          syncAICreditsFromResponse(payload)
        }
        return payload
      }
      return res.text()
    }

    // STRATEGY 1 (primary): Force Firebase to mint a fresh ID token and retry.
    // getIdToken(true) bypasses the cache and refreshes if the session is valid.
    try {
      if (auth.currentUser) {
        const freshToken = await auth.currentUser.getIdToken(true)
        console.log('[Auth] Forced a fresh Firebase ID token, retrying request...')

        const retryHeaders = { ...headers, 'Authorization': `Bearer ${freshToken}` }
        const retryResponse = await retryOriginalRequest(retryHeaders)

        if (retryResponse.status !== 401) {
          // Best-effort: keep the server cookie in sync with the fresh ID token.
          // Fire-and-forget so it never blocks or fails the user's request.
          fetch('/api/auth/update-token', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: freshToken }),
          }).catch(() => { /* non-fatal */ })

          return processResponse(retryResponse)
        }

        console.warn('[Auth] Request still 401 after fresh Firebase token, trying server refresh...')
      }
    } catch (firebaseRefreshError) {
      console.warn('[Auth] Direct Firebase ID token refresh failed, trying server refresh:', firebaseRefreshError)
    }

    // STRATEGY 2 (fallback): server-side Google OAuth refresh.
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (refreshResponse.ok) {
        console.log('[Auth] Server token refresh successful, exchanging tokens...')

        const refreshData = await refreshResponse.json()
        const customToken = refreshData.customToken
        let retryHeaders: Record<string, string> = { ...headers }

        if (customToken) {
          const { auth: fbAuth } = await import('@/lib/firebase')
          const { signInWithCustomToken } = await import('firebase/auth')

          const userCredential = await signInWithCustomToken(fbAuth, customToken)
          const idToken = await userCredential.user.getIdToken()
          retryHeaders = { ...retryHeaders, 'Authorization': `Bearer ${idToken}` }

          await fetch('/api/auth/update-token', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }).catch(() => { /* non-fatal */ })
        }

        const retryResponse = await retryOriginalRequest(retryHeaders)
        return processResponse(retryResponse)
      }

      console.warn('[Auth] Server token refresh failed:', refreshResponse.status)
    } catch (refreshError) {
      console.warn('[Auth] Server token refresh error:', refreshError)
    }

    // Both refresh strategies failed. Only force a re-login if the Firebase
    // session is genuinely gone. If the user is still signed in with Firebase,
    // keep them logged in and surface the error to React Query instead.
    if (!auth.currentUser) {
      // COOKIE-AUTH RECOVERY: we may be on the SSR cookie-auth path where the
      // server seeded a verified user but the client Firebase session is still
      // restoring. Wait briefly for it to restore and retry with a real Bearer
      // token before bouncing to sign-in — otherwise a returning user with a
      // valid (but slow) Firebase session gets wrongly kicked out.
      const restoredUser = await new Promise<any>((resolve) => {
        if (auth.currentUser) return resolve(auth.currentUser)
        const t = setTimeout(() => { try { unsub() } catch {} ; resolve(auth.currentUser || null) }, 3000)
        const unsub = onAuthStateChanged(auth, (u) => {
          if (u) { clearTimeout(t); try { unsub() } catch {} ; resolve(u) }
        }, () => { clearTimeout(t); resolve(null) })
      })

      if (restoredUser) {
        try {
          const freshToken = await restoredUser.getIdToken(true)
          const retryHeaders = { ...headers, 'Authorization': `Bearer ${freshToken}` }
          const retryResponse = await retryOriginalRequest(retryHeaders)
          if (retryResponse.status !== 401) {
            fetch('/api/auth/update-token', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: freshToken }),
            }).catch(() => { /* non-fatal */ })
            return processResponse(retryResponse)
          }
        } catch { /* fall through to sign-in */ }
      }

      console.log('[Auth] No live Firebase session after wait, redirecting to sign in...')
      try {
        fetch('/api/auth/debug-client-log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ src: 'queryClient', message: 'FORCED LOGOUT: no currentUser after 401', data: { url } }),
        }).catch(() => {})
      } catch { /* ignore */ }
      window.location.href = '/signin?expired=true'
      throw new Error('Session expired. Please sign in again.')
    }

    console.warn('[Auth] Refresh attempts failed but Firebase session is alive; not logging out.')
    throw new Error('401: Request failed after token refresh attempts')
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
    const payload = await response.json()
    if ((options.method || 'GET').toUpperCase() !== 'GET') {
      syncAICreditsFromResponse(payload)
    }
    return payload
  }

  return response.text()
}
