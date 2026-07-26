import { GovernedHttpClient, GovernedRequestOptions, GovernedHttpClientError } from './GovernedHttpClient';
import { getUsageStoreInstance } from './UsageStore';
import { rateLimitConfig } from '../config/rateLimitConfig';
import { selectInsightMetrics } from './insightMetricSelection';

// Instagram Graph API configuration
const INSTAGRAM_GRAPH_API_BASE = 'https://graph.instagram.com';
const INSTAGRAM_GRAPH_API_VERSION = 'v22.0';
const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';

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
  audience_active_time_weekly?: Record<string, number>;
}

export interface InstagramMediaInsights {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  /** Per-post play count for videos/reels (Meta's v18+ replacement for video_views). */
  views?: number;
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

  /**
   * Extract the accountId from a full Meta API URL.
   * Attempts to find the Instagram/Facebook account ID from the URL path.
   * Falls back to 'unknown' if not determinable.
   */
  private static extractAccountIdFromUrl(url: string): string {
    // Match patterns like:
    // /v22.0/{accountId}/insights
    // /v22.0/{accountId}/media
    // /{accountId}?fields=...
    // Also handles graph.instagram.com/me/... or graph.facebook.com/v22.0/{id}/...
    const versionedPathMatch = url.match(/\/v\d+\.\d+\/(\d+)\//);
    if (versionedPathMatch) {
      return versionedPathMatch[1];
    }

    // Match /{numericId}/insights or /{numericId}/media etc (without version prefix)
    const directIdMatch = url.match(/\/(\d{5,})\//);
    if (directIdMatch) {
      return directIdMatch[1];
    }

    // Match /{numericId}? (at end of path before query params)
    const endIdMatch = url.match(/\/(\d{5,})\?/);
    if (endIdMatch) {
      return endIdMatch[1];
    }

    return 'unknown';
  }

  /**
   * Parse a full URL into path + params suitable for GovernedHttpClient.
   * The GovernedHttpClient builds URLs from baseUrl + path, so we need to
   * extract the path portion and separate query params.
   */
  private static parseUrlForGovernedClient(url: string): {
    baseUrl: string;
    path: string;
    params: Record<string, string>;
  } {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const path = urlObj.pathname;
    const params: Record<string, string> = {};

    urlObj.searchParams.forEach((value, key) => {
      // Exclude access_token from params — it's passed separately via Authorization header
      if (key !== 'access_token') {
        params[key] = value;
      }
    });

    return { baseUrl, path, params };
  }

  /**
   * Make a request to Instagram Graph API via GovernedHttpClient.
   * 
   * This method delegates to GovernedHttpClient.request() which provides:
   * - Usage header parsing on every response (success or error)
   * - Automatic UsageStore updates
   * - Retry with exponential backoff + jitter
   * - Request deduplication for GET requests
   * - Rate limit escalation on 429 / error code 80002
   * 
   * All existing callers gain governance automatically through this delegation.
   */
  private static async makeApiRequest<T>(
    url: string,
    token: string,
    retryCount: number = 0
  ): Promise<T> {
    const { baseUrl, path, params } = this.parseUrlForGovernedClient(url);
    const accountId = this.extractAccountIdFromUrl(url);

    // Create a temporary GovernedHttpClient with the correct baseUrl for this request
    // (requests may target graph.facebook.com or graph.instagram.com)
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
      path,
      token,
      params: Object.keys(params).length > 0 ? params : undefined,
      accountId,
      priority: 'normal',
    };

    try {
      const response = await client.request<T>(requestOptions);
      return response.data;
    } catch (error) {
      // Map GovernedHttpClientError back to InstagramApiError for backward compatibility
      if (error instanceof GovernedHttpClientError) {
        throw {
          code: error.metaErrorCode || error.statusCode,
          error_subcode: error.metaErrorSubcode,
          message: error.message,
          type: error.metaErrorType || 'APIError',
          is_rate_limit: error.statusCode === 429 || error.metaErrorCode === 80002,
          retry_after: error.retryAfter,
        } as InstagramApiError;
      }
      throw {
        code: 500,
        message: (error as Error).message || 'Network error',
        type: 'NetworkError',
        is_rate_limit: false,
      } as InstagramApiError;
    }
  }

  /**
   * Make a POST request to Meta Graph API via GovernedHttpClient.
   * Used for batch API calls and other POST operations.
   * All POST requests gain governance (usage header parsing, retry, etc.).
   */
  private static async makePostRequest<T>(
    url: string,
    token: string,
    body: unknown,
    accountId: string = 'unknown'
  ): Promise<T> {
    const { baseUrl, path, params } = this.parseUrlForGovernedClient(url);

    const usageStore = getUsageStoreInstance();
    const client = new GovernedHttpClient(
      {
        baseUrl,
        timeout: 30000, // POST requests (especially batches) get longer timeout
        maxRetries: rateLimitConfig.maxRetries,
        deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
      },
      usageStore
    );

    const requestOptions: GovernedRequestOptions = {
      method: 'POST',
      path,
      token,
      params: Object.keys(params).length > 0 ? params : undefined,
      body,
      accountId,
      priority: 'normal',
    };

    try {
      const response = await client.request<T>(requestOptions);
      return response.data;
    } catch (error) {
      if (error instanceof GovernedHttpClientError) {
        throw {
          code: error.metaErrorCode || error.statusCode,
          message: error.message,
          type: error.metaErrorType || 'APIError',
          is_rate_limit: error.statusCode === 429 || error.metaErrorCode === 80002,
          retry_after: error.retryAfter,
        } as InstagramApiError;
      }
      throw {
        code: 500,
        message: (error as Error).message || 'Network error',
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

    // 3. Fetch online_followers (Active Time) - Business/Creator only, needs >100 followers.
    //    The API returns one snapshot per day (24-hour values) keyed by hour 0–23.
    //    Without since/until, it defaults to today's unfinished period (returns {}).
    //    We fetch the last 30 days and average the hour-of-day values to build the
    //    real active-time heatmap that Hootsuite shows.
    if (!isBasicToken) {
      try {
        const DAY_S = 86400
        const now = Math.floor(Date.now() / 1000)
        const since = now - 30 * DAY_S  // go back 30 days
        const until = now - DAY_S       // exclude today (unfinished, returns {})
        const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=online_followers&period=lifetime&since=${since}&until=${until}&access_token=${token}`
        const response = await this.makeApiRequest<any>(url, token)

        if (response.data && response.data.length > 0) {
          const metricData = response.data.find((m: any) => m.name === 'online_followers')
          if (metricData && metricData.values && metricData.values.length > 0) {
            // Collect all non-empty daily snapshots and average per hour.
            const hourSums: Record<string, number> = {}
            const hourCounts: Record<string, number> = {}
            // Weekly grid: key = "DOW_HOUR" (0=Sun … 6=Sat, hour 0–23)
            const weekSums: Record<string, number> = {}
            const weekCounts: Record<string, number> = {}
            for (const val of metricData.values) {
              if (val.value && typeof val.value === 'object' && Object.keys(val.value).length > 0) {
                const dow = val.end_time ? new Date(val.end_time).getDay() : -1
                for (const [hour, count] of Object.entries(val.value)) {
                  if (typeof count === 'number') {
                    hourSums[hour] = (hourSums[hour] ?? 0) + count
                    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
                    if (dow >= 0) {
                      const wKey = `${dow}_${hour}`
                      weekSums[wKey] = (weekSums[wKey] ?? 0) + count
                      weekCounts[wKey] = (weekCounts[wKey] ?? 0) + 1
                    }
                  }
                }
              }
            }
            if (Object.keys(hourSums).length > 0) {
              // Store the 30-day average per hour so the heatmap reflects typical patterns.
              const averaged: Record<string, number> = {}
              for (const [hour, sum] of Object.entries(hourSums)) {
                averaged[hour] = Math.round(sum / (hourCounts[hour] ?? 1))
              }
              insights.audience_active_time = this.sanitizeDemographics(averaged)
              // Weekly grid averages
              const weeklyAveraged: Record<string, number> = {}
              for (const [wKey, sum] of Object.entries(weekSums)) {
                weeklyAveraged[wKey] = Math.round(sum / (weekCounts[wKey] ?? 1))
              }
              insights.audience_active_time_weekly = this.sanitizeDemographics(weeklyAveraged)
              const daysWithData = Object.values(hourCounts)[0] ?? 0
              console.log(`✅ Active Time: ${daysWithData} days, 24h slots: ${Object.keys(averaged).length}, weekly cells: ${Object.keys(weeklyAveraged).length}`)
            } else {
              console.log(`ℹ️  online_followers: all ${metricData.values.length} day(s) returned empty values (data accumulating)`)
            }
          }
        }
      } catch (error: any) {
        console.warn(`⚠️  online_followers (Active Time) API request failed: ${error.message || 'unknown'}`)
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

      // 8. Active Time (online_followers) — use since/until to get past days (not today's empty snapshot)
      const onlineNow = Math.floor(Date.now() / 1000)
      const onlineSince = onlineNow - 30 * 86400
      const onlineUntil = onlineNow - 86400 // exclude today (unfinished → {})
      batchEntries.push({
        method: 'GET',
        relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights?metric=online_followers&period=lifetime&since=${onlineSince}&until=${onlineUntil}`
      });

      const params = new URLSearchParams();
      params.append('batch', JSON.stringify(batchEntries));
      params.append('access_token', token);

      const url = `${FACEBOOK_GRAPH_API_BASE}/`;
      const response = await this.makePostRequest<any[]>(url, token, params, accountId);
      const batchResults = response;

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
              // Active Time — average all non-empty daily snapshots across the 30-day window
              const metricData = body.data?.find((m: any) => m.name === 'online_followers')
              if (metricData?.values?.length) {
                const hourSums: Record<string, number> = {}
                const hourCounts: Record<string, number> = {}
                const weekSums: Record<string, number> = {}
                const weekCounts: Record<string, number> = {}
                for (const val of metricData.values) {
                  if (val.value && typeof val.value === 'object' && Object.keys(val.value).length > 0) {
                    const dow = val.end_time ? new Date(val.end_time).getDay() : -1
                    for (const [hour, count] of Object.entries(val.value)) {
                      if (typeof count === 'number') {
                        hourSums[hour] = (hourSums[hour] ?? 0) + count
                        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
                        if (dow >= 0) {
                          const wKey = `${dow}_${hour}`
                          weekSums[wKey] = (weekSums[wKey] ?? 0) + count
                          weekCounts[wKey] = (weekCounts[wKey] ?? 0) + 1
                        }
                      }
                    }
                  }
                }
                if (Object.keys(hourSums).length > 0) {
                  const averaged: Record<string, number> = {}
                  for (const [hour, sum] of Object.entries(hourSums)) {
                    averaged[hour.replace(/\./g, '_')] = Math.round(sum / (hourCounts[hour] ?? 1))
                  }
                  insights.audience_active_time = averaged
                  const weeklyAveraged: Record<string, number> = {}
                  for (const [wKey, sum] of Object.entries(weekSums)) {
                    weeklyAveraged[wKey] = Math.round(sum / (weekCounts[wKey] ?? 1))
                  }
                  insights.audience_active_time_weekly = weeklyAveraged
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
      metrics = ['reach', 'likes', 'comments', 'shares', 'saves', 'views'];
    } else if (mediaType === 'STORY') {
      metrics = ['reach', 'replies', 'taps_forward', 'taps_back', 'exits'];
    } else {
      metrics = ['reach', 'likes', 'comments', 'shares', 'saves'];
    }

    const isBasicToken = token.startsWith('IGAA');

    // v22.0 FIX: Consistent use of 'saved' instead of 'saves' for all account types
    metrics = metrics.map(m => m === 'saves' ? 'saved' : m);

    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE;
    const url = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${mediaId}/insights?metric=${metrics.join(',')}&access_token=${token}`;

    try {
      const response = await this.makeApiRequest<any>(url, token);
      const insights: InstagramMediaInsights = {};
      if (response.data) {
        response.data.forEach((insight: any) => {
          if (insight.values && insight.values.length > 0) {
            const metricName = (insight.name === 'saved') ? 'saves'
              : insight.name;  // 'views' stays as 'views' (Meta's replacement for impressions since v18+)
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
   * Build the media-insight metric list appropriate for a given media type AND
   * its publish date (smart-polling-system Req 2.1–2.4).
   *
   * Meta does NOT support an identical metric set across all media types. Sending
   * one hardcoded list (e.g. reach,saved,shares) to every media causes per-entry
   * `Code 400` rejections for media that don't support a metric (e.g. `shares`
   * on certain feed images / legacy media, or video-only metrics on images).
   *
   * The reach-style metric is also date-dependent: Meta deprecated `impressions`
   * for media created on/after 2024-07-02 in favor of `views`. `selectInsightMetrics`
   * resolves which one to request per media, so current content asks for `views`
   * and only strictly-earlier legacy media asks for `impressions`.
   *
   * v22.0 metric availability (conservative, widely-supported sets):
   *   - VIDEO / REELS         → reach, saved, shares, <views|impressions>
   *   - IMAGE / CAROUSEL_ALBUM → reach, saved   (shares is unreliable on images)
   *   - default                → reach, saved
   *
   * Note: `saved` (not `saves`) is the correct v22.0 metric name.
   *
   * @param mediaType The media's type.
   * @param publishedAt Optional ISO/epoch publish time used to choose
   *   `views` (current) vs `impressions` (legacy pre-cutover). Defaults to
   *   current content (`views`) when omitted/unparseable so the deprecated
   *   metric is never requested for media we cannot prove is legacy (Req 2.4).
   */
  static getBatchMetricsForMediaType(mediaType?: string, publishedAt?: string | number | Date): string[] {
    // Date-aware reach-style metric: `views` for current content, `impressions`
    // only for strictly pre-2024-07-02 legacy media (smart-polling-system Req 2.1–2.4).
    const reachStyleMetric = selectInsightMetrics(publishedAt ?? Date.now()).primaryReachMetric;
    switch (mediaType) {
      case 'VIDEO':
        return ['reach', 'saved', 'shares', reachStyleMetric];
      case 'IMAGE':
      case 'CAROUSEL_ALBUM':
        // Meta v18+ returns 'views' for all post types (images, carousels, reels, videos).
        // This is the per-post display count (impressions replacement), not just video plays.
        return ['reach', 'saved', reachStyleMetric];
      default:
        return ['reach', 'saved', reachStyleMetric];
    }
  }

  /** Minimal metric set guaranteed to be valid for every media type. */
  private static readonly MINIMAL_INSIGHT_METRICS = ['reach', 'saved'];

  /**
   * Parse a single Graph Batch API entry body into an InstagramMediaInsights object.
   * Returns null if the entry did not succeed (code !== 200) so the caller can
   * decide whether to retry that media with a reduced metric set.
   */
  private static parseBatchInsightEntry(entry: any): InstagramMediaInsights | null {
    if (!entry || entry.code !== 200 || !entry.body) {
      // Check if the error body is the "posted before business account conversion" error.
      // Subcode 2108006 = media predates the business account — insights will never be
      // available for these posts regardless of retry. Return empty (not null) so the
      // caller does NOT retry with the reduced metric set (avoids wasted API calls).
      if (entry?.body) {
        try {
          const errBody = typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body
          if (errBody?.error?.error_subcode === 2108006) return {}
        } catch { /* ignore */ }
      }
      return null;
    }
    const insights: InstagramMediaInsights = {};
    try {
      const body = typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body;
      if (body.data) {
        body.data.forEach((insight: any) => {
          const val = insight.values?.[0]?.value || 0;
          if (insight.name === 'reach') {
            insights.reach = Math.max(insights.reach || 0, val);
          } else if (insight.name === 'saved') {
            insights.saves = val;
          } else if (insight.name === 'shares') {
            insights.shares = val;
          } else if (insight.name === 'views' || insight.name === 'video_views') {
            // 'views' is Meta's v18+ replacement for per-post video plays (videos/reels).
            // Store as both video_views (legacy field) and views so downstream can use either.
            insights.views = val;
            insights.video_views = val;
          } else if (insight.name === 'impressions' || insight.name === 'carousel_album_impressions') {
            insights.impressions = val;
          } else if (insight.name === 'engagement' || insight.name === 'carousel_album_engagement') {
            insights.engagement = val;
          }
        });
      }
    } catch (e) {
      // Malformed body — treat as a soft failure (empty insights, not a retry)
      return {};
    }
    return insights;
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
    const batchSize = 50; // Facebook Batch API hard limit

    // Process in chunks
    for (let i = 0; i < mediaItems.length; i += batchSize) {
      const chunk = mediaItems.slice(i, i + batchSize);

      let batchSucceeded = false;
      // Media that returned a per-entry error (e.g. 400) and need a reduced-metric retry
      let failedMedia: InstagramMediaItem[] = [];
      // Retry batch up to 2 times
      for (let attempt = 0; attempt < 2 && !batchSucceeded; attempt++) {
        try {
          const batchEntries = chunk.map(media => {
            // Media-type-aware AND date-aware metric selection — avoids Code 400
            // from unsupported metrics, and requests `views` for current content
            // vs `impressions` only for legacy pre-cutover media (Req 2.1–2.4).
            const metrics = this.getBatchMetricsForMediaType(media.media_type, media.timestamp);

            return {
              method: 'GET',
              relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${media.id}/insights?metric=${metrics.join(',')}`
            };
          });

          const params = new URLSearchParams();
          params.append('batch', JSON.stringify(batchEntries));
          params.append('access_token', token);
          params.append('include_headers', 'false');

          const url = `${FACEBOOK_GRAPH_API_BASE}/`;

          // Route through GovernedHttpClient for rate-limit governance
          const batchResults = await this.makePostRequest<any[]>(url, token, params, 'batch');

          if (!Array.isArray(batchResults)) {
            console.warn(`⚠️ Batch response is not an array (attempt ${attempt + 1}):`, typeof batchResults);
            continue;
          }

          failedMedia = [];
          batchResults.forEach((entry: any, index: number) => {
            const media = chunk[index];
            const id = media.id;

            const parsed = this.parseBatchInsightEntry(entry);
            if (parsed !== null) {
              results[id] = parsed;
            } else {
              // Per-entry failure (e.g. Code 400 from an unsupported metric).
              // Queue this media for a reduced-metric retry instead of dropping it.
              results[id] = {};
              failedMedia.push(media);
            }
          });

          batchSucceeded = true;
        } catch (error: any) {
          const isRetryable = error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'EPIPE';
          if (attempt === 0 && isRetryable) {
            console.warn(`⚠️ Batch media insights attempt ${attempt + 1} failed (${error.code}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
          } else {
            console.warn(`⚠️ Batch media insights chunk ${i}-${i + chunk.length} failed after ${attempt + 1} attempts:`, error?.message || error?.code);
          }
        }
      }

      // Reduced-metric retry: any media that returned a per-entry error (e.g. 400
      // from an unsupported metric) gets ONE more batch call with the minimal
      // metric set (reach, saved) that every media type supports. This recovers
      // the metrics Meta WILL serve instead of storing empty insights.
      if (batchSucceeded && failedMedia.length > 0) {
        try {
          const retryEntries = failedMedia.map(media => ({
            method: 'GET',
            relative_url: `${INSTAGRAM_GRAPH_API_VERSION}/${media.id}/insights?metric=${InstagramApiService.MINIMAL_INSIGHT_METRICS.join(',')}`
          }));

          const retryParams = new URLSearchParams();
          retryParams.append('batch', JSON.stringify(retryEntries));
          retryParams.append('access_token', token);
          retryParams.append('include_headers', 'false');

          const retryResults = await this.makePostRequest<any[]>(`${FACEBOOK_GRAPH_API_BASE}/`, token, retryParams, 'batch');

          if (Array.isArray(retryResults)) {
            retryResults.forEach((entry: any, index: number) => {
              const media = failedMedia[index];
              const parsed = this.parseBatchInsightEntry(entry);
              if (parsed !== null) {
                results[media.id] = parsed;
              } else if (entry?.code) {
                // Still failing even on the minimal set — this media genuinely has
                // no available insights (e.g. legacy/unsupported media). Log once.
                console.warn(`⚠️ No insights available for ${media.id} (${media?.media_type}): Code ${entry.code}`);
              }
            });
          }
        } catch (retryError: any) {
          console.warn(`⚠️ Reduced-metric retry failed for ${failedMedia.length} media:`, retryError?.message || retryError?.code);
        }
      }

      // Fallback: If batch failed, fetch individually for this chunk
      if (!batchSucceeded) {
        console.log(`[SYNC] Falling back to individual insight calls for ${chunk.length} posts`);
        for (const media of chunk) {
          if (results[media.id] && Object.keys(results[media.id]).length > 0) continue;
          try {
            const individual = await this.getMediaInsights(media.id, token, media.media_type);
            results[media.id] = individual;
          } catch (e) {
            results[media.id] = {};
          }
        }
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

  /**
   * Fetch the genuine daily "new followers" series (`follower_count` insight,
   * period=day) directly from the Instagram Graph API for a date window.
   *
   * Instagram limits each request to a **30-day span**, but keeps the history
   * much longer — so to cover 90 days / 12 months we fetch in consecutive
   * 30-day chunks and combine them (this is how Hootsuite shows >30-day ranges).
   * `follower_count` requires the account to have >= 100 followers.
   *
   * @returns Array of `{ date: ISO day, value: new followers that day }` sorted asc.
   */
  static async getFollowerCountDaily(
    accountId: string,
    token: string,
    since: Date,
    until: Date
  ): Promise<Array<{ date: string; value: number }>> {
    const DAY_MS = 24 * 60 * 60 * 1000
    const CHUNK_MS = 30 * DAY_MS
    const MAX_CHUNKS = 14 // ~13 months of lookback safety cap

    const endMs = until.getTime()
    let cursor = since.getTime()
    if (cursor >= endMs) return []

    const isBasicToken = token.startsWith('IGAA')
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE

    // Merge by day so chunk boundaries never double-count.
    const byDay = new Map<string, number>()

    for (let chunk = 0; chunk < MAX_CHUNKS && cursor < endMs; chunk++) {
      const chunkEnd = Math.min(cursor + CHUNK_MS, endMs)
      const sinceSec = Math.floor(cursor / 1000)
      const untilSec = Math.floor(chunkEnd / 1000)
      if (sinceSec >= untilSec) break

      const url =
        `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights` +
        `?metric=follower_count&period=day&since=${sinceSec}&until=${untilSec}&access_token=${token}`

      try {
        const body = await this.makeApiRequest<{
          data?: Array<{ name?: string; values?: Array<{ value?: number; end_time?: string }> }>
        }>(url, token)
        const metric = body?.data?.find((d) => d.name === 'follower_count')
        for (const v of metric?.values ?? []) {
          if (typeof v.value === 'number' && v.end_time) {
            byDay.set(new Date(v.end_time).toISOString(), v.value)
          }
        }
      } catch {
        // Skip a failed/unavailable chunk; keep the rest of the range.
      }

      cursor = chunkEnd
    }

    return [...byDay.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }

  /**
   * Fetch genuine followers GAINED and LOST for a date window using Instagram's
   * `follows_and_unfollows` insight (period=day, metric_type=total_value,
   * breakdown=follow_type). This is the metric Hootsuite/Sprout use: it exposes
   * both gross gains AND gross unfollows, and Meta retains it far longer than the
   * 30-day `follower_count` cap (verified 365+ days, ~24 months of lookback).
   *
   * Meta rejects any single request spanning more than 30 days
   * (`(#100) There cannot be more than 30 days ...`), so we fetch in consecutive
   * 30-day chunks and sum: breakdown `FOLLOWER` → gained, `NON_FOLLOWER` → lost.
   *
   * Requires the account to have >= 100 followers. Never throws — returns
   * `{ gained: 0, lost: 0 }` when nothing is available so callers can fall back.
   *
   * @returns `{ gained, lost }` totals across the whole window.
   */
  static async getFollowsAndUnfollows(
    accountId: string,
    token: string,
    since: Date,
    until: Date
  ): Promise<{ gained: number; lost: number }> {
    const DAY_MS = 24 * 60 * 60 * 1000
    const CHUNK_MS = 30 * DAY_MS
    const MAX_CHUNKS = 27 // ~24 months of lookback safety cap

    const endMs = until.getTime()
    let cursor = since.getTime()
    if (cursor >= endMs) return { gained: 0, lost: 0 }

    const isBasicToken = token.startsWith('IGAA')
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE

    let gained = 0
    let lost = 0

    for (let chunk = 0; chunk < MAX_CHUNKS && cursor < endMs; chunk++) {
      const chunkEnd = Math.min(cursor + CHUNK_MS, endMs)
      const sinceSec = Math.floor(cursor / 1000)
      const untilSec = Math.floor(chunkEnd / 1000)
      if (sinceSec >= untilSec) break

      const url =
        `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights` +
        `?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type` +
        `&since=${sinceSec}&until=${untilSec}&access_token=${token}`

      try {
        const body = await this.makeApiRequest<{
          data?: Array<{
            name?: string
            total_value?: {
              value?: number
              breakdowns?: Array<{
                dimension_keys?: string[]
                results?: Array<{ dimension_values?: string[]; value?: number }>
              }>
            }
          }>
        }>(url, token)

        const metric = body?.data?.find((d) => d.name === 'follows_and_unfollows')
        const breakdown = metric?.total_value?.breakdowns?.[0]
        for (const r of breakdown?.results ?? []) {
          const key = r.dimension_values?.[0]
          const val = typeof r.value === 'number' ? r.value : 0
          if (key === 'FOLLOWER') gained += val
          else if (key === 'NON_FOLLOWER') lost += val
        }
      } catch {
        // Skip a failed/unavailable chunk; keep summing the rest of the range.
      }

      cursor = chunkEnd
    }

    return { gained, lost }
  }

  /**
   * Per-DAY followers gained/lost from `follows_and_unfollows`. Because Meta
   * rejects `time_series` for this metric (verified: `(#100) ... incompatible
   * with the metric type (time_series)`), the only way to get genuine per-day
   * values is to request each day as its own 1-day `total_value` window. We do
   * exactly that — one request per day — so the values are real, never
   * interpolated (CODING_RULES Rule 16).
   *
   * This is what powers the durable per-day store: once a day is fetched it is
   * immutable and stored forever, so ANY range or sub-range is then answered by
   * summing stored days (no re-fetch). To keep the one-time backfill fast, days
   * are fetched via the Meta Graph **Batch API** (up to 50 day-requests per HTTP
   * call) for Facebook tokens — turning ~730 round-trips into ~15 — and
   * sequentially for Instagram-native (IGAA) tokens (graph.instagram.com has no
   * batch endpoint). Batching changes only the transport, not the data.
   *
   * @param skip Optional set of `yyyy-mm-dd` (UTC) days already stored — skipped
   *             so backfills/retries only fetch the gaps.
   * @returns `[{ date: 'yyyy-mm-dd', gained, lost }]` for days with data, asc.
   */
  static async getFollowsAndUnfollowsDaily(
    accountId: string,
    token: string,
    since: Date,
    until: Date,
    skip?: Set<string>
  ): Promise<Array<{ date: string; gained: number; lost: number }>> {
    const DAY_MS = 24 * 60 * 60 * 1000
    const MAX_DAYS = 800 // ~26 months safety cap

    const isBasicToken = token.startsWith('IGAA')
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE

    // Align to UTC midnight so each request is exactly one calendar day, and
    // build the list of day-windows to fetch (skipping days we already have).
    const startDay = new Date(since)
    startDay.setUTCHours(0, 0, 0, 0)
    const endMs = until.getTime()

    const windows: Array<{ ymd: string; sinceSec: number; untilSec: number }> = []
    for (let i = 0, dayStart = startDay.getTime(); i < MAX_DAYS && dayStart < endMs; i++, dayStart += DAY_MS) {
      const ymd = new Date(dayStart).toISOString().slice(0, 10)
      if (skip?.has(ymd)) continue
      const dayEnd = Math.min(dayStart + DAY_MS, endMs)
      const sinceSec = Math.floor(dayStart / 1000)
      const untilSec = Math.floor(dayEnd / 1000)
      if (sinceSec >= untilSec) continue
      windows.push({ ymd, sinceSec, untilSec })
    }
    if (windows.length === 0) return []

    // Instagram-native (IGAA) tokens hit graph.instagram.com, which has no batch
    // endpoint — fetch sequentially. Facebook tokens use the Graph Batch API
    // (up to 50 day-requests per HTTP call), cutting ~730 round-trips to ~15.
    if (isBasicToken) {
      return this.fetchFollowsDailySequential(apiBase, accountId, token, windows)
    }
    return this.fetchFollowsDailyBatched(apiBase, accountId, token, windows)
  }

  /** Parse a single `follows_and_unfollows` insights body into gained/lost. */
  private static parseFollowsBody(body: {
    data?: Array<{
      name?: string
      total_value?: {
        breakdowns?: Array<{ results?: Array<{ dimension_values?: string[]; value?: number }> }>
      }
    }>
  }): { gained: number; lost: number } {
    const metric = body?.data?.find((d) => d.name === 'follows_and_unfollows')
    const results = metric?.total_value?.breakdowns?.[0]?.results ?? []
    let gained = 0
    let lost = 0
    for (const r of results) {
      const key = r.dimension_values?.[0]
      const val = typeof r.value === 'number' ? r.value : 0
      if (key === 'FOLLOWER') gained += val
      else if (key === 'NON_FOLLOWER') lost += val
    }
    return { gained, lost }
  }

  /** One GET per day (used for IGAA tokens / batch fallback). */
  private static async fetchFollowsDailySequential(
    apiBase: string,
    accountId: string,
    token: string,
    windows: Array<{ ymd: string; sinceSec: number; untilSec: number }>
  ): Promise<Array<{ date: string; gained: number; lost: number }>> {
    const out: Array<{ date: string; gained: number; lost: number }> = []
    for (const w of windows) {
      const url =
        `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights` +
        `?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type` +
        `&since=${w.sinceSec}&until=${w.untilSec}&access_token=${token}`
      try {
        const body = await this.makeApiRequest<Parameters<typeof InstagramApiService.parseFollowsBody>[0]>(url, token)
        const { gained, lost } = this.parseFollowsBody(body)
        out.push({ date: w.ymd, gained, lost })
      } catch {
        // Skip a failed day; the backfill will retry the gap next time.
      }
    }
    return out
  }

  /**
   * Fetch many days in a few HTTP calls via the Meta Graph Batch API
   * (`POST /{version}` with a `batch` of up to 50 GET sub-requests). Each
   * sub-request is the SAME genuine 1-day insights call — batching only reduces
   * round-trips, not the data. Falls back to sequential for any chunk that fails.
   */
  private static async fetchFollowsDailyBatched(
    apiBase: string,
    accountId: string,
    token: string,
    windows: Array<{ ymd: string; sinceSec: number; untilSec: number }>
  ): Promise<Array<{ date: string; gained: number; lost: number }>> {
    const BATCH_SIZE = 50
    const out: Array<{ date: string; gained: number; lost: number }> = []
    const batchUrl = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}`

    for (let i = 0; i < windows.length; i += BATCH_SIZE) {
      const chunk = windows.slice(i, i + BATCH_SIZE)
      const batch = chunk.map((w) => ({
        method: 'GET',
        relative_url:
          `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights` +
          `?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type` +
          `&since=${w.sinceSec}&until=${w.untilSec}`,
      }))

      try {
        const res = await fetch(batchUrl, {
          method: 'POST',
          body: new URLSearchParams({ access_token: token, batch: JSON.stringify(batch) }),
        })
        if (!res.ok) throw new Error(`batch HTTP ${res.status}`)
        const items = (await res.json()) as Array<{ code?: number; body?: string }>
        if (!Array.isArray(items)) throw new Error('batch shape')

        for (let j = 0; j < chunk.length; j++) {
          const item = items[j]
          if (!item || item.code !== 200 || !item.body) continue
          try {
            const parsed = this.parseFollowsBody(JSON.parse(item.body))
            out.push({ date: chunk[j].ymd, gained: parsed.gained, lost: parsed.lost })
          } catch {
            // skip a bad sub-response
          }
        }
      } catch {
        // Whole-batch failure → fall back to sequential for this chunk so the
        // sync still completes (just a little slower).
        const seq = await this.fetchFollowsDailySequential(apiBase, accountId, token, chunk)
        out.push(...seq)
      }
    }

    return out
  }

  /**
   * Per-DAY genuine insights for the whole analytics KPI family in ONE call per
   * day: `metric=likes,comments,shares,saves,profile_views,website_clicks,views,reach`
   * with `metric_type=total_value&period=day` over a 1-day window. Verified live
   * that a single request returns all of these for the day (each as
   * `total_value.value`), and that Meta retains them ~365+ days. Real data, never
   * interpolated (Rule 16).
   *
   * Powers the durable per-day store so ANY range/sub-range for reach,
   * impressions(views), engagement (likes/comments/shares/saves), profile visits
   * and website clicks is answered from the DB. Uses the Batch API (up to 50
   * day-calls per HTTP request) for Facebook tokens; sequential for IGAA.
   *
   * @param skip Optional `yyyy-mm-dd` (UTC) days already stored — only gaps are fetched.
   * @returns `[{ date, values: { <metric>: number } }]` for days with data, asc.
   */
  static async getDailyInsights(
    accountId: string,
    token: string,
    since: Date,
    until: Date,
    skip?: Set<string>
  ): Promise<Array<{ date: string; values: Record<string, number> }>> {
    const DAY_MS = 24 * 60 * 60 * 1000
    const MAX_DAYS = 800
    const METRICS = 'likes,comments,shares,saves,profile_views,website_clicks,views,reach'

    const isBasicToken = token.startsWith('IGAA')
    const apiBase = isBasicToken ? INSTAGRAM_GRAPH_API_BASE : FACEBOOK_GRAPH_API_BASE

    const startDay = new Date(since)
    startDay.setUTCHours(0, 0, 0, 0)
    const endMs = until.getTime()

    const windows: Array<{ ymd: string; sinceSec: number; untilSec: number }> = []
    for (let i = 0, dayStart = startDay.getTime(); i < MAX_DAYS && dayStart < endMs; i++, dayStart += DAY_MS) {
      const ymd = new Date(dayStart).toISOString().slice(0, 10)
      if (skip?.has(ymd)) continue
      const dayEnd = Math.min(dayStart + DAY_MS, endMs)
      const sinceSec = Math.floor(dayStart / 1000)
      const untilSec = Math.floor(dayEnd / 1000)
      if (sinceSec >= untilSec) continue
      windows.push({ ymd, sinceSec, untilSec })
    }
    if (windows.length === 0) return []

    const relUrl = (w: { sinceSec: number; untilSec: number }) =>
      `${INSTAGRAM_GRAPH_API_VERSION}/${accountId}/insights` +
      `?metric=${METRICS}&metric_type=total_value&period=day&since=${w.sinceSec}&until=${w.untilSec}`

    const parse = (body: {
      data?: Array<{ name?: string; total_value?: { value?: number } }>
    }): Record<string, number> => {
      const values: Record<string, number> = {}
      for (const d of body?.data ?? []) {
        if (d.name) values[d.name] = typeof d.total_value?.value === 'number' ? d.total_value.value : 0
      }
      return values
    }

    const out: Array<{ date: string; values: Record<string, number> }> = []

    const sequential = async (chunk: typeof windows) => {
      for (const w of chunk) {
        const url = `${apiBase}/${relUrl(w)}&access_token=${token}`
        try {
          const body = await this.makeApiRequest<Parameters<typeof parse>[0]>(url, token)
          out.push({ date: w.ymd, values: parse(body) })
        } catch {
          // skip failed day; retried on next backfill
        }
      }
    }

    if (isBasicToken) {
      await sequential(windows)
      return out
    }

    const BATCH_SIZE = 50
    const batchUrl = `${apiBase}/${INSTAGRAM_GRAPH_API_VERSION}`
    for (let i = 0; i < windows.length; i += BATCH_SIZE) {
      const chunk = windows.slice(i, i + BATCH_SIZE)
      const batch = chunk.map((w) => ({ method: 'GET', relative_url: relUrl(w) }))
      try {
        const res = await fetch(batchUrl, {
          method: 'POST',
          body: new URLSearchParams({ access_token: token, batch: JSON.stringify(batch) }),
        })
        if (!res.ok) throw new Error(`batch HTTP ${res.status}`)
        const items = (await res.json()) as Array<{ code?: number; body?: string }>
        if (!Array.isArray(items)) throw new Error('batch shape')
        for (let j = 0; j < chunk.length; j++) {
          const item = items[j]
          if (!item || item.code !== 200 || !item.body) continue
          try {
            out.push({ date: chunk[j].ymd, values: parse(JSON.parse(item.body)) })
          } catch {
            // skip bad sub-response
          }
        }
      } catch {
        await sequential(chunk)
      }
    }

    return out
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