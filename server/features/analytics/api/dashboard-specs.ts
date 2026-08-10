/**
 * Veefore Analytics — Dashboard Specs (Phase 8).
 *
 * Server-side declarative spec of which metrics each dashboard's KPI strip
 * exposes (06-dashboard-specifications.md). Only registry-defined metric keys
 * are listed — business metrics without a definition (e.g. Revenue, Campaign
 * ROI) are intentionally omitted until defined, so nothing is fabricated
 * (CODING_RULES Rule 16; see OPEN_SPEC_ITEMS for pending metrics).
 */

export interface DashboardSpec {
  title: string
  /** Canonical metric keys for the KPI strip, in display order. */
  kpiKeys: string[]
  /** Canonical metric keys to plot on the primary time-series chart. */
  seriesKeys?: string[]
  /** Include an audience-by-country distribution widget. */
  audienceWidget?: boolean
  /** Include full audience demographics (country, city, gender-age) widget. */
  audienceDemographicsWidget?: boolean
  /** Include a top-performing-content list widget. */
  topContentWidget?: boolean
}

export const ANALYTICS_DASHBOARD_SPECS: Record<string, DashboardSpec> = {
  overview: {
    title: 'Overview',
    kpiKeys: [
      'followers_total',
      'reach_total',
      'impressions_total',
      'engagement_rate_by_reach',
      'total_engagements',
      'published_posts',
      'publishing_success_rate',
    ],
    seriesKeys: ['reach_total', 'total_engagements', 'followers_total'],
    audienceWidget: true,
    topContentWidget: true,
  },
  executive: {
    title: 'Executive Dashboard',
    kpiKeys: [
      'followers_total',
      'reach_total',
      'engagement_rate_by_reach',
      'follower_growth_rate',
      'published_posts',
      'publishing_success_rate',
    ],
    seriesKeys: ['reach_total', 'total_engagements', 'followers_total'],
    topContentWidget: true,
  },
  audience: {
    title: 'Audience',
    kpiKeys: [
      'followers_total',
      'new_followers',
      'lost_followers',
      'net_followers',
      'follower_growth_rate',
      'audience_churn',
      'audience_retention',
    ],
    // Include new_followers + followers_total so both trends are detected
    seriesKeys: ['followers_total', 'new_followers'],
    audienceWidget: true,
    audienceDemographicsWidget: true,
  },
  reach: {
    title: 'Reach',
    kpiKeys: [
      'reach_total',
      'reach_efficiency',
      'reach_velocity',
      'impressions_total',
      'profile_visits',
      'facebook_page_views',
    ],
    seriesKeys: ['reach_total', 'impressions_total'],
  },
  engagement: {
    title: 'Engagement',
    kpiKeys: [
      'total_engagements',
      'likes',
      'comments',
      'shares',
      'saves',
      'facebook_reactions',
      'facebook_post_clicks',
      'engagement_rate_by_reach',
      'engagement_rate_by_followers',
    ],
    seriesKeys: ['total_engagements'],
    topContentWidget: true,
  },
  insights: {
    title: 'AI Insights',
    kpiKeys: [
      'followers_total',
      'impressions_total',
      'engagement_rate_by_reach',
      'total_engagements',
    ],
    seriesKeys: ['impressions_total', 'total_engagements', 'followers_total'],
    audienceWidget: true,
    topContentWidget: true,
  },
  content: {
    title: 'Content',
    kpiKeys: ['video_views', 'saves', 'save_rate', 'shares', 'share_rate', 'engagement_rate_by_reach'],
    seriesKeys: ['video_views'],
    topContentWidget: true,
  },
  publishing: {
    title: 'Publishing',
    kpiKeys: ['published_posts', 'failed_posts', 'publishing_success_rate', 'publishing_failure_rate'],
    seriesKeys: ['published_posts', 'failed_posts'],
  },
  // Powers the client Dashboard Builder: exposes the full catalog of real,
  // data-backed KPIs + every populated widget.
  custom: {
    title: 'Dashboard Builder',
    kpiKeys: [
      'followers_total',
      'reach_total',
      'impressions_total',
      'engagement_rate_by_reach',
      'engagement_rate_by_followers',
      'engagement_rate_by_reach',
      'total_engagements',
      'likes',
      'comments',
      'shares',
      'saves',
      'video_views',
      'follower_growth_rate',
      'published_posts',
      'failed_posts',
      'publishing_success_rate',
      'publishing_failure_rate',
      // Facebook-specific bonus metrics
      'facebook_reactions',
      'facebook_page_views',
      'facebook_post_clicks',
      'profile_visits',
      'new_followers',
      'lost_followers',
    ],
    seriesKeys: ['impressions_total', 'total_engagements', 'followers_total'],
    audienceWidget: true,
    topContentWidget: true,
  },
}

/** Get a dashboard spec by id, or undefined if unknown. */
export function getDashboardSpec(dashboardId: string): DashboardSpec | undefined {
  return ANALYTICS_DASHBOARD_SPECS[dashboardId]
}
