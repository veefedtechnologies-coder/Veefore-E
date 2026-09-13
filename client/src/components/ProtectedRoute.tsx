import React, { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'
import { auth } from '@/lib/firebase'

type Props = { children: React.ReactNode }

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()
  // Extra guard: Firebase's onAuthStateChanged can resolve slightly AFTER the
  // hook reports loading=false on a fresh tab. Give it a short settling window
  // so a valid session isn't incorrectly bounced to signin.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!loading) {
      // If Firebase already has a current user we're done immediately.
      // Otherwise give it 600ms for the auth state listener to fire.
      if (auth?.currentUser) {
        setSettled(true)
        return
      }
      const t = setTimeout(() => setSettled(true), 600)
      return () => clearTimeout(t)
    }
  }, [loading])

  // Synchronous fast-path: Firebase already has a current user.
  if (auth?.currentUser) {
    return <>{children}</>
  }

  // While Firebase auth is still initialising, render nothing (the page
  // skeleton covers the visual during this window).
  if (loading || !settled) return null

  if (!user) {
    // Preserve the intended destination so the signin page can redirect back
    // after successful authentication. Encode it as ?redirect= so the signin
    // page can safely read and honour it.
    const redirectParam = encodeURIComponent(location)
    setLocation(`/signin?redirect=${redirectParam}`)
    return <div className="p-4">Redirecting...</div>
  }

  return <>{children}</>
}
