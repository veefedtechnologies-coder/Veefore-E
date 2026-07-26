/**
 * Veefore Analytics — Dashboard configurations.
 *
 * Declarative, display-only composition for each implemented section dashboard
 * (06-dashboard-specifications.md). Only dashboards backed by real, registry-
 * defined metrics are configured here (CODING_RULES Rule 16 — no placeholder
 * dashboards). Labels/units are configuration, not metric values (Rule 7); KPI
 * values arrive from the backend contract (Phase 9).
 */

import { buildPath } from '../config/navigation'
import type { MetricUnit } from '../design-system'

/** A placeholder KPI descriptor for a dashboard's strip (used while empty). */
export interface DashboardKpi {
  id: string
  title: string
  unit: MetricUnit
  higherIsBetter?: boolean
}

/** Declarative composition of a section dashboard. */
export interface DashboardPageConfig {
  /** Dashboard id used by the data API (matches server dashboard-specs). */
  dashboardId: string
  title: string
  description: string
  /** Section heading shown above KPIs (like Hootsuite's "Your social impact at a glance"). */
  sectionTitle: string
  /** One-line subtitle below the section heading. */
  sectionSubtitle: string
  kpis: DashboardKpi[]
  primaryChart?: { title: string; subtitle?: string }
  /** Chart variant for the primary chart. Defaults to 'area'. */
  chartVariant?: 'line' | 'area' | 'bar'
  /** Titles for distribution (donut) widgets in the secondary row. */
  distributions?: string[]
  /** Title for a top-performers list widget. */
  topList?: string
  showRecommendations?: boolean
  showAlerts?: boolean
}

const k = (id: string, title: string, unit: MetricUnit, higherIsBetter = true): DashboardKpi => ({
  id,
  title,
  unit,
  higherIsBetter,
})

/** Implemented section dashboards keyed by their API dashboard id. */
export const DASHBOARD_CONFIGS: Record<string, DashboardPageConfig> = {
  executive: {
    dashboardId: 'executive',
    title: 'Executive Dashboard',
    description: 'High-level performance, growth, and publishing health.',
    sectionTitle: 'Your top-level numbers at a glance',
    sectionSubtitle: 'A high-level snapshot of growth, reach, and publishing health across your account.',
    kpis: [
      k('followers', 'Followers', 'count'),
      k('reach', 'Reach', 'count'),
      k('engagement', 'Engagement Rate', 'percent'),
      k('growth_rate', 'Follower Growth Rate', 'percent'),
      k('published', 'Content Published', 'count'),
      k('pub_success', 'Publishing Success', 'percent'),
    ],
    primaryChart: { title: 'Performance timeline', subtitle: 'Key metrics over the selected period' },
    topList: 'Top performing content',
    showRecommendations: true,
    showAlerts: true,
  },
  audience: {
    dashboardId: 'audience',
    title: 'Audience',
    description: 'Understand your audience: growth, churn, and retention.',
    sectionTitle: 'Who is following your account',
    sectionSubtitle: 'Track how your audience grows, who you are attracting, and where they come from.',
    kpis: [
      k('followers', 'Followers', 'count'),
      k('new_followers', 'New Followers', 'count'),
      k('lost_followers', 'Lost Followers', 'count', false),
      k('net_followers', 'Net Followers', 'count'),
      k('growth_rate', 'Follower Growth Rate', 'percent'),
      k('churn', 'Audience Churn', 'percent', false),
      k('retention', 'Audience Retention', 'percent'),
    ],
    primaryChart: { title: 'Audience growth', subtitle: 'Followers over time' },
    // demographics panel below the chart; no separate distributions strip
    showRecommendations: true,
    showAlerts: true,
  },
  reach: {
    dashboardId: 'reach',
    title: 'Reach',
    description: 'How far your content travels and how efficiently it reaches people.',
    sectionTitle: 'How far your content is travelling',
    sectionSubtitle: 'Measure the unique accounts your content reached and how efficiently it spread.',
    kpis: [
      k('reach', 'Reach', 'count'),
      k('efficiency', 'Reach Efficiency', 'ratio'),
      k('velocity', 'Reach Velocity', 'per_hour'),
      k('impressions', 'Impressions', 'count'),
    ],
    primaryChart: { title: 'Reach over time', subtitle: 'Unique accounts reached each day' },
    showAlerts: true,
  },
  engagement: {
    dashboardId: 'engagement',
    title: 'Engagement',
    description: 'Interactions, shares, saves, and engagement quality.',
    sectionTitle: 'How your audience is interacting',
    sectionSubtitle: 'Understand likes, comments, shares, and saves to see what content resonates most.',
    kpis: [
      k('total', 'Total Engagements', 'count'),
      k('likes', 'Likes', 'count'),
      k('comments', 'Comments', 'count'),
      k('shares', 'Shares', 'count'),
      k('saves', 'Saves', 'count'),
      k('rate', 'Engagement Rate', 'percent'),
    ],
    primaryChart: { title: 'Engagement over time' },
    topList: 'Most engaging content',
    showRecommendations: true,
  },
  insights: {
    dashboardId: 'insights',
    title: 'AI Insights',
    description: 'AI-generated summary, recommendations, and signals from your data.',
    sectionTitle: 'What the data is telling you',
    sectionSubtitle: 'AI-powered signals, patterns, and recommendations derived from your actual analytics.',
    kpis: [
      k('followers', 'Followers', 'count'),
      k('reach', 'Reach', 'count'),
      k('engagement', 'Engagement Rate', 'percent'),
      k('total_engagements', 'Total Engagements', 'count'),
    ],
    primaryChart: { title: 'Performance timeline', subtitle: 'Signals the AI analyzes over time' },
    distributions: ['Audience by country'],
    topList: 'Top performing content',
    showRecommendations: true,
    showAlerts: true,
  },
  content: {
    dashboardId: 'content',
    title: 'Content',
    description: 'Content performance across formats.',
    sectionTitle: 'How your content is performing',
    sectionSubtitle: 'Compare views, saves, and shares across posts to understand what format your audience prefers.',
    kpis: [
      k('views', 'Total Views', 'count'),
      k('saves', 'Saves', 'count'),
      k('save_rate', 'Save Rate', 'percent'),
      k('shares', 'Shares', 'count'),
      k('share_rate', 'Share Rate', 'percent'),
      k('rate', 'Engagement Rate', 'percent'),
    ],
    primaryChart: { title: 'Total views over time', subtitle: 'Daily content views from Meta account insights' },
    topList: 'Top performing content',
    showRecommendations: true,
  },
  publishing: {
    dashboardId: 'publishing',
    title: 'Publishing',
    description: 'Monitor publishing operations and health.',
    sectionTitle: 'Your publishing activity at a glance',
    sectionSubtitle: 'Monitor how consistently you are publishing and identify any failures that need attention.',
    kpis: [
      k('published', 'Published Posts', 'count'),
      k('failed', 'Failed Posts', 'count', false),
      k('success', 'Publishing Success Rate', 'percent'),
      k('failure', 'Publishing Failure Rate', 'percent', false),
    ],
    primaryChart: { title: 'Posts published per day', subtitle: 'Published and failed posts by day' },
    chartVariant: 'bar',
    showAlerts: true,
  },
}

/** Lookup a dashboard config by its absolute analytics route path. */
export const DASHBOARD_CONFIG_BY_PATH: Record<string, DashboardPageConfig> = {
  [buildPath('executive')]: DASHBOARD_CONFIGS.executive,
  [buildPath('audience')]: DASHBOARD_CONFIGS.audience,
  [buildPath('reach')]: DASHBOARD_CONFIGS.reach,
  [buildPath('engagement')]: DASHBOARD_CONFIGS.engagement,
  [buildPath('insights')]: DASHBOARD_CONFIGS.insights,
  [buildPath('content')]: DASHBOARD_CONFIGS.content,
  [buildPath('publishing')]: DASHBOARD_CONFIGS.publishing,
}
