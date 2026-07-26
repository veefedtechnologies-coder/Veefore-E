/**
 * Veefore Analytics — Dashboard API Ports (Phase 8).
 *
 * Read-side storage port for rollups. Implemented with MongoDB in Phase 10; the
 * empty default lets the API serve a well-formed (empty) response before
 * persistence is wired — never fabricated data (CODING_RULES Rule 16).
 */

import type { MetricRollup, RollupGranularity } from '../aggregation'

/** Read query for rollups scoped to a workspace and window. */
export interface RollupReadQuery {
  workspaceId: string
  platforms?: string[]
  accountIds?: string[]
  granularity: RollupGranularity
  /** Inclusive ISO start. */
  from?: string
  /** Exclusive ISO end. */
  to?: string
}

/** Read-side access to aggregated rollups (08-backend-api-architecture.md Ch 4). */
export interface RollupReadStore {
  getRollups(query: RollupReadQuery): Promise<MetricRollup[]>
}

/** A daily time-series point: canonical metric key → value for one day. */
export interface DailySeriesPoint {
  /** Day timestamp (ISO). */
  date: string
  metrics: Record<string, number>
}

/**
 * Optional read-side access to daily time-series (for the performance timeline
 * chart). Stores that can provide per-day values implement this in addition to
 * {@link RollupReadStore}.
 */
export interface SeriesReadStore {
  getDailySeries(query: RollupReadQuery): Promise<DailySeriesPoint[]>
}

/** A labelled slice for a distribution widget (e.g. audience by country). */
export interface DistributionSlice {
  label: string
  value: number
}

/** A ranked content/entity item for a top-performers widget. */
export interface TopItem {
  id: string
  label: string
  value: number
  secondary?: string
  /** Thumbnail or media_url for the post preview. */
  thumbnailUrl?: string
  /** Media type: IMAGE | VIDEO | CAROUSEL_ALBUM */
  mediaType?: string
  /** Direct Instagram permalink. */
  permalink?: string
  /** Individual metric breakdown for the card. */
  metrics?: {
    reach?: number
    views?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    engagements?: number
  }
  /** Publish date ISO string */
  publishedAt?: string
}

/** Optional provider of audience distribution data. */
export interface AudienceProvider {
  getAudienceByCountry(query: RollupReadQuery): Promise<DistributionSlice[]>
  getAudienceByCity?(query: RollupReadQuery): Promise<DistributionSlice[]>
  getAudienceByGenderAge?(query: RollupReadQuery): Promise<DistributionSlice[]>
  getAudienceActiveTime?(query: RollupReadQuery): Promise<Record<string, number>>
}

/** Optional provider of top-performing content. */
export interface ContentProvider {
  getTopContent(query: RollupReadQuery): Promise<TopItem[]>
}

/** Default read store used until the Mongo store lands (Phase 10). Returns none. */
export class EmptyRollupReadStore implements RollupReadStore {
  async getRollups(): Promise<MetricRollup[]> {
    return []
  }
}
