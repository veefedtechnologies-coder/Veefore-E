/**
 * P1-4.1 SECURITY: User-specific validation schemas
 * 
 * Secure validation for user profile, onboarding, and management endpoints
 */

import { z } from 'zod';

// User onboarding validation
export const userOnboardingSchema = z.object({
  step: z.number().min(1).max(10),
  data: z.object({
    businessName: z.string()
      .min(1, 'Business name is required')
      .max(200, 'Business name too long')
      .optional(),
    description: z.string()
      .max(1000, 'Description too long')
      .optional(),
    niche: z.array(z.string().max(50)).max(5, 'Too many niches selected').optional(),
    brandTone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous']).optional(),
    goals: z.object({
      primary: z.enum(['brand-awareness', 'lead-generation', 'sales', 'engagement', 'traffic']),
      followers: z.number().min(0).max(1000000).optional(),
      engagement: z.number().min(0).max(100).optional(),
      timeline: z.enum(['1-month', '3-months', '6-months', '1-year']).optional()
    }).optional(),
    preferences: z.record(z.unknown()).optional()
  })
});

// Complete onboarding validation
export const completeOnboardingSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  niches: z.array(z.string().max(50)).max(5).optional(),
  brandTone: z.enum(['professional', 'casual', 'friendly', 'formal', 'humorous']).optional(),
  goals: z.object({
    primary: z.enum(['brand-awareness', 'lead-generation', 'sales', 'engagement', 'traffic']),
    followers: z.number().min(0).max(1000000).optional(),
    engagement: z.number().min(0).max(100).optional(),
    timeline: z.enum(['1-month', '3-months', '6-months', '1-year']).optional()
  }).optional(),
  preferences: z.record(z.unknown()).optional()
});

// User profile update validation
export const userProfileUpdateSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(100, 'Display name too long')
    .optional(),
  avatar: z.string()
    .url('Invalid avatar URL')
    .max(500, 'Avatar URL too long')
    .optional(),
  businessName: z.string().max(200).optional(),
  niche: z.string().max(100).optional(),
  targetAudience: z.string().max(500).optional(),
  preferences: z.record(z.unknown()).optional()
});

// User cleanup data validation
export const userCleanupSchema = z.object({
  confirmCleanup: z.boolean().refine(val => val === true, 'Cleanup confirmation required'),
  dataTypes: z.array(z.enum(['posts', 'analytics', 'integrations', 'all'])).min(1).optional()
});

// Admin user operations validation
export const adminUserUpgradeSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  plan: z.enum(['free', 'starter', 'pro', 'business', 'agency']),
  credits: z.number().min(0).max(10000).optional(),
  reason: z.string().max(500).optional()
});

// Test user creation validation (debug endpoint)
export const testUserCreationSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Invalid username format'),
  displayName: z.string().min(1).max(100).optional(),
  plan: z.enum(['free', 'starter', 'pro', 'business', 'agency']).default('free'),
  credits: z.number().min(0).max(1000).default(50)
});

// User status lookup validation
export const userStatusLookupSchema = z.object({
  email: z.string().email('Invalid email format')
});

// Workspace validation for user operations
export const userWorkspaceSchema = z.object({
  workspaceId: z.string()
    .min(24, 'Workspace ID must be 24 characters')
    .max(24, 'Workspace ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid workspace ID format')
});

// User preferences validation
export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('light'),
  language: z.string().length(2).default('en'), // ISO 639-1 codes
  timezone: z.string().max(50).optional(),
  notifications: z.object({
    email: z.boolean().default(true),
    browser: z.boolean().default(true),
    marketing: z.boolean().default(false)
  }).optional(),
  privacy: z.object({
    profileVisible: z.boolean().default(true),
    analyticsSharing: z.boolean().default(false)
  }).optional()
});