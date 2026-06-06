import axios, { AxiosResponse, AxiosError } from 'axios';

// Instagram Graph API configuration
const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com';
const INSTAGRAM_GRAPH_API_VERSION = 'v22.0';
const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay

// Interface definitions for API responses
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
  account_type?: 'PERSONAL' | 'BUSINESS' | 'CREATOR' | 'UNKNOWN';
}

export interface InstagramMediaItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY';
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

  // Audience Demographics
  audience_city?: Record<string, number>;
  audience_country?: Record<string, number>;
  audience_gender_age?: Record<string, number>;
  audience_active_time?: Record<string, number>;
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

// Error interface
export interface InstagramApiError {
  code: number;
  message: string;
  type: string;
  fbtrace_id?: string;
  is_rate_limit?: boolean;
  retry_after?: number;
}

export class InstagramApiService {
  private static lastRequestTime: Map<string, number> = new Map();

  /**
   * Enforce rate limiting per token
   */
  private static async enforceRateLimit(token: string): Promise<void> {
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
  private static async makeApiRequest<T>(
    url: string,
    token: string,
    retryCount: number = 0
  ): Promise<T> {
    try {
      // Enforce rate limiting
      await this.enforceRateLimit(token);

      console.log(`[INSTAGRAM API] Making request: ${url}`);

      const response: AxiosResponse<T> = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'VeeFore/1.0',
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

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
        } as InstagramApiError;
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

  /**
   * Get Instagram account information
   */
  static async getAccountInfo(token: string, accountId?: string): Promise<InstagramAccountInfo> {
    const isBasicToken = token.startsWith('IGAA');
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
      ...(accountId && !isBasicToken ? [] : ['account_type'])
    ].join(',');

    const apiBase = (accountId && !isBasicToken) ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}` : INSTAGRAM_GRAPH_API_BASE;
    const path = (accountId && !isBasicToken) ? accountId : 'me';

    const url = `${apiBase}/${path}?fields=${fields}&access_token=${token}`;
    return this.makeApiRequest<InstagramAccountInfo>(url, token);
  }

  /**
   * Get account insights (Reach, Impressions/Views, etc.)
   */
  static async getAccountInsights(
    accountId: string,
    token: string,
    period: 'day' | 'week' | 'days_28' = 'day',
    since?: Date,
    until?: Date
  ): Promise<InstagramInsights> {
    const isBasicToken = token.startsWith('IGAA');
    const isProfessional = !isBasicToken;
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;

    let insights: InstagramInsights = {};

    // 1. Fetch time-series metrics
    let standardMetrics = ['reach', 'follower_count', 'website_clicks', 'profile_views'];
    if (!isBasicToken) {
      standardMetrics.push('views'); // Use 'views' instead of 'impressions' as per terminal logs
    }

    if (period !== 'day') {
      // Many metrics only support 'day' period on newer API versions
      standardMetrics = standardMetrics.filter(m => ['reach', 'views'].includes(m));
    }

    if (standardMetrics.length > 0) {
      // v22.0 FIX: Some metrics require metric_type=total_value, 
      // while others (like 'reach') might NOT support it or have different period requirements.
      // We'll split them to be safe.
      const totalValueMetrics = standardMetrics.filter(m =>
        ['views', 'website_clicks', 'profile_views'].includes(m)
      );
      const timeSeriesMetrics = standardMetrics.filter(m =>
        !['views', 'website_clicks', 'profile_views'].includes(m)
      );

      // A. Fetch metrics requiring total_value
      if (totalValueMetrics.length > 0) {
        await this.fetchMetricWithFallbacks(accountId, token, totalValueMetrics, period, apiBase, insights, true);
      }

      // B. Fetch standard time-series metrics (like 'reach')
      if (timeSeriesMetrics.length > 0) {
        await this.fetchMetricWithFallbacks(accountId, token, timeSeriesMetrics, period, apiBase, insights, false);
      }
    }

    // 2. Fetch demographic metrics (lifetime only)
    if (!isBasicToken) {
      // v22.0 FIX: Response structure has changed to total_value.breakdowns
      // and we need joint distribution for age/gender to match mobile app expectations.
      const breakdownConfigs = [
        { key: 'city', breakdown: 'city' },
        { key: 'country', breakdown: 'country' },
        { key: 'genderAge', breakdown: 'age,gender' }
      ];

      for (const config of breakdownConfigs) {
        try {
          const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${config.breakdown}&access_token=${token}`;
          const response = await this.makeApiRequest<any>(url, token);

          // v22.0 specific structure check
          const breakdownData = response.data?.[0]?.total_value?.breakdowns?.[0];

          if (breakdownData && breakdownData.results) {
            const sanitized: Record<string, number> = {};

            breakdownData.results.forEach((res: any) => {
              if (res.dimension_values && res.dimension_values.length > 0) {
                // Synthesize key. For joint distribution (age,gender), format as "G.Age" (e.g. "F.18-24")
                let key = '';
                if (config.key === 'genderAge' && res.dimension_values.length >= 2) {
                  const [age, gender] = res.dimension_values;
                  key = `${gender}.${age}`; // e.g. "F.18-24"
                } else {
                  key = res.dimension_values[0];
                }

                if (key) {
                  // Dots to underscores for MongoDB compatibility if needed, 
                  // but React Native app expects dots for age/gender split
                  const safeKey = key.replace(/\./g, '_');
                  sanitized[safeKey] = res.value;
                }
              }
            });

            if (config.key === 'city') insights.audience_city = sanitized;
            else if (config.key === 'country') insights.audience_country = sanitized;
            else if (config.key === 'genderAge') insights.audience_gender_age = sanitized;
          } else if (response.data?.[0]?.values?.[0]?.value) {
            // Fallback for older versions if they still return basic values
            const value = response.data[0].values[0].value;
            if (config.key === 'city') insights.audience_city = this.sanitizeDemographics(value);
            else if (config.key === 'country') insights.audience_country = this.sanitizeDemographics(value);
            else if (config.key === 'genderAge') {
              insights.audience_gender_age = {
                ...(insights.audience_gender_age || {}),
                ...this.sanitizeDemographics(value)
              };
            }
          }
        } catch (error) {
          console.warn(`⚠️ Follower demographics fetch failed for breakdown ${config.breakdown}:`, error);
        }
      }
    }

    // 3. Fetch online_followers (Active Time) - Business/Creator only, needs >100 followers
    if (!isBasicToken) {
      try {
        const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=online_followers&period=lifetime&access_token=${token}`;
        const response = await this.makeApiRequest<any>(url, token);

        if (response.data && response.data.length > 0) {
          const metricData = response.data.find((m: any) => m.name === 'online_followers');
          if (metricData && metricData.values && metricData.values.length > 0) {
            const validValue = [...metricData.values].reverse().find((v: any) => v.value && Object.keys(v.value).length > 0);
            if (validValue) {
              // Sanitize keys: Instagram returns "day.hour" format (e.g., "0.12")
              // but Mongoose Map doesn't support dots in keys. Convert to "day_hour" (e.g., "0_12")
              insights.audience_active_time = this.sanitizeDemographics(validValue.value);
              console.log(`✅ Active Time data received with ${Object.keys(validValue.value).length} time slots`);
            } else {
              // API succeeded but returned empty values - data not available yet
              console.log(`ℹ️  online_followers: API returned successfully but all values are empty`);
              console.log(`   This means Instagram hasn't collected enough Active Time data yet`);
              console.log(`   The data may appear in the Instagram app before it's available via API`);
            }
          }
        }
      } catch (error: any) {
        console.warn(`⚠️  online_followers (Active Time) API request failed:`);
        console.warn(`   Error message: ${error.message || 'unknown'}`);
        console.warn(`   Error code: ${error.code || 'unknown'}`);
        console.warn(`   Error type: ${error.type || 'unknown'}`);
        if (error.response?.data) {
          console.warn(`   API Response:`, JSON.stringify(error.response.data, null, 2));
        }
      }
    }

    return insights;
  }

  /**
   * Get account info and insights for multiple periods in a single batch request
   */
  static async getBatchAccountInsights(
    accountId: string,
    token: string
  ): Promise<{ account?: InstagramAccountInfo; insights: InstagramInsights }> {
    const isBasicToken = token.startsWith('IGAA');
    const insights: InstagramInsights = {};
    let accountInfo: InstagramAccountInfo | undefined;

    try {
      const batchEntries: any[] = [];

      // 0. Account Info Snapshot
      const fields = [
        'id', 'username', 'name', 'biography', 'website',
        'followers_count', 'follows_count', 'media_count', 'profile_picture_url'
      ].join(',');
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}?fields=${fields}`
      });

      // 1. Reach & Follower Growth (1D)
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=reach,follower_count&period=day`
      });

      // 2. Reach (7D)
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=reach&period=week`
      });

      // 3. Reach (28D)
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=reach&period=days_28`
      });

      // 4. Views/Impressions (1D - total_value requirement)
      // Note: Views only reliably supports 'day' with total_value in v21.0+
      // 4. Views/Impressions (1D - total_value requirement)
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=views&period=day&metric_type=total_value`
      });

      // 5. Demographics: City
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city`
      });

      // 6. Demographics: Country
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country`
      });

      // 7. Demographics: Age, Gender
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender`
      });

      // 8. Active Time (online_followers)
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=online_followers&period=lifetime`
      });

      const params = new URLSearchParams();
      params.append('batch', JSON.stringify(batchEntries));
      params.append('access_token', token);

      const url = `${FACEBOOK_GRAPH_API_BASE}/`;
      const response = await axios.post(url, params);
      const batchResults = response.data;

      batchResults.forEach((entry: any, index: number) => {
        if (entry.code === 200 && entry.body) {
          try {
            const body = JSON.parse(entry.body);

            if (index === 0) {
              accountInfo = body;
            } else if (index >= 1 && index <= 3) {
              // Reach (Day, Week, 28D) & potentially follower_count
              if (body.data) {
                body.data.forEach((insight: any) => {
                  if (insight.values?.length) {
                    const val = insight.values[insight.values.length - 1].value;
                    if (insight.name === 'reach') {
                      if (index === 1) { insights.reach_day = val; if (!insights.reach) insights.reach = val; }
                      else if (index === 2) insights.reach_week = val;
                      else if (index === 3) { insights.reach_days_28 = val; insights.reach = val; }
                    } else if (insight.name === 'follower_count' && index === 1) {
                      insights.follower_count = val;
                    }
                  }
                });
              }
            } else if (index === 4) {
              // Views/Impressions
              if (body.data) {
                body.data.forEach((insight: any) => {
                  if (insight.name === 'views' && insight.values?.length) {
                    insights.impressions = insight.values[insight.values.length - 1].value;
                  }
                });
              }
            } else if (index >= 5 && index <= 7) {
              // Demographics
              const breakdownData = body.data?.[0]?.total_value?.breakdowns?.[0];
              if (breakdownData && breakdownData.results) {
                const sanitized: Record<string, number> = {};
                breakdownData.results.forEach((res: any) => {
                  if (res.dimension_values?.length) {
                    let key = res.dimension_values[0];
                    if (index === 7 && res.dimension_values.length >= 2) {
                      // Age, Gender format: F.18-24
                      const [age, gender] = res.dimension_values;
                      key = `${gender}.${age}`;
                    }
                    const safeKey = key.replace(/\./g, '_');
                    sanitized[safeKey] = res.value;
                  }
                });

                if (index === 5) insights.audience_city = sanitized;
                else if (index === 6) insights.audience_country = sanitized;
                else if (index === 7) insights.audience_gender_age = sanitized;
              }
            } else if (index === 8) {
              // Active Time
              const metricData = body.data?.find((m: any) => m.name === 'online_followers');
              if (metricData?.values?.length) {
                const validValue = [...metricData.values].reverse().find((v: any) => v.value && Object.keys(v.value).length > 0);
                if (validValue) {
                  // Sanitize day.hour -> day_hour
                  const sanitized: Record<string, number> = {};
                  Object.keys(validValue.value).forEach(k => {
                    sanitized[k.replace(/\./g, '_')] = validValue.value[k];
                  });
                  insights.audience_active_time = sanitized;
                }
              }
            }
          } catch (e) {
            // Parse error for specific entry
          }
        }
      });

      return { account: accountInfo, insights };
    } catch (error: any) {
      console.warn(`⚠️ Comprehensive batch fetch failed:`, error.message);

      // Fallback sequentially if batch fails
      const fallbackAccount = await this.getAccountInfo(token, accountId);
      const fallbackInsights = await this.getAccountInsights(accountId, token, 'day');
      return { account: fallbackAccount, insights: fallbackInsights };
    }
  }

  /**
   * Internal helper to fetch metrics with period fallbacks
   */
  private static async fetchMetricWithFallbacks(
    accountId: string,
    token: string,
    metrics: string[],
    preferredPeriod: string,
    apiBase: string,
    insights: InstagramInsights,
    useTotalValue: boolean
  ): Promise<void> {
    const tryPeriods = [preferredPeriod, 'day'];

    for (const period of tryPeriods) {
      try {
        let url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=${metrics.join(',')}&period=${period}&access_token=${token}`;
        if (useTotalValue) url += '&metric_type=total_value';

        const response = await this.makeApiRequest<any>(url, token);
        if (response.data) {
          response.data.forEach((insight: any) => {
            if (insight.values && insight.values.length > 0) {
              // Pick the most recent non-zero value if available, otherwise just use the latest
              const nonZeroValue = [...insight.values].reverse().find((v: any) => v.value > 0);
              const value = nonZeroValue ? nonZeroValue.value : insight.values[insight.values.length - 1].value;

              if (insight.name === 'views') {
                insights.impressions = (insights.impressions || 0) + value;
              } else if (insight.name === 'reach') {
                insights.reach = value;
                // Also populate granular fields based on the period we just fetched
                if (period === 'day') insights.reach_day = value;
                else if (period === 'week') insights.reach_week = value;
                else if (period === 'days_28') insights.reach_days_28 = value;
              } else {
                insights[insight.name as keyof InstagramInsights] = value;
              }
            }
          });
          break; // Succeeded with this period
        }
      } catch (error: any) {
        if (period === tryPeriods[tryPeriods.length - 1]) {
          console.warn(`⚠️ Metrics ${metrics.join(',')} failed on all periods:`, error.message);
        }
      }
    }
  }

  /**
   * Parse newer follower_demographics metric
   */
  private static parseFollowerDemographics(data: any, insights: InstagramInsights): void {
    if (!data || typeof data !== 'object') return;

    // follower_demographics usually returns an object with nested breakdowns or flat depending on sub-metrics
    if (data.city) insights.audience_city = this.sanitizeDemographics(data.city);
    if (data.country) insights.audience_country = this.sanitizeDemographics(data.country);
    if (data.gender_age) insights.audience_gender_age = this.sanitizeDemographics(data.gender_age);
  }

  /**
   * Sanitize keys for MongoDB/Mongoose (dots to underscores)
   */
  private static sanitizeDemographics(data: any): Record<string, number> {
    if (!data || typeof data !== 'object') return {};
    const sanitized: Record<string, number> = {};
    Object.keys(data).forEach(key => {
      const safeKey = key.replace(/\./g, '_');
      sanitized[safeKey] = data[key];
    });
    return sanitized;
  }

  /**
   * Get user's media (posts)
   */
  static async getUserMedia(
    token: string,
    limit: number = 25,
    accountId?: string
  ): Promise<{ data: InstagramMediaItem[]; paging?: any }> {
    const isBasicToken = token.startsWith('IGAA');
    const fields = ['id', 'media_type', 'media_url', 'permalink', 'thumbnail_url', 'timestamp', 'caption', 'like_count', 'comments_count', 'is_shared_to_feed'].join(',');

    const apiBase = (accountId && !isBasicToken) ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}` : INSTAGRAM_GRAPH_API_BASE;
    const path = (accountId && !isBasicToken) ? `${accountId}/media` : 'me/media';
    const url = `${apiBase}/${path}?fields=${fields}&limit=${limit}&access_token=${token}`;

    return this.makeApiRequest<{ data: InstagramMediaItem[]; paging?: any }>(url, token);
  }

  /**
   * Get user's stories
   */
  static async getUserStories(
    token: string,
    accountId?: string
  ): Promise<{ data: InstagramMediaItem[]; paging?: any }> {
    const isBasicToken = token.startsWith('IGAA');
    const fields = ['id', 'media_type', 'media_url', 'permalink', 'thumbnail_url', 'timestamp', 'caption'].join(',');

    const apiBase = (accountId && !isBasicToken) ? `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}` : INSTAGRAM_GRAPH_API_BASE;
    const path = (accountId && !isBasicToken) ? `${accountId}/stories` : 'me/stories';
    const url = `${apiBase}/${path}?fields=${fields}&access_token=${token}`;

    return this.makeApiRequest<{ data: InstagramMediaItem[]; paging?: any }>(url, token);
  }

  /**
   * Get insights for specific media
   */
  static async getMediaInsights(
    mediaId: string,
    token: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'STORY' = 'IMAGE'
  ): Promise<InstagramMediaInsights> {
    let metrics: string[];

    if (mediaType === 'VIDEO') {
      metrics = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'video_views'];
    } else if (mediaType === 'STORY') {
      metrics = ['impressions', 'reach', 'replies', 'taps_forward', 'taps_back', 'exits'];
    } else {
      metrics = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves'];
    }

    const isBasicToken = token.startsWith('IGAA');

    // v22.0 FIX: Consistent use of 'saved' instead of 'saves' for all account types
    metrics = metrics.map(m => m === 'saves' ? 'saved' : m);

    // v22.0 FIX: Impressions are deprecated for media insights
    if (isBasicToken || !isBasicToken) {
      metrics = metrics.filter(m => m !== 'impressions');
    }

    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;
    const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`;

    try {
      const response = await this.makeApiRequest<any>(url, token);
      const insights: InstagramMediaInsights = {};
      if (response.data) {
        response.data.forEach((insight: any) => {
          if (insight.values && insight.values.length > 0) {
            const metricName = (insight.name === 'saved') ? 'saves' : insight.name;
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

  /**
   * Get insights for multiple media items in a single batch request using POST batching
   */
  static async getBatchMediaInsights(
    mediaItems: InstagramMediaItem[],
    token: string
  ): Promise<Record<string, InstagramMediaInsights>> {
    if (mediaItems.length === 0) return {};

    const results: Record<string, InstagramMediaInsights> = {};
    const batchSize = 50;

    // Process in chunks of 50 (Facebook Batch API limit)
    for (let i = 0; i < mediaItems.length; i += batchSize) {
      const chunk = mediaItems.slice(i, i + batchSize);

      try {
        const batchEntries = chunk.map(media => {
          let metrics: string[];
          if (media.media_type === 'CAROUSEL_ALBUM') {
            metrics = ['reach', 'saved'];
          } else if (media.media_type === 'VIDEO') {
            metrics = ['reach', 'saved', 'shares'];
          } else { // IMAGE and others
            metrics = ['reach', 'saved'];
          }

          return {
            method: 'GET',
            relative_url: `${media.id}/insights?metric=${metrics.join(',')}`
          };
        });

        const params = new URLSearchParams();
        params.append('batch', JSON.stringify(batchEntries));
        params.append('access_token', token);

        const url = `${FACEBOOK_GRAPH_API_BASE}/`;
        const response = await axios.post(url, params);
        const batchResults = response.data;

        batchResults.forEach((entry: any, index: number) => {
          const media = chunk[index];
          const id = media.id;
          const insights: InstagramMediaInsights = {};

          if (entry.code === 200 && entry.body) {
            try {
              const body = JSON.parse(entry.body);
              if (body.data) {
                body.data.forEach((insight: any) => {
                  const val = insight.values?.[0]?.value || 0;

                  // Map specific metrics to common keys
                  if (insight.name === 'reach') {
                    insights.reach = Math.max(insights.reach || 0, val);
                  } else if (insight.name === 'saved') {
                    insights.saves = val;
                  } else if (insight.name === 'shares') {
                    insights.shares = val;
                  } else if (insight.name === 'impressions' || insight.name === 'carousel_album_impressions') {
                    insights.impressions = val;
                  } else if (insight.name === 'engagement' || insight.name === 'carousel_album_engagement') {
                    insights.engagement = val;
                  }
                });
              } else {
                 console.log(`[DEBUG BATCH] No body.data for ${id}. Body:`, body);
              }
            } catch (e) {
              console.warn(`⚠️ Error parsing batch entry for ${id}`);
            }
          } else {
             console.warn(`⚠️ API Error for ${id} (${media.media_type}): Code ${entry.code}`, entry.body);
          }
          results[id] = insights;
          if (entry.code === 200) {
             console.log(`[DEBUG BATCH SUCCESS] Parsed insights for ${id}:`, insights);
          }
        });
      } catch (error) {
        console.warn(`⚠️ Batch media insights chunk starting at ${i} failed:`, error);
        // Fill results with empty objects for this chunk to avoid missing keys
        chunk.forEach(media => { if (!results[media.id]) results[media.id] = {}; });
      }
    }

    return results;
  }

  /**
   * Get recent media with insights
   */
  static async getRecentMediaWithInsights(
    token: string,
    accountId?: string,
    totalMediaCount?: number,
    daysLimit: number = 90,
    minPosts: number = 10
  ): Promise<Array<InstagramMediaItem & { insights?: InstagramMediaInsights }>> {

    try {
      const HARD_LIMIT = 100;
      
      // Calculate sinceDate for given days window
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysLimit);

      // We need to know the total media count to determine if we should fetch lifetime
      let mediaCount = totalMediaCount;
      if (mediaCount === undefined) {
          const accInfo = await this.getAccountInfo(token, accountId || 'me');
          mediaCount = accInfo.media_count || 0;
      }

      // Fetch media with pagination
      let recentMedia: InstagramMediaItem[] = [];
      let nextUrl: string | undefined;
      const perPage = Math.min(100, HARD_LIMIT); 
      let shouldStop = false;

      // Initial fetch
      let mediaResponse = await this.getUserMedia(token, perPage, accountId);
      console.log(`[INSTAGRAM API] Initial fetch: ${mediaResponse?.data?.length || 0} posts`);

      while (mediaResponse && !shouldStop) {
        for (let post of mediaResponse.data) {
          const postDate = new Date(post.timestamp);
          
          // Apply strict date filter, but guarantee at least minPosts
          if (postDate < sinceDate && recentMedia.length >= minPosts) {
            console.log(`[INSTAGRAM API] Reached ${daysLimit} days limit at post date ${post.timestamp}. Fetched ${recentMedia.length} posts. Early termination.`);
            shouldStop = true;
            break;
          }
          
          recentMedia.push(post);
          
          if (recentMedia.length >= HARD_LIMIT) {
            console.log(`[INSTAGRAM API] Reached hard limit of ${HARD_LIMIT} posts. Early termination.`);
            shouldStop = true;
            break;
          }
        }
        
        if (shouldStop) break;

        nextUrl = mediaResponse.paging?.next;
        if (nextUrl && recentMedia.length < HARD_LIMIT) {
          try {
            mediaResponse = await this.makeApiRequest<{ data: InstagramMediaItem[]; paging?: any }>(nextUrl, token);
          } catch (error) {
            console.warn('⚠️ Pagination failed, using partial media set:', error);
            break;
          }
        } else {
          break;
        }
      }

      console.log(`[INSTAGRAM API] Fetched ${recentMedia.length} compliant media items`);

      if (recentMedia.length === 0) return [];

      // Use BATCH API to fetch insights for all media at once (P1 Optimization)
      const batchInsights = await this.getBatchMediaInsights(recentMedia, token);

      return recentMedia.map(media => ({
        ...media,
        insights: batchInsights[media.id] || {}
      }));
    } catch (error) {
      console.warn('⚠️ Could not fetch recent media with insights:', error);
      return [];
    }
  }

  /**
   * Get comprehensive metrics for dashboard
   */
  static async getComprehensiveMetrics(
    token: string,
    accountId: string,
    options?: { fetchMedia?: boolean; fetchInsights?: boolean; forceRefresh?: boolean; daysLimit?: number; minPosts?: number }
  ): Promise<{
    account: InstagramAccountInfo;
    insights: InstagramInsights;
    recentMedia: Array<InstagramMediaItem & { insights?: InstagramMediaInsights }>;
    aggregated: {
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      totalSaves: number;
      totalReach: number;
      totalImpressions: number;
      totalPosts: number;
      averageEngagementRate: number;
    };
    demographics?: {
      audienceCity?: Record<string, number>;
      audienceCountry?: Record<string, number>;
      audienceGenderAge?: Record<string, number>;
      audienceActiveTime?: Record<string, number>;
    };
  }> {
    console.log(`[INSTAGRAM API] 🔍 getComprehensiveMetrics START - accountId: ${accountId}`);
    const isBasicToken = token.startsWith('IGAA');

    const isProfessional = accountId && !isBasicToken;
    let account: InstagramAccountInfo;
    let insights: InstagramInsights = {};

    if (isProfessional && options?.fetchInsights !== false) {
      // 1 & 2. Consolidated Batch Fetch (Account Info + Insights)
      const batchResponse = await this.getBatchAccountInsights(accountId || 'me', token);
      insights = batchResponse.insights;

      if (batchResponse.account) {
        account = batchResponse.account;
      } else {
        // Fallback for account info if batch parsing failed
        account = await this.getAccountInfo(token, accountId);
      }
    } else {
      // Basic token flow (limited API) or insights fetch is disabled
      account = await this.getAccountInfo(token, accountId);
    }

    // 3. Get recent media - passing media_count for standardized limit strategy
    let recentMedia: any[] = [];
    if (options?.fetchMedia !== false) {
      recentMedia = await this.getRecentMediaWithInsights(token, accountId, account.media_count, options?.daysLimit, options?.minPosts);
    }

    // 4. Aggregation
    const aggregated = recentMedia.reduce(
      (acc, media) => {
        acc.totalLikes += media.like_count || 0;
        acc.totalComments += media.comments_count || 0;
        acc.totalShares += media.insights?.shares || 0;
        acc.totalSaves += media.insights?.saves || 0;
        acc.totalReach += media.insights?.reach || 0;
        acc.totalImpressions += media.insights?.impressions || 0;
        acc.totalPosts += 1;
        return acc;
      },
      { totalLikes: 0, totalComments: 0, totalShares: 0, totalSaves: 0, totalReach: 0, totalImpressions: 0, averageEngagementRate: 0, totalPosts: 0 }
    );

    // P2-FIX: Do NOT overwrite aggregated totalReach with account-level reach unless it's 0
    // Account-level reach (insights.reach) is for the last 28 days only
    // Media-aggregated reach (aggregated.totalReach) represents the total reach of media fetched (e.g., 90 days)
    if (aggregated.totalReach === 0 && insights.reach && insights.reach > 0) {
      aggregated.totalReach = insights.reach;
    }

    if (recentMedia.length > 0 && account.followers_count > 0) {
      const totalEngagements = aggregated.totalLikes + aggregated.totalComments + aggregated.totalShares + aggregated.totalSaves;
      const denominator = account.followers_count * recentMedia.length;
      aggregated.averageEngagementRate = denominator > 0 ? (totalEngagements / denominator) * 100 : 0;
    }

    return {
      account,
      insights,
      recentMedia,
      aggregated,
      demographics: {
        audienceCity: insights.audience_city,
        audienceCountry: insights.audience_country,
        audienceGenderAge: insights.audience_gender_age,
        audienceActiveTime: insights.audience_active_time
      }
    };
  }

  /**
   * Token and miscellaneous methods
   */
  static async refreshAccessToken(token: string): Promise<{ access_token: string; token_type: string }> {
    const url = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
    return this.makeApiRequest<{ access_token: string; token_type: string }>(url, token);
  }

  static async validateToken(token: string): Promise<{ is_valid: boolean; scopes?: string[]; expires_at?: number }> {
    try {
      const url = `${FACEBOOK_GRAPH_API_BASE}/debug_token?input_token=${token}&access_token=${token}`;
      const response = await this.makeApiRequest<any>(url, token);
      return { is_valid: response.data?.is_valid || false, scopes: response.data?.scopes, expires_at: response.data?.expires_at };
    } catch (error) {
      return { is_valid: false };
    }
  }

  /**
   * Compatibility check for Instagram Graph API (v22+)
   */
  static async isInstagramGraphCompatible(token: string): Promise<boolean> {
    try {
      const url = `${INSTAGRAM_GRAPH_API_BASE}/me?fields=id&access_token=${token}`;
      const response = await this.makeApiRequest<any>(url, token);
      return !!response.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Compatibility check for Facebook Graph API
   */
  static async isFacebookGraphCompatible(token: string): Promise<boolean> {
    try {
      const url = `${FACEBOOK_GRAPH_API_BASE}/${INSTAGRAM_GRAPH_API_VERSION}/me?fields=id&access_token=${token}`;
      const response = await this.makeApiRequest<any>(url, token);
      return !!response.id;
    } catch (e) {
      return false;
    }
  }
}

export default InstagramApiService;