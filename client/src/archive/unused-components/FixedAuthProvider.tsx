import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface AuthContextType {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
}

// Create context with default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  console.log('useAuth: Context received:', { user: !!context.user, loading: context.loading, isAuthenticated: context.isAuthenticated })
  return context
}

interface FixedAuthProviderProps {
  children: ReactNode
}

export const FixedAuthProvider: React.FC<FixedAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('FixedAuthProvider: Setting up Firebase auth listener')
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('FixedAuthProvider: Auth state changed:', user ? 'User logged in' : 'User logged out')
      setUser(user)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const contextValue: AuthContextType = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user
  }), [user, loading])

  console.log('FixedAuthProvider: Providing context value:', contextValue)

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}