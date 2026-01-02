import React from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

import LoadingSpinner from './LoadingSpinner'

type Props = { children: React.ReactNode }

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()
  if (loading) return <LoadingSpinner />
  if (!user) {
    setLocation('/signin')
    return <div className="p-4">Redirecting...</div>
  }
  return <>{children}</>
}
