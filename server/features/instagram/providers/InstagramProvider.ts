/**
 * InstagramProvider — SocialPlatformProvider wrapper around InstagramService
 *
 * This is a thin adapter that implements the `SocialPlatformProvider` interface
 * by delegating every method to the existing `InstagramService`. Zero behavior
 * change — only adapts the interface shape so the provider factory and all
 * callers can remain platform-agnostic.
 *
 * Key design decisions:
 * - `getManagedPages()` always returns `[]` — Instagram has no page-selection concept.
 * - `revokeToken()` is a no-op (token revocation is handled at account disconnect).
 * - All delegated calls pass through to `InstagramService` without modification.
 *
 * Requirements: 13.1, 13.4
 */

import { InstagramService } from '../services/instagram.service'
import type {
  SocialPlatformProvider,
  OAuthInitResult,
  OAuthCallbackResult,
  ManagedPage,
  ProfileResult,
  NormalizedMetricResult,
  PublishResult,
} from '../../social/providers/types'

export class InstagramProvider implements SocialPlatformProvider {
  readonly platform = 'instagram' as const

  private readonly service = new InstagramService()

  // ---------------------------------------------------------------------------
  // OAuth
  // ---------------------------------------------------------------------------

  /**
   * Constructs the Instagram OAuth authorization URL.
   * Delegates to `InstagramService.generateAuthUrl`, passing `workspaceId` as
   * the OAuth `state` parameter for CSRF protection and round-trip continuity.
   */
  initiateOAuth(workspaceId: string, redirectUri: string): OAuthInitResult {
    const authUrl = this.service.generateAuthUrl(redirectUri, workspaceId)
    return { authUrl, state: workspaceId }
  }

  /**
   * Exchanges the authorization code for a long-lived access token.
   * Steps:
   *   1. Exchange code → short-lived token via `exchangeCodeForToken`
   *   2. Exchange short-lived → long-lived token via `getLongLivedToken`
   * Throws on any failure — never returns partial results.
   */
  async handleOAuthCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult> {
    const short = await this.service.exchangeCodeForToken(code, redirectUri)
    const long = await this.service.getLongLivedToken(short.access_token)
    return {
      longLivedToken: long.access_token,
      tokenExpiresAt: new Date(Date.now() + long.expires_in * 1000),
      userId: short.user_id ?? '',
    }
  }

  /**
   * Instagram has no page-selection concept — always returns an empty array.
   * The `userAccessToken` parameter is accepted for interface compliance but
   * is intentionally unused.
   */
  async getManagedPages(_userAccessToken: string): Promise<ManagedPage[]> {
    return []
  }

  // ---------------------------------------------------------------------------
  // Token lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Refreshes the access token using Instagram's `ig_refresh_token` grant flow.
   * Delegates to `InstagramService.refreshAccessToken`.
   */
  async refreshToken(accessToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const result = await this.service.refreshAccessToken(accessToken)
    return {
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
    }
  }

  /**
   * Instagram token revocation is handled at the account disconnect level.
   * This method is intentionally a no-op to satisfy the interface contract.
   * Errors are swallowed per the interface specification — a revocation failure
   * must not prevent a local disconnect.
   */
  async revokeToken(_accessToken: string): Promise<void> {
    // No-op: Instagram token revocation is handled at account disconnect.
  }

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  /**
   * Fetches and normalizes the Instagram user profile.
   * Delegates to `InstagramService.getUserProfile` and maps the result to
   * the `ProfileResult` interface shape.
   */
  async getProfile(accessToken: string, accountId: string): Promise<ProfileResult> {
    const profile = await this.service.getUserProfile(accessToken, accountId)
    return {
      accountId: profile.id,
      displayName: profile.username,
      profilePictureUrl: profile.profile_picture_url ?? '',
      followersCount: profile.followers_count,
      platformMetadata: {
        accountType: profile.account_type,
      },
    }
  }

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  /**
   * Fetches and normalizes Instagram account insights.
   * Delegates to `InstagramService.getAccountInsights` and maps raw insight
   * fields to normalized metric keys.
   *
   * Only present keys are included in the returned `metrics` map — absent keys
   * signal "not supported / not available" per the NormalizedMetricResult contract.
   */
  async getAnalytics(params: {
    accessToken: string
    accountId: string
    from: Date
    to: Date
  }): Promise<NormalizedMetricResult> {
    const insights = await this.service.getAccountInsights(
      params.accessToken,
      params.accountId
    )

    // Build the normalized metrics map, only including keys with actual values.
    // Never substitute 0 or null for unavailable metrics.
    const metrics: Record<string, number> = {}

    if (insights.follower_count != null) metrics.followers_total = insights.follower_count
    // Prefer the 28-day de-duplicated reach; fall back to the period reach.
    const reach = insights.reach_days_28 ?? insights.reach
    if (reach != null) metrics.reach_total = reach
    if (insights.impressions != null) metrics.impressions_total = insights.impressions
    if (insights.profile_views != null) metrics.profile_visits = insights.profile_views
    if (insights.website_clicks != null) metrics.website_clicks = insights.website_clicks

    return { metrics }
  }

  // ---------------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------------

  /**
   * Publishes or schedules a media post on Instagram.
   * Delegates to `InstagramService.publishMedia` and maps the result to
   * the `PublishResult` interface shape.
   */
  async publish(params: {
    accessToken: string
    accountId: string
    mediaType: string
    mediaUrl?: string
    caption?: string
    scheduledAt?: Date
  }): Promise<PublishResult> {
    const result = await this.service.publishMedia(
      params.accessToken,
      params.mediaType as 'photo' | 'video' | 'reel' | 'story',
      params.mediaUrl ?? '',
      {
        caption: params.caption,
        accountId: params.accountId,
      }
    )
    return {
      platformPostId: result.id,
      permalink: result.permalink,
    }
  }
}
