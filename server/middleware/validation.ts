/**
 * P1-4.1 SECURITY: Centralized Zod Validation Middleware
 * 
 * Provides secure, type-safe request validation for all API endpoints
 * Prevents injection attacks and ensures data integrity
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { sanitizeHtml, sanitizeText, sanitizeRichText } from './xss-protection';

// Type for validation targets
type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

/**
 * Validation error response type
 */
interface ValidationErrorResponse {
  error: string;
  details: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  timestamp: string;
}

/**
 * P1-4.1: Main validation middleware factory
 */
export function validateRequest(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate each specified schema
      const validationResults: Record<string, any> = {};
      
      // Validate request body
      if (schemas.body) {
        const result = await schemas.body.safeParseAsync(req.body);
        if (!result.success) {
          return handleValidationError(res, result.error, 'body');
        }
        validationResults.body = result.data;
        // Replace req.body with validated and sanitized data
        req.body = result.data;
      }
      
      // Validate query parameters
      if (schemas.query) {
        const result = await schemas.query.safeParseAsync(req.query);
        if (!result.success) {
          return handleValidationError(res, result.error, 'query');
        }
        validationResults.query = result.data;
        req.query = result.data;
      }
      
      // Validate route parameters
      if (schemas.params) {
        const result = await schemas.params.safeParseAsync(req.params);
        if (!result.success) {
          return handleValidationError(res, result.error, 'params');
        }
        validationResults.params = result.data;
        req.params = result.data;
      }
      
      // Validate headers
      if (schemas.headers) {
        const result = await schemas.headers.safeParseAsync(req.headers);
        if (!result.success) {
          return handleValidationError(res, result.error, 'headers');
        }
        validationResults.headers = result.data;
      }
      
      // Store validation results for debugging/logging
      req.validation = validationResults;
      
      console.log(`✅ VALIDATION: ${req.method} ${req.path} - All validations passed`);
      next();
      
    } catch (error) {
      console.error('❌ VALIDATION ERROR:', error);
      res.status(500).json({
        error: 'Internal validation error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * P1-4.1: Handle validation errors with detailed feedback
 */
function handleValidationError(
  res: Response, 
  error: ZodError, 
  target: string
): Response<ValidationErrorResponse> {
  const details = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
  
  console.warn(`🚨 VALIDATION FAILED [${target}]:`, details);
  
  return res.status(400).json({
    error: `Invalid ${target} data`,
    details,
    timestamp: new Date().toISOString()
  });
}

/**
 * P1-4.1: Common validation schemas for reuse
 */

// Workspace ID validation (MongoDB ObjectId)
export const workspaceIdSchema = z.object({
  workspaceId: z.string()
    .min(24, 'Workspace ID must be 24 characters')
    .max(24, 'Workspace ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid workspace ID format')
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'name', 'id']).optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});

// File upload validation
export const fileUploadSchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'document']),
  maxSize: z.number().max(50 * 1024 * 1024), // 50MB max
  allowedMimes: z.array(z.string()).optional()
});

// Instagram validation schemas
export const instagramAccountSchema = z.object({
  accountId: z.string().min(1, 'Instagram account ID is required'),
  username: z.string().min(1).max(30).regex(/^[a-zA-Z0-9._]+$/, 'Invalid username format'),
  workspaceId: workspaceIdSchema.shape.workspaceId
});

/**
 * P1-4.3: XSS-safe validation helpers with automatic sanitization
 */

// XSS-safe string validation with automatic sanitization
export const xssSafeString = (options: { minLength?: number; maxLength?: number; allowHtml?: boolean } = {}) => {
  const { minLength = 0, maxLength = 1000, allowHtml = false } = options;
  
  return z.string()
    .min(minLength)
    .max(maxLength)
    .transform((val) => {
      if (allowHtml) {
        return sanitizeRichText(val);
      }
      return sanitizeText(val);
    });
};

// URL validation with XSS protection
export const xssSafeUrl = z.string()
  .url()
  .transform((val) => {
    // Remove any potential XSS from URLs
    return val.replace(/[<>'"]/g, '');
  });

// Email validation with sanitization
export const xssSafeEmail = z.string()
  .email()
  .transform((val) => sanitizeText(val));

// Social media content validation with XSS protection
export const socialContentSchema = z.object({
  content: xssSafeString({ maxLength: 2200, allowHtml: false }),
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin']),
  mediaUrls: z.array(xssSafeUrl).optional(),
  hashtags: z.array(xssSafeString({ maxLength: 100 })).optional(),
  mentions: z.array(xssSafeString({ maxLength: 50 })).optional()
});

// User profile validation with XSS protection
export const userProfileSchema = z.object({
  displayName: xssSafeString({ minLength: 1, maxLength: 100 }),
  bio: xssSafeString({ maxLength: 500, allowHtml: true }),
  website: xssSafeUrl.optional(),
  location: xssSafeString({ maxLength: 100 }).optional()
});

// Authentication schemas
export const authLoginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(255),
  rememberMe: z.boolean().default(false)
});

export const authRegisterSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(255)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  displayName: z.string().min(1).max(100).optional()
});

// Social media content schemas
export const contentCreateSchema = z.object({
  type: z.enum(['post', 'story', 'reel', 'video']),
  title: z.string().min(1).max(200),
  description: z.string().max(2200).optional(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'youtube'])),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string().max(50)).max(30).optional(),
  media: z.array(z.object({
    type: z.enum(['image', 'video']),
    url: z.string().url(),
    alt: z.string().max(200).optional()
  })).max(10).optional()
});

// AI generation schemas
export const aiGenerationSchema = z.object({
  prompt: z.string().min(10).max(1000),
  type: z.enum(['text', 'image', 'video', 'hashtags', 'caption']),
  style: z.string().max(50).optional(),
  tone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous']).optional(),
  language: z.string().length(2).default('en'), // ISO 639-1 codes
  parameters: z.record(z.unknown()).optional()
});

// Analytics query schemas
export const analyticsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  days: z.coerce.number().min(1).max(365).default(30),
  metrics: z.array(z.enum(['followers', 'engagement', 'reach', 'impressions', 'clicks'])).optional(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'youtube'])).optional()
});

/**
 * P1-4.1: Safe JSON parsing with validation
 */
export function safeJsonParse<T>(
  input: string, 
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(input);
    const result = schema.safeParse(parsed);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { 
        success: false, 
        error: `JSON validation failed: ${result.error.errors.map(e => e.message).join(', ')}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * P1-4.1: Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  // Basic HTML sanitization - remove script tags and dangerous attributes
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
}

/**
 * P1-4.1: Request validation helper for manual validation
 */
export async function validateRequestData<T>(
  data: unknown,
  schema: ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; errors: ZodError }> {
  const result = await schema.safeParseAsync(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * P1-4.1: Validation middleware for specific common patterns
 */

// Workspace access validation
export const validateWorkspaceAccess = validateRequest({
  query: workspaceIdSchema.or(z.object({
    workspaceId: workspaceIdSchema.shape.workspaceId
  })),
  params: z.object({
    workspaceId: workspaceIdSchema.shape.workspaceId.optional()
  }).optional()
});

// Pagination validation
export const validatePagination = validateRequest({
  query: paginationSchema.partial()
});

// File upload validation  
export const validateFileUpload = validateRequest({
  body: fileUploadSchema
});

// Authentication validation
export const validateLogin = validateRequest({
  body: authLoginSchema
});

export const validateRegister = validateRequest({
  body: authRegisterSchema
});

// Content creation validation
export const validateContentCreation = validateRequest({
  body: contentCreateSchema
});

// AI generation validation
export const validateAIGeneration = validateRequest({
  body: aiGenerationSchema
});

// Analytics validation
export const validateAnalyticsQuery = validateRequest({
  query: analyticsQuerySchema.merge(workspaceIdSchema).partial()
});

/**
 * P1-4.1: Validation health check
 */
export function validateMiddlewareHealth(): {
  status: 'healthy' | 'degraded';
  checks: Record<string, boolean>;
} {
  const checks = {
    zodAvailable: typeof z !== 'undefined',
    schemasLoaded: typeof workspaceIdSchema !== 'undefined',
    middlewareReady: typeof validateRequest === 'function'
  };
  
  const allHealthy = Object.values(checks).every(check => check);
  
  return {
    status: allHealthy ? 'healthy' : 'degraded',
    checks
  };
}