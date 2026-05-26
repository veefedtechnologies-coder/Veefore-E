import { signOut } from 'firebase/auth'
import { auth } from './firebase'

export const logout = async () => {
  try {
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