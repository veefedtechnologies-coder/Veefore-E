/**
 * Overview dashboard composition config (Phase 6).
 *
 * Declarative, display-only configuration for the Overview dashboard's KPI strip
 * and filters (06-dashboard-specifications.md Ch 2). Labels and units are
 * configuration — not metric values (CODING_RULES Rule 7). Actual values (and
 * each KPI's metric ID, per the data contract) arrive via the data seam in
 * Phase 9.
 */

import type { MetricUnit } from '../design-system'

/** A KPI descriptor for the Overview strip. */
export interface OverviewKpiDescriptor {
  id: string
  title: string
  unit: MetricUnit
  /** False when a lower value is better (e.g. response time). */
  higherIsBetter?: boolean
}

/** The Overview KPI strip (matches the server dashboard spec's `overview.kpiKeys`). */
export const OVERVIEW_KPIS: OverviewKpiDescriptor[] = [
  { id: 'followers', title: 'Followers', unit: 'count' },
  { id: 'reach', title: 'Reach', unit: 'count' },
  { id: 'impressions', title: 'Impressions', unit: 'count' },
  { id: 'engagement', title: 'Engagement Rate', unit: 'percent' },
  { id: 'total_engagements', title: 'Total Engagements', unit: 'count' },
  { id: 'content_published', title: 'Published Posts', unit: 'count' },
  { id: 'publishing_success', title: 'Publishing Success Rate', unit: 'percent' },
]

/** Supported platforms as filter options (analytics/README.md Supported Platforms). */
export const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'threads', label: 'Threads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'google_business', label: 'Google Business' },
]
