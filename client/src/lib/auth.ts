import { signOut } from 'firebase/auth'
import { auth } from './firebase'

export const logout = async () => {
  try {
    // [SERVER-SIDE OAUTH - Task 16.2] Call server-side logout endpoint to clear auth cookies
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        console.log('[Auth] Server-side logout successful')
      } else {
        console.warn('[Auth] Server-side logout failed:', response.status)
        // Continue with client-side logout even if server-side fails
      }
    } catch (serverLogoutError) {
      console.error('[Auth] Server-side logout error:', serverLogoutError)
      // Continue with client-side logout even if server-side fails
    }
    
    // Sign out from Firebase
    await signOut(auth)
    
    // Clear any stored user data
    localStorage.removeItem('user')
    sessionStorage.removeItem('user')
    
    // Force redirect to landing page
    window.location.href = '/'
  } catch (error) {
    console.error('Logout error:', error)
    throw error
  }
}

// Additional security functions
export const isAuthenticated = () => {
  return !!auth.currentUser
}

export const getCurrentUser = () => {
  return auth.currentUser
}

export const requireAuth = () => {
  if (!isAuthenticated()) {
    window.location.href = '/'
    return false
  }
  return true
}