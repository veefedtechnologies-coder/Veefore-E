import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { RequestDeduplicator } from '../../../services/request-deduplicator';
import { CacheService } from '../../../services/cache-service';
import { GovernedHttpClient, GovernedHttpClientError, type GovernedRequestOptions } from '../../../services/GovernedHttpClient';
import { getUsageStoreInstance } from '../../../services/UsageStore';
import { rateLimitConfig } from '../../../config/rateLimitConfig';
import * as crypto from 'crypto';

/**
 * Access Token Data Structure
 */
export interface AccessToken {
  token: string;
  userId: string;
  expiresAt: Date;
  tokenType: 'short_lived' | 'long_lived';
  scopes?: string[];
}

/**
 * Instagram API Response Types
 */
export interface InstagramApiResponse<T = any> {
  data: T;
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Repository Interface for Instagram Data Access
 * Abstracts MongoDB, Redis, and Instagram API interactions
 */
export interface IInstagramRepository {
  /**
   * Save access token to database and cache
   * @param userId User identifier
   * @param token Access token data
   */
  saveAccessToken(userId: string, token: AccessToken): Promise<void>;

  /**
   * Get access token from cache or database
   * @param userId User identifier
   * @returns Access token data or null if not found
   */
  getAccessToken(userId: string): Promise<AccessToken | null>;

  /**
   * Refresh access token with Instagram API
   * @param userId User identifier
   * @returns New access token data
   */
  refreshToken(userId: string): Promise<AccessToken>;

  /**
   * Make a call to Instagram Graph API
   * @param endpoint API endpoint (relative to base URL)
   * @param method HTTP method
   * @param data Request payload
   * @param accessToken Access token for authentication
   * @returns API response data
   */
  callInstagramAPI<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    data: any,
    accessToken: string
  ): Promise<InstagramApiResponse<T>>;
}

/**
 * Instagram Repository Implementation
 * Handles all data access operations for Instagram integration
 */
export class InstagramRepository implements IInstagramRepository {
  private readonly baseUrl = 'https://graph.instagram.com';
  private readonly facebookGraphUrl = 'https://graph.facebook.com/v22.0';
  private readonly cache: CacheService;
  private readonly deduplicator: RequestDeduplicator;

  // MongoDB models - lazy loaded to avoid circular dependencies
  private _UserModel: any;
  private _SocialAccountModel: any;

  constructor() {
    this.cache = CacheService.getInstance();
    this.deduplicator = RequestDeduplicator.getInstance();
  }

  /**
   * Lazy load User model
   */
  private async getUserModel() {
    if (!this._UserModel) {
      const { User } = await import('../../../models/User');
      this._UserModel = User;
    }
    return this._UserModel;
  }

  /**
   * Lazy load SocialAccount model
   */
  private async getSocialAccountModel() {
    if (!this._SocialAccountModel) {
      // Try to import SocialAccount model if it exists
      try {
        const { SocialAccount } = await import('../../../models/SocialAccount');
        this._SocialAccountModel = SocialAccount;
      } catch (error) {
        // If SocialAccount model doesn't exist, we'll store tokens in User model
        console.log('[INSTAGRAM REPOSITORY] SocialAccount model not found, using User model for token storage');
        this._SocialAccountModel = null;
      }
    }
    return this._SocialAccountModel;
  }

  /**
   * Generate cache key for access token
   */
  private getTokenCacheKey(userId: string): string {
    return `instagram_token_${userId}`;
  }

  /**
   * Generate cache key for API responses
   */
  private getApiCacheKey(endpoint: string, accessToken: string): string {
    const tokenHash = crypto.createHash('md5').update(accessToken).digest('hex');
    const endpointHash = crypto.createHash('md5').update(endpoint).digest('hex');
    return `instagram_api_${endpointHash}_${tokenHash}`;
  }

  /**
   * Save access token to database and cache
   */
  async saveAccessToken(userId: string, token: AccessToken): Promise<void> {
    try {
      const cacheKey = this.getTokenCacheKey(userId);
      
      // Save to cache first for fast access (cache for 1 hour)
      await this.cache.set(cacheKey, token, 3600);
      console.log(`[INSTAGRAM REPOSITORY] Token cached for user ${userId}`);

      // Save to database
      const SocialAccountModel = await this.getSocialAccountModel();
      
      if (SocialAccountModel) {
        // Use SocialAccount model if available
        await SocialAccountModel.findOneAndUpdate(
          { userId, platform: 'instagram' },
          {
            userId,
            platform: 'instagram',
            accessToken: token.token,
            instagramUserId: token.userId,
            expiresAt: token.expiresAt,
            tokenType: token.tokenType,
            scopes: token.scopes || [],
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );
        console.log(`[INSTAGRAM REPOSITORY] Token saved to SocialAccount for user ${userId}`);
      } else {
        // Fallback to User model
        const UserModel = await this.getUserModel();
        await UserModel.findByIdAndUpdate(
          userId,
          {
            $set: {
              'instagram.accessToken': token.token,
              'instagram.instagramUserId': token.userId,
              'instagram.expiresAt': token.expiresAt,
              'instagram.tokenType': token.tokenType,
              'instagram.scopes': token.scopes || [],
              'instagram.updatedAt': new Date()
            }
          }
        );
        console.log(`[INSTAGRAM REPOSITORY] Token saved to User model for user ${userId}`);
      }
    } catch (error: any) {
      console.error(`[INSTAGRAM REPOSITORY] Error saving token for user ${userId}:`, error.message);
      throw new Error(`Failed to save access token: ${error.message}`);
    }
  }

  /**
   * Get access token from cache or database
   */
  async getAccessToken(userId: string): Promise<AccessToken | null> {
    try {
      const cacheKey = this.getTokenCacheKey(userId);
      
      // Try cache first
      const cachedToken = await this.cache.get<AccessToken>(cacheKey);
      if (cachedToken) {
        console.log(`[INSTAGRAM REPOSITORY] ✅ Cache HIT for token user ${userId}`);
        
        // Check if token is expired
        if (new Date() < new Date(cachedToken.expiresAt)) {
          return cachedToken;
        }
        console.log(`[INSTAGRAM REPOSITORY] Cached token expired for user ${userId}`);
      } else {
        console.log(`[INSTAGRAM REPOSITORY] ❌ Cache MISS for token user ${userId}`);
      }

      // Fetch from database
      const SocialAccountModel = await this.getSocialAccountModel();
      let tokenData: any = null;

      if (SocialAccountModel) {
        const account = await SocialAccountModel.findOne({ 
          userId, 
          platform: 'instagram' 
        }).lean();
        
        if (account) {
          tokenData = {
            token: account.accessToken,
            userId: account.instagramUserId,
            expiresAt: account.expiresAt,
            tokenType: account.tokenType || 'long_lived',
            scopes: account.scopes || []
          };
        }
      } else {
        // Fallback to User model
        const UserModel = await this.getUserModel();
        const user = await UserModel.findById(userId).lean();
        
        if (user?.instagram?.accessToken) {
          tokenData = {
            token: user.instagram.accessToken,
            userId: user.instagram.instagramUserId,
            expiresAt: user.instagram.expiresAt,
            tokenType: user.instagram.tokenType || 'long_lived',
            scopes: user.instagram.scopes || []
          };
        }
      }

      if (!tokenData) {
        console.log(`[INSTAGRAM REPOSITORY] No token found for user ${userId}`);
        return null;
      }

      // Check if token is expired
      if (new Date() >= new Date(tokenData.expiresAt)) {
        console.log(`[INSTAGRAM REPOSITORY] Token expired for user ${userId}, refresh needed`);
        return null;
      }

      // Update cache
      await this.cache.set(cacheKey, tokenData, 3600);
      console.log(`[INSTAGRAM REPOSITORY] Token fetched from DB and cached for user ${userId}`);

      return tokenData;
    } catch (error: any) {
      console.error(`[INSTAGRAM REPOSITORY] Error getting token for user ${userId}:`, error.message);
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }

  /**
   * Refresh access token with Instagram API
   */
  async refreshToken(userId: string): Promise<AccessToken> {
    try {
      console.log(`[INSTAGRAM REPOSITORY] Refreshing token for user ${userId}`);

      // Get current token
      const currentToken = await this.getAccessToken(userId);
      if (!currentToken) {
        throw new Error('No access token found to refresh');
      }

      // Call Instagram refresh token endpoint
      const params = new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: currentToken.token
      });

      const response = await axios.get(
        `${this.baseUrl}/refresh_access_token?${params.toString()}`
      );

      const { access_token, token_type, expires_in } = response.data;

      // Calculate new expiration date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      const newToken: AccessToken = {
        token: access_token,
        userId: currentToken.userId,
        expiresAt,
        tokenType: 'long_lived',
        scopes: currentToken.scopes
      };

      // Save refreshed token
      await this.saveAccessToken(userId, newToken);

      console.log(`[INSTAGRAM REPOSITORY] Token refreshed successfully for user ${userId}`);
      return newToken;
    } catch (error: any) {
      console.error(`[INSTAGRAM REPOSITORY] Error refreshing token for user ${userId}:`, error.response?.data || error.message);
      throw new Error(`Failed to refresh access token: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Make a call to Instagram Graph API with caching and deduplication.
   * Routes through GovernedHttpClient for usage header parsing and tier management.
   */
  async callInstagramAPI<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    data: any,
    accessToken: string
  ): Promise<InstagramApiResponse<T>> {
    try {
      // Determine base URL based on endpoint
      const baseUrl = endpoint.includes('/me') || endpoint.includes('/insights')
        ? this.baseUrl
        : this.facebookGraphUrl;

      // Build full URL
      const url = endpoint.startsWith('http') 
        ? endpoint 
        : `${baseUrl}/${endpoint.replace(/^\//, '')}`;

      console.log(`[INSTAGRAM REPOSITORY] API Call: ${method} ${url}`);

      // For GET requests, check cache first
      if (method === 'GET') {
        const cacheKey = this.getApiCacheKey(url, accessToken);
        const cached = await this.cache.get<InstagramApiResponse<T>>(cacheKey);
        
        if (cached) {
          console.log(`[INSTAGRAM REPOSITORY] ✅ Cache HIT for ${endpoint}`);
          return cached;
        }
        console.log(`[INSTAGRAM REPOSITORY] ❌ Cache MISS for ${endpoint}`);
      }

      // Extract accountId from the endpoint for usage tracking
      const accountId = this.extractAccountIdFromEndpoint(endpoint);

      // Parse the URL to get path and base for GovernedHttpClient
      let requestPath: string;
      let requestBaseUrl: string;
      if (endpoint.startsWith('http')) {
        const parsed = new URL(url);
        requestBaseUrl = `${parsed.protocol}//${parsed.host}`;
        requestPath = parsed.pathname;
      } else {
        requestBaseUrl = baseUrl;
        requestPath = `/${endpoint.replace(/^\//, '')}`;
      }

      // Build GovernedHttpClient and route the request through it
      const usageStore = getUsageStoreInstance();
      const client = new GovernedHttpClient(
        {
          baseUrl: requestBaseUrl,
          timeout: rateLimitConfig.httpTimeoutMs,
          maxRetries: rateLimitConfig.maxRetries,
          deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
        },
        usageStore
      );

      // Build request options for GovernedHttpClient
      const params: Record<string, string> = {};
      if (method === 'GET' && data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined && value !== null) {
            params[key] = String(value);
          }
        }
      }

      const requestOptions: GovernedRequestOptions = {
        method: method === 'DELETE' ? 'GET' : method, // GovernedHttpClient supports GET/POST; DELETE is rare
        path: requestPath,
        token: accessToken,
        params: method === 'GET' ? (Object.keys(params).length > 0 ? params : undefined) : undefined,
        body: method === 'POST' ? data : undefined,
        accountId,
        priority: 'normal',
      };

      const response = await client.request<any>(requestOptions);
      const responseData = response.data;

      const result: InstagramApiResponse<T> = {
        data: responseData.data || responseData,
        paging: responseData.paging
      };

      // Cache successful GET responses for 5 minutes
      if (method === 'GET') {
        const cacheKey = this.getApiCacheKey(url, accessToken);
        await this.cache.set(cacheKey, result, 300);
      }

      console.log(`[INSTAGRAM REPOSITORY] API call successful: ${method} ${endpoint}`);
      return result;
    } catch (error: any) {
      console.error(`[INSTAGRAM REPOSITORY] API call failed: ${method} ${endpoint}`, error.response?.data || error.message);
      
      // Return structured error response
      const metaErrorCode = error instanceof GovernedHttpClientError ? error.metaErrorCode : error.response?.data?.error?.code;
      return {
        data: null as any,
        error: {
          message: error.response?.data?.error?.message || error.message,
          type: error.response?.data?.error?.type || error.metaErrorType || 'APIError',
          code: error instanceof GovernedHttpClientError ? error.statusCode : (error.response?.status || 500),
          error_subcode: error.response?.data?.error?.error_subcode,
          fbtrace_id: error.response?.data?.error?.fbtrace_id
        }
      };
    }
  }

  /**
   * Extract Instagram account ID from an endpoint string for usage tracking.
   */
  private extractAccountIdFromEndpoint(endpoint: string): string {
    // Try to extract numeric ID from patterns like "17841400123/media" or "/v22.0/17841400123/insights"
    const idMatch = endpoint.match(/(\d{10,})/);
    if (idMatch) return idMatch[1];
    // Fallback
    return 'unknown';
  }
}

/**
 * Singleton instance
 */
let repositoryInstance: InstagramRepository | null = null;

/**
 * Get Instagram Repository instance (singleton)
 */
export function getInstagramRepository(): IInstagramRepository {
  if (!repositoryInstance) {
    repositoryInstance = new InstagramRepository();
  }
  return repositoryInstance;
}
