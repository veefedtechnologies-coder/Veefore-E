/**
 * OAuth Environment Variable Validation
 * 
 * This module provides startup validation for OAuth-specific environment variables.
 * Implements requirements 8.1-8.9 from the server-side OAuth implementation spec.
 */

export interface OAuthEnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Helper function to determine if running in production
 */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validates OAuth-specific environment variables at startup
 * 
 * Requirements:
 * - 8.1: GOOGLE_CLIENT_ID must be set
 * - 8.2: GOOGLE_CLIENT_SECRET must be set
 * - 8.3: FIREBASE_SERVICE_ACCOUNT_KEY must be set and valid JSON
 * - 8.4: SESSION_SECRET must be at least 32 characters
 * - 8.5: OAUTH_CALLBACK_URL must be set
 * - 8.6: Fail to start if any required variable is missing (production only)
 * - 8.8: Validate FIREBASE_SERVICE_ACCOUNT_KEY JSON format
 * - 8.9: Validate SESSION_SECRET length
 */
export function validateOAuthEnvironment(): OAuthEnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('[OAuth ENV] Validating OAuth environment variables...');

  // 8.1: Validate GOOGLE_CLIENT_ID
  if (!process.env.GOOGLE_CLIENT_ID) {
    errors.push('GOOGLE_CLIENT_ID is required for OAuth authentication');
  }

  // 8.2: Validate GOOGLE_CLIENT_SECRET
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    errors.push('GOOGLE_CLIENT_SECRET is required for OAuth authentication');
  }

  // 8.3 & 8.8: Validate FIREBASE_SERVICE_ACCOUNT_KEY exists and is valid JSON
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    errors.push('FIREBASE_SERVICE_ACCOUNT_KEY is required for creating Firebase custom tokens');
  } else {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      
      // Validate required fields in service account JSON
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter(field => !serviceAccount[field]);
      
      if (missingFields.length > 0) {
        errors.push(`FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Validate it's a service account
      if (serviceAccount.type !== 'service_account') {
        errors.push('FIREBASE_SERVICE_ACCOUNT_KEY must be a service_account type');
      }
    } catch (error) {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON format');
    }
  }

  // 8.4 & 8.9: Validate SESSION_SECRET length (minimum 32 characters)
  if (!process.env.SESSION_SECRET) {
    errors.push('SESSION_SECRET is required for session management');
  } else if (process.env.SESSION_SECRET.length < 32) {
    errors.push(`SESSION_SECRET must be at least 32 characters (current: ${process.env.SESSION_SECRET.length} characters)`);
  }

  // 8.5: Validate OAUTH_CALLBACK_URL
  if (!process.env.OAUTH_CALLBACK_URL) {
    errors.push('OAUTH_CALLBACK_URL is required for OAuth callback redirect');
  } else {
    // Validate URL format
    try {
      const url = new URL(process.env.OAUTH_CALLBACK_URL);
      if (!url.protocol.startsWith('http')) {
        errors.push('OAUTH_CALLBACK_URL must use http or https protocol');
      }
      // Production should use HTTPS
      if (isProductionEnv() && url.protocol !== 'https:') {
        warnings.push('OAUTH_CALLBACK_URL should use HTTPS in production');
      }
    } catch {
      errors.push('OAUTH_CALLBACK_URL is not a valid URL');
    }
  }

  const valid = errors.length === 0;

  // Log results
  if (!valid) {
    console.error('[OAuth ENV] ❌ OAuth environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
  }

  if (warnings.length > 0) {
    console.warn('[OAuth ENV] ⚠️  OAuth environment warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  if (valid && warnings.length === 0) {
    console.log('[OAuth ENV] ✅ OAuth environment validation passed');
  }

  return { valid, errors, warnings };
}

/**
 * Enforces OAuth environment validation at startup
 * 
 * Requirement 8.6: Fails to start if any required variable is missing
 * 
 * @param strict - If true, throws error on validation failure (default: true in production)
 * @throws Error if validation fails and strict mode is enabled
 */
export function enforceOAuthEnvironment(strict: boolean = isProductionEnv()): void {
  const result = validateOAuthEnvironment();

  if (!result.valid && strict) {
    const errorMessage = [
      '\n❌ CRITICAL: OAuth environment validation failed!',
      '\nMissing or invalid environment variables:',
      ...result.errors.map(e => `  - ${e}`),
      '\nPlease configure the required OAuth environment variables.',
      '\nSee deployment guide for instructions on obtaining these credentials.\n'
    ].join('\n');

    throw new Error(errorMessage);
  }

  if (!result.valid && !strict) {
    console.warn('[OAuth ENV] ⚠️  Continuing in development mode with incomplete OAuth configuration');
    console.warn('[OAuth ENV] ⚠️  OAuth features will not work until variables are configured');
  }
}

/**
 * Gets a summary of OAuth configuration status
 */
export function getOAuthConfigStatus(): {
  configured: boolean;
  missingVariables: string[];
} {
  const result = validateOAuthEnvironment();
  
  return {
    configured: result.valid,
    missingVariables: result.errors
  };
}

/**
 * Validates that COOKIE_DOMAIN is compatible with FRONTEND_URL and OAUTH_CALLBACK_URL
 * 
 * This function addresses Bug Condition 6: Cookie Domain Configuration Issue
 * 
 * Requirements:
 * - 2.12: Validate COOKIE_DOMAIN compatibility with FRONTEND_URL and OAUTH_CALLBACK_URL
 * - 2.13: Fail startup with clear error if misconfigured
 * 
 * @returns {OAuthEnvValidationResult} Validation result with errors if domain is incompatible
 */
export function validateCookieDomain(): OAuthEnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cookieDomain = process.env.COOKIE_DOMAIN;
  const frontendUrl = process.env.FRONTEND_URL;
  const callbackUrl = process.env.OAUTH_CALLBACK_URL;

  console.log('[Cookie Domain] Validating cookie domain configuration...');

  // If COOKIE_DOMAIN is not set, validation passes (cookies use current domain)
  if (!cookieDomain) {
    console.log('[Cookie Domain] ✅ COOKIE_DOMAIN not set - cookies will use current domain');
    return { valid: true, errors: [], warnings: [] };
  }

  console.log(`[Cookie Domain] COOKIE_DOMAIN is set to: ${cookieDomain}`);

  // Validate against FRONTEND_URL if set
  if (frontendUrl) {
    const result = validateCookieDomainCompatibility(cookieDomain, frontendUrl, 'FRONTEND_URL');
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  // Validate against OAUTH_CALLBACK_URL if set
  if (callbackUrl) {
    const result = validateCookieDomainCompatibility(cookieDomain, callbackUrl, 'OAUTH_CALLBACK_URL');
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  const valid = errors.length === 0;

  // Log results
  if (!valid) {
    console.error('[Cookie Domain] ❌ Cookie domain validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
  }

  if (warnings.length > 0) {
    console.warn('[Cookie Domain] ⚠️  Cookie domain warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  if (valid && warnings.length === 0) {
    console.log('[Cookie Domain] ✅ Cookie domain validation passed');
  }

  return { valid, errors, warnings };
}

/**
 * Helper function to validate if cookie domain is compatible with a URL
 * 
 * @param cookieDomain - The COOKIE_DOMAIN value to validate
 * @param url - The URL to validate against (FRONTEND_URL or OAUTH_CALLBACK_URL)
 * @param urlName - The name of the URL parameter for error messages
 * @returns {object} Validation result with valid flag and optional error message
 */
function validateCookieDomainCompatibility(
  cookieDomain: string,
  url: string,
  urlName: string
): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);
    const urlHostname = parsedUrl.hostname.toLowerCase();

    // Remove leading dot from cookie domain for comparison
    const normalizedCookieDomain = cookieDomain.startsWith('.')
      ? cookieDomain.substring(1).toLowerCase()
      : cookieDomain.toLowerCase();

    // Check if URL hostname matches or is a subdomain of cookie domain
    const isExactMatch = urlHostname === normalizedCookieDomain;
    const isSubdomain = urlHostname.endsWith('.' + normalizedCookieDomain);

    if (!isExactMatch && !isSubdomain) {
      return {
        valid: false,
        error: `COOKIE_DOMAIN "${cookieDomain}" is incompatible with ${urlName} "${url}" (hostname: ${parsedUrl.hostname})`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format for ${urlName}: ${url}`,
    };
  }
}

/**
 * Validates that FRONTEND_URL and OAUTH_CALLBACK_URL are included in the CORS allowlist
 * 
 * This function addresses Bug Condition 8: Missing CORS Configuration Validation
 * 
 * Requirements:
 * - 2.16: Validate FRONTEND_URL and OAUTH_CALLBACK_URL are in CORS_ORIGINS allowlist
 * - 2.17: Fail startup with descriptive error if misconfigured
 * 
 * @returns {OAuthEnvValidationResult} Validation result with errors if CORS is misconfigured
 */
export function validateCORSConfiguration(): OAuthEnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const frontendUrl = process.env.FRONTEND_URL;
  const callbackUrl = process.env.OAUTH_CALLBACK_URL;
  const corsOrigins = process.env.CORS_ORIGINS;

  console.log('[CORS Config] Validating CORS configuration...');

  // Parse CORS_ORIGINS (comma-separated or single value)
  const corsOriginsList = parseCorsOrigins(corsOrigins);

  // CORS validation is optional if no CORS_ORIGINS configured
  // But if OAuth URLs are configured, they should be in CORS allowlist
  if (corsOriginsList.length === 0) {
    // If CORS_ORIGINS is not configured, skip validation
    // (system will use default origins from middleware)
    console.log('[CORS Config] ✅ CORS_ORIGINS not set - using middleware defaults');
    return { valid: true, errors: [], warnings: [] };
  }

  console.log(`[CORS Config] CORS_ORIGINS configured with ${corsOriginsList.length} origin(s)`);

  // Validate FRONTEND_URL is in CORS allowlist if set
  if (frontendUrl) {
    if (!isUrlInCorsAllowlist(frontendUrl, corsOriginsList)) {
      errors.push(
        `FRONTEND_URL "${frontendUrl}" is not included in CORS_ORIGINS allowlist. ` +
        `OAuth redirects from frontend will fail with CORS errors.`
      );
    } else {
      console.log(`[CORS Config] ✅ FRONTEND_URL is in CORS allowlist`);
    }
  }

  // Validate OAUTH_CALLBACK_URL is in CORS allowlist if set
  if (callbackUrl) {
    if (!isUrlInCorsAllowlist(callbackUrl, corsOriginsList)) {
      errors.push(
        `OAUTH_CALLBACK_URL "${callbackUrl}" is not included in CORS_ORIGINS allowlist. ` +
        `OAuth callback requests will fail with CORS errors.`
      );
    } else {
      console.log(`[CORS Config] ✅ OAUTH_CALLBACK_URL is in CORS allowlist`);
    }
  }

  const valid = errors.length === 0;

  // Log results
  if (!valid) {
    console.error('[CORS Config] ❌ CORS configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
  }

  if (warnings.length > 0) {
    console.warn('[CORS Config] ⚠️  CORS configuration warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  if (valid && warnings.length === 0) {
    console.log('[CORS Config] ✅ CORS configuration validation passed');
  }

  return { valid, errors, warnings };
}

/**
 * Helper function to parse CORS_ORIGINS (comma-separated or single value)
 * 
 * @param corsOrigins - The CORS_ORIGINS environment variable value
 * @returns {string[]} Array of origin URLs
 */
function parseCorsOrigins(corsOrigins: string | undefined): string[] {
  if (!corsOrigins) {
    return [];
  }
  return corsOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Helper function to check if URL is in CORS allowlist
 * Handles exact matches and origin extraction from full URLs
 * 
 * @param url - The URL to check (FRONTEND_URL or OAUTH_CALLBACK_URL)
 * @param corsOrigins - Array of allowed CORS origins
 * @returns {boolean} True if URL is in the allowlist, false otherwise
 */
function isUrlInCorsAllowlist(url: string, corsOrigins: string[]): boolean {
  try {
    const parsedUrl = new URL(url);
    // Normalize the URL to extract origin (protocol + hostname + port)
    const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? ':' + parsedUrl.port : ''}`;
    
    // Normalize CORS origins for case-insensitive comparison
    const normalizedCorsOrigins = corsOrigins.map(o => {
      try {
        const parsed = new URL(o);
        return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? ':' + parsed.port : ''}`;
      } catch {
        // If not a full URL, treat as is but lowercase
        return o.toLowerCase();
      }
    });
    
    // Normalize the origin for comparison
    const normalizedOrigin = `${parsedUrl.protocol}//${parsedUrl.hostname.toLowerCase()}${parsedUrl.port ? ':' + parsedUrl.port : ''}`;
    
    // Check exact match with origin
    if (normalizedCorsOrigins.includes(normalizedOrigin)) {
      return true;
    }
    
    // Check if the full URL is in the allowlist (less common but possible)
    if (normalizedCorsOrigins.includes(url.toLowerCase())) {
      return true;
    }
    
    return false;
  } catch (error) {
    // Invalid URL format
    return false;
  }
}
