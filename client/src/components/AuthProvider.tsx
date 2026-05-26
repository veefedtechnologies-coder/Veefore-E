import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthContextType {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  console.log('useAuth called, context:', context)
  if (context === null) {
    console.error('useAuth: Context is null - AuthProvider not found')
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialize the context value immediately
  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user
  }

  useEffect(() => {
    try {
      console.log('AuthProvider: Starting Firebase auth state listener')
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log('AuthProvider: Auth state changed', user ? 'User logged in' : 'User logged out')
        setUser(user)
        setLoading(false)
      }, (error) => {
        console.error('AuthProvider: Auth state error', error)
        setLoading(false)
      })

      return () => {
        console.log('AuthProvider: Cleaning up auth state listener')
        unsubscribe()
      }
    } catch (error) {
      console.error('AuthProvider: Error setting up auth listener', error)
      setLoading(false)
    }
  }, [])

  console.log('AuthProvider: Rendering with context value', value)

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}