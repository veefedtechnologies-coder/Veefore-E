import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, User, setPersistence, browserLocalPersistence, getRedirectResult, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'

// Firebase configuration
// authDomain: Using custom domain (veefore.com) for redirect-based OAuth
//
// IMPORTANT: Custom domain MUST be added to Firebase Console → Authentication → Authorized domains
// - Go to: https://console.firebase.google.com/project/veefore-b84c8/authentication/settings
// - Add "veefore.com" to the list of authorized domains
// - This allows signInWithRedirect to work with custom domain WITHOUT requiring proxy
//
// OAuth Flow with Custom Domain:
// - Full-page redirect flow: User → Google → Custom Domain (veefore.com) → App
// - Firebase processes OAuth callback at: https://veefore.com/__/auth/handler
// - After processing, redirects back to app with credential embedded in URL fragment
//
// Why This Works:
// - Firebase validates the redirect URI against authorized domains
// - Custom domains in authorized list are treated the same as Firebase hosted domains
// - No proxy needed - Firebase handles the OAuth callback directly on custom domain
//
// Previous Issue (now resolved):
// - Previously used proxy chain because custom domain wasn't authorized in Firebase
// - Proxy caused Content Security Policy violations and blank pages
// - Now using direct Firebase OAuth handling on authorized custom domain

// CRITICAL: Return valid authDomain for SSR/build-time
// During Vercel build, window is undefined, so we must return a valid authDomain
const getAuthDomain = () => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    // SSR/Build time: Return custom domain (must be authorized in Firebase Console)
    return 'veefore.com';
  }
  
  const hostname = window.location.hostname;
  
  // Local development: Use localhost for local testing
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  // Production: Use custom domain (veefore.com)
  // REQUIREMENT: veefore.com MUST be added to Firebase Console → Authentication → Authorized domains
  // This allows signInWithRedirect to work with custom domain WITHOUT proxy
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