import React from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { auth } from '@/lib/firebase'

type Props = { children: React.ReactNode }

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()

  if (auth?.currentUser) {
    return <>{children}</>
  }

  // While Firebase auth is still resolving on a fresh load, render NOTHING rather
  // than a full-screen dark spinner. The server-painted shell overlay (and each
  // route's own skeleton) already covers the visual during this window, so a
  // spinner here just causes a dark flash before the real page mounts.
  if (loading) return null
  if (!user) {
    setLocation('/signin')
    return <div className="p-4">Redirecting...</div>
  }
  return <>{children}</>
}
