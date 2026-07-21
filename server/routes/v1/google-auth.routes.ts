/**
 * Google OAuth 2.0 Routes
 * 
 * Implements server-side OAuth 2.0 Authorization Code Flow with PKCE
 * for Google authentication. This replaces client-side Firebase OAuth
 * with a more secure server-side implementation.
 * 
 * Endpoints:
 * - GET /api/v1/google-auth/start - Initiate OAuth flow
 * - GET /api/v1/google-auth/callback - Handle OAuth callback
 * - POST /api/v1/google-auth/refresh - Refresh authentication token
 * - POST /api/v1/google-auth/logout - Clear authentication session
 * 
 * Security Features:
 * - PKCE (Proof Key for Code Exchange) for authorization code flow
 * - State parameter for CSRF protection
 * - HTTP-only secure cookies for session management
 * - AES-256-GCM encrypted refresh token storage
 * - Rate limiting to prevent abuse
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 18.1
 */

import crypto from "crypto";
import { Router, Request, Response, NextFunction } from 'express';
import { stateValidator, generatePKCEPair, OAuthRequest, oauthMetrics } from '../../services/oauth';
import { logger } from '../../config/logger';

const router = Router();

/**
 * GET /api/v1/google-auth/start
 * 
 * Initiates the Google OAuth 2.0 authorization flow.
 * 
 * This endpoint:
 * 1. Generates a cryptographically secure state parameter (32 bytes)
 * 2. Generates PKCE code_verifier and code_challenge
 * 3. Stores state and code_verifier in session (10-minute TTL)
 * 4. Constructs Google OAuth authorization URL with all parameters
 * 5. Redirects user to Google authorization page
 * 
 * Query Parameters:
 * - None (uses environment configuration)
 * 
 * Response:
 * - 302 Redirect to Google OAuth authorization page
 * - 500 Internal Server Error if OAuth initialization fails
 * 
 * Security:
 * - State parameter prevents CSRF attacks
 * - PKCE prevents authorization code interception
 * - Session-based storage prevents state leakage to browser
 * 
 * Requirements:
 * - 1.1: Expose endpoint at /api/auth/google/start
 * - 1.2: Generate random state parameter of at least 32 characters
 * - 1.3: Generate PKCE code_verifier and code_challenge parameters
 * - 1.4: Store state and code_verifier in session with 10-minute TTL
 * - 1.5: Construct Google OAuth URL with all required parameters
 * - 1.6: Redirect user to Google authorization page
 * - 18.1: Log OAuth flow initiation with INFO level
 */
router.get('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Generate correlation ID for logging
    const correlationId = generateCorrelationId();
    (req as OAuthRequest).correlationId = correlationId;

    // Requirement 18.1: Log OAuth flow initiation with INFO level
    logger.info('OAuth flow initiated', {
      component: 'OAuth',
      requestId: correlationId,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
    });

    // Requirement 18.9: Record OAuth flow initiation metric
    oauthMetrics.recordFlowInitiation(correlationId);

    // Requirement 1.2: Generate random state parameter (32 bytes = 64 hex characters)
    const state = stateValidator.generateState();

    // Requirement 1.3: Generate PKCE code_verifier and code_challenge
    const pkcePair = generatePKCEPair();

    // Requirement 1.4: Store state and code_verifier in session with 10-minute TTL
    stateValidator.storeState(req as OAuthRequest, state, pkcePair.codeVerifier);

    // Validate required environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.OAUTH_CALLBACK_URL;

    if (!clientId || !redirectUri) {
      throw new Error('Missing required OAuth configuration: GOOGLE_CLIENT_ID or OAUTH_CALLBACK_URL');
    }

    // Requirement 1.5: Construct Google OAuth authorization URL
    // Per spec: parameters include client_id, redirect_uri, response_type=code,
    // scope=openid email profile, state, code_challenge, and code_challenge_method=S256
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', pkcePair.codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', pkcePair.codeChallengeMethod);
    
    // Optional: Add access_type=offline to get refresh token
    authorizationUrl.searchParams.set('access_type', 'offline');
    
    // Optional: Add prompt=consent to force consent screen (ensures refresh token)
    authorizationUrl.searchParams.set('prompt', 'consent');

    logger.debug('Redirecting to Google authorization', {
      component: 'OAuth',
      requestId: correlationId,
    });

    // Requirement 1.6: Redirect user to Google authorization page
    return res.redirect(authorizationUrl.toString());
  } catch (error) {
    // Requirement 18.3: Log OAuth errors with ERROR level
    logger.error('OAuth flow initialization failed', error, {
      component: 'OAuth',
      requestId: (req as OAuthRequest).correlationId,
    });

    // Requirement 18.9: Record OAuth flow failure metric
    oauthMetrics.recordFlowFailure(
      'unknown',
      'initialization',
      (req as OAuthRequest).correlationId
    );

    // Return user-friendly error
    return res.status(500).json({
      error: 'oauth_initialization_failed',
      message: 'Failed to initialize OAuth flow. Please try again.',
      correlationId: (req as OAuthRequest).correlationId,
    });
  }
});

/**
 * Generate a unique correlation ID for request tracking
 * 
 * Creates a unique identifier for each OAuth flow to correlate
 * log entries across the entire authentication journey:
 * start → callback → token exchange → token creation
 * 
 * Format: timestamp-random (e.g., 1234567890-abc123)
 * 
 * @returns Unique correlation ID string
 */
function generateCorrelationId(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString('hex');
  return `${timestamp}-${random}`;
}

export default router;
