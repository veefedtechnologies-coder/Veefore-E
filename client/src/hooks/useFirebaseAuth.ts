import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ensureSessionCookie, clearSessionCookie } from '@/lib/session'
import { setAuthHint, clearAuthHint } from '@/lib/bootstrap'
import { clearClientSessionState } from '@/lib/session-cleanup'

export const useFirebaseAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const hasInitialized = useRef(false)
  const sessionRestoreAttempted = useRef(false)
  const authListenerSet = useRef(false)
  const wasAuthed = useRef(false)

  useEffect(() => {
    // Only run once - absolute guard
    if (authListenerSet.current) {
      console.log('useFirebaseAuth: Already initialized, skipping')
      return
    }
    
    authListenerSet.current = true
    console.log('useFirebaseAuth: Initializing (ONCE)')

    if (!auth) {
      console.error('useFirebaseAuth: Firebase auth not available')
      setLoading(false)
      hasInitialized.current = true
      return
    }

    // Set up Firebase auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('useFirebaseAuth: Auth state changed', {
        hasUser: !!firebaseUser,
        uid: firebaseUser?.uid,
        email: firebaseUser?.email
      })
      if (firebaseUser) {
        // User is authenticated
        console.log('useFirebaseAuth: ✅ User authenticated')
        setUser(firebaseUser)
        setLoading(false)
        hasInitialized.current = true
        wasAuthed.current = true
        // Persist an optimistic-auth hint so the next refresh never flashes the
        // public landing on `/` before Firebase restores (anti landing-flash).
        setAuthHint()
        // Clear any stale cross-tab logout flag now that we're authenticated again
        // — otherwise recentlyLoggedOut() would block session-cookie creation and
        // 401-recovery for up to 15s after a logout→login-again within the window.
        try { localStorage.removeItem('veefore_logout') } catch { /* ignore */ }

        // Phase 1: ensure a server session cookie exists so the next HTML load
        // can render the dashboard data on the first byte. Fire-and-forget.
        firebaseUser
          .getIdToken()
          .then((idToken) => ensureSessionCookie(idToken))
          .catch(() => { /* non-fatal */ })
      } else if (!sessionRestoreAttempted.current) {
        // Try to restore session from cookie (OAuth flow)
        sessionRestoreAttempted.current = true
        console.log('useFirebaseAuth: Attempting session restore from cookie...')

        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
            }
          })

          console.log('useFirebaseAuth: Session API response:', {
            status: response.status,
            ok: response.ok
          })

          if (response.ok) {
            const data = await response.json()
            const customToken = data.data?.customToken || data.customToken

            if (customToken) {
              console.log('useFirebaseAuth: Got custom token, signing in...')
              const userCredential = await signInWithCustomToken(auth, customToken)
              console.log('useFirebaseAuth: ✅ Signed in with custom token')
              
              // Get the ID token from Firebase after signing in
              const idToken = await userCredential.user.getIdToken()
              console.log('useFirebaseAuth: Got ID token, updating server cookie...')
              
              // Send the ID token back to server to update the cookie
              try {
                await fetch('/api/auth/update-token', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ idToken })
                })
                console.log('useFirebaseAuth: ✅ Server cookie updated with ID token')
              } catch (error) {
                console.error('useFirebaseAuth: Failed to update server cookie:', error)
                // Continue anyway - the session is still valid on client side
              }
              
              console.log('useFirebaseAuth: ✅ Session restored successfully')
              // onAuthStateChanged will fire again with the user
              return // Don't set loading=false yet, wait for onAuthStateChanged
            } else {
              console.log('useFirebaseAuth: No custom token in response')
            }
          } else {
            // Handle stale/invalid session — clear state and redirect to sign-in
            try {
              const errData = await response.json().catch(() => ({}))
              if (errData?.requiresReauth || errData?.error === 'user_not_found') {
                console.warn('useFirebaseAuth: Stale session detected (user_not_found) — clearing cookies and redirecting to sign-in')
                try { clearClientSessionState() } catch { /* ignore */ }
                try { clearAuthHint() } catch { /* ignore */ }
                // Hard redirect to sign-in so user gets a clean session
                window.location.href = '/signin'
                return
              }
            } catch { /* ignore */ }
            console.log('useFirebaseAuth: No server session (status:', response.status, ')')
          }
        } catch (error) {
          console.error('useFirebaseAuth: Session restore error:', error)
        }

        // If we reach here, session restore failed or no session exists
        if (wasAuthed.current) {
          wasAuthed.current = false
          void clearSessionCookie()
        }
        clearAuthHint()
        try { localStorage.removeItem('isOnboarded') } catch { /* ignore */ }
        setUser(null)
        setLoading(false)
        hasInitialized.current = true
      } else {
        // User is logged out
        console.log('useFirebaseAuth: User logged out')
        if (wasAuthed.current) {
          wasAuthed.current = false
          void clearSessionCookie()
        }
        clearAuthHint()
        try { localStorage.removeItem('isOnboarded') } catch { /* ignore */ }
        setUser(null)
        setLoading(false)
        hasInitialized.current = true
      }
    }, (error) => {
      console.error('useFirebaseAuth: onAuthStateChanged error:', error)
      setUser(null)
      setLoading(false)
      hasInitialized.current = true
    })

    // Timeout fallback
    const timeout = setTimeout(() => {
      if (!hasInitialized.current) {
        console.warn('useFirebaseAuth: Timeout - forcing initialization complete')
        setLoading(false)
        hasInitialized.current = true
      }
    }, 10000)

    // CROSS-TAB LOGOUT: when ANOTHER tab logs out (lib/auth.ts writes the
    // `veefore_logout` key), immediately tear down this tab's session and reload
    // to a signed-out state. Otherwise this tab keeps a live Firebase session and
    // re-mints auth cookies via /api/auth/update-token on its next 401, logging
    // everyone back in. `storage` events only fire in OTHER tabs, which is exactly
    // what we want.
    const onCrossTabLogout = (e: StorageEvent) => {
      if (e.key !== 'veefore_logout' || !e.newValue) return
      console.log('[useFirebaseAuth] Cross-tab logout detected — signing out this tab')
      try { clearClientSessionState() } catch { /* ignore */ }
      // Sign out locally, then hard-redirect so the tab re-initializes with no
      // Firebase user and no cookies (cleared browser-wide by the other tab).
      auth.signOut().catch(() => {}).finally(() => {
        window.location.replace('/')
      })
    }
    window.addEventListener('storage', onCrossTabLogout)

    // Cleanup
    return () => {
      console.log('useFirebaseAuth: Cleanup called')
      clearTimeout(timeout)
      window.removeEventListener('storage', onCrossTabLogout)
      unsubscribe()
    }
  }, []) // Empty deps - run once

  return {
    user,
    loading,
    isAuthenticated: !!user
  }
}
