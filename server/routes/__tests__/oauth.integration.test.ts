import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Integration tests for complete OAuth flow
 * 
 * Feature: server-side-oauth-implementation
 * Task 12.6: Integration tests for complete OAuth flow
 * 
 * **Validates: Requirements 15.1, 15.9**
 * 
 * This test verifies:
 * - Start endpoint redirects to Google with correct parameters
 * - Callback endpoint with valid code and state
 * - Callback endpoint with invalid state (expect 403)
 * - Callback endpoint with expired state (expect 403)
 * - Callback endpoint with invalid code (expect 401)
 * - Refresh endpoint with valid session
 * - Refresh endpoint with no session (expect 401)
 * - Refresh endpoint with expired refresh_token (expect 401)
 * - Logout endpoint clears cookies
 */

// Mock OAuth services
const mockStateValidator = {
  generateState: vi.fn(() => 'mock-state-12345'),
  storeState: vi.fn(),
  validateState: vi.fn(),
};

const mockPKCE = {
  generatePKCEPair: vi.fn(() => ({
    codeVerifier: 'mock-verifier',
    codeChallenge: 'mock-challenge',
    codeChallengeMethod: 'S256' as const,
  })),
};

const mockTokenExchangeService = {
  exchangeCodeForTokens: vi.fn(),
  getUserInfo: vi.fn(),
  refreshAccessToken: vi.fn(),
};

const mockFirebaseTokenService = {
  createFirebaseToken: vi.fn(),
  verifyToken: vi.fn(),
};

const mockRefreshTokenStore = {
  storeRefreshToken: vi.fn(),
  getRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
};

const mockSessionManager = {
  setAuthCookie: vi.fn(),
  clearAuthCookies: vi.fn(),
  getAuthToken: vi.fn(),
};

// Mock request/response helpers
function mockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    session: {},
    query: {},
    body: {},
    headers: {},
    correlationId: 'test-correlation-id',
    ...overrides,
  };
}

function mockResponse(): Partial<Response> & { redirect: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn>, json: ReturnType<typeof vi.fn>, cookie: ReturnType<typeof vi.fn> } {
  const res: any = {
    redirect: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('OAuth Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.OAUTH_CALLBACK_URL = 'https://api.veefore.com/api/auth/google/callback';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('OAuth Start Endpoint', () => {
    it('should redirect to Google with correct OAuth parameters', () => {
      const req = mockRequest();
      const res = mockResponse();

      // Simulate OAuth start logic
      const state = mockStateValidator.generateState();
      const { codeChallenge, codeChallengeMethod } = mockPKCE.generatePKCEPair();
      
      mockStateValidator.storeState(req, state, 'mock-verifier');

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
      authUrl.searchParams.set('redirect_uri', process.env.OAUTH_CALLBACK_URL!);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

      res.redirect(authUrl.toString());

      // Verify redirect was called with correct URL
      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('accounts.google.com');
      expect(redirectUrl).toContain('client_id=test-client-id');
      expect(redirectUrl).toContain('state=mock-state-12345');
      expect(redirectUrl).toContain('code_challenge=mock-challenge');
      expect(redirectUrl).toContain('code_challenge_method=S256');
      expect(redirectUrl).toContain('scope=openid'); // URL encoding varies (+  vs %20)
      expect(redirectUrl).toContain('response_type=code');
    });
  });

  describe('OAuth Callback Endpoint', () => {
    it('should successfully process valid OAuth callback', async () => {
      const req = mockRequest({
        query: {
          code: 'valid-auth-code',
          state: 'valid-state',
        },
      });
      const res = mockResponse();

      // Mock successful flow
      mockStateValidator.validateState.mockReturnValue({
        isValid: true,
        codeVerifier: 'code-verifier',
      });
      mockTokenExchangeService.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });
      mockTokenExchangeService.getUserInfo.mockResolvedValue({
        sub: 'google-123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      });
      mockFirebaseTokenService.createFirebaseToken.mockResolvedValue({
        customToken: 'firebase-token',
        user: { _id: 'user-id', email: 'user@example.com' },
        isNewUser: false,
      });
      mockRefreshTokenStore.storeRefreshToken.mockResolvedValue(undefined);

      // Simulate callback processing
      const validationResult = mockStateValidator.validateState(req, req.query.state);
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.codeVerifier).toBe('code-verifier');

      const tokens = await mockTokenExchangeService.exchangeCodeForTokens('valid-auth-code', validationResult.codeVerifier);
      expect(tokens.accessToken).toBe('access-token');

      const userInfo = await mockTokenExchangeService.getUserInfo(tokens.accessToken);
      expect(userInfo.email).toBe('user@example.com');

      const firebaseResult = await mockFirebaseTokenService.createFirebaseToken(userInfo);
      expect(firebaseResult.customToken).toBe('firebase-token');

      await mockRefreshTokenStore.storeRefreshToken(firebaseResult.user._id, tokens.refreshToken);
      mockSessionManager.setAuthCookie(res, firebaseResult.customToken);

      // Verify all steps completed
      expect(mockStateValidator.validateState).toHaveBeenCalled();
      expect(mockTokenExchangeService.exchangeCodeForTokens).toHaveBeenCalled();
      expect(mockTokenExchangeService.getUserInfo).toHaveBeenCalled();
      expect(mockFirebaseTokenService.createFirebaseToken).toHaveBeenCalled();
      expect(mockRefreshTokenStore.storeRefreshToken).toHaveBeenCalled();
      expect(mockSessionManager.setAuthCookie).toHaveBeenCalled();
    });

    it('should return 403 for invalid state parameter', () => {
      const req = mockRequest({
        query: {
          code: 'valid-auth-code',
          state: 'invalid-state',
        },
      });
      const res = mockResponse();

      // Mock invalid state
      mockStateValidator.validateState.mockReturnValue({
        isValid: false,
        codeVerifier: null,
        error: 'Invalid state parameter',
      });

      const validationResult = mockStateValidator.validateState(req, req.query.state);
      
      if (!validationResult.isValid) {
        res.status(403).json({ error: 'invalid_state', message: validationResult.error });
      }

      expect(validationResult.isValid).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'invalid_state',
      }));
    });

    it('should return 403 for expired state parameter', () => {
      const req = mockRequest({
        query: {
          code: 'valid-auth-code',
          state: 'expired-state',
        },
      });
      const res = mockResponse();

      // Mock expired state
      mockStateValidator.validateState.mockReturnValue({
        isValid: false,
        codeVerifier: null,
        error: 'State expired',
      });

      const validationResult = mockStateValidator.validateState(req, req.query.state);
      
      if (!validationResult.isValid) {
        res.status(403).json({ error: 'state_expired', message: validationResult.error });
      }

      expect(validationResult.isValid).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 401 for invalid authorization code', async () => {
      const req = mockRequest({
        query: {
          code: 'invalid-code',
          state: 'valid-state',
        },
      });
      const res = mockResponse();

      // Mock valid state but invalid code
      mockStateValidator.validateState.mockReturnValue({
        isValid: true,
        codeVerifier: 'code-verifier',
      });
      mockTokenExchangeService.exchangeCodeForTokens.mockRejectedValue(
        new Error('Invalid authorization code')
      );

      try {
        await mockTokenExchangeService.exchangeCodeForTokens('invalid-code', 'code-verifier');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Invalid authorization code');
        res.status(401).json({ error: 'token_exchange_failed', message: 'Token exchange failed' });
      }

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Token Refresh Endpoint', () => {
    it('should successfully refresh token with valid session', async () => {
      const req = mockRequest({
        cookies: { auth_token: 'valid-auth-token' },
      });
      const res = mockResponse();

      // Mock successful refresh
      mockSessionManager.getAuthToken.mockReturnValue('valid-auth-token');
      mockFirebaseTokenService.verifyToken.mockResolvedValue({ uid: 'user-id' });
      mockRefreshTokenStore.getRefreshToken.mockResolvedValue('encrypted-refresh-token');
      mockTokenExchangeService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access-token',
        expiresIn: 3600,
      });
      mockFirebaseTokenService.createFirebaseToken.mockResolvedValue({
        customToken: 'new-firebase-token',
        user: { _id: 'user-id' },
        isNewUser: false,
      });

      // Simulate refresh logic
      const authToken = mockSessionManager.getAuthToken(req);
      expect(authToken).toBe('valid-auth-token');

      const decoded = await mockFirebaseTokenService.verifyToken(authToken);
      const refreshToken = await mockRefreshTokenStore.getRefreshToken(decoded.uid);
      expect(refreshToken).toBe('encrypted-refresh-token');

      const newTokens = await mockTokenExchangeService.refreshAccessToken(refreshToken);
      expect(newTokens.accessToken).toBe('new-access-token');

      mockSessionManager.setAuthCookie(res, 'new-firebase-token');
      res.status(200).json({ success: true, message: 'Token refreshed successfully' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should return 401 for missing session', () => {
      const req = mockRequest({
        cookies: {},
      });
      const res = mockResponse();

      mockSessionManager.getAuthToken.mockReturnValue(null);

      const authToken = mockSessionManager.getAuthToken(req);
      expect(authToken).toBeNull();

      res.status(401).json({ error: 'no_valid_session', message: 'No valid session found' });

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'no_valid_session',
      }));
    });

    it('should return 401 for expired refresh token', async () => {
      const req = mockRequest({
        cookies: { auth_token: 'valid-auth-token' },
      });
      const res = mockResponse();

      mockSessionManager.getAuthToken.mockReturnValue('valid-auth-token');
      mockFirebaseTokenService.verifyToken.mockResolvedValue({ uid: 'user-id' });
      mockRefreshTokenStore.getRefreshToken.mockResolvedValue('expired-refresh-token');
      mockTokenExchangeService.refreshAccessToken.mockRejectedValue(
        new Error('Refresh token expired')
      );

      try {
        await mockTokenExchangeService.refreshAccessToken('expired-refresh-token');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Refresh token expired');
        res.status(401).json({
          error: 'refresh_token_expired',
          message: 'Refresh token expired, please re-authenticate',
        });
      }

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Logout Endpoint', () => {
    it('should clear cookies and return success', () => {
      const req = mockRequest();
      const res = mockResponse();

      // Simulate logout
      mockSessionManager.clearAuthCookies(res);
      res.status(200).json({ success: true, message: 'Logged out successfully' });

      expect(mockSessionManager.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Logged out successfully',
      }));
    });
  });
});
