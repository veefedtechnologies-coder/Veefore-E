/**
 * Veefore Analytics — Event Name Catalog (Phase 7).
 *
 * Event names follow the `domain.action.object` convention
 * (07-data-event-architecture.md Ch 3). Ad-hoc names are never allowed — new
 * events are added to this catalog. A format validator enforces the convention.
 */

/** `domain.action.object`, each segment lower_snake, starting with a letter. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

/**
 * Catalog of known analytics event names. Extend here rather than inventing
 * names at call sites. Grouped by domain for readability.
 */
export const ANALYTICS_EVENT_NAMES = {
  // Connected account lifecycle
  ACCOUNT_CONNECTED: 'account.connected.account',
  ACCOUNT_DISCONNECTED: 'account.disconnected.account',

  // Sync lifecycle
  SYNC_STARTED: 'sync.started.job',
  SYNC_COMPLETED: 'sync.completed.job',
  SYNC_FAILED: 'sync.failed.job',

  // Instagram
  INSTAGRAM_FOLLOWERS_UPDATED: 'instagram.followers.updated',
  INSTAGRAM_POST_CREATED: 'instagram.post.created',
  INSTAGRAM_STORY_CREATED: 'instagram.story.created',
  INSTAGRAM_REEL_CREATED: 'instagram.reel.created',
  INSTAGRAM_COMMENT_RECEIVED: 'instagram.comment.received',
  INSTAGRAM_MEDIA_SYNCED: 'instagram.media.synced',

  // YouTube
  YOUTUBE_VIDEO_SYNCED: 'youtube.video.synced',
  YOUTUBE_SUBSCRIBERS_UPDATED: 'youtube.subscribers.updated',

  // Publishing
  PUBLISHING_POST_PUBLISHED: 'publishing.published.post',
  PUBLISHING_POST_FAILED: 'publishing.failed.post',

  // Automation
  AUTOMATION_EXECUTION_COMPLETED: 'automation.completed.execution',
  AUTOMATION_EXECUTION_FAILED: 'automation.failed.execution',

  // Campaign
  CAMPAIGN_COMPLETED: 'campaign.completed.campaign',

  // Analytics platform
  ANALYTICS_REPORT_GENERATED: 'analytics.generated.report',
} as const

/** Union of catalog event name values. */
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[keyof typeof ANALYTICS_EVENT_NAMES]

/** All catalog event names as a set (for membership checks). */
const KNOWN_EVENT_NAMES = new Set<string>(Object.values(ANALYTICS_EVENT_NAMES))

/** True when `name` matches the `domain.action.object` format. */
export function isValidEventNameFormat(name: string): boolean {
  return EVENT_NAME_PATTERN.test(name)
}

/** True when `name` is a registered catalog event. */
export function isKnownEventName(name: string): boolean {
  return KNOWN_EVENT_NAMES.has(name)
}

/** Extract the domain (first segment) of an event name, or null if malformed. */
export function eventDomain(name: string): string | null {
  if (!isValidEventNameFormat(name)) return null
  return name.split('.')[0]
}
