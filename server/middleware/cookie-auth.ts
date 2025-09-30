import { Request, Response, NextFunction } from 'express';
import { admin } from '../firebase-admin';
import crypto from 'crypto';

export interface CookieAuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    displayName?: string;
  };
  csrfToken?: string;
}

// CSRF token management
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a secure CSRF token using base64url encoding (no '=' padding)
 */
export const generateCSRFToken = (): string => {
  const randomBytes = crypto.randomBytes(CSRF_TOKEN_LENGTH);
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', CSRF_SECRET);
  hmac.update(randomBytes.toString('hex') + timestamp);
  
  // SECURITY FIX: Use base64url encoding to avoid '=' delimiter issues
  const tokenData = JSON.stringify({
    token: randomBytes.toString('hex'),
    timestamp: timestamp,
    signature: hmac.digest('hex')
  });
  
  return Buffer.from(tokenData)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, ''); // Remove padding
};

/**
 * Verify CSRF token validity (base64url format)
 */
export const verifyCSRFToken = (token: string): boolean => {
  try {
    // SECURITY FIX: Convert base64url back to base64 for decoding
    const base64Token = token
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(token.length + (4 - token.length % 4) % 4, '=');
    
    const decoded = JSON.parse(Buffer.from(base64Token, 'base64').toString());
    const { token: randomToken, timestamp, signature } = decoded;
    
    // Check if token is not too old (1 hour max)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 3600000) return false; // 1 hour
    
    // Verify signature
    const hmac = crypto.createHmac('sha256', CSRF_SECRET);
    hmac.update(randomToken + timestamp);
    const expectedSignature = hmac.digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
};

/**
 * Middleware to set secure authentication cookies
 */
export const setAuthCookie = (res: Response, token: string, csrfToken: string) => {
  // Set HTTP-only cookie for the auth token
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
    path: '/'
  });
  
  // Set CSRF token as readable cookie (for frontend to include in headers)
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false, // Frontend needs to read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', 
    maxAge: 3600000, // 1 hour
    path: '/'
  });
};

/**
 * Middleware to clear authentication cookies
 */
export const clearAuthCookies = (res: Response) => {
  res.clearCookie('auth_token', { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
};

/**
 * Cookie-based authentication middleware
 * This works alongside the existing Bearer token auth for gradual migration
 */
export const authenticateCookie = async (
  req: CookieAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for auth token in cookies first, then fallback to headers
    let token = req.cookies?.auth_token;
    
    if (!token) {
      // Fallback to Authorization header for backwards compatibility
      const authHeader = req.headers.authorization;
      token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name
    };

    // SECURITY FIX: Enforce CSRF for ALL cookie-based state-changing operations
    if (req.cookies?.auth_token && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfTokenFromHeader = req.headers['x-csrf-token'] as string;
      const csrfTokenFromCookie = req.cookies?.csrf_token;
      
      // CRITICAL: CSRF is now REQUIRED for all cookie-based requests
      if (!csrfTokenFromHeader || !csrfTokenFromCookie) {
        return res.status(403).json({ 
          error: 'CSRF token required for state-changing operations',
          code: 'CSRF_REQUIRED'
        });
      }
      
      if (csrfTokenFromHeader !== csrfTokenFromCookie || !verifyCSRFToken(csrfTokenFromHeader)) {
        return res.status(403).json({ 
          error: 'CSRF token verification failed',
          code: 'INVALID_CSRF'
        });
      }
      
      req.csrfToken = csrfTokenFromCookie;
    }

    next();
  } catch (error) {
    console.error('🚨 Cookie authentication error:', error);
    
    // Clear potentially corrupted cookies
    clearAuthCookies(res);
    
    return res.status(403).json({ 
      error: 'Invalid or expired authentication',
      code: 'INVALID_TOKEN'
    });
  }
};

/**
 * Enhanced requireAuth that works with both cookie and header auth
 */
export const requireCookieAuth = (
  req: CookieAuthRequest, 
  res: Response, 
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
};

/**
 * Endpoint to exchange Bearer token for secure cookies
 */
export const exchangeTokenForCookies = async (
  req: CookieAuthRequest,
  res: Response
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(400).json({ 
        error: 'Bearer token is required for cookie exchange',
        code: 'NO_TOKEN'
      });
    }

    // Verify the token first
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Generate CSRF token
    const csrfToken = generateCSRFToken();
    
    // Set secure cookies
    setAuthCookie(res, token, csrfToken);
    
    res.json({ 
      success: true,
      csrfToken: csrfToken,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name
      }
    });
  } catch (error) {
    console.error('🚨 Token exchange error:', error);
    res.status(403).json({ 
      error: 'Invalid token for cookie exchange',
      code: 'INVALID_TOKEN'
    });
  }
};