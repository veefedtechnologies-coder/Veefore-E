/**
 * Veefore Analytics — Dashboard Service (Phase 8).
 *
 * Assembles a dashboard-oriented response envelope (ADR-003; 09-data-contracts.md)
 * by reading rollups (via a {@link RollupReadStore}) and computing KPI values +
 * deltas with the Phase 2 metric engine. All computation happens here on the
 * backend (CODING_RULES Rule 9); the frontend only displays the result.
 *
 * Until the Mongo read store is wired (Phase 10) the default store returns no
 * rollups, so responses are well-formed but empty (`partialData: true`) — never
 * fabricated (Rule 16).
 */

import { randomUUID } from 'crypto'

import {
  getMetricByKey,
  metricEngine,
  type AggregationType,
  type MetricContext,
} from '../metrics'
import { aiIntelligenceEngine } from '../ai'
import type { MetricRollup } from '../aggregation'
import {
  ANALYTICS_CONTRACT_VERSION,
  type ContractTrend,
  type DashboardResponse,
  type KpiContract,
  type AlertContract,
  type RecommendationContract,
  type WidgetContract,
} from './contracts'
import { getDashboardSpec } from './dashboard-specs'
import type { AnalyticsQuery } from './query'
import {
  EmptyRollupReadStore,
  type AudienceProvider,
  type ContentProvider,
  type DailySeriesPoint,
  type RollupReadQuery,
  type RollupReadStore,
  type SeriesReadStore,
} from './ports'
import { multiPlatformRollupStore } from '../bridge/MultiPlatformRollupStore'

/** Error thrown for an unknown dashboard id (mapped to 404 by the route). */
export class UnknownDashboardError extends Error {
  constructor(dashboardId: string) {
    super(`Unknown dashboard: ${dashboardId}`)
    this.name = 'UnknownDashboardError'
  }
}

const HOUR_MS = 3600_000

/** Aggregation type for a metric key (registry-driven, default sum). */
function aggregationFor(key: string): AggregationType {
  return getMetricByKey(key)?.aggregation ?? 'sum'
}

/**
 * Override aggregation for specific keys when combining CROSS-PLATFORM rollups.
 * followers_total = sum across platforms (each platform has independent followers).
 * reach_total = sum across platforms (different audiences).
 * impressions_total = sum across platforms.
 */
function crossPlatformAggregationFor(key: string): AggregationType {
  // For cross-platform combination, follower/reach/impression metrics should sum
  // rather than picking latest, since each platform's audience is independent.
  if (key === 'followers_total' || key === 'reach_total' || key === 'impressions_total' ||
      key === 'total_engagements' || key === 'likes' || key === 'comments' ||
      key === 'shares' || key === 'saves' || key === 'video_views' ||
      key === 'published_posts' || key === 'new_followers') {
    return 'sum'
  }
  return aggregationFor(key)
}

/**
 * Combine multiple rollups (across accounts/platforms/periods) into a single
 * metrics snapshot, reducing each key by its aggregation type — the same rule
 * used during rollup (Ch 8 lineage).
 *
 * When combining rollups from MULTIPLE PLATFORMS (detected by unique platform
 * values in the rollup array), follower/reach/engagement metrics use sum instead
 * of latest since each platform has an independent audience.
 */
function combineRollups(rollups: MetricRollup[]): Record<string, number> {
  const samples = new Map<string, { value: number; ts: number }[]>()
  for (const r of rollups) {
    const ts = Date.parse(r.lastEventAt)
    for (const [key, value] of Object.entries(r.metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const list = samples.get(key) ?? []
      list.push({ value, ts: Number.isNaN(ts) ? 0 : ts })
      samples.set(key, list)
    }
  }

  // Detect if we're combining data from multiple distinct platforms
  const uniquePlatforms = new Set(rollups.map(r => r.platform).filter(Boolean))
  const isMultiPlatform = uniquePlatforms.size > 1

  const combined: Record<string, number> = {}
  for (const [key, list] of samples) {
    // Use cross-platform aggregation when combining data from multiple platforms
    const agg = isMultiPlatform ? crossPlatformAggregationFor(key) : aggregationFor(key)
    switch (agg) {
      case 'sum':
        combined[key] = list.reduce((s, v) => s + v.value, 0)
        break
      case 'average':
        combined[key] = list.reduce((s, v) => s + v.value, 0) / list.length
        break
      case 'max':
        combined[key] = Math.max(...list.map((v) => v.value))
        break
      case 'min':
        combined[key] = Math.min(...list.map((v) => v.value))
        break
      case 'count':
        combined[key] = list.length
        break
      default: {
        let latest = list[0]
        for (const v of list) if (v.ts >= latest.ts) latest = v
        combined[key] = latest.value
      }
    }
  }
  return combined
}

/** Latest rollup refresh time across a set, ISO or undefined. */
function latestRefresh(rollups: MetricRollup[]): string | undefined {
  let maxMs = 0
  for (const r of rollups) {
    const ms = Date.parse(r.lastEventAt)
    if (!Number.isNaN(ms) && ms > maxMs) maxMs = ms
  }
  return maxMs > 0 ? new Date(maxMs).toISOString() : undefined
}

/** Trend from a signed change. */
function trendOf(change: number | null): ContractTrend {
  if (change === null || change === 0) return 'flat'
  return change > 0 ? 'up' : 'down'
}

/** Short chart label for a day, e.g. "Jan 15". */
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

export interface DashboardServiceDeps {
  readStore?: RollupReadStore
  /** Optional daily-series provider for the primary time-series chart + AI. */
  seriesStore?: SeriesReadStore
  /** Optional audience distribution provider. */
  audienceProvider?: AudienceProvider
  /** Optional top-performing-content provider. */
  contentProvider?: ContentProvider
}

/** Assembles dashboard response envelopes. */
export class DashboardService {
  private readonly readStore: RollupReadStore
  private readonly seriesStore?: SeriesReadStore
  private readonly audienceProvider?: AudienceProvider
  private readonly contentProvider?: ContentProvider

  constructor(deps: DashboardServiceDeps = {}) {
    this.readStore = deps.readStore ?? new EmptyRollupReadStore()
    this.seriesStore = deps.seriesStore
    this.audienceProvider = deps.audienceProvider
    this.contentProvider = deps.contentProvider
  }

  /**
   * Build the response envelope for a dashboard. Throws {@link UnknownDashboardError}
   * for an unrecognized id.
   */
  async buildDashboard(dashboardId: string, query: AnalyticsQuery): Promise<DashboardResponse> {
    const spec = getDashboardSpec(dashboardId)
    if (!spec) throw new UnknownDashboardError(dashboardId)

    const readQuery: RollupReadQuery = {
      workspaceId: query.workspaceId,
      platforms: query.platforms,
      accountIds: query.accounts,
      granularity: query.granularity,
      from: query.from,
      to: query.to,
    }

    const [currentRollups, previousRollups] = await Promise.all([
      this.readStore.getRollups(readQuery),
      query.compareFrom && query.compareTo
        ? this.readStore.getRollups({ ...readQuery, from: query.compareFrom, to: query.compareTo })
        : Promise.resolve<MetricRollup[]>([]),
    ])

    const current = combineRollups(currentRollups)
    const previous = combineRollups(previousRollups)

    const windowHours =
      query.from && query.to
        ? Math.max(1, (Date.parse(query.to) - Date.parse(query.from)) / HOUR_MS)
        : undefined

    const currentCtx: MetricContext = { current, previous, windowHours }
    const previousCtx: MetricContext = { current: previous, windowHours }

    // For "All Platforms" mode (no platform filter), compute per-platform breakdowns
    // so the UI can show "Facebook: X, Instagram: Y" under each KPI card.
    const isAllPlatforms = !query.platforms || query.platforms.length === 0
    const uniquePlatforms = [...new Set(currentRollups.map(r => r.platform).filter(Boolean))] as string[]
    const hasMultiplePlatforms = isAllPlatforms && uniquePlatforms.length > 1

    // Build per-platform metric maps for breakdown display
    const perPlatformCurrents = new Map<string, Record<string, number>>()
    if (hasMultiplePlatforms) {
      for (const platform of uniquePlatforms) {
        const platformRollups = currentRollups.filter(r => r.platform === platform)
        perPlatformCurrents.set(platform, combineRollups(platformRollups))
      }
    }

    const kpis: KpiContract[] = spec.kpiKeys.map((key) => {
      const kpi = this.buildKpi(key, currentCtx, previousCtx)
      // Inject per-platform breakdown when in All Platforms mode with multiple platforms
      if (hasMultiplePlatforms) {
        kpi.platformBreakdown = uniquePlatforms.map(platform => {
          const platformMetrics = perPlatformCurrents.get(platform) ?? {}
          const platformCtx: MetricContext = { current: platformMetrics, windowHours }
          const platformValue = metricEngine.computeMetric(key, platformCtx)
          return { platform, value: platformValue.value }
        })
      }
      return kpi
    })

    // Daily series powers both the performance chart and the AI analysis.
    const daily =
      this.seriesStore && spec.seriesKeys && spec.seriesKeys.length > 0
        ? await this.seriesStore.getDailySeries(readQuery)
        : []

    const widgets: WidgetContract[] = []
    const timeseries = this.buildTimeseriesWidget(spec.seriesKeys, daily)
    if (timeseries) widgets.push(timeseries)

    if (spec.audienceWidget && this.audienceProvider) {
      const audience = await this.buildAudienceWidget(readQuery)
      if (audience) widgets.push(audience)
    }
    if (spec.audienceDemographicsWidget && this.audienceProvider) {
      const demo = await this.buildAudienceDemographicsWidget(readQuery)
      if (demo) widgets.push(demo)
    }
    if (spec.topContentWidget && this.contentProvider) {
      const content = await this.buildTopContentWidget(readQuery)
      if (content) widgets.push(content)
    }

    const { summary, recommendations, alerts } = this.buildIntelligence(
      spec.seriesKeys,
      daily,
      current,
      previous,
      dashboardId,
    )

    // ── Partial-data detection ───────────────────────────────────────────────
    // When the readStore is a MultiPlatformRollupStore, read which platforms
    // returned empty results while others returned data (Requirements 5.7, 12.4, 12.5).
    const partialPlatforms: string[] =
      'lastPartialPlatforms' in this.readStore
        ? (this.readStore as { lastPartialPlatforms: string[] }).lastPartialPlatforms
        : []

    const PLATFORM_DISPLAY: Record<string, string> = {
      facebook: 'Facebook',
      instagram: 'Instagram',
    }

    const platformWarnings: string[] = partialPlatforms.map((p) => {
      const displayName = PLATFORM_DISPLAY[p] ?? p.charAt(0).toUpperCase() + p.slice(1)
      return `${displayName} data temporarily unavailable`
    })

    const partialData = currentRollups.length === 0 || platformWarnings.length > 0
    const warnings = currentRollups.length === 0 && platformWarnings.length === 0
      ? ['No analytics data is available yet for this workspace and range.']
      : platformWarnings

    const comparisonRequested = Boolean(query.compareFrom && query.compareTo)
    const comparisonAvailable = comparisonRequested && previousRollups.length > 0
    if (comparisonRequested && !comparisonAvailable) {
      warnings.push(
        'Comparison data is unavailable for the previous period — it predates the platform’s ~24-month data window. It will appear as your stored history grows.'
      )
    }

    return {
      meta: {
        requestId: randomUUID(),
        dashboardId,
        apiVersion: ANALYTICS_CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        lastRefresh: latestRefresh(currentRollups),
        workspaceId: query.workspaceId,
        platforms: query.platforms ?? [],
        comparison:
          query.compareFrom && query.compareTo
            ? { from: query.compareFrom, to: query.compareTo }
            : null,
        comparisonRequested,
        comparisonAvailable,
        partialData,
        warnings,
      },
      summary,
      kpis,
      widgets,
      alerts,
      recommendations,
      forecast: null,
    }
  }

  /**
   * Build the primary time-series widget from already-fetched daily points, when
   * the dashboard declares `seriesKeys`. Returns `null` otherwise (the chart then
   * renders its empty state).
   */
  private buildTimeseriesWidget(
    seriesKeys: string[] | undefined,
    daily: DailySeriesPoint[]
  ): WidgetContract | null {
    if (!seriesKeys || seriesKeys.length === 0 || daily.length === 0) return null

    const series = seriesKeys.map((key) => {
      const def = getMetricByKey(key)
      return { key, name: def?.name ?? key, unit: def?.unit ?? 'count' }
    })

    const points = daily.map((d) => {
      const point: Record<string, string | number> = { label: shortDate(d.date) }
      for (const key of seriesKeys) {
        const value = d.metrics[key]
        if (typeof value === 'number' && Number.isFinite(value)) point[key] = value
      }
      return point
    })

    return {
      widgetId: 'primary-timeseries',
      widgetType: 'timeseries',
      title: 'Performance timeline',
      metricIds: seriesKeys.map((k) => getMetricByKey(k)?.id ?? k),
      lastUpdated: daily[daily.length - 1]?.date,
      data: { series, points },
    }
  }

  /**
   * Generate page-specific, contextual recommendations grounded in the
   * workspace's actual metric data. Each recommendation is tailored to the
   * dashboard it appears on, references what's actually changing, and provides
   * cross-dashboard action links so users can immediately act on the insight.
   */
  private buildIntelligence(
    seriesKeys: string[] | undefined,
    daily: DailySeriesPoint[],
    current?: Record<string, number>,
    previous?: Record<string, number>,
    dashboardId?: string,
  ): { summary: DashboardResponse['summary']; recommendations: RecommendationContract[]; alerts: AlertContract[] } {
    if (!seriesKeys || seriesKeys.length === 0) {
      return { summary: null, recommendations: [], alerts: [] }
    }

    // ── Build series for the AI engine ─────────────────────────────────────
    let series: Record<string, number[]> = {}

    if (daily.length >= 2) {
      for (const key of seriesKeys) {
        series[key] = daily.map((d) => (typeof d.metrics[key] === 'number' ? d.metrics[key] : 0))
      }
    } else if (current && previous && Object.keys(current).length > 0) {
      for (const key of seriesKeys) {
        const prev = previous[key] ?? 0
        const cur = current[key] ?? 0
        if (prev > 0 && cur > 0) series[key] = [prev, cur]
      }
    }

    if (Object.keys(series).length === 0) {
      return { summary: null, recommendations: [], alerts: [] }
    }

    const result = aiIntelligenceEngine.analyze({ series, dataQuality: 'calculated', forecastHorizon: 7 })

    const summary = result.executiveSummary.text
      ? { text: result.executiveSummary.text, confidence: result.executiveSummary.confidence }
      : null

    // ── Page-specific, contextual recommendation templates ──────────────────
    // Each entry maps a metric trend to a recommendation that:
    //  1. Is relevant to the dashboard it appears on (not "view X" when already on X)
    //  2. References what's actually affecting that metric
    //  3. Provides cross-dashboard links to act on the insight
    type RecTemplate = {
      whenFalling: { title: string; explanation: string; actions: Array<{ label: string; path: string }> }
      whenRising: { title: string; explanation: string; actions: Array<{ label: string; path: string }> }
    }

    const METRIC_TEMPLATES: Record<string, RecTemplate> = {
      reach_total: {
        whenFalling: {
          title: 'Reach is declining — post at peak times',
          explanation: 'Fewer accounts are seeing your content. Posting when your audience is most active can significantly widen your reach without more followers.',
          actions: [
            { label: 'Find best posting times', path: '/analytics/best-time' },
            { label: 'Review content performance', path: '/analytics/content' },
          ],
        },
        whenRising: {
          title: 'Great reach growth — identify what\'s driving it',
          explanation: 'Your content is being seen by more people. Check which post types and times are performing best so you can replicate the pattern.',
          actions: [
            { label: 'See top posts', path: '/analytics/content' },
            { label: 'Check posting times', path: '/analytics/best-time' },
          ],
        },
      },
      total_engagements: {
        whenFalling: {
          title: 'Engagement dropped — try more saves-worthy content',
          explanation: 'Fewer likes, comments, shares, and saves this period. Content that teaches, entertains, or solves a problem tends to drive deeper engagement.',
          actions: [
            { label: 'Check audience demographics', path: '/analytics/audience' },
            { label: 'Find best time to post', path: '/analytics/best-time' },
          ],
        },
        whenRising: {
          title: 'Strong engagement — audience is resonating',
          explanation: 'Your content is sparking more interactions. Keep this up by maintaining the content style and cadence that\'s working.',
          actions: [
            { label: 'See what\'s performing', path: '/analytics/content' },
            { label: 'Check reach trend', path: '/analytics/reach' },
          ],
        },
      },
      followers_total: {
        whenFalling: {
          title: 'Follower count dropped — review audience retention',
          explanation: 'Net followers declined this period. Check your audience churn and consider whether recent content aligns with what drew your existing followers.',
          actions: [
            { label: 'Analyse audience churn', path: '/analytics/audience' },
            { label: 'Improve engagement quality', path: '/analytics/engagement' },
          ],
        },
        whenRising: {
          title: 'Follower growth on track — sustain the momentum',
          explanation: 'New followers are discovering your account. Make sure your first few posts give a strong first impression to new arrivals.',
          actions: [
            { label: 'Check best posting times', path: '/analytics/best-time' },
            { label: 'See engagement rate', path: '/analytics/engagement' },
          ],
        },
      },
      video_views: {
        whenFalling: {
          title: 'Post views declined — consider Reels for better reach',
          explanation: 'Content views are down. Reels and short-form video consistently out-perform static posts on Instagram\'s algorithm for new-audience reach.',
          actions: [
            { label: 'Find best time to post', path: '/analytics/best-time' },
            { label: 'Review reach metrics', path: '/analytics/reach' },
          ],
        },
        whenRising: {
          title: 'Content getting more views — double down on what works',
          explanation: 'Your posts are generating more views. Review which formats and topics are performing to replicate them.',
          actions: [
            { label: 'See top performing posts', path: '/analytics/content' },
          ],
        },
      },
      new_followers: {
        whenFalling: {
          title: 'New follower acquisition slowing',
          explanation: 'Fewer people are following you this period. Use hashtags, collaborations, and trending audio on Reels to reach new audiences.',
          actions: [
            { label: 'Check reach metrics', path: '/analytics/reach' },
            { label: 'Best time to maximise reach', path: '/analytics/best-time' },
          ],
        },
        whenRising: {
          title: 'Strong new follower growth',
          explanation: 'More people are discovering and following your account. Keep producing the type of content that brought them in.',
          actions: [
            { label: 'See which posts attracted them', path: '/analytics/content' },
          ],
        },
      },
      engagement_rate_by_reach: {
        whenFalling: {
          title: 'Engagement rate slipping — content relevance check',
          explanation: 'A lower percentage of people who see your posts are interacting. Ask a question, use a CTA, or try polls to invite more participation.',
          actions: [
            { label: 'See top engaging posts', path: '/analytics/content' },
            { label: 'Check audience interests', path: '/analytics/audience' },
          ],
        },
        whenRising: {
          title: 'Higher engagement rate — audience finds content valuable',
          explanation: 'More of your audience is interacting per post view. This is a signal the algorithm rewards — keep the quality high.',
          actions: [
            { label: 'View engagement details', path: '/analytics/engagement' },
          ],
        },
      },
    }

    // ── Build contextual recommendations ────────────────────────────────────
    const recommendations: RecommendationContract[] = []

    for (const trend of result.trends) {
      if (trend.direction === 'flat') continue

      const template = METRIC_TEMPLATES[trend.metricKey]
      if (!template) {
        // Generic fallback for metrics without a specific template
        const def = getMetricByKey(trend.metricKey)
        const name = def?.name ?? trend.metricKey
        const change = trend.changePercent !== null ? ` ${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}%` : ' significantly'
        const favourable = (def?.higherIsBetter ?? true) === (trend.direction === 'rising')
        recommendations.push({
          recommendationId: `rec_${trend.metricKey}`,
          title: favourable ? `Keep the momentum on ${name}` : `Address the decline in ${name}`,
          explanation: favourable
            ? `${name} improved${change} this period. Maintain the current strategy to sustain this positive trend.`
            : `${name} declined${change} this period. Review recent changes to content, timing, or format.`,
          confidence: trend.confidence,
          supportingMetricIds: [trend.metricKey],
          actions: [],
        })
        continue
      }

      const tpl = trend.direction === 'rising' ? template.whenRising : template.whenFalling

      // Filter out actions that point to the current dashboard (already here)
      const currentPath = dashboardId ? `/analytics/${dashboardId}` : ''
      const filteredActions = tpl.actions.filter((a) => a.path !== currentPath)

      const change = trend.changePercent !== null ? ` (${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}%)` : ''

      recommendations.push({
        recommendationId: `rec_${trend.metricKey}`,
        title: tpl.title,
        explanation: `${tpl.explanation}${change}`,
        confidence: trend.confidence,
        supportingMetricIds: [trend.metricKey],
        actions: filteredActions,
      })

      if (recommendations.length >= 3) break
    }

    // ── Generate alerts from significant KPI changes ─────────────────────────
    const alerts: AlertContract[] = []
    const now = new Date().toISOString()

    if (current && previous) {
      for (const key of seriesKeys) {
        const cur = current[key] ?? 0
        const prev = previous[key] ?? 0
        if (prev <= 0 || cur <= 0) continue
        const changePct = ((cur - prev) / prev) * 100
        const def = getMetricByKey(key)
        if (!def) continue
        const name = def.name
        const higherIsBetter = def.higherIsBetter ?? true
        const template = METRIC_TEMPLATES[key]

        if (higherIsBetter && changePct < -40) {
          alerts.push({
            alertId: `alert_critical_${key}`,
            category: def.category ?? 'performance',
            severity: 'critical',
            title: `${name} dropped ${Math.abs(Math.round(changePct))}%`,
            cause: `${name} fell from ${Math.round(prev).toLocaleString()} to ${Math.round(cur).toLocaleString()} — a significant decline this period.`,
            suggestedAction: template?.whenFalling.explanation.split('.')[0] ?? 'Review your recent content strategy.',
            createdAt: now,
          })
        } else if (higherIsBetter && changePct < -20) {
          alerts.push({
            alertId: `alert_warning_${key}`,
            category: def.category ?? 'performance',
            severity: 'warning',
            title: `${name} is down ${Math.abs(Math.round(changePct))}%`,
            cause: `${name} declined from ${Math.round(prev).toLocaleString()} to ${Math.round(cur).toLocaleString()} compared to the previous period.`,
            suggestedAction: template?.whenFalling.explanation.split('.')[0] ?? 'Consider adjusting your content approach.',
            createdAt: now,
          })
        } else if (higherIsBetter && changePct > 20 && cur > 10) {
          alerts.push({
            alertId: `alert_success_${key}`,
            category: def.category ?? 'performance',
            severity: 'success',
            title: `${name} up ${Math.round(changePct)}% 🎉`,
            cause: `${name} grew from ${Math.round(prev).toLocaleString()} to ${Math.round(cur).toLocaleString()} — a strong improvement this period.`,
            suggestedAction: template?.whenRising.explanation.split('.')[0] ?? 'Keep up the momentum.',
            createdAt: now,
          })
        }
      }
    }

    const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, success: 2, info: 3 }
    alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))

    return { summary, recommendations, alerts: alerts.slice(0, 5) }
  }

  /** Full audience demographics widget (country + city + gender-age). */
  private async buildAudienceDemographicsWidget(query: RollupReadQuery): Promise<WidgetContract | null> {
    if (!this.audienceProvider) return null
    const [country, city, genderAgeRaw, activeTime] = await Promise.all([
      this.audienceProvider.getAudienceByCountry(query),
      this.audienceProvider.getAudienceByCity?.(query) ?? Promise.resolve([]),
      this.audienceProvider.getAudienceByGenderAge?.(query) ?? Promise.resolve([]),
      this.audienceProvider.getAudienceActiveTime?.(query) ?? Promise.resolve({}),
    ])
    if (country.length === 0 && city.length === 0 && genderAgeRaw.length === 0 && Object.keys(activeTime).length === 0) return null

    // Parse Meta's "F_18-24" / "M_25-34" format into structured entries.
    const genderAge = genderAgeRaw.map((s) => {
      const parts = s.label.split('_')
      const gender = (parts[0] as 'F' | 'M') ?? 'U'
      const ageRange = parts[1] ?? s.label
      return { label: `${gender === 'F' ? 'Female' : gender === 'M' ? 'Male' : 'Unknown'} ${ageRange}`, gender, ageRange, value: s.value }
    }).sort((a, b) => b.value - a.value)

    return {
      widgetId: 'audience-demographics',
      widgetType: 'audience_demographics',
      title: 'Audience demographics',
      metricIds: [],
      data: { country, city, genderAge, activeTime },
    }
  }

  /** Audience-by-country distribution widget, when data is available. */
  private async buildAudienceWidget(query: RollupReadQuery): Promise<WidgetContract | null> {
    const slices = await this.audienceProvider!.getAudienceByCountry(query)
    if (slices.length === 0) return null
    return {
      widgetId: 'audience-country',
      widgetType: 'distribution',
      title: 'Audience by country',
      metricIds: [],
      data: { unit: 'count', slices },
    }
  }

  /** Top-performing-content list widget, when data is available. */
  private async buildTopContentWidget(query: RollupReadQuery): Promise<WidgetContract | null> {
    const items = await this.contentProvider!.getTopContent(query)
    if (items.length === 0) return null
    return {
      widgetId: 'top-content',
      widgetType: 'toplist',
      title: 'Top performing content',
      metricIds: [],
      data: { unit: 'count', items },
    }
  }

  /** Build a single KPI contract for a metric key. */
  private buildKpi(key: string, currentCtx: MetricContext, previousCtx: MetricContext): KpiContract {
    const def = getMetricByKey(key)
    const current = metricEngine.computeMetric(key, currentCtx)
    const previous = metricEngine.computeMetric(key, previousCtx)

    const value = current.value
    const previousValue = previous.value
    const change =
      value !== null && previousValue !== null ? value - previousValue : null

    // changePercent: only compute when the previous value is positive and
    // meaningful. Division by 0 → null. Also suppress when change is 0 so KPIs
    // with no movement don't show "−0%" or arrow+0%.
    const changePercent =
      change !== null &&
      change !== 0 &&
      previousValue !== null &&
      previousValue > 0
        ? Math.round(((change / previousValue) * 100 + Number.EPSILON) * 100) / 100
        : null

    // Suppress the delta/arrow when:
    // 1. change is exactly 0 (no movement)
    // 2. current value is 0 — "0 this period" after non-zero previous looks like
    //    −100% which is technically correct but misleading for low-activity counts
    //    (new_followers, growth_rate, etc.) where 0 just means "nothing happened".
    //    The value itself is already clearly shown as 0.
    const effectiveChange =
      change === 0 || value === 0 ? null : change

    return {
      metricId: current.metricId,
      key,
      title: def?.name ?? key,
      value,
      previousValue,
      change: effectiveChange,
      changePercent,
      trend: trendOf(effectiveChange),
      unit: current.unit,
      dataQuality: current.dataQuality,
      higherIsBetter: def?.higherIsBetter ?? true,
    }
  }
}

/** Shared dashboard service backed by the multi-platform rollup store (Requirements 5.3, 5.7, 6.3). */
export const dashboardService = new DashboardService({
  readStore: multiPlatformRollupStore,
  seriesStore: multiPlatformRollupStore,
  audienceProvider: multiPlatformRollupStore,
  contentProvider: multiPlatformRollupStore,
})
