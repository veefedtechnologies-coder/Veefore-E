import { useState, useEffect, useRef } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export const useFirebaseAuth = () => {
  // Always call hooks at the top level - React rules require this
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

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
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log('useFirebaseAuth: Auth state changed:', user ? `User logged in: ${user.email}` : 'User logged out')
        setUser(user)
        setLoading(false)
        setIsInitialized(true)
      })

      unsubscribeRef.current = unsubscribe

      // Set a maximum timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        if (!isInitialized) {
          console.log('useFirebaseAuth: Timeout reached, stopping loading state')
          setLoading(false)
          setIsInitialized(true)
        }
      }, 3000)

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