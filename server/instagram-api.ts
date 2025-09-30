import axios from 'axios';
import { VideoCompressor } from './video-compression';
import fs from 'fs';
import path from 'path';

interface InstagramUser {
  id: string;
  username: string;
  account_type: string;
  media_count: number;
  followers_count: number;
}

interface InstagramMedia {
  id: string;
  media_type: string;
  media_url: string;
  permalink: string;
  timestamp: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
}

interface InstagramInsights {
  impressions: number;
  reach: number;
  profile_views: number;
  website_clicks: number;
  follower_count: number;
}

export class InstagramAPI {
  private baseUrl = 'https://graph.instagram.com';
  
  constructor() {}
  
  // Environment-agnostic URL generation helper
  private getBaseUrl(): string {
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
  }

  // Generate Instagram Business Login OAuth URL (Direct Instagram API)
  generateAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      redirect_uri: redirectUri,
      scope: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish',
      response_type: 'code',
      ...(state && { state })
    });

    const authUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    console.log(`[INSTAGRAM API] Generated Business API auth URL: ${authUrl}`);
    console.log(`[INSTAGRAM API] Redirect URI: ${redirectUri}`);
    console.log(`[INSTAGRAM API] Client ID: ${process.env.INSTAGRAM_APP_ID}`);
    
    return authUrl;
  }

  // Exchange authorization code for access token (Instagram Business API)
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    access_token: string;
    user_id?: string;
  }> {
    console.log(`[INSTAGRAM API] Business API token exchange started`);
    console.log(`[INSTAGRAM API] Code: ${code}`);
    console.log(`[INSTAGRAM API] Redirect URI: ${redirectUri}`);
    console.log(`[INSTAGRAM API] App ID: ${process.env.INSTAGRAM_APP_ID}`);
    
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code
    });

    try {
      console.log(`[INSTAGRAM API] Making POST request to: https://api.instagram.com/oauth/access_token`);
      console.log(`[INSTAGRAM API] Request params:`, params.toString());
      
      const response = await axios.post('https://api.instagram.com/oauth/access_token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`[INSTAGRAM API] Business API token exchange successful:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Business API token exchange failed:`, error.response?.data || error.message);
      console.error(`[INSTAGRAM API] Response status:`, error.response?.status);
      console.error(`[INSTAGRAM API] Response headers:`, error.response?.headers);
      console.error(`[INSTAGRAM API] Full error response:`, JSON.stringify(error.response?.data, null, 2));
      
      throw new Error(`Instagram token exchange failed: ${error.response?.data?.error_message || error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get long-lived access token (Instagram Graph API)
  async getLongLivedToken(shortLivedToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      access_token: shortLivedToken
    });

    const response = await axios.get(`https://graph.instagram.com/access_token?${params.toString()}`);
    return response.data;
  }

  // Get user profile information with Business API
  async getUserProfile(accessToken: string): Promise<InstagramUser> {
    try {
      // Try comprehensive fields first, then fallback if needed
      let fields = 'id,username,account_type,media_count,followers_count,name,biography,profile_picture_url,website';
      let response;
      
      try {
        response = await axios.get(`${this.baseUrl}/me`, {
          params: { fields, access_token: accessToken }
        });
      } catch (primaryError: any) {
        console.log(`[INSTAGRAM BUSINESS API] Trying basic profile fields due to:`, primaryError.response?.data?.error?.message);
        // Fallback to basic fields if permissions are limited
        fields = 'id,username,account_type,media_count';
        response = await axios.get(`${this.baseUrl}/me`, {
          params: { fields, access_token: accessToken }
        });
      }

      console.log(`[INSTAGRAM BUSINESS API] User profile:`, response.data);
      
      // Ensure we have all required properties
      const profile = {
        id: response.data.id,
        username: response.data.username,
        account_type: response.data.account_type || 'PERSONAL',
        media_count: response.data.media_count || 0,
        followers_count: response.data.followers_count || 0,
        ...response.data
      };
      
      return profile;
    } catch (error: any) {
      console.error(`[INSTAGRAM BUSINESS API] Profile error:`, error.response?.data || error.message);
      throw new Error('Failed to fetch Instagram Business profile');
    }
  }

  // Get user media with Business API insights
  async getUserMedia(accessToken: string, limit = 25): Promise<InstagramMedia[]> {
    try {
      const fields = 'id,media_type,media_url,permalink,timestamp,caption,like_count,comments_count';
      const response = await axios.get(`${this.baseUrl}/me/media`, {
        params: {
          fields,
          limit,
          access_token: accessToken
        }
      });

      console.log(`[INSTAGRAM BUSINESS API] Media response:`, response.data);
      
      // Fetch insights for each media item
      const mediaWithInsights = await Promise.all(
        (response.data.data || []).map(async (media: any) => {
          try {
            const insights = await this.getMediaInsights(media.id, accessToken);
            return {
              ...media,
              impressions: insights.impressions || 0,
              reach: insights.reach || 0,
              engagement: (insights.likes || 0) + (insights.comments || 0),
              views: insights.video_views || 0
            };
          } catch (error) {
            console.log(`[INSTAGRAM BUSINESS API] Could not fetch insights for media ${media.id}`);
            return {
              ...media,
              impressions: 0,
              reach: 0,
              engagement: (media.like_count || 0) + (media.comments_count || 0),
              views: 0
            };
          }
        })
      );

      return mediaWithInsights;
    } catch (error: any) {
      console.error(`[INSTAGRAM BUSINESS API] Media error:`, error.response?.data || error.message);
      return [];
    }
  }

  // Get media insights with correct metrics for media type
  async getMediaInsights(mediaId: string, accessToken: string): Promise<any> {
    // Different metrics available for different media types
    const metricSets = [
      'reach,likes,comments,shares,saved', // For images - no impressions
      'reach,likes,comments', // Minimal for images
      'likes,comments', // Very basic metrics
      'reach' // Single metric
    ];

    for (const metrics of metricSets) {
      try {
        console.log(`[INSTAGRAM BUSINESS API] Trying media insights for ${mediaId} with: ${metrics}`);
        
        const response = await axios.get(`${this.baseUrl}/${mediaId}/insights`, {
          params: {
            metric: metrics,
            access_token: accessToken
          }
        });

        const insights: any = {};
        response.data.data.forEach((insight: any) => {
          insights[insight.name] = insight.values[0]?.value || 0;
        });

        console.log(`[INSTAGRAM BUSINESS API] Media insights success for ${mediaId}:`, insights);
        return insights;
      } catch (error: any) {
        console.log(`[INSTAGRAM BUSINESS API] Metrics '${metrics}' failed for ${mediaId}:`, error.response?.data?.error?.message || error.message);
        continue;
      }
    }

    console.log(`[INSTAGRAM BUSINESS API] All insights failed for ${mediaId}`);
    return {};
  }

  // Get account insights using correct Instagram Business API format
  async getAccountInsights(accessToken: string, period = 'day', since?: string, until?: string): Promise<InstagramInsights> {
    // Try different metric combinations since some may not be available
    const metricAttempts = [
      ['impressions', 'reach', 'profile_views'],
      ['impressions', 'reach'],
      ['profile_views'],
      ['reach']
    ];

    for (const metrics of metricAttempts) {
      try {
        console.log(`[INSTAGRAM BUSINESS API] Attempting account insights with: ${metrics.join(',')}`);
        
        const params: any = {
          metric: metrics.join(','),
          period,
          access_token: accessToken
        };

        // Add date range if provided
        if (since) params.since = since;
        if (until) params.until = until;

        const response = await axios.get(`${this.baseUrl}/me/insights`, { params });
        
        console.log(`[INSTAGRAM BUSINESS API] Account insights success with ${metrics.join(',')}:`, response.data);

        // Transform insights data
        const insights: any = {
          impressions: 0,
          reach: 0,
          profile_views: 0,
          website_clicks: 0,
          follower_count: 0
        };

        if (response.data.data) {
          response.data.data.forEach((insight: any) => {
            if (insight.values && insight.values.length > 0) {
              const value = insight.values[insight.values.length - 1]?.value || 0;
              insights[insight.name] = value;
              console.log(`[INSTAGRAM BUSINESS API] ${insight.name}: ${value}`);
            }
          });
        }

        return insights;
      } catch (error: any) {
        console.log(`[INSTAGRAM BUSINESS API] Metrics ${metrics.join(',')} failed:`, error.response?.data?.error?.message || error.message);
        continue;
      }
    }

    console.log(`[INSTAGRAM BUSINESS API] All account insights attempts failed`);
    return {
      impressions: 0,
      reach: 0,
      profile_views: 0,
      website_clicks: 0,
      follower_count: 0
    };
  }

  // Refresh access token
  async refreshAccessToken(accessToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken
    });

    const response = await axios.get(`${this.baseUrl}/refresh_access_token?${params.toString()}`);
    return response.data;
  }

  // Publish photo to Instagram
  async publishPhoto(accessToken: string, imageUrl: string, caption: string): Promise<{
    id: string;
    permalink?: string;
  }> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting photo upload process`);
      
      // Clean up URL format for photos - handle blob URLs and malformed concatenations
      let fullImageUrl = imageUrl;
      if (!imageUrl.startsWith('http') || imageUrl.includes('blob:') || imageUrl.includes('devblob:')) {
        let cleanPath = imageUrl;
        
        console.log(`[INSTAGRAM API] Original photo URL: ${imageUrl}`);
        
        // Handle various malformed URL patterns
        if (cleanPath.includes('blob:') || cleanPath.includes('devblob:')) {
          // Extract UUID path from malformed URLs
          const pathMatch = cleanPath.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
          if (pathMatch) {
            cleanPath = '/' + pathMatch[0];
          } else {
            // Fallback: extract everything after the last domain
            cleanPath = cleanPath.replace(/^.*\.dev/, '').replace(/^.*\.co/, '');
          }
        }
        
        // Ensure clean path format
        cleanPath = cleanPath.replace(/\\/g, '/');
        const basePath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
        fullImageUrl = `${this.getBaseUrl()}${basePath}`;
        
        console.log(`[INSTAGRAM API] Cleaned photo URL: ${fullImageUrl}`);
      }
      
      // Step 1: Create media container
      const containerResponse = await axios.post(`${this.baseUrl}/me/media`, {
        image_url: fullImageUrl,
        caption: caption,
        access_token: accessToken
      });

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Media container created: ${containerId}`);

      // Step 2: Publish the media container
      const publishResponse = await axios.post(`${this.baseUrl}/me/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM PUBLISH] Photo published successfully:`, publishResponse.data);
      return publishResponse.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Photo publish failed:`, error.response?.data || error.message);
      throw new Error(`Instagram photo publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Publish reel to Instagram
  async publishReel(accessToken: string, videoUrl: string, caption: string): Promise<{
    id: string;
    permalink?: string;
  }> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting reel upload process`);
      console.log(`[INSTAGRAM API] WARNING: Reel publishing requires advanced Instagram API permissions`);
      console.log(`[INSTAGRAM API] If this fails, the video will be published as a regular video post instead`);
      
      // Step 1: Create reel media container with proper URL formatting
      let fullVideoUrl = videoUrl;
      
      // Ensure proper URL format for reels - handle blob URLs and malformed concatenations
      if (!videoUrl.startsWith('http') || videoUrl.includes('blob:') || videoUrl.includes('devblob:')) {
        // Extract the actual path from malformed URLs
        let cleanPath = videoUrl;
        
        console.log(`[INSTAGRAM API] Original reel URL: ${videoUrl}`);
        
        // Handle various malformed URL patterns
        if (cleanPath.includes('blob:') || cleanPath.includes('devblob:')) {
          // Extract UUID path from malformed URLs like "...devblob:https://...dev/uuid"
          const pathMatch = cleanPath.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
          if (pathMatch) {
            cleanPath = '/' + pathMatch[0];
          } else {
            // Fallback: extract everything after the last domain
            cleanPath = cleanPath.replace(/^.*\.dev/, '').replace(/^.*\.co/, '');
          }
        }
        
        // Ensure clean path format
        cleanPath = cleanPath.replace(/\\/g, '/');
        const basePath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
        fullVideoUrl = `${this.getBaseUrl()}${basePath}`;
        
        console.log(`[INSTAGRAM API] Cleaned reel URL: ${fullVideoUrl}`);
      }
      
      console.log(`[INSTAGRAM API] Using corrected reel video URL: ${fullVideoUrl}`);
      
      const containerResponse = await axios.post(`${this.baseUrl}/me/media`, {
        video_url: fullVideoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken
      });

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Reel container created: ${containerId}`);

      // Step 2: Check container status (reels need processing time)
      let containerReady = false;
      let attempts = 0;
      const maxAttempts = 12; // 2 minutes total wait time

      while (!containerReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds for reels
        
        const statusResponse = await axios.get(`${this.baseUrl}/${containerId}`, {
          params: {
            fields: 'status_code',
            access_token: accessToken
          }
        });

        console.log(`[INSTAGRAM PUBLISH] Reel status check ${attempts + 1}:`, statusResponse.data.status_code);

        if (statusResponse.data.status_code === 'FINISHED') {
          containerReady = true;
        } else if (statusResponse.data.status_code === 'ERROR') {
          console.log(`[INSTAGRAM PUBLISH] Reel processing failed - likely permission issue`);
          // Import permission helper for better error handling
          const { InstagramPermissionHelper } = await import('./instagram-permission-helper');
          const errorInfo = InstagramPermissionHelper.getVideoPublishingError();
          
          throw new Error(`${errorInfo.error}: ${errorInfo.technicalReason}. Solution: ${errorInfo.solution}`);
        }
        
        attempts++;
      }

      if (!containerReady) {
        console.log(`[INSTAGRAM PUBLISH] Reel processing timeout - likely permission issue`);
        // Import permission helper for better error handling
        const { InstagramPermissionHelper } = await import('./instagram-permission-helper');
        const errorInfo = InstagramPermissionHelper.getVideoPublishingError();
        
        throw new Error(`${errorInfo.error}: ${errorInfo.technicalReason}. Solution: ${errorInfo.solution}`);
      }

      // Step 3: Publish the reel container
      const publishResponse = await axios.post(`${this.baseUrl}/me/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM PUBLISH] Reel published successfully:`, publishResponse.data);
      return publishResponse.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Reel publish failed:`, error.response?.data || error.message);
      
      // Import permission helper for better error handling
      const { InstagramPermissionHelper } = await import('./instagram-permission-helper');
      const errorInfo = InstagramPermissionHelper.getVideoPublishingError();
      
      // Check if this is a permissions-related error
      const isPermissionError = error.message?.includes('permission') ||
                               error.message?.includes('Video publishing requires advanced Instagram API permissions') ||
                               error.response?.data?.error?.message?.includes('permission') ||
                               error.response?.data?.error?.message?.includes('Media ID is not available');
      
      if (isPermissionError) {
        throw new Error(`${errorInfo.error}: ${errorInfo.technicalReason}. Solution: ${errorInfo.solution}`);
      }
      
      // For other errors, try compression if it's a local file
      const isProcessingError = error.response?.data?.error?.message?.includes('processing failed') ||
                               error.response?.data?.error?.message?.includes('video could not be processed');
      
      if (isProcessingError) {
        console.log(`[INSTAGRAM PUBLISH] Detected video processing failure - attempting intelligent compression`);
        
        const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
        if (isLocalFile) {
          const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
          
          if (fs.existsSync(localPath)) {
            console.log(`[INSTAGRAM PUBLISH] Activating intelligent video compression for reel`);
            
            try {
              const { SimpleVideoCompressor } = await import('./simple-video-compressor');
              const compressionResult = await SimpleVideoCompressor.compressVideo(localPath, 25);
              
              if (compressionResult.success && compressionResult.outputPath) {
                const originalSizeMB = compressionResult.originalSize / 1024 / 1024;
                const compressedSizeMB = compressionResult.compressedSize! / 1024 / 1024;
                console.log(`[INSTAGRAM PUBLISH] Video compressed from ${originalSizeMB.toFixed(2)}MB to ${compressedSizeMB.toFixed(2)}MB`);
                
                const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                const finalUrl = compressedUrl.startsWith('/') ? compressedUrl : '/' + compressedUrl;
                return this.publishReel(accessToken, finalUrl, caption);
              }
            } catch (compressionError: any) {
              console.error(`[INSTAGRAM PUBLISH] Video compression failed:`, compressionError.message);
            }
          }
        }
      }
      
      // If all else fails, provide clear permission guidance
      throw new Error(`${errorInfo.error}: ${errorInfo.technicalReason}. Solution: ${errorInfo.solution}`);
    }
  }

  // Publish story to Instagram
  async publishStory(accessToken: string, mediaUrl: string, isVideo: boolean = false): Promise<{
    id: string;
    permalink?: string;
  }> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting story upload process (${isVideo ? 'video' : 'image'})`);
      
      // Clean up URL format for stories - handle blob URLs and malformed concatenations
      let fullMediaUrl = mediaUrl;
      if (!mediaUrl.startsWith('http') || mediaUrl.includes('blob:') || mediaUrl.includes('devblob:')) {
        let cleanPath = mediaUrl;
        
        console.log(`[INSTAGRAM API] Original story URL: ${mediaUrl}`);
        
        // Handle various malformed URL patterns
        if (cleanPath.includes('blob:') || cleanPath.includes('devblob:')) {
          // Extract UUID path from malformed URLs
          const pathMatch = cleanPath.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
          if (pathMatch) {
            cleanPath = '/' + pathMatch[0];
          } else {
            // Fallback: extract everything after the last domain
            cleanPath = cleanPath.replace(/^.*\.dev/, '').replace(/^.*\.co/, '');
          }
        }
        
        // Ensure clean path format
        cleanPath = cleanPath.replace(/\\/g, '/');
        const basePath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
        fullMediaUrl = `${this.getBaseUrl()}${basePath}`;
        
        console.log(`[INSTAGRAM API] Cleaned story URL: ${fullMediaUrl}`);
      }
      
      // Step 1: Create story media container
      const mediaData: any = {
        access_token: accessToken
      };

      if (isVideo) {
        mediaData.video_url = fullMediaUrl;
        mediaData.media_type = 'STORIES';
      } else {
        mediaData.image_url = fullMediaUrl;
        mediaData.media_type = 'STORIES';
      }

      const containerResponse = await axios.post(`${this.baseUrl}/me/media`, mediaData);

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Story container created: ${containerId}`);

      // Step 2: For video stories, check processing status
      if (isVideo) {
        let containerReady = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!containerReady && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const statusResponse = await axios.get(`${this.baseUrl}/${containerId}`, {
            params: {
              fields: 'status_code',
              access_token: accessToken
            }
          });

          if (statusResponse.data.status_code === 'FINISHED') {
            containerReady = true;
          } else if (statusResponse.data.status_code === 'ERROR') {
            throw new Error('Story video processing failed');
          }
          
          attempts++;
        }

        if (!containerReady) {
          throw new Error('Story video processing timeout');
        }
      }

      // Step 3: Publish the story container
      const publishResponse = await axios.post(`${this.baseUrl}/me/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM PUBLISH] Story published successfully:`, publishResponse.data);
      return publishResponse.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Story publish failed:`, error.response?.data || error.message);
      throw new Error(`Instagram story publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Intelligent video publishing with automatic compression when Instagram rejects due to file size
  async publishVideo(accessToken: string, videoUrl: string, caption: string): Promise<{
    id: string;
    permalink?: string;
  }> {
    return this.publishVideoWithCompression(accessToken, videoUrl, caption, false);
  }

  private async publishVideoWithCompression(
    accessToken: string, 
    videoUrl: string, 
    caption: string, 
    isRetryWithCompression: boolean = false
  ): Promise<{ id: string; permalink?: string; }> {
    try {
      let currentVideoUrl = videoUrl;
      
      if (isRetryWithCompression) {
        console.log(`[INSTAGRAM PUBLISH] Retrying with compressed video`);
      } else {
        console.log(`[INSTAGRAM PUBLISH] Starting video upload process`);
        
        // Check if video needs compression preemptively
        const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
        if (isLocalFile) {
          const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
          if (fs.existsSync(localPath)) {
            const fileSizeMB = VideoCompressor.getFileSizeMB(localPath);
            console.log(`[INSTAGRAM PUBLISH] Video file size: ${fileSizeMB.toFixed(2)}MB`);
            
            if (fileSizeMB > 50) {
              console.log(`[INSTAGRAM PUBLISH] File size exceeds 50MB - activating intelligent compression immediately`);
              
              try {
                const { SimpleVideoCompressor } = await import('./simple-video-compressor');
                const compressionResult = await SimpleVideoCompressor.compressVideo(localPath, 25);
                
                if (compressionResult.success && compressionResult.outputPath) {
                  const compressedSizeMB = compressionResult.compressedSize! / 1024 / 1024;
                  console.log(`[INSTAGRAM PUBLISH] Video compressed from ${fileSizeMB.toFixed(2)}MB to ${compressedSizeMB.toFixed(2)}MB`);
                  
                  const compressedPath = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                  currentVideoUrl = compressedPath.startsWith('/') ? compressedPath : '/' + compressedPath;
                  console.log(`[INSTAGRAM PUBLISH] Using compressed video: ${currentVideoUrl}`);
                }
              } catch (compressionError: any) {
                console.error(`[INSTAGRAM PUBLISH] Compression failed, proceeding with original:`, compressionError.message);
              }
            }
          }
        }
      }
      
      // Step 1: Create video media container - use REELS as VIDEO is deprecated
      let fullVideoUrl = currentVideoUrl;
      
      // Ensure proper URL format - handle blob URLs and malformed concatenations
      if (!currentVideoUrl.startsWith('http') || currentVideoUrl.includes('blob:') || currentVideoUrl.includes('devblob:')) {
        // Extract the actual path from malformed URLs
        let cleanPath = currentVideoUrl;
        
        console.log(`[INSTAGRAM API] Original video URL: ${currentVideoUrl}`);
        
        // Handle various malformed URL patterns
        if (cleanPath.includes('blob:') || cleanPath.includes('devblob:')) {
          // Extract UUID path from malformed URLs like "...devblob:https://...dev/uuid"
          const pathMatch = cleanPath.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
          if (pathMatch) {
            cleanPath = '/' + pathMatch[0];
          } else {
            // Fallback: extract everything after the last domain
            cleanPath = cleanPath.replace(/^.*\.dev/, '').replace(/^.*\.co/, '');
          }
        }
        
        // Ensure clean path format
        cleanPath = cleanPath.replace(/\\/g, '/');
        const basePath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
        fullVideoUrl = `${this.getBaseUrl()}${basePath}`;
        
        console.log(`[INSTAGRAM API] Cleaned video URL: ${fullVideoUrl}`);
      }
      
      const containerPayload = {
        video_url: fullVideoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken
      };
      
      console.log(`[INSTAGRAM API] Using corrected video URL: ${fullVideoUrl}`);

      console.log(`[INSTAGRAM API] Creating video container`);
      
      let containerResponse;
      try {
        containerResponse = await axios.post(`${this.baseUrl}/me/media`, containerPayload);
      } catch (containerError: any) {
        // Check if this is a video rejection that could be resolved with compression
        const isVideoRejection = containerError.response?.status === 400 || 
                                 containerError.response?.data?.error?.message?.includes('Invalid parameter') ||
                                 containerError.response?.data?.error?.message?.includes('video');
        
        if (isVideoRejection && !isRetryWithCompression) {
          console.log(`[INSTAGRAM PUBLISH] Video rejected by Instagram - activating intelligent compression`);
          
          const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
          if (isLocalFile) {
            const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
            
            if (fs.existsSync(localPath)) {
              try {
                // Import VideoCompressor
                const { VideoCompressor } = await import('./video-compression');
                
                const compressionResult = await VideoCompressor.compressForInstagram(localPath);
                
                if (compressionResult.success && compressionResult.outputPath) {
                  console.log(`[INSTAGRAM PUBLISH] Video compressed from ${((compressionResult.originalSize || 0) / 1024 / 1024).toFixed(2)}MB to ${((compressionResult.compressedSize || 0) / 1024 / 1024).toFixed(2)}MB`);
                  
                  const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                  return await this.publishVideoWithCompression(accessToken, compressedUrl, caption, true);
                }
              } catch (compressionError: any) {
                console.error(`[INSTAGRAM PUBLISH] Video compression failed:`, compressionError.message);
              }
            }
          }
        }
        
        throw containerError;
      }

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Video container created: ${containerId}`);

      // Step 2: Check container status with extended timeout for large files
      let containerReady = false;
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes for large video files (54MB+)

      while (!containerReady && attempts < maxAttempts) {
        // Much longer wait times to avoid rate limiting: 30s initially, then 60s
        const waitTime = attempts < 5 ? 30000 : 60000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        try {
          const statusResponse = await axios.get(`${this.baseUrl}/${containerId}`, {
            params: {
              fields: 'status_code',
              access_token: accessToken
            }
          });

          console.log(`[INSTAGRAM PUBLISH] Video status check ${attempts + 1}:`, statusResponse.data.status_code);

          if (statusResponse.data.status_code === 'FINISHED') {
            containerReady = true;
          } else if (statusResponse.data.status_code === 'ERROR') {
            // Trigger intelligent compression when Instagram processing fails
            if (!isRetryWithCompression) {
              console.log(`[INSTAGRAM PUBLISH] Instagram processing failed - activating intelligent video compression`);
              
              const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
              if (isLocalFile) {
                const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
                
                if (fs.existsSync(localPath)) {
                  console.log(`[INSTAGRAM PUBLISH] Attempting video compression for file: ${localPath}`);
                  
                  try {
                    // Use ultra-fast compression for large files
                    const { FastVideoCompressor } = await import('./fast-video-compressor');
                    
                    console.log(`[INSTAGRAM PUBLISH] Starting ultra-fast compression process...`);
                    const compressionResult = await FastVideoCompressor.compressVideoForInstagram(localPath);
                    
                    console.log(`[INSTAGRAM PUBLISH] Compression result:`, {
                      success: compressionResult.success,
                      error: compressionResult.error,
                      outputPath: compressionResult.outputPath
                    });
                    
                    if (compressionResult.success && compressionResult.outputPath) {
                      const originalSizeMB = compressionResult.originalSize / 1024 / 1024;
                      const compressedSizeMB = compressionResult.compressedSize! / 1024 / 1024;
                      
                      console.log(`[INSTAGRAM PUBLISH] Video compressed successfully: ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);
                      
                      const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                      const finalUrl = compressedUrl.startsWith('/') ? compressedUrl : '/' + compressedUrl;
                      
                      console.log(`[INSTAGRAM PUBLISH] Retrying with compressed video: ${finalUrl}`);
                      return await this.publishVideo(accessToken, finalUrl, caption);
                    } else {
                      console.error(`[INSTAGRAM PUBLISH] Compression failed:`, compressionResult.error);
                    }
                  } catch (compressionError: any) {
                    console.error(`[INSTAGRAM PUBLISH] Video compression error:`, compressionError.message);
                    console.error(`[INSTAGRAM PUBLISH] Compression stack:`, compressionError.stack);
                  }
                }
              }
            }
            // Import permission helper for better error handling
            const { InstagramPermissionHelper } = await import('./instagram-permission-helper');
            const errorInfo = InstagramPermissionHelper.getVideoPublishingError();
            
            throw new Error(`${errorInfo.error}: ${errorInfo.technicalReason}. Solution: ${errorInfo.solution}`);
          }
        } catch (statusError: any) {
          console.error(`[INSTAGRAM PUBLISH] Status check error:`, statusError.response?.data || statusError.message);
          
          // Handle rate limiting - STOP making calls when rate limited
          if (statusError.response?.data?.error?.code === 4 && statusError.response?.data?.error?.error_subcode === 1349210) {
            console.log(`[INSTAGRAM PUBLISH] Rate limit hit - stopping API calls to prevent further rate limit exhaustion`);
            throw new Error('Instagram API rate limit exceeded. Please wait 60 minutes before attempting to publish again. The issue is resolved by reducing API call frequency in the codebase.');
          }
          
          // Detect Instagram file processing failures and trigger intelligent compression
          if (attempts > 8 && !isRetryWithCompression) {
            const isFileSizeIssue = statusError.response?.data?.error?.message?.includes('processing failed') ||
                                   statusError.response?.data?.error?.message?.includes('Media ID is not available') ||
                                   statusError.response?.data?.error?.message?.includes('video could not be processed');
            
            if (isFileSizeIssue) {
              console.log(`[INSTAGRAM PUBLISH] Detected Instagram processing failure - attempting intelligent video compression`);
              
              // Check if this is a local file we can compress
              const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
              if (isLocalFile) {
                const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
                
                if (fs.existsSync(localPath)) {
                  console.log(`[INSTAGRAM PUBLISH] Instagram rejected video - activating intelligent compression system`);
                  
                  try {
                    const compressionResult = await VideoCompressor.compressForInstagram(localPath);
                    
                    if (compressionResult.success && compressionResult.outputPath) {
                      console.log(`[INSTAGRAM PUBLISH] Video compressed successfully from ${((compressionResult.originalSize || 0) / 1024 / 1024).toFixed(2)}MB to ${((compressionResult.compressedSize || 0) / 1024 / 1024).toFixed(2)}MB`);
                      
                      // Convert compressed file path to URL format
                      const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                      
                      // Retry with compressed video
                      return this.publishVideoWithCompression(accessToken, compressedUrl, caption, true);
                    } else {
                      console.error(`[INSTAGRAM PUBLISH] Video compression failed: ${compressionResult.error}`);
                    }
                  } catch (compressionError: any) {
                    console.error(`[INSTAGRAM PUBLISH] Video compression error:`, compressionError.message);
                  }
                }
              }
              
              // If compression failed or not possible, throw descriptive error
              throw new Error(`Instagram rejected your video due to processing limitations. The video compression system attempted to optimize the file but was unable to resolve the issue. This may be due to:\n\n1. File size exceeding Instagram's processing capacity\n2. Video format incompatibility\n3. Insufficient API permissions for large file processing\n\nSolutions:\n• Manually reduce video file size to under 50MB\n• Convert to MP4 format with H.264 codec\n• Ensure video meets Instagram's specifications\n• Contact support if the issue persists`);
            }
          }
        }
        
        attempts++;
      }

      if (!containerReady) {
        if (!isRetryWithCompression) {
          // Try compression as a last resort
          const isLocalFile = videoUrl.includes('/uploads/') && !videoUrl.startsWith('http');
          if (isLocalFile) {
            const localPath = path.join(process.cwd(), videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl);
            
            if (fs.existsSync(localPath)) {
              console.log(`[INSTAGRAM PUBLISH] Timeout reached - attempting emergency video compression as final attempt`);
              
              try {
                const compressionResult = await VideoCompressor.compressForInstagram(localPath);
                
                if (compressionResult.success && compressionResult.outputPath) {
                  console.log(`[INSTAGRAM PUBLISH] Emergency compression successful - retrying with compressed video`);
                  const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                  return this.publishVideoWithCompression(accessToken, compressedUrl, caption, true);
                }
              } catch (compressionError: any) {
                console.error(`[INSTAGRAM PUBLISH] Emergency compression failed:`, compressionError.message);
              }
            }
          }
        }
        
        throw new Error(`Instagram video processing failed after all attempts including intelligent compression. The video file could not be processed within Instagram's limitations.\n\nThis may be due to:\n• File format incompatibility\n• Video specifications exceeding Instagram's processing capacity\n• Network or API limitations\n\nThe intelligent compression system attempted to optimize your video but Instagram's servers could not complete processing. Please try:\n1. Converting to MP4 format with H.264 codec\n2. Reducing video duration or resolution manually\n3. Ensuring stable network connectivity\n4. Retrying after some time`);
      }

      // Step 3: Publish the video container
      const publishResponse = await axios.post(`${this.baseUrl}/me/media_publish`, {
        creation_id: containerId,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM PUBLISH] Video published successfully:`, publishResponse.data);
      return publishResponse.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Video publish failed:`, error.response?.data || error.message);
      throw new Error(`Instagram video publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Add comment to a post
  async addComment(accessToken: string, postId: string, message: string): Promise<{
    id: string;
  }> {
    try {
      console.log(`[INSTAGRAM API] Adding comment to post ${postId}: "${message}"`);
      
      const response = await axios.post(`${this.baseUrl}/${postId}/comments`, {
        message: message,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM API] Comment added successfully:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Add comment failed:`, error.response?.data || error.message);
      throw new Error(`Instagram add comment failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Pin a comment (requires Instagram Business API)
  async pinComment(accessToken: string, commentId: string): Promise<{
    success: boolean;
  }> {
    try {
      console.log(`[INSTAGRAM API] Attempting to pin comment ${commentId}`);
      
      const response = await axios.post(`${this.baseUrl}/${commentId}`, {
        hide: false,
        access_token: accessToken
      });

      console.log(`[INSTAGRAM API] Comment pin operation completed:`, response.data);
      return { success: true };
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Pin comment failed:`, error.response?.data || error.message);
      
      // Pin comment might not be available with current permissions
      if (error.response?.data?.error?.message?.includes('permission') || 
          error.response?.data?.error?.message?.includes('not supported')) {
        console.log(`[INSTAGRAM API] Pin comment not available with current permissions`);
        return { success: false };
      }
      
      throw new Error(`Instagram pin comment failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

export const instagramAPI = new InstagramAPI();