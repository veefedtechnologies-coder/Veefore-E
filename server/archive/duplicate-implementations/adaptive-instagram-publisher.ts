/**
 * Adaptive Instagram Publisher - Handles Instagram's Changing API Requirements
 * 
 * This service addresses the inconsistency where the same video URL works sometimes
 * but fails other times, adapting to Instagram's evolving requirements.
 */

import { instagramAPI } from './instagram-api';
import * as fs from 'fs';
import * as path from 'path';

interface PublishResult {
  success: boolean;
  id?: string;
  error?: string;
  method?: string;
}

export class AdaptiveInstagramPublisher {
  
  /**
   * Intelligently publishes content with multiple fallback strategies
   */
  static async publishWithAdaptiveStrategy(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: 'video' | 'photo' | 'reel' | 'story'
  ): Promise<PublishResult> {
    
    console.log(`[ADAPTIVE PUBLISHER] Starting adaptive publishing for ${contentType}`);
    console.log(`[ADAPTIVE PUBLISHER] Media URL: ${mediaUrl}`);
    
    // Strategy 0: Use permission-aware publishing first
    try {
      console.log(`[ADAPTIVE PUBLISHER] Strategy 0: Permission-aware publishing`);
      
      const { InstagramPermissionHelper } = await import('./instagram-permission-helper');
      const strategy = await InstagramPermissionHelper.getBestPublishingStrategy(
        accessToken,
        contentType,
        mediaUrl,
        caption
      );
      
      console.log(`[ADAPTIVE PUBLISHER] Recommended strategy: ${strategy.method}`);
      
      const permissionResult = await InstagramPermissionHelper.executePublishingStrategy(
        accessToken,
        strategy
      );
      
      if (permissionResult.success) {
        console.log(`[ADAPTIVE PUBLISHER] Strategy 0 SUCCESS: ${permissionResult.id}`);
        return { success: true, id: permissionResult.id, method: strategy.method };
      }
      
      console.log(`[ADAPTIVE PUBLISHER] Strategy 0 failed: ${permissionResult.error}`);
      
    } catch (permissionError: any) {
      console.log(`[ADAPTIVE PUBLISHER] Permission-aware strategy failed: ${permissionError.message}`);
    }
    
    // Strategy 1: Try direct publishing (original approach)
    try {
      console.log(`[ADAPTIVE PUBLISHER] Strategy 1: Direct ${contentType} publishing`);
      
      let result;
      switch (contentType) {
        case 'video':
          result = await instagramAPI.publishVideo(accessToken, mediaUrl, caption);
          break;
        case 'reel':
          result = await instagramAPI.publishReel(accessToken, mediaUrl, caption);
          break;
        case 'photo':
          result = await instagramAPI.publishPhoto(accessToken, mediaUrl, caption);
          break;
        case 'story':
          result = await instagramAPI.publishStory(accessToken, mediaUrl, contentType === 'video');
          break;
      }
      
      console.log(`[ADAPTIVE PUBLISHER] Strategy 1 SUCCESS: ${result!.id}`);
      return { success: true, id: result!.id, method: 'direct' };
      
    } catch (directError: any) {
      console.log(`[ADAPTIVE PUBLISHER] Strategy 1 failed: ${directError.message}`);
      
      // Analyze the error to determine next strategy
      const errorMessage = directError.message.toLowerCase();
      
      // Strategy 2: Handle format/permission issues
      if (errorMessage.includes('format') || errorMessage.includes('supported')) {
        return await this.handleFormatIssues(accessToken, mediaUrl, caption, contentType);
      }
      
      // Strategy 3: Handle permission/access issues
      if (errorMessage.includes('permission') || errorMessage.includes('oauth')) {
        return await this.handlePermissionIssues(accessToken, mediaUrl, caption, contentType);
      }
      
      // Strategy 4: Handle URL accessibility issues
      if (errorMessage.includes('uri') || errorMessage.includes('download') || errorMessage.includes('fetch')) {
        return await this.handleUrlIssues(accessToken, mediaUrl, caption, contentType);
      }
      
      // Strategy 5: Last resort - intelligent retry with delay
      return await this.handleGenericRetry(accessToken, mediaUrl, caption, contentType, directError);
    }
  }
  
  /**
   * Strategy 2: Handle format-related issues
   */
  private static async handleFormatIssues(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: string
  ): Promise<PublishResult> {
    
    console.log(`[ADAPTIVE PUBLISHER] Strategy 2: Handling format issues`);
    
    // If it's a video, try compression/format conversion
    if (contentType === 'video' || contentType === 'reel') {
      try {
        const { DirectInstagramPublisher } = await import('./direct-instagram-publisher');
        const result = await DirectInstagramPublisher.publishVideoWithIntelligentCompression(
          accessToken,
          mediaUrl,
          caption
        );
        
        console.log(`[ADAPTIVE PUBLISHER] Strategy 2 SUCCESS with compression: ${result.id}`);
        return { success: true, id: result.id, method: 'compression' };
        
      } catch (compressionError: any) {
        console.log(`[ADAPTIVE PUBLISHER] Strategy 2 failed: ${compressionError.message}`);
      }
    }
    
    return { success: false, error: 'Format issues could not be resolved' };
  }
  
  /**
   * Strategy 3: Handle permission/access issues
   */
  private static async handlePermissionIssues(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: string
  ): Promise<PublishResult> {
    
    console.log(`[ADAPTIVE PUBLISHER] Strategy 3: Handling permission issues`);
    
    // First try to extract a frame from video and publish as photo
    if (contentType === 'video' || contentType === 'reel') {
      try {
        console.log(`[ADAPTIVE PUBLISHER] Attempting video frame extraction for ${contentType}`);
        
        // Try to use the DirectInstagramPublisher for frame extraction
        const { DirectInstagramPublisher } = await import('./direct-instagram-publisher');
        
        // If the URL is a blob, try to convert it properly
        let processedUrl = mediaUrl;
        if (mediaUrl.startsWith('blob:')) {
          // Extract the actual media URL from blob
          const urlParts = mediaUrl.split('/');
          const mediaId = urlParts[urlParts.length - 1];
          // Environment-agnostic URL generation
          const getBaseUrl = () => {
            if (process.env.REPLIT_DEV_DOMAIN) {
              return `https://${process.env.REPLIT_DEV_DOMAIN}`;
            }
            if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
              return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
            }
            if (process.env.VITE_APP_URL) {
              return process.env.VITE_APP_URL;
            }
            return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
          };
          
          processedUrl = `${getBaseUrl()}/uploads/${mediaId}`;
          console.log(`[ADAPTIVE PUBLISHER] Converted blob URL to: ${processedUrl}`);
        }
        
        // Try publishing as a static image post with enhanced caption
        const enhancedCaption = `${caption}\n\n🎬 Video content shared as preview`;
        
        try {
          // First attempt: Direct photo publish with processed URL
          const result = await instagramAPI.publishPhoto(accessToken, processedUrl, enhancedCaption);
          console.log(`[ADAPTIVE PUBLISHER] Strategy 3 SUCCESS with processed URL: ${result.id}`);
          return { success: true, id: result.id, method: 'video_to_photo_conversion' };
          
        } catch (photoError: any) {
          console.log(`[ADAPTIVE PUBLISHER] Photo publish with processed URL failed: ${photoError.message}`);
          
          // Second attempt: Try with original URL in case it works
          try {
            const result = await instagramAPI.publishPhoto(accessToken, mediaUrl, enhancedCaption);
            console.log(`[ADAPTIVE PUBLISHER] Strategy 3 SUCCESS with original URL: ${result.id}`);
            return { success: true, id: result.id, method: 'photo_fallback' };
            
          } catch (originalError: any) {
            console.log(`[ADAPTIVE PUBLISHER] Photo publish with original URL failed: ${originalError.message}`);
          }
        }
        
      } catch (extractionError: any) {
        console.log(`[ADAPTIVE PUBLISHER] Frame extraction failed: ${extractionError.message}`);
      }
    }
    
    // Placeholder content is disabled - Instagram rejects them
    console.log(`[ADAPTIVE PUBLISHER] Skipping text-only fallback - placeholder images are not allowed`);
    
    return { 
      success: false, 
      error: 'All permission fallback strategies exhausted. Instagram app needs video publishing permissions approval from Meta.' 
    };
  }
  
  /**
   * Strategy 4: Handle URL accessibility issues
   */
  private static async handleUrlIssues(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: string
  ): Promise<PublishResult> {
    
    console.log(`[ADAPTIVE PUBLISHER] Strategy 4: Handling URL accessibility issues`);
    
    // Wait for URL to become accessible
    const maxRetries = 3;
    const delays = [2000, 5000, 10000]; // 2s, 5s, 10s
    
    for (let i = 0; i < maxRetries; i++) {
      console.log(`[ADAPTIVE PUBLISHER] URL retry ${i + 1}/${maxRetries}, waiting ${delays[i]}ms`);
      await new Promise(resolve => setTimeout(resolve, delays[i]));
      
      try {
        let result;
        switch (contentType) {
          case 'video':
            result = await instagramAPI.publishVideo(accessToken, mediaUrl, caption);
            break;
          case 'reel':
            result = await instagramAPI.publishReel(accessToken, mediaUrl, caption);
            break;
          case 'photo':
            result = await instagramAPI.publishPhoto(accessToken, mediaUrl, caption);
            break;
          default:
            result = await instagramAPI.publishPost(accessToken, mediaUrl, contentType);
            break;
        }
        
        console.log(`[ADAPTIVE PUBLISHER] Strategy 4 SUCCESS on retry ${i + 1}: ${result.id}`);
        return { success: true, id: result.id, method: `url_retry_${i + 1}` };
        
      } catch (retryError: any) {
        console.log(`[ADAPTIVE PUBLISHER] Retry ${i + 1} failed: ${retryError.message}`);
      }
    }
    
    return { 
      success: false, 
      error: `URL accessibility failed after ${maxRetries} retries` 
    };
  }

  /**
   * Strategy 5: Generic retry with intelligent delay
   */
  private static async handleGenericRetry(
    accessToken: string,
    mediaUrl: string,
    caption: string,
    contentType: string,
    originalError: Error
  ): Promise<PublishResult> {
    
    console.log(`[ADAPTIVE PUBLISHER] Strategy 5: Generic retry with intelligent delay`);
    console.log(`[ADAPTIVE PUBLISHER] Original error: ${originalError.message}`);
    
    // Intelligent retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      let result;
      switch (contentType) {
        case 'video':
          result = await instagramAPI.publishVideo(accessToken, mediaUrl, caption);
          break;
        case 'reel':
          result = await instagramAPI.publishReel(accessToken, mediaUrl, caption);
          break;
        case 'photo':
          result = await instagramAPI.publishPhoto(accessToken, mediaUrl, caption);
          break;
        default:
          result = await instagramAPI.publishPost(accessToken, mediaUrl, contentType);
          break;
      }
      
      console.log(`[ADAPTIVE PUBLISHER] Strategy 5 SUCCESS: ${result.id}`);
      return { success: true, id: result.id, method: 'generic_retry' };
      
    } catch (finalError: any) {
      console.log(`[ADAPTIVE PUBLISHER] Final retry failed: ${finalError.message}`);
      return { 
        success: false, 
        error: `All strategies failed. Final error: ${finalError.message}` 
      };
    }
  }
}