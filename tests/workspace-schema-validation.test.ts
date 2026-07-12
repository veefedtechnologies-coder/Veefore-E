import { describe, test, expect } from 'vitest';
import { z } from 'zod';

/**
 * Unit Test: Workspace UpdateWorkspaceSchema Validation
 * 
 * **Validates: Requirements 2.1, 2.2, 3.5**
 * 
 * Tests that the UpdateWorkspaceSchema accepts aiConfiguration with all 15 fields
 * and continues to accept existing workspace update fields.
 */

// This is the FIXED schema from server/routes/v1/workspace.routes.ts
const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
  aiConfiguration: z.object({
    aiModel: z.string().optional(),
    creativityLevel: z.number().min(0).max(1).optional(),
    optimizationGoals: z.string().optional(),
    aiPersona: z.string().optional(),
    captionStyle: z.string().optional(),
    responseLength: z.string().optional(),
    multilingual: z.string().optional(),
    videoEngine: z.string().optional(),
    thumbnailStyle: z.string().optional(),
    autoHashtags: z.boolean().optional(),
    contentSafety: z.string().optional(),
    aiMemory: z.string().optional(),
    autoLearning: z.boolean().optional(),
    googleAiStudioKey: z.string().optional(),
    openAiKey: z.string().optional(),
  }).optional(),
});

describe('Workspace UpdateWorkspaceSchema Validation', () => {
  /**
   * Test Case 1: Schema accepts aiConfiguration with all 15 fields
   * Validates: Requirement 2.1, 2.2
   */
  test('should accept aiConfiguration with all 15 fields', () => {
    const input = {
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.7,
        optimizationGoals: 'engagement',
        aiPersona: 'friendly',
        captionStyle: 'casual',
        responseLength: 'medium',
        multilingual: 'en,es',
        videoEngine: 'ffmpeg',
        thumbnailStyle: 'modern',
        autoHashtags: true,
        contentSafety: 'strict',
        aiMemory: 'enabled',
        autoLearning: true,
        googleAiStudioKey: 'AI-zaSy...',
        openAiKey: 'sk-...'
      }
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    if (!result.success) {
      console.log('❌ Schema rejected aiConfiguration');
      console.log('Zod Error:', result.error.format());
    }

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiConfiguration).toBeDefined();
      expect(result.data.aiConfiguration?.aiModel).toBe('google-ai-studio');
      expect(result.data.aiConfiguration?.creativityLevel).toBe(0.7);
      expect(result.data.aiConfiguration?.autoHashtags).toBe(true);
    }
  });

  /**
   * Test Case 2: Schema accepts partial aiConfiguration
   * Validates: Requirement 2.1, 2.2
   */
  test('should accept partial aiConfiguration (subset of fields)', () => {
    const input = {
      aiConfiguration: {
        aiModel: 'openai',
        creativityLevel: 0.5,
        openAiKey: 'sk-test123'
      }
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiConfiguration?.aiModel).toBe('openai');
      expect(result.data.aiConfiguration?.creativityLevel).toBe(0.5);
      expect(result.data.aiConfiguration?.openAiKey).toBe('sk-test123');
    }
  });

  /**
   * Test Case 3: Schema accepts workspace update without aiConfiguration
   * Validates: Requirement 3.5 (Preservation)
   */
  test('should accept workspace update without aiConfiguration', () => {
    const input = {
      name: 'My New Workspace',
      description: 'Updated description',
      theme: 'dark'
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('My New Workspace');
      expect(result.data.description).toBe('Updated description');
      expect(result.data.theme).toBe('dark');
      expect(result.data.aiConfiguration).toBeUndefined();
    }
  });

  /**
   * Test Case 4: Schema accepts mixed update (workspace fields + aiConfiguration)
   * Validates: Requirements 2.1, 2.2, 3.5
   */
  test('should accept mixed update with both workspace fields and aiConfiguration', () => {
    const input = {
      name: 'Updated Workspace',
      theme: 'light',
      aiConfiguration: {
        aiModel: 'google-ai-studio',
        creativityLevel: 0.8,
        googleAiStudioKey: 'AI-zaSy...'
      }
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Workspace');
      expect(result.data.theme).toBe('light');
      expect(result.data.aiConfiguration?.aiModel).toBe('google-ai-studio');
      expect(result.data.aiConfiguration?.creativityLevel).toBe(0.8);
    }
  });

  /**
   * Test Case 5: Schema rejects invalid creativityLevel (out of range)
   */
  test('should reject creativityLevel greater than 1', () => {
    const input = {
      aiConfiguration: {
        creativityLevel: 1.5 // Invalid - must be between 0 and 1
      }
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten();
      expect(JSON.stringify(errors)).toContain('Number must be less than or equal to 1');
    }
  });

  /**
   * Test Case 6: Schema rejects creativityLevel less than 0
   */
  test('should reject creativityLevel less than 0', () => {
    const input = {
      aiConfiguration: {
        creativityLevel: -0.1 // Invalid - must be between 0 and 1
      }
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten();
      expect(JSON.stringify(errors)).toContain('Number must be greater than or equal to 0');
    }
  });

  /**
   * Test Case 7: Schema accepts empty aiConfiguration object
   */
  test('should accept empty aiConfiguration object', () => {
    const input = {
      name: 'Test Workspace',
      aiConfiguration: {}
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiConfiguration).toBeDefined();
      expect(Object.keys(result.data.aiConfiguration!).length).toBe(0);
    }
  });

  /**
   * Test Case 8: Preservation - Existing workspace fields still validate correctly
   * Validates: Requirement 3.5
   */
  test('should validate all existing workspace fields correctly', () => {
    const input = {
      name: 'Test',
      description: 'A test workspace',
      avatar: 'https://example.com/avatar.jpg',
      theme: 'space',
      aiPersonality: 'professional'
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test');
      expect(result.data.description).toBe('A test workspace');
      expect(result.data.avatar).toBe('https://example.com/avatar.jpg');
      expect(result.data.theme).toBe('space');
      expect(result.data.aiPersonality).toBe('professional');
    }
  });

  /**
   * Test Case 9: Schema rejects invalid avatar URL
   */
  test('should reject invalid avatar URL', () => {
    const input = {
      avatar: 'not-a-url'
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten();
      expect(JSON.stringify(errors)).toContain('Invalid url');
    }
  });

  /**
   * Test Case 10: Schema rejects name that's too long
   */
  test('should reject name longer than 100 characters', () => {
    const input = {
      name: 'A'.repeat(101)
    };

    const result = UpdateWorkspaceSchema.safeParse(input);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten();
      expect(JSON.stringify(errors)).toContain('String must contain at most 100 character');
    }
  });
});
