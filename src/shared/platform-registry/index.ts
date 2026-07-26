/**
 * Platform Capability Registry
 *
 * Single source of truth for every platform's capability declarations.
 * Importable in both Node.js backend and React/TypeScript frontend bundles
 * — no Node-only APIs used.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import type {
  PlatformId,
  PlatformCapabilities,
  PlatformRegistry,
  MetricSupportLevel,
  AuthCapabilities,
  PublishingCapabilities,
} from './types'

// ---------------------------------------------------------------------------
// Deep freeze utility — enforces runtime immutability (Requirement 1.7)
// ---------------------------------------------------------------------------

/**
 * Recursively freezes an object and all of its nested properties.
 * After freezing, any attempt to mutate a property is silently rejected
 * (in strict mode it throws a TypeError, but the original value is preserved).
 */
function deepFreeze<T>(obj: T): T {
  Object.freeze(obj)
  if (obj !== null && typeof obj === 'object') {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        deepFreeze(value)
      }
    }
  }
  return obj
}

// ---------------------------------------------------------------------------
// Stub capability sets for future platforms
// Pre-declared with all-false/empty capabilities so future additions
// require zero schema migrations (Requirement 1.5)
// ---------------------------------------------------------------------------

const STUB_AUTH: AuthCapabilities = {
  oauthSupported: false,
  tokenRefresh: false,
  tokenExpiration: false,
  multipleAccounts: false,
  multipleWorkspaces: false,
}

const STUB_PUBLISHING: PublishingCapabilities = {
  textPosts: false,
  imagePosts: false,
  videoPosts: false,
  carouselPosts: false,
  reels: false,
  stories: false,
  linkPosts: false,
  drafts: false,
  scheduledPublishing: false,
  immediatePublishing: false,
  crossPlatformPublishing: false,
}

const STUB_CAPABILITIES: PlatformCapabilities = {
  auth: STUB_AUTH,
  publishing: STUB_PUBLISHING,
  analytics: { metrics: {} },
  ai: {
    captionGeneration: false,
    hashtagSuggestions: false,
    aiInsights: false,
    performanceRecommendations: false,
    postingTimeRecommendations: false,
    contentQualityAnalysis: false,
    competitorAnalysis: false,
    sentimentAnalysis: false,
    contentRepurposing: false,
    trendDetection: false,
  },
  inbox: {
    comments: false,
    replies: false,
    directMessages: false,
    messenger: false,
    moderation: false,
    autoReplies: false,
  },
  reports: {
    executiveReports: false,
    pdf: false,
    excel: false,
    csv: false,
    powerpoint: false,
    aiSummary: false,
    comparisonReports: false,
  },
  scheduler: {
    queue: false,
    calendar: false,
    bulkScheduling: false,
    mediaPreview: false,
    separateCaptions: false,
    platformSpecificRules: false,
  },
}

// ---------------------------------------------------------------------------
// Registry data — full capability declarations for instagram and facebook
// ---------------------------------------------------------------------------

const _registry: Record<PlatformId, PlatformCapabilities> = {
  // -------------------------------------------------------------------------
  // Instagram
  // -------------------------------------------------------------------------
  instagram: {
    auth: {
      oauthSupported: true,
      tokenRefresh: true,
      tokenExpiration: true,
      multipleAccounts: true,
      multipleWorkspaces: true,
    },
    publishing: {
      textPosts: false,
      imagePosts: true,
      videoPosts: true,
      carouselPosts: true,
      reels: true,
      stories: true,
      linkPosts: false,
      drafts: true,
      scheduledPublishing: true,
      immediatePublishing: true,
      crossPlatformPublishing: true,
    },
    analytics: {
      metrics: {
        followers_total: 'FULL',
        reach_total: 'FULL',
        impressions_total: 'FULL',
        total_engagements: 'FULL',
        likes: 'FULL',
        comments: 'FULL',
        shares: 'FULL',
        saves: 'FULL',
        video_views: 'FULL',
        profile_visits: 'FULL',
        website_clicks: 'FULL',
        published_posts: 'FULL',
        // Calculated metrics — derived from the above raw metrics
        engagement_rate_by_reach: 'DERIVED',
        engagement_rate_by_followers: 'DERIVED',
        engagement_rate_by_impressions: 'DERIVED',
        publishing_success_rate: 'DERIVED',
        new_followers: 'FULL',
        lost_followers: 'FULL',
        reach_efficiency: 'DERIVED',
        share_rate: 'DERIVED',
        // Facebook-specific metrics are not available on Instagram
        facebook_reactions: 'NONE',
        facebook_page_views: 'NONE',
        facebook_post_clicks: 'NONE',
      },
    },
    ai: {
      captionGeneration: true,
      hashtagSuggestions: true,
      aiInsights: true,
      performanceRecommendations: true,
      postingTimeRecommendations: true,
      contentQualityAnalysis: true,
      competitorAnalysis: true,
      sentimentAnalysis: true,
      contentRepurposing: true,
      trendDetection: true,
    },
    inbox: {
      comments: true,
      replies: true,
      directMessages: true,
      messenger: false,
      moderation: true,
      autoReplies: true,
    },
    reports: {
      executiveReports: true,
      pdf: true,
      excel: true,
      csv: true,
      powerpoint: true,
      aiSummary: true,
      comparisonReports: true,
    },
    scheduler: {
      queue: true,
      calendar: true,
      bulkScheduling: true,
      mediaPreview: true,
      separateCaptions: true,
      platformSpecificRules: true,
    },
  },

  // -------------------------------------------------------------------------
  // Facebook
  // -------------------------------------------------------------------------
  facebook: {
    auth: {
      oauthSupported: true,
      tokenRefresh: true,
      tokenExpiration: true,
      multipleAccounts: true,
      multipleWorkspaces: true,
    },
    publishing: {
      textPosts: true,
      imagePosts: true,
      videoPosts: true,
      carouselPosts: false,
      reels: true,
      stories: false,
      linkPosts: true,
      drafts: true,
      scheduledPublishing: true,
      immediatePublishing: true,
      crossPlatformPublishing: true,
    },
    analytics: {
      metrics: {
        followers_total: 'FULL',
        // reach_total: uses page_posts_impressions_organic as a "media views" proxy
        // (Meta's new views-based model replacement for deprecated page_impressions_unique).
        // Historical data pre-2024 uses the genuine page_impressions_unique value.
        reach_total: 'FULL',
        impressions_total: 'FULL',
        total_engagements: 'FULL',
        likes: 'FULL',
        comments: 'FULL',
        shares: 'FULL',
        saves: 'NONE',   // Facebook does not expose a "saves" metric
        video_views: 'FULL',
        profile_visits: 'FULL',
        website_clicks: 'NONE',   // no valid page CTA-click insights metric post-2024
        published_posts: 'FULL',
        // Facebook-exclusive metrics
        facebook_reactions: 'FULL',
        facebook_page_views: 'FULL',
        facebook_post_clicks: 'FULL',
        // Calculated metrics — derived from the above raw metrics
        engagement_rate_by_reach: 'DERIVED',
        engagement_rate_by_followers: 'DERIVED',
        engagement_rate_by_impressions: 'DERIVED',
        publishing_success_rate: 'DERIVED',
        new_followers: 'FULL',
        lost_followers: 'FULL',
        reach_efficiency: 'DERIVED',
        share_rate: 'DERIVED',
      },
    },
    ai: {
      captionGeneration: true,
      hashtagSuggestions: true,
      aiInsights: true,
      performanceRecommendations: true,
      postingTimeRecommendations: true,
      contentQualityAnalysis: true,
      competitorAnalysis: true,
      sentimentAnalysis: true,
      contentRepurposing: true,
      trendDetection: true,
    },
    inbox: {
      comments: true,
      replies: true,
      directMessages: false,
      messenger: true,
      moderation: true,
      autoReplies: true,
    },
    reports: {
      executiveReports: true,
      pdf: true,
      excel: true,
      csv: true,
      powerpoint: true,
      aiSummary: true,
      comparisonReports: true,
    },
    scheduler: {
      queue: true,
      calendar: true,
      bulkScheduling: true,
      mediaPreview: true,
      separateCaptions: true,
      platformSpecificRules: true,
    },
  },

  // -------------------------------------------------------------------------
  // Future platforms — pre-declared with stub capabilities so no schema
  // migrations are needed when they are eventually implemented.
  // -------------------------------------------------------------------------
  linkedin: { ...STUB_CAPABILITIES },
  youtube: { ...STUB_CAPABILITIES },
  tiktok: { ...STUB_CAPABILITIES },
  pinterest: { ...STUB_CAPABILITIES },
  x: { ...STUB_CAPABILITIES },
  threads: { ...STUB_CAPABILITIES },
}

// ---------------------------------------------------------------------------
// Exported immutable registry (Requirement 1.7)
// ---------------------------------------------------------------------------

/**
 * The fully frozen Platform Capability Registry.
 * Every nested object is recursively frozen — mutation attempts are silently
 * rejected and the original declared value is always preserved.
 */
export const PLATFORM_REGISTRY: PlatformRegistry = deepFreeze(_registry) as PlatformRegistry

// ---------------------------------------------------------------------------
// CapabilityGuard — typed runtime query API (Requirements 1.3, 1.4)
//
// Never throws. Returns 'NONE' / false and emits a console.warn for any
// unknown platform so callers can rely on safe defaults.
// ---------------------------------------------------------------------------

export const CapabilityGuard = {
  /**
   * Returns the MetricSupportLevel declared for `metricKey` on `platform`.
   *
   * - Returns `'NONE'` when the platform is unknown or the metric is not
   *   declared for that platform.
   * - Emits `console.warn` for unknown platforms (Requirement 1.4).
   *
   * @example
   * CapabilityGuard.getMetricSupport('facebook', 'saves')   // 'NONE'
   * CapabilityGuard.getMetricSupport('instagram', 'saves')  // 'FULL'
   */
  getMetricSupport(platform: PlatformId, metricKey: string): MetricSupportLevel {
    const entry = PLATFORM_REGISTRY[platform]
    if (!entry) {
      console.warn(`[CapabilityGuard] Unknown platform queried: "${platform}". Returning 'NONE'.`)
      return 'NONE'
    }
    return (entry.analytics.metrics[metricKey] as MetricSupportLevel | undefined) ?? 'NONE'
  },

  /**
   * Returns whether `postType` publishing is supported on `platform`.
   *
   * - Returns `false` when the platform is unknown.
   * - Emits `console.warn` for unknown platforms.
   *
   * @example
   * CapabilityGuard.supportsPublishing('facebook', 'textPosts')  // true
   * CapabilityGuard.supportsPublishing('instagram', 'linkPosts') // false
   */
  supportsPublishing(platform: PlatformId, postType: keyof PublishingCapabilities): boolean {
    const entry = PLATFORM_REGISTRY[platform]
    if (!entry) {
      console.warn(`[CapabilityGuard] Unknown platform queried: "${platform}". Returning false.`)
      return false
    }
    return Boolean(entry.publishing[postType])
  },

  /**
   * Returns whether the given auth `capability` is supported on `platform`.
   *
   * - Returns `false` when the platform is unknown.
   * - Emits `console.warn` for unknown platforms.
   *
   * @example
   * CapabilityGuard.supportsAuth('facebook', 'tokenRefresh') // true
   * CapabilityGuard.supportsAuth('linkedin', 'oauthSupported') // false
   */
  supportsAuth(platform: PlatformId, capability: keyof AuthCapabilities): boolean {
    const entry = PLATFORM_REGISTRY[platform]
    if (!entry) {
      console.warn(`[CapabilityGuard] Unknown platform queried: "${platform}". Returning false.`)
      return false
    }
    return Boolean(entry.auth[capability])
  },

  /**
   * Returns all platform IDs present in the registry, regardless of their
   * capability state.
   *
   * @example
   * CapabilityGuard.getRegisteredPlatforms()
   * // ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'x', 'threads']
   */
  getRegisteredPlatforms(): PlatformId[] {
    return Object.keys(PLATFORM_REGISTRY) as PlatformId[]
  },

  /**
   * Returns only the platform IDs whose `auth.oauthSupported` is `true`.
   * Use this to populate "Add Account" UI sections without hardcoding platform
   * lists (Requirement 1.5).
   *
   * @example
   * CapabilityGuard.getConnectablePlatforms() // ['instagram', 'facebook']
   */
  getConnectablePlatforms(): PlatformId[] {
    return (Object.keys(PLATFORM_REGISTRY) as PlatformId[]).filter(
      (p) => PLATFORM_REGISTRY[p].auth.oauthSupported === true,
    )
  },
} as const

// ---------------------------------------------------------------------------
// Re-export types for convenience — consumers can import everything from
// this single entry-point without reaching into types.ts directly.
// ---------------------------------------------------------------------------

export type {
  PlatformId,
  MetricSupportLevel,
  AuthCapabilities,
  PublishingCapabilities,
  PlatformCapabilities,
  PlatformRegistry,
} from './types'
