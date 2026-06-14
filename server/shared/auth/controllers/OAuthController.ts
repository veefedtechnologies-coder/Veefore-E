/**
 * Shared OAuth Controller
 * 
 * Centralizes OAuth 2.0 flows for Google, GitHub, Instagram, and other social providers.
 * Supports both Main_App and Admin_Panel OAuth needs with unified interfaces.
 * 
 * Features:
 * - OAuth 2.0 Authorization Code Flow with PKCE
 * - State parameter for CSRF protection
 * - Token exchange and refresh
 * - Account linking and unlinking
 * - Multi-provider support (Google, GitHub, Instagram, Facebook)
 * 
 * Requirements: 5.2, 6.3, 8.2, 8.3, 8.4, 8.6
 * 
 * @module OAuthController
 */

import { Request, Response } from 'express';
import { IStorage } from '../../../storage';
import crypto from 'crypto';

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string[];
  additionalParams?: Record<string, string>;
}

/**
 * OAuth State Data stored in session
 */
export interface OAuthState {
  state: string;
  codeVerifier?: string;
  workspaceId?: string;
  flow?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * OAuth Token Response
 */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: Date;
  tokenType?: string;
  scope?: string;
}

/**
 * OAuth User Profile
 */
export interface OAuthUserProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  profilePictureUrl?: string;
  provider: string;
  rawProfile?: any;
}

/**
 * PKCE Pair for OAuth 2.0
 */
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Supported OAuth Providers
 */
export type OAuthProvider = 'google' | 'github' | 'instagram' | 'facebook';

/**
 * OAuthController
 * 
 * Handles OAuth flows for multiple providers with unified interface.
 * Supports Main_App and Admin_Panel OAuth requirements.
 */
export class OAuthController {
  private storage: IStorage;
  private providers: Map<OAuthProvider, OAuthProviderConfig>;
  private readonly STATE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(storage: IStorage) {
    this.storage = storage;
    this.providers = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize OAuth provider configurations from environment variables
   */
  private initializeProviders(): void {
    // Google OAuth Configuration
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.providers.set('google', {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.OAUTH_CALLBACK_URL || process.env.GOOGLE_REDIRECT_URI || '',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: ['openid', 'email', 'profile'],
        additionalParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      });
    }

    // GitHub OAuth Configuration
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      this.providers.set('github', {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        redirectUri: process.env.GITHUB_REDIRECT_URI || '',
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: ['user:email', 'read:user']
      });
    }

    // Instagram OAuth Configuration
    if (process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) {
      const baseUrl = process.env.SOCIAL_AUTH_BASE_URL || process.env.BASE_URL || 'http://localhost:5000';
      this.providers.set('instagram', {
        clientId: process.env.INSTAGRAM_APP_ID,
        clientSecret: process.env.INSTAGRAM_APP_SECRET,
        redirectUri: `${baseUrl}/api/v1/social-auth/instagram/callback`,
        authorizationUrl: 'https://api.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        scope: [
          'instagram_business_basic',
          'instagram_business_manage_messages',
          'instagram_business_manage_comments',
          'instagram_business_content_publish',
          'instagram_business_manage_insights'
        ]
      });
    }

    // Facebook OAuth Configuration (for Instagram Business)
    if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
      const baseUrl = process.env.SOCIAL_AUTH_BASE_URL || process.env.BASE_URL || 'http://localhost:5000';
      this.providers.set('facebook', {
        clientId: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        redirectUri: `${baseUrl}/api/v1/social-auth/instagram/callback`,
        authorizationUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
        scope: [
          'public_profile',
          'email',
          'instagram_basic',
          'instagram_manage_insights',
          'instagram_content_publish',
          'instagram_manage_comments',
          'instagram_manage_messages',
          'pages_read_engagement',
          'pages_manage_posts',
          'pages_show_list',
          'pages_messaging'
        ]
      });
    }
  }

  /**
   * Generate cryptographically secure random state parameter
   * 
   * @returns Base64-encoded random state string (32 bytes = 64 hex characters)
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE (Proof Key for Code Exchange) pair
   * 
   * @returns PKCE pair with code verifier and challenge
   */
  private generatePKCEPair(): PKCEPair {
    // Generate code_verifier (43-128 characters)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code_challenge using S256 method
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256'
    };
  }

  /**
   * Store OAuth state in session with TTL
   * 
   * @param req - Express request with session
   * @param stateData - OAuth state data to store
   */
  private storeState(req: Request, stateData: OAuthState): void {
    if (!req.session) {
      throw new Error('Session not available');
    }
    
    (req.session as any).oauthState = stateData;
  }

  /**
   * Retrieve and validate OAuth state from session
   * 
   * @param req - Express request with session
   * @param state - State parameter to validate
   * @returns Stored OAuth state data
   * @throws Error if state is invalid or expired
   */
  private retrieveState(req: Request, state: string): OAuthState {
    if (!req.session) {
      throw new Error('Session not available');
    }

    const storedState = (req.session as any).oauthState as OAuthState | undefined;
    
    if (!storedState) {
      throw new Error('OAuth state not found in session');
    }

    if (storedState.state !== state) {
      throw new Error('OAuth state mismatch - possible CSRF attack');
    }

    if (Date.now() > storedState.expiresAt) {
      throw new Error('OAuth state expired');
    }

    // Clear state after retrieval (one-time use)
    delete (req.session as any).oauthState;

    return storedState;
  }

  /**
   * Initiate OAuth flow for a provider
   * 
   * Generates authorization URL with state, PKCE, and required scopes.
   * Stores state in session and redirects user to provider's authorization page.
   * 
   * @param provider - OAuth provider name
   * @param req - Express request
   * @param res - Express response
   * @param options - Additional options (workspaceId, flow type, etc.)
   */
  async initiateOAuth(
    provider: OAuthProvider,
    req: Request,
    res: Response,
    options?: { workspaceId?: string; flow?: string }
  ): Promise<void> {
    try {
      const config = this.providers.get(provider);
      
      if (!config) {
        throw new Error(`OAuth provider '${provider}' not configured`);
      }

      // Generate state and PKCE parameters
      const state = this.generateState();
      const pkcePair = this.generatePKCEPair();

      // Store state in session
      const stateData: OAuthState = {
        state,
        codeVerifier: pkcePair.codeVerifier,
        workspaceId: options?.workspaceId,
        flow: options?.flow,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.STATE_TTL
      };

      this.storeState(req, stateData);

      // Build authorization URL
      const authUrl = new URL(config.authorizationUrl);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scope.join(' '));
      authUrl.searchParams.set('state', state);

      // Add PKCE parameters for providers that support it
      if (['google', 'github'].includes(provider)) {
        authUrl.searchParams.set('code_challenge', pkcePair.codeChallenge);
        authUrl.searchParams.set('code_challenge_method', pkcePair.codeChallengeMethod);
      }

      // Add additional provider-specific parameters
      if (config.additionalParams) {
        Object.entries(config.additionalParams).forEach(([key, value]) => {
          authUrl.searchParams.set(key, value);
        });
      }

      console.log(`[OAUTH] Initiating ${provider} OAuth flow`);
      res.redirect(authUrl.toString());
    } catch (error) {
      console.error(`[OAUTH] Error initiating ${provider} OAuth:`, error);
      res.status(500).json({
        error: 'oauth_initiation_failed',
        message: `Failed to initiate ${provider} OAuth flow`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle OAuth callback
   * 
   * Validates state, exchanges authorization code for access token,
   * and processes the user profile.
   * 
   * @param provider - OAuth provider name
   * @param req - Express request with query parameters
   * @param res - Express response
   * @param onSuccess - Callback function when OAuth succeeds
   * @param onError - Callback function when OAuth fails
   */
  async handleCallback(
    provider: OAuthProvider,
    req: Request,
    res: Response,
    onSuccess?: (profile: OAuthUserProfile, tokens: OAuthTokenResponse) => Promise<void>,
    onError?: (error: Error) => Promise<void>
  ): Promise<void> {
    try {
      const { code, state, error, error_description } = req.query;

      // Handle OAuth errors from provider
      if (error) {
        const errorMsg = error_description || error;
        console.error(`[OAUTH] ${provider} callback error:`, errorMsg);
        
        if (onError) {
          await onError(new Error(errorMsg as string));
          return;
        }

        return res.status(400).json({
          error: 'oauth_provider_error',
          message: errorMsg,
          provider
        });
      }

      // Validate required parameters
      if (!code || !state) {
        throw new Error('Missing required OAuth parameters: code or state');
      }

      // Validate and retrieve state
      const storedState = this.retrieveState(req, state as string);
      
      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForToken(
        provider,
        code as string,
        storedState.codeVerifier
      );

      // Fetch user profile
      const profile = await this.fetchUserProfile(provider, tokens.accessToken);

      // Execute success callback
      if (onSuccess) {
        await onSuccess(profile, tokens);
      }

      console.log(`[OAUTH] ${provider} callback successful for user:`, profile.id);
    } catch (error) {
      console.error(`[OAUTH] ${provider} callback error:`, error);
      
      if (onError) {
        await onError(error as Error);
        return;
      }

      res.status(500).json({
        error: 'oauth_callback_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        provider
      });
    }
  }

  /**
   * Exchange authorization code for access token
   * 
   * @param provider - OAuth provider name
   * @param code - Authorization code from callback
   * @param codeVerifier - PKCE code verifier (if applicable)
   * @returns OAuth token response
   */
  private async exchangeCodeForToken(
    provider: OAuthProvider,
    code: string,
    codeVerifier?: string
  ): Promise<OAuthTokenResponse> {
    const config = this.providers.get(provider);
    
    if (!config) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code'
    });

    // Add PKCE code_verifier for providers that support it
    if (codeVerifier && ['google', 'github'].includes(provider)) {
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope
    };
  }

  /**
   * Fetch user profile from OAuth provider
   * 
   * @param provider - OAuth provider name
   * @param accessToken - Access token for API calls
   * @returns User profile information
   */
  private async fetchUserProfile(
    provider: OAuthProvider,
    accessToken: string
  ): Promise<OAuthUserProfile> {
    switch (provider) {
      case 'google':
        return this.fetchGoogleProfile(accessToken);
      case 'github':
        return this.fetchGitHubProfile(accessToken);
      case 'instagram':
        return this.fetchInstagramProfile(accessToken);
      case 'facebook':
        return this.fetchFacebookProfile(accessToken);
      default:
        throw new Error(`Profile fetching not implemented for provider: ${provider}`);
    }
  }

  /**
   * Fetch Google user profile
   */
  private async fetchGoogleProfile(accessToken: string): Promise<OAuthUserProfile> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google profile: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      profilePictureUrl: data.picture,
      provider: 'google',
      rawProfile: data
    };
  }

  /**
   * Fetch GitHub user profile
   */
  private async fetchGitHubProfile(accessToken: string): Promise<OAuthUserProfile> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub profile: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id.toString(),
      email: data.email,
      name: data.name,
      username: data.login,
      profilePictureUrl: data.avatar_url,
      provider: 'github',
      rawProfile: data
    };
  }

  /**
   * Fetch Instagram user profile
   */
  private async fetchInstagramProfile(accessToken: string): Promise<OAuthUserProfile> {
    const response = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count,profile_picture_url&access_token=${accessToken}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Instagram profile: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      username: data.username,
      profilePictureUrl: data.profile_picture_url,
      provider: 'instagram',
      rawProfile: data
    };
  }

  /**
   * Fetch Facebook user profile
   */
  private async fetchFacebookProfile(accessToken: string): Promise<OAuthUserProfile> {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,email,picture&access_token=${accessToken}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Facebook profile: ${response.status}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      profilePictureUrl: data.picture?.data?.url,
      provider: 'facebook',
      rawProfile: data
    };
  }

  /**
   * Link OAuth account to existing user
   * 
   * Associates an OAuth provider account with an existing user account.
   * 
   * @param userId - User ID to link account to
   * @param provider - OAuth provider name
   * @param profile - OAuth user profile
   * @param tokens - OAuth tokens
   */
  async linkAccount(
    userId: string,
    provider: OAuthProvider,
    profile: OAuthUserProfile,
    tokens: OAuthTokenResponse
  ): Promise<void> {
    try {
      // Store social account connection
      await this.storage.createSocialAccount({
        workspaceId: userId,
        platform: provider as any,
        accountId: profile.id,
        username: profile.username || profile.name || profile.email || '',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresIn 
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        isActive: true
      });

      console.log(`[OAUTH] Linked ${provider} account for user ${userId}`);
    } catch (error) {
      console.error(`[OAUTH] Error linking ${provider} account:`, error);
      throw error;
    }
  }

  /**
   * Unlink OAuth account from user
   * 
   * Removes the association between an OAuth provider account and user account.
   * 
   * @param userId - User ID to unlink account from
   * @param provider - OAuth provider name
   * @param accountId - Provider-specific account ID
   */
  async unlinkAccount(
    userId: string,
    provider: OAuthProvider,
    accountId: string
  ): Promise<void> {
    try {
      // Get all social accounts for the workspace
      const accounts = await this.storage.getSocialAccountsByWorkspace(userId);
      
      // Find the account to unlink
      const accountToUnlink = accounts.find(
        acc => acc.platform === provider && acc.accountId === accountId
      );

      if (!accountToUnlink) {
        throw new Error(`${provider} account not found for user ${userId}`);
      }

      // Delete the social account
      await this.storage.deleteSocialAccount(accountToUnlink.id);

      console.log(`[OAUTH] Unlinked ${provider} account ${accountId} from user ${userId}`);
    } catch (error) {
      console.error(`[OAUTH] Error unlinking ${provider} account:`, error);
      throw error;
    }
  }

  /**
   * Refresh OAuth access token
   * 
   * Uses refresh token to obtain a new access token.
   * 
   * @param provider - OAuth provider name
   * @param refreshToken - Refresh token
   * @returns New OAuth token response
   */
  async refreshAccessToken(
    provider: OAuthProvider,
    refreshToken: string
  ): Promise<OAuthTokenResponse> {
    const config = this.providers.get(provider);
    
    if (!config) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    try {
      let tokenUrl = config.tokenUrl;
      let params: any;

      // Provider-specific token refresh logic
      if (provider === 'instagram') {
        // Instagram uses Graph API for token refresh
        tokenUrl = `https://graph.instagram.com/refresh_access_token`;
        params = new URLSearchParams({
          grant_type: 'ig_refresh_token',
          access_token: refreshToken
        });
      } else {
        // Standard OAuth 2.0 token refresh
        params = new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        });
      }

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Token refresh failed: ${response.status} - ${JSON.stringify(errorData)}`
        );
      }

      const data = await response.json();

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Some providers don't return new refresh token
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope
      };
    } catch (error) {
      console.error(`[OAUTH] Error refreshing ${provider} token:`, error);
      throw error;
    }
  }

  /**
   * Get authorization URL for a provider
   * 
   * Generates the authorization URL without storing state or redirecting.
   * Useful for mobile apps or custom OAuth flows.
   * 
   * @param provider - OAuth provider name
   * @param options - Additional options (workspaceId, flow type, etc.)
   * @returns Authorization URL string
   */
  getAuthorizationUrl(
    provider: OAuthProvider,
    options?: { workspaceId?: string; flow?: string; state?: string }
  ): string {
    const config = this.providers.get(provider);
    
    if (!config) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    const state = options?.state || this.generateState();

    const authUrl = new URL(config.authorizationUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scope.join(' '));
    authUrl.searchParams.set('state', state);

    if (config.additionalParams) {
      Object.entries(config.additionalParams).forEach(([key, value]) => {
        authUrl.searchParams.set(key, value);
      });
    }

    return authUrl.toString();
  }

  /**
   * Check if a provider is configured
   * 
   * @param provider - OAuth provider name
   * @returns True if provider is configured
   */
  isProviderConfigured(provider: OAuthProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get list of configured providers
   * 
   * @returns Array of configured provider names
   */
  getConfiguredProviders(): OAuthProvider[] {
    return Array.from(this.providers.keys());
  }
}
