/**
 * P1 SECURITY: Cookie-based authentication utilities
 * Migration from localStorage to HTTP-only cookies for enhanced security
 */

/**
 * Check if the browser supports secure cookie authentication
 */
export const supportsCookieAuth = (): boolean => {
  return typeof document !== 'undefined' && 'cookie' in document;
};

/**
 * Get CSRF token from cookie with proper parsing
 */
export const getCSRFToken = (): string | null => {
  if (!supportsCookieAuth()) return null;
  
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const trimmed = cookie.trim();
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      // SECURITY FIX: Handle values containing '=' correctly  
      const name = trimmed.substring(0, equalIndex);
      const value = trimmed.substring(equalIndex + 1);
      if (name === 'csrf_token') {
        return decodeURIComponent(value);
      }
    }
  }
  return null;
};

/**
 * Exchange current Firebase token for secure HTTP-only cookies
 */
export const exchangeTokenForCookies = async (): Promise<{ success: boolean; csrfToken?: string; error?: string }> => {
  try {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      throw new Error('No authenticated user found');
    }

    const token = await user.getIdToken();
    
    const response = await fetch('/api/auth-cookies/exchange-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include' // Include cookies in request
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to exchange token');
    }

    const data = await response.json();
    console.log('🔒 SECURITY: Successfully exchanged token for HTTP-only cookies');
    
    return { success: true, csrfToken: data.csrfToken };
  } catch (error: any) {
    console.error('🚨 Cookie exchange failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Enhanced API request function that supports both Bearer tokens and cookies
 * with automatic CSRF protection
 */
export async function cookieApiRequest(url: string, options: RequestInit = {}) {
  let headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // For state-changing operations, include CSRF token
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase() || 'GET')) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      headers = {
        ...headers,
        'X-CSRF-Token': csrfToken,
      };
      console.log('🔒 SECURITY: Added CSRF token to request');
    }
  }

  // Include credentials to send cookies
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // This ensures cookies are sent
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('🚨 Cookie API Error:', response.status, response.statusText, errorData);
    
    // If authentication failed, we might need to refresh tokens
    if (response.status === 401) {
      console.log('🔄 Authentication failed - may need to refresh cookies');
    }
    
    throw new Error(`${response.status}: ${response.statusText} - ${errorData}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  return response.text();
}

/**
 * Logout and clear all authentication cookies
 */
export const logoutWithCookies = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth-cookies/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken() || ''
      }
    });

    const data = await response.json();
    console.log('🔒 SECURITY: Logout successful, cookies cleared');
    return data.success;
  } catch (error) {
    console.error('🚨 Cookie logout failed:', error);
    return false;
  }
};

/**
 * Check if user is authenticated via cookies
 */
export const isAuthenticatedViaCookies = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth-cookies/csrf-token', {
      method: 'GET',
      credentials: 'include'
    });

    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Migrate from localStorage authentication to cookie authentication
 * This should be called after successful Firebase authentication
 */
export const migrateToSecureCookies = async (): Promise<boolean> => {
  try {
    console.log('🔄 SECURITY: Starting migration to HTTP-only cookies...');
    
    const result = await exchangeTokenForCookies();
    if (result.success) {
      console.log('✅ SECURITY: Migration to secure cookies completed');
      
      // Optionally clear localStorage debug data (keep Firebase auth intact)
      // localStorage.removeItem('debug_user_auth');
      
      return true;
    } else {
      console.error('❌ SECURITY: Migration to secure cookies failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('🚨 SECURITY: Migration error:', error);
    return false;
  }
};