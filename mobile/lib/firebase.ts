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
const firebaseConfig = {
    apiKey: 'YOUR_FIREBASE_API_KEY_HERE',
    authDomain: 'veefore-b84c8.firebaseapp.com',
    projectId: 'veefore-b84c8',
    storageBucket: 'veefore-b84c8.firebasestorage.app',
    appId: '1:309418074269:web:7b2a61fe3f40fc11343474'
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
