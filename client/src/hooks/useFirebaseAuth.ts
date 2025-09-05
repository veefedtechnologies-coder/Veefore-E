import { useState, useEffect } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export const useFirebaseAuth = () => {
  const [user, setUser] = useState<User | null>(null) // Always start with null to prevent hook errors
  const [loading, setLoading] = useState(true) // Always start with loading true

  useEffect(() => {
    console.log('useFirebaseAuth: Setting up Firebase auth listener')
    
    // Check if Firebase auth is available
    if (!auth) {
      console.error('useFirebaseAuth: Firebase auth not available')
      setLoading(false)
      return
    }
    
    // Debug localStorage for Firebase persistence
    const firebaseKeys = Object.keys(localStorage).filter(key => 
      key.includes('firebase') || key.includes('auth')
    )
    console.log('useFirebaseAuth: Firebase localStorage keys:', firebaseKeys)
    
    // Shorter timeout for faster loading
    const loadingTimeout = setTimeout(() => {
      console.log('useFirebaseAuth: Timeout reached, stopping loading state')
      setLoading(false)
    }, 2000) // 2 second timeout to prevent rapid auth state changes
    
    try {
      // If user is already available, clear loading immediately
      if (auth.currentUser) {
        console.log('useFirebaseAuth: Found existing authenticated user:', auth.currentUser.email)
        setUser(auth.currentUser)
        setLoading(false)
        clearTimeout(loadingTimeout)
      }
      
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log('useFirebaseAuth: Auth state changed:', user ? `User logged in: ${user.email}` : 'User logged out')
        setUser(user)
        setLoading(false)
        clearTimeout(loadingTimeout)
        
        // Additional debugging for persistence
        if (user) {
          console.log('useFirebaseAuth: User authenticated with tokens:', {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified
          })
          
          // Store debug info in localStorage
          localStorage.setItem('debug_user_auth', JSON.stringify({
            uid: user.uid,
            email: user.email,
            timestamp: new Date().toISOString()
          }))
        } else {
          // Clear debug info when logged out
          localStorage.removeItem('debug_user_auth')
        }
      })

      return () => {
        unsubscribe()
        clearTimeout(loadingTimeout)
      }
    } catch (error) {
      console.error('useFirebaseAuth: Error setting up auth listener:', error)
      setLoading(false)
      clearTimeout(loadingTimeout)
    }
  }, [])

  return {
    user,
    loading,
    isAuthenticated: !!user
  }
}