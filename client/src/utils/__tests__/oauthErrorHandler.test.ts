/**
 * OAuth Error Handler Unit Tests
 * 
 * Tests comprehensive OAuth error handling utilities
 * Validates error parsing, form data preservation, and user-friendly messages
 * 
 * @requirement 19.2 - Store and restore intended destination
 * @requirement 19.3 - User-friendly error messages for all OAuth error codes
 * @requirement 19.5 - Provide retry option for failed OAuth attempts
 * @requirement 19.6 - Preserve and restore form data before/after OAuth
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseOAuthError,
  clearOAuthError,
  preserveFormData,
  restoreFormData,
  getErrorColorClasses,
  storeIntendedDestination,
  getIntendedDestination,
  checkOAuthSuccess,
  clearOAuthSuccess,
} from '../oauthErrorHandler';

describe('parseOAuthError', () => {
  it('should parse valid OAuth error from URL params', () => {
    const params = new URLSearchParams('?error=invalid_state&message=State+parameter+invalid');
    const error = parseOAuthError(params);
    
    expect(error).not.toBeNull();
    expect(error?.code).toBe('invalid_state');
    expect(error?.userMessage).toContain('authentication verification failed');
    expect(error?.canRetry).toBe(true);
    expect(error?.severity).toBe('error');
  });

  it('should return null when no error in URL params', () => {
    const params = new URLSearchParams('?success=true');
    const error = parseOAuthError(params);
    
    expect(error).toBeNull();
  });

  it('should map all error codes correctly', () => {
    const errorCodes = [
      'invalid_state',
      'state_expired',
      'token_exchange_failed',
      'invalid_grant',
      'code_already_used',
      'redirect_uri_mismatch',
      'invalid_client',
      'firebase_token_failed',
      'refresh_token_not_found',
      'refresh_token_expired',
      'no_valid_session',
      'service_unavailable',
      'network_error',
      'access_denied',
      'oauth_failed',
      'too_many_requests',
    ];

    errorCodes.forEach(code => {
      const params = new URLSearchParams(`?error=${code}`);
      const error = parseOAuthError(params);
      
      expect(error).not.toBeNull();
      expect(error?.code).toBe(code);
      expect(error?.userMessage).toBeTruthy();
    });
  });

  it('should handle unknown error codes with fallback', () => {
    const params = new URLSearchParams('?error=unknown_oauth_error');
    const error = parseOAuthError(params);
    
    expect(error).not.toBeNull();
    expect(error?.code).toBe('unknown_oauth_error');
    expect(error?.userMessage).toContain('unexpected error');
    expect(error?.canRetry).toBe(true);
  });

  it('should correctly identify non-retryable errors', () => {
    const nonRetryable = ['redirect_uri_mismatch', 'invalid_client', 'too_many_requests'];
    
    nonRetryable.forEach(code => {
      const params = new URLSearchParams(`?error=${code}`);
      const error = parseOAuthError(params);
      
      expect(error?.canRetry).toBe(false);
    });
  });

  it('should assign correct severity levels', () => {
    const errorSeverities = [
      { code: 'invalid_state', severity: 'error' },
      { code: 'state_expired', severity: 'warning' },
      { code: 'access_denied', severity: 'info' },
      { code: 'refresh_token_expired', severity: 'warning' },
    ];

    errorSeverities.forEach(({ code, severity }) => {
      const params = new URLSearchParams(`?error=${code}`);
      const error = parseOAuthError(params);
      
      expect(error?.severity).toBe(severity);
    });
  });
});

describe('clearOAuthError', () => {
  beforeEach(() => {
    // Set up initial URL with error params
    window.history.replaceState({}, '', '?error=invalid_state&message=Test+error');
  });

  it('should remove error params from URL', () => {
    clearOAuthError();
    
    const params = new URLSearchParams(window.location.search);
    expect(params.has('error')).toBe(false);
    expect(params.has('message')).toBe(false);
  });

  it('should preserve other query params', () => {
    window.history.replaceState({}, '', '?error=invalid_state&email=test@example.com');
    clearOAuthError();
    
    const params = new URLSearchParams(window.location.search);
    expect(params.has('error')).toBe(false);
    expect(params.get('email')).toBe('test@example.com');
  });
});

describe('getErrorColorClasses', () => {
  it('should return correct classes for error severity', () => {
    const classes = getErrorColorClasses('error');
    
    expect(classes.bg).toContain('red');
    expect(classes.border).toContain('red');
    expect(classes.text).toContain('red');
    expect(classes.icon).toContain('red');
  });

  it('should return correct classes for warning severity', () => {
    const classes = getErrorColorClasses('warning');
    
    expect(classes.bg).toContain('yellow');
    expect(classes.border).toContain('yellow');
  });

  it('should return correct classes for info severity', () => {
    const classes = getErrorColorClasses('info');
    
    expect(classes.bg).toContain('blue');
    expect(classes.border).toContain('blue');
  });
});

describe('Form Data Preservation - Requirement 19.6', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should preserve form data excluding password', () => {
    const formData = {
      email: 'test@example.com',
      fullName: 'Test User',
      password: 'secret123',
    };

    preserveFormData(formData);

    const stored = sessionStorage.getItem('oauth_form_backup');
    expect(stored).not.toBeNull();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.email).toBe('test@example.com');
    expect(parsed.fullName).toBe('Test User');
    expect(parsed.password).toBeUndefined();
  });

  it('should store timestamp with form data', () => {
    preserveFormData({ email: 'test@example.com' });
    
    const timestamp = sessionStorage.getItem('oauth_form_timestamp');
    expect(timestamp).not.toBeNull();
    expect(parseInt(timestamp!, 10)).toBeGreaterThan(0);
  });

  it('should restore form data within expiry window', () => {
    const formData = { email: 'test@example.com', fullName: 'Test User' };
    preserveFormData(formData);

    const restored = restoreFormData();
    
    expect(restored).not.toBeNull();
    expect(restored?.email).toBe('test@example.com');
    expect(restored?.fullName).toBe('Test User');
  });

  it('should return null for expired data (>10 minutes)', () => {
    const formData = { email: 'test@example.com' };
    sessionStorage.setItem('oauth_form_backup', JSON.stringify(formData));
    
    // Set timestamp to 11 minutes ago
    const elevenMinutesAgo = Date.now() - (11 * 60 * 1000);
    sessionStorage.setItem('oauth_form_timestamp', elevenMinutesAgo.toString());

    const restored = restoreFormData();
    
    expect(restored).toBeNull();
  });

  it('should clear data after restoration', () => {
    preserveFormData({ email: 'test@example.com' });
    restoreFormData();

    expect(sessionStorage.getItem('oauth_form_backup')).toBeNull();
    expect(sessionStorage.getItem('oauth_form_timestamp')).toBeNull();
  });

  it('should handle missing or corrupted data gracefully', () => {
    sessionStorage.setItem('oauth_form_backup', 'invalid json');
    
    const restored = restoreFormData();
    expect(restored).toBeNull();
  });
});

describe('Intended Destination - Requirement 19.2', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should store custom destination URL', () => {
    storeIntendedDestination('/dashboard/settings');
    
    const stored = sessionStorage.getItem('oauth_intended_destination');
    expect(stored).toBe('/dashboard/settings');
  });

  it('should store current URL if no destination provided', () => {
    window.history.replaceState({}, '', '/signup?email=test@example.com');
    storeIntendedDestination();
    
    const stored = sessionStorage.getItem('oauth_intended_destination');
    expect(stored).toContain('/signup');
  });

  it('should retrieve and clear stored destination', () => {
    storeIntendedDestination('/custom/path');
    
    const destination = getIntendedDestination();
    expect(destination).toBe('/custom/path');
    
    // Should be cleared after retrieval
    const secondRetrieval = getIntendedDestination();
    expect(secondRetrieval).toBeNull();
  });

  it('should return null when no destination stored', () => {
    const destination = getIntendedDestination();
    expect(destination).toBeNull();
  });
});

describe('OAuth Success Detection - Requirement 19.4', () => {
  it('should detect OAuth success from URL params', () => {
    const params = new URLSearchParams('?oauth_success=true');
    expect(checkOAuthSuccess(params)).toBe(true);
  });

  it('should return false when no success param', () => {
    const params = new URLSearchParams('?email=test@example.com');
    expect(checkOAuthSuccess(params)).toBe(false);
  });

  it('should clear OAuth success from URL', () => {
    window.history.replaceState({}, '', '?oauth_success=true&email=test@example.com');
    clearOAuthSuccess();
    
    const params = new URLSearchParams(window.location.search);
    expect(params.has('oauth_success')).toBe(false);
    expect(params.get('email')).toBe('test@example.com');
  });
});

describe('User-Friendly Error Messages - Requirement 19.3', () => {
  it('should provide user-friendly message for state validation errors', () => {
    const params = new URLSearchParams('?error=invalid_state');
    const error = parseOAuthError(params);
    
    expect(error?.userMessage).not.toContain('state parameter');
    expect(error?.userMessage.toLowerCase()).toContain('authentication');
  });

  it('should provide actionable message for access denied', () => {
    const params = new URLSearchParams('?error=access_denied');
    const error = parseOAuthError(params);
    
    expect(error?.userMessage).toContain('cancelled');
    expect(error?.userMessage).toContain('try again');
  });

  it('should provide clear message for expired sessions', () => {
    const params = new URLSearchParams('?error=refresh_token_expired');
    const error = parseOAuthError(params);
    
    expect(error?.userMessage).toContain('expired');
    expect(error?.userMessage).toContain('sign in again');
  });

  it('should provide technical contact info for config errors', () => {
    const params = new URLSearchParams('?error=redirect_uri_mismatch');
    const error = parseOAuthError(params);
    
    expect(error?.userMessage).toContain('configuration');
    expect(error?.userMessage).toContain('support');
    expect(error?.canRetry).toBe(false);
  });
});

describe('Retry Option - Requirement 19.5', () => {
  it('should allow retry for transient errors', () => {
    const retryableErrors = [
      'invalid_state',
      'token_exchange_failed',
      'network_error',
      'service_unavailable',
      'oauth_failed',
    ];

    retryableErrors.forEach(code => {
      const params = new URLSearchParams(`?error=${code}`);
      const error = parseOAuthError(params);
      
      expect(error?.canRetry).toBe(true);
    });
  });

  it('should prevent retry for permanent errors', () => {
    const nonRetryableErrors = [
      'redirect_uri_mismatch',
      'invalid_client',
      'too_many_requests',
    ];

    nonRetryableErrors.forEach(code => {
      const params = new URLSearchParams(`?error=${code}`);
      const error = parseOAuthError(params);
      
      expect(error?.canRetry).toBe(false);
    });
  });
});
