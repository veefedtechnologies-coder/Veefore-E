/**
 * Shared Authentication Types
 * 
 * TypeScript interfaces and types used across the authentication system.
 */

import { Request } from 'express';

/**
 * User Roles
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  MODERATOR = 'moderator',
}

/**
 * OAuth Providers
 */
export enum OAuthProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
}

/**
 * Authentication Method
 */
export enum AuthMethod {
  EMAIL = 'email',
  OAUTH = 'oauth',
  MAGIC_LINK = 'magic_link',
}

/**
 * User Interface
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatar?: string;
  role: UserRole;
  authMethod: AuthMethod;
  oauthProvider?: OAuthProvider;
  oauthId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  twoFactorEnabled: boolean;
  isActive: boolean;
}

/**
 * Auth Token Payload
 */
export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/**
 * Access Token
 */
export interface AccessToken {
  token: string;
  expiresAt: Date;
  type: 'Bearer';
}

/**
 * Refresh Token
 */
export interface RefreshToken {
  token: string;
  expiresAt: Date;
  userId: string;
  sessionId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  isRevoked: boolean;
}

/**
 * Auth Tokens (Access + Refresh)
 */
export interface AuthTokens {
  accessToken: AccessToken;
  refreshToken: RefreshToken;
}

/**
 * Session Data
 */
export interface SessionData {
  id: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

/**
 * Login Credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Registration Data
 */
export interface RegistrationData {
  email: string;
  password: string;
  name?: string;
  acceptedTerms: boolean;
}

/**
 * OAuth Profile
 */
export interface OAuthProfile {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  name?: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Password Reset Request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password Reset Confirmation
 */
export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
}

/**
 * Email Verification
 */
export interface EmailVerification {
  userId: string;
  token: string;
  expiresAt: Date;
  verifiedAt?: Date;
}

/**
 * Two-Factor Authentication
 */
export interface TwoFactorAuth {
  userId: string;
  secret: string;
  backupCodes: string[];
  enabled: boolean;
  verifiedAt?: Date;
}

/**
 * Auth Request (Express Request with User)
 */
export interface AuthRequest extends Request {
  user?: User;
  session?: SessionData;
  token?: string;
}

/**
 * Auth Response Data
 */
export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  tokens: AuthTokens;
  session: SessionData;
}

/**
 * Login Response
 */
export interface LoginResponse extends AuthResponse {
  requiresTwoFactor?: boolean;
}

/**
 * Token Validation Result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: AuthTokenPayload;
  error?: string;
  expired?: boolean;
}

/**
 * Permission
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'execute';
}

/**
 * Role Permissions
 */
export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

/**
 * Auth Error Types
 */
export enum AuthErrorType {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  OAUTH_ERROR = 'OAUTH_ERROR',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  TWO_FACTOR_INVALID = 'TWO_FACTOR_INVALID',
}

/**
 * Auth Error
 */
export class AuthError extends Error {
  constructor(
    public type: AuthErrorType,
    public message: string,
    public statusCode: number = 401,
    public details?: any
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
