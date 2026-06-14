/**
 * Authentication Utility Functions
 * 
 * Helper functions for authentication operations including token extraction,
 * password validation, email validation, and other common auth utilities.
 */

import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { authConfig } from '../config/auth.config';
import { AuthError, AuthErrorType } from '../types';

/**
 * Extract JWT token from request
 * Checks Authorization header (Bearer token) and cookies
 */
export const extractToken = (req: Request): string | null => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies
  const cookieToken = req.cookies?.[authConfig.session.cookieName];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
};

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    const salt = await bcrypt.genSalt(authConfig.password.saltRounds);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify password against hash
 */
export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    return false;
  }
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = authConfig.password;

  if (password.length < config.minLength) {
    errors.push(`Password must be at least ${config.minLength} characters long`);
  }

  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (config.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Generate random token
 */
export const generateRandomToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate verification token
 */
export const generateVerificationToken = (): string => {
  return generateRandomToken(32);
};

/**
 * Generate password reset token
 */
export const generatePasswordResetToken = (): string => {
  return generateRandomToken(32);
};

/**
 * Sanitize user object (remove sensitive fields)
 */
export const sanitizeUser = (user: any): any => {
  const { passwordHash, twoFactorSecret, ...sanitized } = user;
  return sanitized;
};

/**
 * Get client IP address from request
 */
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || 'unknown';
};

/**
 * Get user agent from request
 */
export const getUserAgent = (req: Request): string => {
  return req.headers['user-agent'] || 'unknown';
};

/**
 * Parse JWT expiry string to milliseconds
 * Examples: '15m' -> 900000, '7d' -> 604800000, '1h' -> 3600000
 */
export const parseExpiry = (expiry: string): number => {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 0);
};

/**
 * Calculate token expiry date
 */
export const calculateExpiryDate = (expiryString: string): Date => {
  const ms = parseExpiry(expiryString);
  return new Date(Date.now() + ms);
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (expiryDate: Date): boolean => {
  return new Date() > expiryDate;
};

/**
 * Check if token should be refreshed
 * Returns true if token will expire within the refresh threshold
 */
export const shouldRefreshToken = (expiryDate: Date): boolean => {
  const now = Date.now();
  const expiry = expiryDate.getTime();
  const threshold = authConfig.tokenRefreshThreshold * 1000; // convert to ms
  
  return expiry - now <= threshold;
};

/**
 * Generate session ID
 */
export const generateSessionId = (): string => {
  return `sess_${generateRandomToken(24)}`;
};

/**
 * Normalize email (lowercase and trim)
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

/**
 * Create auth error response
 */
export const createAuthError = (
  type: AuthErrorType,
  message?: string,
  statusCode?: number
): AuthError => {
  const defaultMessages: Record<AuthErrorType, string> = {
    [AuthErrorType.INVALID_CREDENTIALS]: 'Invalid email or password',
    [AuthErrorType.USER_NOT_FOUND]: 'User not found',
    [AuthErrorType.EMAIL_NOT_VERIFIED]: 'Email not verified',
    [AuthErrorType.ACCOUNT_DISABLED]: 'Account is disabled',
    [AuthErrorType.TOKEN_EXPIRED]: 'Token has expired',
    [AuthErrorType.TOKEN_INVALID]: 'Invalid token',
    [AuthErrorType.UNAUTHORIZED]: 'Unauthorized access',
    [AuthErrorType.FORBIDDEN]: 'Access forbidden',
    [AuthErrorType.RATE_LIMIT_EXCEEDED]: 'Too many requests, please try again later',
    [AuthErrorType.OAUTH_ERROR]: 'OAuth authentication failed',
    [AuthErrorType.TWO_FACTOR_REQUIRED]: 'Two-factor authentication required',
    [AuthErrorType.TWO_FACTOR_INVALID]: 'Invalid two-factor code',
  };

  const defaultStatusCodes: Record<AuthErrorType, number> = {
    [AuthErrorType.INVALID_CREDENTIALS]: 401,
    [AuthErrorType.USER_NOT_FOUND]: 404,
    [AuthErrorType.EMAIL_NOT_VERIFIED]: 403,
    [AuthErrorType.ACCOUNT_DISABLED]: 403,
    [AuthErrorType.TOKEN_EXPIRED]: 401,
    [AuthErrorType.TOKEN_INVALID]: 401,
    [AuthErrorType.UNAUTHORIZED]: 401,
    [AuthErrorType.FORBIDDEN]: 403,
    [AuthErrorType.RATE_LIMIT_EXCEEDED]: 429,
    [AuthErrorType.OAUTH_ERROR]: 500,
    [AuthErrorType.TWO_FACTOR_REQUIRED]: 403,
    [AuthErrorType.TWO_FACTOR_INVALID]: 401,
  };

  return new AuthError(
    type,
    message || defaultMessages[type],
    statusCode || defaultStatusCodes[type]
  );
};

/**
 * Mask email for display (e.g., "u***@example.com")
 */
export const maskEmail = (email: string): string => {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
};

/**
 * Generate backup codes for two-factor authentication
 */
export const generateBackupCodes = (count: number = 8): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code.match(/.{1,4}/g)?.join('-') || code);
  }
  return codes;
};
