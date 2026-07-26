/**
 * Platform Capability Registry — Types
 *
 * This file contains ONLY TypeScript type/interface definitions.
 * No runtime code, no imports, no side effects.
 *
 * Requirements: 1.1, 1.2
 */

// ---------------------------------------------------------------------------
// Platform identifier
// ---------------------------------------------------------------------------

export type PlatformId =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'x'
  | 'threads'

// ---------------------------------------------------------------------------
// Metric support level
// ---------------------------------------------------------------------------

/**
 * Declares how well a platform supports a given analytics metric.
 *
 * - FULL    — natively provided by the platform API with full accuracy
 * - PARTIAL — available but with reduced granularity or coverage
 * - DERIVED — computable from other available metrics (no direct API field)
 * - NONE    — not available; the metric must never appear for this platform
 */
export type MetricSupportLevel = 'FULL' | 'PARTIAL' | 'DERIVED' | 'NONE'

// ---------------------------------------------------------------------------
// Capability category interfaces
// ---------------------------------------------------------------------------

export interface AuthCapabilities {
  oauthSupported: boolean
  tokenRefresh: boolean
  tokenExpiration: boolean
  multipleAccounts: boolean
  multipleWorkspaces: boolean
}

export interface PublishingCapabilities {
  textPosts: boolean
  imagePosts: boolean
  videoPosts: boolean
  carouselPosts: boolean
  reels: boolean
  stories: boolean
  linkPosts: boolean
  drafts: boolean
  scheduledPublishing: boolean
  immediatePublishing: boolean
  crossPlatformPublishing: boolean
}

export interface AnalyticsCapabilities {
  /** Map of normalized metric key → support level for this platform. */
  metrics: Record<string, MetricSupportLevel>
}

export interface AICapabilities {
  captionGeneration: boolean
  hashtagSuggestions: boolean
  aiInsights: boolean
  performanceRecommendations: boolean
  postingTimeRecommendations: boolean
  contentQualityAnalysis: boolean
  competitorAnalysis: boolean
  sentimentAnalysis: boolean
  contentRepurposing: boolean
  trendDetection: boolean
}

export interface InboxCapabilities {
  comments: boolean
  replies: boolean
  directMessages: boolean
  messenger: boolean
  moderation: boolean
  autoReplies: boolean
}

export interface ReportCapabilities {
  executiveReports: boolean
  pdf: boolean
  excel: boolean
  csv: boolean
  powerpoint: boolean
  aiSummary: boolean
  comparisonReports: boolean
}

export interface SchedulerCapabilities {
  queue: boolean
  calendar: boolean
  bulkScheduling: boolean
  mediaPreview: boolean
  separateCaptions: boolean
  platformSpecificRules: boolean
}

// ---------------------------------------------------------------------------
// Aggregate platform capability record
// ---------------------------------------------------------------------------

export interface PlatformCapabilities {
  auth: AuthCapabilities
  publishing: PublishingCapabilities
  analytics: AnalyticsCapabilities
  ai: AICapabilities
  inbox: InboxCapabilities
  reports: ReportCapabilities
  scheduler: SchedulerCapabilities
}

// ---------------------------------------------------------------------------
// Top-level registry type
// ---------------------------------------------------------------------------

/**
 * The complete, read-only registry mapping every supported platform to its
 * full capability declaration. Treated as immutable at runtime via deepFreeze.
 */
export type PlatformRegistry = Readonly<Record<PlatformId, PlatformCapabilities>>
