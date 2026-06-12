import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { authSessionValidator } from '@/lib/auth-session-validator'

export const useFirebaseAuth = () => {
  // Always call hooks at the top level - React rules require this
  const [user, setUser] = useState<User | null>(null)
  // Start with loading=true to prevent landing page flash on initial load
  // This ensures authenticated users don't see landing page before dashboard
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
          // ENTERPRISE OPTIMIZATION: Validate backend session with caching & retry logic
          console.log('useFirebaseAuth: Firebase user detected, validating with enterprise validator...')
          
          try {
            const validation = await authSessionValidator.validateSession(firebaseUser.uid)
            
            console.log(`useFirebaseAuth: Validation result:`, {
              isValid: validation.isValid,
              fromCache: validation.fromCache,
              responseTime: `${validation.responseTime}ms`
            })
            
            if (validation.isValid) {
              // Backend has valid session
              console.log('useFirebaseAuth: ✅ Session valid, user authenticated')
              setUser(firebaseUser)
              setLoading(false)
              setIsInitialized(true)
            } else {
              // Backend has no session - Firebase session is stale
              console.warn('useFirebaseAuth: ❌ Backend session invalid, signing out stale Firebase session')
              authSessionValidator.clearCache()
              await auth.signOut()
              setUser(null)
              setLoading(false)
              setIsInitialized(true)
            }
          } catch (error: any) {
            console.error('useFirebaseAuth: 💥 Session validation failed critically:', error)
            // On critical error, sign out to be safe
            authSessionValidator.clearCache()
            await auth.signOut()
            setUser(null)
            setLoading(false)
            setIsInitialized(true)
          }
        } else if (!sessionRestoreAttempted.current) {
          // No Firebase user — try to restore session from server-side OAuth cookie
          sessionRestoreAttempted.current = true
          console.log('useFirebaseAuth: No Firebase user, attempting session restore...')
          
          try {
            console.log('useFirebaseAuth: Using enterprise validator for session restore...')
            
            // Use a temporary ID for validation during restore
            const validation = await authSessionValidator.validateSession('restore_attempt')
            
            console.log(`useFirebaseAuth: Restore validation:`, {
              isValid: validation.isValid,
              hasToken: !!validation.customToken,
              responseTime: `${validation.responseTime}ms`
            })
            
            if (validation.isValid && validation.customToken) {
              console.log('useFirebaseAuth: ✅ Session restore successful, signing in with custom token...')
              try {
                await signInWithCustomToken(auth!, validation.customToken)
                console.log('useFirebaseAuth: ✅ Firebase sign-in successful!')
                // onAuthStateChanged will fire again with the authenticated user
              } catch (firebaseError: any) {
                console.error('useFirebaseAuth: ❌ Firebase signInWithCustomToken failed:', {
                  code: firebaseError.code,
                  message: firebaseError.message
                })
                authSessionValidator.clearCache()
                setUser(null)
                setLoading(false)
                setIsInitialized(true)
              }
            } else {
              // No server session either — user is truly logged out
              console.log('useFirebaseAuth: No server session found')
              authSessionValidator.clearCache()
              setUser(null)
              setLoading(false)
              setIsInitialized(true)
            }
          } catch (error: any) {
            console.error('useFirebaseAuth: Session restore failed:', {
              message: error.message,
              name: error.name
            })
            authSessionValidator.clearCache()
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
