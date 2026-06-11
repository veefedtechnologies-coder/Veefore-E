/**
 * Unit Tests for OAuth Environment Variable Validation
 * 
 * Tests requirements 8.6, 8.8, 8.9 from server-side OAuth implementation spec
 * 
 * **Validates: Requirements 8.6, 8.8, 8.9, 15.9**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Store original environment
const originalEnv = { ...process.env };

describe('OAuth Environment Validation', () => {
  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Reset module cache to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Missing Required Variables', () => {
    it('should fail when GOOGLE_CLIENT_ID is missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      
      // Import fresh module after env change
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('GOOGLE_CLIENT_ID is required for OAuth authentication');
    });

    it('should fail when GOOGLE_CLIENT_SECRET is missing', async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('GOOGLE_CLIENT_SECRET is required for OAuth authentication');
    });

    it('should fail when FIREBASE_SERVICE_ACCOUNT_KEY is missing', async () => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('FIREBASE_SERVICE_ACCOUNT_KEY is required for creating Firebase custom tokens');
    });

    it('should fail when SESSION_SECRET is missing', async () => {
      delete process.env.SESSION_SECRET;
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SESSION_SECRET is required for session management');
    });

    it('should fail when OAUTH_CALLBACK_URL is missing', async () => {
      delete process.env.OAUTH_CALLBACK_URL;
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('OAUTH_CALLBACK_URL is required for OAuth callback redirect');
    });

    it('should report multiple missing variables', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.SESSION_SECRET;
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('SESSION_SECRET Length Validation (Requirement 8.9)', () => {
    it('should fail when SESSION_SECRET is below 32 characters', async () => {
      process.env.SESSION_SECRET = 'short_secret_12345'; // 18 characters
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('SESSION_SECRET must be at least 32 characters')
      );
    });

    it('should fail when SESSION_SECRET is exactly 31 characters', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(31);
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('SESSION_SECRET must be at least 32 characters')
      );
    });

    it('should pass when SESSION_SECRET is exactly 32 characters', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).not.toContainEqual(
        expect.stringContaining('SESSION_SECRET must be at least 32 characters')
      );
    });

    it('should pass when SESSION_SECRET is longer than 32 characters', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(64);
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
    });
  });

  describe('FIREBASE_SERVICE_ACCOUNT_KEY JSON Format Validation (Requirement 8.8)', () => {
    it('should fail when FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = 'not-valid-json';
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON format');
    });

    it('should fail when FIREBASE_SERVICE_ACCOUNT_KEY JSON is missing required fields', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        // Missing: project_id, private_key, client_email
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('FIREBASE_SERVICE_ACCOUNT_KEY is missing required fields')
      );
    });

    it('should fail when FIREBASE_SERVICE_ACCOUNT_KEY type is not service_account', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'invalid_type',
        project_id: 'test-project',
        private_key: 'test-key',
        client_email: 'test@test.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('FIREBASE_SERVICE_ACCOUNT_KEY must be a service_account type');
    });

    it('should pass with valid FIREBASE_SERVICE_ACCOUNT_KEY JSON', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('OAUTH_CALLBACK_URL Validation', () => {
    it('should fail when OAUTH_CALLBACK_URL is not a valid URL', async () => {
      process.env.OAUTH_CALLBACK_URL = 'not-a-valid-url';
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('OAUTH_CALLBACK_URL is not a valid URL');
    });

    it('should fail when OAUTH_CALLBACK_URL uses invalid protocol', async () => {
      process.env.OAUTH_CALLBACK_URL = 'ftp://example.com/callback';
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('OAUTH_CALLBACK_URL must use http or https protocol');
    });

    it('should pass with valid HTTP URL in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.OAUTH_CALLBACK_URL = 'http://localhost:3000/api/auth/google/callback';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
    });

    it('should pass with HTTPS URL', async () => {
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/api/auth/google/callback';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
    });

    it('should warn when using HTTP in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OAUTH_CALLBACK_URL = 'http://example.com/callback';
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true); // Still valid, just a warning
      expect(result.warnings).toContain('OAUTH_CALLBACK_URL should use HTTPS in production');
    });
  });

  describe('Successful Validation', () => {
    it('should pass with all correct environment variables', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { validateOAuthEnvironment } = await import('../oauthEnvValidation');
      const result = validateOAuthEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('enforceOAuthEnvironment', () => {
    it('should throw error in strict mode when validation fails', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      
      const { enforceOAuthEnvironment } = await import('../oauthEnvValidation');
      
      expect(() => {
        enforceOAuthEnvironment(true);
      }).toThrow('OAuth environment validation failed');
    });

    it('should not throw error in non-strict mode when validation fails', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      
      const { enforceOAuthEnvironment } = await import('../oauthEnvValidation');
      
      expect(() => {
        enforceOAuthEnvironment(false);
      }).not.toThrow();
    });

    it('should not throw error when all variables are valid', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { enforceOAuthEnvironment } = await import('../oauthEnvValidation');
      
      expect(() => {
        enforceOAuthEnvironment(true);
      }).not.toThrow();
    });
  });

  describe('getOAuthConfigStatus', () => {
    it('should return configured=false and list missing variables', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.SESSION_SECRET;
      
      const { getOAuthConfigStatus } = await import('../oauthEnvValidation');
      const status = getOAuthConfigStatus();
      
      expect(status.configured).toBe(false);
      expect(status.missingVariables.length).toBeGreaterThan(0);
    });

    it('should return configured=true when all variables are valid', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.OAUTH_CALLBACK_URL = 'https://example.com/callback';
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test.iam.gserviceaccount.com'
      });
      
      const { getOAuthConfigStatus } = await import('../oauthEnvValidation');
      const status = getOAuthConfigStatus();
      
      expect(status.configured).toBe(true);
      expect(status.missingVariables).toHaveLength(0);
    });
  });
});
