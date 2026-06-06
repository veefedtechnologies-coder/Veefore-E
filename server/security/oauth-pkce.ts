/**
 * P2-1 SECURITY: OAuth 2.0 PKCE Implementation
 * 
 * Implements Proof Key for Code Exchange (PKCE) for enhanced OAuth security
 * Protects against authorization code interception attacks
 */

import { createHash, randomBytes } from 'crypto';

/**
 * P2-1.1: PKCE code verifier and challenge generation
 */
export class PKCEManager {
  private static readonly CODE_VERIFIER_LENGTH = 128;
  private static readonly VALID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  /**
   * Generate cryptographically secure code verifier
   */
  static generateCodeVerifier(): string {
    const bytes = randomBytes(PKCEManager.CODE_VERIFIER_LENGTH);
    const array = new Array(PKCEManager.CODE_VERIFIER_LENGTH);
    
    // Use crypto.randomBytes for secure randomness instead of Math.random()
    for (let i = 0; i < bytes.length; i++) {
      array[i] = PKCEManager.VALID_CHARS[bytes[i] % PKCEManager.VALID_CHARS.length];
    }
    
    return array.join('');
  }

  /**
   * Generate code challenge from verifier using SHA256
   */
  static generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Verify code verifier matches challenge
   */
  static verifyCodeChallenge(verifier: string, challenge: string): boolean {
    const computedChallenge = PKCEManager.generateCodeChallenge(verifier);
    try {
      const { timingSafeEqual } = require('crypto');
      const buf1 = Buffer.from(computedChallenge);
      const buf2 = Buffer.from(challenge);
      if (buf1.length !== buf2.length) return false;
      return timingSafeEqual(buf1, buf2);
    } catch (e) {
      return computedChallenge === challenge;
    }
  }

  /**
   * Generate complete PKCE parameters for OAuth flow
   */
  static generatePKCEParams(): {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  } {
    const codeVerifier = PKCEManager.generateCodeVerifier();
    const codeChallenge = PKCEManager.generateCodeChallenge(codeVerifier);
    
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256' as const
    };
  }
}

/**
 * P2-1.2: OAuth state parameter management with anti-CSRF protection
 */
export class OAuthStateManager {
  private static states = new Map<string, {
    timestamp: number;
    userId?: string;
    workspaceId?: string;
    platform: string;
    codeVerifier: string;
    nonce: string;
  }>();

  private static readonly STATE_EXPIRY = 10 * 60; // 10 minutes in seconds
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate secure OAuth state with PKCE integration
   */
  static async generateState(options: {
    userId?: string;
    workspaceId?: string;
    platform: string;
  }): Promise<{
    state: string;
    codeVerifier: string;
    codeChallenge: string;
    nonce: string;
  }> {
    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const pkceParams = PKCEManager.generatePKCEParams();

    const stateData = {
      timestamp: Date.now(),
      userId: options.userId,
      workspaceId: options.workspaceId,
      platform: options.platform,
      codeVerifier: pkceParams.codeVerifier,
      nonce
    };

    try {
      const { getRedisClient } = await import('../lib/redis');
      const redis = getRedisClient();
      await redis.setex(`oauth:state:${state}`, OAuthStateManager.STATE_EXPIRY, JSON.stringify(stateData));
    } catch (e) {
      console.warn('⚠️ Redis unavailable, falling back to in-memory state');
      OAuthStateManager.states.set(state, stateData);
    }

    return {
      state,
      codeVerifier: pkceParams.codeVerifier,
      codeChallenge: pkceParams.codeChallenge,
      nonce
    };
  }

  /**
   * Validate and consume OAuth state
   */
  static async validateState(state: string): Promise<{
    isValid: boolean;
    data?: {
      userId?: string;
      workspaceId?: string;
      platform: string;
      codeVerifier: string;
      nonce: string;
    };
  }> {
    let stateData: any;
    let usedRedis = false;

    try {
      const { getRedisClient } = await import('../lib/redis');
      const redis = getRedisClient();
      const rawData = await redis.get(`oauth:state:${state}`);
      if (rawData) {
        stateData = JSON.parse(rawData);
        usedRedis = true;
        await redis.del(`oauth:state:${state}`); // Consume state
      }
    } catch (e) {
      console.warn('⚠️ Redis unavailable, using in-memory state fallback');
    }

    if (!stateData) {
      stateData = OAuthStateManager.states.get(state);
      if (stateData) {
        OAuthStateManager.states.delete(state);
      }
    }

    if (!stateData) {
      return { isValid: false };
    }

    // Check expiry
    if (Date.now() - stateData.timestamp > (OAuthStateManager.STATE_EXPIRY * 1000)) {
      return { isValid: false };
    }

    return {
      isValid: true,
      data: {
        userId: stateData.userId,
        workspaceId: stateData.workspaceId,
        platform: stateData.platform,
        codeVerifier: stateData.codeVerifier,
        nonce: stateData.nonce
      }
    };
  }

  /**
   * Clean up expired states (only for memory fallback)
   */
  static cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, data] of OAuthStateManager.states.entries()) {
      if (now - data.timestamp > (OAuthStateManager.STATE_EXPIRY * 1000)) {
        OAuthStateManager.states.delete(state);
      }
    }
  }

  private static cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize cleanup scheduler
   */
  static initialize(): void {
    OAuthStateManager.cleanupTimer = setInterval(() => {
      OAuthStateManager.cleanupExpiredStates();
    }, OAuthStateManager.CLEANUP_INTERVAL);

    // Ensure graceful shutdown
    const stopCleanup = () => {
      if (OAuthStateManager.cleanupTimer) {
        clearInterval(OAuthStateManager.cleanupTimer);
      }
    };
    process.on('SIGTERM', stopCleanup);
    process.on('SIGINT', stopCleanup);

    console.log('🔐 P2-1: OAuth PKCE and state management initialized');
  }
}

/**
 * P2-1.3: Enhanced Instagram OAuth with PKCE
 */
export class SecureInstagramOAuth {
  private static readonly INSTAGRAM_AUTH_URL = 'https://api.instagram.com/oauth/authorize';
  private static readonly INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

  /**
   * Generate secure Instagram OAuth URL with PKCE
   */
  static async generateAuthUrl(options: {
    clientId: string;
    redirectUri: string;
    userId?: string;
    workspaceId?: string;
    scopes?: string[];
  }): Promise<{
    authUrl: string;
    state: string;
  }> {
    const stateData = await OAuthStateManager.generateState({
      userId: options.userId,
      workspaceId: options.workspaceId,
      platform: 'instagram'
    });

    const params = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      scope: (options.scopes || ['user_profile', 'user_media']).join(','),
      response_type: 'code',
      state: stateData.state,
      code_challenge: stateData.codeChallenge,
      code_challenge_method: 'S256'
    });

    return {
      authUrl: `${SecureInstagramOAuth.INSTAGRAM_AUTH_URL}?${params.toString()}`,
      state: stateData.state
    };
  }

  /**
   * Exchange authorization code for access token with PKCE verification
   */
  static async exchangeCodeForToken(options: {
    code: string;
    state: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<{
    success: boolean;
    accessToken?: string;
    error?: string;
    userData?: any;
  }> {
    try {
      // Validate state and get PKCE verifier
      const stateValidation = OAuthStateManager.validateState(options.state);
      
      if (!stateValidation.isValid || !stateValidation.data) {
        return {
          success: false,
          error: 'Invalid or expired OAuth state'
        };
      }

      // Exchange code for token with PKCE verification
      const tokenResponse = await fetch(SecureInstagramOAuth.INSTAGRAM_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: options.redirectUri,
          code: options.code,
          code_verifier: stateValidation.data.codeVerifier
        }).toString()
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return {
          success: false,
          error: tokenData.error_description || 'Token exchange failed'
        };
      }

      return {
        success: true,
        accessToken: tokenData.access_token,
        userData: {
          platform: stateValidation.data.platform,
          userId: stateValidation.data.userId,
          workspaceId: stateValidation.data.workspaceId,
          nonce: stateValidation.data.nonce
        }
      };

    } catch (error) {
      console.error('🚨 P2-1: OAuth token exchange error:', error);
      return {
        success: false,
        error: 'Internal server error during token exchange'
      };
    }
  }
}

/**
 * P2-1.4: Initialize OAuth PKCE system
 */
export function initializeOAuthPKCE(): void {
  console.log('🔐 P2-1: Initializing OAuth 2.0 PKCE security system...');
  
  // Initialize state cleanup
  OAuthStateManager.initialize();
  
  console.log('🔐 P2-1: OAuth PKCE Features:');
  console.log('  ✅ Cryptographically secure code verifiers');
  console.log('  ✅ SHA256 code challenge generation');
  console.log('  ✅ Anti-CSRF state management with expiry');
  console.log('  ✅ One-time use state parameters');
  console.log('  ✅ Enhanced Instagram OAuth with PKCE');
  console.log('🔐 P2-1: OAuth PKCE system ready for production');
}