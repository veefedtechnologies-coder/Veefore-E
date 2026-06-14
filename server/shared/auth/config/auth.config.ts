/**
 * Authentication Configuration
 * 
 * Centralized configuration for authentication across the application.
 * Includes JWT settings, OAuth provider configurations, session management,
 * and security parameters.
 */

export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

export interface SessionConfig {
  maxAge: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  cookieName: string;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope: string[];
}

export interface OAuthConfig {
  google: OAuthProviderConfig;
  facebook: OAuthProviderConfig;
  instagram: OAuthProviderConfig;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface PasswordConfig {
  saltRounds: number;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export interface AuthConfig {
  jwt: JWTConfig;
  session: SessionConfig;
  oauth: OAuthConfig;
  rateLimit: RateLimitConfig;
  password: PasswordConfig;
  enableEmailVerification: boolean;
  enableTwoFactor: boolean;
  tokenRefreshThreshold: number; // seconds before expiry to allow refresh
}

/**
 * Default authentication configuration
 * Override values using environment variables
 */
export const authConfig: AuthConfig = {
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || '',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'veefore-auth',
    audience: process.env.JWT_AUDIENCE || 'veefore-api',
  },

  session: {
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '604800000', 10), // 7 days in ms
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    cookieName: 'veefore_session',
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback',
      scope: ['profile', 'email'],
    },
    facebook: {
      clientId: process.env.FACEBOOK_APP_ID || '',
      clientSecret: process.env.FACEBOOK_APP_SECRET || '',
      callbackUrl: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:5001/api/auth/facebook/callback',
      scope: ['email', 'public_profile'],
    },
    instagram: {
      clientId: process.env.INSTAGRAM_CLIENT_ID || '',
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
      callbackUrl: process.env.INSTAGRAM_CALLBACK_URL || 'http://localhost:5001/api/auth/instagram/callback',
      scope: ['user_profile', 'user_media'],
    },
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },

  password: {
    saltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS || '12', 10),
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
    requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
  },

  enableEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION !== 'false',
  enableTwoFactor: process.env.ENABLE_TWO_FACTOR === 'true',
  tokenRefreshThreshold: parseInt(process.env.TOKEN_REFRESH_THRESHOLD || '300', 10), // 5 minutes
};

/**
 * Validate authentication configuration
 * Throws error if required configuration is missing
 */
export const validateAuthConfig = (): void => {
  const errors: string[] = [];

  // Validate JWT secrets
  if (!authConfig.jwt.accessTokenSecret) {
    errors.push('JWT_ACCESS_SECRET is required');
  }
  if (!authConfig.jwt.refreshTokenSecret) {
    errors.push('JWT_REFRESH_SECRET is required');
  }

  // Validate OAuth configurations (only if enabled)
  if (process.env.ENABLE_GOOGLE_AUTH === 'true') {
    if (!authConfig.oauth.google.clientId) {
      errors.push('GOOGLE_CLIENT_ID is required when Google auth is enabled');
    }
    if (!authConfig.oauth.google.clientSecret) {
      errors.push('GOOGLE_CLIENT_SECRET is required when Google auth is enabled');
    }
  }

  if (process.env.ENABLE_FACEBOOK_AUTH === 'true') {
    if (!authConfig.oauth.facebook.clientId) {
      errors.push('FACEBOOK_APP_ID is required when Facebook auth is enabled');
    }
    if (!authConfig.oauth.facebook.clientSecret) {
      errors.push('FACEBOOK_APP_SECRET is required when Facebook auth is enabled');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Auth configuration errors:\n${errors.join('\n')}`);
  }
};

/**
 * Get OAuth provider configuration by name
 */
export const getOAuthConfig = (provider: 'google' | 'facebook' | 'instagram'): OAuthProviderConfig => {
  return authConfig.oauth[provider];
};

/**
 * Check if a specific OAuth provider is enabled
 */
export const isOAuthProviderEnabled = (provider: 'google' | 'facebook' | 'instagram'): boolean => {
  const config = authConfig.oauth[provider];
  return !!(config.clientId && config.clientSecret);
};
