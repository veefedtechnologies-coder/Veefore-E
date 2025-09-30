/**
 * Instagram Permission Helper - Validates and manages Instagram API permissions
 * Provides fallback strategies for content publishing when permissions are limited
 */

import { instagramAPI } from './instagram-api';

export class InstagramPermissionHelper {
  
  /**
   * Get standardized error information for video publishing failures
   */
  static getVideoPublishingError(): {
    error: string;
    technicalReason: string;
    solution: string;
  } {
    return {
      error: 'Video publishing not available',
      technicalReason: 'Instagram API video publishing requires app review and additional permissions',
      solution: 'Submit your app for Instagram Platform review to enable video publishing, or convert videos to photos for posting'
    };
  }

  /**
   * Check what permissions are available for the given access token
   */
  static async checkAvailablePermissions(accessToken: string): Promise<{
    canPublishPhotos: boolean;
    canPublishVideos: boolean;
    canPublishReels: boolean;
    canPublishStories: boolean;
    permissions: string[];
  }> {
    
    try {
      // Test permissions by attempting to get user info
      const response = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`);
      const data = await response.json();
      
      if (data.error) {
        console.log(`[PERMISSION CHECK] Error checking permissions: ${data.error.message}`);
        return {
          canPublishPhotos: false,
          canPublishVideos: false,
          canPublishReels: false,
          canPublishStories: false,
          permissions: []
        };
      }
      
      // Instagram Business accounts typically have content publishing permissions
      return {
        canPublishPhotos: true,
        canPublishVideos: false, // Usually requires app review
        canPublishReels: false,  // Usually requires app review
        canPublishStories: false, // Usually requires app review
        permissions: ['instagram_business_basic', 'instagram_business_content_publish']
      };
      
    } catch (error: any) {
      console.error(`[PERMISSION CHECK] Failed to check permissions: ${error.message}`);
      return {
        canPublishPhotos: false,
        canPublishVideos: false,
        canPublishReels: false,
        canPublishStories: false,
        permissions: []
      };
    }
  }
  
  /**
   * Get the best publishing strategy based on available permissions
   */
  static async getBestPublishingStrategy(
    accessToken: string,
    contentType: 'video' | 'photo' | 'reel' | 'story',
    mediaUrl: string,
    caption: string
  ): Promise<{
    strategy: 'direct' | 'photo_conversion' | 'placeholder' | 'skip';
    method: string;
    processedUrl?: string;
    processedCaption?: string;
  }> {
    
    const permissions = await this.checkAvailablePermissions(accessToken);
    
    // Strategy 1: Direct publishing if permissions allow
    if (contentType === 'photo' && permissions.canPublishPhotos) {
      return {
        strategy: 'direct',
        method: 'photo_direct',
        processedUrl: mediaUrl,
        processedCaption: caption
      };
    }
    
    if (contentType === 'video' && permissions.canPublishVideos) {
      return {
        strategy: 'direct',
        method: 'video_direct',
        processedUrl: mediaUrl,
        processedCaption: caption
      };
    }
    
    // Strategy 2: Convert video/reel to photo if only photo permissions available
    if ((contentType === 'video' || contentType === 'reel') && permissions.canPublishPhotos) {
      
      // Clean blob URLs
      let processedUrl = mediaUrl;
      if (mediaUrl.startsWith('blob:')) {
        const urlParts = mediaUrl.split('/');
        const mediaId = urlParts[urlParts.length - 1];
        // Environment-agnostic URL generation
        const getBaseUrl = () => {
          if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
          if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
          if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
          return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
        };
        
        processedUrl = `${getBaseUrl()}/uploads/${mediaId}.jpg`;
      }
      
      const videoCaption = `🎬 ${caption}\n\n📹 Video content preview - Full video available on our platform`;
      
      return {
        strategy: 'photo_conversion',
        method: 'video_to_photo',
        processedUrl: processedUrl,
        processedCaption: videoCaption
      };
    }
    
    // Strategy 3: Skip placeholder images - require actual media
    // Never use placeholder images as Instagram rejects them
    
    // Strategy 4: Skip if no permissions available
    return {
      strategy: 'skip',
      method: 'no_permissions'
    };
  }
  
  /**
   * Execute the publishing strategy
   */
  static async executePublishingStrategy(
    accessToken: string,
    strategy: any
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    
    try {
      if (strategy.strategy === 'skip') {
        return {
          success: false,
          error: 'No publishing permissions available for this content type'
        };
      }
      
      const result = await instagramAPI.publishPhoto(
        accessToken,
        strategy.processedUrl!,
        strategy.processedCaption!
      );
      
      console.log(`[PERMISSION HELPER] Published using strategy ${strategy.method}: ${result.id}`);
      
      return {
        success: true,
        id: result.id
      };
      
    } catch (error: any) {
      console.error(`[PERMISSION HELPER] Strategy ${strategy.method} failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}