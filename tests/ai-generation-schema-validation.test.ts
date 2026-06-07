import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';

/**
 * Unit Test: Zod Schema Validation for GenerateContentSchema
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * **Property 1: Bug Condition** - Optional MediaType Validation Failure
 * 
 * **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * This test directly validates the Zod schema without needing a running server.
 * It tests the CURRENT schema (unfixed) to demonstrate the validation bug.
 * 
 * IMPORTANT: JSON.parse() does NOT preserve undefined values!
 * When Express parses JSON body, { mediaType: undefined } becomes omitted field
 * This test simulates real Express behavior by parsing JSON strings
 */

// This is the CURRENT (UNFIXED) schema from server/routes/v1/ai.routes.ts
const GenerateContentSchemaUnfixed = z.object({
  mediaUrl: z.string().url().optional().nullable(),
  mediaType: z.enum(['image', 'video']).optional().nullable(),
  postType: z.enum(['post', 'story', 'reel']).optional().nullable(),
  platform: z.string().optional().nullable(),
  existingCaption: z.string().max(5000).optional().nullable(),
  workspaceId: z.string().optional().nullable(),
}).transform((data) => {
  // Clean up null/undefined values
  return {
    ...data,
    mediaUrl: data.mediaUrl || undefined,
    mediaType: data.mediaType || undefined,
    postType: data.postType || undefined,
    platform: data.platform || undefined,
    existingCaption: data.existingCaption || undefined,
    workspaceId: data.workspaceId || undefined,
  };
});

/**
 * Helper: Simulate Express JSON body parsing
 * Express parses JSON and undefined values become omitted
 */
function simulateExpressBody(obj: any): any {
  // JSON.parse(JSON.stringify()) removes undefined values
  // This is what Express actually does
  return JSON.parse(JSON.stringify(obj));
}

describe('Zod Schema Validation - Bug Condition Exploration', () => {
  /**
   * Test Case 1: Explicit undefined mediaType (JavaScript object)
   * 
   * NOTE: When sent via HTTP JSON, undefined is stripped out
   * This test shows that JavaScript objects with undefined work fine
   */
  test('should accept JavaScript object with mediaType: undefined', () => {
    const input = {
      mediaUrl: 'https://example.com/image.jpg',
      mediaType: undefined,
      platform: 'instagram'
    };

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    if (!result.success) {
      console.log('❌ BUG CONFIRMED: Schema rejects undefined mediaType');
      console.log('Zod Error:', result.error.format());
    }

    // This should pass because Zod handles undefined correctly
    expect(result.success).toBe(true);
  });

  /**
   * Test Case 2: Explicit null mediaType (via JSON)
   * 
   * NULL values ARE preserved in JSON, so this tests the real bug condition
   */
  test('should accept JSON-parsed object with mediaType: null', () => {
    // Simulate what Express receives when client sends { mediaType: null }
    const jsonString = '{"mediaUrl":"https://example.com/video.mp4","mediaType":null,"platform":"instagram"}';
    const input = JSON.parse(jsonString);

    console.log('Input after JSON.parse:', input);
    console.log('mediaType value:', input.mediaType, 'type:', typeof input.mediaType);

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    if (!result.success) {
      console.log('❌ BUG CONFIRMED: Schema rejects null mediaType from JSON');
      console.log('Zod Error:', result.error.format());
      console.log('Error details:', result.error.issues);
    }

    // EXPECTED BEHAVIOR after fix: this should succeed
    expect(result.success).toBe(true);
  });

  /**
   * Test Case 3: Omitted mediaType field (via JSON)
   * 
   * When mediaType is omitted from JSON, it becomes undefined after parsing
   */
  test('should accept JSON-parsed object with mediaType field omitted', () => {
    const jsonString = '{"existingCaption":"Check this out!","platform":"instagram"}';
    const input = JSON.parse(jsonString);

    console.log('Input after JSON.parse:', input);
    console.log('Has mediaType?', 'mediaType' in input);

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    if (!result.success) {
      console.log('❌ BUG CONFIRMED: Schema rejects omitted mediaType');
      console.log('Zod Error:', result.error.format());
    }

    expect(result.success).toBe(true);
  });

  /**
   * Test Case 4: Invalid mediaType value (should still fail after fix)
   */
  test('should reject invalid mediaType values', () => {
    const input = {
      mediaType: 'audio', // Invalid - only 'image' or 'video' allowed
      platform: 'instagram'
    };

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    // This SHOULD fail both before and after the fix
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    }
  });

  /**
   * Test Case 5: Valid explicit mediaType (should always pass)
   */
  test('should accept valid explicit mediaType: "image"', () => {
    const input = {
      mediaUrl: 'https://example.com/image.jpg',
      mediaType: 'image' as const,
      platform: 'instagram'
    };

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    // This should ALWAYS pass (preservation requirement)
    expect(result.success).toBe(true);
  });

  test('should accept valid explicit mediaType: "video"', () => {
    const input = {
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video' as const,
      platform: 'instagram'
    };

    const result = GenerateContentSchemaUnfixed.safeParse(input);
    
    // This should ALWAYS pass (preservation requirement)
    expect(result.success).toBe(true);
  });

  /**
   * Property-Based Test: Generate many test cases with optional mediaType
   */
  test('PROPERTY: Schema should accept all valid inputs with optional/missing mediaType', () => {
    fc.assert(
      fc.property(
        fc.record({
          mediaUrl: fc.option(fc.webUrl(), { nil: undefined }),
          mediaType: fc.constantFrom(undefined, null), // Bug condition
          postType: fc.option(fc.constantFrom('post', 'story', 'reel' as const), { nil: undefined }),
          platform: fc.option(fc.constantFrom('instagram', 'facebook', 'twitter'), { nil: undefined }),
          existingCaption: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
          workspaceId: fc.option(fc.uuid(), { nil: undefined })
        }),
        (input) => {
          const result = GenerateContentSchemaUnfixed.safeParse(input);
          
          if (!result.success) {
            console.log('❌ Property test found counterexample:');
            console.log('Input:', JSON.stringify(input, null, 2));
            console.log('Error:', result.error.issues);
          }

          // After fix, all these should parse successfully
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property-Based Test: Valid explicit mediaTypes should always pass
   */
  test('PRESERVATION: Schema should accept all inputs with explicit valid mediaType', () => {
    fc.assert(
      fc.property(
        fc.record({
          mediaUrl: fc.option(fc.webUrl(), { nil: undefined }),
          mediaType: fc.constantFrom('image', 'video' as const), // Valid explicit values
          postType: fc.option(fc.constantFrom('post', 'story', 'reel' as const), { nil: undefined }),
          platform: fc.option(fc.constantFrom('instagram', 'facebook', 'twitter'), { nil: undefined }),
          existingCaption: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
          workspaceId: fc.option(fc.uuid(), { nil: undefined })
        }),
        (input) => {
          const result = GenerateContentSchemaUnfixed.safeParse(input);
          
          // These should ALWAYS pass (preservation requirement)
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.mediaType).toBe(input.mediaType);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * COUNTEREXAMPLE DOCUMENTATION
 * 
 * When these tests are run on UNFIXED code, they will document:
 * 
 * 1. Exact Zod error messages
 * 2. Input payloads that trigger the bug
 * 3. Whether the bug is in:
 *    - The .optional().nullable() chain
 *    - The .transform() function
 *    - The enum validation
 * 
 * Expected findings:
 * - Zod may reject `undefined` before reaching transform
 * - The transform may be processing null/undefined incorrectly
 * - The enum validation may not handle optional values properly
 * 
 * This will confirm the root cause hypothesis in the design document.
 */
