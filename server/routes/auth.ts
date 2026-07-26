/**
 * OAuth 2.0 Routes - Server-Side OAuth Implementation
 * 
 * This module implements enterprise-grade OAuth 2.0 Authorization Code Flow with PKCE.
 * All OAuth token handling is done server-side, never exposing tokens to the browser.
 * 
 * Endpoints:
 * - GET  /api/auth/google/start    - Initialize OAuth flow
 * - GET  /api/auth/google/callback - Handle OAuth callback from Google
 * - POST /api/auth/refresh         - Refresh Firebase authentication token
 * - POST /api/auth/logout          - Clear authentication cookies
 * 
 * Security Features:
 * - PKCE (Proof Key for Code Exchange) for authorization code protection
 * - State parameter validation for CSRF protection
 * - AES-256-GCM encrypted refresh token storage
 * - HTTP-only, Secure, SameSite=Strict cookies
 * - Comprehensive error handling with sensitive data redaction
 * 
 * Requirements: 1.1-1.6, 2.1-2.7, 3.1-3.7, 6.1-6.10, 7.1-7.4
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  stateValidator, 
  generatePKCEPair, 
  tokenExchangeService, 
  firebaseTokenService,
  type OAuthRequest 
} from '../services/oauth';
import { refreshTokenStore } from '../services/oauth/RefreshTokenStore';
import { refreshRateLimiter } from '../services/oauth/RefreshRateLimiter';
import { oauthSecurityMiddleware } from '../middleware/oauthSecurity';
import { oauthMetrics } from '../services/oauth/OAuthMetrics';
import { getFirebaseAdmin } from '../firebase-admin';
import * as fsAuthDebug from 'fs';
import * as pathAuthDebug from 'path';

// TEMP DEBUG: file logger to trace auth flow (terminal scrolls too fast).
function authDebugLog(message: string, data?: unknown): void {
  try {
    const dir = pathAuthDebug.join(process.cwd(), 'logs');
    if (!fsAuthDebug.existsSync(dir)) fsAuthDebug.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${message}` +
      (data !== undefined ? ` ${JSON.stringify(data)}` : '') + '\n';
    fsAuthDebug.appendFileSync(pathAuthDebug.join(dir, 'auth-debug.log'), line);
  } catch { /* ignore */ }
}

const router = Router();

/**
 * Decode a Firebase token (ID token OR custom token) and return its claims
 * WITHOUT trusting the signature. Used only to read `uid` / `sessionVersion` for
 * session-invalidation bookkeeping — never for granting access. Returns null if
 * the payload can't be parsed.
 */
function decodeTokenClaims(token: string): { uid?: string; sessionVersion?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    // Firebase ID tokens carry custom claims at the TOP level, but unexchanged
    // CUSTOM tokens nest them under `claims`. Check both so this works whether the
    // auth_token cookie currently holds an ID token (post /update-token) or a raw
    // custom token (right after OAuth).
    const sessionVersion = payload.sessionVersion ?? payload.claims?.sessionVersion;
    return {
      uid: payload.uid || payload.user_id || payload.sub,
      sessionVersion,
    };
  } catch {
    return null;
  }
}

/** Resolve the uid from an auth_token cookie (verified ID token, else decoded). */
async function resolveUidFromToken(token: string): Promise<string | undefined> {
  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return decodeTokenClaims(token)?.uid;
  }
}

/** Clear both auth cookies (same options used when setting / on logout). */
function clearAuthCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = isProd ? process.env.COOKIE_DOMAIN : undefined;
  const clearOpts = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/', domain };
  res.clearCookie('auth_token', clearOpts);
  res.clearCookie('__session', clearOpts);
  res.clearCookie('auth_token', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  res.clearCookie('__session', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
}

/**
 * Returns true when the token's sessionVersion claim is STALE relative to the
 * user's current sessionVersion (i.e. the session was invalidated by a logout).
 * Only rejects when the claim is present AND mismatched, so legacy tokens that
 * predate the claim still work (fail-open) — every freshly minted token carries
 * the claim, so a post-logout bump always invalidates the right sessions.
 */
function isSessionVersionStale(tokenSessionVersion: unknown, userSessionVersion: unknown): boolean {
  if (tokenSessionVersion === undefined || tokenSessionVersion === null) return false;
  const userSV = (userSessionVersion as number) || 1;
  return Number(tokenSessionVersion) !== userSV;
}

// TEMP DEBUG: client log bridge + request logger.
router.post('/debug-client-log', (req: Request, res: Response) => {
  try { authDebugLog('CLIENT', req.body); } catch { /* ignore */ }
  res.status(204).end();
});
router.use((req: Request, _res: Response, next: NextFunction) => {
  authDebugLog('AUTH ROUTER HIT', {
    method: req.method,
    path: req.path,
    referer: req.headers.referer || null,
    hasAuthCookie: !!(req as any).cookies?.auth_token,
  });
  next();
});

// Apply OAuth security middleware to all routes
// This includes: TLS enforcement, security headers, redirect URI validation, and rate limiting
// Requirements: 11.7, 11.8, 17.5, 17.6, 17.7, 17.8
router.use(oauthSecurityMiddleware);

/**
 * Correlation ID middleware for OAuth flow tracking
 * Generates a unique ID for each OAuth flow to enable request correlation in logs
 */
router.use((req: OAuthRequest, res: Response, next: NextFunction) => {
  req.correlationId = req.correlationId || `oauth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  next();
});

/**
 * GET /api/auth/google/start
 * 
 * Initialize OAuth 2.0 Authorization Code Flow with PKCE
 * 
 * This endpoint:
 * 1. Generates cryptographically secure state parameter (CSRF protection)
 * 2. Generates PKCE code_verifier and code_challenge
 * 3. Stores state and code_verifier in session (10-minute TTL)
 * 4. Constructs Google OAuth authorization URL
 * 5. Redirects user to Google for authentication
 * 
 * Security:
 * - State parameter prevents CSRF attacks
 * - PKCE prevents authorization code interception
 * - Session-based state storage prevents fixation attacks
 * 
 * @requirement 1.1 - Expose endpoint at /api/auth/google/start
 * @requirement 1.2 - Generate random state parameter (32 bytes)
 * @requirement 1.3 - Generate PKCE code_verifier and code_challenge
 * @requirement 1.4 - Store state and code_verifier in session with 10-minute TTL
 * @requirement 1.5 - Construct Google OAuth authorization URL
 * @requirement 1.6 - Redirect to Google OAuth
 */
router.get('/google/start', (req: OAuthRequest, res: Response) => {
  try {
    // Record OAuth flow initiation
    oauthMetrics.recordFlowInitiation(req.correlationId);
    
    // Clear any existing OAuth session to allow retry without waiting for expiration
    // This prevents "Concurrent OAuth flow detected" errors when users click the button again
    stateValidator.clearOAuthSession(req);
    
    // Requirement 1.2: Generate cryptographically secure state parameter
    const state = stateValidator.generateState();
    
    // Requirement 1.3: Generate PKCE pair (code_verifier and code_challenge)
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCEPair();
    
    // Requirement 1.4: Store state and code_verifier in session with 10-minute expiration
    stateValidator.storeState(req, state, codeVerifier);

    // Capture the user's INTENT (signup vs signin). The sign-in page passes
    // ?mode=signin; the sign-up page omits it (defaults to signup). We persist it
    // in the session so the callback knows whether it's allowed to create a brand
    // new account. Sign-in must NEVER create an account — non-existent users are
    // sent to the waitlist instead (account creation requires early access).
    const mode = req.query.mode === 'signin' ? 'signin' : 'signup';
    ;(req.session as any).oauthMode = mode;
    
    // Requirement 1.5: Construct Google OAuth authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    authUrl.searchParams.set('redirect_uri', process.env.OAUTH_CALLBACK_URL!);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

    // Always show Google's account chooser instead of silently auto-selecting
    // the single signed-in account. Without this, Google skips the chooser when
    // exactly one account is signed in and the app is already authorized — which
    // traps multi-account users on their previous account with no way to switch.
    // Forcing `select_account` is the standard "Sign in with Google" behaviour
    // used by most SaaS apps. A caller may override via ?prompt= (e.g. a future
    // One-Tap-style fast path could pass an empty value).
    const allowedPrompts = new Set(['select_account', 'consent', 'select_account consent', 'none', '']);
    const requestedPrompt = typeof req.query.prompt === 'string' ? req.query.prompt : undefined;
    const promptValue = requestedPrompt !== undefined && allowedPrompts.has(requestedPrompt)
      ? requestedPrompt
      : 'select_account';
    if (promptValue) {
      authUrl.searchParams.set('prompt', promptValue);
    }
    
    // Log OAuth flow initiation (Requirement 18.1)
    console.log('[OAuth] Flow initiated:', {
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });
    
    // Requirement 1.6: Redirect user to Google OAuth authorization page
    // TODO: Once frontend is deployed with fetch(), switch back to res.json()
    res.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('[OAuth] Start endpoint error:', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Redirect to frontend with error
    const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
    errorUrl.pathname = '/signin';
    errorUrl.searchParams.set('error', 'oauth_init_failed');
    errorUrl.searchParams.set('message', 'Failed to start authentication');
    res.redirect(errorUrl.toString());
  }
});

/**
 * GET /api/auth/google/callback
 * 
 * Handle OAuth callback from Google and complete authentication flow
 * 
 * This endpoint:
 * 1. Extracts code and state from query parameters
 * 2. Validates state parameter (CSRF check)
 * 3. Exchanges authorization code for tokens (with PKCE verification)
 * 4. Retrieves user information from Google
 * 5. Creates or updates user in MongoDB
 * 6. Creates Firebase custom token
 * 7. Encrypts and stores refresh token
 * 8. Sets HTTP-only auth cookie
 * 9. Clears OAuth session data
 * 10. Redirects to frontend dashboard
 * 
 * Security:
 * - State validation prevents CSRF attacks
 * - PKCE verification prevents code interception
 * - Refresh tokens encrypted with AES-256-GCM
 * - HTTP-only cookies prevent XSS attacks
 * - Single-use state parameters prevent replay attacks
 * 
 * @requirement 2.1 - Expose endpoint at /api/auth/google/callback
 * @requirement 2.2 - Retrieve stored state and code_verifier from session
 * @requirement 2.3 - Return 403 if state does not match
 * @requirement 2.4 - Return 403 if state is expired or not found
 * @requirement 2.5 - Exchange authorization code for tokens with PKCE
 * @requirement 2.6 - Request user information from Google
 * @requirement 2.7 - Return valid access_token and refresh_token
 * @requirement 3.1-3.7 - Create Firebase custom token and manage user
 */
router.get('/google/callback', async (req: OAuthRequest, res: Response) => {
  const correlationId = req.correlationId;
  const flowStartTime = Date.now(); // Track OAuth flow duration for metrics
  
  try {
    // Requirement 2.1: Extract code and state from query parameters
    const { code, state: receivedState, error: oauthError } = req.query;
    
    // Handle OAuth errors from Google
    if (oauthError) {
      console.error('[OAuth] Google returned error:', {
        correlationId,
        error: oauthError,
        errorDescription: req.query.error_description,
      });
      
      // Record OAuth flow failure
      const flowDuration = Date.now() - flowStartTime;
      oauthMetrics.recordFlowFailure('unknown', 'google_authorization', correlationId, flowDuration);
      
      const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      errorUrl.pathname = '/signin';
      errorUrl.searchParams.set('error', 'oauth_failed');
      errorUrl.searchParams.set('message', 'Google authentication failed');
      return res.redirect(errorUrl.toString());
    }
    
    // Validate required parameters
    if (!code || typeof code !== 'string') {
      throw new Error('Missing or invalid authorization code');
    }
    
    if (!receivedState || typeof receivedState !== 'string') {
      throw new Error('Missing or invalid state parameter');
    }
    
    // Requirements 2.2, 2.3, 2.4: Validate state parameter and retrieve code_verifier atomically
    // Fix 1 (Bug 1.1, 1.2): Use atomic validateState() that returns both validation result and code_verifier
    const validationResult = stateValidator.validateState(req, receivedState);
    
    if (!validationResult.isValid) {
      console.error('[OAuth] State validation failed:', {
        correlationId,
        error: validationResult.error,
      });
      
      // Record OAuth flow failure with state validation error
      const flowDuration = Date.now() - flowStartTime;
      const errorType = (validationResult.error?.toLowerCase().includes('expired')) 
        ? 'state_expired' 
        : 'invalid_state';
      oauthMetrics.recordFlowFailure(errorType, 'google_authorization', correlationId, flowDuration);
      
      // Return 403 Forbidden for state validation failures
      const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      errorUrl.pathname = '/signin';
      errorUrl.searchParams.set('error', 'invalid_state');
      errorUrl.searchParams.set('message', validationResult.error || 'Authentication failed - please try again');
      return res.redirect(errorUrl.toString());
    }
    
    // Code verifier is now available from the atomic validation result
    const codeVerifier = validationResult.codeVerifier;
    
    if (!codeVerifier) {
      throw new Error('Code verifier not available after state validation');
    }
    
    // Requirement 2.5: Exchange authorization code for tokens using PKCE
    console.log('[OAuth] Exchanging authorization code for tokens:', { correlationId });
    
    let tokenResult;
    try {
      tokenResult = await tokenExchangeService.exchangeCodeForTokens(code, codeVerifier, correlationId);
    } catch (error) {
      const errorCode = (error as any).code || 'token_exchange_failed';
      const statusCode = (error as any).statusCode || 401;
      
      console.error('[OAuth] Token exchange failed:', {
        correlationId,
        errorCode,
        statusCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Record OAuth flow failure with token exchange error
      const flowDuration = Date.now() - flowStartTime;
      const errorType = errorCode === 'authorization_code_used' 
        ? 'authorization_code_used' 
        : errorCode === 'redirect_uri_mismatch'
        ? 'redirect_uri_mismatch'
        : errorCode === 'SERVICE_UNAVAILABLE'
        ? 'retry_exhaustion'
        : 'token_exchange_failed';
      oauthMetrics.recordFlowFailure(errorType, 'token_exchange', correlationId, flowDuration);
      
      // Requirement 11.6: Handle authorization code reuse (return 400)
      // Requirement 12.3: Handle redirect_uri_mismatch error from Google (return 400)
      // Requirement 11.3: Handle all retry exhaustion (return 503)
      const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      errorUrl.pathname = '/signin';
      errorUrl.searchParams.set('error', errorCode);
      errorUrl.searchParams.set('message', error instanceof Error ? error.message : 'Authentication failed');
      
      // Set appropriate HTTP status if we were to return JSON (for reference)
      // For redirects, we always use 302, but log the intended status
      console.log('[OAuth] Redirecting to frontend with error:', { 
        correlationId, 
        errorCode, 
        intendedStatusCode: statusCode 
      });
      
      return res.redirect(errorUrl.toString());
    }
    
    // Requirement 2.7: Get user information from Google using access token
    console.log('[OAuth] Retrieving user information:', { correlationId });
    
    let userInfo;
    try {
      userInfo = await tokenExchangeService.getUserInfo(tokenResult.accessToken);
    } catch (error) {
      console.error('[OAuth] Failed to get user info:', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      errorUrl.pathname = '/signin';
      errorUrl.searchParams.set('error', 'user_info_failed');
      errorUrl.searchParams.set('message', 'Failed to retrieve user information');
      return res.redirect(errorUrl.toString());
    }
    
    // Requirements 3.1-3.5: Create Firebase custom token and manage user
    console.log('[OAuth] Creating Firebase custom token:', {
      correlationId,
      email: userInfo.email,
    });
    
    // Determine the flow intent captured at /google/start. Sign-in must not
    // create a new account; if the user doesn't exist we send them to the
    // waitlist (account creation requires early access).
    const oauthMode = (req.session as any)?.oauthMode === 'signin' ? 'signin' : 'signup';

    let firebaseResult;
    try {
      firebaseResult = await firebaseTokenService.createFirebaseToken(userInfo, {
        allowCreate: oauthMode !== 'signin',
      });
    } catch (error) {
      // Sign-in attempt for an account that doesn't exist yet. Don't create it —
      // redirect to the waitlist so the user can request early access. (They only
      // get an account by being approved off the waitlist and signing up.)
      if ((error as any)?.code === 'ACCOUNT_NOT_FOUND') {
        console.log('[OAuth] Sign-in for non-existent account — redirecting to waitlist:', {
          correlationId,
          email: userInfo.email,
        });
        stateValidator.clearOAuthSession(req);
        delete (req.session as any).oauthMode;

        const waitlistUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
        waitlistUrl.pathname = '/signin';
        waitlistUrl.searchParams.set('error', 'account_not_found');
        waitlistUrl.searchParams.set(
          'message',
          'No VeeFore account found for this Google account. Join the waitlist to get access.'
        );
        return res.redirect(waitlistUrl.toString());
      }

      console.error('[OAuth] Firebase token creation failed:', {
        correlationId,
        email: userInfo.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Record OAuth flow failure with Firebase token error
      const flowDuration = Date.now() - flowStartTime;
      oauthMetrics.recordFlowFailure('firebase_token_failed', 'firebase_token_creation', correlationId, flowDuration);
      
      // Requirement 3.5: Return 500 if Firebase token creation fails
      const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      errorUrl.pathname = '/signin';
      errorUrl.searchParams.set('error', 'firebase_token_failed');
      errorUrl.searchParams.set('message', 'Failed to create authentication token');
      return res.redirect(errorUrl.toString());
    }
    
    // Requirement 4: Store encrypted refresh token if available
    if (tokenResult.refreshToken) {
      console.log('[OAuth] Storing encrypted refresh token:', {
        correlationId,
        userId: firebaseResult.user._id,
      });
      
      try {
        await refreshTokenStore.storeRefreshToken(
          firebaseResult.user._id.toString(),
          tokenResult.refreshToken
        );
      } catch (error) {
        console.error('[OAuth] Failed to store refresh token:', {
          correlationId,
          userId: firebaseResult.user._id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // Requirement 4.6: Return 500 if encryption fails
        const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
        errorUrl.pathname = '/signin';
        errorUrl.searchParams.set('error', 'encryption_failed');
        errorUrl.searchParams.set('message', 'Failed to secure authentication');
        return res.redirect(errorUrl.toString());
      }
    }
    
    // Requirement 5: Set auth_token cookie with Firebase custom token
    // Requirement 5.1-5.7: Set all required cookie attributes
    const isHttpsFrontend = process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,                           // Requirement 5.1: Prevent JavaScript access
      secure: isHttpsFrontend,                  // Requirement 5.2: HTTPS only in production or if frontend is HTTPS
      sameSite: 'lax' as const,                 // Use lax for OAuth cross-site redirects
      path: '/',                                // Requirement 5.4: Available to all routes
      maxAge: 30 * 24 * 60 * 60 * 1000,         // 30 days (Instagram-style persistent session)
      domain: isHttpsFrontend
        ? process.env.COOKIE_DOMAIN
        : undefined,                            // Requirement 5.6: Set domain when using HTTPS frontend
    };
    
    res.cookie('auth_token', firebaseResult.customToken, cookieOptions);
    
    console.log('[OAuth] Set auth_token cookie:', {
      correlationId,
      cookieDomain: cookieOptions.domain,
      cookieSecure: cookieOptions.secure,
      cookieSameSite: cookieOptions.sameSite,
      tokenLength: firebaseResult.customToken.length,
    });
    
    // Log successful token exchange (Requirement 18.2)
    console.log('[OAuth] Token exchange successful:', {
      correlationId,
      email: userInfo.email,
      isNewUser: firebaseResult.isNewUser,
      timestamp: new Date().toISOString(),
    });
    
    // Record successful OAuth flow completion
    const flowDuration = Date.now() - flowStartTime;
    oauthMetrics.recordFlowSuccess(
      flowDuration, 
      firebaseResult.user._id.toString(), 
      userInfo.email, 
      correlationId
    );
    
    // Clear OAuth session data (state and code_verifier already cleared by validateState)
    // This is redundant but ensures complete cleanup
    stateValidator.clearOAuthSession(req);
    delete (req.session as any).oauthMode;
    
    // Redirect to frontend. Choose the destination based on onboarding status so
    // the user lands on the RIGHT page in a single hop:
    //  - Not onboarded  -> /signup?resume=true (onboarding flow)
    //  - Onboarded       -> / (dashboard root)
    // Redirecting a not-onboarded user to '/' would force the client to do a
    // SECOND navigation to /signup?resume=true after the session restores, which
    // causes the ugly blank-screen flash the user reported. Sending them straight
    // to the onboarding URL keeps it to one page load.
    const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
    const userIsOnboarded = firebaseResult.user?.isOnboarded === true;
    authDebugLog('CALLBACK redirect decision', {
      userId: String(firebaseResult.user?._id || firebaseResult.user?.id || 'unknown'),
      email: firebaseResult.user?.email,
      isOnboarded: firebaseResult.user?.isOnboarded,
      isOnboardedCheck: userIsOnboarded,
      isNewUser: firebaseResult.isNewUser,
    });
    if (userIsOnboarded) {
      redirectUrl.pathname = '/';
    } else {
      redirectUrl.pathname = '/signup';
      redirectUrl.searchParams.set('resume', 'true');
    }

    // ALWAYS add oauth_success=true to trigger frontend session exchange
    // This tells the frontend to call /api/auth/session to exchange the cookie for a Firebase token
    redirectUrl.searchParams.set('oauth_success', 'true');
    
    // Add welcome parameter for new users to show welcome message
    if (firebaseResult.isNewUser) {
      redirectUrl.searchParams.set('welcome', 'true');
    }
    
    res.redirect(redirectUrl.toString());
    
  } catch (error) {
    console.error('[OAuth] Callback endpoint error:', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Clear OAuth session on error
    stateValidator.clearOAuthSession(req);
    
    // Redirect to frontend with generic error
    const errorUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
    errorUrl.pathname = '/signin';
    errorUrl.searchParams.set('error', 'authentication_failed');
    errorUrl.searchParams.set('message', 'Authentication failed - please try again');
    res.redirect(errorUrl.toString());
  }
});

/**
 * POST /api/auth/refresh
 * 
 * Refresh Firebase authentication token using stored refresh token
 * 
 * This endpoint:
 * 1. Verifies existing auth_token cookie
 * 2. Extracts user ID from session
 * 3. Retrieves and decrypts refresh_token from MongoDB
 * 4. Requests new access_token from Google
 * 5. Creates new Firebase custom token
 * 6. Updates auth_token cookie
 * 
 * @requirement 6.1 - Expose endpoint at /api/auth/refresh
 * @requirement 6.2 - Verify existing session cookie signature
 * @requirement 6.3 - Return 401 if session cookie is invalid
 * @requirement 6.4 - Retrieve and decrypt refresh_token from MongoDB
 * @requirement 6.5 - Return 401 if refresh_token not found
 * @requirement 6.6 - Request new access_token from Google
 * @requirement 6.7 - Return 401 if refresh token expired
 * @requirement 6.8 - Create new Firebase custom token
 * @requirement 6.9 - Update auth_token cookie
 * @requirement 6.10 - Return 200 with success message
 */
router.post('/refresh', async (req: OAuthRequest, res: Response) => {
  const correlationId = req.correlationId || `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const refreshStartTime = Date.now(); // Track token refresh duration for metrics
  
  try {
    // Requirement 6.2: Verify auth_token cookie exists
    const authToken = req.cookies?.auth_token;
    
    if (!authToken) {
      // Requirement 6.3: Return 401 if no valid session
      console.warn('[OAuth] Refresh attempted with no auth token:', { correlationId });
      return res.status(401).json({
        error: 'no_valid_session',
        message: 'No valid session found',
        correlationId,
      });
    }
    
    // Verify Firebase token and extract user ID
    let decodedToken;
    try {
      decodedToken = await firebaseTokenService.verifyToken(authToken);
    } catch (error) {
      console.error('[OAuth] Token verification failed:', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // MIGRATION FIX: Check if this is a custom token (old format)
      // Custom tokens can't be verified, so we need user to get a new token
      const errorMessage = error instanceof Error ? error.message : '';
      const errorCode = (error as any)?.code || '';
      
      if (errorMessage.includes('Token type mismatch') || 
          errorMessage.includes('expects an ID token') || 
          errorCode === 'auth/argument-error') {
        console.warn('[OAuth] Detected old custom token format, clearing cookie:', { correlationId, errorMessage });
        
        // Clear the old cookie
        res.clearCookie('auth_token', {
          httpOnly: true,
          secure: process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          domain: (process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production') ? process.env.COOKIE_DOMAIN : undefined,
        });
        
        // Return special error code so client knows to re-authenticate
        return res.status(401).json({
          error: 'token_format_migration',
          message: 'Please sign in again to update your session',
          requiresReauth: true,
          correlationId,
        });
      }
      
      // Requirement 6.3: Return 401 if session cookie is invalid
      return res.status(401).json({
        error: 'no_valid_session',
        message: 'Invalid or expired session',
        correlationId,
      });
    }
    
    const userId = decodedToken.uid;
    
    // Get user from database early to check session version
    // Requirement 2.20, 2.21: Verify session version BEFORE attempting token refresh
    const { User } = await import('../models/User/User');
    const user = await User.findById(userId);
    
    if (!user) {
      console.error('[OAuth] User not found during token refresh:', { correlationId, userId });
      
      return res.status(401).json({
        error: 'user_not_found',
        message: 'User not found',
        correlationId,
      });
    }
    
    // Extract sessionVersion from current token if it exists
    const currentTokenSessionVersion = (decodedToken as any).sessionVersion;
    const userSessionVersion = user.sessionVersion || 1;
    
    // Check for session version mismatch EARLY to avoid unnecessary Google API calls
    if (currentTokenSessionVersion !== undefined && currentTokenSessionVersion !== userSessionVersion) {
      console.warn('[OAuth] Session version mismatch detected:', {
        correlationId,
        userId,
        tokenVersion: currentTokenSessionVersion,
        userVersion: userSessionVersion,
      });
      
      // Requirement 2.21: Return 401 with session_invalidated error
      return res.status(401).json({
        error: 'session_invalidated',
        message: 'Your session has been invalidated. Please log in again.',
        correlationId,
      });
    }
    
    // Requirement 2.10, 2.11: Check per-user rate limiting
    // Fix 5 (Bug 1.10, 1.11): Implement per-user rate limiting for failed refresh attempts
    if (refreshRateLimiter) {
      const isBlocked = await refreshRateLimiter.isBlocked(userId, correlationId);
      
      if (isBlocked) {
        console.warn('[OAuth] User is rate limited from refresh attempts:', { correlationId, userId });
        
        // Requirement 2.11: Return 429 when user exceeds the threshold
        return res.status(429).json({
          error: 'user_rate_limited',
          message: 'Too many failed refresh attempts. Please try again later.',
          correlationId,
        });
      }
    }
    
    // Requirement 6.4: Retrieve and decrypt refresh_token from MongoDB
    console.log('[OAuth] Retrieving refresh token for user:', { correlationId, userId });
    
    const refreshToken = await refreshTokenStore.getRefreshToken(userId);
    
    if (!refreshToken) {
      // Requirement 6.5: Return 401 if refresh_token not found
      console.error('[OAuth] Refresh token not found:', { correlationId, userId });
      
      return res.status(401).json({
        error: 'refresh_token_not_found',
        message: 'Refresh token not found',
        correlationId,
      });
    }
    
    // Requirement 6.6: Request new access_token from Google
    console.log('[OAuth] Requesting new access token:', { correlationId, userId });
    
    let refreshResult;
    try {
      refreshResult = await tokenExchangeService.refreshAccessToken(refreshToken, correlationId);
    } catch (error) {
      const errorCode = (error as any).code || 'token_refresh_failed';
      const statusCode = (error as any).statusCode || 500;
      
      console.error('[OAuth] Failed to refresh access token:', {
        correlationId,
        userId,
        errorCode,
        statusCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Requirement 2.10: Record failed refresh attempt for rate limiting
      // Fix 5 (Bug 1.10, 1.11): Track failed attempts per user
      if (refreshRateLimiter) {
        await refreshRateLimiter.recordFailure(userId, correlationId);
      }
      
      // Requirement 6.7: Return 401 if refresh token expired
      // Check if error message indicates expired/revoked token
      const errorMessage = (error instanceof Error ? error.message : '').toLowerCase();
      if (errorMessage.includes('expired') || errorMessage.includes('revoked') || errorMessage.includes('re-authenticate')) {
        return res.status(401).json({
          error: 'refresh_token_expired',
          message: 'Refresh token expired, please re-authenticate',
          correlationId,
        });
      }
      
      // Requirement 11.3: Handle all retry exhaustion (return 503)
      if (errorCode === 'SERVICE_UNAVAILABLE' || statusCode === 503) {
        return res.status(503).json({
          error: 'service_unavailable',
          message: 'Authentication service temporarily unavailable',
          correlationId,
        });
      }
      
      // Other refresh failures
      return res.status(statusCode).json({
        error: errorCode,
        message: error instanceof Error ? error.message : 'Failed to refresh authentication token',
        correlationId,
      });
    }
    
    // Requirement 6.8: Create new Firebase custom token
    console.log('[OAuth] Creating new Firebase custom token:', { correlationId, userId, email: decodedToken.email });
    
    // Create new Firebase custom token using Firebase Admin SDK
    const admin = getFirebaseAdmin();
    
    const customToken = await admin.auth().createCustomToken(
      String(user._id),
      {
        email: user.email,
        emailVerified: user.isEmailVerified,
        googleId: user.googleId,
        sessionVersion: userSessionVersion, // Include session version for invalidation
      }
    );
    
    // Return the custom token in the response body so client can exchange it for an ID token
    // The client will then call /api/auth/update-token to update the cookie with the ID token
    console.log('[OAuth] Token refresh successful, returning custom token:', {
      correlationId,
      userId,
      email: user.email,
      timestamp: new Date().toISOString(),
    });
    
    // Requirement: Record successful refresh to reset failed attempt counter
    // Fix 5 (Bug 1.10, 1.11): Reset counter after successful refresh
    if (refreshRateLimiter) {
      await refreshRateLimiter.recordSuccess(userId, correlationId);
    }
    
    // Record successful token refresh
    const refreshDuration = Date.now() - refreshStartTime;
    oauthMetrics.recordTokenRefresh(true, refreshDuration, userId, correlationId);
    
    // Requirement 6.10: Return 200 with success message and custom token
    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      customToken, // Client will exchange this for ID token
      correlationId,
    });
    
  } catch (error) {
    console.error('[OAuth] Refresh endpoint error:', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Record failed token refresh
    const refreshDuration = Date.now() - refreshStartTime;
    oauthMetrics.recordTokenRefresh(false, refreshDuration, undefined, correlationId);
    
    return res.status(500).json({
      error: 'token_refresh_failed',
      message: 'Failed to refresh authentication token',
      correlationId,
    });
  }
});

/**
 * POST /api/auth/logout
 * 
 * Log out user and clear authentication cookies
 * 
 * This endpoint:
 * 1. Clears auth_token cookie (set Max-Age=0)
 * 2. Clears session cookie (set Max-Age=0)
 * 3. Returns success response
 * 
 * @requirement 7.1 - Expose endpoint at /api/auth/logout
 * @requirement 7.2 - Clear auth_token cookie
 * @requirement 7.3 - Clear session cookie
 * @requirement 7.4 - Return 200 with success message
 */
router.post('/logout', async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = isProd ? process.env.COOKIE_DOMAIN : undefined;

  // AUTHORITATIVE INVALIDATION: bump the user's sessionVersion BEFORE clearing
  // cookies. This is what makes logout actually stick. Clearing cookies alone is
  // racy — a still-open tab (or the OAuth/session-restore flow) can re-mint
  // `auth_token`/`__session` via /session, /session-login or /update-token before
  // the clear lands, silently logging the user back in. Every token minted for
  // this user carries a `sessionVersion` claim; once we bump it here, all of
  // those existing tokens are stale and the session-establishing endpoints below
  // reject them — so no lingering tab can resurrect the session. A fresh login
  // mints a token with the new version, so signing back in still works normally.
  // (This is "logout everywhere", which matches the existing cross-tab logout.)
  try {
    const authToken = (req as any).cookies?.auth_token as string | undefined;
    const uid = authToken ? await resolveUidFromToken(authToken) : undefined;
    if (uid) {
      const { User } = await import('../models/User/User');
      await User.findByIdAndUpdate(uid, { $inc: { sessionVersion: 1 } });
      authDebugLog('LOGOUT bumped sessionVersion', { uid });
    }
  } catch (err) {
    // Non-fatal: never block logout on this.
    authDebugLog('LOGOUT sessionVersion bump failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Clear ALL auth cookies. Options (path/domain) must match how they were set,
  // or the browser keeps them and the user is silently logged back in:
  //  - auth_token  → used by /api/auth/session to re-mint a custom token.
  //  - __session   → the durable SSR session cookie the HTML bootstrap verifies;
  //    if it survives, the server injects an authed user and the app re-mounts
  //    the dashboard even though Firebase is signed out. (Previously this route
  //    cleared a cookie named 'session', which DOES NOT EXIST — the real name is
  //    '__session' — so logout left the user effectively still signed in.)
  const clearOpts = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/', domain };
  res.clearCookie('auth_token', clearOpts);
  res.clearCookie('__session', clearOpts);
  // Defensive: also clear without an explicit domain, in case a cookie was set
  // host-only (no domain attribute) in some environment.
  res.clearCookie('auth_token', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  res.clearCookie('__session', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });

  console.log('[OAuth] User logged out — cleared auth_token + __session');

  // Record logout operation
  oauthMetrics.recordLogout();

  // Requirement 7.4: Return success response
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/metrics
 * 
 * OAuth metrics monitoring endpoint
 * 
 * Provides real-time metrics for OAuth operations including:
 * - OAuth flow success rate
 * - Token refresh success rate
 * - Average OAuth flow duration
 * - Error rates by type
 * 
 * This endpoint is intended for monitoring dashboards and observability tools.
 * 
 * @requirement 18.9 - Implement metrics for OAuth operations
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const metricsSummary = oauthMetrics.getMetricsSummary();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        oauth_flow: {
          success_rate_percent: metricsSummary.flowSuccessRate.toFixed(2),
          total_flows: metricsSummary.totalFlows,
          average_duration_ms: metricsSummary.averageFlowDurationMs.toFixed(0),
        },
        token_refresh: {
          success_rate_percent: metricsSummary.refreshSuccessRate.toFixed(2),
          total_refreshes: metricsSummary.totalRefreshes,
        },
        errors: {
          error_rates_by_type: metricsSummary.errorRatesByType,
        },
        metadata: {
          recent_metrics_count: metricsSummary.recentMetricsCount,
          note: 'Metrics are based on the last 1000 operations',
        },
      },
    });
  } catch (error) {
    console.error('[OAuth] Metrics endpoint error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    res.status(500).json({
      success: false,
      error: 'metrics_retrieval_failed',
      message: 'Failed to retrieve OAuth metrics',
    });
  }
});

/**
 * GET /api/auth/session
 *
 * Exchange the HTTP-only auth_token cookie for a Firebase custom token
 * so the client can call signInWithCustomToken() and establish a
 * client-side Firebase session after server-side OAuth completes.
 *
 * This is the bridge between server-side OAuth (which stores the token in
 * an HTTP-only cookie) and the Firebase client SDK (which needs the token).
 */
router.get('/session', async (req: OAuthRequest, res: Response) => {
  console.log('[GET /api/auth/session] ========== REQUEST START ==========');
  console.log('[GET /api/auth/session] URL:', req.url);
  console.log('[GET /api/auth/session] Method:', req.method);
  console.log('[GET /api/auth/session] Headers:', JSON.stringify({
    cookie: req.headers.cookie,
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host,
  }, null, 2));
  console.log('[GET /api/auth/session] Parsed cookies:', JSON.stringify(req.cookies, null, 2));
  console.log('[GET /api/auth/session] Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
    FRONTEND_URL: process.env.FRONTEND_URL,
  });
  
  const authToken = req.cookies?.auth_token;

  if (!authToken) {
    console.warn('[GET /api/auth/session] ❌ No auth_token found in cookies');
    console.warn('[GET /api/auth/session] Available cookie keys:', Object.keys(req.cookies || {}));
    console.warn('[GET /api/auth/session] Raw cookie header:', req.headers.cookie);
    return res.status(401).json({
      error: 'no_session',
      message: 'No active session found',
      debug: {
        hasCookieHeader: !!req.headers.cookie,
        cookieKeys: Object.keys(req.cookies || {}),
        environment: process.env.NODE_ENV,
      }
    });
  }

  // The auth_token cookie may hold EITHER a Firebase custom token (set right after
  // OAuth) OR a Firebase ID token (after /update-token swapped it so /refresh can
  // verify it). The client calls signInWithCustomToken() with whatever we return,
  // and that ONLY accepts a custom token — returning an ID token throws
  // auth/invalid-custom-token and leaves the user stuck on the landing page.
  //
  // To be robust regardless of which token form is in the cookie, we extract the
  // uid and always mint a FRESH custom token server-side.
  try {
    const admin = getFirebaseAdmin();

    // 1) Resolve the uid from the cookie token.
    let uid: string | undefined;
    try {
      // Works when the cookie is an ID token.
      const decoded = await admin.auth().verifyIdToken(authToken);
      uid = decoded.uid;
    } catch {
      // Otherwise it's a custom token (or some other JWT) — decode the payload
      // (without signature verification) to read the uid claim. We re-mint a
      // properly signed token below, so decoding here is safe.
      try {
        const parts = authToken.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          uid = payload.uid || payload.user_id || payload.sub;
        }
      } catch {
        // fall through to error handling below
      }
    }

    if (!uid) {
      console.warn('[GET /api/auth/session] ❌ Could not resolve uid from auth_token');
      authDebugLog('SESSION 401 invalid_session (no uid)');
      return res.status(401).json({
        error: 'invalid_session',
        message: 'Session token could not be validated',
      });
    }

    // 2) Load the user to include current claims (e.g. sessionVersion) so the
    //    minted token stays consistent with the /refresh invalidation checks.
    const { User } = await import('../models/User/User');
    const user = await User.findById(uid);

    if (!user) {
      console.warn('[GET /api/auth/session] ❌ User not found for uid:', uid);
      authDebugLog('SESSION 401 user_not_found', { uid });
      // Clear the stale auth_token cookie so the client knows it needs to sign in fresh
      // rather than looping on an invalid session indefinitely.
      clearAuthCookies(res);
      return res.status(401).json({
        error: 'user_not_found',
        message: 'User not found',
        requiresReauth: true,
      });
    }

    // SESSION INVALIDATION: if the cookie token's sessionVersion is stale (a
    // logout bumped the user's sessionVersion), refuse to mint a new token and
    // clear the cookies. This is what stops a lingering tab / stale auth_token
    // cookie from silently resurrecting the session after logout.
    const tokenSessionVersion = decodeTokenClaims(authToken)?.sessionVersion;
    if (isSessionVersionStale(tokenSessionVersion, user.sessionVersion)) {
      clearAuthCookies(res);
      authDebugLog('SESSION 401 session_invalidated', {
        uid,
        tokenSessionVersion,
        userSessionVersion: user.sessionVersion || 1,
      });
      return res.status(401).json({
        error: 'session_invalidated',
        message: 'Your session has been invalidated. Please sign in again.',
      });
    }

    // 3) Mint a fresh custom token the client can exchange via signInWithCustomToken().
    const customToken = await admin.auth().createCustomToken(String(user._id), {
      email: user.email,
      emailVerified: user.isEmailVerified,
      googleId: user.googleId,
      sessionVersion: user.sessionVersion || 1,
    });

    console.log('[GET /api/auth/session] ✅ Minted fresh custom token for uid:', uid);
    authDebugLog('SESSION 200 minted custom token', { uid });

    return res.status(200).json({ customToken });
  } catch (error) {
    console.error('[GET /api/auth/session] Failed to mint custom token:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    authDebugLog('SESSION 500 mint failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      error: 'session_error',
      message: 'Failed to establish session',
    });
  }
});

/**
 * POST /api/auth/update-token
 * 
 * Update the auth_token cookie with a Firebase ID token
 * 
 * After the client exchanges a custom token for an ID token using
 * signInWithCustomToken(), it sends the ID token back to the server
 * to update the cookie. This ensures the cookie contains an ID token
 * (not a custom token) which can be properly verified during refresh.
 * 
 * Flow:
 * 1. Client gets custom token from /api/auth/session
 * 2. Client calls signInWithCustomToken() → gets ID token
 * 3. Client sends ID token to this endpoint
 * 4. Server updates cookie with ID token
 * 5. Future /api/auth/refresh calls can verify the ID token
 */
router.post('/update-token', async (req: OAuthRequest, res: Response) => {
  const correlationId = req.correlationId || `update_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    const { idToken } = req.body;
    
    if (!idToken || typeof idToken !== 'string') {
      console.warn('[OAuth] Update token called without valid ID token:', { correlationId });
      return res.status(400).json({
        error: 'invalid_request',
        message: 'ID token is required',
        correlationId,
      });
    }
    
    // Verify the ID token is valid before storing it
    let decodedIdToken: any;
    try {
      decodedIdToken = await firebaseTokenService.verifyToken(idToken);
      console.log('[OAuth] ID token verified successfully:', { correlationId });
    } catch (error) {
      console.error('[OAuth] ID token verification failed:', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid ID token',
        correlationId,
      });
    }

    // SESSION INVALIDATION: don't re-mint cookies for a token whose sessionVersion
    // is stale (a logout bumped it). Without this, a lingering tab calling
    // /update-token after logout would recreate auth_token + __session and log the
    // user back in.
    try {
      const uid = decodedIdToken?.uid;
      if (uid) {
        const { User } = await import('../models/User/User');
        const user = await User.findById(uid);
        if (user && isSessionVersionStale((decodedIdToken as any)?.sessionVersion, user.sessionVersion)) {
          clearAuthCookies(res);
          authDebugLog('UPDATE-TOKEN 401 session_invalidated', {
            uid,
            tokenSessionVersion: (decodedIdToken as any)?.sessionVersion,
            userSessionVersion: user.sessionVersion || 1,
          });
          return res.status(401).json({
            error: 'session_invalidated',
            message: 'Your session has been invalidated. Please sign in again.',
            correlationId,
          });
        }
      }
    } catch {
      /* fail-open: a lookup failure must not break a legitimate token update */
    }
    
    // Update the cookie with the ID token
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      domain: (process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production')
        ? process.env.COOKIE_DOMAIN
        : undefined,
    };
    
    res.cookie('auth_token', idToken, cookieOptions);

    // SSR instant-load: also mint the durable, server-VERIFIABLE `__session`
    // cookie from this freshly-verified ID token. This is the most reliable place
    // to create it (we already have a valid ID token here, and the client calls
    // this endpoint after session restore and after every token refresh), so the
    // HTML route can seed the dashboard data on the first byte of the next load.
    // The httpOnly `auth_token` holds a CUSTOM token after OAuth, which the HTML
    // route cannot verify — `__session` is what makes first-byte seeding work.
    // Best-effort: a failure here must never break token update.
    try {
      const admin = getFirebaseAdmin();
      const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days
      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
      res.cookie('__session', sessionCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || process.env.FRONTEND_URL?.startsWith('https') || false,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: expiresIn,
        domain: (process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production') ? process.env.COOKIE_DOMAIN : undefined,
      });
      console.log('[OAuth] Minted __session cookie alongside auth_token:', { correlationId });
    } catch (sessionErr) {
      console.warn('[OAuth] Could not mint __session cookie (non-fatal):', {
        correlationId,
        error: sessionErr instanceof Error ? sessionErr.message : 'Unknown error',
      });
    }

    console.log('[OAuth] Updated auth_token cookie with ID token:', {
      correlationId,
      tokenLength: idToken.length,
    });
    
    return res.status(200).json({
      success: true,
      message: 'Token updated successfully',
      correlationId,
    });
    
  } catch (error) {
    console.error('[OAuth] Update token error:', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to update token',
      correlationId,
    });
  }
});



/**
 * POST /api/auth/invalidate-sessions/:userId
 *

 * This endpoint invalidates all active sessions for a user by incrementing
 * their sessionVersion. All existing tokens with the old version will be
 * rejected on the next refresh attempt.
 * 
 * Use cases:
 * - Account compromise detected
 * - User reports suspicious activity
 * - Security team initiates emergency lockout
 * - Password reset (if implemented in future)
 * 
 * @requirement 2.20 - Invalidate all active sessions using session versioning
 * @requirement 2.21 - Version mismatch detection and rejection
 */
router.post('/invalidate-sessions/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const correlationId = `invalidate_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    // Import User model
    const { User } = await import('../models/User/User');
    
    // Find user and increment sessionVersion
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { sessionVersion: 1 } },
      { new: true }
    );
    
    if (!user) {
      console.warn('[OAuth] User not found for session invalidation:', {
        correlationId,
        userId,
      });
      
      return res.status(404).json({
        error: 'user_not_found',
        message: 'User not found',
        correlationId,
      });
    }
    
    console.log('[OAuth] All sessions invalidated for user:', {
      correlationId,
      userId,
      newSessionVersion: user.sessionVersion,
      timestamp: new Date().toISOString(),
    });
    
    return res.status(200).json({
      success: true,
      message: 'All sessions invalidated successfully',
      newSessionVersion: user.sessionVersion,
      correlationId,
    });
    
  } catch (error) {
    console.error('[OAuth] Session invalidation error:', {
      correlationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return res.status(500).json({
      error: 'invalidation_failed',
      message: 'Failed to invalidate sessions',
      correlationId,
    });
  }
});

export default router;
