import React from 'react'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

export const SimpleApp: React.FC = () => {
  const { user, loading, isAuthenticated } = useFirebaseAuth()

  console.log('SimpleApp rendering:', { user: !!user, loading, isAuthenticated })

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <div>Not authenticated - Please log in</div>
  }

  return (
    <div>
      <h1>Welcome {user.displayName}!</h1>
      <p>Email: {user.email}</p>
      <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
    </div>
  )
}