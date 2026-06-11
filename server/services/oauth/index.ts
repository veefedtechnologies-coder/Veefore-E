/**
 * OAuth Services Module
 * 
 * This module exports OAuth-related services for server-side OAuth 2.0 implementation:
 * - StateValidator: CSRF protection via state parameter validation
 * - PKCEUtils: PKCE (Proof Key for Code Exchange) generation and validation
 * - TokenExchangeService: OAuth token exchange with Google
 * - FirebaseTokenService: Firebase custom token creation and user management
 * - RefreshTokenStore: Encrypted refresh token storage (exported separately)
 * - OAuthMetrics: Metrics tracking for OAuth operations
 */

export { StateValidator, stateValidator } from './StateValidator';
export type { OAuthSession, OAuthRequest, StateValidationResult } from './StateValidator';

export { 
  PKCEUtils,
  generatePKCEPair,
  generateCodeVerifier,
  generateCodeChallenge,
  verifyPKCEPair
} from './PKCEUtils';
export type { PKCEPair } from './PKCEUtils';

export { TokenExchangeService, createTokenExchangeService, tokenExchangeService } from './TokenExchangeService';
export type { TokenExchangeResult, GoogleUserInfo, RefreshResult } from './TokenExchangeService';

export { FirebaseTokenService, firebaseTokenService } from './FirebaseTokenService';
export type { FirebaseTokenResult, DecodedToken } from './FirebaseTokenService';

export { oauthMetrics, OAuthMetricsTracker } from './OAuthMetrics';
export type { OAuthFlowStage, OAuthOperation, OAuthErrorType } from './OAuthMetrics';

export { oauthAlerting, OAuthAlertingServiceClass as OAuthAlertingService } from './OAuthAlertingService';
export type { Alert, AlertType, AlertSeverity, AlertResult } from './OAuthAlertingService';

export { RefreshRateLimiter, refreshRateLimiter, initializeRefreshRateLimiter } from './RefreshRateLimiter';
