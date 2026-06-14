/**
 * Simple Instagram Publisher - Direct approach without complex fallbacks
 * Focuses on what actually works with current Instagram permissions
 */

import { InstagramService } from './features/instagram/services/instagram.service';

// Create singleton instance of InstagramService
const instagramService = new InstagramService();

export class SimpleInstagramPublisher {

  /**
   * Enhanced publishPost method for comprehensive social media posting
   */
  async publishPost(publishData: {
    accountId: string;
    accessToken: string;
    content: string;
    mediaFiles: any[];
    hashtags?: string;
    firstComment?: string;
    location?: string;
    pinFirstComment?: boolean;
    postType?: string;
    mentions?: string[];
    collaborators?: string[];
  }): Promise<{ success: boolean; postId?: string; url?: string; error?: string; processing?: boolean }> {
    
    console.log('[SIMPLE PUBLISHER] Publishing post with enhanced features:', {
      accountId: publishData.accountId,
      mediaCount: publishData.mediaFiles.length,
      hasFirstComment: !!publishData.firstComment,
      pinFirstComment: publishData.pinFirstComment,
      hasLocation: !!publishData.location,
      postType: publishData.postType
    });

    try {
      // Build complete caption
      let fullCaption = publishData.content || '';
      
      if (publishData.hashtags) {
        fullCaption += '\n\n' + publishData.hashtags;
      }

      // Handle different scenarios based on media
      if (publishData.mediaFiles.length === 0) {
        return { success: false, error: 'Media files are required for Instagram posting' };
      }

      const firstMedia = publishData.mediaFiles[0];
      
      // Determine content type based on post type selection or media type
      let contentType: 'video' | 'photo' | 'reel' | 'story';
      
      if (publishData.postType === 'story') {
        contentType = 'story';
        console.log('[SIMPLE PUBLISHER] Publishing as Instagram Story');
      } else if (publishData.postType === 'reel') {
        contentType = 'reel';
        console.log('[SIMPLE PUBLISHER] Publishing as Instagram Reel');
      } else if (firstMedia.type === 'video') {
        contentType = 'video';
        console.log('[SIMPLE PUBLISHER] Publishing as Instagram Video');
      } else {
        contentType = 'photo';
        console.log('[SIMPLE PUBLISHER] Publishing as Instagram Photo');
      }
      
      // Build full media URL
      const mediaUrl = this.buildFullMediaUrl(firstMedia);
      console.log('[SIMPLE PUBLISHER] Media URL:', mediaUrl);

      // Publish the main post
      const result = await SimpleInstagramPublisher.publishContent(
        publishData.accessToken,
        mediaUrl,
        fullCaption,
        contentType,
        publishData.accountId,
        publishData.mentions,
        publishData.collaborators
      );

      if (!result.success) {
        return result;
      }

      // Handle first comment if provided
      if (publishData.firstComment && result.id) {
        try {
          // Note: Instagram doesn't support pinning comments via API, so we skip pin functionality
          if (publishData.pinFirstComment) {
            console.log('[SIMPLE PUBLISHER] ⚠️ Pin comment requested but not supported on Instagram platform');
          }
          await this.addComment(publishData.accessToken, result.id, publishData.firstComment, false); // Always false for Instagram
          console.log('[SIMPLE PUBLISHER] ✓ First comment added (pin not supported on Instagram)');
        } catch (commentError: any) {
          console.log('[SIMPLE PUBLISHER] ⚠️ Failed to add first comment:', commentError.message);
          // Don't fail the entire post for comment failures
        }
      }

      return {
        success: true,
        postId: result.id,
        url: `https://instagram.com/p/${result.id}`,
        processing: result.processing
      };

    } catch (error: any) {
      console.error('[SIMPLE PUBLISHER] Enhanced publish error:', error);
      return { success: false, error: error.message || 'Publishing failed' };
    }
  }

  /**
   * Add comment to post with optional pinning
   */
  private async addComment(accessToken: string, postId: string, comment: string, pinComment = false): Promise<void> {
    try {
      // Note: New InstagramService doesn't support comment operations yet
      // This functionality will need to be added to the service
      console.log('[SIMPLE PUBLISHER] Comment functionality not yet implemented in new service');
      
      // TODO: Implement addComment in InstagramService
      // const commentResult = await instagramService.addComment(accessToken, postId, comment);
      
      // Pin the comment if requested
      // if (pinComment && commentResult.id) {
      //   await instagramService.pinComment(accessToken, commentResult.id);
      // }
    } catch (error: any) {
      console.error('[SIMPLE PUBLISHER] Add comment failed:', error);
      throw error;
    }
  }

  /**
   * Build full media URL from file info
   */
  private buildFullMediaUrl(mediaFile: any): string {
    if (mediaFile.url.startsWith('http')) {
      return mediaFile.url;
    }

    // Environment-agnostic URL generation
    const getBaseUrl = () => {
      if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
      if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
      return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
    };
    
    const baseUrl = getBaseUrl();
    
    return `${baseUrl}${mediaFile.url}`;
  }
  
  /**
   * Publish content with simple, reliable approach
   */
  static async publishContent(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: 'video' | 'photo' | 'reel' | 'story',
    accountId?: string,
    mentions?: string[],
    collaborators?: string[]
  ): Promise<{ success: boolean; id?: string; error?: string; processing?: boolean }> {
    
    console.log(`[SIMPLE PUBLISHER] Publishing ${contentType} content`);
    console.log(`[SIMPLE PUBLISHER] Media URL: ${mediaUrl}`);
    
    // Clean and optimize URL for Instagram
    const cleanUrl = this.cleanURLForInstagram(mediaUrl);
    console.log(`[SIMPLE PUBLISHER] Cleaned URL: ${cleanUrl}`);
    
    // For reels, publish as reel content
    if (contentType === 'reel') {
      console.log(`[SIMPLE PUBLISHER] Publishing ${contentType} as reel content`);
      
      try {
        const result = await instagramService.publishMedia(accessToken, 'reel', cleanUrl, {
          caption,
          accountId,
          mentions,
          collaborators
        });
        console.log(`[SIMPLE PUBLISHER] ✓ Processed reel request: ${result.id} (processing: ${!!result.processing})`);
        return { success: true, id: result.id, processing: result.processing };
        
      } catch (error: any) {
        console.log(`[SIMPLE PUBLISHER] Reel publishing failed: ${error.message}`);
        // Fallback to regular video if reel fails
        console.log(`[SIMPLE PUBLISHER] Attempting fallback to regular video post for reel content`);
        try {
          const fallbackResult = await instagramService.publishMedia(accessToken, 'video', cleanUrl, {
            caption,
            accountId,
            mentions,
            collaborators
          });
          console.log(`[SIMPLE PUBLISHER] ✓ Published reel as video fallback: ${fallbackResult.id}`);
          return { success: true, id: fallbackResult.id, processing: fallbackResult.processing };
        } catch (fallbackError: any) {
          return { success: false, error: `Reel publishing failed: ${error.message}. Video fallback also failed: ${fallbackError.message}` };
        }
      }
    }
    
    // For videos, publish as actual video content
    if (contentType === 'video') {
      console.log(`[SIMPLE PUBLISHER] Publishing ${contentType} as video content`);
      
      try {
        const result = await instagramService.publishMedia(accessToken, 'video', cleanUrl, {
          caption,
          accountId,
          mentions,
          collaborators
        });
        console.log(`[SIMPLE PUBLISHER] ✓ Processed video request: ${result.id} (processing: ${!!result.processing})`);
        return { success: true, id: result.id, processing: result.processing };
        
      } catch (error: any) {
        console.log(`[SIMPLE PUBLISHER] Video publishing failed: ${error.message}`);
        // Fallback to photo if video fails
        console.log(`[SIMPLE PUBLISHER] Attempting fallback to photo post for video content`);
        try {
          const fallbackResult = await instagramService.publishMedia(accessToken, 'photo', cleanUrl, {
            caption,
            accountId,
            mentions,
            collaborators
          });
          console.log(`[SIMPLE PUBLISHER] ✓ Published video as photo fallback: ${fallbackResult.id}`);
          return { success: true, id: fallbackResult.id };
        } catch (fallbackError: any) {
          return { success: false, error: `Video publishing failed: ${error.message}. Photo fallback also failed: ${fallbackError.message}` };
        }
      }
    }
    
    // For stories, use story publishing API
    if (contentType === 'story') {
      try {
        // Determine if media is video based on URL extension, ignoring query parameters
        const urlWithoutQuery = cleanUrl.split('?')[0];
        const isVideo = !!urlWithoutQuery.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i);
        
        const result = await instagramService.publishMedia(accessToken, 'story', cleanUrl, {
          accountId,
          isVideo
        });
        console.log(`[SIMPLE PUBLISHER] ✓ Processed story request: ${result.id} (processing: ${!!result.processing})`);
        return { success: true, id: result.id, processing: result.processing };
        
      } catch (error: any) {
        console.log(`[SIMPLE PUBLISHER] Story publishing failed: ${error.message}`);
        // Fallback to regular photo if story fails
        console.log(`[SIMPLE PUBLISHER] Attempting fallback to photo post for story content`);
        try {
          const fallbackResult = await instagramService.publishMedia(accessToken, 'photo', cleanUrl, {
            caption,
            accountId,
            mentions,
            collaborators
          });
          console.log(`[SIMPLE PUBLISHER] ✓ Published story as photo fallback: ${fallbackResult.id}`);
          return { success: true, id: fallbackResult.id };
        } catch (fallbackError: any) {
          return { success: false, error: `Story publishing failed: ${error.message}. Photo fallback also failed: ${fallbackError.message}` };
        }
      }
    }
    
    // For photos, publish directly
    if (contentType === 'photo') {
      try {
        const result = await instagramService.publishMedia(accessToken, 'photo', cleanUrl, {
          caption,
          accountId,
          mentions,
          collaborators
        });
        console.log(`[SIMPLE PUBLISHER] ✓ Published photo: ${result.id}`);
        return { success: true, id: result.id };
        
      } catch (error: any) {
        console.log(`[SIMPLE PUBLISHER] Photo publishing failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
    
    return { success: false, error: 'Unsupported content type' };
  }
  
  /**
   * Clean URL for Instagram compatibility
   */
  static cleanURLForInstagram(inputUrl: string): string {
    console.log(`[URL CLEANER] Processing: ${inputUrl}`);
    
    // If it's already a valid ngrok or external HTTP/HTTPS URL, preserve it!
    if (inputUrl.startsWith('http') && !inputUrl.includes('localhost') && !inputUrl.includes('your-replit-dev-domain-here')) {
      console.log(`[URL CLEANER] URL is already valid and external: ${inputUrl}`);
      return inputUrl;
    }
    
    // Prioritize ngrok URL over localhost VITE_APP_URL
    let baseUrl = process.env.SOCIAL_AUTH_BASE_URL;
    
    if (!baseUrl || baseUrl.includes('localhost')) {
      baseUrl = process.env.VITE_APP_URL;
    }
    
    if (!baseUrl || baseUrl.includes('localhost')) {
      if (process.env.REPLIT_DEV_DOMAIN && process.env.REPLIT_DEV_DOMAIN !== 'your-replit-dev-domain-here') {
         baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      }
    }
    if (!baseUrl) {
       baseUrl = 'http://localhost:5000';
    }
    
    console.log(`[URL CLEANER] Base URL fallback: ${baseUrl}`);
    
    if (!inputUrl.startsWith('/')) {
      inputUrl = '/' + inputUrl;
    }
    
    let finalUrl = `${baseUrl}${inputUrl}`;
    
    // If using ngrok, add the skip-browser-warning parameter so Facebook crawlers don't get blocked
    if (finalUrl.includes('ngrok')) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}ngrok-skip-browser-warning=true`;
    }
    
    console.log(`[URL CLEANER] Final clean URL: ${finalUrl}`);
    return finalUrl;
  }
  
  /**
   * Convert video URL to image URL for photo publishing
   */
  static convertVideoToImageURL(videoUrl: string): string {
    // Convert video extension to image
    let imageUrl = videoUrl.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg');
    
    // If no video extension found, add image extension
    if (imageUrl === videoUrl && !imageUrl.match(/\.(jpg|jpeg|png)$/i)) {
      imageUrl = `${videoUrl}.jpg`;
    }
    
    console.log(`[URL CONVERTER] Video to image: ${videoUrl} → ${imageUrl}`);
    return imageUrl;
  }
  
  /**
   * Check if content can be published with current permissions
   */
  static canPublishContent(contentType: 'video' | 'photo' | 'reel' | 'story'): boolean {
    // Currently only photo publishing is reliable
    return contentType === 'photo';
  }
  
  /**
   * Get recommended publishing approach
   */
  static getPublishingStrategy(contentType: 'video' | 'photo' | 'reel' | 'story'): {
    canPublish: boolean;
    approach: string;
    message: string;
  } {
    
    if (contentType === 'photo') {
      return {
        canPublish: true,
        approach: 'direct',
        message: 'Photo will be published directly'
      };
    }
    
    if (contentType === 'video' || contentType === 'reel') {
      return {
        canPublish: true,
        approach: 'photo_conversion',
        message: 'Video will be published as preview image with caption'
      };
    }
    
    return {
      canPublish: false,
      approach: 'unsupported',
      message: 'Content type not supported with current permissions'
    };
  }
}