import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export const useFirebaseAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const hasInitialized = useRef(false)
  const sessionRestoreAttempted = useRef(false)
  const authListenerSet = useRef(false)

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
              await signInWithCustomToken(auth, customToken)
              console.log('useFirebaseAuth: ✅ Session restored successfully')
              // onAuthStateChanged will fire again with the user
              return // Don't set loading=false yet, wait for onAuthStateChanged
            } else {
              console.log('useFirebaseAuth: No custom token in response')
            }
          } else {
            console.log('useFirebaseAuth: No server session (status:', response.status, ')')
          }
        } catch (error) {
          console.error('useFirebaseAuth: Session restore error:', error)
        }

        // If we reach here, session restore failed or no session exists
        setUser(null)
        setLoading(false)
        hasInitialized.current = true
      } else {
        // User is logged out
        console.log('useFirebaseAuth: User logged out')
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

    // Cleanup
    return () => {
      console.log('useFirebaseAuth: Cleanup called')
      clearTimeout(timeout)
      unsubscribe()
    }
  }, []) // Empty deps - run once

  return {
    user,
    loading,
    isAuthenticated: !!user
  }
}
