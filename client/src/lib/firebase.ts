import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, User, setPersistence, browserLocalPersistence, getRedirectResult, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'

// Firebase configuration
// authDomain: Use veefore.com in production for OAuth redirects
// 1. The Express server proxies /__/auth/* → veefore-b84c8.firebaseapp.com
// 2. https://veefore.com/__/auth/handler is registered in Google Cloud Console
// This makes the OAuth redirect same-origin, bypassing Safari's ITP cross-origin block.
// Note: app.veefore.com is only for local/dev testing

// CRITICAL: Hardcode production domain to prevent SSR/build-time issues
// During Vercel build, window is undefined, causing fallback to Firebase domain
// This ensures production ALWAYS uses veefore.com
const getAuthDomain = () => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    // SSR/Build time: Default to production domain
    // This prevents build-time evaluation from using Firebase default domain
    return 'veefore.com';
  }
  
  const hostname = window.location.hostname;
  
  // Production: Always use veefore.com (not app.veefore.com)
  if (hostname === 'veefore.com' || hostname === 'www.veefore.com') {
    return 'veefore.com';
  }
  
  // Development/Local: Use app.veefore.com or localhost
  if (hostname === 'app.veefore.com') {
    return 'app.veefore.com';
  }
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  // Default to production domain for any other case
  return 'veefore.com';
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: getAuthDomain(),
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
console.log('🔧 Using authDomain:', firebaseConfig.authDomain, '| App domain:', window.location.hostname)
console.log('ℹ️ Google sign-in uses signInWithRedirect via Firebase\'s hosted handler endpoint')

// Initialize Firebase
const app = initializeApp(firebaseConfig)
console.log('🔥 Firebase App Initialized:', app)

// Initialize Auth
export const auth = getAuth(app)
console.log('🔥 Firebase Auth Initialized:', auth)

// Explicitly set persistence to LOCAL to prevent users from being logged out when the browser closes.
// This is critical for preventing "2 times a day" automatic logouts caused by default session fallback.
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('🔥 Firebase Persistence Error:', error);
});
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
  getRedirectResult,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode
}

export type { User }