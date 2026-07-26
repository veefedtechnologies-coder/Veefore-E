/**
 * Veefore Analytics — Permanent Metric ID Registry (Phase 2).
 *
 * Every metric receives a permanent, immutable ID in the format `MTR-NNNNNN`
 * (docs.analytics/analytics/02-metrics-dictionary.md, Ch 5). IDs enable
 * versioning, auditing, deprecation, and backward compatibility.
 *
 * ── Documentation note (conflict flagged per CODING_RULES Rule 2) ────────────
 * The dictionary provides only a few illustrative ID anchors and they conflict:
 *   • Ch 5 (examples): MTR-000001 Followers, MTR-000002 Reach, MTR-000003 Impressions
 *   • Ch 12 (definitions): MTR-000001 Followers, MTR-000002 Follower Growth
 * Only `MTR-000001 = Followers` is unambiguous. We treat Ch 12 (the metric
 * *definitions* chapter) as authoritative over Ch 5 (labeled "Examples") and
 * assign all remaining IDs sequentially here. Because every ID lives in this one
 * file, the canonical assignment is trivially reversible once confirmed.
 */

export const METRIC_IDS = {
  // ── Account & Audience ────────────────────────────────────────────────────
  FOLLOWERS: 'MTR-000001',
  FOLLOWER_GROWTH: 'MTR-000002',
  FOLLOWER_GROWTH_RATE: 'MTR-000003',
  NET_FOLLOWERS: 'MTR-000004',
  NEW_FOLLOWERS: 'MTR-000005',
  LOST_FOLLOWERS: 'MTR-000006',
  AUDIENCE_CHURN: 'MTR-000007',
  AUDIENCE_RETENTION: 'MTR-000008',

  // ── Reach & Impressions ──────────────────────────────────────────────────
  REACH: 'MTR-000010',
  REACH_ORGANIC: 'MTR-000011',
  REACH_PAID: 'MTR-000012',
  REACH_EFFICIENCY: 'MTR-000013',
  REACH_VELOCITY: 'MTR-000014',
  IMPRESSIONS: 'MTR-000015',
  AVERAGE_FREQUENCY: 'MTR-000016',

  // ── Engagement ───────────────────────────────────────────────────────────
  LIKES: 'MTR-000020',
  COMMENTS: 'MTR-000021',
  SHARES: 'MTR-000022',
  SAVES: 'MTR-000023',
  TOTAL_ENGAGEMENTS: 'MTR-000024',
  ENGAGEMENT_RATE_BY_FOLLOWERS: 'MTR-000025',
  ENGAGEMENT_RATE_BY_REACH: 'MTR-000026',
  ENGAGEMENT_RATE_BY_IMPRESSIONS: 'MTR-000027',
  SHARE_RATE: 'MTR-000028',
  SAVE_RATE: 'MTR-000029',
  ENGAGEMENT_VELOCITY: 'MTR-000030',

  // ── Profile actions ──────────────────────────────────────────────────────
  PROFILE_VISITS: 'MTR-000035',
  WEBSITE_CLICKS: 'MTR-000036',
  CTR: 'MTR-000037',

  // ── Video ────────────────────────────────────────────────────────────────
  VIDEO_VIEWS: 'MTR-000040',
  VIDEO_COMPLETIONS: 'MTR-000041',
  COMPLETION_RATE: 'MTR-000042',
  TOTAL_WATCH_TIME: 'MTR-000043',
  AVERAGE_WATCH_TIME: 'MTR-000044',

  // ── Publishing ───────────────────────────────────────────────────────────
  PUBLISHED_POSTS: 'MTR-000050',
  FAILED_POSTS: 'MTR-000051',
  PUBLISHING_SUCCESS_RATE: 'MTR-000052',
  PUBLISHING_FAILURE_RATE: 'MTR-000053',

  // ── Composite scores ─────────────────────────────────────────────────────
  VIRALITY_SCORE: 'MTR-000060',
  AUDIENCE_LOYALTY_SCORE: 'MTR-000061',
  ENGAGEMENT_QUALITY_SCORE: 'MTR-000062',
  ACCOUNT_HEALTH_SCORE: 'MTR-000063',
  REACH_QUALITY_SCORE: 'MTR-000064',

  // ── Facebook-specific ───────────────────────────────────────────────────
  FACEBOOK_REACTIONS: 'MTR-000065',
  FACEBOOK_PAGE_VIEWS: 'MTR-000066',
  FACEBOOK_POST_CLICKS: 'MTR-000067',
} as const

/** Union of all metric ID string-literal values. */
export type MetricId = (typeof METRIC_IDS)[keyof typeof METRIC_IDS]
