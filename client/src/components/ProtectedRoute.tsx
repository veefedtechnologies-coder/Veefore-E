import React from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

type Props = { children: React.ReactNode }

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()
  if (loading) return <div className="p-4">Loading...</div>
  if (!user) {
    setLocation('/signin')
    return <div className="p-4">Redirecting...</div>
  }
  return <>{children}</>
}
