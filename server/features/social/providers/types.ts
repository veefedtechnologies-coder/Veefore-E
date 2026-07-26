/**
 * SocialPlatformProvider — Shared types and interface contract
 *
 * This file defines the minimum contract that all social platform providers
 * (InstagramProvider, FacebookProvider, and future providers) must implement.
 * No platform-specific logic lives here — only type declarations.
 *
 * Requirements: 13.1
 */

import type { PlatformId } from '../../../../src/shared/platform-registry/types'

// ---------------------------------------------------------------------------
// OAuth result types
// ---------------------------------------------------------------------------

/**
 * Returned by `initiateOAuth`. Contains the URL to redirect the user to and
 * a state token (used for CSRF protection and to carry workspaceId through
 * the OAuth round-trip).
 */
export interface OAuthInitResult {
  /** Full authorization URL the frontend should redirect the user to. */
  authUrl: string
  /** Opaque state token — typically the workspaceId or a signed JWT. */
  state: string
}

/**
 * Returned by `handleOAuthCallback` after successfully exchanging the
 * authorization code for a long-lived user access token.
 */
export interface OAuthCallbackResult {
  /** Long-lived user access token (valid ~60 days for Meta platforms). */
  longLivedToken: string
  /** UTC timestamp when the token expires. */
  tokenExpiresAt: Date
  /** Platform-level user ID associated with the token. */
  userId: string
}

// ---------------------------------------------------------------------------
// Page / account selection
// ---------------------------------------------------------------------------

/**
 * Represents one managed page (or account) returned by `getManagedPages`.
 * For Instagram this list is always empty; for Facebook it contains the Pages
 * the authenticated user administers.
 */
export interface ManagedPage {
  /** Platform-specific Page / account identifier. */
  pageId: string
  /** Human-readable display name of the Page or account. */
  pageName: string
  /** URL of the profile picture. */
  profilePictureUrl: string
  /** Page category as returned by the platform API (e.g., "Media/News Company"). */
  pageCategory: string
  /** Page-scoped access token for making API calls on behalf of this Page. */
  accessToken: string
  /** UTC expiry timestamp for the page access token. */
  tokenExpiresAt: Date
  /** OAuth permission strings granted for this page (e.g., "pages_read_engagement"). */
  permissions: string[]
  /** Meta Business Suite ID shared with linked Instagram accounts, if available. */
  metaBusinessId?: string
  /** Instagram Business Account ID linked to this Facebook Page, if available. */
  linkedInstagramAccountId?: string
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Normalized profile result returned by `getProfile`.
 * Platform-specific fields (e.g., Instagram account type, Facebook fan count)
 * are placed in `platformMetadata` rather than at the top level.
 */
export interface ProfileResult {
  /** Platform-specific unique identifier for the account. */
  accountId: string
  /** Display name (username on Instagram, Page name on Facebook). */
  displayName: string
  /** URL of the profile / avatar picture. */
  profilePictureUrl: string
  /** Follower count (fans for Facebook Pages, followers for Instagram). */
  followersCount: number
  /** Platform-specific metadata (e.g., accountType, pageCategory). */
  platformMetadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Normalized analytics result returned by `getAnalytics`.
 *
 * `metrics` contains ONLY keys that were successfully fetched from the API.
 * A missing key means "not supported / not available" — never set to 0 or null.
 * `rawResponse` is preserved in-memory for the duration of the request only
 * and MUST NOT be stored in the database or sent to the client.
 *
 * Requirements: 7.2, 12.6
 */
export interface NormalizedMetricResult {
  /**
   * Map of normalized metric key → numeric value.
   * Only present keys have meaningful data; absent = unsupported or unavailable.
   */
  metrics: Record<string, number>
  /**
   * Raw API response object — in-memory debugging only.
   * Never persisted to DB or included in client-facing responses.
   */
  rawResponse?: unknown
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Returned by `publish` after the platform confirms the post was created or
 * scheduled.
 */
export interface PublishResult {
  /** Platform-assigned unique ID for the created post or media container. */
  platformPostId: string
  /** Public permalink to the published post, if available immediately. */
  permalink?: string
}

// ---------------------------------------------------------------------------
// SocialPlatformProvider interface
// ---------------------------------------------------------------------------

/**
 * The minimum contract that every social platform provider must implement.
 *
 * Both `InstagramProvider` and `FacebookProvider` implement this interface,
 * allowing the provider factory and all callers to remain platform-agnostic.
 * No caller should contain a raw platform string comparison — use
 * `CapabilityGuard` from `src/shared/platform-registry` instead.
 *
 * Requirements: 13.1
 */
export interface SocialPlatformProvider {
  /** Identifies which platform this provider handles. Read-only. */
  readonly platform: PlatformId

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------

  /**
   * Constructs the OAuth authorization URL and returns it alongside the state
   * token. Does NOT perform any network call — purely synchronous URL building.
   *
   * @param workspaceId - The Veefore workspace initiating the connection.
   * @param redirectUri - The callback URL registered with the platform app.
   * @returns `OAuthInitResult` containing the `authUrl` and `state` token.
   */
  initiateOAuth(workspaceId: string, redirectUri: string): OAuthInitResult

  /**
   * Exchanges the authorization `code` received in the OAuth callback for a
   * long-lived user access token.
   *
   * For Meta platforms: exchanges code → short-lived UAT → long-lived UAT
   * (60-day expiry). Throws on any failure step; never returns partial results.
   *
   * @param code - The authorization code from the platform callback.
   * @param redirectUri - Must match the redirect URI used in `initiateOAuth`.
   * @returns `OAuthCallbackResult` with the long-lived token and expiry.
   */
  handleOAuthCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>

  /**
   * Retrieves all pages / accounts the authenticated user can manage.
   *
   * For Facebook: calls `/me/accounts` to return up to 100 Pages.
   * For Instagram: always returns an empty array (no page-selection concept).
   *
   * @param userAccessToken - The long-lived user access token from `handleOAuthCallback`.
   * @returns Array of `ManagedPage` objects (may be empty).
   */
  getManagedPages(userAccessToken: string): Promise<ManagedPage[]>

  // -------------------------------------------------------------------------
  // Token lifecycle
  // -------------------------------------------------------------------------

  /**
   * Refreshes the given access token and returns a new token with a renewed
   * expiry date.
   *
   * @param accessToken - The current (possibly near-expiry) access token.
   * @returns New `accessToken` string and its `expiresAt` timestamp.
   */
  refreshToken(accessToken: string): Promise<{ accessToken: string; expiresAt: Date }>

  /**
   * Revokes the given access token via the platform API.
   * Implementations MUST swallow API errors — a revocation failure must not
   * prevent a local disconnect. Log the error but do not re-throw.
   *
   * @param accessToken - The access token to revoke.
   */
  revokeToken(accessToken: string): Promise<void>

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  /**
   * Fetches the normalized profile for a connected account.
   *
   * @param accessToken - A valid access token for the account.
   * @param accountId - The platform-specific account / Page ID.
   * @returns `ProfileResult` with display name, picture URL, followers, and metadata.
   */
  getProfile(accessToken: string, accountId: string): Promise<ProfileResult>

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  /**
   * Fetches and normalizes analytics metrics for the given account and date range.
   *
   * The returned `metrics` map contains ONLY keys with successfully fetched
   * values. Missing keys signal "not available" — implementations MUST NOT
   * substitute 0 or null for unavailable metrics.
   *
   * All API calls MUST be routed through `GovernedHttpClient` to respect
   * the platform's rate limits.
   *
   * @param params.accessToken - Valid access token for the account.
   * @param params.accountId   - Platform-specific account / Page ID.
   * @param params.from        - Start of the analytics window (inclusive).
   * @param params.to          - End of the analytics window (inclusive).
   * @returns `NormalizedMetricResult` with normalized metrics and optional raw response.
   */
  getAnalytics(params: {
    accessToken: string
    accountId: string
    from: Date
    to: Date
  }): Promise<NormalizedMetricResult>

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  /**
   * Publishes or schedules a post on behalf of the connected account.
   *
   * If `scheduledAt` is provided and is in the future, the implementation
   * should schedule the post rather than publish immediately (where supported).
   *
   * @param params.accessToken - Valid access token for the account.
   * @param params.accountId   - Platform-specific account / Page ID.
   * @param params.mediaType   - Post type (e.g., "IMAGE", "VIDEO", "REEL", "TEXT").
   * @param params.mediaUrl    - URL of the media asset (optional for text-only posts).
   * @param params.caption     - Post caption / body text (optional).
   * @param params.scheduledAt - UTC timestamp to schedule the post (optional).
   * @returns `PublishResult` with the platform-assigned post ID and permalink.
   */
  publish(params: {
    accessToken: string
    accountId: string
    mediaType: string
    mediaUrl?: string
    caption?: string
    scheduledAt?: Date
  }): Promise<PublishResult>
}
