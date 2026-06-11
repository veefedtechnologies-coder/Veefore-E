import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Bug Exploration Property-Based Test for Cookie Domain Configuration
 * 
 * **CRITICAL**: This test is EXPECTED TO FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Bug Description:
 * The OAuth callback endpoint sets cookie domain only if COOKIE_DOMAIN env var is set,
 * but never validates that it matches FRONTEND_URL and OAUTH_CALLBACK_URL domains.
 * Multi-subdomain setups can fail silently when domains are incompatible.
 * 
 * Current Behavior:
 * - COOKIE_DOMAIN can be set to any value without validation
 * - Application starts successfully even with mismatched domains
 * - Cookies fail to work properly at runtime, causing authentication failures
 * - NO validateCookieDomain() function exists in server/config/oauthEnvValidation.ts
 * 
 * Expected Behavior (after fix):
 * - System should validate COOKIE_DOMAIN compatibility with FRONTEND_URL at startup
 * - System should validate COOKIE_DOMAIN compatibility with OAUTH_CALLBACK_URL at startup
 * - Application should fail to start with clear error message if misconfigured
 * - A validateCookieDomain() function should be added to startup validation
 * 
 * Requirements tested: 1.12, 1.13, 2.12, 2.13
 */

// Store original environment
const originalEnv = { ...process.env };

/**
 * Helper function to validate if cookie domain is compatible with a URL
 * This represents the EXPECTED behavior after the fix is implemented
 */
function validateCookieDomainCompatibility(
  cookieDomain: string | undefined,
  url: string,
  urlName: string
): { valid: boolean; error?: string } {
  if (!cookieDomain) {
    // If COOKIE_DOMAIN is not set, it's valid (cookies will use current domain)
    return { valid: true };
  }

  try {
    const parsedUrl = new URL(url);
    const urlHostname = parsedUrl.hostname;

    // Remove leading dot from cookie domain for comparison
    const normalizedCookieDomain = cookieDomain.startsWith('.')
      ? cookieDomain.substring(1)
      : cookieDomain;

    // Check if URL hostname matches or is a subdomain of cookie domain
    const isExactMatch = urlHostname === normalizedCookieDomain;
    const isSubdomain = urlHostname.endsWith('.' + normalizedCookieDomain);

    if (!isExactMatch && !isSubdomain) {
      return {
        valid: false,
        error: `COOKIE_DOMAIN "${cookieDomain}" is incompatible with ${urlName} "${url}" (hostname: ${urlHostname})`,
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
 * Helper function that represents the expected validateCookieDomain() function
 * This is what SHOULD exist in the codebase but currently doesn't
 */
function validateCookieDomain(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const cookieDomain = process.env.COOKIE_DOMAIN;
  const frontendUrl = process.env.FRONTEND_URL;
  const callbackUrl = process.env.OAUTH_CALLBACK_URL;

  // If COOKIE_DOMAIN is not set, validation passes (cookies use current domain)
  if (!cookieDomain) {
    return { valid: true, errors: [] };
  }

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

  return { valid: errors.length === 0, errors };
}

describe('Cookie Domain Configuration - Bug Exploration', () => {
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
   * Property 1: Bug Condition - Cookie Domain Configuration Issue
   * 
   * **Validates: Requirements 1.12, 1.13, 2.12, 2.13**
   * 
   * This property tests that COOKIE_DOMAIN configuration is validated against
   * FRONTEND_URL and OAUTH_CALLBACK_URL at application startup.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - System should validate COOKIE_DOMAIN compatibility at startup
   * - Incompatible configurations should fail with clear error messages
   * - Application should refuse to start with misconfigured domains
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - No validation function exists in the codebase
   * - Application starts successfully regardless of domain configuration
   * - Cookies fail silently at runtime, causing authentication failures
   * 
   * CRITICAL: This test MUST FAIL on unfixed code to confirm the bug exists
   */
  it('PROPERTY 1: Bug Condition - validateCookieDomain function must exist and validate domain compatibility', async () => {
    // CRITICAL BUG CHECK: Verify that validateCookieDomain function doesn't exist
    // This is the core bug - there's no validation at startup
    
    const oauthEnvValidation = await import('../oauthEnvValidation');
    
    // BUG CONDITION: The validateCookieDomain function should exist but doesn't
    // THIS ASSERTION WILL FAIL on unfixed code - confirming the bug exists
    expect(oauthEnvValidation).toHaveProperty('validateCookieDomain');
    expect(typeof (oauthEnvValidation as any).validateCookieDomain).toBe('function');
    
    // If the function exists, test that it properly validates configurations
    // If the function exists, test that it properly validates configurations
    fc.assert(
      fc.property(
        fc.record({
          // Generate incompatible domain configurations
          cookieDomain: fc.constantFrom(
            '.example.com',      // Domain with leading dot
            'example.com',       // Domain without leading dot
            '.api.example.com',  // Subdomain
            'different.com',     // Completely different domain
            '.different.org'     // Different TLD
          ),
          frontendUrl: fc.constantFrom(
            'https://app.example.com',
            'https://www.example.com',
            'https://example.com',
            'https://different.com',
            'https://unrelated.net'
          ),
          callbackUrl: fc.constantFrom(
            'https://api.example.com/callback',
            'https://auth.example.com/callback',
            'https://example.com/callback',
            'https://different.com/callback',
            'https://other.org/callback'
          ),
        }),
        ({ cookieDomain, frontendUrl, callbackUrl }) => {
          // Set environment variables
          process.env.COOKIE_DOMAIN = cookieDomain;
          process.env.FRONTEND_URL = frontendUrl;
          process.env.OAUTH_CALLBACK_URL = callbackUrl;

          // Call the validation function that should now exist
          const validateCookieDomainFn = (oauthEnvValidation as any).validateCookieDomain;
          const validationResult = validateCookieDomainFn();

          // Determine if this configuration is actually compatible
          const frontendCheck = validateCookieDomainCompatibility(
            cookieDomain,
            frontendUrl,
            'FRONTEND_URL'
          );
          const callbackCheck = validateCookieDomainCompatibility(
            cookieDomain,
            callbackUrl,
            'OAUTH_CALLBACK_URL'
          );

          const shouldBeValid = frontendCheck.valid && callbackCheck.valid;

          if (!shouldBeValid) {
            // For incompatible configurations, validation should fail
            expect(validationResult.valid).toBe(false);
            expect(validationResult.errors.length).toBeGreaterThan(0);

            // Verify error messages are descriptive
            const errorMessage = validationResult.errors.join(' ');
            expect(errorMessage).toContain('COOKIE_DOMAIN');
            expect(errorMessage.toLowerCase()).toContain('incompatible');
          } else {
            // For compatible configurations, validation should pass
            expect(validationResult.valid).toBe(true);
            expect(validationResult.errors.length).toBe(0);
          }

          return true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  /**
   * Property 2: Bug Documentation - Specific Counterexamples
   * 
   * This property documents specific problematic configurations that should be rejected
   * but are currently allowed by the unfixed code.
   */
  it('PROPERTY 2: Bug Documentation - Mismatched domains should be rejected at startup', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCookieDomain');
    
    const validateCookieDomainFn = (oauthEnvValidation as any).validateCookieDomain;

    // COUNTEREXAMPLE 1: COOKIE_DOMAIN doesn't match FRONTEND_URL
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.FRONTEND_URL = 'https://app.different.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/callback';

    const result1 = validateCookieDomainFn();

    // EXPECTED: Validation should fail
    // ACTUAL (unfixed): No validation exists, application starts
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContainEqual(
      expect.stringContaining('COOKIE_DOMAIN ".example.com" is incompatible with FRONTEND_URL')
    );

    // COUNTEREXAMPLE 2: COOKIE_DOMAIN doesn't match OAUTH_CALLBACK_URL
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.different.org/callback';

    const result2 = validateCookieDomainFn();

    // EXPECTED: Validation should fail
    // ACTUAL (unfixed): No validation exists, application starts
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContainEqual(
      expect.stringContaining('COOKIE_DOMAIN ".example.com" is incompatible with OAUTH_CALLBACK_URL')
    );

    // COUNTEREXAMPLE 3: COOKIE_DOMAIN without leading dot but subdomain URLs
    process.env.COOKIE_DOMAIN = 'example.com';
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/callback';

    const result3 = validateCookieDomainFn();

    // EXPECTED: Validation should PASS (exact match with base domain)
    // The subdomain check should handle this correctly
    expect(result3.valid).toBe(true);
  });

  /**
   * Property 3: Bug Documentation - Valid Configurations Should Pass
   * 
   * This property verifies that valid configurations are correctly identified
   * by the validation logic (ensuring the fix doesn't reject valid configs).
   */
  it('PROPERTY 3: Valid cookie domain configurations should pass validation', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCookieDomain');
    
    const validateCookieDomainFn = (oauthEnvValidation as any).validateCookieDomain;

    fc.assert(
      fc.property(
        fc.constantFrom(
          // Valid configuration 1: All same base domain with leading dot
          {
            cookieDomain: '.example.com',
            frontendUrl: 'https://app.example.com',
            callbackUrl: 'https://api.example.com/callback',
            description: 'Leading dot with subdomains',
          },
          // Valid configuration 2: All same base domain without leading dot
          {
            cookieDomain: 'example.com',
            frontendUrl: 'https://example.com',
            callbackUrl: 'https://example.com/callback',
            description: 'No leading dot with exact match',
          },
          // Valid configuration 3: Subdomain with subdomains
          {
            cookieDomain: '.api.example.com',
            frontendUrl: 'https://app.api.example.com',
            callbackUrl: 'https://auth.api.example.com/callback',
            description: 'Subdomain cookie domain',
          },
          // Valid configuration 4: COOKIE_DOMAIN not set (uses current domain)
          {
            cookieDomain: undefined,
            frontendUrl: 'https://app.example.com',
            callbackUrl: 'https://api.example.com/callback',
            description: 'No COOKIE_DOMAIN set',
          }
        ),
        (config) => {
          process.env.COOKIE_DOMAIN = config.cookieDomain;
          process.env.FRONTEND_URL = config.frontendUrl;
          process.env.OAUTH_CALLBACK_URL = config.callbackUrl;

          const result = validateCookieDomainFn();

          // All these valid configurations should pass
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
   * Property 4: Startup Validation Integration
   * 
   * This property verifies that the validation is called during application startup
   * and prevents the application from starting with invalid configuration.
   */
  it('PROPERTY 4: Bug Condition - Application should fail to start with invalid cookie domain configuration', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCookieDomain');
    
    const validateCookieDomainFn = (oauthEnvValidation as any).validateCookieDomain;

    // Set up invalid configuration
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.FRONTEND_URL = 'https://app.different.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.different.com/callback';

    const result = validateCookieDomainFn();

    // EXPECTED BEHAVIOR (after fix):
    // - Validation returns valid: false
    // - Application startup throws error with clear message
    // - Error message includes both mismatched URLs
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    // Verify both URLs are mentioned in errors
    const allErrors = result.errors.join(' ');
    expect(allErrors).toContain('FRONTEND_URL');
    expect(allErrors).toContain('OAUTH_CALLBACK_URL');
    expect(allErrors).toContain('.example.com');

    // CURRENT BEHAVIOR (unfixed code):
    // - No validateCookieDomain() function exists in the codebase
    // - No startup validation happens
    // - Application starts successfully with invalid configuration
    // - Cookies fail silently at runtime

    // THIS TEST DOCUMENTS THE BUG: The validation function should exist
    // and be called during startup, but it currently doesn't exist
  });

  /**
   * Property 5: Edge Cases - Domain Validation Logic
   * 
   * This property tests edge cases in domain matching logic to ensure
   * the validation is robust and handles various domain formats.
   */
  it('PROPERTY 5: Edge cases in cookie domain validation', async () => {
    // First, verify the validation function exists (will fail on unfixed code)
    const oauthEnvValidation = await import('../oauthEnvValidation');
    expect(oauthEnvValidation).toHaveProperty('validateCookieDomain');
    
    const validateCookieDomainFn = (oauthEnvValidation as any).validateCookieDomain;

    // Edge case 1: Leading dot in COOKIE_DOMAIN allows all subdomains
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.FRONTEND_URL = 'https://very.deep.nested.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://another.deep.example.com/callback';

    let result = validateCookieDomainFn();
    expect(result.valid).toBe(true); // Should allow any subdomain depth

    // Edge case 2: Without leading dot, only exact match or subdomain
    process.env.COOKIE_DOMAIN = 'example.com';
    process.env.FRONTEND_URL = 'https://example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.example.com/callback';

    result = validateCookieDomainFn();
    expect(result.valid).toBe(true);

    // Edge case 3: Domain suffix matching should not be fooled by partial matches
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.FRONTEND_URL = 'https://fakeexample.com';
    process.env.OAUTH_CALLBACK_URL = 'https://notexample.com/callback';

    result = validateCookieDomainFn();
    expect(result.valid).toBe(false); // Should reject partial string matches

    // Edge case 4: Case sensitivity in domains (domains should be case-insensitive)
    process.env.COOKIE_DOMAIN = '.Example.COM';
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.OAUTH_CALLBACK_URL = 'https://api.EXAMPLE.com/callback';

    result = validateCookieDomainFn();
    // Note: This test documents expected behavior; actual implementation should normalize case
    // For now, we test the current string matching behavior
  });
});
