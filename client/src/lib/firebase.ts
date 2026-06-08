import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, User, setPersistence, browserLocalPersistence, getRedirectResult, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'

// Firebase configuration
// authDomain: MUST use Firebase's hosted domain (veefore-b84c8.firebaseapp.com) for redirect-based OAuth
//
// IMPORTANT: signInWithRedirect requires Firebase's authDomain for OAuth callbacks
// - Full-page redirect flow: User → Google → Firebase authDomain → App
// - Firebase processes OAuth callback at: https://veefore-b84c8.firebaseapp.com/__/auth/handler
// - After processing, redirects back to app with credential embedded in URL fragment
// - Custom domains (veefore.com) cannot be used because OAuth callback must go to Firebase's hosted domain
//
// NOTE: signInWithPopup (iframe-based OAuth) could theoretically work with custom domains via proxy,
// but signInWithRedirect (full-page redirect) bypasses any proxy and REQUIRES direct Firebase communication.
//
// Using custom domain with signInWithRedirect causes:
// - Browser attempts to load Firebase response in iframe context (proxy architecture)
// - Content Security Policy (CSP) blocks iframe loading
// - Result: Blank page with console error "Content blocker prevented iframe from loading"

// CRITICAL: Hardcode Firebase domain to prevent SSR/build-time issues
// During Vercel build, window is undefined, so we must return a valid authDomain
const getAuthDomain = () => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    // SSR/Build time: Return Firebase's hosted domain
    return 'veefore-b84c8.firebaseapp.com';
  }
  
  const hostname = window.location.hostname;
  
  // Local development: Use localhost for local testing
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  // Production and all other environments: Use Firebase's hosted domain
  // This ensures OAuth redirect flow works correctly without proxy interference
  return 'veefore-b84c8.firebaseapp.com';
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