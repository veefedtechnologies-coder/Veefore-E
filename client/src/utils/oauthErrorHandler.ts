/**
 * OAuth Error Handler Utility
 * 
 * Provides comprehensive error handling for OAuth callback errors
 * Maps OAuth error codes to user-friendly messages with retry options
 * 
 * @requirement 19.2 - Store intended destination URL in session
 * @requirement 19.3 - Display user-friendly error messages for OAuth failures
 * @requirement 19.5 - Provide retry option for failed OAuth attempts
 * @requirement 19.6 - Preserve form data before OAuth initiation
 */

export interface OAuthError {
  code: string;
  message: string;
  userMessage: string;
  canRetry: boolean;
  severity: 'error' | 'warning' | 'info';
}

/**
 * OAuth error code mappings with user-friendly messages
 * Based on design document ErrorCodes and server implementation
 */
const ERROR_MAPPINGS: Record<string, Omit<OAuthError, 'code'>> = {
  // State validation errors (CSRF protection)
  invalid_state: {
    message: 'Authentication failed - invalid state parameter',
    userMessage: 'Authentication verification failed. This could be due to a security check. Please try signing in again.',
    canRetry: true,
    severity: 'error',
  },
  state_expired: {
    message: 'Authentication failed - state expired',
    userMessage: 'Your authentication session expired. Please try signing in again.',
    canRetry: true,
    severity: 'warning',
  },
  
  // Token exchange errors
  token_exchange_failed: {
    message: 'Failed to exchange authorization code for tokens',
    userMessage: 'We couldn\'t complete the sign-in process. Please try again.',
    canRetry: true,
    severity: 'error',
  },
  invalid_grant: {
    message: 'Authorization code invalid or expired',
    userMessage: 'The authorization code is no longer valid. Please try signing in again.',
    canRetry: true,
    severity: 'error',
  },
  code_already_used: {
    message: 'Authorization code already used',
    userMessage: 'This authorization code has already been used. Please start a new sign-in.',
    canRetry: true,
    severity: 'error',
  },
  
  // Configuration errors
  redirect_uri_mismatch: {
    message: 'OAuth configuration error - redirect URI not authorized',
    userMessage: 'There\'s a configuration issue with Google authentication. Please contact support.',
    canRetry: false,
    severity: 'error',
  },
  invalid_client: {
    message: 'OAuth client configuration error',
    userMessage: 'There\'s a configuration issue with authentication. Please contact support.',
    canRetry: false,
    severity: 'error',
  },
  
  // Firebase token errors
  firebase_token_failed: {
    message: 'Failed to create authentication token',
    userMessage: 'We couldn\'t complete your authentication. Please try again.',
    canRetry: true,
    severity: 'error',
  },
  
  // Refresh token errors
  refresh_token_not_found: {
    message: 'Refresh token not found',
    userMessage: 'Your session could not be restored. Please sign in again.',
    canRetry: true,
    severity: 'warning',
  },
  refresh_token_expired: {
    message: 'Refresh token expired',
    userMessage: 'Your session has expired. Please sign in again.',
    canRetry: true,
    severity: 'warning',
  },
  
  // Session errors
  no_valid_session: {
    message: 'No valid session found',
    userMessage: 'Your session is invalid. Please sign in again.',
    canRetry: true,
    severity: 'warning',
  },
  
  // Network/service errors
  service_unavailable: {
    message: 'Authentication service temporarily unavailable',
    userMessage: 'The authentication service is temporarily unavailable. Please try again in a few moments.',
    canRetry: true,
    severity: 'warning',
  },
  network_error: {
    message: 'Network error during authentication',
    userMessage: 'A network error occurred. Please check your connection and try again.',
    canRetry: true,
    severity: 'error',
  },
  
  // Google OAuth errors
  access_denied: {
    message: 'User denied access',
    userMessage: 'You cancelled the Google sign-in. Click "Continue with Google" to try again.',
    canRetry: true,
    severity: 'info',
  },
  oauth_failed: {
    message: 'Google authentication failed',
    userMessage: 'Google authentication failed. Please try again.',
    canRetry: true,
    severity: 'error',
  },
  
  // Rate limiting
  too_many_requests: {
    message: 'Too many authentication attempts',
    userMessage: 'Too many sign-in attempts in a short time. Please wait a minute, then try again.',
    canRetry: true,
    severity: 'warning',
  },
  
  // Generic fallback
  unknown_error: {
    message: 'Unknown authentication error',
    userMessage: 'An unexpected error occurred during sign-in. Please try again.',
    canRetry: true,
    severity: 'error',
  },

  // Sign-in attempted with a Google account that has no VeeFore account yet.
  // Account creation requires early access, so we point them to the waitlist
  // rather than silently creating an account.
  account_not_found: {
    message: 'No account found for this Google account',
    userMessage: "We couldn't find a VeeFore account for that Google account. Join the waitlist to request early access.",
    canRetry: false,
    severity: 'warning',
  },
};

/**
 * Parse OAuth error from URL query parameters
 * @param searchParams - URLSearchParams from window.location.search
 * @returns OAuthError object or null if no error
 */
export function parseOAuthError(searchParams: URLSearchParams): OAuthError | null {
  const errorCode = searchParams.get('error');
  const errorMessage = searchParams.get('message');
  
  if (!errorCode) {
    return null;
  }
  
  const errorMapping = ERROR_MAPPINGS[errorCode] || ERROR_MAPPINGS.unknown_error;
  
  return {
    code: errorCode,
    message: errorMessage || errorMapping.message,
    userMessage: errorMapping.userMessage,
    canRetry: errorMapping.canRetry,
    severity: errorMapping.severity,
  };
}

/**
 * Get error severity icon for display
 */
export function getErrorIcon(severity: OAuthError['severity']): string {
  switch (severity) {
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    default:
      return '❌';
  }
}

/**
 * Get error color classes for display
 */
export function getErrorColorClasses(severity: OAuthError['severity']): {
  bg: string;
  border: string;
  text: string;
  icon: string;
} {
  switch (severity) {
    case 'error':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-200',
        icon: 'text-red-500',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        text: 'text-yellow-200',
        icon: 'text-yellow-500',
      };
    case 'info':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-200',
        icon: 'text-blue-500',
      };
    default:
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-200',
        icon: 'text-red-500',
      };
  }
}

/**
 * Clear OAuth error from URL without page reload
 */
export function clearOAuthError(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('error');
  url.searchParams.delete('message');
  window.history.replaceState({}, '', url.toString());
}

/**
 * Store form data before OAuth initiation
 * @requirement 19.6 - Preserve form data before OAuth initiation
 */
export function preserveFormData(formData: Record<string, any>): void {
  try {
    // Store non-sensitive form data in sessionStorage (cleared on tab close)
    const dataToStore = { ...formData };
    delete dataToStore.password; // Never store passwords
    
    sessionStorage.setItem('oauth_form_backup', JSON.stringify(dataToStore));
    sessionStorage.setItem('oauth_form_timestamp', Date.now().toString());
  } catch (error) {
    console.warn('Failed to preserve form data:', error);
  }
}

/**
 * Restore form data after OAuth redirect
 * @requirement 19.6 - Preserve form data before OAuth initiation
 */
export function restoreFormData(): Record<string, any> | null {
  try {
    const storedData = sessionStorage.getItem('oauth_form_backup');
    const timestamp = sessionStorage.getItem('oauth_form_timestamp');
    
    if (!storedData || !timestamp) {
      return null;
    }
    
    // Check if data is less than 10 minutes old
    const age = Date.now() - parseInt(timestamp, 10);
    const TEN_MINUTES = 10 * 60 * 1000;
    
    if (age > TEN_MINUTES) {
      // Data too old, clear it
      sessionStorage.removeItem('oauth_form_backup');
      sessionStorage.removeItem('oauth_form_timestamp');
      return null;
    }
    
    // Clear stored data after restoration
    sessionStorage.removeItem('oauth_form_backup');
    sessionStorage.removeItem('oauth_form_timestamp');
    
    return JSON.parse(storedData);
  } catch (error) {
    console.warn('Failed to restore form data:', error);
    return null;
  }
}

/**
 * Store intended destination URL before OAuth redirect
 * @requirement 19.2 - Store intended destination URL in session
 */
export function storeIntendedDestination(url?: string): void {
  try {
    const destination = url || window.location.pathname + window.location.search;
    sessionStorage.setItem('oauth_intended_destination', destination);
  } catch (error) {
    console.warn('Failed to store intended destination:', error);
  }
}

/**
 * Get stored intended destination URL
 * @requirement 19.2 - Redirect to intended destination after OAuth
 */
export function getIntendedDestination(): string | null {
  try {
    const destination = sessionStorage.getItem('oauth_intended_destination');
    if (destination) {
      sessionStorage.removeItem('oauth_intended_destination');
    }
    return destination;
  } catch (error) {
    console.warn('Failed to get intended destination:', error);
    return null;
  }
}

/**
 * Check if OAuth was successful (for showing success message)
 */
export function checkOAuthSuccess(searchParams: URLSearchParams): boolean {
  return searchParams.get('oauth_success') === 'true';
}

/**
 * Clear OAuth success flag from URL
 */
export function clearOAuthSuccess(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('oauth_success');
  window.history.replaceState({}, '', url.toString());
}
