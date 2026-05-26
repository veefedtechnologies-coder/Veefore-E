import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import api from './api';

// Complete the auth session when the browser is closed
WebBrowser.maybeCompleteAuthSession();

export type Platform = 'instagram' | 'youtube' | 'tiktok';

interface OAuthConfig {
    authorizationEndpoint: string;
    clientId: string;
    scopes: string[];
    redirectUri: string;
}

// OAuth configurations for each platform
// Note: Client IDs should come from environment variables in production
const oauthConfigs: Record<Platform, OAuthConfig> = {
    instagram: {
        authorizationEndpoint: 'https://api.instagram.com/oauth/authorize',
        clientId: process.env.EXPO_PUBLIC_INSTAGRAM_CLIENT_ID || 'YOUR_INSTAGRAM_CLIENT_ID',
        scopes: ['user_profile', 'user_media'],
        redirectUri: AuthSession.makeRedirectUri({
            scheme: 'veefore',
            path: 'oauth/instagram/callback'
        }),
    },
    youtube: {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        redirectUri: AuthSession.makeRedirectUri({
            scheme: 'veefore',
            path: 'oauth/youtube/callback'
        }),
    },
    tiktok: {
        authorizationEndpoint: 'https://www.tiktok.com/auth/authorize/',
        clientId: process.env.EXPO_PUBLIC_TIKTOK_CLIENT_ID || 'YOUR_TIKTOK_CLIENT_ID',
        scopes: ['user.info.basic', 'video.list'],
        redirectUri: AuthSession.makeRedirectUri({
            scheme: 'veefore',
            path: 'oauth/tiktok/callback'
        }),
    },
};

/**
 * Initiates OAuth flow for a social media platform
 * @param platform - The social media platform to connect
 * @returns Promise that resolves when OAuth flow completes
 */
export async function connectSocialAccount(platform: Platform): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const config = oauthConfigs[platform];

        // Create authorization request
        const authRequest = new AuthSession.AuthRequest({
            clientId: config.clientId,
            scopes: config.scopes,
            redirectUri: config.redirectUri,
            responseType: AuthSession.ResponseType.Code,
            usePKCE: true, // Use PKCE for additional security
        });

        // Load the authorization request
        await authRequest.promptAsync({
            authorizationEndpoint: config.authorizationEndpoint,
        });

        const result = await authRequest.promptAsync({
            authorizationEndpoint: config.authorizationEndpoint,
        });

        if (result.type === 'success') {
            const { code } = result.params;

            if (!code) {
                throw new Error('No authorization code received');
            }

            // Send the authorization code to backend
            const response = await api.post(`/social-accounts/connect/${platform}`, {
                code,
                redirectUri: config.redirectUri,
                codeVerifier: authRequest.codeVerifier, // For PKCE
            });

            if (response.data.success) {
                return { success: true };
            } else {
                throw new Error(response.data.error || 'Failed to connect account');
            }
        } else if (result.type === 'cancel') {
            return { success: false, error: 'User cancelled the authorization' };
        } else {
            throw new Error('Authorization failed');
        }
    } catch (error: any) {
        console.error(`OAuth error for ${platform}:`, error);
        return {
            success: false,
            error: error.message || 'Failed to connect account',
        };
    }
}

/**
 * Disconnects a social media account
 * @param accountId - The ID of the account to disconnect
 */
export async function disconnectSocialAccount(accountId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const response = await api.delete(`/social-accounts/${accountId}`);

        if (response.data.success) {
            return { success: true };
        } else {
            throw new Error(response.data.error || 'Failed to disconnect account');
        }
    } catch (error: any) {
        console.error('Disconnect error:', error);
        return {
            success: false,
            error: error.message || 'Failed to disconnect account',
        };
    }
}

/**
 * Gets the redirect URI for a platform (useful for debugging)
 */
export function getRedirectUri(platform: Platform): string {
    return oauthConfigs[platform].redirectUri;
}
