import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Bug Exploration Property-Based Test for CORS Configuration Validation
 * 
 * **Validates: Requirements 1.16, 1.17, 2.16, 2.17**
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The application starts without validating that FRONTEND_URL and OAUTH_CALLBACK_URL
 * are included in the CORS allowlist. Misconfigured CORS causes OAuth redirects to
 * fail silently with hard-to-diagnose errors in the browser.
 * 
 * Current Behavior:
 * - validateCORSConfiguration() function EXISTS in server/config/oauthEnvValidation.ts
 * - BUT the function is NEVER CALLED during server startup in server/index.ts
 * - Application starts successfully even if FRONTEND_URL is not in CORS allowlist
 * - Application starts successfully even if OAUTH_CALLBACK_URL is not in CORS allowlist
 * - OAuth redirects fail with CORS errors only at runtime (not at startup)
 * - Only validateOAuthEnvironment() is called at startup, not validateCORSConfiguration()
 * 
 * Expected Behavior (after fix):
 * - System should CALL validateCORSConfiguration() at startup in server/index.ts
 * - System should validate FRONTEND_URL is in CORS allowlist at startup
 * - System should validate OAUTH_CALLBACK_URL is in CORS allowlist at startup
 * - Application should fail to start with descriptive error if misconfigured
 * - validateCORSConfiguration() should be integrated into startup validation sequence
 * 
 * Testing Strategy:
 * - Verify validateCORSConfiguration() function exists (should pass - function already exists)
 * - Verify validateCORSConfiguration() is CALLED during server startup (SHOULD FAIL - not called)
 * - Generate various CORS_ORIGINS configurations that don't include required URLs
 * - Test that validation catches missing FRONTEND_URL in allowlist
 * - Test that validation catches missing OAUTH_CALLBACK_URL in allowlist
 * - Test that validation passes for properly configured CORS
 * - Document counterexamples showing CORS misconfigurations
 */

// Store original environment
const originalEnv = { ...process.env };

/**
 * Helper function to parse CORS_ORIGINS (comma-separated or single value)
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
 */
function isUrlInCorsAllowlist(url: string, corsOrigins: string[]): boolean {
  try {
    const parsedUrl = new URL(url);
    const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? ':' + parsedUrl.port : ''}`;
    
    // Check exact match with origin
    if (corsOrigins.includes(origin)) {
      return true;
    }
    
    // Check if the full URL is in the allowlist (less common but possible)
    if (corsOrigins.includes(url)) {
      return true;
    }
    
    return false;
  } catch (error) {
    // Invalid URL format
    return false;
  }
}

/**
 * Helper function that represents the expected validateCORSConfiguration() function
 * This is what SHOULD exist in the codebase but currently doesn't
 */
function validateCORSConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const frontendUrl = process.env.FRONTEND_URL;
  const callbackUrl = process.env.OAUTH_CALLBACK_URL;
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  // CORS validation is optional if no CORS_ORIGINS configured
  // But if OAuth URLs are configured, they should be in CORS allowlist
  if (corsOrigins.length === 0) {
    // If CORS_ORIGINS is not configured, skip validation
    // (system will use default origins from middleware)
    return { valid: true, errors: [] };
  }

  // Validate FRONTEND_URL is in CORS allowlist if set
  if (frontendUrl) {
    if (!isUrlInCorsAllowlist(frontendUrl, corsOrigins)) {
      errors.push(
        `FRONTEND_URL "${frontendUrl}" is not included in CORS_ORIGINS allowlist. ` +
        `OAuth redirects from frontend will fail with CORS errors.`
      );
    }
  }

  // Validate OAUTH_CALLBACK_URL is in CORS allowlist if set
  if (callbackUrl) {
    if (!isUrlInCorsAllowlist(callbackUrl, corsOrigins)) {
      errors.push(
        `OAUTH_CALLBACK_URL "${callbackUrl}" is not included in CORS_ORIGINS allowlist. ` +
        `OAuth callback requests will fail with CORS errors.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

describe('CORS Configuration Validation - Bug Exploration', () => {
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

  /**
   * Property 1: Bug Condition - Missing CORS Validation
   * 
   * **Validates: Requirements 1.16, 1.17, 2.16, 2.17**
   * 
   * This property tests that CORS configuration validation exists and properly
   * validates that FRONTEND_URL and OAUTH_CALLBACK_URL are in the CORS allowlist.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - validateCORSConfiguration() function should exist in oauthEnvValidation.ts ✅ (already exists)
   * - Function should validate FRONTEND_URL is in CORS_ORIGINS ✅ (already implemented)
   * - Function should validate OAUTH_CALLBACK_URL is in CORS_ORIGINS ✅ (already implemented)
   * - Application startup should call this function ❌ (THIS IS THE BUG - not called)
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - validateCORSConfiguration() function EXISTS in oauthEnvValidation.ts ✅
   * - Function correctly validates CORS configuration ✅
   * - BUT function is NEVER CALLED in server/index.ts ❌ (THE ACTUAL BUG)
   * - Application starts successfully regardless of CORS configuration ❌
   * - OAuth redirects fail silently at runtime with CORS errors ❌
   * 
   * CRITICAL: This test will PASS because the function exists, but it should also verify
   * that the function is called during startup (which will FAIL on unfixed code)
   */
  it('PROPERTY 1: Bug Condition - validateCORSConfiguration function must exist', async () => {
    // PART 1: Verify that validateCORSConfiguration function exists
    // This SHOULD PASS - function already exists in the codebase
    
    const oauthEnvValidation = await import('../oauthEnvValidation');
    
    // BUG CONDITION CHECK 1: The validateCORSConfiguration function should exist
    // THIS ASSERTION PASSES on current code - function exists
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    expect(typeof (oauthEnvValidation as any).validateCORSConfiguration).toBe('function');
    
    // If we reach here, the function exists (✅)
    // Verify it has the correct signature
    const validateFn = (oauthEnvValidation as any).validateCORSConfiguration;
    const result = validateFn();
    
    // Should return an object with valid and errors properties
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  /**
   * Property 1B: Bug Condition - CORS Validation MUST BE CALLED at Startup
   * 
   * **Validates: Requirements 2.16, 2.17**
   * 
   * This is the CRITICAL test that exposes the real bug:
   * The validateCORSConfiguration() function exists but is NEVER CALLED during server startup.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - server/index.ts should import validateCORSConfiguration
   * - server/index.ts should call validateCORSConfiguration() during startup
   * - Invalid CORS configuration should prevent server from starting
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - server/index.ts does NOT import validateCORSConfiguration ❌
   * - server/index.ts does NOT call validateCORSConfiguration() ❌
   * - Server starts successfully with invalid CORS configuration ❌
   * - Only validateOAuthEnvironment() is called, not validateCORSConfiguration() ❌
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1B: Bug Condition - validateCORSConfiguration MUST be called at startup', async () => {
    // Read server/index.ts to verify startup integration
    const fs = await import('fs');
    const path = await import('path');
    
    const serverIndexPath = path.join(process.cwd(), 'server/index.ts');
    const serverIndexContent = fs.readFileSync(serverIndexPath, 'utf-8');
    
    // BUG CONDITION CHECK 1: validateCORSConfiguration should be imported
    // THIS ASSERTION WILL FAIL on unfixed code - function is not imported
    const importMatch = serverIndexContent.match(/import.*validateCORSConfiguration.*from/);
    expect(importMatch).not.toBeNull();
    expect(importMatch).toBeDefined();
    
    if (!importMatch) {
      throw new Error(
        'BUG CONFIRMED: validateCORSConfiguration is NOT imported in server/index.ts. ' +
        'The function exists but is never called during startup. ' +
        'This means invalid CORS configuration does not prevent server startup.'
      );
    }
    
    // BUG CONDITION CHECK 2: validateCORSConfiguration should be called
    // THIS ASSERTION WILL FAIL on unfixed code - function is not called
    const callMatch = serverIndexContent.match(/validateCORSConfiguration\s*\(/);
    expect(callMatch).not.toBeNull();
    expect(callMatch).toBeDefined();
    
    if (!callMatch) {
      throw new Error(
        'BUG CONFIRMED: validateCORSConfiguration is NOT called in server/index.ts. ' +
        'The function is imported but never executed during startup. ' +
        'This means CORS configuration is not validated at startup.'
      );
    }
    
    // If we reach here, the function is both imported and called during startup (code is fixed)
    console.log('✅ validateCORSConfiguration is properly integrated into server startup');
  });

  /**
   * Property 2: Bug Condition - CORS Misconfiguration Detection
   * 
   * This property generates various CORS misconfigurations and verifies
   * that the validation function properly detects them.
   * 
   * Tests configurations where:
   * - FRONTEND_URL is not in CORS_ORIGINS
   * - OAUTH_CALLBACK_URL is not in CORS_ORIGINS
   * - Both URLs are missing from CORS_ORIGINS
   * - CORS_ORIGINS has different domains than the OAuth URLs
   */
  it('PROPERTY 2: Bug Condition - Must detect when FRONTEND_URL is missing from CORS allowlist', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;

    // Property-based test: Generate CORS misconfigurations
    fc.assert(
      fc.property(
        fc.record({
          frontendUrl: fc.constantFrom(
            'https://app.example.com',
            'https://frontend.myapp.com',
            'https://www.example.com',
            'https://dashboard.example.com',
            'http://localhost:3000'
          ),
          callbackUrl: fc.constantFrom(
            'https://api.example.com/callback',
            'https://backend.myapp.com/auth/callback',
            'https://auth.example.com/oauth/callback',
            'http://localhost:5000/api/auth/callback'
          ),
          // Generate CORS_ORIGINS that DON'T include the frontend URL
          corsOrigins: fc.constantFrom(
            'https://different.com',
            'https://unrelated.com,https://another.com',
            'https://wrong-domain.com',
            'https://api.example.com', // Only has API, not frontend
            'http://localhost:5000' // Only backend, not frontend
          ),
        }),
        ({ frontendUrl, callbackUrl, corsOrigins }) => {
          // Set environment variables
          process.env.FRONTEND_URL = frontendUrl;
          process.env.OAUTH_CALLBACK_URL = callbackUrl;
          process.env.CORS_ORIGINS = corsOrigins;

          // Call the validation function
          const result = validateCORSConfigurationFn();

          // Parse CORS origins to check if URLs are actually missing
          const corsOriginsList = parseCorsOrigins(corsOrigins);
          const frontendMissing = !isUrlInCorsAllowlist(frontendUrl, corsOriginsList);

          if (frontendMissing) {
            // EXPECTED: Validation should fail when FRONTEND_URL is not in allowlist
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);

            // Verify error message mentions FRONTEND_URL
            const errorMessage = result.errors.join(' ');
            expect(errorMessage).toContain('FRONTEND_URL');
            expect(errorMessage).toContain(frontendUrl);
            expect(errorMessage.toLowerCase()).toContain('cors');
          }

          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });

  /**
   * Property 3: Bug Condition - Detect missing OAUTH_CALLBACK_URL in CORS
   * 
   * Tests that validation detects when OAUTH_CALLBACK_URL is not in CORS_ORIGINS
   */
  it('PROPERTY 3: Bug Condition - Must detect when OAUTH_CALLBACK_URL is missing from CORS allowlist', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;

    fc.assert(
      fc.property(
        fc.record({
          frontendUrl: fc.constantFrom(
            'https://app.example.com',
            'https://www.example.com'
          ),
          callbackUrl: fc.constantFrom(
            'https://api.example.com/auth/callback',
            'https://backend.example.com/oauth/callback',
            'http://localhost:5000/api/auth/callback'
          ),
          // Generate CORS_ORIGINS that DON'T include the callback URL
          corsOrigins: fc.constantFrom(
            'https://app.example.com', // Only has frontend, not callback
            'https://www.example.com', // Frontend domain, not API domain
            'https://different.com',
            'http://localhost:3000' // Only frontend port, not backend
          ),
        }),
        ({ frontendUrl, callbackUrl, corsOrigins }) => {
          process.env.FRONTEND_URL = frontendUrl;
          process.env.OAUTH_CALLBACK_URL = callbackUrl;
          process.env.CORS_ORIGINS = corsOrigins;

          const result = validateCORSConfigurationFn();

          const corsOriginsList = parseCorsOrigins(corsOrigins);
          const callbackMissing = !isUrlInCorsAllowlist(callbackUrl, corsOriginsList);

          if (callbackMissing) {
            // EXPECTED: Validation should fail when OAUTH_CALLBACK_URL is not in allowlist
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);

            // Verify error message mentions OAUTH_CALLBACK_URL
            const errorMessage = result.errors.join(' ');
            expect(errorMessage).toContain('OAUTH_CALLBACK_URL');
            expect(errorMessage).toContain(callbackUrl);
            expect(errorMessage.toLowerCase()).toContain('cors');
          }

          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });

  /**
   * Property 4: Bug Documentation - Specific Counterexamples
   * 
   * Documents specific problematic configurations that should be rejected
   * but are currently allowed by the unfixed code.
   */
  it('PROPERTY 4: Bug Documentation - Specific misconfiguration scenarios should fail validation', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;

    // COUNTEREXAMPLE 1: Production deployment with wrong CORS configuration
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://old-domain.com,https://staging.example.com';

    let result = validateCORSConfigurationFn();

    // EXPECTED: Both URLs missing from CORS allowlist should cause validation failure
    // ACTUAL (unfixed): No validation exists, application starts
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2); // Both URLs missing
    expect(result.errors[0]).toContain('FRONTEND_URL');
    expect(result.errors[1]).toContain('OAUTH_CALLBACK_URL');

    // COUNTEREXAMPLE 2: Only frontend in CORS, callback missing
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://app.example.com';

    result = validateCORSConfigurationFn();

    // EXPECTED: OAUTH_CALLBACK_URL missing should cause failure
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('OAUTH_CALLBACK_URL');
    expect(result.errors[0]).toContain('https://api.example.com/auth/callback');

    // COUNTEREXAMPLE 3: Typo in CORS configuration (common production bug)
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://app.exmaple.com,https://api.exmaple.com'; // Typo: exmaple instead of example

    result = validateCORSConfigurationFn();

    // EXPECTED: Typo means URLs not in allowlist, should fail
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);

    // COUNTEREXAMPLE 4: Protocol mismatch (http vs https)
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'http://app.example.com,http://api.example.com'; // Wrong protocol

    result = validateCORSConfigurationFn();

    // EXPECTED: Protocol mismatch should cause validation failure
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  /**
   * Property 5: Valid Configurations Should Pass
   * 
   * Verifies that properly configured CORS settings pass validation.
   * This ensures the fix doesn't reject valid configurations.
   */
  it('PROPERTY 5: Valid CORS configurations should pass validation', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;

    fc.assert(
      fc.property(
        fc.constantFrom(
          // Valid configuration 1: Both URLs in CORS_ORIGINS
          {
            frontendUrl: 'https://app.example.com',
            callbackUrl: 'https://api.example.com/auth/callback',
            corsOrigins: 'https://app.example.com,https://api.example.com',
            description: 'Both URLs explicitly in CORS_ORIGINS',
          },
          // Valid configuration 2: Full callback URL in CORS_ORIGINS
          {
            frontendUrl: 'https://app.example.com',
            callbackUrl: 'https://api.example.com/auth/callback',
            corsOrigins: 'https://app.example.com,https://api.example.com/auth/callback',
            description: 'Full callback URL in CORS_ORIGINS',
          },
          // Valid configuration 3: Same domain for frontend and callback
          {
            frontendUrl: 'https://example.com',
            callbackUrl: 'https://example.com/auth/callback',
            corsOrigins: 'https://example.com',
            description: 'Same domain for both URLs',
          },
          // Valid configuration 4: Localhost development
          {
            frontendUrl: 'http://localhost:3000',
            callbackUrl: 'http://localhost:5000/api/auth/callback',
            corsOrigins: 'http://localhost:3000,http://localhost:5000',
            description: 'Localhost development setup',
          },
          // Valid configuration 5: CORS_ORIGINS not set (uses defaults)
          {
            frontendUrl: 'https://app.example.com',
            callbackUrl: 'https://api.example.com/auth/callback',
            corsOrigins: '',
            description: 'No CORS_ORIGINS set (uses middleware defaults)',
          },
        ),
        (config) => {
          process.env.FRONTEND_URL = config.frontendUrl;
          process.env.OAUTH_CALLBACK_URL = config.callbackUrl;
          process.env.CORS_ORIGINS = config.corsOrigins;

          const result = validateCORSConfigurationFn();

          // All valid configurations should pass
          expect(result.valid).toBe(true);
          expect(result.errors.length).toBe(0);

          return true;
        }
      ),
      {
        numRuns: 50,
        verbose: true,
      }
    );
  });

  /**
   * Property 6: Edge Cases - URL Format Variations
   * 
   * Tests edge cases in URL matching to ensure validation is robust
   */
  it('PROPERTY 6: Edge cases - URL format variations should be handled correctly', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;

    // Edge case 1: Trailing slashes should not affect validation
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://app.example.com/,https://api.example.com/'; // Trailing slashes

    let result = validateCORSConfigurationFn();
    
    // Should handle trailing slashes gracefully
    // The validation should extract origins correctly
    expect(result.valid).toBe(true);

    // Edge case 2: Port numbers should be matched correctly
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.OAUTH_CALLBACK_URL = 'http://localhost:5000/api/auth/callback';
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5000';

    result = validateCORSConfigurationFn();
    expect(result.valid).toBe(true);

    // Edge case 3: Port mismatch should cause failure
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3001'; // Wrong port

    result = validateCORSConfigurationFn();
    expect(result.valid).toBe(false);

    // Edge case 4: Subdomain differences should cause failure
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.CORS_ORIGINS = 'https://api.example.com'; // Different subdomain

    result = validateCORSConfigurationFn();
    expect(result.valid).toBe(false);

    // Edge case 5: Case sensitivity in domains (should be case-insensitive)
    process.env.FRONTEND_URL = 'https://APP.EXAMPLE.COM';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://app.example.com,https://API.EXAMPLE.COM';

    result = validateCORSConfigurationFn();
    // URLs should match regardless of case (domains are case-insensitive)
    expect(result.valid).toBe(true);
  });

  /**
   * Property 7: Startup Integration
   * 
   * Verifies that CORS validation is integrated into startup validation
   * and prevents application from starting with invalid configuration.
   * 
   * **CRITICAL BUG**: The validateCORSConfiguration() function exists and works correctly,
   * but it is NEVER CALLED during server startup in server/index.ts.
   */
  it('PROPERTY 7: Bug Condition - CORS validation should be part of startup validation', async () => {
    // First, verify the validation function exists (will pass on current code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCORSConfiguration');
    
    // Set up invalid CORS configuration
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/auth/callback';
    process.env.CORS_ORIGINS = 'https://wrong-domain.com';

    const validateCORSConfigurationFn = (oauthEnvValidation as any).validateCORSConfiguration;
    const result = validateCORSConfigurationFn();

    // EXPECTED BEHAVIOR (after fix):
    // - Validation returns valid: false ✅ (works correctly)
    // - Clear error messages about misconfiguration ✅ (works correctly)
    // - Application startup should call this and fail to start ❌ (THIS IS THE BUG)
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    // Verify error messages are descriptive
    const allErrors = result.errors.join('\n');
    expect(allErrors).toContain('FRONTEND_URL');
    expect(allErrors).toContain('OAUTH_CALLBACK_URL');
    expect(allErrors).toContain('CORS');
    expect(allErrors.toLowerCase()).toContain('allowlist');

    // THE REAL BUG: Verify that validateCORSConfiguration is called during startup
    const fs = await import('fs');
    const path = await import('path');
    
    const serverIndexPath = path.join(process.cwd(), 'server/index.ts');
    const serverIndexContent = fs.readFileSync(serverIndexPath, 'utf-8');
    
    // Check if validateCORSConfiguration is imported and called
    const hasImport = serverIndexContent.includes('validateCORSConfiguration');
    const hasCall = /validateCORSConfiguration\s*\(/.test(serverIndexContent);
    
    // THIS WILL FAIL on unfixed code - exposing the real bug
    expect(hasImport).toBe(true);
    expect(hasCall).toBe(true);

    if (!hasImport || !hasCall) {
      throw new Error(
        'BUG DOCUMENTED: validateCORSConfiguration() function exists and works correctly, ' +
        'but it is NEVER CALLED during server startup in server/index.ts. ' +
        'CURRENT BEHAVIOR:\n' +
        '  - validateCORSConfiguration() exists in oauthEnvValidation.ts ✅\n' +
        '  - Function correctly validates CORS configuration ✅\n' +
        '  - BUT function is NOT imported in server/index.ts ❌\n' +
        '  - AND function is NOT called during startup ❌\n' +
        '  - Server starts successfully with invalid CORS configuration ❌\n' +
        '  - OAuth redirects fail at runtime with difficult-to-diagnose CORS errors ❌\n\n' +
        'EXPECTED BEHAVIOR:\n' +
        '  - server/index.ts should import { validateCORSConfiguration } from "./config/oauthEnvValidation"\n' +
        '  - server/index.ts should call validateCORSConfiguration() after validateOAuthEnvironment()\n' +
        '  - Invalid CORS configuration should prevent server from starting with clear error message\n' +
        '  - CORS misconfigurations should be caught at startup, not at runtime'
      );
    }

    // THIS TEST DOCUMENTS THE BUG: The validation function exists and works,
    // but the integration into server startup is missing. The server starts
    // successfully with misconfigured CORS, and OAuth failures only occur at runtime.
  });
});
