import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export const useFirebaseAuth = () => {
  // Always call hooks at the top level - React rules require this
  const [user, setUser] = useState<User | null>(null)
  // Start with loading=true to prevent landing page flash on initial load
  // This ensures authenticated users don't see landing page before dashboard
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const sessionRestoreAttempted = useRef(false)
  const isSettingUp = useRef(false)

  // Check if we're in a server environment
  const isServerSide = typeof window === 'undefined'

  useEffect(() => {
    // Prevent multiple listeners, server-side execution, or re-runs
    if (isInitialized || isServerSide || isSettingUp.current) {
      return
    }

    // Mark that we're setting up to prevent re-entry
    isSettingUp.current = true

    console.log('useFirebaseAuth: Setting up Firebase auth listener (ONCE)')
    
    // Check if Firebase auth is available
    if (!auth) {
      console.error('useFirebaseAuth: Firebase auth not available')
      setLoading(false)
      setIsInitialized(true)
      isSettingUp.current = false
      return
    }
    
    try {
      // Set up auth state listener only once
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          // User is signed in - simple and direct
          console.log('useFirebaseAuth: Firebase user detected:', firebaseUser.uid)
          setUser(firebaseUser)
          setLoading(false)
          setIsInitialized(true)
        } else if (!sessionRestoreAttempted.current) {
          // No Firebase user — try to restore session from server-side OAuth cookie
          sessionRestoreAttempted.current = true
          console.log('useFirebaseAuth: No Firebase user, attempting session restore...')
          
          try {
            // Try to get custom token from backend session
            const response = await fetch('/api/auth/session', {
              method: 'GET',
              credentials: 'include',
            })
            
            if (response.ok) {
              const data = await response.json()
              
              if (data.data?.customToken || data.customToken) {
                const customToken = data.data?.customToken || data.customToken
                console.log('useFirebaseAuth: ✅ Got custom token, signing in...')
                
                await signInWithCustomToken(auth, customToken)
                console.log('useFirebaseAuth: ✅ Firebase sign-in successful!')
                // onAuthStateChanged will fire again with the authenticated user
              } else {
                console.log('useFirebaseAuth: No custom token in response')
                setUser(null)
                setLoading(false)
                setIsInitialized(true)
              }
            } else {
              console.log('useFirebaseAuth: No server session found')
              setUser(null)
              setLoading(false)
              setIsInitialized(true)
            }
          } catch (error: any) {
            console.error('useFirebaseAuth: Session restore failed:', error)
            setUser(null)
            setLoading(false)
            setIsInitialized(true)
          }
        } else {
          // Session restore already attempted, user is logged out
          console.log('useFirebaseAuth: User logged out')
          setUser(null)
          setLoading(false)
          setIsInitialized(true)
        }
      })

      unsubscribeRef.current = unsubscribe

      // Set a maximum timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.log('useFirebaseAuth: Timeout reached, stopping loading state')
        setLoading(false)
        setIsInitialized(true)
      }, 10000)

      return () => {
        console.log('useFirebaseAuth: Cleaning up...')
        clearTimeout(timeout)
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
        isSettingUp.current = false
      }
    } catch (error) {
      console.error('useFirebaseAuth: Error setting up auth listener:', error)
      setLoading(false)
      setIsInitialized(true)
      isSettingUp.current = false
    }
  }, []) // EMPTY dependency array - run only once on mount

  // Return appropriate values based on server-side state
  return {
    user: isServerSide ? null : user,
    loading: isServerSide ? false : loading,
    isAuthenticated: isServerSide ? false : !!user
  }
}
