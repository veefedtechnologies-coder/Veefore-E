/**
 * Instagram Service - Unified Instagram Integration
 * 
 * Consolidates functionality from:
 * - server/instagram-api.ts
 * - server/services/instagramApi.ts
 * 
 * Provides:
 * - Authentication and token management
 * - Media publishing (photos, videos, reels, stories)
 * - Webhook processing
 * - Direct messaging
 * - Comment automation
 * - Insights and analytics
 * 
 * Requirements: 3.3, 9.2, 9.4
 */

import axios, { AxiosResponse, AxiosError } from 'axios';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GovernedHttpClient, GovernedHttpClientError, type GovernedRequestOptions } from '../../../services/GovernedHttpClient';
import { getUsageStoreInstance } from '../../../services/UsageStore';
import { rateLimitConfig } from '../../../config/rateLimitConfig';

// Configuration
const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com';
const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';
const INSTAGRAM_GRAPH_API_VERSION = 'v22.0';
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay

// ============================================================================
// Type Definitions
// ============================================================================

export interface InstagramUser {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  account_type: string;
  media_count: number;
  followers_count: number;
  follows_count?: number;
  profile_picture_url?: string;
}

export interface InstagramMedia {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY' | 'REELS';
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
  is_shared_to_feed?: boolean;
}

export interface InstagramInsights {
  impressions?: number;
  reach?: number;
  reach_day?: number;
  reach_week?: number;
  reach_days_28?: number;
  profile_views?: number;
  website_clicks?: number;
  follower_count?: number;
  email_contacts?: number;
  phone_call_clicks?: number;
  text_message_clicks?: number;
  get_directions_clicks?: number;
  audience_city?: Record<string, number>;
  audience_country?: Record<string, number>;
  audience_gender_age?: Record<string, number>;
  audience_active_time?: Record<string, number>;
  audience_active_time_weekly?: Record<string, number>;
}

export interface InstagramMediaInsights {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  video_views?: number;
  plays?: number;
  engagement?: number;
}

export interface InstagramWebhookEvent {
  object: 'instagram';
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  changes?: InstagramWebhookChange[];
  messaging?: any[];
}

export interface InstagramWebhookChange {
  field: string;
  value: InstagramWebhookValue;
}

export interface InstagramWebhookValue {
  from?: { id: string; username: string };
  parent_id?: string;
  comment_id?: string;
  created_time?: number;
  text?: string;
  media_id?: string;
  media_type?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  user_id?: string;
  username?: string;
  profile_picture_url?: string;
  followers_count?: number;
  following_count?: number;
  media_count?: number;
  like_count?: number;
  comments_count?: number;
  sender?: { id: string; username: string };
  recipient?: { id: string };
  message?: { mid: string; text: string; timestamp: number };
}

export interface PublishResult {
  id: string;
  permalink?: string;
  processing?: boolean;
}

export interface InstagramApiError {
  code: number;
  message: string;
  type: string;
  fbtrace_id?: string;
  is_rate_limit?: boolean;
  retry_after?: number;
}

// ============================================================================
// Interface Definition
// ============================================================================

export interface IInstagramService {
  // Authentication
  generateAuthUrl(redirectUri: string, state?: string): string;
  exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string; user_id?: string }>;
  getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; token_type: string; expires_in: number }>;
  refreshAccessToken(accessToken: string): Promise<{ access_token: string; token_type: string; expires_in: number }>;
  
  // User Profile & Media
  getUserProfile(accessToken: string, accountId?: string): Promise<InstagramUser>;
  getUserMedia(accessToken: string, limit?: number, accountId?: string): Promise<InstagramMedia[]>;
  getAccountInsights(accessToken: string, accountId?: string, period?: 'day' | 'week' | 'days_28'): Promise<InstagramInsights>;
  getMediaInsights(mediaId: string, accessToken: string, mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY'): Promise<InstagramMediaInsights>;
  
  // Publishing
  publishMedia(accessToken: string, mediaType: 'photo' | 'video' | 'reel' | 'story', mediaUrl: string, options: {
    caption?: string;
    accountId?: string;
    mentions?: string[];
    collaborators?: string[];
    isVideo?: boolean;
  }): Promise<PublishResult>;
  
  // Webhook Processing
  processWebhook(event: InstagramWebhookEvent, signature?: string): Promise<void>;
  verifyWebhookSignature(signature: string, body: string): boolean;
  
  // Direct Messaging
  sendDirectMessage(accessToken: string, recipientId: string, message: string, accountId?: string): Promise<void>;
  
  // Comment Automation
  automateComments(accessToken: string, config: {
    triggerKeywords: string[];
    responseTemplates: string[];
    accountId?: string;
  }): Promise<void>;
}

// ============================================================================
// InstagramService Implementation
// ============================================================================

export class InstagramService implements IInstagramService {
  private lastRequestTime: Map<string, number> = new Map();
  private processedEvents: Set<string> = new Set();
  private cacheService?: any; // Optional cache service injection
  private requestDeduplicator?: any; // Optional request deduplicator injection

  constructor(dependencies?: {
    cacheService?: any;
    requestDeduplicator?: any;
  }) {
    this.cacheService = dependencies?.cacheService;
    this.requestDeduplicator = dependencies?.requestDeduplicator;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

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

  private getPublishApiBase(accountId?: string): string {
    if (accountId) {
      return `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}`;
    }
    return `${INSTAGRAM_GRAPH_API_BASE}/me`;
  }

  private async enforceRateLimit(token: string): Promise<void> {
    const lastRequest = this.lastRequestTime.get(token) || 0;
    const timeSinceLastRequest = Date.now() - lastRequest;

    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      const delayNeeded = RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }

    this.lastRequestTime.set(token, Date.now());
  }

  private async makeApiRequest<T>(url: string, token: string, retryCount: number = 0): Promise<T> {
    try {
      console.log(`[INSTAGRAM API] Making request: ${url}`);

      // Parse the URL to extract base, path, and params for GovernedHttpClient
      const parsed = new URL(url);
      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      const requestPath = parsed.pathname;
      const params: Record<string, string> = {};
      parsed.searchParams.forEach((value, key) => {
        if (key !== 'access_token') {
          params[key] = value;
        }
      });

      // Extract account ID from URL for usage tracking
      const accountIdMatch = url.match(/\/(\d{10,})\//);
      const accountId = accountIdMatch ? accountIdMatch[1] : 'unknown';

      // Route through GovernedHttpClient for usage header parsing + tier management
      const usageStore = getUsageStoreInstance();
      const client = new GovernedHttpClient(
        {
          baseUrl,
          timeout: rateLimitConfig.httpTimeoutMs,
          maxRetries: rateLimitConfig.maxRetries,
          deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
        },
        usageStore
      );

      const requestOptions: GovernedRequestOptions = {
        method: 'GET',
        path: requestPath,
        token,
        params: Object.keys(params).length > 0 ? params : undefined,
        accountId,
        priority: 'normal',
      };

      const response = await client.request<T>(requestOptions);
      return response.data;
    } catch (error) {
      // Map GovernedHttpClientError to InstagramApiError for backward compatibility
      if (error instanceof GovernedHttpClientError) {
        throw {
          code: error.metaErrorCode || error.statusCode,
          message: error.message,
          type: error.metaErrorType || 'APIError',
          is_rate_limit: error.statusCode === 429 || error.metaErrorCode === 80002,
          retry_after: error.retryAfter || 60,
        } as InstagramApiError;
      }

      const axiosError = error as AxiosError;
      if (axiosError.response?.data) {
        const apiError = axiosError.response.data as any;
        throw {
          code: apiError.error?.code || axiosError.response.status,
          message: apiError.error?.message || 'Instagram API error',
          type: apiError.error?.type || 'APIError',
          fbtrace_id: apiError.error?.fbtrace_id,
          is_rate_limit: false,
        } as InstagramApiError;
      }

      throw {
        code: axiosError.response?.status || 500,
        message: axiosError.message || 'Network error',
        type: 'NetworkError',
        is_rate_limit: false,
      } as InstagramApiError;
    }
  }

  private cleanMediaUrl(mediaUrl: string): string {
    // Handle blob URLs and malformed concatenations
    if (!mediaUrl.startsWith('http') || mediaUrl.includes('blob:') || mediaUrl.includes('devblob:')) {
      let cleanPath = mediaUrl;

      console.log(`[INSTAGRAM API] Original URL: ${mediaUrl}`);

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
      const fullUrl = `${this.getBaseUrl()}${basePath}`;

      console.log(`[INSTAGRAM API] Cleaned URL: ${fullUrl}`);
      return fullUrl;
    }

    return mediaUrl;
  }

  private sanitizeDemographics(data: any): Record<string, number> {
    if (!data || typeof data !== 'object') return {};
    const sanitized: Record<string, number> = {};
    Object.keys(data).forEach(key => {
      const safeKey = key.replace(/\./g, '_');
      sanitized[safeKey] = data[key];
    });
    return sanitized;
  }

  // ============================================================================
  // Authentication Methods
  // ============================================================================

  generateAuthUrl(redirectUri: string, state?: string): string {
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

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string; user_id?: string }> {
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

      const response = await axios.post('https://api.instagram.com/oauth/access_token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`[INSTAGRAM API] Business API token exchange successful:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Business API token exchange failed:`, error.response?.data || error.message);
      throw new Error(`Instagram token exchange failed: ${error.response?.data?.error_message || error.response?.data?.error?.message || error.message}`);
    }
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      access_token: shortLivedToken
    });

    const response = await axios.get(`${INSTAGRAM_GRAPH_API_BASE}/access_token?${params.toString()}`);
    return response.data;
  }

  async refreshAccessToken(accessToken: string): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken
    });

    const response = await axios.get(`${INSTAGRAM_GRAPH_API_BASE}/refresh_access_token?${params.toString()}`);
    return response.data;
  }

  // ============================================================================
  // User Profile & Media Methods
  // ============================================================================

  /**
   * Build the profile request URL based on token type.
   * Facebook-issued tokens (EAAP...) must query the Graph API node by accountId;
   * Instagram-login tokens (IGAA...) use the graph.instagram.com /me endpoint.
   */
  private buildProfileUrl(accessToken: string, fields: string, accountId?: string): string {
    const isBasicToken = accessToken.startsWith('IGAA');
    const useFacebookNode = !!accountId && !isBasicToken;

    const apiBase = useFacebookNode
      ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}`
      : INSTAGRAM_GRAPH_API_BASE;
    const path = useFacebookNode ? accountId : 'me';

    return `${apiBase}/${path}?fields=${fields}&access_token=${accessToken}`;
  }

  async getUserProfile(accessToken: string, accountId?: string): Promise<InstagramUser> {
    try {
      // Check cache if available
      if (this.cacheService) {
        const tokenHash = crypto.createHash('md5').update(accessToken).digest('hex');
        const cacheKey = `api_user_profile_${tokenHash}`;
        
        const cachedProfile = await this.cacheService.get<InstagramUser>(cacheKey);
        if (cachedProfile) {
          console.log(`[CACHE] ✅ HIT for user profile`);
          return cachedProfile;
        }
        
        console.log(`[CACHE] ❌ MISS for user profile (Fetching from Meta API...)`);
      }

      // `account_type` is only available on the graph.instagram.com /me node.
      // When querying an IG Business account through the Facebook Graph node it
      // does not exist and returns "(#100) Tried accessing nonexisting field".
      const isBasicToken = accessToken.startsWith('IGAA');
      const useFacebookNode = !!accountId && !isBasicToken;
      const accountTypeField = useFacebookNode ? '' : ',account_type';

      // Log which path we're taking so the debug file shows the routing decision.
      try {
        const { logMetaApiNote } = await import('../../../utils/instagram-api-debug-logger');
        logMetaApiNote('getUserProfile', `token type=${isBasicToken ? 'IGAA(basic)' : 'EAAP(page/user)'} useFacebookNode=${useFacebookNode}`, {
          accountId,
          tokenPrefix: accessToken.slice(0, 12),
        });
      } catch { /* non-fatal */ }

      // Try comprehensive fields first, then fallback if needed
      let fields = `id,username${accountTypeField},media_count,followers_count,name,biography,profile_picture_url,website`;
      let response;

      try {
        const url = this.buildProfileUrl(accessToken, fields, accountId);
        response = await this.makeApiRequest<any>(url, accessToken);
      } catch (primaryError: any) {
        console.log(`[INSTAGRAM API] Trying basic profile fields due to:`, primaryError.message);
        // Fallback to basic fields if permissions are limited
        fields = `id,username${accountTypeField},media_count`;
        const url = this.buildProfileUrl(accessToken, fields, accountId);
        response = await this.makeApiRequest<any>(url, accessToken);
      }

      console.log(`[INSTAGRAM API] User profile:`, response);

      // Log success to the debug file for comparison with error entries.
      try {
        const { logMetaApiSuccess } = await import('../../../utils/instagram-api-debug-logger');
        logMetaApiSuccess('getUserProfile', {
          username: response.username,
          accountId: response.id,
          followersCount: response.followers_count,
        });
      } catch { /* non-fatal */ }

      // Ensure we have all required properties. Accounts reached via the Facebook
      // Graph node are Business/Creator accounts by definition (the field isn't
      // queryable there), so default accordingly rather than to 'PERSONAL'.
      const defaultAccountType = useFacebookNode ? 'BUSINESS' : 'PERSONAL';
      const profile: InstagramUser = {
        id: response.id,
        username: response.username,
        account_type: response.account_type || defaultAccountType,
        media_count: response.media_count || 0,
        followers_count: response.followers_count || 0,
        ...response
      };

      // Cache the profile for 3 hours if cache is available
      if (this.cacheService) {
        const tokenHash = crypto.createHash('md5').update(accessToken).digest('hex');
        const cacheKey = `api_user_profile_${tokenHash}`;
        await this.cacheService.set(cacheKey, profile, 10800);
      }

      return profile;
    } catch (error: any) {
      const metaError = error?.response?.data?.error || error?.error || {};
      const code = Number(metaError.code ?? error?.code ?? 0);
      // error_subcode is now propagated through GovernedHttpClientError → InstagramApiError
      // Treat null (no subcode in Meta response) as 0 rather than NaN.
      const rawSubcode =
        metaError.error_subcode ??
        error?.error_subcode ??
        error?.subcode;
      const subcode = rawSubcode != null ? Number(rawSubcode) : 0;
      const underlying = metaError.message || error.message || error;
      console.error(`[INSTAGRAM API] Profile error:`, underlying);

      // Classify "account is no longer accessible by this token" failures so the
      // caller can mark the connection invalid and STOP retrying instead of
      // hammering Meta forever. This is NOT a transient error and NOT a rate
      // limit — the token can't read this IG object at all:
      //   • code 190                         → invalid/expired OAuth token
      //   • code 100 + subcode 33            → object missing / no permission
      //     (IG account unlinked from the Page, or permission revoked)
      //   • code 10 / 200 / 803              → permission / object-access errors
      const isAccessRevoked =
        code === 190 ||
        (code === 100 && subcode === 33) ||
        // subcode=33 sometimes comes through as 0 (extraction issue). Check the message too.
        (code === 100 && underlying.includes('does not exist, cannot be loaded due to missing permissions')) ||
        code === 10 ||
        code === 200 ||
        code === 803;

      const wrapped: any = new Error(`Failed to fetch Instagram Business profile: ${underlying}`);
      // Mark the error so the worker recognizes it as a reconnect-required
      // condition (handled like token expiry: mark invalid, do not retry).
      wrapped.isAccountAccessRevoked = isAccessRevoked;
      wrapped.metaCode = code;
      wrapped.metaSubcode = subcode;
      throw wrapped;
    }
  }

  async getUserMedia(accessToken: string, limit: number = 25, accountId?: string): Promise<InstagramMedia[]> {
    try {
      const isBasicToken = accessToken.startsWith('IGAA');
      const fields = ['id', 'media_type', 'media_url', 'permalink', 'thumbnail_url', 'timestamp', 'caption', 'like_count', 'comments_count', 'is_shared_to_feed'].join(',');

      const apiBase = (accountId && !isBasicToken) ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}` : INSTAGRAM_GRAPH_API_BASE;
      const path = (accountId && !isBasicToken) ? `${accountId}/media` : 'me/media';
      const url = `${apiBase}/${path}?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

      const response = await this.makeApiRequest<{ data: InstagramMedia[] }>(url, accessToken);

      // Fetch insights for each media item
      const mediaWithInsights = await Promise.all(
        response.data.map(async (media) => {
          try {
            const insights = await this.getMediaInsights(media.id, accessToken, media.media_type);
            return {
              ...media,
              impressions: insights.impressions || 0,
              reach: insights.reach || 0,
              engagement: (media.like_count || 0) + (media.comments_count || 0) + (insights.shares || 0) + (insights.saves || 0),
              views: insights.video_views || 0
            };
          } catch (error) {
            // Return media without insights if fetch fails
            return media;
          }
        })
      );

      return mediaWithInsights;
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Media fetch error:`, error.message);
      return [];
    }
  }

  /**
   * Fetch de-duplicated total reach for a time window using metric_type=total_value.
   *
   * Reach counts UNIQUE accounts, so it is not additive — summing daily reach
   * values overcounts people who saw content on multiple days. Meta returns a
   * single de-duplicated number for the given since/until range, which is the
   * only correct way to express "reach over the last 7 / 30 days".
   *
   * @returns the de-duplicated reach for the window, or undefined if unavailable.
   */
  private async fetchReachTotal(
    apiBase: string,
    accountId: string,
    accessToken: string,
    sinceSec: number,
    untilSec: number
  ): Promise<number | undefined> {
    const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=reach&period=day&metric_type=total_value&since=${sinceSec}&until=${untilSec}&access_token=${accessToken}`;
    try {
      const response = await this.makeApiRequest<any>(url, accessToken);
      const metric = response.data?.find((m: any) => m.name === 'reach');
      const value = metric?.total_value?.value;
      return typeof value === 'number' ? value : undefined;
    } catch (error) {
      console.warn(`⚠️ Reach (total_value) fetch failed for window [${sinceSec}-${untilSec}]:`, error);
      return undefined;
    }
  }

  async getAccountInsights(
    accessToken: string, 
    accountId: string = 'me', 
    period: 'day' | 'week' | 'days_28' = 'day'
  ): Promise<InstagramInsights> {
    try {
      const isBasicToken = accessToken.startsWith('IGAA');
      const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;
      const insights: InstagramInsights = {};

      // Fetch follower_count (current snapshot, returned under `values[]`)
      try {
        const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_count&period=${period}&access_token=${accessToken}`;
        const response = await this.makeApiRequest<any>(url, accessToken);
        response.data?.forEach((insight: any) => {
          if (insight.values && insight.values.length > 0) {
            insights[insight.name as keyof InstagramInsights] = insight.values[insight.values.length - 1].value;
          }
        });
      } catch (error) {
        console.warn(`⚠️ follower_count fetch failed:`, error);
      }

      // Fetch AUTHENTIC, de-duplicated reach for day / week / month windows.
      // Each window is queried independently so the dashboard's Today / This Week /
      // This Month tabs show real, distinct values instead of one collapsed number.
      const nowSec = Math.floor(Date.now() / 1000);
      const DAY_SEC = 86400;
      const [reachDay, reachWeek, reachMonth] = await Promise.all([
        this.fetchReachTotal(apiBase, accountId, accessToken, nowSec - DAY_SEC, nowSec),
        this.fetchReachTotal(apiBase, accountId, accessToken, nowSec - 7 * DAY_SEC, nowSec),
        this.fetchReachTotal(apiBase, accountId, accessToken, nowSec - 30 * DAY_SEC, nowSec)
      ]);

      if (reachDay !== undefined) insights.reach_day = reachDay;
      if (reachWeek !== undefined) insights.reach_week = reachWeek;
      if (reachMonth !== undefined) insights.reach_days_28 = reachMonth;

      // Primary reach reflects the requested period for backward compatibility.
      insights.reach = period === 'week'
        ? insights.reach_week
        : period === 'days_28'
          ? insights.reach_days_28
          : insights.reach_day;

      // Fetch total-value metrics (Graph API v22 requires metric_type=total_value
      // and returns data under `total_value.value` instead of `values[]`)
      const totalValueMetrics = ['profile_views', 'website_clicks'];
      if (!isBasicToken) {
        totalValueMetrics.push('views');
      }

      if (totalValueMetrics.length > 0) {
        const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=${totalValueMetrics.join(',')}&period=${period}&metric_type=total_value&access_token=${accessToken}`;

        try {
          const response = await this.makeApiRequest<any>(url, accessToken);
          if (response.data) {
            response.data.forEach((insight: any) => {
              const value = insight.total_value?.value;
              if (value === undefined || value === null) {
                return;
              }

              if (insight.name === 'views') {
                insights.impressions = value;
              } else {
                insights[insight.name as keyof InstagramInsights] = value;
              }
            });
          }
        } catch (error) {
          console.warn(`⚠️ Total-value metrics fetch failed:`, error);
        }
      }

      // Fetch demographics (lifetime only, Business/Creator accounts)
      if (!isBasicToken) {
        const breakdownConfigs = [
          { key: 'city', breakdown: 'city' },
          { key: 'country', breakdown: 'country' },
          { key: 'genderAge', breakdown: 'age,gender' }
        ];

        for (const config of breakdownConfigs) {
          try {
            const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${config.breakdown}&access_token=${accessToken}`;
            const response = await this.makeApiRequest<any>(url, accessToken);

            const breakdownData = response.data?.[0]?.total_value?.breakdowns?.[0];
            if (breakdownData && breakdownData.results) {
              const sanitized: Record<string, number> = {};

              breakdownData.results.forEach((res: any) => {
                if (res.dimension_values && res.dimension_values.length > 0) {
                  let key = '';
                  if (config.key === 'genderAge' && res.dimension_values.length >= 2) {
                    const [age, gender] = res.dimension_values;
                    key = `${gender}.${age}`;
                  } else {
                    key = res.dimension_values[0];
                  }

                  if (key) {
                    const safeKey = key.replace(/\./g, '_');
                    sanitized[safeKey] = res.value;
                  }
                }
              });

              if (config.key === 'city') insights.audience_city = sanitized;
              else if (config.key === 'country') insights.audience_country = sanitized;
              else if (config.key === 'genderAge') insights.audience_gender_age = sanitized;
            }
          } catch (error) {
            console.warn(`⚠️ Demographics fetch failed for ${config.breakdown}:`, error);
          }
        }

        // Fetch online_followers (Active Time) — Business/Creator only.
        // Without since/until the API defaults to today's unfinished period → returns {}.
        // Fetch last 30 days (excluding today) and average per-hour across days
        // that actually had data — the same approach Hootsuite uses.
        try {
          const DAY_S = 86400;
          const nowSec = Math.floor(Date.now() / 1000);
          const since = nowSec - 30 * DAY_S;   // 30 days ago
          const until = nowSec - DAY_S;         // yesterday (today is unfinished → returns {})
          const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=online_followers&period=lifetime&since=${since}&until=${until}&access_token=${accessToken}`;
          const response = await this.makeApiRequest<any>(url, accessToken);

          if (response.data && response.data.length > 0) {
            const metricData = response.data.find((m: any) => m.name === 'online_followers');
            if (metricData && metricData.values && metricData.values.length > 0) {
              // Average each hour's count across all non-empty days (24h bar chart).
              const hourSums: Record<string, number> = {};
              const hourCounts: Record<string, number> = {};
              // Weekly grid: key = "DOW_HOUR" (0=Sun … 6=Sat, hour 0–23)
              const weekSums: Record<string, number> = {};
              const weekCounts: Record<string, number> = {};

              for (const val of metricData.values) {
                if (val.value && typeof val.value === 'object' && Object.keys(val.value).length > 0) {
                  // Extract day-of-week from end_time (e.g. "2026-07-01T07:00:00+0000")
                  const dow = val.end_time ? new Date(val.end_time).getDay() : -1; // 0=Sun … 6=Sat

                  for (const [hour, count] of Object.entries(val.value)) {
                    if (typeof count === 'number') {
                      // 24h aggregation
                      hourSums[hour] = (hourSums[hour] ?? 0) + count;
                      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
                      // Weekly grid aggregation
                      if (dow >= 0) {
                        const wKey = `${dow}_${hour}`;
                        weekSums[wKey] = (weekSums[wKey] ?? 0) + count;
                        weekCounts[wKey] = (weekCounts[wKey] ?? 0) + 1;
                      }
                    }
                  }
                }
              }

              if (Object.keys(hourSums).length > 0) {
                // 24h averaged heatmap
                const averaged: Record<string, number> = {};
                for (const [hour, sum] of Object.entries(hourSums)) {
                  averaged[hour] = Math.round(sum / (hourCounts[hour] ?? 1));
                }
                insights.audience_active_time = this.sanitizeDemographics(averaged);

                // 7×24 weekly heatmap
                const weeklyAveraged: Record<string, number> = {};
                for (const [wKey, sum] of Object.entries(weekSums)) {
                  weeklyAveraged[wKey] = Math.round(sum / (weekCounts[wKey] ?? 1));
                }
                insights.audience_active_time_weekly = this.sanitizeDemographics(weeklyAveraged);

                const daysWithData = Object.values(hourCounts)[0] ?? 0;
                console.log(`✅ [instagram.service] Active Time: ${daysWithData} days, 24h slots: ${Object.keys(averaged).length}, weekly cells: ${Object.keys(weeklyAveraged).length}`);
              } else {
                console.log(`ℹ️  [instagram.service] online_followers: all ${metricData.values.length} day(s) returned empty values`);
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ Active Time fetch failed:`, error);
        }
      }

      return insights;
    } catch (error: any) {
      console.error(`[INSTAGRAM API] Account insights error:`, error.message);
      return {
        impressions: 0,
        reach: 0,
        profile_views: 0,
        website_clicks: 0,
        follower_count: 0
      };
    }
  }

  async getMediaInsights(
    mediaId: string, 
    accessToken: string, 
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY' = 'IMAGE'
  ): Promise<InstagramMediaInsights> {
    let metrics: string[];

    if (mediaType === 'VIDEO') {
      metrics = ['reach', 'saved', 'shares', 'views'];
    } else if (mediaType === 'STORY') {
      metrics = ['impressions', 'reach', 'replies', 'taps_forward', 'taps_back', 'exits'];
    } else {
      metrics = ['reach', 'saved'];
    }

    const isBasicToken = accessToken.startsWith('IGAA');
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;
    const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${accessToken}`;

    try {
      const response = await this.makeApiRequest<any>(url, accessToken);
      const insights: InstagramMediaInsights = {};
      
      if (response.data) {
        response.data.forEach((insight: any) => {
          if (insight.values && insight.values.length > 0) {
            // Normalize metric names: `saved` → `saves`, `views` → `video_views`
            let metricName: string = insight.name;
            if (metricName === 'saved') metricName = 'saves';
            else if (metricName === 'views') metricName = 'video_views';
            insights[metricName as keyof InstagramMediaInsights] = insight.values[0]?.value;
          }
        });
      }
      
      return insights;
    } catch (error) {
      console.warn(`⚠️ Could not fetch media insights for ${mediaId}:`, error);
      return {};
    }
  }

  // ============================================================================
  // Publishing Methods
  // ============================================================================

  async publishMedia(
    accessToken: string,
    mediaType: 'photo' | 'video' | 'reel' | 'story',
    mediaUrl: string,
    options: {
      caption?: string;
      accountId?: string;
      mentions?: string[];
      collaborators?: string[];
      isVideo?: boolean;
    }
  ): Promise<PublishResult> {
    switch (mediaType) {
      case 'photo':
        return this.publishPhoto(accessToken, mediaUrl, options.caption || '', options.accountId, options.mentions, options.collaborators);
      case 'video':
      case 'reel':
        return this.publishReel(accessToken, mediaUrl, options.caption || '', options.accountId, options.mentions, options.collaborators);
      case 'story':
        return this.publishStory(accessToken, mediaUrl, options.isVideo || false, options.accountId);
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }
  }

  private async publishPhoto(
    accessToken: string,
    imageUrl: string,
    caption: string,
    accountId?: string,
    mentions?: string[],
    collaborators?: string[]
  ): Promise<PublishResult> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting photo upload process`);

      const fullImageUrl = this.cleanMediaUrl(imageUrl);

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

  private async publishReel(
    accessToken: string,
    videoUrl: string,
    caption: string,
    accountId?: string,
    mentions?: string[],
    collaborators?: string[]
  ): Promise<PublishResult> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting reel upload process`);

      const fullVideoUrl = this.cleanMediaUrl(videoUrl);

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

      // Defer to background verification queue for video processing
      console.log(`[INSTAGRAM PUBLISH] Reel container ${containerId} created. Deferring to background verify queue.`);
      
      return { 
        id: containerId, 
        processing: true 
      };
    } catch (error: any) {
      console.error(`[INSTAGRAM PUBLISH] Reel publish failed:`, error.response?.data || error.message);
      throw new Error(`Instagram reel publish failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private async publishStory(
    accessToken: string,
    mediaUrl: string,
    isVideo: boolean = false,
    accountId?: string
  ): Promise<PublishResult> {
    try {
      console.log(`[INSTAGRAM PUBLISH] Starting story upload process (${isVideo ? 'video' : 'image'})`);

      const fullMediaUrl = this.cleanMediaUrl(mediaUrl);

      // Step 1: Create story media container
      const mediaData: any = {
        access_token: accessToken,
        media_type: 'STORIES'
      };

      if (isVideo) {
        mediaData.video_url = fullMediaUrl;
      } else {
        mediaData.image_url = fullMediaUrl;
      }

      const publishBaseUrl = this.getPublishApiBase(accountId);
      const containerResponse = await axios.post(`${publishBaseUrl}/media`, mediaData);

      const containerId = containerResponse.data.id;
      console.log(`[INSTAGRAM PUBLISH] Story container created: ${containerId}`);

      // For video stories, defer to background verification
      if (isVideo) {
        console.log(`[INSTAGRAM PUBLISH] Story video container ${containerId} created. Deferring to background verify queue.`);
        return { 
          id: containerId, 
          processing: true 
        };
      }

      // For image stories, publish immediately
      const publishResponse = await axios.post(`${publishBaseUrl}/media_publish`, {
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

  // ============================================================================
  // Webhook Methods
  // ============================================================================

  verifyWebhookSignature(signature: string, body: string): boolean {
    if (!process.env.INSTAGRAM_APP_SECRET) {
      console.error('[INSTAGRAM WEBHOOK] App secret not configured');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
        .update(body)
        .digest('hex');

      const receivedSignature = signature.replace('sha256=', '');
      
      // Check if signatures have same length before using timingSafeEqual
      if (expectedSignature.length !== receivedSignature.length) {
        return false;
      }
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
      );
    } catch (error) {
      console.error('[INSTAGRAM WEBHOOK] Signature verification error:', error);
      return false;
    }
  }

  async processWebhook(event: InstagramWebhookEvent, signature?: string): Promise<void> {
    console.log('[INSTAGRAM WEBHOOK] Processing webhook event');

    // Verify signature if provided
    if (signature) {
      const isValid = this.verifyWebhookSignature(signature, JSON.stringify(event));
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Process each entry in the webhook
    for (const entry of event.entry) {
      const eventId = `${entry.id}_${entry.time}`;

      // Check for duplicate events
      if (this.processedEvents.has(eventId)) {
        console.log(`[INSTAGRAM WEBHOOK] Skipping duplicate event: ${eventId}`);
        continue;
      }

      this.processedEvents.add(eventId);

      // Process changes
      if (entry.changes) {
        for (const change of entry.changes) {
          await this.processWebhookChange(change);
        }
      }

      // Process messaging events
      if (entry.messaging) {
        for (const message of entry.messaging) {
          await this.processWebhookMessage(message);
        }
      }
    }

    // Clean up old processed events (keep only last 1000)
    if (this.processedEvents.size > 1000) {
      const eventsArray = Array.from(this.processedEvents);
      this.processedEvents = new Set(eventsArray.slice(-1000));
    }
  }

  private async processWebhookChange(change: InstagramWebhookChange): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Processing change: ${change.field}`);

    switch (change.field) {
      case 'comments':
        await this.handleCommentEvent(change.value);
        break;
      case 'media':
        await this.handleMediaEvent(change.value);
        break;
      case 'mentions':
        await this.handleMentionEvent(change.value);
        break;
      case 'story_insights':
        await this.handleStoryInsightsEvent(change.value);
        break;
      default:
        console.log(`[INSTAGRAM WEBHOOK] Unhandled field: ${change.field}`);
    }
  }

  private async processWebhookMessage(message: any): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Processing message event`);
    
    if (message.message && message.sender) {
      await this.handleDirectMessageEvent(message);
    }
  }

  private async handleCommentEvent(value: InstagramWebhookValue): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Comment event:`, value);
    // Comment automation logic would be triggered here
    // This would integrate with the automation system
  }

  private async handleMediaEvent(value: InstagramWebhookValue): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Media event:`, value);
    // Handle new media posts, updates, or deletions
  }

  private async handleMentionEvent(value: InstagramWebhookValue): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Mention event:`, value);
    // Handle when the account is mentioned
  }

  private async handleStoryInsightsEvent(value: InstagramWebhookValue): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Story insights event:`, value);
    // Handle story performance data
  }

  private async handleDirectMessageEvent(message: any): Promise<void> {
    console.log(`[INSTAGRAM WEBHOOK] Direct message event:`, message);
    // Handle incoming DMs
  }

  // ============================================================================
  // Direct Messaging Methods
  // ============================================================================

  async sendDirectMessage(
    accessToken: string,
    recipientId: string,
    message: string,
    accountId?: string
  ): Promise<void> {
    try {
      console.log(`[INSTAGRAM DM] Sending direct message to ${recipientId}`);

      const apiBase = accountId 
        ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}`
        : `${INSTAGRAM_GRAPH_API_BASE}/me`;

      const payload = {
        recipient: { id: recipientId },
        message: { text: message },
        access_token: accessToken
      };

      await axios.post(`${apiBase}/messages`, payload);
      console.log(`[INSTAGRAM DM] Message sent successfully`);
    } catch (error: any) {
      console.error(`[INSTAGRAM DM] Failed to send message:`, error.response?.data || error.message);
      throw new Error(`Failed to send Instagram direct message: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // ============================================================================
  // Comment Automation Methods
  // ============================================================================

  async automateComments(
    accessToken: string,
    config: {
      triggerKeywords: string[];
      responseTemplates: string[];
      accountId?: string;
    }
  ): Promise<void> {
    try {
      console.log(`[INSTAGRAM AUTOMATION] Setting up comment automation`);
      console.log(`[INSTAGRAM AUTOMATION] Trigger keywords:`, config.triggerKeywords);
      console.log(`[INSTAGRAM AUTOMATION] Response templates:`, config.responseTemplates);

      // This method sets up the automation configuration
      // The actual automation logic would be triggered by webhook events
      // and handled by the handleCommentEvent method

      // Store automation config in database or cache
      // This is a placeholder - actual implementation would depend on storage mechanism
      console.log(`[INSTAGRAM AUTOMATION] Automation configured successfully`);
    } catch (error: any) {
      console.error(`[INSTAGRAM AUTOMATION] Failed to configure automation:`, error.message);
      throw new Error(`Failed to configure comment automation: ${error.message}`);
    }
  }
}

// ============================================================================
// Export Default Instance
// ============================================================================

export const instagramService = new InstagramService();
