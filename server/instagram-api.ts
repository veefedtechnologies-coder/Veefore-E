import axios from 'axios';
import { VideoCompressor } from './video-compression';
import fs from 'fs';
import path from 'path';
import { RequestDeduplicator } from './services/request-deduplicator';
import { CacheService } from './services/cache-service';
import crypto from 'crypto';

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

  constructor() { }

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

  getPublishApiBase(accountId?: string): string {
    if (accountId) {
      return `https://graph.facebook.com/v22.0/${accountId}`;
    }
    return `${this.baseUrl}/me`;
  }

  // Generate Instagram Business Login OAuth URL (Direct Instagram API)
  generateAuthUrl(redirectUri: string, state?: string): string {
    // When in Phase 1 Review mode, only request safe publishing/insights scopes.
    // DM (instagram_business_manage_messages) and Comment (instagram_business_manage_comments)
    // permissions are EXCLUDED to comply with Meta's Phase 1 App Review policy.
    const isPhase1Review = process.env.META_PHASE_1_REVIEW_MODE === 'true';

    const scope = isPhase1Review
      ? 'instagram_business_basic,instagram_business_content_publish'
      : 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish';

    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      ...(state && { state })
    });

    const authUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    console.log(`[INSTAGRAM API] Generated Business API auth URL. Phase1Review=${isPhase1Review}. Scope: ${scope}`);
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
      const cache = CacheService.getInstance();
      
      // Hash the access token to use as a cache key so we don't expose it
      const tokenHash = crypto.createHash('md5').update(accessToken).digest('hex');
      const cacheKey = `api_user_profile_${tokenHash}`;
      
      const cachedProfile = await cache.get<InstagramUser>(cacheKey);
      if (cachedProfile) {
        console.log(`[CACHE] ✅ HIT for user profile`);
        return cachedProfile;
      }
      
      console.log(`[CACHE] ❌ MISS for user profile (Fetching from Meta API...)`);

      // Try comprehensive fields first, then fallback if needed
      let fields = 'id,username,account_type,media_count,followers_count,name,biography,profile_picture_url,website';
      let response;

      const deduplicator = RequestDeduplicator.getInstance();
      
      try {
        const url = `${this.baseUrl}/me`;
        const { data } = await deduplicator.execute(`${url}?fields=${fields}`, async () => {
          const res = await axios.get(url, { params: { fields, access_token: accessToken } });
          return res;
        });
        response = data;
      } catch (primaryError: any) {
        console.log(`[INSTAGRAM BUSINESS API] Trying basic profile fields due to:`, primaryError.response?.data?.error?.message);
        // Fallback to basic fields if permissions are limited
        fields = 'id,username,account_type,media_count';
        const url = `${this.baseUrl}/me`;
        const { data } = await deduplicator.execute(`${url}?fields=${fields}`, async () => {
          const res = await axios.get(url, { params: { fields, access_token: accessToken } });
          return res;
        });
        response = data;
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

      // Cache the profile for 3 hours (10800 seconds)
      await cache.set(cacheKey, profile, 10800);

      return profile;
    } catch (error: any) {
      console.error(`[INSTAGRAM BUSINESS API] Profile error:`, error.response?.data || error.message);
      throw new Error('Failed to fetch Instagram Business profile');
    }
  }

  // Get user media with Business API insights - REFACTORED to use Batch Service
  async getUserMedia(accessToken: string): Promise<InstagramMedia[]> {
    try {
      console.log(`[INSTAGRAM BUSINESS API] Fetching media via Optimized Batch Service`);

      const { InstagramApiService } = await import('./services/instagramApi');
      const mediaWithInsights = await InstagramApiService.getRecentMediaWithInsights(accessToken, undefined);

      return mediaWithInsights.map(media => ({
        id: media.id,
        media_type: media.media_type,
        media_url: media.media_url || '',
        permalink: media.permalink || '',
        timestamp: media.timestamp,
        caption: media.caption,
        like_count: media.like_count || 0,
        comments_count: media.comments_count || 0,
        impressions: media.insights?.impressions || 0,
        reach: media.insights?.reach || 0,
        engagement: (media.like_count || 0) + (media.comments_count || 0) + (media.insights?.shares || 0) + (media.insights?.saves || 0),
        views: media.insights?.video_views || 0
      }));
    } catch (error: any) {
      console.error(`[INSTAGRAM BUSINESS API] Refactored media error:`, error.message);
      return [];
    }
  }

  // Get media insights - DEPRECATED in favor of batch media insights
  async getMediaInsights(mediaId: string, accessToken: string): Promise<any> {
    const { InstagramApiService } = await import('./services/instagramApi');
    return InstagramApiService.getMediaInsights(mediaId, accessToken);
  }

  // Get account insights - REFACTORED to use Batch Service
  async getAccountInsights(accessToken: string, period = 'day', since?: string, until?: string): Promise<InstagramInsights> {
    try {
      console.log(`[INSTAGRAM BUSINESS API] Fetching account insights via Optimized Batch Service`);

      const { InstagramApiService } = await import('./services/instagramApi');
      // Note: period 'day' is standard for these insights
      const insights = await InstagramApiService.getAccountInsights('me', accessToken, period as any);

      return {
        impressions: insights.impressions || 0,
        reach: insights.reach || 0,
        profile_views: insights.profile_views || 0,
        website_clicks: insights.website_clicks || 0,
        follower_count: insights.follower_count || 0
      };
    } catch (error: any) {
      console.error(`[INSTAGRAM BUSINESS API] Refactored account insights error:`, error.message);
      return {
        impressions: 0,
        reach: 0,
        profile_views: 0,
        website_clicks: 0,
        follower_count: 0
      };
    }
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
  async publishPhoto(accessToken: string, imageUrl: string, caption: string, accountId?: string, mentions?: string[], collaborators?: string[]): Promise<{
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
      const publishBaseUrl = this.getPublishApiBase(accountId);
      const payload: any = {
        image_url: fullImageUrl,
        caption: caption,
        access_token: accessToken
      };

      if (mentions && mentions.length > 0) {
        payload.user_tags = JSON.stringify(
          mentions.map((m: string) => ({
            username: m.replace(/^@+/, ''),
            x: 0.5,
            y: 0.5
          }))
        );
      }

      if (collaborators && collaborators.length > 0) {
        payload.collaborators = JSON.stringify(collaborators.map(c => c.replace(/^@+/, '')));
      }

      const containerResponse = await axios.post(`${publishBaseUrl}/media`, payload);

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Media container created: ${containerId}`);

      // Note: Unlike videos, photo containers are processed synchronously by Instagram.
      // We don't need to poll the status_code (and doing so returns a 400 error because status_code is not a valid field for photos).
      // We can immediately proceed to publish.

      // Step 2: Publish the media container
      const publishResponse = await axios.post(`${publishBaseUrl}/media_publish`, {
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
  async publishReel(accessToken: string, videoUrl: string, caption: string, accountId?: string, mentions?: string[], collaborators?: string[]): Promise<{
    id: string;
    permalink?: string;
    processing?: boolean;
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

      const publishBaseUrl = this.getPublishApiBase(accountId);
      const payload: any = {
        video_url: fullVideoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken
      };

      if (collaborators && collaborators.length > 0) {
        payload.collaborators = JSON.stringify(collaborators.map(c => c.replace(/^@+/, '')));
      }

      const containerResponse = await axios.post(`${publishBaseUrl}/media`, payload);

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Reel container created: ${containerId}`);

      // Step 2 & 3: Publish the reel container (with polling if not ready)
      // NEW ENTERPRISE ARCHITECTURE: No aggressive polling. 
      // Handled by the background verification queue.
      console.log(`[INSTAGRAM PUBLISH] Reel container ${containerId} created. Deferring to background verify queue.`);
      
      return { 
        id: containerId, 
        processing: true 
      };
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
              const compressionResult = await VideoCompressor.compressForInstagram(localPath);

              if (compressionResult.success && compressionResult.outputPath) {
                const originalSizeMB = (compressionResult.originalSize || 0) / 1024 / 1024;
                const compressedSizeMB = (compressionResult.compressedSize || 0) / 1024 / 1024;
                console.log(`[INSTAGRAM PUBLISH] Video compressed from ${originalSizeMB.toFixed(2)}MB to ${compressedSizeMB.toFixed(2)}MB`);

                const compressedUrl = compressionResult.outputPath.replace(process.cwd(), '').replace(/\\/g, '/');
                const finalUrl = compressedUrl.startsWith('/') ? compressedUrl : '/' + compressedUrl;
                return this.publishReel(accessToken, finalUrl, caption, accountId, mentions, collaborators);
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
  async publishStory(accessToken: string, mediaUrl: string, isVideo: boolean = false, accountId?: string): Promise<{
    id: string;
    permalink?: string;
    processing?: boolean;
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

      const publishBaseUrl = this.getPublishApiBase(accountId);
      const containerResponse = await axios.post(`${publishBaseUrl}/media`, mediaData);

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Story container created: ${containerId}`);

      // Step 2 & 3: For video stories, check processing status by polling media_publish
      let publishResponseData;
      if (isVideo) {
        // NEW ENTERPRISE ARCHITECTURE: No aggressive polling. 
        console.log(`[INSTAGRAM PUBLISH] Story video container ${containerId} created. Deferring to background verify queue.`);
        return { 
          id: containerId, 
          processing: true 
        };
      } else {
        // Step 3: Publish the image story container immediately
        const publishResponse = await axios.post(`${publishBaseUrl}/media_publish`, {
          creation_id: containerId,
          access_token: accessToken
        });
        publishResponseData = publishResponse.data;
      }

      console.log(`[INSTAGRAM PUBLISH] Story published successfully:`, publishResponseData);
      return publishResponseData;
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Story publish failed:`, error.response?.data || error.message);
      throw new Error(`Instagram story publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Intelligent video publishing with automatic compression when Instagram rejects due to file size
  async publishVideo(accessToken: string, videoUrl: string, caption: string, accountId?: string, mentions?: string[], collaborators?: string[]): Promise<{
    id: string;
    permalink?: string;
    processing?: boolean;
  }> {
    return this.publishVideoWithCompression(accessToken, videoUrl, caption, false, accountId, mentions, collaborators);
  }

  private async publishVideoWithCompression(
    accessToken: string,
    videoUrl: string,
    caption: string,
    isRetryWithCompression: boolean = false,
    accountId?: string,
    mentions?: string[],
    collaborators?: string[]
  ): Promise<{ id: string; permalink?: string; processing?: boolean; }> {
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
                const compressionResult = await VideoCompressor.compressForInstagram(localPath);

                if (compressionResult.success && compressionResult.outputPath) {
                  const compressedSizeMB = (compressionResult.compressedSize || 0) / 1024 / 1024;
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

      const containerPayload: any = {
        video_url: fullVideoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken
      };

      if (collaborators && collaborators.length > 0) {
        containerPayload.collaborators = JSON.stringify(collaborators.map(c => c.replace(/^@+/, '')));
      }

      console.log(`[INSTAGRAM API] Using corrected video URL: ${fullVideoUrl}`);

      console.log(`[INSTAGRAM API] Creating video container`);

      let containerResponse;
      const publishBaseUrl = this.getPublishApiBase(accountId);
      try {
        containerResponse = await axios.post(`${publishBaseUrl}/media`, containerPayload);
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
                  return await this.publishVideoWithCompression(accessToken, compressedUrl, caption, true, accountId);
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

      // Step 2 & 3: Publish the video container (with polling if not ready)
      // NEW ENTERPRISE ARCHITECTURE: No aggressive polling. 
      console.log(`[INSTAGRAM PUBLISH] Video container ${containerId} created. Deferring to background verify queue.`);
      
      return { 
        id: containerId, 
        processing: true 
      };
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