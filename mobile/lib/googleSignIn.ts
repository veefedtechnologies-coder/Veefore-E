import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from './firebase';
import { auth } from './firebase';
import { makeRedirectUri } from 'expo-auth-session';

// Complete the auth session for Google
WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google using Expo Auth Session
 * This works with Expo Go and doesn't require native modules
 */
export async function signInWithGoogle(): Promise<{
    success: boolean;
    user?: any;
    error?: string;
}> {
    try {
        // Get the Web Client ID from your Google Cloud Console
        // This should match the one in your Firebase project
        const webClientId = '309418074269-YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

        const redirectUri = makeRedirectUri({
            scheme: 'veefore',
            path: 'redirect'
        });

        // Create Google auth request
        const [request, response, promptAsync] = Google.useAuthRequest({
            webClientId,
            redirectUri,
        });

        if (!request) {
            return {
                success: false,
                error: 'Failed to initialize Google Sign-In',
            };
        }

        // Prompt for authentication
        const result = await promptAsync();

        if (result.type === 'success') {
            const { id_token } = result.params;

            // Create Firebase credential
            const credential = GoogleAuthProvider.credential(id_token);

            // Sign in to Firebase
            const userCredential = await signInWithCredential(auth, credential);

            return {
                success: true,
                user: userCredential.user,
            };
        } else if (result.type === 'cancel') {
            return {
                success: false,
                error: 'Sign in was cancelled',
            };
        } else {
            return {
                success: false,
                error: 'Failed to sign in with Google',
            };
        }
    } catch (error: any) {
        console.error('Google Sign-In Error:', error);
        return {
            success: false,
            error: error.message || 'An error occurred during Google Sign-In',
        };
    }
}

/**
 * Hook-based Google Sign-In for use in components
 * Use this in your login/signup screens
 */
export function useGoogleSignIn() {
    const webClientId = '309418074269-YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId,
    });

    return {
        request,
        response,
        promptAsync,
    };
}
