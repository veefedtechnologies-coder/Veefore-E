/**
 * P1-4.2 SECURITY: Content creation and AI response validation schemas
 * 
 * Secure validation for content creation, AI responses, and social media operations
 */

import { z } from 'zod';

// AI response validation
export const aiResponseSchema = z.object({
  content: z.string().max(10000, 'AI response too long'),
  type: z.enum(['text', 'json', 'markdown']).optional(),
  tokens: z.number().min(0).optional(),
  model: z.string().optional(),
  timestamp: z.number().optional(),
  reasoning: z.string().max(2000).optional(),
  suggestions: z.array(z.string().max(500)).max(10).optional()
});

// Content creation validation
export const contentCreationSchema = z.object({
  type: z.enum(['post', 'story', 'reel', 'carousel']),
  text: z.string().max(2200, 'Content text too long'), // Instagram limit
  media: z.array(z.object({
    type: z.enum(['image', 'video']),
    url: z.string().url('Invalid media URL'),
    thumbnail: z.string().url().optional(),
    duration: z.number().min(0).max(60).optional() // For videos
  })).max(10),
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'youtube']),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string().max(30)).max(30).optional(),
  location: z.object({
    name: z.string().max(100),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  }).optional()
});

// Social media account data validation
export const socialAccountDataSchema = z.object({
  accounts: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid account ID')).max(10),
  includeMetrics: z.boolean().default(true),
  includeMedia: z.boolean().default(false),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional()
});

// Instagram data validation
export const instagramDataSchema = z.object({
  username: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_.]+$/, 'Invalid Instagram username'),
  followers: z.number().min(0).max(1000000000),
  following: z.number().min(0).max(100000),
  posts: z.number().min(0).max(50000),
  engagement_rate: z.number().min(0).max(100),
  profile_picture: z.string().url().optional(),
  bio: z.string().max(150).optional(),
  verified: z.boolean().default(false)
});

// Analytics query validation
export const analyticsQuerySchema = z.object({
  metrics: z.array(z.enum([
    'followers', 'following', 'posts', 'likes', 'comments', 
    'shares', 'saves', 'reach', 'impressions', 'engagement_rate'
  ])).min(1).max(10),
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  breakdown: z.enum(['day', 'week', 'month']).optional(),
  compare_previous: z.boolean().default(false)
});

// Automation rule validation
export const automationRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.object({
    type: z.enum(['comment', 'dm', 'mention', 'hashtag', 'keyword']),
    keywords: z.array(z.string().max(100)).max(50),
    platforms: z.array(z.enum(['instagram', 'facebook', 'twitter'])).min(1)
  }),
  action: z.object({
    type: z.enum(['reply', 'dm', 'like', 'follow', 'save']),
    response: z.string().max(2000).optional(),
    delay: z.number().min(0).max(3600).default(30) // seconds
  }),
  isActive: z.boolean().default(true),
  maxExecutions: z.number().min(1).max(1000).default(100)
});

// File upload validation
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().regex(/^(image|video)\//),
  size: z.number().min(1).max(100 * 1024 * 1024), // 100MB max
  encoding: z.string().optional()
});

// Webhook validation
export const webhookDataSchema = z.object({
  source: z.enum(['instagram', 'facebook', 'twitter', 'youtube']),
  event_type: z.string().max(50),
  timestamp: z.number(),
  data: z.record(z.unknown()),
  signature: z.string().optional()
});

// Search and filtering validation
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(200),
  filters: z.object({
    platform: z.array(z.enum(['instagram', 'facebook', 'twitter', 'linkedin'])).optional(),
    date_range: z.object({
      start: z.string().datetime(),
      end: z.string().datetime()
    }).optional(),
    content_type: z.array(z.enum(['post', 'story', 'reel', 'video'])).optional()
  }).optional(),
  sort: z.object({
    field: z.enum(['date', 'engagement', 'reach', 'likes']),
    order: z.enum(['asc', 'desc']).default('desc')
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

// Bulk operations validation
export const bulkOperationSchema = z.object({
  operation: z.enum(['delete', 'update', 'archive', 'publish']),
  items: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1).max(100),
  options: z.record(z.unknown()).optional()
});

// Export/import validation
export const exportRequestSchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx']),
  data_types: z.array(z.enum(['posts', 'analytics', 'accounts', 'automation'])).min(1),
  date_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional(),
  include_media: z.boolean().default(false)
});

// Notification preferences validation
export const notificationPreferencesSchema = z.object({
  email: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(['immediate', 'daily', 'weekly']).default('daily'),
    types: z.array(z.enum(['mentions', 'comments', 'followers', 'analytics'])).default(['mentions'])
  }),
  push: z.object({
    enabled: z.boolean().default(false),
    types: z.array(z.enum(['mentions', 'comments', 'dm'])).default([])
  }),
  in_app: z.object({
    enabled: z.boolean().default(true),
    types: z.array(z.enum(['all', 'mentions', 'comments', 'system'])).default(['all'])
  })
});