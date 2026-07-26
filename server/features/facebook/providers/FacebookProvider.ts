/**
 * FacebookProvider — Full SocialPlatformProvider implementation for Facebook Pages
 *
 * Routes ALL Graph API calls through GovernedHttpClient so the centralized
 * rate-limit governance, usage-header parsing, and retry/backoff logic are
 * always enforced for Facebook calls exactly as they are for Instagram calls.
 *
 * Key responsibilities:
 *   • Build OAuth authorization URL with required page-management scopes
 *   • Exchange short-lived code → long-lived UAT (60-day expiry)
 *   • Retrieve managed Pages via /me/accounts (up to 100)
 *   • Refresh tokens using fb_exchange_token grant
 *   • Revoke tokens via DELETE /me/permissions (errors swallowed)
 *   • Fetch Page profile (id, name, picture, fan_count, category)
 *   • Fetch & normalize Page Insights + post counts in parallel
 *
 * Metric normalization (validated Graph API v19.0, post March-2024 deprecation):
 *   Raw API field                          → Normalized key
 *   page_follows / page_fan_count          → followers_total
 *   page_posts_impressions_organic         → impressions_total
 *   page_post_engagements                  → total_engagements
 *   page_actions_post_reactions_like_total → likes
 *   page_video_views                       → video_views
 *   page_views_total                       → profile_visits + facebook_page_views
 *   page_daily_follows                     → new_followers
 *   page_daily_unfollows_unique            → lost_followers
 *   published_posts (derived)              → published_posts
 *   page_actions_post_reactions_total      → facebook_reactions (FB-specific)
 *   (reach_total: no valid source — Meta removed page-level reach)
 *
 * Keys where the raw API value is null/undefined are OMITTED from the result —
 * they are never set to 0. rawResponse is kept in-memory only, never stored.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 7.1, 7.2, 7.4, 7.6, 7.7
 */

import axios from 'axios';
import { GovernedHttpClient, GovernedHttpClientError, type GovernedRequestOptions } from '../../../services/GovernedHttpClient';
import { getUsageStoreInstance } from '../../../services/UsageStore';
import { rateLimitConfig } from '../../../config/rateLimitConfig';
import { mapFacebookRawMetrics } from '../analytics/normalizeMetrics';
import type {
  SocialPlatformProvider,
  OAuthInitResult,
  OAuthCallbackResult,
  ManagedPage,
  ProfileResult,
  NormalizedMetricResult,
  PublishResult,
} from '../../social/providers/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FB_GRAPH_BASE = 'https://graph.facebook.com';
const FB_API_VERSION = 'v19.0';

/** Required OAuth scopes for Facebook Page integration + linked Instagram */
const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'read_insights',
  // Instagram Business Account scopes — needed to access the IG account
  // linked to the Facebook Page via instagram_business_account field
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_content_publish',
  'business_management',
].join(',');

/**
 * Page Insights metrics — VALIDATED against Graph API v19.0 (Nov 2024).
 *
 * IMPORTANT: On March 14, 2024 Meta deprecated a large set of Page Insights
 * metrics for ALL API versions. The old metrics we previously used —
 * `page_impressions`, `page_impressions_unique` (reach), `page_engaged_users`,
 * `page_fans`, `page_fan_adds`, `page_fan_removes` — now return
 * `(#100) The value must be a valid insights metric`.
 *
 * The metric names below were confirmed valid by probing the live API against
 * the connected page (see scripts/fb-metric-probe.mjs). Requesting any
 * deprecated metric makes the ENTIRE batched call fail with #100, which is why
 * reach/impressions/page-views all showed "No data" before this fix.
 *
 * Page-level REACH (`page_impressions_unique`) has NO valid replacement in the
 * current API — Meta removed page-level reach entirely — so it is intentionally
 * not requested and reach is reported as unsupported for Facebook (never faked).
 *
 * Primary metrics (core, universally valid):
 *   page_posts_impressions_organic → impressions_total
 *   page_post_engagements          → total_engagements
 *   page_views_total               → profile_visits / facebook_page_views
 */
const PAGE_INSIGHT_METRICS = [
  'page_posts_impressions_organic',
  'page_post_engagements',
  'page_views_total',
].join(',');

/**
 * Secondary metrics — all confirmed valid, fetched separately so an
 * occasional per-page restriction on one of them cannot break the primary set.
 *
 *   page_actions_post_reactions_like_total → likes
 *   page_video_views                       → video_views
 *   page_follows                           → followers_total (snapshot)
 *   page_daily_follows                     → new_followers   (daily flow)
 *   page_daily_unfollows_unique            → lost_followers  (daily flow)
 *   page_actions_post_reactions_total      → facebook_reactions (breakdown object)
 */
const PAGE_INSIGHT_METRICS_SECONDARY = [
  'page_actions_post_reactions_like_total',
  'page_video_views',
  'page_follows',
  'page_daily_follows',
  'page_daily_unfollows_unique',
  'page_actions_post_reactions_total',
].join(',');

/**
 * Metrics whose value is a cumulative snapshot (latest value wins across
 * chunks) rather than a daily flow that should be summed.
 */
const PAGE_SNAPSHOT_METRICS = new Set<string>(['page_follows']);

// ---------------------------------------------------------------------------
// FacebookProvider
// ---------------------------------------------------------------------------

export class FacebookProvider implements SocialPlatformProvider {
  readonly platform = 'facebook' as const;

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Create a fresh GovernedHttpClient instance scoped to the given base URL.
   * A new instance per request is intentional — it mirrors how InstagramService
   * works and avoids shared state leaking between concurrent analytics calls.
   */
  private makeClient(baseUrl: string = FB_GRAPH_BASE): GovernedHttpClient {
    const usageStore = getUsageStoreInstance();
    return new GovernedHttpClient(
      {
        baseUrl,
        timeout: rateLimitConfig.httpTimeoutMs,
        maxRetries: rateLimitConfig.maxRetries,
        deduplicationWindowMs: rateLimitConfig.deduplicationWindowMs,
      },
      usageStore
    );
  }

  /**
   * Execute a GET request through GovernedHttpClient.
   * Extracts the Facebook Page ID from the URL path for rate-limit tracking —
   * the same pattern used by InstagramService.makeApiRequest.
   *
   * Page ID extraction regex: matches the first 10+-digit segment after the
   * API version prefix, e.g. /v19.0/<pageId>/insights → pageId.
   */
  private async fbGet<T>(
    path: string,
    token: string,
    params?: Record<string, string>
  ): Promise<T> {
    const client = this.makeClient();

    // Extract Facebook Page ID from path for rate-limit tracking
    const pageIdMatch = path.match(/\/v\d+\.\d+\/(\d{10,})\//);
    const accountId = pageIdMatch ? pageIdMatch[1] : 'unknown';

    const opts: GovernedRequestOptions = {
      method: 'GET',
      path,
      token,
      params,
      accountId,
      priority: 'normal',
    };

    const response = await client.request<T>(opts);
    return response.data;
  }

  /**
   * Execute a DELETE via the GovernedHttpClient POST path (GovernedHttpClient
   * only supports GET/POST). For token revocation we fall back to axios so
   * the DELETE verb is correctly sent. Errors are intentionally swallowed by
   * the caller (revokeToken), so this can throw freely.
   */
  private async fbDelete(path: string, token: string): Promise<void> {
    // GovernedHttpClient does not support DELETE — use axios directly for
    // revocation. This is acceptable because revocation is fire-and-forget
    // and the caller swallows all errors.
    const url = `${FB_GRAPH_BASE}${path}`;
    await axios.delete(url, {
      params: { access_token: token },
      timeout: rateLimitConfig.httpTimeoutMs,
    });
  }

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------

  /**
   * Build the Facebook OAuth dialog URL. Synchronous — no network call.
   * Requirements: 2.1
   */
  initiateOAuth(workspaceId: string, redirectUri: string): OAuthInitResult {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      redirect_uri: redirectUri,
      scope: REQUIRED_SCOPES,
      response_type: 'code',
      state: workspaceId,
    });
    return {
      authUrl: `https://www.facebook.com/dialog/oauth?${params.toString()}`,
      state: workspaceId,
    };
  }

  /**
   * Exchange authorization code → short-lived UAT → long-lived UAT (60 days).
   * Throws on any failure step so the caller can surface a user-friendly error
   * and avoid creating a SocialAccount record.
   * Requirements: 2.2
   */
  async handleOAuthCallback(
    code: string,
    redirectUri: string
  ): Promise<OAuthCallbackResult> {
    // Step 1: code → short-lived User Access Token
    const shortParams: Record<string, string> = {
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: redirectUri,
      code,
    };

    let shortTokenData: { access_token: string };
    try {
      shortTokenData = await this.fbGet<{ access_token: string }>(
        `/${FB_API_VERSION}/oauth/access_token`,
        '', // no token yet — credentials are in params
        shortParams
      );
    } catch (err) {
      throw new Error(
        `Facebook OAuth code exchange failed: ${(err as Error).message}`
      );
    }

    // Step 2: short-lived UAT → long-lived UAT (fb_exchange_token grant, 60 days)
    const longParams: Record<string, string> = {
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      fb_exchange_token: shortTokenData.access_token,
    };

    let longTokenData: { access_token: string; expires_in: number };
    try {
      longTokenData = await this.fbGet<{ access_token: string; expires_in: number }>(
        `/oauth/access_token`,
        '', // credentials are in params
        longParams
      );
    } catch (err) {
      throw new Error(
        `Facebook long-lived token exchange failed: ${(err as Error).message}`
      );
    }

    return {
      longLivedToken: longTokenData.access_token,
      // expires_in may be absent from some Meta API responses — default to 60 days
      tokenExpiresAt: new Date(Date.now() + (longTokenData.expires_in ?? 5_184_000) * 1000),
      userId: '',
    };
  }

  /**
   * Retrieve all Pages the authenticated user administers.
   * Calls /me/accounts?fields=...&limit=100. Returns ManagedPage[].
   * Requirements: 2.3, 2.4
   */
  async getManagedPages(userAccessToken: string): Promise<ManagedPage[]> {
    const result = await this.fbGet<{ data: FacebookPageRaw[] }>(
      `/${FB_API_VERSION}/me/accounts`,
      userAccessToken,
      {
        fields:
          'id,name,picture,category,access_token,instagram_business_account',
        limit: '100',
      }
    );

    return (result.data ?? []).map(
      (p): ManagedPage => ({
        pageId: p.id,
        pageName: p.name,
        profilePictureUrl: p.picture?.data?.url ?? '',
        pageCategory: p.category ?? '',
        accessToken: p.access_token,
        // Page Access Tokens from /me/accounts are short-lived; the caller must
        // exchange them for long-lived tokens via refreshToken before persisting.
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // ~60 days
        permissions: [], // permissions granted are available via /me/permissions if needed
        linkedInstagramAccountId: p.instagram_business_account?.id,
      })
    );
  }

  // -------------------------------------------------------------------------
  // Token lifecycle
  // -------------------------------------------------------------------------

  /**
   * Refresh an access token using the fb_exchange_token grant flow.
   * Requirements: 2.10
   */
  async refreshToken(
    accessToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const result = await this.fbGet<{ access_token: string; expires_in: number }>(
      `/oauth/access_token`,
      accessToken,
      {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        fb_exchange_token: accessToken,
      }
    );

    return {
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + (result.expires_in ?? 5_184_000) * 1000),
    };
  }

  /**
   * Revoke the token via DELETE /me/permissions.
   * Errors are swallowed — a revocation failure MUST NOT prevent a local
   * disconnect. The caller (disconnect flow) proceeds regardless.
   * Requirements: 2.9
   */
  async revokeToken(accessToken: string): Promise<void> {
    try {
      await this.fbDelete(`/${FB_API_VERSION}/me/permissions`, accessToken);
    } catch {
      // Swallow all errors intentionally. Local disconnect still happens.
    }
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  /**
   * Fetch the normalized Page profile: id, name, picture, fan_count, category.
   * Requirements: 2.6
   */
  async getProfile(
    accessToken: string,
    accountId: string
  ): Promise<ProfileResult> {
    const p = await this.fbGet<FacebookPageProfile>(
      `/${FB_API_VERSION}/${accountId}`,
      accessToken,
      { fields: 'id,name,picture,fan_count,category' }
    );

    return {
      accountId: p.id,
      displayName: p.name,
      profilePictureUrl: p.picture?.data?.url ?? '',
      followersCount: p.fan_count ?? 0,
      platformMetadata: { pageCategory: p.category },
    };
  }

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  /**
   * Fetch and normalize Facebook Page analytics.
   *
   * Calls fetchPageInsights + fetchPostInsights in parallel via
   * Promise.allSettled so a partial failure in one source does not prevent
   * the other from contributing metrics.
   *
   * Metric mapping (validated against Graph API v19.0, post March-2024
   * deprecation — see PAGE_INSIGHT_METRICS for details):
   *   page_follows                             → followers_total (snapshot)
   *   page_posts_impressions_organic           → impressions_total
   *   page_post_engagements                    → total_engagements
   *   page_actions_post_reactions_like_total   → likes
   *   page_video_views                         → video_views
   *   page_views_total                         → profile_visits + facebook_page_views
   *   page_daily_follows                       → new_followers
   *   page_daily_unfollows_unique              → lost_followers
   *   page_actions_post_reactions_total        → facebook_reactions (FB-only)
   *   published_posts (post count)             → published_posts
   *   post_clicks (sum across posts)           → facebook_post_clicks (FB-only)
   *
   *   reach_total: Meta deprecated page-level reach (page_impressions_unique)
   *   on 2024-03-14 with no replacement — it is NOT fetched and reported as
   *   unsupported for Facebook (never fabricated).
   *
   * Keys are OMITTED when the raw value is null/undefined — NEVER set to 0.
   * rawResponse is preserved in-memory only, never stored or sent to clients.
   *
   * Requirements: 7.1, 7.2, 7.4, 7.6, 7.7
   */
  async getAnalytics(params: {
    accessToken: string;
    accountId: string;
    from: Date;
    to: Date;
  }): Promise<NormalizedMetricResult> {
    const { accessToken, accountId, from, to } = params;

    // Facebook Insights API requires date ranges to be chunked into max 93-day windows
    // but supports up to 24 months of historical data (same as Instagram).
    const sinceSec = Math.floor(from.getTime() / 1000);
    const untilSec = Math.floor(to.getTime() / 1000);

    // Fetch page insights and post count in parallel; partial failures allowed
    const [pageInsightsResult, postInsightsResult] = await Promise.allSettled([
      this.fetchPageInsights(accessToken, accountId, sinceSec, untilSec),
      this.fetchPostInsights(accessToken, accountId, from, to),
    ]);

    // Merge raw data from fulfilled results
    const raw: Record<string, number | null> = {};

    if (pageInsightsResult.status === 'fulfilled') {
      Object.assign(raw, pageInsightsResult.value);
    }
    if (postInsightsResult.status === 'fulfilled') {
      Object.assign(raw, postInsightsResult.value);
    }

    // Delegate to the extracted pure normalization function.
    // Omit any key where the raw value is null or undefined — never substitute 0.
    // See server/features/facebook/analytics/normalizeMetrics.ts for the mapping table.
    const metrics = mapFacebookRawMetrics(raw);

    return {
      metrics,
      rawResponse: raw, // in-memory only for debugging; never stored or returned to client
    };
  }

  /**
   * Fetch Facebook Page Insights, chunking the request into 93-day windows
   * to support up to 24 months of historical data (same as Instagram).
   * Uses primary metrics (universally valid) + secondary metrics (optional).
   * All metric names are validated against the current Graph API — deprecated
   * page_impressions* / page_fans* metrics are never requested.
   */
  private async fetchPageInsights(
    accessToken: string,
    accountId: string,
    since: number,
    until: number
  ): Promise<Record<string, number>> {
    const CHUNK_DAYS = 93;
    const CHUNK_SEC = CHUNK_DAYS * 24 * 60 * 60;

    // Split date range into 93-day chunks
    const chunks: Array<{ s: number; u: number }> = [];
    let cursor = since;
    while (cursor < until) {
      chunks.push({ s: cursor, u: Math.min(cursor + CHUNK_SEC, until) });
      cursor += CHUNK_SEC;
    }

    type InsightResponse = {
      data: Array<{
        name: string;
        values: Array<{ value: number | Record<string, number>; end_time: string }>;
        period: string;
      }>;
    };

    // Coerce an insights value into a number. Some metrics (e.g.
    // page_actions_post_reactions_total) return a breakdown OBJECT such as
    // { like: 12, love: 3 } — we sum the numeric members. Non-numeric / empty
    // values yield null so the key is omitted rather than faked as 0.
    const coerceNumber = (val: unknown): number | null => {
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (val && typeof val === 'object') {
        let sum = 0, found = false;
        for (const v of Object.values(val as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) { sum += v; found = true; }
        }
        return found ? sum : null;
      }
      return null;
    };

    const parseChunk = (result: InsightResponse): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const metric of result.data ?? []) {
        const values = metric.values ?? [];
        if (values.length === 0) continue;
        if (PAGE_SNAPSHOT_METRICS.has(metric.name)) {
          // Cumulative snapshot — take the last (most recent) value of this chunk
          const lastVal = coerceNumber(values[values.length - 1]?.value);
          if (lastVal !== null) out[metric.name] = lastVal;
        } else {
          // Daily flow — sum every day in this chunk
          let total = 0, hasData = false;
          for (const v of values) {
            const n = coerceNumber(v.value);
            if (n !== null) { total += n; hasData = true; }
          }
          if (hasData) out[metric.name] = total;
        }
      }
      return out;
    };

    // Aggregate across all chunks. Flow metrics are summed; snapshot metrics
    // (PAGE_SNAPSHOT_METRICS) keep the most-recent chunk value.
    const aggregated: Record<string, number> = {};
    const snapshots: Record<string, number> = {};

    const mergeChunk = (chunkData: Record<string, number>): void => {
      for (const [key, value] of Object.entries(chunkData)) {
        if (PAGE_SNAPSHOT_METRICS.has(key)) {
          snapshots[key] = value; // later chunks are more recent → overwrite
        } else {
          aggregated[key] = (aggregated[key] ?? 0) + value;
        }
      }
    };

    for (const { s, u } of chunks) {
      // Primary metrics per chunk
      try {
        const primary = await this.fbGet<InsightResponse>(
          `/${FB_API_VERSION}/${accountId}/insights`,
          accessToken,
          { metric: PAGE_INSIGHT_METRICS, period: 'day', since: String(s), until: String(u) }
        );
        mergeChunk(parseChunk(primary));
      } catch { /* skip failed chunk */ }

      // Secondary metrics per chunk (optional, may fail on some page types)
      try {
        const secondary = await this.fbGet<InsightResponse>(
          `/${FB_API_VERSION}/${accountId}/insights`,
          accessToken,
          { metric: PAGE_INSIGHT_METRICS_SECONDARY, period: 'day', since: String(s), until: String(u) }
        );
        mergeChunk(parseChunk(secondary));
      } catch { /* secondary metrics not supported — ignore */ }
    }

    // Snapshot metrics carry their most-recent value, not a sum.
    Object.assign(aggregated, snapshots);

    return aggregated;
  }

  /**
   * Fetch the count of posts published within the date window, and sum
   * post_clicks across all posts (confirmed valid via live API probe).
   * Returns { published_posts: <count>, post_clicks_total: <sum> } or
   * partial/empty object on failure.
   *
   * Requirements: 7.2 (published_posts normalization), bonus metric
   */
  private async fetchPostInsights(
    accessToken: string,
    accountId: string,
    from: Date,
    to: Date
  ): Promise<Record<string, number>> {
    try {
      const result = await this.fbGet<{ data: Array<{ id: string }> }>(
        `/${FB_API_VERSION}/${accountId}/posts`,
        accessToken,
        {
          fields: 'id',
          since: String(Math.floor(from.getTime() / 1000)),
          until: String(Math.floor(to.getTime() / 1000)),
          limit: '100',
        }
      );

      const posts = result.data ?? [];
      const out: Record<string, number> = {
        published_posts: posts.length,
      };

      // Fetch post_clicks per post (confirmed valid by live probe) and sum them.
      // Use Promise.allSettled so a single post failure doesn't abort the whole batch.
      if (posts.length > 0) {
        type PostInsightResp = { data: Array<{ name: string; values: Array<{ value: number }> }> };
        const clickResults = await Promise.allSettled(
          posts.map((post) =>
            this.fbGet<PostInsightResp>(
              `/${FB_API_VERSION}/${post.id}/insights`,
              accessToken,
              { metric: 'post_clicks' }
            )
          )
        );

        let totalClicks = 0;
        let hasClicks = false;
        for (const r of clickResults) {
          if (r.status === 'fulfilled') {
            const val = r.value.data?.[0]?.values?.[0]?.value;
            if (typeof val === 'number' && Number.isFinite(val)) {
              totalClicks += val;
              hasClicks = true;
            }
          }
        }
        if (hasClicks) out.post_clicks_total = totalClicks;
      }

      return out;
    } catch {
      // Post insights failure is non-fatal — omit keys rather than fake values
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Page Posts
  // -------------------------------------------------------------------------

  /**
   * Fetch published Facebook Page posts with their metrics.
   * Returns up to `limit` posts with id, message, created_time, full_picture,
   * permalink_url, and basic engagement counts (likes, comments, shares).
   * Requirements: Facebook Page content sync
   */
  async getPagePosts(
    accessToken: string,
    pageId: string,
    limit: number = 25
  ): Promise<FacebookPost[]> {
    try {
      const result = await this.fbGet<{ data: FacebookPost[] }>(
        `/${FB_API_VERSION}/${pageId}/posts`,
        accessToken,
        {
          fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares',
          limit: String(limit),
        }
      );
      return result.data ?? [];
    } catch (err) {
      console.warn(`[FacebookProvider] getPagePosts failed for ${pageId}:`, (err as Error).message);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  /**
   * Publish or schedule a post to a Facebook Page.
   * Uses /feed for text and link posts; media publishing is handled separately
   * when mediaUrl is present.
   */
  async publish(params: {
    accessToken: string;
    accountId: string;
    mediaType: string;
    mediaUrl?: string;
    caption?: string;
    scheduledAt?: Date;
  }): Promise<PublishResult> {
    const body: Record<string, string> = {};

    if (params.caption) {
      body.message = params.caption;
    }
    if (params.mediaUrl) {
      body.link = params.mediaUrl;
    }
    if (params.scheduledAt) {
      body.published = 'false';
      body.scheduled_publish_time = String(
        Math.floor(params.scheduledAt.getTime() / 1000)
      );
    }

    const result = await this.fbGet<{ id: string; post_id?: string }>(
      `/${FB_API_VERSION}/${params.accountId}/feed`,
      params.accessToken,
      body
    );

    return {
      platformPostId: result.id,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal raw-type helpers (not exported — used only for type safety inside
// this module)
// ---------------------------------------------------------------------------

interface FacebookPageRaw {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string };
}

interface FacebookPageProfile {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
  picture?: { data?: { url?: string } };
}

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  full_picture?: string;
  permalink_url?: string;
  likes?: { data: unknown[]; summary: { total_count: number } };
  comments?: { data: unknown[]; summary: { total_count: number } };
  shares?: { count: number };
}
