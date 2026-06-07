import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';

/**
 * Bug Condition Exploration Test for AI Caption & Hashtag Generation
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * **Property 1: Bug Condition** - Optional MediaType Validation Failure
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **GOAL**: Surface counterexamples that demonstrate the validation bug exists
 * 
 * This test encodes the EXPECTED BEHAVIOR after the fix:
 * - Requests with `mediaType: undefined` should be ACCEPTED
 * - Requests with `mediaType: null` should be ACCEPTED  
 * - Requests with mediaType field OMITTED should be ACCEPTED
 * 
 * On UNFIXED code, these requests fail with HTTP 400 "Invalid body data"
 * After the fix, these tests will PASS, confirming the bug is resolved
 */

describe('Bug Condition Exploration: Optional MediaType Validation', () => {
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
  const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';
  
  // Skip tests if no auth token provided (can't test without authentication)
  const testOrSkip = TEST_AUTH_TOKEN ? test : test.skip;

  /**
   * Test Case 1: Explicit undefined mediaType
   * 
   * Expected on UNFIXED code: HTTP 400 with "Invalid body data"
   * Expected AFTER fix: HTTP 200/202 (success) or 402 (insufficient credits)
   */
  testOrSkip('should accept request with mediaType: undefined', async () => {
    const requestBody = {
      mediaUrl: 'https://example.com/test-image.jpg',
      mediaType: undefined, // Explicitly undefined - this triggers the bug
      postType: 'post',
      platform: 'instagram',
      workspaceId: 'test-workspace-id'
    };

    const response = await request(API_BASE_URL)
      .post('/api/v1/ai/generate-content')
      .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
      .send(requestBody);

    // EXPECTED BEHAVIOR (after fix): Request should be accepted
    // On unfixed code, this will FAIL with 400
    expect([200, 202, 402]).toContain(response.status);
    
    if (response.status === 400) {
      console.log('❌ BUG CONFIRMED: Request with undefined mediaType failed');
      console.log('Response:', response.body);
      console.log('This test will pass after the fix is implemented');
    }
  });

  /**
   * Test Case 2: Explicit null mediaType
   * 
   * Expected on UNFIXED code: HTTP 400 with "Invalid body data"
   * Expected AFTER fix: HTTP 200/202 (success) or 402 (insufficient credits)
   */
  testOrSkip('should accept request with mediaType: null', async () => {
    const requestBody = {
      mediaUrl: 'https://example.com/test-video.mp4',
      mediaType: null, // Explicitly null - this triggers the bug
      postType: 'reel',
      platform: 'instagram',
      workspaceId: 'test-workspace-id'
    };

    const response = await request(API_BASE_URL)
      .post('/api/v1/ai/generate-content')
      .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
      .send(requestBody);

    // EXPECTED BEHAVIOR (after fix): Request should be accepted
    expect([200, 202, 402]).toContain(response.status);
    
    if (response.status === 400) {
      console.log('❌ BUG CONFIRMED: Request with null mediaType failed');
      console.log('Response:', response.body);
    }
  });

  /**
   * Test Case 3: Omitted mediaType field
   * 
   * Expected on UNFIXED code: HTTP 400 with "Invalid body data"
   * Expected AFTER fix: HTTP 200/202 (success) or 402 (insufficient credits)
   */
  testOrSkip('should accept request with mediaType field omitted', async () => {
    const requestBody = {
      existingCaption: 'Check out this amazing content!',
      postType: 'post',
      platform: 'instagram',
      workspaceId: 'test-workspace-id'
      // mediaType intentionally omitted
    };

    const response = await request(API_BASE_URL)
      .post('/api/v1/ai/generate-content')
      .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
      .send(requestBody);

    // EXPECTED BEHAVIOR (after fix): Request should be accepted
    expect([200, 202, 402]).toContain(response.status);
    
    if (response.status === 400) {
      console.log('❌ BUG CONFIRMED: Request with omitted mediaType failed');
      console.log('Response:', response.body);
    }
  });

  /**
   * Test Case 4: Error message verification
   * 
   * Verify that on unfixed code, the error message contains "Invalid body data"
   * This confirms the bug is a Zod validation issue
   */
  testOrSkip('should return "Invalid body data" error on unfixed code', async () => {
    const requestBody = {
      mediaType: undefined,
      platform: 'instagram'
    };

    const response = await request(API_BASE_URL)
      .post('/api/v1/ai/generate-content')
      .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
      .send(requestBody);

    // On unfixed code, we expect 400 with "Invalid body data"
    if (response.status === 400) {
      expect(response.body.error || '').toContain('Invalid body data');
      console.log('✓ BUG CONDITION CONFIRMED: Zod validation rejects undefined mediaType');
      console.log('Counterexample:', { requestBody, response: response.body });
    } else {
      // If we get here, the bug might already be fixed
      console.log('⚠️ UNEXPECTED: Request was accepted (bug may already be fixed)');
    }
  });

  /**
   * Property-Based Test: All combinations of optional fields
   * 
   * Generates many test cases with different combinations of optional fields
   * to ensure the fix works across all scenarios
   * 
   * **Scoped PBT Approach**: Focus on bug condition (undefined/null/omitted mediaType)
   */
  testOrSkip('PROPERTY: All requests with optional/missing mediaType should be accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary request bodies with optional mediaType
        fc.record({
          mediaUrl: fc.option(fc.webUrl(), { nil: undefined }),
          mediaType: fc.constantFrom(undefined, null), // Bug condition: undefined or null
          postType: fc.option(fc.constantFrom('post', 'story', 'reel'), { nil: undefined }),
          platform: fc.option(fc.constantFrom('instagram', 'facebook', 'twitter'), { nil: undefined }),
          existingCaption: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
          workspaceId: fc.option(fc.uuid(), { nil: undefined })
        }),
        async (requestBody) => {
          const response = await request(API_BASE_URL)
            .post('/api/v1/ai/generate-content')
            .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
            .send(requestBody);

          // EXPECTED BEHAVIOR (after fix): All requests should be accepted
          // Acceptable responses:
          // - 200/202: Success
          // - 402: Insufficient credits (still validates schema)
          // - 404: Workspace not found (still validates schema)
          // - 403: Access denied (still validates schema)
          // NOT acceptable:
          // - 400: Invalid body data (this is the bug!)
          
          if (response.status === 400 && response.body.error?.includes('Invalid body data')) {
            console.log('❌ BUG FOUND - Counterexample:', {
              requestBody,
              response: response.body
            });
          }

          // After fix, this should always pass
          expect(response.status).not.toBe(400);
        }
      ),
      {
        numRuns: 10, // Run 10 test cases to surface counterexamples
        verbose: true
      }
    );
  });

  /**
   * Edge Case: Empty body with optional mediaType
   */
  testOrSkip('should handle minimal request body', async () => {
    const requestBody = {
      platform: 'instagram'
      // All other fields omitted
    };

    const response = await request(API_BASE_URL)
      .post('/api/v1/ai/generate-content')
      .set('Authorization', `Bearer ${TEST_AUTH_TOKEN}`)
      .send(requestBody);

    // Should not fail with "Invalid body data"
    if (response.status === 400) {
      expect(response.body.error).not.toContain('Invalid body data');
    }
  });
});

/**
 * COUNTEREXAMPLE DOCUMENTATION
 * 
 * This section will document counterexamples found during test execution on UNFIXED code.
 * These demonstrate the specific scenarios where the bug manifests.
 * 
 * Expected counterexamples to be found:
 * 
 * 1. Request with `mediaType: undefined`
 *    - Status: 400
 *    - Error: "Invalid body data"
 *    - Root cause: Zod schema fails on undefined despite .optional().nullable()
 * 
 * 2. Request with `mediaType: null`
 *    - Status: 400
 *    - Error: "Invalid body data"
 *    - Root cause: Zod schema fails on null despite .optional().nullable()
 * 
 * 3. Request with mediaType field omitted
 *    - Status: 400
 *    - Error: "Invalid body data"
 *    - Root cause: Zod transform may be called before optional validation
 * 
 * 4. Request with mediaUrl but no mediaType
 *    - Status: 400
 *    - Error: "Invalid body data"
 *    - Root cause: System doesn't infer media type from URL
 * 
 * These counterexamples confirm the root cause hypothesis in the design document.
 */
