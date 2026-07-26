/**
 * P1-4.1 SECURITY: Authentication-specific validation schemas
 * 
 * Secure validation schemas for authentication endpoints
 */

import { z } from 'zod';

// Email verification code validation
export const verifyEmailSchema = z.object({
  code: z.string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain only numbers')
});

// CSRF token validation
export const csrfValidationSchema = z.object({
  csrfToken: z.string()
    .min(32, 'Invalid CSRF token format')
    .max(128, 'Invalid CSRF token format')
});

// User profile update validation
export const profileUpdateSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(100, 'Display name too long')
    .optional(),
  avatar: z.string()
    .url('Invalid avatar URL')
    .optional(),
  preferences: z.record(z.unknown()).optional(),
  businessName: z.string().max(200).optional(),
  niche: z.string().max(100).optional(),
  targetAudience: z.string().max(500).optional()
});

// Onboarding data validation
export const onboardingSchema = z.object({
  step: z.number().min(1).max(10),
  data: z.object({
    businessName: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    niche: z.array(z.string().max(50)).max(5).optional(),
    brandTone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous']).optional(),
    goals: z.object({
      primary: z.enum(['brand-awareness', 'lead-generation', 'sales', 'engagement', 'traffic']),
      followers: z.number().min(0).max(1000000).optional(),
      engagement: z.number().min(0).max(100).optional(),
      timeline: z.enum(['1-month', '3-months', '6-months', '1-year']).optional()
    }).optional()
  })
});

// Security-focused user input validation
export const secureUserInputSchema = z.object({
  // Prevent common injection patterns
  input: z.string()
    .max(2000, 'Input too long')
    .refine(
      (val) => !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(val),
      'Script tags not allowed'
    )
    .refine(
      (val) => !/javascript:/gi.test(val),
      'JavaScript URLs not allowed'
    )
    .refine(
      (val) => !/on\w+\s*=/gi.test(val),
      'Event handlers not allowed'
    )
});

// Email validation with additional security
export const secureEmailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .refine(
    (email) => {
      // Additional email security checks
      const domain = email.split('@')[1];
      return domain && domain.length > 2 && !domain.includes('..');
    },
    'Invalid email domain'
  );

export const firebaseUidSchema = z.string()
  .min(28, 'Invalid Firebase UID format')
  .max(128, 'Invalid Firebase UID format')
  .regex(/^[a-zA-Z0-9]+$/, 'Firebase UID contains invalid characters');