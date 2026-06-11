import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode
} from 'firebase/auth'

/**
 * Firebase Client SDK Configuration
 *
 * Used for:
 *  - Email/password sign-in and sign-up
 *  - Password reset flow (send, verify, confirm)
 *  - Restoring sessions via signInWithCustomToken after server-side OAuth
 *
 * Google OAuth is handled entirely server-side (PKCE flow).
 * The server sets an HTTP-only cookie after OAuth; the client exchanges it
 * for a Firebase session via /api/auth/session → signInWithCustomToken().
 */

const getAuthDomain = (): string => {
  if (typeof window === 'undefined') {
    // SSR / build time — return a valid placeholder
    return 'veefore.com'
  }
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost'
  }
  return 'veefore.com'
}

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project-id'

const firebaseConfig = {
  apiKey:        import.meta.env.VITE_FIREBASE_API_KEY    || 'demo-api-key',
  authDomain:    `${projectId}.firebaseapp.com`,
  projectId:     projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
  appId:         import.meta.env.VITE_FIREBASE_APP_ID     || 'demo-app-id',
}

const hasValidConfig =
  firebaseConfig.apiKey     !== 'demo-api-key'      &&
  firebaseConfig.appId      !== 'demo-app-id'        &&
  firebaseConfig.projectId  !== 'demo-project-id'

if (!hasValidConfig) {
  console.warn('⚠️ Firebase env vars not set. Add VITE_FIREBASE_* to your .env file.')
}

// Initialize Firebase
const app  = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Keep users signed in across browser restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Firebase persistence error:', err)
})

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
}

export type { User }