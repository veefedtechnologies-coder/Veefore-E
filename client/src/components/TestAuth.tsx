import React from 'react'
import { useAuth } from './AuthProvider'

export const TestAuth: React.FC = () => {
  console.log('TestAuth: Component rendering')
  
  try {
    const { user, loading, isAuthenticated } = useAuth()
    console.log('TestAuth: Successfully got auth context', { user: !!user, loading, isAuthenticated })
    
    return (
      <div>
        <h2>Auth Test</h2>
        <p>Loading: {loading.toString()}</p>
        <p>Authenticated: {isAuthenticated.toString()}</p>
        <p>User: {user ? 'Logged in' : 'Not logged in'}</p>
      </div>
    )
  } catch (error) {
    console.error('TestAuth: Error using auth context', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return (
      <div>
        <h2>Auth Test Error</h2>
        <p>Error: {errorMessage}</p>
      </div>
    )
  }
}