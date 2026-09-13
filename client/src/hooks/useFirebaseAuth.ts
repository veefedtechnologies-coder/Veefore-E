import { useEffect, useState } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { ensureSessionCookie, clearSessionCookie } from '@/lib/session'
import { setAuthHint, clearAuthHint } from '@/lib/bootstrap'
import { clearClientSessionState } from '@/lib/session-cleanup'

/**
 * useFirebaseAuth — SINGLE, app-wide Firebase auth state.
 *
 * IMPORTANT: this hook is backed by ONE module-level store and exactly ONE
 * `onAuthStateChanged` listener for the whole app. Previously the listener was
 * created per-hook-instance (guarded only by a `useRef`), so every component
 * that called `useFirebaseAuth` — App, AuthenticatedApp, useUser, and several
 * others — attached its own auth listener, its own cross-tab `storage`
 * listener, and its own `ensureSessionCookie`/restore logic with independent
 * state. On heavy pages that mount many such consumers at once (e.g. VeeGPT,
 * which pulls in useUser + subscription + agents + accounts) this produced:
 *   - bursts of concurrent `/api/auth/session-login` calls, and
 *   - multiple independent restore/logout state machines racing each other,
 * where one instance driving a `signInWithCustomToken` restore churns the
 * global Firebase auth object and ANOTHER instance's listener observes the
 * transient `null` and trips App.tsx's protected-route redirect to /signin —
 * i.e. a spurious "auto logout" while the session is actually valid.
 *
 * Consolidating to a single store + single listener removes that entire class
 * of races: there is one source of truth for `user`, one restore path, and one
 * session-cookie sync, shared by every consumer.
 */

interface AuthSnapshot {
  user: User | null
  loading: boolean
}

// ── Module-level singleton state ────────────────────────────────────────────
let snapshot: AuthSnapshot = { user: null, loading: true }
const listeners = new Set<() => void>()

// Single-init guards + restore bookkeeping (module-level = one source of truth).
let listenerStarted = false
let hasInitialized = false
let sessionRestoreAttempted = false
let wasAuthed = false
// Timestamp of the last cookie-restore attempt. Throttles re-restores so a
// genuinely-dead session can't spin in a restore↔null loop, while still
// allowing recovery from a TRANSIENT Firebase-null after boot.
let lastRestoreAttempt = 0

function emit() {
  for (const l of listeners) l()
}

function setSnapshot(next: Partial<AuthSnapshot>) {
  const merged = { ...snapshot, ...next }
  if (merged.user === snapshot.user && merged.loading === snapshot.loading) return
  snapshot = merged
  emit()
}

/**
 * Cross-tab logout: when ANOTHER tab logs out (lib/auth.ts writes the
 * `veefore_logout` key), tear down this tab's session and reload to a
 * signed-out state. Attached exactly once (module scope).
 */
function onCrossTabLogout(e: StorageEvent) {
  if (e.key !== 'veefore_logout' || !e.newValue) return
  console.log('[useFirebaseAuth] Cross-tab logout detected — signing out this tab')
  try { clearClientSessionState() } catch { /* ignore */ }
  auth.signOut().catch(() => {}).finally(() => {
    window.location.replace('/')
  })
}

/**
 * Start the ONE global auth listener. Idempotent — subsequent calls are no-ops.
 */
function startAuthListenerOnce() {
  if (listenerStarted) return
  listenerStarted = true
  console.log('useFirebaseAuth: Initializing global auth listener (ONCE)')

  if (!auth) {
    console.error('useFirebaseAuth: Firebase auth not available')
    setSnapshot({ loading: false })
    hasInitialized = true
    return
  }

  onAuthStateChanged(
    auth,
    async (firebaseUser) => {
      console.log('useFirebaseAuth: Auth state changed', {
        hasUser: !!firebaseUser,
        uid: firebaseUser?.uid,
        email: firebaseUser?.email,
      })

      if (firebaseUser) {
        // User is authenticated.
        console.log('useFirebaseAuth: ✅ User authenticated')
        setSnapshot({ user: firebaseUser, loading: false })
        hasInitialized = true
        wasAuthed = true
        // Persist an optimistic-auth hint so the next refresh never flashes the
        // public landing on `/` before Firebase restores (anti landing-flash).
        setAuthHint()
        // Clear any stale cross-tab logout flag now that we're authenticated.
        try { localStorage.removeItem('veefore_logout') } catch { /* ignore */ }

        // Ensure a server session cookie exists (fire-and-forget; throttled in
        // lib/session so concurrent callers don't storm the endpoint).
        firebaseUser
          .getIdToken()
          .then(idToken => ensureSessionCookie(idToken))
          .catch(() => { /* non-fatal */ })
        return
      }

      // firebaseUser is null — genuine logout OR a TRANSIENT loss of the
      // Firebase client session while the server `__session` cookie is valid.
      const loggedOutRecently = (() => {
        try {
          const raw = localStorage.getItem('veefore_logout')
          if (!raw) return false
          const ts = Number(raw)
          return Number.isFinite(ts) && Date.now() - ts < 15 * 1000
        } catch { return false }
      })()

      const now = Date.now()
      const throttleOk = now - lastRestoreAttempt > 10_000
      const shouldRestore =
        !loggedOutRecently &&
        (!sessionRestoreAttempted || (wasAuthed && throttleOk))

      if (shouldRestore) {
        sessionRestoreAttempted = true
        lastRestoreAttempt = now
        console.log('useFirebaseAuth: Attempting session restore from cookie...')

        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })

          console.log('useFirebaseAuth: Session API response:', {
            status: response.status,
            ok: response.ok,
          })

          if (response.ok) {
            const data = await response.json()
            const customToken = data.data?.customToken || data.customToken

            if (customToken) {
              console.log('useFirebaseAuth: Got custom token, signing in...')
              const userCredential = await signInWithCustomToken(auth, customToken)
              console.log('useFirebaseAuth: ✅ Signed in with custom token')

              // Keep the server cookie in sync (best-effort, non-fatal).
              try {
                const idToken = await userCredential.user.getIdToken()
                await fetch('/api/auth/update-token', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ idToken }),
                })
              } catch (error) {
                console.error('useFirebaseAuth: Failed to update server cookie:', error)
              }

              // onAuthStateChanged will refire with the restored user. Keep the
              // current `user` in the snapshot (don't flip to null) so the UI
              // never flashes the signed-out view during recovery.
              return
            }
            console.log('useFirebaseAuth: No custom token in response')
          } else {
            // Genuinely stale/invalid session — clear state and go to sign-in.
            try {
              const errData = await response.json().catch(() => ({}))
              if (errData?.requiresReauth || errData?.error === 'user_not_found') {
                console.warn('useFirebaseAuth: Stale session (user_not_found) — clearing cookies and redirecting to sign-in')
                try { clearClientSessionState() } catch { /* ignore */ }
                try { clearAuthHint() } catch { /* ignore */ }
                window.location.href = '/signin'
                return
              }
            } catch { /* ignore */ }
            console.log('useFirebaseAuth: No server session (status:', response.status, ')')
          }
        } catch (error) {
          console.error('useFirebaseAuth: Session restore error:', error)
        }
        // Restore did not succeed → fall through to the signed-out state.
      } else if (!loggedOutRecently && wasAuthed) {
        // A second rapid null within the throttle window. Hold the current
        // state instead of logging out on a transient; a real logout sets the
        // guard and the next auth event resolves it cleanly.
        console.warn('useFirebaseAuth: Transient null within throttle window — holding session, not logging out')
        return
      }

      // No (or failed) restore, or a genuine logout: declare signed out.
      console.log('useFirebaseAuth: User logged out')
      if (wasAuthed) {
        wasAuthed = false
        void clearSessionCookie()
      }
      clearAuthHint()
      try { localStorage.removeItem('isOnboarded') } catch { /* ignore */ }
      setSnapshot({ user: null, loading: false })
      hasInitialized = true
    },
    (error) => {
      console.error('useFirebaseAuth: onAuthStateChanged error:', error)
      setSnapshot({ user: null, loading: false })
      hasInitialized = true
    }
  )

  // Timeout fallback: never leave the app stuck on the boot skeleton.
  setTimeout(() => {
    if (!hasInitialized) {
      console.warn('useFirebaseAuth: Timeout - forcing initialization complete')
      setSnapshot({ loading: false })
      hasInitialized = true
    }
  }, 10000)

  window.addEventListener('storage', onCrossTabLogout)
}

export const useFirebaseAuth = () => {
  // Subscribe this component to the singleton store.
  const [, forceRender] = useState(0)

  useEffect(() => {
    startAuthListenerOnce()
    const listener = () => forceRender(x => x + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return {
    user: snapshot.user,
    loading: snapshot.loading,
    isAuthenticated: !!snapshot.user,
  }
}
