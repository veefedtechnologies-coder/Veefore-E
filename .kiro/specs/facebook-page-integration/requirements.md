# Requirements Document

## Introduction

This document defines the requirements for **Facebook Page Integration** in Veefore — a comprehensive extension of the existing Instagram-first social media management platform to support Facebook Pages as a first-class platform alongside Instagram.

The feature encompasses two tightly related concerns:

1. **Facebook Page Integration** — Full OAuth, token lifecycle, analytics, publishing, scheduler, AI, reports, and social account management for Facebook Pages, implemented without altering existing Instagram functionality.
2. **Platform Capability Registry** — A centralized, declarative registry that defines per-platform capabilities (authentication, publishing, analytics metrics, AI features, inbox, reports, scheduler), eliminating scattered `if (platform === "facebook")` conditions throughout the codebase and enabling future platforms (LinkedIn, YouTube, TikTok, Pinterest, X, Threads) to be added with no UI or dashboard redesign.

The implementation must extend the existing codebase architecture (OAuth, analytics engine, metrics registry, scheduler, content studio, social accounts page, AI engine, reports, sidebar, design system) and must feel as though Veefore was originally designed to support both platforms.

---

## Glossary

- **Platform_Registry**: The centralized, immutable-at-runtime registry that declares all capabilities for every supported platform. Acts as the single source of truth consulted by the UI, analytics engine, AI engine, scheduler, reports, and dashboard.
- **FacebookProvider**: The isolated backend service module that handles all Facebook Graph API interactions including OAuth, page token management, insights, and publishing.
- **InstagramProvider**: The existing Instagram service (must not be altered in behavior).
- **SocialAccount**: A database record representing one connected platform account (Instagram Business account or Facebook Page).
- **NormalizedMetric**: A platform-agnostic metric key (e.g., `followers`, `reach`, `impressions`) that both providers map their raw API values into.
- **MetricSupportLevel**: An enum with values `FULL`, `PARTIAL`, `DERIVED`, `NONE` — used by the Platform_Registry to declare per-metric support.
- **PlatformFilter**: A UI control allowing the user to select `Instagram`, `Facebook`, or `All Platforms` to scope analytics, dashboard KPIs, and AI recommendations.
- **WorkspaceContext**: The currently active workspace, which may have zero or more connected SocialAccounts across platforms.
- **PageAccessToken**: A Facebook Page-scoped long-lived token used to make Facebook Graph API calls on behalf of a Page.
- **UserAccessToken**: A Facebook user-level long-lived token used to retrieve managed pages.
- **MetaBusinessRelationship**: The case where an Instagram Business account and a Facebook Page are linked under the same Meta Business Suite account.
- **CapabilityGuard**: A runtime utility that reads the Platform_Registry and returns whether a given capability is available for a given platform, used instead of `if (platform === "X")` checks.
- **ContentPublishRequest**: A structured request object specifying platform(s), media, caption, scheduling options, and platform-specific overrides for the scheduler and publishing pipeline.

---

## Requirements

---

### Requirement 1: Platform Capability Registry

**User Story:** As a developer, I want a single centralized source of truth that declares what each platform supports, so that no component, service, or AI engine needs to contain scattered `if (platform === "facebook")` checks.

#### Acceptance Criteria

1. THE Platform_Registry SHALL declare, for each supported platform (`instagram`, `facebook`), a complete capability set covering exactly these seven categories: authentication capabilities, publishing post types, analytics metric support levels, AI feature support, inbox capabilities, report formats, and scheduler capabilities.
2. THE Platform_Registry SHALL express each analytics metric's support for each platform as exactly one of: `FULL`, `PARTIAL`, `DERIVED`, or `NONE`.
3. WHEN a component, service, or engine needs to determine whether a platform supports a capability, THE CapabilityGuard SHALL be consulted using a typed API call that returns the declared `MetricSupportLevel` or a boolean capability flag — never a raw platform string comparison.
4. IF a capability is queried for a platform that does not exist in the Platform_Registry, THEN THE CapabilityGuard SHALL return `NONE` and log a warning rather than throwing an error.
5. WHERE a new platform is added in the future, THE Platform_Registry SHALL require only: registering a new provider entry and declaring its capability set — without requiring changes to existing UI components, analytics engine, AI engine, scheduler, dashboard, or report engine.
6. THE Platform_Registry SHALL be importable and all CapabilityGuard functions SHALL be invokable without environment-specific runtime errors in both a Node.js backend process and a React/TypeScript frontend bundle.
7. THE Platform_Registry SHALL be immutable at runtime; any attempt to mutate a platform or capability entry after initialization SHALL be silently rejected and the original value SHALL be preserved.

---

### Requirement 2: Facebook OAuth and Page Connection

**User Story:** As a user, I want to connect my Facebook Pages to my Veefore workspace using the standard Facebook Login OAuth flow, so that I can manage and analyze my Facebook presence alongside Instagram.

#### Acceptance Criteria

1. WHEN a user initiates Facebook Page connection, THE FacebookProvider SHALL redirect the user to the Facebook OAuth authorization endpoint requesting the minimum required permissions (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`).
2. WHEN the OAuth callback is received with a valid authorization code, THE FacebookProvider SHALL exchange the code for a short-lived User Access Token and then for a long-lived User Access Token valid for 60 days; IF the long-lived token exchange fails, THE System SHALL redirect the user to an error state with a retry option and SHALL NOT create a SocialAccount record.
3. IF the authorization code exchange fails or the callback contains an error parameter, THEN THE System SHALL redirect the user to an error state with a human-readable reason and a retry option, and SHALL NOT create a SocialAccount record.
4. WHEN a long-lived User Access Token is obtained, THE FacebookProvider SHALL retrieve all Pages the user manages via the `/me/accounts` endpoint (up to 100 pages) and present them for selection; IF the endpoint returns an empty list or fails, THE System SHALL display an explanatory message and offer a retry option.
5. WHEN the user selects one or more Pages, THE System SHALL save each selected Page as a separate SocialAccount record containing: Page ID, Page Name, Page Profile Picture URL, Page Category, Page Access Token, token expiry timestamp, granted permissions, workspace ID, and connection timestamp.
6. THE FacebookProvider SHALL store Page Access Tokens independently of Instagram access tokens; Instagram tokens SHALL NOT be modified, invalidated, or accessed during the Facebook OAuth flow.
7. IF the user grants fewer permissions than required for a feature, THEN THE System SHALL store the granted permissions in the SocialAccount record and the UI SHALL display which features are unavailable due to missing permissions.
8. WHEN a connected Facebook Page is reconnected, THE FacebookProvider SHALL refresh the Page Access Token and update the existing SocialAccount record without creating a duplicate; IF the refresh fails, THE System SHALL retain the existing token and set `connectionStatus` to `REQUIRES_RECONNECT`.
9. WHEN a user disconnects a Facebook Page, THE System SHALL attempt to revoke the locally stored tokens via the Facebook API and update the SocialAccount status to `DISCONNECTED`; IF the revocation API call fails, THE System SHALL still set `connectionStatus` to `DISCONNECTED` locally without affecting any Instagram connections in the same workspace.
10. WHEN a Facebook Page token is within 7 days of expiry, THE System SHALL automatically attempt to refresh it using the long-lived token refresh flow; IF all 3 refresh attempts (spaced 1 hour apart) fail, THE System SHALL surface a reconnect notification on the Social Accounts page.
11. IF a Facebook Page access token has expired or been invalidated by Meta, THEN THE System SHALL mark the SocialAccount status as `REQUIRES_RECONNECT`, surface a reconnect prompt in the Social Accounts page and in the Dashboard and Analytics sections, and cease all polling for that account until reconnected.
12. WHERE an Instagram Business account is linked to the same Meta Business as a connected Facebook Page, THE Social Accounts page SHALL display a labeled indicator showing the shared Meta Business name linking both account cards.

---

### Requirement 3: Database Schema and Social Account Model Extension

**User Story:** As a developer, I want the SocialAccount database model to support multiple platforms without duplication, so that future platforms can be added through schema extension rather than new collection creation.

#### Acceptance Criteria

1. THE System SHALL extend the existing SocialAccount model with a `platform` discriminator field accepting values `instagram`, `facebook`, and all future platforms (`linkedin`, `youtube`, `tiktok`, `pinterest`, `x`, `threads`) without requiring schema migrations for each new platform.
2. THE SocialAccount model SHALL contain a `platformMetadata` sub-document for typed, platform-specific fields (e.g., Facebook Page category, Instagram account type) so that no platform-specific field appears at the top level of the shared SocialAccount schema.
3. WHEN a Facebook Page SocialAccount is saved, THE System SHALL persist: `platform: "facebook"`, `accountId` (Page ID), `pageName`, `profilePictureUrl`, `pageCategory`, `accessToken` (Page Access Token), `tokenExpiresAt`, `permissions[]`, `workspaceId`, `connectedAt`, `lastSyncAt`, `connectionStatus` (one of: `ACTIVE`, `DISCONNECTED`, `REQUIRES_RECONNECT`, `SYNCING`), and `platformMetadata`.
4. THE System SHALL enforce that each combination of `workspaceId + platform + accountId` is unique at the database level; IF a duplicate insert is attempted, THEN THE System SHALL return a conflict error and SHALL NOT create a second record.
5. WHEN querying SocialAccounts for a workspace, THE System SHALL return accounts for all platforms together; callers SHALL filter by `platform` using a query parameter rather than the system applying a default platform filter.

---

### Requirement 4: Social Accounts Page — Multi-Platform Display

**User Story:** As a user, I want to see all my connected social accounts — Instagram and Facebook — on a single Social Accounts page, with each account card showing platform-specific connection health and controls.

#### Acceptance Criteria

1. THE Social Accounts page SHALL render a card for each connected SocialAccount, regardless of platform, ordered by `connectedAt` descending, using the existing card component design.
2. EACH account card SHALL display: the platform's official logo, profile picture (or a platform-colored placeholder if unavailable), account/page name, `platform` label, connection status badge, follower/fan count (or "Unavailable" if the count cannot be fetched), connection health indicator (one of: Healthy, Warning, Error), last sync timestamp, and action buttons (Reconnect, Disconnect, Refresh, Settings).
3. THE Social Accounts page SHALL display an "Add Account" section with connection buttons for each platform whose `auth.oauthSupported` capability is `true` in the Platform_Registry.
4. WHEN an Instagram Business account and a Facebook Page share the same Meta Business relationship, THE Social Accounts page SHALL display a labeled grouping indicator showing the shared Meta Business name between both cards.
5. IF a SocialAccount has `connectionStatus = "REQUIRES_RECONNECT"`, THEN THE account card SHALL render the Reconnect button in a visually highlighted state and SHALL display a contextual error message specifying the reason (e.g., "Token expired", "Permission revoked: pages_read_engagement").
6. IF no SocialAccounts exist for the workspace, THE Social Accounts page SHALL display an empty state component with a call-to-action to connect the first account.
7. THE Social Accounts page SHALL use existing Veefore card components, typography, spacing, skeleton loaders, and dark/light theme support without introducing new design patterns.

---

### Requirement 5: Dashboard — Platform-Aware KPI Display

**User Story:** As a user, I want the dashboard to automatically reflect the platforms I have connected and let me filter metrics by platform, so that I never see combined data that mixes platform origins without clear labeling.

#### Acceptance Criteria

1. WHEN only Instagram accounts are connected, THE Dashboard SHALL display only Instagram metrics and SHALL NOT render a PlatformFilter control.
2. WHEN only Facebook Pages are connected, THE Dashboard SHALL display only Facebook metrics and SHALL NOT render a PlatformFilter control.
3. WHEN both Instagram and Facebook accounts are connected, THE Dashboard SHALL display a PlatformFilter control with options: `Instagram`, `Facebook`, `All Platforms`; the default selection SHALL be `All Platforms`.
4. WHEN `All Platforms` is selected, EACH KPI card SHALL display the total combined value followed by per-platform breakdowns each labeled with the respective platform's official icon; non-additive metrics (where the metrics registry `aggregation` field is not `sum`) SHALL be labeled "Approximate Combined" rather than showing a plain total.
5. WHEN `All Platforms` is selected and a metric has `MetricSupportLevel = NONE` for one platform, THE Dashboard SHALL display only the supporting platform's value for that metric with that platform's icon label, and SHALL NOT show a combined total row.
6. THE Dashboard SHALL consult the Platform_Registry before rendering any metric card; IF a metric has `MetricSupportLevel = NONE` for a platform, THEN that platform SHALL NOT contribute a value — not even zero — to the combined or individual display for that metric.
7. IF one connected platform's analytics request fails, THEN THE Dashboard SHALL display the available platform's data and SHALL show a non-blocking inline warning banner for the unavailable platform, without crashing or hiding other metric cards.
8. THE Dashboard SHALL use the existing analytics engine, widget library, KPI strip, and card components extended with platform-context props rather than replacing them.

---

### Requirement 6: Analytics Module — Platform-Filtered Analytics Engine

**User Story:** As a user, I want to filter all analytics — charts, cards, tables, exports, AI insights — by platform or view combined cross-platform analytics, so that I can analyze each platform's performance independently or in aggregate.

#### Acceptance Criteria

1. THE Analytics module SHALL render a PlatformFilter control only when both Instagram and Facebook accounts are connected in the active workspace, with options `Instagram`, `Facebook`, and `All Platforms`, consistent with the Dashboard PlatformFilter.
2. WHEN a PlatformFilter selection is changed, THE Analytics module SHALL begin re-fetching or re-filtering all visible charts, KPI cards, tables, audience breakdowns, content performance tables, and AI insight panels within 3 seconds; all sections SHALL display a loading state during the transition.
3. WHEN `All Platforms` is selected, the analytics engine SHALL query each platform's provider independently and merge results using NormalizedMetric keys; metrics whose `aggregation` field in the metrics registry is not `sum` SHALL be labeled "Approximate Combined" rather than presented as exact totals.
4. THE Analytics module SHALL apply the same PlatformFilter context to report generation, CSV/Excel/PDF/PowerPoint exports, and AI insight requests.
5. FOR ALL analytics metrics where `MetricSupportLevel = NONE` for the active platform, THE Analytics module SHALL display a "Not supported on [Platform]" label in the metric cell instead of a zero value or empty cell; in `All Platforms` mode, the unsupported platform's slot SHALL show "Not supported on [Platform]" while the supporting platform's value is shown normally.
6. THE Analytics module SHALL support the following time filters applied uniformly across all analytics components: Today, Yesterday, Last 7 Days, Last 30 Days, Last 90 Days, This Month, Last Month, Custom Range (maximum 366 days; no future dates selectable).
7. THE Analytics module SHALL NOT duplicate the existing Instagram analytics implementation; it SHALL extend the analytics engine's data providers to include a FacebookAnalyticsProvider following the same interface pattern (`RollupReadStore`, `AudienceProvider`, `ContentProvider`) as the existing Instagram analytics provider.
8. WHEN a Facebook analytics request results in a partial failure (some metrics succeed, others fail), THE Analytics module SHALL display successfully fetched metrics and SHALL show a per-metric "Data unavailable" label with a reason tooltip for each failed metric.

---

### Requirement 7: Facebook Analytics Provider and Metric Normalization

**User Story:** As a developer, I want a FacebookAnalyticsProvider that maps raw Facebook Graph API metrics to Veefore's normalized metric schema, so that the analytics engine and dashboard remain platform-agnostic.

#### Acceptance Criteria

1. THE FacebookProvider SHALL implement the `RollupReadStore`, `AudienceProvider`, and `ContentProvider` interfaces defined in `server/features/analytics/api/ports.ts`, ensuring the analytics engine can call both providers interchangeably.
2. THE FacebookProvider SHALL map Facebook Page Insights API metrics to NormalizedMetric keys in the existing metrics registry (`followers_total`, `reach_total`, `impressions_total`, `total_engagements`, `likes`, `comments`, `shares`, `video_views`, `profile_visits`, `website_clicks`, `published_posts`); IF a metric cannot be fetched from the API, THE FacebookProvider SHALL omit that key from the result object rather than setting it to zero.
3. IF a Facebook API metric has no mapping to any key in criterion 2 and is not a `DERIVED` metric computable from those keys, THEN THE FacebookProvider SHALL add a platform-specific metric key prefixed with `facebook_` (e.g., `facebook_reactions`, `facebook_page_views`) and declare it in the Platform_Registry as `MetricSupportLevel = FULL` for `facebook` and `NONE` for `instagram`.
4. THE FacebookProvider SHALL fetch de-duplicated reach using the `page_impressions_unique` metric with a `days_28` period from the Facebook Page Insights API, analogous to the Instagram provider's `fetchReachTotal`.
5. IF the Facebook Graph API returns a metric that Veefore marks as `DERIVED` in the Platform_Registry and one or more of its input metrics are missing, THEN THE FacebookProvider SHALL omit the derived metric from the result rather than computing a partial formula.
6. THE FacebookProvider SHALL route all Facebook API calls through the GovernedHttpClient, extracting the Facebook Page ID from the URL path as the account identifier for rate limit tracking, using the same pattern as InstagramApiService.
7. THE FacebookProvider SHALL preserve the raw API response in-memory for the lifetime of the current request only for debugging purposes; it SHALL NOT store raw responses in the database or include them in client-facing API responses.

---

### Requirement 8: AI Insights — Platform-Aware Recommendations

**User Story:** As a user, I want AI-generated insights to understand which platform I am analyzing and generate platform-specific recommendations, so that Instagram advice is never applied to Facebook and vice versa.

#### Acceptance Criteria

1. WHEN generating AI insights, THE AI Engine SHALL receive the active PlatformFilter context (`instagram`, `facebook`, or `all`) as part of the insight generation request.
2. WHEN `instagram` is the active platform context, THE AI Engine SHALL generate Instagram-specific recommendations using only Instagram metrics; any recommendation referencing a content format or capability with `MetricSupportLevel = NONE` for Instagram SHALL be omitted from the response.
3. WHEN `facebook` is the active platform context, THE AI Engine SHALL generate Facebook-specific recommendations using only Facebook metrics; any recommendation referencing a content format or capability with `MetricSupportLevel = NONE` for Facebook SHALL be omitted from the response.
4. WHEN `all` is the active platform context AND both platforms have data available, THE AI Engine SHALL produce a response containing a dedicated per-platform insight block for each platform (each block labeled with the platform name) followed by a combined strategic recommendations section that explicitly names both platforms.
5. BEFORE generating any recommendation, THE AI Engine SHALL consult the Platform_Registry; IF the referenced capability has `MetricSupportLevel = NONE` for the target platform, THEN THE AI Engine SHALL omit that recommendation rather than including it with a caveat.
6. THE AI Engine extension SHALL use the existing AI service architecture (AIServiceManager, provider pattern) and SHALL NOT rebuild or replace existing Instagram AI insight generation.
7. WHEN `all` is the active platform context and one platform's insight generation fails, THE AI Engine SHALL return the successful platform's insight block plus a clearly labeled unavailability notice for the failed platform, rather than failing the entire request.

---

### Requirement 9: Reports and Exports — Multi-Platform Report Engine

**User Story:** As a user, I want PDF, Excel, CSV, and PowerPoint exports to correctly represent per-platform data, combined metrics where valid, and gracefully omit sections where metrics are unsupported.

#### Acceptance Criteria

1. THE Report Engine SHALL consult the Platform_Registry before including any metric section in a generated report; sections for metrics with `MetricSupportLevel = NONE` for the active platform SHALL be omitted rather than included with empty or zero values.
2. WHEN generating a multi-platform report (`All Platforms`), THE Report Engine SHALL include: a combined executive summary, and per-platform metric sections each labeled with the platform's official logo.
3. WHEN generating a multi-platform report, THE Report Engine SHALL include comparison charts for all metrics where both platforms have `MetricSupportLevel` of `FULL` or `PARTIAL`, and an AI summary containing a dedicated paragraph per platform covering its own metrics plus a cross-platform section; a report is invalid if any connected platform is absent from the AI summary.
4. THE Report Engine SHALL place platform logos adjacent to every metric section header in PDF and PowerPoint exports, and SHALL use a platform-name-prefixed column header or sheet tab label in Excel and CSV exports so recipients can unambiguously identify data origins.
5. IF a platform's analytics data is entirely unavailable at report generation time, THEN THE Report Engine SHALL include a section labeled "[Platform Name] — Data unavailable as of [generation timestamp]" rather than omitting the platform.
6. THE Report Engine extension SHALL use the existing report generation architecture and SHALL NOT create a separate report pipeline for Facebook.
7. WHEN a specific metric's data is unavailable (partial failure) within an otherwise available platform, THE Report Engine SHALL display the available metrics normally and SHALL show a per-metric "Data unavailable" indicator for the failed metric, rather than omitting the platform's entire section.

---

### Requirement 10: Scheduler — Multi-Platform Publishing

**User Story:** As a user, I want to schedule posts to Instagram, Facebook, or both simultaneously from the same scheduling interface, with the ability to set platform-specific captions, media, and publish times.

#### Acceptance Criteria

1. THE Scheduler SHALL allow the user to select one or more target platforms (`Instagram`, `Facebook`, or both) for each ContentPublishRequest.
2. WHEN both platforms are selected for a post, THE Scheduler SHALL allow the user to specify independent captions (Instagram: up to 2,200 characters; Facebook: up to 63,206 characters), media selections, and scheduled times for each platform; the scheduled time for each platform SHALL be rejected if it is in the past at the time of submission.
3. THE Scheduler SHALL consult the Platform_Registry's `publishing` capability set to determine which post types (text, image, video, carousel, reel, story, link) are supported on each selected platform, and SHALL disable or hide post type options that are unsupported for a given platform.
4. WHEN a ContentPublishRequest is submitted, THE Scheduler SHALL create independent publish jobs for each selected platform; a failure or rejection of one platform's job SHALL NOT cancel or block the other platform's job.
5. THE Scheduler extension SHALL use the existing scheduling infrastructure (TieredJobScheduler, queue system) and SHALL NOT create a parallel scheduling pipeline for Facebook.
6. WHEN a Facebook Page's `connectionStatus` is `REQUIRES_RECONNECT` or `DISCONNECTED`, THE Scheduler SHALL reject new publish jobs for that account immediately with an error message stating the reason and SHALL NOT enqueue or attempt any Facebook API call.

---

### Requirement 11: Content Studio — Platform-Aware AI Content Generation

**User Story:** As a user, I want AI content generation in Content Studio to understand which platform(s) I am creating content for and adapt the tone, format, and hashtag strategy accordingly.

#### Acceptance Criteria

1. WHEN a user opens Content Studio, THE System SHALL display platform selection controls allowing the user to specify whether content is for `Instagram`, `Facebook`, or `Both`.
2. WHEN `Facebook` or `Both` is selected, THE Content Studio AI SHALL generate captions up to 500 characters with no more than 3 hashtags, reflecting Facebook's preferred conversational tone and link-post format; it SHALL NOT default to Instagram-style captions (under 150 characters, 10+ hashtags).
3. WHEN `Both` is selected, THE Content Studio AI SHALL generate a shared creative brief (topic, angle, and call-to-action) visible to the user, plus two distinct caption variants — one for Instagram (up to 2,200 characters, optimized for hashtag discoverability) and one for Facebook (up to 500 characters, conversational tone, minimal hashtags).
4. THE Content Studio extension SHALL use the existing AI content generation service and SHALL NOT create a separate content generation pipeline for Facebook.
5. IF AI content generation fails for one platform when `Both` is selected, THE Content Studio SHALL return the successful platform's caption and SHALL display an inline error for the failed platform's caption, allowing the user to retry that platform independently.

---

### Requirement 12: Error Handling and Resilience

**User Story:** As a user, I want the application to remain fully functional even when a connected platform is experiencing an outage, rate limit, or permission error, so that I can continue working with the platforms that are available.

#### Acceptance Criteria

1. WHEN a Facebook API call returns a rate limit error, THE FacebookProvider SHALL back off using the existing GovernedHttpClient retry strategy; IF all retries are exhausted, THE FacebookProvider SHALL return a structured error to the caller and THE UI SHALL display a non-blocking "Facebook data temporarily unavailable" banner.
2. WHEN a Facebook API call returns an expired token error (error code 190), THE System SHALL immediately mark the affected SocialAccount as `REQUIRES_RECONNECT`, stop all polling for that account within one polling cycle, and surface a reconnect notification on the Social Accounts page.
3. WHEN a Facebook API call returns a permissions error (error code 10, 200, or 803), THE System SHALL log the specific missing permission, consult the Platform_Registry to identify which features require that permission, and mark only those features as unavailable in the UI; all unrelated features SHALL remain fully functional.
4. IF the Facebook analytics provider fails during a combined `All Platforms` dashboard load, THEN THE Dashboard SHALL display available Instagram data normally and SHALL show a non-blocking inline banner reading "Facebook data temporarily unavailable" without hiding, collapsing, or replacing any Instagram metric card.
5. IF the Instagram provider fails during a combined `All Platforms` dashboard load, THEN THE Dashboard SHALL display available Facebook data normally and SHALL show a non-blocking inline banner reading "Instagram data temporarily unavailable" without hiding, collapsing, or replacing any Facebook metric card.
6. THE System SHALL NEVER display fabricated, estimated, or carried-forward metric values when real data is unavailable; it SHALL display an explicit "Data unavailable" indicator in place of the metric value.

---

### Requirement 13: Backend Provider Architecture

**User Story:** As a developer, I want the backend to use a modular provider interface for all platform-specific logic, so that each provider can be developed, tested, and maintained in isolation.

#### Acceptance Criteria

1. THE System SHALL define a `SocialPlatformProvider` interface that both InstagramProvider and FacebookProvider implement, declaring the minimum contract for: OAuth token exchange, token refresh, profile fetch, analytics fetch (returning NormalizedMetric objects), and content publish.
2. THE FacebookProvider SHALL implement `SocialPlatformProvider` and encapsulate ALL Facebook Graph API calls; no route, controller, or middleware outside the FacebookProvider module SHALL call the Facebook Graph API directly.
3. THE InstagramProvider SHALL implement `SocialPlatformProvider` as a refactored wrapper around the existing Instagram service, preserving identical method signatures and return types so that no existing caller requires modification.
4. THE System SHALL use a provider factory that accepts a `platform` string and returns the correct `SocialPlatformProvider` implementation; no route, controller, or middleware (in `server/routes`, `server/controllers`, `server/middleware`) SHALL contain a direct `platform === "instagram"` or `platform === "facebook"` comparison.
5. IF the provider factory receives an unrecognized `platform` string, THEN it SHALL throw a typed `UnsupportedPlatformError` with the unrecognized platform value, rather than returning `null` or `undefined`.
6. WHERE a shared service (caching, rate limiting, error normalization, webhook processing) applies to multiple platforms, THAT service SHALL be instantiated once and injected as a dependency into both providers rather than duplicated per provider.

---

### Requirement 14: Performance — No Duplicate API Calls

**User Story:** As a developer and user, I want the system to avoid making redundant API calls when loading multi-platform data, so that both API rate limits and page load times remain within acceptable bounds.

#### Acceptance Criteria

1. WHEN a dashboard or analytics page loads for a workspace with multiple connected accounts, THE System SHALL deduplicate API calls such that no more than one call is made per account within a 2-second window for the same inbound HTTP request lifecycle.
2. THE System SHALL cache Facebook API responses using per-account cache keys in the format `fb:{accountId}:{metricGroup}:{dateRange}` with a TTL of 60 seconds for dashboard responses and 300 seconds for raw API responses, consistent with the existing Instagram caching strategy.
3. WHEN the PlatformFilter is changed on the dashboard or analytics page, THE System SHALL serve data from cache for any response whose cache key TTL has not expired before making a new API call.
4. THE System SHALL defer the initial load of audience demographics and content performance table sections until they are scrolled into the viewport, consistent with the existing lazy-loading pattern for heavy analytics sections.
5. IF a lazy-loaded section fails to load after entering the viewport, THE System SHALL display an inline error with a manual retry button rather than leaving the section in an indefinite loading state.

---

### Requirement 15: Future Platform Scalability

**User Story:** As a developer, I want the architecture to make adding future platforms (LinkedIn, YouTube, TikTok, Pinterest, X, Threads) a straightforward, low-risk change, so that new platforms require minimal modifications to existing code.

#### Acceptance Criteria

1. WHEN a new platform is added, THE analytics engine core (`server/features/analytics/`), dashboard widget library (`client/src/features/analytics/widgets/`), scheduler queue (`server/services/TieredJobScheduler.ts`), report engine template, and AI insight generator structure SHALL require no changes; only a new provider file, a factory registration entry, and a Platform_Registry capability declaration SHALL be needed.
2. THE Platform_Registry format SHALL explicitly accommodate all planned future platforms (`linkedin`, `youtube`, `tiktok`, `pinterest`, `x`, `threads`) as valid `platform` values from initial implementation, even if their capability sets are initially declared as `NONE` for all capabilities.
3. THE System SHALL derive the list of supported platforms dynamically from the Platform_Registry's registered platform keys; platform icon and logo assets are exempt from this rule provided they are keyed by platform identifier rather than embedded in conditional logic.
4. WHEN a new platform is added, THE System SHALL require changes to no more than three files outside the new provider module: the provider factory registration file, the Platform_Registry definition file, and the platform asset map file.
