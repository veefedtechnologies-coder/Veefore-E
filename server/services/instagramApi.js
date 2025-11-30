import fs from 'fs';
import axios from 'axios';
// Instagram Graph API configuration
const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com';
const INSTAGRAM_GRAPH_API_VERSION = 'v23.0';
const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';
// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay
export class InstagramApiService {
    /**
     * Enforce rate limiting per token
     */
    static async enforceRateLimit(token) {
        const lastRequest = this.lastRequestTime.get(token) || 0;
        const timeSinceLastRequest = Date.now() - lastRequest;
        if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
            const delayNeeded = RATE_LIMIT_DELAY - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delayNeeded));
        }
        this.lastRequestTime.set(token, Date.now());
    }
    /**
     * Make a request to Instagram Graph API with retry logic
     */
    static async makeApiRequest(url, token, retryCount = 0) {
        try {
            // Enforce rate limiting
            await this.enforceRateLimit(token);
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'VeeFore/1.0',
                },
                timeout: 10000,
            });
            return response.data;
        }
        catch (error) {
            const axiosError = error;
            // Handle rate limiting (429 errors)
            if (axiosError.response?.status === 429) {
                const retryAfter = parseInt(axiosError.response.headers['retry-after'] || '60');
                if (retryCount < MAX_RETRIES) {
                    console.log(`🚦 Rate limited. Retrying after ${retryAfter} seconds. Attempt ${retryCount + 1}/${MAX_RETRIES}`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    return this.makeApiRequest(url, token, retryCount + 1);
                }
                throw {
                    code: 429,
                    message: 'Rate limit exceeded',
                    type: 'OAuthException',
                    is_rate_limit: true,
                    retry_after: retryAfter,
                };
            }
            // Handle other errors with exponential backoff
            if (axiosError.response?.status && axiosError.response.status >= 500 && retryCount < MAX_RETRIES) {
                const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
                console.log(`🔄 Server error. Retrying in ${delay}ms. Attempt ${retryCount + 1}/${MAX_RETRIES}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeApiRequest(url, token, retryCount + 1);
            }
            // Handle Instagram API errors
            if (axiosError.response?.data) {
                const apiError = axiosError.response.data;
                throw {
                    code: apiError.error?.code || axiosError.response.status,
                    message: apiError.error?.message || 'Instagram API error',
                    type: apiError.error?.type || 'APIError',
                    fbtrace_id: apiError.error?.fbtrace_id,
                    is_rate_limit: false,
                };
            }
            throw {
                code: axiosError.response?.status || 500,
                message: axiosError.message || 'Network error',
                type: 'NetworkError',
                is_rate_limit: false,
            };
        }
    }
    /**
     * Get Instagram account information
     */
    static async getAccountInfo(token) {
        const fields = [
            'id',
            'username',
            'name',
            'biography',
            'website',
            'followers_count',
            'follows_count',
            'media_count',
            'profile_picture_url',
            'account_type'
        ].join(',');
        const url = `${INSTAGRAM_GRAPH_API_BASE}/me?fields=${fields}&access_token=${token}`;
        return this.makeApiRequest(url, token);
    }
    /**
     * Get account insights (requires Business or Creator account)
     */
    static async getAccountInsights(accountId, token, period = 'day', since, until) {
        const metrics = [
            'impressions',
            'reach',
            'profile_views',
            'website_clicks',
            'follower_count'
        ];
        let url = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=${metrics.join(',')}&period=${period}&access_token=${token}`;
        if (since) {
            url += `&since=${Math.floor(since.getTime() / 1000)}`;
        }
        if (until) {
            url += `&until=${Math.floor(until.getTime() / 1000)}`;
        }
        const response = await this.makeApiRequest(url, token);
        // Transform insights data
        const insights = {};
        if (response.data) {
            response.data.forEach((insight) => {
                if (insight.values && insight.values.length > 0) {
                    const latestValue = insight.values[insight.values.length - 1];
                    insights[insight.name] = latestValue.value;
                }
            });
        }
        return insights;
    }
    /**
     * Get user's media (posts)
     */
    static async getUserMedia(token, limit = 25, after) {
        const fields = [
            'id',
            'media_type',
            'media_product_type',
            'media_url',
            'permalink',
            'thumbnail_url',
            'timestamp',
            'caption',
            'like_count',
            'comments_count',
            'is_shared_to_feed'
        ].join(',');
        let url = `${INSTAGRAM_GRAPH_API_BASE}/me/media?fields=${fields}&limit=${limit}&access_token=${token}`;
        if (after) {
            url += `&after=${after}`;
        }
        return this.makeApiRequest(url, token);
    }
    /**
     * Get user's Stories (separate from regular media)
     */
    static async getUserStories(token) {
        const fields = [
            'id',
            'media_type',
            'media_product_type',
            'media_url',
            'permalink',
            'thumbnail_url',
            'timestamp',
            'caption',
            'like_count',
            'comments_count',
            'is_shared_to_feed'
        ].join(',');
        const url = `${INSTAGRAM_GRAPH_API_BASE}/me/stories?fields=${fields}&access_token=${token}`;
        try {
            console.log(`[STORIES] 🔍 Fetching user stories from URL: ${url.replace(token, 'TOKEN_HIDDEN')}`);
            const result = await this.makeApiRequest(url, token);
            console.log(`[STORIES] ✅ Successfully fetched ${result.data?.length || 0} stories`);
            if (result.data && result.data.length > 0) {
                console.log(`[STORIES] 📋 Story details:`, result.data.map(story => ({
                    id: story.id,
                    media_type: story.media_type,
                    media_product_type: story.media_product_type,
                    timestamp: story.timestamp
                })));
            } else {
                console.log(`[STORIES] ⚠️ No stories found in response`);
            }
            return result;
        }
        catch (error) {
            console.log(`[STORIES] ❌ Failed to fetch stories:`, error.response?.data || error.message);
            console.log(`[STORIES] 🔍 Error details:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            // Return empty data if stories endpoint fails
            return { data: [] };
        }
    }
    /**
     * Get insights for specific media
     */
    static async getMediaInsights(mediaId, accessToken, mediaType, mediaProductType) {
        console.log(`[getMediaInsights] Called for mediaId: ${mediaId}`);
        let metrics;
        const isReel = mediaType === 'REEL' || mediaProductType === 'REELS';
        if (isReel) {
            // Reels support shares, saved, etc. - avoid plays as it's not supported for all Reels
            metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
        }
        else if (mediaType === 'VIDEO') {
            // Check if this is actually a Reel disguised as VIDEO
            if (mediaProductType === 'REELS') {
                console.log(`[MEDIA INSIGHTS] VIDEO ${mediaId} is actually a Reel (media_product_type=REELS)`);
                metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
            }
            else {
                // Classic video post - include shares and saved for feed videos
                console.log(`[MEDIA INSIGHTS] VIDEO ${mediaId} is a regular video (media_product_type=${mediaProductType || 'undefined'})`);
                metrics = ['reach', 'likes', 'comments', 'video_views', 'saved', 'shares'];
            }
        }
        else if (mediaType === 'STORY') {
            // Stories: avoid impressions which can be rejected; use minimal compatible set
            metrics = ['reach', 'replies', 'shares'];
        }
        else if (mediaType === 'CAROUSEL_ALBUM') {
            // Carousel - include shares and saved for feed carousels
            metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
        }
        else {
            // Image - include shares and saved for feed images
            metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
        }
        // Primary URLs
        const igUrl = `${INSTAGRAM_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`;
        const fbUrlPrimary = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`;
        let response;
        let lastError;
        try {
            // Use Instagram Graph first for all types (including STORY). Facebook is only a later fallback
            console.log(`[MEDIA INSIGHTS] Trying Instagram Graph API for ${mediaId} (${mediaType}) with metrics: ${metrics.join(',')}`);
            const res = await axios.get(igUrl, { timeout: 10000 });
            response = res.data;
            console.log(`[MEDIA INSIGHTS] ✅ Instagram Graph API success for ${mediaId}`);
        }
        catch (e) {
            lastError = e;
            console.log(`[MEDIA INSIGHTS] ❌ Instagram Graph API failed for ${mediaId}:`, e.response?.data || e.message);
            // Try with minimal metrics as fallback, tailored per media type
            const minimalMetrics = (() => {
                if (mediaType === 'STORY' || mediaProductType === 'STORY') {
                    // Minimal, story-safe metrics (no impressions)
                    return ['reach', 'replies', 'shares'];
                }
                if (isReel || mediaProductType === 'REELS') {
                    // Reels minimal set (avoid plays to reduce failures)
                    return ['reach', 'likes', 'comments', 'shares', 'saved'];
                }
                // Feed posts (IMAGE/VIDEO/CAROUSEL)
                return ['reach', 'likes', 'comments', 'shares', 'saved'];
            })();
            const minimalUrl = `${INSTAGRAM_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${minimalMetrics.join(',')}&access_token=${token}`;
            try {
                console.log(`[MEDIA INSIGHTS] Trying Instagram Graph API with minimal metrics for ${mediaId}`);
                const res = await axios.get(minimalUrl, { timeout: 10000 });
                response = res.data;
                console.log(`[MEDIA INSIGHTS] ✅ Instagram Graph API success with minimal metrics for ${mediaId}`);
            }
            catch (minimalError) {
                console.log(`[MEDIA INSIGHTS] ❌ Instagram Graph API minimal metrics also failed for ${mediaId}:`, minimalError.response?.data || minimalError.message);
                // Avoid Facebook fallback when token parsing fails (noise for some environments)
                const igCannotParse = String(lastError?.response?.data?.error?.message || '').includes('Cannot parse access token')
                    || String(minimalError?.response?.data?.error?.message || '').includes('Cannot parse access token');
                try {
                    if (igCannotParse) {
                        throw new Error('Skip Facebook fallback due to token parse error');
                    }
                    // Final fallback: Facebook Graph
                    const fbUrl = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${minimalMetrics.join(',')}&access_token=${token}`;
                    console.log(`[MEDIA INSIGHTS] Trying Facebook Graph API with minimal metrics for ${mediaId}`);
                    const res = await axios.get(fbUrl, { timeout: 10000 });
                    response = res.data;
                    console.log(`[MEDIA INSIGHTS] ✅ Facebook Graph API success with minimal metrics for ${mediaId}`);
                }
                catch (fbError) {
                    console.log(`[MEDIA INSIGHTS] ❌ Facebook Graph API also failed for ${mediaId}:`, fbError.response?.data || fbError.message);
                    throw new Error(`All API attempts failed. Instagram: ${lastError.response?.data?.error?.message || lastError.message}. Instagram minimal: ${minimalError.response?.data?.error?.message || minimalError.message}. Facebook: ${fbError.response?.data?.error?.message || fbError.message}`);
                }
            }
        }
        // Transform insights data
        const insights = {};
        console.log(`[MEDIA INSIGHTS DEBUG] Raw API response for ${mediaId}:`, JSON.stringify(response.data, null, 2));
        
        // Enhanced debugging for saves issue
        fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[RAW API RESPONSE] MediaID: ${mediaId}, MediaType: ${mediaType}\n`);
        fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[RAW API RESPONSE] Full response: ${JSON.stringify(response.data, null, 2)}\n`);
        fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[RAW API RESPONSE] Requested metrics: ${metrics.join(',')}\n`);
        
        if (response.data) {
            response.data.forEach((insight) => {
                if (insight.values && insight.values.length > 0) {
                    const value = insight.values[0].value;
                    const name = insight.name;
                    console.log(`[MEDIA INSIGHTS DEBUG] Processing metric: ${name} = ${value}`);
                    // Normalize metric names for downstream consumers
                    if (name === 'saved') {
                        insights.saves = value;
                        console.log(`[MEDIA INSIGHTS DEBUG] ✅ Mapped 'saved' to 'saves': ${value}`);
                        fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[MEDIA INSIGHTS DEBUG] ✅ Found saves: ${value}\n`);
                    }
                    else if (name === 'plays') {
                        insights.video_views = value;
                    }
                    else {
                        insights[name] = value;
                        console.log(`[MEDIA INSIGHTS DEBUG] Attempting to write to log file for metric: ${name}`);
                        if (name === 'shares') {
                            fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[MEDIA INSIGHTS DEBUG] ✅ Found shares: ${value}\n`);
                        }
                    }
                }
                else {
                    console.log(`[MEDIA INSIGHTS DEBUG] Attempting to write to log file for missing metric: ${insight.name}`);
                    fs.appendFileSync('e:\\Veefed Veefore\\Veefore\\server\\logs\\instagram_api_debug.log', `[MEDIA INSIGHTS DEBUG] ❌ Metric ${insight.name} has no values or value is undefined.\n`);
                }
            });
        }
        console.log(`[MEDIA INSIGHTS DEBUG] Final insights object for ${mediaId}:`, insights);
        // For STORY, if shares is still missing, try a last-resort single-metric call
        if ((mediaType === 'STORY' || mediaProductType === 'STORY') && (insights.shares === undefined)) {
            try {
                const singleUrl = `${INSTAGRAM_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=shares&access_token=${token}`;
                console.log(`[MEDIA INSIGHTS] STORY shares single-metric attempt for ${mediaId}`);
                const single = await axios.get(singleUrl, { timeout: 8000 });
                const data = single.data?.data || [];
                const metric = data.find((m) => m.name === 'shares');
                if (metric?.values?.[0]?.value !== undefined) {
                    insights.shares = metric.values[0].value;
                }
            }
            catch { }
        }
        // No extra calls for replies to avoid additional API usage; replies should arrive in the main insights response
        return insights;
    }
    /**
     * Get recent media with insights (last 7 days)
     */
    static async getRecentMediaWithInsights(token, days = 7) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        // Get recent media
        const mediaResponse = await this.getUserMedia(token, 50);
        // Filter media from last X days
        const recentMedia = mediaResponse.data.filter(media => {
            const mediaDate = new Date(media.timestamp);
            return mediaDate >= sinceDate;
        });
        // Get insights for each media item
        const mediaWithInsights = await Promise.allSettled(recentMedia.map(async (media) => {
            try {
                const insights = await this.getMediaInsights(media.id, token, media.media_type);
                return { ...media, insights };
            }
            catch (error) {
                console.warn(`⚠️ Could not fetch insights for media ${media.id}:`, error);
                return media;
            }
        }));
        return mediaWithInsights
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
    }
    /**
     * Refresh Instagram access token
     */
    static async refreshAccessToken(token) {
        const url = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
        return this.makeApiRequest(url, token);
    }
    /**
     * Validate Instagram access token
     */
    static async validateToken(token) {
        try {
            const url = `${FACEBOOK_GRAPH_API_BASE}/debug_token?input_token=${token}&access_token=${token}`;
            const response = await this.makeApiRequest(url, token);
            return {
                is_valid: response.data?.is_valid || false,
                scopes: response.data?.scopes,
                expires_at: response.data?.expires_at,
            };
        }
        catch (error) {
            return { is_valid: false };
        }
    }
    /**
     * Get comprehensive metrics for dashboard
     */
    static async getComprehensiveMetrics(token, accountId, days = 7) {
        try {
            // Get account info
            const account = await this.getAccountInfo(token);
            // Get account insights (if Business/Creator account)
            let insights = {};
            if (accountId && (account.account_type === 'BUSINESS' || account.account_type === 'CREATOR')) {
                try {
                    insights = await this.getAccountInsights(accountId, token, 'day');
                }
                catch (error) {
                    console.warn('⚠️ Could not fetch account insights:', error);
                }
            }
            // Get recent media with insights
            const recentMedia = await this.getRecentMediaWithInsights(token, days);
            // Calculate aggregated metrics
            const aggregated = recentMedia.reduce((acc, media) => {
                acc.totalLikes += media.like_count || 0;
                acc.totalComments += media.comments_count || 0;
                acc.totalShares += media.insights?.shares || 0;
                acc.totalSaves += media.insights?.saves || 0;
                acc.totalReach += media.insights?.reach || 0;
                acc.totalImpressions += media.insights?.impressions || 0;
                return acc;
            }, {
                totalLikes: 0,
                totalComments: 0,
                totalShares: 0,
                totalSaves: 0,
                totalReach: 0,
                totalImpressions: 0,
                averageEngagementRate: 0,
            });
            // Calculate average engagement rate
            if (recentMedia.length > 0 && account.followers_count > 0) {
                const totalEngagements = aggregated.totalLikes + aggregated.totalComments + aggregated.totalShares + aggregated.totalSaves;
                aggregated.averageEngagementRate = (totalEngagements / (account.followers_count * recentMedia.length)) * 100;
            }
            return {
                account,
                insights,
                recentMedia,
                aggregated,
            };
        }
        catch (error) {
            console.error('🚨 Error fetching comprehensive metrics:', error);
            throw error;
        }
    }
    /**
     * Get simple engagement data for recent posts
     */
    static async getSimpleEngagementData(token, limit = 6) {
        try {
            console.log(`[SIMPLE ENGAGEMENT] Fetching simple engagement data for ${limit} posts + up to 4 stories`);
            // Get recent media (posts)
            const mediaResponse = await this.getUserMedia(token, limit);
            const postItems = mediaResponse.data || [];
            // Get recent stories (up to 4)
            const storiesResponse = await this.getUserStories(token);
            const storyItems = (storiesResponse.data || []).slice(0, 4);
            // Combine: stories first (they expire) then posts
            const mediaItems = [...storyItems, ...postItems];
            let totalLikes = 0;
            let totalComments = 0;
            let totalShares = 0;
            let totalSaves = 0;
            let totalReach = 0;
            let totalReplies = 0;
            // Process each media item (posts + stories)
            for (const media of mediaItems) {
                try {
                    console.log(`[SIMPLE ENGAGEMENT DEBUG] Processing media ${media.id} (type: ${media.media_type}, product_type: ${media.media_product_type})`);
                    // Get insights for this media
                    const insights = await this.getMediaInsights(media.id, token, 
                    // Normalize media type: force STORY when media_product_type indicates STORY
                    (media.media_product_type === 'STORY') ? 'STORY' : media.media_type, media.media_product_type);
                    if (insights) {
                        console.log(`[SIMPLE ENGAGEMENT DEBUG] Insights for ${media.id}:`, insights);
                        totalLikes += insights.likes || 0;
                        totalComments += insights.comments || 0;
                        totalShares += insights.shares || 0;
                        totalSaves += insights.saves || 0;
                        totalReplies += insights.replies || 0;
                        totalReach += insights.reach || 0;
                        console.log(`[SIMPLE ENGAGEMENT DEBUG] Running totals - Shares: ${totalShares}, Saves: ${totalSaves}`);
                    }
                    else {
                        console.log(`[SIMPLE ENGAGEMENT DEBUG] No insights returned for ${media.id}`);
                    }
                }
                catch (insightError) {
                    console.warn(`[SIMPLE ENGAGEMENT] Failed to get insights for media ${media.id}:`, insightError);
                    // Continue with other media items
                }
            }
            const result = {
                totalLikes,
                totalComments,
                totalShares,
                totalSaves,
                totalReach,
                postsAnalyzed: mediaItems.length,
                totalReplies,
                avgLikes: mediaItems.length > 0 ? Math.round(totalLikes / mediaItems.length) : 0,
                avgComments: mediaItems.length > 0 ? Math.round(totalComments / mediaItems.length) : 0,
                avgReach: mediaItems.length > 0 ? Math.round(totalReach / mediaItems.length) : 0
            };
            console.log(`[SIMPLE ENGAGEMENT] ✅ Successfully calculated engagement data (posts=${postItems.length}, stories=${storyItems.length}):`, result);
            return result;
        }
        catch (error) {
            console.error(`[SIMPLE ENGAGEMENT] ❌ Failed to get simple engagement data:`, error);
            throw error;
        }
    }
    /**
     * Check if token has required permissions
     */
    static async checkTokenPermissions(token) {
        try {
            const validation = await this.validateToken(token);
            return validation.scopes || [];
        }
        catch (error) {
            console.error('🚨 Error checking token permissions:', error);
            return [];
        }
    }
    /**
     * Determine if a token can be used against Facebook Graph endpoints (required for insights)
     * Uses a minimal /me call without Authorization header to avoid header/query conflicts
     */
    static async isFacebookGraphCompatible(token) {
        try {
            const url = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/me?access_token=${token}`;
            // Use a raw axios call without Authorization header
            const response = await axios.get(url, { timeout: 8000 });
            return !!response.data?.id;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Determine if token can call Instagram Graph v22 endpoints
     */
    static async isInstagramGraphCompatible(token) {
        try {
            const url = `${INSTAGRAM_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/me?access_token=${token}`;
            const response = await axios.get(url, { timeout: 8000 });
            return !!response.data?.id;
        }
        catch (e) {
            return false;
        }
    }
}
InstagramApiService.lastRequestTime = new Map();
export default InstagramApiService;
