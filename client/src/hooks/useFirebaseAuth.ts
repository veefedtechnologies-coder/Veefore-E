import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export const useFirebaseAuth = () => {
  // DEBUG: Add version marker to confirm deployment
  console.log('🔥 useFirebaseAuth v2.0 - Enhanced OAuth logging enabled')
  
  // Always call hooks at the top level - React rules require this
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const sessionRestoreAttempted = useRef(false)

  // Check if we're in a server environment - use state instead of early return
  const isServerSide = typeof window === 'undefined'

  useEffect(() => {
    // Prevent multiple listeners or server-side execution
    if (isInitialized || isServerSide) return

    console.log('useFirebaseAuth: Setting up Firebase auth listener')
    
    // Check if Firebase auth is available
    if (!auth) {
      console.error('useFirebaseAuth: Firebase auth not available')
      setLoading(false)
      setIsInitialized(true)
      return
    }
    
    try {
      // Set up auth state listener only once
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          // Firebase already has an authenticated user
          console.log('useFirebaseAuth: Auth state changed:', `User logged in: ${firebaseUser.email}`)
          setUser(firebaseUser)
          setLoading(false)
          setIsInitialized(true)
        } else if (!sessionRestoreAttempted.current) {
          // No Firebase user — try to restore session from server-side OAuth cookie
          sessionRestoreAttempted.current = true
          console.log('useFirebaseAuth: No Firebase user, attempting session restore from server cookie...')
          try {
            console.log('useFirebaseAuth: Fetching session from /api/auth/session...')
            const response = await fetch('/api/auth/session', { credentials: 'include' })
            console.log('useFirebaseAuth: Session endpoint response:', { 
              status: response.status, 
              ok: response.ok,
              contentType: response.headers.get('content-type')
            })
            
            if (response.ok) {
              const data = await response.json()
              console.log('useFirebaseAuth: Session data received:', { 
                hasCustomToken: !!data.customToken,
                tokenLength: data.customToken?.length 
              })
              
              if (data.customToken) {
                console.log('useFirebaseAuth: Signing in with Firebase custom token...')
                try {
                  await signInWithCustomToken(auth!, data.customToken)
                  console.log('useFirebaseAuth: ✅ Firebase sign-in successful!')
                  // onAuthStateChanged will fire again with the authenticated user
                } catch (firebaseError: any) {
                  console.error('useFirebaseAuth: ❌ Firebase signInWithCustomToken failed:', {
                    code: firebaseError.code,
                    message: firebaseError.message,
                    stack: firebaseError.stack
                  })
                  setUser(null)
                  setLoading(false)
                  setIsInitialized(true)
                }
              } else {
                console.warn('useFirebaseAuth: No customToken in response data')
                setUser(null)
                setLoading(false)
                setIsInitialized(true)
              }
            } else {
              // No server session either — user is truly logged out
              const errorText = await response.text()
              console.log('useFirebaseAuth: No server session found:', { status: response.status, error: errorText })
              setUser(null)
              setLoading(false)
              setIsInitialized(true)
            }
          } catch (error: any) {
            console.error('useFirebaseAuth: Session restore failed:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            })
            setUser(null)
            setLoading(false)
            setIsInitialized(true)
          }
        } else {
          // Session restore already attempted, user is logged out
          console.log('useFirebaseAuth: Auth state changed: User logged out')
          setUser(null)
          setLoading(false)
          setIsInitialized(true)
        }
      })

      unsubscribeRef.current = unsubscribe

      // Set a maximum timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        if (!isInitialized) {
          console.log('useFirebaseAuth: Timeout reached, stopping loading state')
          setLoading(false)
          setIsInitialized(true)
        }
      }, 10000)

      return () => {
        clearTimeout(timeout)
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
      }
    } catch (error) {
      console.error('useFirebaseAuth: Error setting up auth listener:', error)
      setLoading(false)
      setIsInitialized(true)
    }
  }, [isInitialized, isServerSide])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [])

  // Return appropriate values based on server-side state
  return {
    user: isServerSide ? null : user,
    loading: isServerSide ? false : (loading && !isInitialized),
    isAuthenticated: isServerSide ? false : !!user
  }
}
