export interface InstagramAccountInfo {
    id: string;
    username: string;
    name?: string;
    biography?: string;
    website?: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
    profile_picture_url?: string;
    account_type?: 'PERSONAL' | 'BUSINESS' | 'CREATOR';
}
export interface InstagramMediaItem {
    id: string;
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY';
    media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
    media_url?: string;
    permalink?: string;
    thumbnail_url?: string;
    timestamp: string;
    caption?: string;
    like_count?: number;
    comments_count?: number;
    is_shared_to_feed?: boolean;
}
export interface InstagramInsights {
    impressions?: number;
    reach?: number;
    profile_views?: number;
    website_clicks?: number;
    follower_count?: number;
    email_contacts?: number;
    phone_call_clicks?: number;
    text_message_clicks?: number;
    get_directions_clicks?: number;
}
export interface InstagramMediaInsights {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    video_views?: number;
    engagement?: number;
}
export interface InstagramApiError {
    code: number;
    message: string;
    type: string;
    fbtrace_id?: string;
    is_rate_limit?: boolean;
    retry_after?: number;
}
export declare class InstagramApiService {
    private static lastRequestTime;
    /**
     * Enforce rate limiting per token
     */
    private static enforceRateLimit;
    /**
     * Make a request to Instagram Graph API with retry logic
     */
    private static makeApiRequest;
    /**
     * Get Instagram account information
     */
    static getAccountInfo(token: string): Promise<InstagramAccountInfo>;
    /**
     * Get account insights (requires Business or Creator account)
     */
    static getAccountInsights(accountId: string, token: string, period?: 'day' | 'week' | 'days_28', since?: Date, until?: Date): Promise<InstagramInsights>;
    /**
     * Get user's media (posts)
     */
    static getUserMedia(token: string, limit?: number, after?: string): Promise<{
        data: InstagramMediaItem[];
        paging?: any;
    }>;
    /**
     * Get user's Stories (separate from regular media)
     */
    static getUserStories(token: string): Promise<{
        data: InstagramMediaItem[];
        paging?: any;
    }>;
    /**
     * Get insights for specific media
     */
    static getMediaInsights(mediaId: string, accessToken: string, mediaType: string, mediaProductType?: string): Promise<any>;
    /**
     * Get recent media with insights (last 7 days)
     */
    static getRecentMediaWithInsights(token: string, days?: number): Promise<Array<InstagramMediaItem & {
        insights?: InstagramMediaInsights;
    }>>;
    /**
     * Refresh Instagram access token
     */
    static refreshAccessToken(token: string): Promise<{
        access_token: string;
        token_type: string;
    }>;
    /**
     * Validate Instagram access token
     */
    static validateToken(token: string): Promise<{
        is_valid: boolean;
        scopes?: string[];
        expires_at?: number;
    }>;
    /**
     * Get comprehensive metrics for dashboard
     */
    static getComprehensiveMetrics(token: string, accountId?: string, days?: number): Promise<{
        account: InstagramAccountInfo;
        insights: InstagramInsights;
        recentMedia: Array<InstagramMediaItem & {
            insights?: InstagramMediaInsights;
        }>;
        aggregated: {
            totalLikes: number;
            totalComments: number;
            totalShares: number;
            totalSaves: number;
            totalReach: number;
            totalImpressions: number;
            averageEngagementRate: number;
        };
    }>;
    /**
     * Get simple engagement data for recent posts
     */
    static getSimpleEngagementData(token: string, limit?: number): Promise<any>;
    /**
     * Check if token has required permissions
     */
    static checkTokenPermissions(token: string): Promise<string[]>;
    /**
     * Determine if a token can be used against Facebook Graph endpoints (required for insights)
     * Uses a minimal /me call without Authorization header to avoid header/query conflicts
     */
    static isFacebookGraphCompatible(token: string): Promise<boolean>;
    /**
     * Determine if token can call Instagram Graph v22 endpoints
     */
    static isInstagramGraphCompatible(token: string): Promise<boolean>;
}
export default InstagramApiService;
