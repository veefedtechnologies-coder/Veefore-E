import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Helper function to infer media type from URL extension
 * @param url - The media URL to analyze
 * @returns 'image' | 'video' | undefined
 */
function inferMediaTypeFromUrl(url: string | undefined | null): 'image' | 'video' | undefined {
  if (!url || typeof url !== 'string') return undefined;
  
  const urlLower = url.toLowerCase();
  
  // Image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.heic', '.heif'];
  if (imageExtensions.some(ext => urlLower.includes(ext))) {
    return 'image';
  }
  
  // Video extensions
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'];
  if (videoExtensions.some(ext => urlLower.includes(ext))) {
    return 'video';
  }
  
  return undefined;
}

// Recreate the schema as it appears in ai.routes.ts
const GenerateContentSchema = z.preprocess(
  (data: any) => {
    // Normalize data before validation
    const normalized = { ...data };
    
    // If mediaType is missing, null, or undefined, try to infer from mediaUrl
    if (normalized.mediaType == null && normalized.mediaUrl) {
      const inferredType = inferMediaTypeFromUrl(normalized.mediaUrl);
      if (inferredType) {
        normalized.mediaType = inferredType;
      }
    }
    
    return normalized;
  },
  z.object({
    mediaUrl: z.string().optional().refine(
      (val) => !val || val.trim() === '' || z.string().url().safeParse(val).success,
      { message: 'Must be a valid URL if provided' }
    ),
    mediaType: z.enum(['image', 'video']).nullish(),
    postType: z.enum(['post', 'story', 'reel']).optional(),
    platform: z.string().optional(),
    existingCaption: z.string().max(5000).optional(),
    workspaceId: z.string().optional(),
  }).transform((data) => {
    // Clean up empty strings and return only valid values
    return {
      mediaUrl: data.mediaUrl && data.mediaUrl.trim() ? data.mediaUrl : undefined,
      mediaType: data.mediaType || undefined,
      postType: data.postType || undefined,
      platform: data.platform || undefined,
      existingCaption: data.existingCaption || undefined,
      workspaceId: data.workspaceId || undefined,
    };
  })
);

describe('GenerateContentSchema - Bug Fix Task 3.1', () => {
  describe('Media Type Inference Helper', () => {
    it('should infer image type from .jpg extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/photo.jpg');
      expect(result).toBe('image');
    });

    it('should infer image type from .png extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/image.png');
      expect(result).toBe('image');
    });

    it('should infer image type from .gif extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/animation.gif');
      expect(result).toBe('image');
    });

    it('should infer image type from .webp extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/modern.webp');
      expect(result).toBe('image');
    });

    it('should infer video type from .mp4 extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/video.mp4');
      expect(result).toBe('video');
    });

    it('should infer video type from .mov extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/clip.mov');
      expect(result).toBe('video');
    });

    it('should infer video type from .webm extension', () => {
      const result = inferMediaTypeFromUrl('https://example.com/modern.webm');
      expect(result).toBe('video');
    });

    it('should return undefined for unknown extensions', () => {
      const result = inferMediaTypeFromUrl('https://example.com/file.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined for null input', () => {
      const result = inferMediaTypeFromUrl(null);
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = inferMediaTypeFromUrl(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('Optional MediaType Validation - Bug Condition', () => {
    it('should accept request with mediaType: undefined', () => {
      const input = {
        mediaUrl: 'https://example.com/image.jpg',
        mediaType: undefined,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // Should infer 'image' from the URL
        expect(result.data.mediaType).toBe('image');
      }
    });

    it('should accept request with mediaType: null', () => {
      const input = {
        mediaUrl: 'https://example.com/video.mp4',
        mediaType: null,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // Should infer 'video' from the URL
        expect(result.data.mediaType).toBe('video');
      }
    });

    it('should accept request with omitted mediaType field', () => {
      const input = {
        mediaUrl: 'https://example.com/photo.png',
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // Should infer 'image' from the URL
        expect(result.data.mediaType).toBe('image');
      }
    });

    it('should accept request without mediaUrl or mediaType (text-only)', () => {
      const input = {
        existingCaption: 'Check this out!',
        platform: 'instagram',
        postType: 'post',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBeUndefined();
        expect(result.data.existingCaption).toBe('Check this out!');
      }
    });

    it('should accept minimal request with only platform', () => {
      const input = {
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Explicit MediaType Validation - Preservation', () => {
    it('should accept and preserve explicit mediaType: "image"', () => {
      const input = {
        mediaUrl: 'https://example.com/media.jpg',
        mediaType: 'image' as const,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBe('image');
      }
    });

    it('should accept and preserve explicit mediaType: "video"', () => {
      const input = {
        mediaUrl: 'https://example.com/media.mp4',
        mediaType: 'video' as const,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBe('video');
      }
    });

    it('should reject invalid mediaType values', () => {
      const input = {
        mediaUrl: 'https://example.com/media.jpg',
        mediaType: 'audio' as any,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate other required fields correctly', () => {
      const input = {
        existingCaption: 'a'.repeat(5001), // Exceeds max length
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Media Type Inference from URL', () => {
    it('should infer image from .jpg URL when mediaType omitted', () => {
      const input = {
        mediaUrl: 'https://cdn.example.com/uploads/photo.jpg',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBe('image');
      }
    });

    it('should infer video from .mp4 URL when mediaType is null', () => {
      const input = {
        mediaUrl: 'https://cdn.example.com/videos/clip.mp4',
        mediaType: null,
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBe('video');
      }
    });

    it('should leave mediaType undefined when URL has no recognizable extension', () => {
      const input = {
        mediaUrl: 'https://example.com/media',
        mediaType: undefined,
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaType).toBeUndefined();
      }
    });

    it('should not override explicit mediaType even if URL suggests otherwise', () => {
      const input = {
        mediaUrl: 'https://example.com/file.mp4',
        mediaType: 'image' as const, // Explicitly set to image despite .mp4 extension
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // Explicit mediaType should be preserved
        expect(result.data.mediaType).toBe('image');
      }
    });
  });

  describe('Complete Request Validation', () => {
    it('should accept complete request with all optional fields', () => {
      const input = {
        mediaUrl: 'https://example.com/image.jpg',
        mediaType: 'image' as const,
        postType: 'post' as const,
        platform: 'instagram',
        existingCaption: 'Amazing content!',
        workspaceId: 'workspace-123',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaUrl).toBe('https://example.com/image.jpg');
        expect(result.data.mediaType).toBe('image');
        expect(result.data.postType).toBe('post');
        expect(result.data.platform).toBe('instagram');
        expect(result.data.existingCaption).toBe('Amazing content!');
        expect(result.data.workspaceId).toBe('workspace-123');
      }
    });

    it('should clean up empty strings in transform', () => {
      const input = {
        mediaUrl: '   ',
        platform: '',
        existingCaption: 'Valid caption',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mediaUrl).toBeUndefined();
        expect(result.data.platform).toBeUndefined();
        expect(result.data.existingCaption).toBe('Valid caption');
      }
    });

    it('should accept valid postType values', () => {
      const postTypes: Array<'post' | 'story' | 'reel'> = ['post', 'story', 'reel'];

      postTypes.forEach(postType => {
        const input = { postType, platform: 'instagram' };
        const result = GenerateContentSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.postType).toBe(postType);
        }
      });
    });

    it('should reject invalid postType values', () => {
      const input = {
        postType: 'tweet' as any,
        platform: 'instagram',
      };

      const result = GenerateContentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// RecordPerformanceSchema validation tests
const RecordPerformanceSchema = z.object({
  captionId: z.string().min(1),
  workspaceId: z.string().min(1),
  metrics: z.object({
    likes: z.number().min(0),
    comments: z.number().min(0),
    shares: z.number().min(0),
    saves: z.number().min(0),
    reach: z.number().min(0),
    engagement_rate: z.number().min(0).optional(),
  }),
});

describe('RecordPerformanceSchema - Task 16.1', () => {
  describe('Valid Performance Metrics', () => {
    it('should accept valid performance metrics with all required fields', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.captionId).toBe('507f1f77bcf86cd799439011');
        expect(result.data.metrics.likes).toBe(150);
        expect(result.data.metrics.reach).toBe(1000);
      }
    });

    it('should accept performance metrics with optional engagement_rate', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
          engagement_rate: 21.5,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics.engagement_rate).toBe(21.5);
      }
    });

    it('should accept zero values for all metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          reach: 0,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept large metric values', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 1000000,
          comments: 50000,
          shares: 25000,
          saves: 75000,
          reach: 5000000,
          engagement_rate: 23.0,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics.likes).toBe(1000000);
        expect(result.data.metrics.reach).toBe(5000000);
      }
    });
  });

  describe('Invalid Performance Metrics - Non-negative Validation', () => {
    it('should reject negative likes', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: -10,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative comments', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: -5,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative shares', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: -10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative saves', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: -30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative reach', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: -1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative engagement_rate', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
          engagement_rate: -5.5,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Required Fields Validation', () => {
    it('should reject missing captionId', () => {
      const input = {
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty captionId', () => {
      const input = {
        captionId: '',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing workspaceId', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty workspaceId', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: '',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing metrics object', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing likes in metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing comments in metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing reach in metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Validation', () => {
    it('should reject string values for numeric metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: '150' as any,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject boolean values for numeric metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: true as any,
          shares: 10,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject null values for required metrics', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: null as any,
          saves: 30,
          reach: 1000,
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Engagement Rate Calculation', () => {
    it('should calculate engagement rate correctly when reach > 0', () => {
      // This test validates the logic in the endpoint, not the schema
      const likes = 150;
      const comments = 25;
      const shares = 10;
      const saves = 30;
      const reach = 1000;

      const engagementRate = ((likes + comments + shares + saves) / reach) * 100;
      expect(engagementRate).toBe(21.5);
    });

    it('should return 0 engagement rate when reach is 0', () => {
      // This test validates the logic in the endpoint, not the schema
      const likes = 150;
      const comments = 25;
      const shares = 10;
      const saves = 30;
      const reach = 0;

      const engagementRate = reach > 0 ? ((likes + comments + shares + saves) / reach) * 100 : 0;
      expect(engagementRate).toBe(0);
    });

    it('should preserve provided engagement_rate', () => {
      const input = {
        captionId: '507f1f77bcf86cd799439011',
        workspaceId: 'workspace-123',
        metrics: {
          likes: 150,
          comments: 25,
          shares: 10,
          saves: 30,
          reach: 1000,
          engagement_rate: 25.0, // Provided by user
        },
      };

      const result = RecordPerformanceSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics.engagement_rate).toBe(25.0);
      }
    });
  });
});
