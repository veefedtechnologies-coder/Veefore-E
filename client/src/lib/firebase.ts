import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, User, setPersistence, browserLocalPersistence, getRedirectResult } from 'firebase/auth'

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: 'veefore-b84c8.firebaseapp.com', // Use Firebase's default domain for OAuth
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'veefore-b84c8',
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'veefore-b84c8'}.firebasestorage.app`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'demo-app-id'
}

console.log('🔥 Firebase Config:', {
  apiKey: firebaseConfig.apiKey ? '✅ SET' : '❌ MISSING',
  projectId: firebaseConfig.projectId ? '✅ SET' : '❌ MISSING',
  appId: firebaseConfig.appId ? '✅ SET' : '❌ MISSING',
  authDomain: firebaseConfig.authDomain
})

// Check if we have proper Firebase configuration (not using demo fallback values)
const hasValidConfig = firebaseConfig.apiKey !== 'demo-api-key' && 
                      firebaseConfig.appId !== 'demo-app-id'

if (!hasValidConfig) {
  console.warn('⚠️ Firebase environment variables not set. Using demo values. Please set VITE_FIREBASE_* variables.')
} else {
  console.log('✅ Firebase environment variables loaded successfully from secrets')
}

// Log the current domain for debugging
console.log('🌐 Current domain:', window.location.hostname)
console.log('🔧 Using authDomain:', firebaseConfig.authDomain)
console.log('🔧 Full URL:', window.location.href)

// Validate the authDomain configuration
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('✅ Running on localhost - Firebase authDomain configured correctly')
  console.log('ℹ️ Firebase will handle OAuth on firebaseapp.com, then redirect back to', window.location.origin)
} else if (window.location.hostname.includes('veefore.com')) {
  console.log('✅ Running on production domain - Firebase authDomain configured correctly')
  console.log('ℹ️ Firebase will handle OAuth on firebaseapp.com, then redirect back to', window.location.origin)
} else {
  console.log('ℹ️ Running on custom domain:', window.location.hostname)
  console.log('ℹ️ Firebase authDomain is always firebaseapp.com for OAuth flows')
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
console.log('🔥 Firebase App Initialized:', app)

// Initialize Auth
export const auth = getAuth(app)
console.log('🔥 Firebase Auth Initialized:', auth)

// Set persistence - Must be awaited to ensure auth state persists across page refreshes
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log('🔥 Firebase Persistence Set Successfully')
  })
  .catch((error) => {
    console.error('❌ Failed to set Firebase persistence:', error)
  })

// Create Google Provider
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({
  prompt: 'select_account'
})
console.log('🔥 Google Provider Created:', googleProvider)

// Export all auth functions
export { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  signOut,
  getRedirectResult
}

export type { User }