import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { clearClientSessionState } from './session-cleanup'

export const logout = async () => {
  try {
    // [SERVER-SIDE OAUTH - Task 16.2] Call server-side logout endpoint to clear auth cookies
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        console.log('[Auth] Server-side logout successful')
      } else {
        console.warn('[Auth] Server-side logout failed:', response.status)
        // Continue with client-side logout even if server-side fails
      }
    } catch (serverLogoutError) {
      console.error('[Auth] Server-side logout error:', serverLogoutError)
      // Continue with client-side logout even if server-side fails
    }
    
    // Sign out from Firebase
    await signOut(auth)

    // Wipe ALL per-user client state (localStorage + sessionStorage + React Query
    // cache) so a different account on this browser can't see the previous user's
    // data. Keeps only device-level settings (theme, cookie consent, email prefill).
    clearClientSessionState()

    // CROSS-TAB LOGOUT: broadcast to other open tabs. Set AFTER the wipe so the
    // signal survives. Other tabs listen (see useFirebaseAuth) and hard reload to
    // a signed-out state.
    try { localStorage.setItem('veefore_logout', String(Date.now())) } catch { /* ignore */ }
    
    // Force redirect to landing page
    window.location.href = '/'
  } catch (error) {
    console.error('Logout error:', error)
    throw error
  }
}

// Additional security functions
export const isAuthenticated = () => {
  return !!auth.currentUser
}

export const getCurrentUser = () => {
  return auth.currentUser
}

export const requireAuth = () => {
  if (!isAuthenticated()) {
    window.location.href = '/'
    return false
  }
  return true
}