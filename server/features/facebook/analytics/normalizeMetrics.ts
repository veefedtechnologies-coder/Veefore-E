/**
 * Pure metric normalization helper for Facebook Page Insights.
 *
 * Extracted from {@link FacebookProvider.getAnalytics} so it can be tested
 * in isolation without requiring network calls or provider instantiation.
 *
 * This is the single canonical mapping from raw Facebook Graph API field names
 * to Veefore's normalized metric keys. Any change to the mapping must be made
 * here — `FacebookProvider.getAnalytics` delegates to this function.
 *
 * Metric mapping (validated against Graph API v19.0 after Meta's 2024-03-14
 * Page Insights deprecation — the old page_impressions* / page_fans* metrics
 * now return (#100) and were replaced by the names below):
 *   page_fan_count / page_follows            → followers_total
 *   page_posts_impressions_organic           → impressions_total (total times posts displayed)
 *   page_video_views                         → reach_total (Media Views proxy — see note)
 *                                            → video_views (also kept as own KPI)
 *   page_post_engagements                    → total_engagements
 *   page_actions_post_reactions_like_total   → likes
 *   page_video_views                         → video_views
 *   page_views_total                         → profile_visits  (and facebook_page_views)
 *   page_daily_follows                       → new_followers
 *   page_daily_unfollows_unique              → lost_followers
 *   published_posts                          → published_posts
 *   page_actions_post_reactions_total        → facebook_reactions  (FB-only)
 *   post_clicks_total (sum of per-post)       → facebook_post_clicks (FB-only)
 *
 * REACH NOTE (Meta's 2024-03-14 deprecation + Nov 2025 views model):
 * Meta deprecated page_impressions_unique (reach) for all API versions on
 * 2024-03-14. The new "views" model is rolling out gradually. As a bridge:
 *   - For current data: page_video_views is used as reach_total ("Media Views" —
 *     how many times video content was viewed). This is a genuinely distinct
 *     number from impressions_total (organic post impressions), so the two KPIs
 *     show different values. page_video_views is also preserved as its own
 *     video_views KPI.
 *   - For historical data: if page_impressions_unique exists in raw (stored
 *     before the API change), it takes priority as the genuine unique-reach value.
 *
 * Rules:
 * - A raw key that is `null` or `undefined` is OMITTED from the result — never
 *   substituted with `0` (CODING_RULES Rule 16, Requirement 7.2).
 * - The function is pure: given the same `raw` object it always returns an
 *   identical result (Requirement 7.3, Property 2).
 *
 * Requirements: 7.2, 7.3
 */

/** Shape of the raw record produced by fetchPageInsights + fetchPostInsights. */
export type RawFacebookInsights = Partial<Record<string, number | null>>

/**
 * Map a raw Facebook API field record to Veefore's normalized metric keys.
 *
 * @param raw - Flat record of Facebook API field name → numeric value.
 *              Any key may be absent, `null`, or `undefined` — all three are
 *              treated as "not available" and the corresponding normalized key
 *              is omitted from the result.
 * @returns A new object containing only the normalized keys for which the raw
 *          API provided a non-null numeric value.
 */
export function mapFacebookRawMetrics(raw: RawFacebookInsights): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Followers: prefer the Page `fan_count` field, fall back to the
  // page_follows insights metric (both represent total followers).
  if (raw.page_fan_count != null) {
    metrics.followers_total = raw.page_fan_count;
  }
  if (raw.page_follows != null) {
    metrics.followers_total = raw.page_follows;
  }

  if (raw.page_posts_impressions_organic != null) {
    metrics.impressions_total = raw.page_posts_impressions_organic;
  }

  // REACH for Facebook: page_views_total = total unique Page visits (profile views).
  // This is the best available distinct "unique viewers" metric post-Meta's 2024-03-14
  // deprecation of page_impressions_unique. It's a genuinely different number from
  // impressions_total (post display count), representing people who actively visited
  // the Page — closer to "unique reach" than any other available metric.
  // For historical data, page_impressions_unique (genuine reach) takes priority.
  if (raw.page_views_total != null) {
    metrics.reach_total = raw.page_views_total;
  }

  // Historical reach: page_impressions_unique was valid before Meta's 2024-03-14
  // deprecation. If this key exists in raw (stored before the API change),
  // it overrides the page views proxy since it's the genuine unique-reach value.
  if (raw.page_impressions_unique != null) {
    metrics.reach_total = raw.page_impressions_unique;
  }

  if (raw.page_post_engagements != null) {
    metrics.total_engagements = raw.page_post_engagements;
  }
  if (raw.page_actions_post_reactions_like_total != null) {
    metrics.likes = raw.page_actions_post_reactions_like_total;
  }
  if (raw.page_video_views != null) {
    metrics.video_views = raw.page_video_views;
  }
  if (raw.page_views_total != null) {
    // page_views_total maps to both profile_visits and the FB-specific facebook_page_views
    metrics.profile_visits = raw.page_views_total;
    metrics.facebook_page_views = raw.page_views_total;
  }
  if (raw.page_daily_follows != null) {
    metrics.new_followers = raw.page_daily_follows;
  }
  if (raw.page_daily_unfollows_unique != null) {
    metrics.lost_followers = raw.page_daily_unfollows_unique;
  }
  if (raw.published_posts != null) {
    metrics.published_posts = raw.published_posts;
  }
  if (raw.page_actions_post_reactions_total != null) {
    metrics.facebook_reactions = raw.page_actions_post_reactions_total;
  }
  // post_clicks_total: sum of post_clicks across all posts in the window.
  // Confirmed valid via live API probe (post_clicks works at post level).
  if (raw.post_clicks_total != null) {
    metrics.facebook_post_clicks = raw.post_clicks_total;
  }

  return metrics;
}

/** All raw Facebook API field names that the normalizer understands. */
export const RAW_FB_METRIC_KEYS = [
  'page_fan_count',
  'page_follows',
  'page_posts_impressions_organic',
  'page_impressions_unique',       // historical only — deprecated 2024-03-14
  'page_post_engagements',
  'page_actions_post_reactions_like_total',
  'page_video_views',
  'page_views_total',
  'page_daily_follows',
  'page_daily_unfollows_unique',
  'published_posts',
  'page_actions_post_reactions_total',
  'post_clicks_total',
] as const;

export type RawFbMetricKey = typeof RAW_FB_METRIC_KEYS[number];
