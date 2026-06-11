import { initializeApp } from 'firebase/app';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    User
} from 'firebase/auth';

// Firebase configuration - same as web app
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project-id';

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId: projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'demo-app-id'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence for React Native
export const auth = getAuth(app);

// Export auth functions
export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    User
};
