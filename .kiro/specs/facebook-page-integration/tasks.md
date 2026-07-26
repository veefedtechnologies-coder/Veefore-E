# Implementation Plan: Facebook Page Integration

## Overview

This plan implements Facebook Page support across every layer of the Veefore stack — from the shared Platform Capability Registry through OAuth, analytics, scheduler, AI engine, reports, and frontend — without touching any existing Instagram code paths. Tasks are ordered by strict dependency: the registry (Phase 0) must ship first as everything else consumes it; the database foundation (Phase 1) must be ready before any OAuth or analytics code; each subsequent phase builds on the previous. PBT sub-tasks are placed immediately after the code they verify.

---

## Tasks

- [x] 1. Platform Capability Registry (Phase 0)
  - [x] 1.1 Create `src/shared/platform-registry/types.ts`
    - Define `PlatformId`, `MetricSupportLevel`, `AuthCapabilities`, `PublishingCapabilities`, `AnalyticsCapabilities`, `AICapabilities`, `InboxCapabilities`, `ReportCapabilities`, `SchedulerCapabilities`, `PlatformCapabilities`, `PlatformRegistry` TypeScript interfaces exactly as specified in the design
    - No runtime code in this file — types only
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Create `src/shared/platform-registry/index.ts`
    - Implement `_registry` object with full capability declarations for `instagram` and `facebook` (all seven capability categories per the design)
    - Pre-declare `linkedin`, `youtube`, `tiktok`, `pinterest`, `x`, `threads` with all-`false`/empty capabilities so future additions require zero schema migrations
    - Implement `deepFreeze()` utility and wrap registry with it to produce `PLATFORM_REGISTRY: PlatformRegistry`
    - Implement `CapabilityGuard` with `getMetricSupport()`, `supportsPublishing()`, `supportsAuth()`, `getRegisteredPlatforms()`, `getConnectablePlatforms()` — return `'NONE'`/`false` + `console.warn` for unknown platforms (never throw)
    - Export must be importable in both Node.js and React/TypeScript bundles (no Node-only APIs)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.3 Write property test for CapabilityGuard immutability (Property 1)
    - **Property 1: CapabilityGuard Immutability**
    - For any platform + any attempt to mutate the registry after initialization, `getMetricSupport()` returns the original declared value unchanged
    - Invariant: `mutate(registry); result = getMetricSupport(p, k)` must equal the pre-mutation value for all `p`, `k`
    - Use `fast-check`: `fc.property(fc.constantFrom('instagram','facebook'), fc.string(), ...)`
    - **Validates: Requirements 1.7**

- [x] 2. Database Foundation and Provider Interfaces (Phase 1)
  - [x] 2.1 Extend `server/models/SocialAccount/SocialAccount.ts`
    - Add `platform` field (enum: instagram, facebook, linkedin, youtube, tiktok, pinterest, x, threads; default `'instagram'` for backward compat)
    - Add `pageName`, `pageCategory`, `tokenExpiresAt`, `permissions[]`, `connectedAt`, `lastSyncAt`, `connectionStatus` (enum: ACTIVE, DISCONNECTED, REQUIRES_RECONNECT, SYNCING; default ACTIVE), `platformMetadata` (Mixed, default `{}`)
    - Add compound unique index `{ workspaceId: 1, platform: 1, accountId: 1 }` with `unique: true`
    - Export `ConnectionStatus`, `FacebookPlatformMetadata`, `InstagramPlatformMetadata` TypeScript types
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Create `server/migrations/social-account-platform-field.ts`
    - Write an idempotent migration script that sets `platform: "instagram"` and `connectionStatus: "ACTIVE"` on all existing `SocialAccount` documents that lack these fields
    - Script must be safe to re-run (uses `$set` + `$exists: false` filter)
    - Add the compound unique index AFTER the backfill completes
    - _Requirements: 3.1_

  - [x] 2.3 Create `server/features/social/providers/types.ts`
    - Define `OAuthInitResult`, `OAuthCallbackResult`, `ManagedPage`, `ProfileResult`, `NormalizedMetricResult`, `PublishResult` interfaces
    - Define `SocialPlatformProvider` interface with methods: `initiateOAuth`, `handleOAuthCallback`, `getManagedPages`, `refreshToken`, `revokeToken`, `getProfile`, `getAnalytics`, `publish`
    - _Requirements: 13.1_

  - [x] 2.4 Create `server/features/social/providers/factory.ts`
    - Implement `UnsupportedPlatformError` class extending `Error` with a `platform` field
    - Implement `getProvider(platform: string): SocialPlatformProvider` factory using singleton map
    - Wire `instagram` → `InstagramProvider` and `facebook` → `FacebookProvider` (lazily imported)
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 2.5 Create `server/features/instagram/providers/InstagramProvider.ts`
    - Implement `SocialPlatformProvider` as a thin wrapper around the existing `InstagramService`
    - Delegate all methods to existing `InstagramService` — zero behavior change
    - `getManagedPages()` returns `[]` (Instagram has no page-selection concept)
    - _Requirements: 13.1, 13.4_

- [x] 3. Facebook OAuth and Page Connection (Phase 2)
  - [x] 3.1 Create `server/features/facebook/providers/FacebookProvider.ts`
    - Implement full `SocialPlatformProvider` interface for Facebook
    - `initiateOAuth`: build Facebook dialog URL with required scopes (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`)
    - `handleOAuthCallback`: short-lived token exchange → long-lived token exchange (60-day expiry); throw on any failure step
    - `getManagedPages`: call `/me/accounts?fields=id,name,picture,category,access_token,instagram_business_account&limit=100`; return `ManagedPage[]`
    - `refreshToken`: `fb_exchange_token` grant flow
    - `revokeToken`: DELETE `/me/permissions`; swallow errors (local disconnect still happens)
    - `getProfile`: fetch `id,name,picture,fan_count,category` from Graph API
    - `getAnalytics`: call `fetchPageInsights` + `fetchPostInsights` in parallel via `Promise.allSettled`; map raw fields to normalized metric keys per section 7 of design; omit keys where raw value is null (never set to 0); preserve `rawResponse` in-memory only
    - Route all Graph API calls through `GovernedHttpClient`, extracting Page ID from URL path as `accountId`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 7.1, 7.2, 7.4, 7.6, 7.7_

  - [x] 3.2 Create `server/features/facebook/providers/error-mapper.ts`
    - Implement `mapFacebookApiError(err: unknown): FacebookApiError`
    - Map code 190 → `REQUIRES_RECONNECT`; codes 10/200/803 → `PERMISSION_DENIED`; code 80002/429 → `RATE_LIMITED`; other → `UNKNOWN`
    - Extract `missingPermission` and `retryAfter` from error payload
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 3.3 Create `server/features/facebook/oauth/FacebookOAuthService.ts`
    - Implement page-selection session management: create, read, and expire short-lived session tokens
    - Session stores the `workspaceId`, `ManagedPage[]`, and `OAuthCallbackResult` from the OAuth callback step
    - _Requirements: 2.4, 2.5_

  - [x] 3.4 Create `server/routes/facebook.routes.ts`
    - `GET /api/facebook/auth` (requires auth): return `{ authUrl }` from `FacebookProvider.initiateOAuth`
    - `GET /api/facebook/callback`: exchange code, retrieve pages, create page-selection session, redirect to `/connect/facebook/pages?token=...`; on error redirect to `/connect/facebook/error?reason=...`; never create a `SocialAccount` record here
    - `POST /api/facebook/pages/connect` (requires auth, validated body): for each selected page ID, exchange for long-lived Page Access Token, upsert `SocialAccount` record (platform: "facebook") with full metadata; return `{ connected: [{ pageId, pageName }] }`; enforce compound unique index on conflict (return 409)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.3, 3.4_

  - [x] 3.5 Create `server/jobs/facebook-token-refresh.job.ts`
    - Query `socialAccountRepository.findExpiringFacebook(7)` (accounts within 7 days of expiry)
    - For each: attempt `FacebookProvider.refreshToken`; on success update token in DB; on failure increment failure counter; after 3 consecutive failures mark `connectionStatus = 'REQUIRES_RECONNECT'` and surface notification
    - Space retry attempts 1 hour apart using existing BullMQ repeatable job infrastructure; run check every 6 hours
    - _Requirements: 2.10, 2.11_

- [x] 4. Facebook Analytics Provider and Metric Normalization (Phase 3)
  - [x] 4.1 Add Facebook metric IDs to `server/features/analytics/metrics/metric-ids.ts`
    - Add `FACEBOOK_REACTIONS` and `FACEBOOK_PAGE_VIEWS` to `METRIC_IDS` const, continuing the `MTR-0000XX` sequence (next available IDs after the last existing entry)
    - Add to the `MetricId` union type
    - _Requirements: 7.3_

  - [x] 4.2 Add Facebook metric definitions to `server/features/analytics/metrics/registry.ts`
    - Add `facebook_reactions` definition: id `METRIC_IDS.FACEBOOK_REACTIONS`, category `'engagement'`, aggregation `'sum'`, `dataQuality: 'verified'`, `platforms: 'facebook'`
    - Add `facebook_page_views` definition: id `METRIC_IDS.FACEBOOK_PAGE_VIEWS`, category `'engagement'`, aggregation `'sum'`, `dataQuality: 'verified'`, `platforms: 'facebook'`
    - _Requirements: 7.3_

  - [x] 4.3 Create `server/features/facebook/analytics/FacebookRollupReadStore.ts`
    - Implement `RollupReadStore`, `AudienceProvider`, and `ContentProvider` interfaces from `server/features/analytics/api/ports.ts`
    - `getRollups`: query active Facebook `SocialAccount` records for workspace; call `FacebookProvider.getAnalytics` for each; use `Promise.allSettled` so one account failure does not block others; return `MetricRollup[]`
    - `getAudienceByCountry`: fetch `page_fans_country` with `period: lifetime`; return sorted `DistributionSlice[]`
    - `getTopContent`: fetch page posts with engagement fields; return `TopItem[]`
    - If no Facebook accounts exist for workspace, return `[]` without error
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

  - [x] 4.4 Write property test for metric normalization idempotency (Property 2)
    - **Property 2: Metric Normalization Idempotency**
    - For any raw Facebook API response object, applying the metric normalization mapping twice produces the same result as applying it once
    - Invariant: `normalize(normalize(raw)) === normalize(raw)` for all valid raw response shapes
    - Use `fast-check` with `arbitraryFacebookInsightsResponse()` generator covering all permutations of present/absent keys
    - **Validates: Requirements 7.2, 7.3**

  - [x] 4.5 Write property test for no-fake-data invariant (Property 5)
    - **Property 5: No-Fake-Data Invariant**
    - For any metric key where `CapabilityGuard.getMetricSupport(platform, key) === 'NONE'`, the normalized metric result object never contains that key, not even as `0` or `null`
    - Invariant: `supportLevel === 'NONE'` implies `!(key in normalizedResult.metrics)`
    - Test both `saves` on Facebook and `facebook_reactions`/`facebook_page_views` on Instagram
    - **Validates: Requirements 5.6, 6.5, 12.6**

  - [x] 4.6 Create `server/features/analytics/bridge/MultiPlatformRollupStore.ts`
    - Implement `RollupReadStore`, `SeriesReadStore`, `AudienceProvider`, `ContentProvider`
    - `getRollups`: filter active stores by `query.platforms` (default: all); call each store's `getRollups` via `Promise.allSettled`; flatten and return all fulfilled results — never throw if one store fails
    - Delegate `getDailySeries` to `LegacyRollupReadStore` (Instagram only for now); extend when Facebook daily series is available
    - Delegate `getAudienceByCountry` and `getTopContent` similarly via `Promise.allSettled`
    - _Requirements: 5.7, 6.3, 6.7, 12.4, 12.5_

  - [x] 4.7 Wire `MultiPlatformRollupStore` into `DashboardService` in `server/features/analytics/api/dashboard.service.ts`
    - Replace the default `EmptyRollupReadStore` with a `MultiPlatformRollupStore` instance at the module level
    - Ensure `query.platforms` is passed through from the request into `RollupReadQuery`
    - Add `partialData: true` + warning banner to response when one store returns `[]` but the other returns data
    - _Requirements: 5.3, 5.7, 6.3_

- [x] 5. Checkpoint — Backend foundation complete
  - Ensure all tests pass for Phases 0–3. Verify: registry immutability property passes; FacebookProvider unit tests with mocked `GovernedHttpClient` pass; migration script runs idempotently; `MultiPlatformRollupStore` returns merged results when both stores have data. Ask the user if any questions arise.

- [x] 6. Social Accounts Page — Multi-Platform UI (Phase 4)
  - [x] 6.1 Extend existing Social Accounts API route
    - Modify the GET `/api/social-accounts` endpoint to return accounts for ALL platforms (not just Instagram)
    - Callers filter by `?platform=` query param; no default platform filter is applied server-side
    - Include `connectionStatus`, `tokenExpiresAt`, `platformMetadata`, `platform` in the response shape
    - _Requirements: 3.5, 4.1_

  - [x] 6.2 Create `client/src/features/social-accounts/components/FacebookAccountCard.tsx`
    - Render: Facebook platform logo, profile picture (or platform-colored placeholder), page name, `platform: "Facebook"` label, `connectionStatus` badge, fan count (`platformMetadata.pageFanCount`; or "Unavailable"), connection health indicator, last sync timestamp, action buttons (Reconnect, Disconnect, Refresh, Settings)
    - When `connectionStatus === 'REQUIRES_RECONNECT'`: highlight Reconnect button, display contextual error message specifying reason (token expired / permission revoked)
    - Reuse existing Veefore card components, typography, spacing, skeleton loaders, dark/light theme support — no new design patterns
    - _Requirements: 4.1, 4.2, 4.5, 4.7_

  - [x] 6.3 Create `client/src/features/social-accounts/components/MetaBusinessIndicator.tsx`
    - Detect shared Meta Business relationship: when an Instagram `SocialAccount` and a Facebook `SocialAccount` in the same workspace share the same `platformMetadata.metaBusinessId`, render a labeled grouping indicator badge between their cards
    - Display the shared Meta Business name
    - _Requirements: 2.12, 4.4_

  - [x] 6.4 Create empty state component and wire "Add Account" section
    - If no `SocialAccount` records exist for the workspace, render empty state with CTA to connect first account
    - "Add Account" section: call `CapabilityGuard.getConnectablePlatforms()` to enumerate platforms with `auth.oauthSupported === true`; render a connection button per platform — never hardcode platform list
    - _Requirements: 4.3, 4.6_

- [x] 7. Dashboard Platform Filter (Phase 5)
  - [x] 7.1 Create `client/src/features/analytics/context/PlatformFilterContext.tsx`
    - Define `PlatformSelection = 'instagram' | 'facebook' | 'all'`
    - `PlatformFilterProvider`: query connected `SocialAccount` platforms via existing API; set `showFilter = connectedPlatforms.includes('instagram') && connectedPlatforms.includes('facebook')`; default selection `'all'`
    - Export `usePlatformFilter()` hook consuming the context
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 7.2 Add `PlatformContribution` and `KpiPlatformProps` to `client/src/features/analytics/widgets/types.ts`
    - `PlatformContribution`: `{ platform: PlatformId, value: number | null, supportLevel: MetricSupportLevel }`
    - `KpiPlatformProps`: `{ platformBreakdown?: PlatformContribution[], isApproximateCombined?: boolean }`
    - Import `PlatformId` and `MetricSupportLevel` from `src/shared/platform-registry/types`
    - _Requirements: 5.4, 5.5_

  - [x] 7.3 Extend existing KPI card component with platform breakdown rendering
    - Accept optional `platformBreakdown` prop and `isApproximateCombined` prop
    - When `platformBreakdown` is present and `platformSelection === 'all'`: render sub-rows below the total, each labeled with the platform's official icon and value
    - When `isApproximateCombined === true`: label combined total as "Approximate Combined" instead of raw sum
    - When `MetricSupportLevel === 'NONE'` for a platform: skip that platform's row entirely — no zero, no empty cell
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 7.4 Extend `OverviewDashboard.tsx` with platform context and warning banner
    - Wrap dashboard tree with `PlatformFilterProvider`
    - Render `PlatformFilter` control (platform chips: Instagram / Facebook / All Platforms) only when `showFilter === true`
    - Pass `platformBreakdown` to each KPI card using `CapabilityGuard.getMetricSupport` to gate platform slots
    - Render non-blocking inline warning banner when `DashboardResponse.warnings` includes a platform-unavailable message — never hide or replace existing KPI cards
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

  - [x] 7.5 Write property test for platform filter propagation (Property 4)
    - **Property 4: Platform Filter Propagation**
    - For any `PlatformSelection` value, the analytics API query constructed from that selection always contains a `platforms` parameter that matches the selection
    - Invariant: `selection === 'all'` implies `query.platforms` is undefined or contains all connected platforms; otherwise `query.platforms` contains exactly the selected platform
    - Use `fast-check`: `fc.property(fc.constantFrom('instagram','facebook','all'), ...)`
    - **Validates: Requirements 6.1, 6.4**

- [x] 8. Analytics Module Extension (Phase 6)
  - [x] 8.1 Add `PlatformFilter` control to analytics page header
    - Insert `PlatformFilter` control immediately after the time-range filter in the existing analytics page header
    - Render only when `PlatformFilterContext.showFilter === true`
    - Selections: `Instagram`, `Facebook`, `All Platforms` — consistent with Dashboard
    - When selection changes, all visible analytics components must enter loading state within 3 seconds
    - _Requirements: 6.1, 6.2_

  - [x] 8.2 Wire `platforms` query param through analytics API routes
    - Thread `PlatformFilterContext.selection` as `?platforms=` query param on all analytics data-fetching hooks
    - `MultiPlatformRollupStore` already filters by `query.platforms` — no additional backend change needed
    - Apply same `platforms` param to report generation requests, CSV/Excel/PDF/PowerPoint export endpoints, and AI insight requests
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 8.3 Implement "Not supported on [Platform]" labels for `NONE`-support metrics
    - In all analytics metric cells: before rendering a value, call `CapabilityGuard.getMetricSupport(activePlatform, metricKey)`
    - When support is `NONE`: display "Not supported on [Platform]" label — never render zero or empty cell
    - In `All Platforms` mode: show "Not supported on [Platform]" in the unsupported platform's slot; show the supporting platform's value normally
    - _Requirements: 6.5_

  - [x] 8.4 Implement per-metric unavailability indicator for partial failures
    - When a Facebook analytics request partially fails (some metrics succeed, others fail): display successfully fetched metrics normally
    - For each failed metric key: display "Data unavailable" label with a reason tooltip
    - This applies to the analytics module and the report engine; never hide the entire platform section for a single metric failure
    - _Requirements: 6.8_

- [x] 9. AI Engine Extension (Phase 7)
  - [x] 9.1 Add `platformContext` field to `PromptConstructionParams` in `server/services/PromptConstructorService.ts`
    - Extend interface with `platformContext?: 'instagram' | 'facebook' | 'all'` and `availableCapabilities?: string[]`
    - In `buildInsightPrompt()`: inject platform-specific system prompt prefix based on `platformContext`
      - `'facebook'`: restrict recommendations to Facebook content formats; exclude Instagram-specific features
      - `'instagram'`: restrict to Instagram-specific content formats
      - `'all'`: structure response as (1) Instagram section, (2) Facebook section, (3) cross-platform recommendations
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.2 Pass `platformContext` through `AIServiceManager`
    - Extend `AIServiceManager.generateText()` and `generateTextStream()` to accept and forward `platformContext` to `PromptConstructorService`
    - Before including any recommendation, check `CapabilityGuard.getMetricSupport(platform, capabilityKey) !== 'NONE'`; omit the recommendation if capability is not supported (never include with a caveat)
    - When `platformContext === 'all'` and one platform's generation fails: return the successful platform's block + a labeled unavailability notice for the failed platform
    - _Requirements: 8.5, 8.6, 8.7_

- [x] 10. Scheduler Extension (Phase 8)
  - [x] 10.1 Add `MultiPlatformPublishRequest` type to `server/services/TieredJobScheduler.ts`
    - Define `PlatformPublishSpec`: `{ platform: PlatformId, caption: string, mediaUrls?: string[], scheduledAt?: Date }`
    - Define `MultiPlatformPublishRequest`: `{ workspaceId: string, platforms: PlatformPublishSpec[], sharedMediaUrls?: string[] }`
    - Define per-platform job result type: `{ platform: PlatformId, status: 'created' | 'rejected', jobId?: string, reason?: string }`
    - _Requirements: 10.1, 10.2_

  - [x] 10.2 Implement per-platform independent job creation in `TieredJobScheduler`
    - Add `createPlatformJobs(req: MultiPlatformPublishRequest): Promise<PlatformJobResult[]>` method
    - For each platform spec: (1) check `socialAccountRepository` for `connectionStatus === 'ACTIVE'`; if not, reject immediately with reason string; (2) check `CapabilityGuard.supportsPublishing(platform, postType)`; if not supported, reject with `UnsupportedPlatformError`; (3) validate `scheduledAt` is not in the past; (4) call `this.dispatchOrDefer(job)` for the valid platform
    - A rejection on one platform MUST NOT cancel or affect any other platform's job
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

  - [x] 10.3 Write property test for per-platform job isolation (Property 3)
    - **Property 3: Per-Platform Job Isolation**
    - For any multi-platform publish request where exactly one platform's account has `connectionStatus !== ACTIVE`, the scheduler creates a job for the valid platform and rejects only the invalid platform's job
    - Invariant: `result.valid.status === 'created' && result.invalid.status === 'rejected'` for all such requests
    - Use `fast-check` with `arbitraryMultiPlatformRequest()` generator
    - **Validates: Requirements 10.4, 10.6**

- [x] 11. Content Studio Extension (Phase 9)
  - [x] 11.1 Add platform selector UI to Content Studio
    - Render platform selection controls: `Instagram`, `Facebook`, `Both`
    - Update content generation request type with `targetPlatforms: PlatformId[]`
    - _Requirements: 11.1_

  - [x] 11.2 Implement platform-specific caption constraints in content generation service
    - Before calling `AIServiceManager`: enforce platform constraints server-side
      - Facebook / Both (Facebook slot): max 500 characters, max 3 hashtags, conversational tone directive
      - Instagram: max 2200 characters, hashtag-discovery tone directive
    - When `Both` is selected: generate a shared creative brief (topic, angle, CTA) visible to the user, then two distinct caption variants
    - Return `MultiPlatformCaptionResult`: `{ sharedBrief?: string, captions: [{ platform, caption, characterCount, hashtagCount, error? }] }`
    - _Requirements: 11.2, 11.3, 11.4_

  - [x] 11.3 Write unit tests for caption constraint enforcement
    - Test Facebook captions are truncated/rejected at >500 chars and >3 hashtags
    - Test Instagram captions are truncated/rejected at >2200 chars
    - Test partial failure: if AI generation fails for one platform when `Both` is selected, the successful platform's caption is returned + inline error for the failed platform
    - _Requirements: 11.2, 11.3, 11.5_

- [x] 12. Report Engine Extension (Phase 10)
  - [x] 12.1 Add registry-gated section inclusion to report engine
    - Implement `shouldIncludeMetricSection(metricKey: string, platforms: PlatformId[]): boolean` — returns true if at least one platform has `MetricSupportLevel !== 'NONE'` for the key
    - Wrap every existing metric section builder with this guard; omit sections where all active platforms return `NONE`
    - For omitted sections: never include empty rows, zero values, or placeholder text
    - _Requirements: 9.1, 9.6_

  - [x] 12.2 Implement multi-platform report structure
    - When `platforms` includes both Instagram and Facebook: include combined executive summary + per-platform metric sections, each labeled with the platform's official logo
    - Include comparison charts for metrics where both platforms have `FULL` or `PARTIAL` support
    - AI summary must contain a dedicated paragraph per platform + a cross-platform section; a report without both platforms' summaries is invalid
    - _Requirements: 9.2, 9.3_

  - [x] 12.3 Add platform branding to export formats
    - PDF/PowerPoint: embed platform logos adjacent to every metric section header using the existing asset map keyed by `PlatformId`
    - Excel/CSV: prefix column headers with `Instagram_` or `Facebook_`, or use platform-name sheet tab labels
    - When a platform's data is entirely unavailable at report time: include a section labeled "[Platform Name] — Data unavailable as of [generation timestamp]" rather than omitting
    - Per-metric partial failure: show available metrics normally + "Data unavailable" indicator per failed metric
    - _Requirements: 9.4, 9.5, 9.7_

- [x] 13. Error Handling and Token Expiry Notifications (Phase 11)
  - [x] 13.1 Integrate `FacebookApiError` handling in `FacebookRollupReadStore` and route handlers
    - In `FacebookRollupReadStore.getRollups()`: catch `FacebookApiError` from `FacebookProvider`; when `type === 'TOKEN_EXPIRED'` immediately call `socialAccountRepository.setConnectionStatus(accountId, 'REQUIRES_RECONNECT')` and stop polling for that account; return `[]` for that account's results
    - Propagate `requiresReconnect` flag through the partial result so `MultiPlatformRollupStore` can surface a warning
    - When `type === 'PERMISSION_DENIED'`: log missing permission + mark only affected features unavailable via `CapabilityGuard`; all unrelated features remain functional
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 13.2 Implement token expiry notification in Social Accounts page
    - When `SocialAccount.connectionStatus === 'REQUIRES_RECONNECT'` is loaded: show a persistent in-page notification on the Social Accounts page with the reason and a Reconnect CTA
    - Reconnect CTA initiates the Facebook OAuth flow from task 3.4
    - _Requirements: 2.10, 2.11, 4.5_

  - [x] 13.3 Implement in-app reconnect prompts in Dashboard and Analytics
    - When the workspace has a Facebook account with `connectionStatus === 'REQUIRES_RECONNECT'`: render a non-blocking inline reconnect prompt in both the Dashboard and Analytics pages
    - Prompt must not hide, collapse, or replace any metric card — display alongside existing content
    - Prompt disappears when the account is successfully reconnected
    - _Requirements: 2.11, 5.7_

- [x] 14. Checkpoint — Full integration complete
  - Ensure all tests pass, all PBT properties pass, migration script verified idempotent, reconnect flow tested end-to-end. Ask the user if questions arise.

- [x] 15. Integration and End-to-End Tests (Phase 12)
  - [x] 15.1 Write OAuth integration tests (mocked Meta endpoints)
    - Test full code → short-lived UAT → long-lived UAT → page list → page selection → `SocialAccount` persistence flow
    - Mock the Meta Graph API endpoints using `msw` or equivalent; assert `SocialAccount` is created with correct fields
    - Test error path: callback with `error` param redirects to `/connect/facebook/error`; no `SocialAccount` created
    - Test duplicate connection: second connect for same `workspaceId + platform + accountId` returns 409 (no duplicate record)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.3, 3.4_

  - [x] 15.2 Write dashboard resilience integration test
    - Simulate `FacebookRollupReadStore.getRollups()` throwing; verify Instagram KPI data still renders in `DashboardService.buildDashboard()` output
    - Assert response contains `warnings: ["Facebook data temporarily unavailable"]` and `partialData: true`
    - Simulate `LegacyRollupReadStore.getRollups()` throwing; verify Facebook KPI data renders + Instagram warning
    - _Requirements: 5.7, 12.4, 12.5_

  - [x] 15.3 Write scheduler isolation integration test
    - Create a `MultiPlatformPublishRequest` where Facebook account has `connectionStatus: 'REQUIRES_RECONNECT'`
    - Assert: Instagram job status is `'created'`, Facebook job status is `'rejected'` with reason
    - Assert: neither job is affected by the other's outcome
    - _Requirements: 10.4, 10.6_


---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all PBT and integration test sub-tasks carry this mark
- All five correctness properties from design.md section 17 are covered: Property 1 (1.3), Property 2 (4.4), Property 3 (10.3), Property 4 (7.5), Property 5 (4.5)
- The task order strictly respects dependencies: registry → DB + provider interfaces → Facebook OAuth + provider → analytics stores → dashboard → analytics module → AI + scheduler + content studio + reports → error handling → integration tests
- No task mutates any existing Instagram code path; only extension/wrapping is permitted
- The `CapabilityGuard` must be consulted at every decision point; no `if (platform === "facebook")` comparisons are permitted in new code
- Compound unique index must be added AFTER the migration script runs (task 2.2 before task 3.4 goes live)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.5"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3", "4.1"] },
    { "id": 5, "tasks": ["3.4", "3.5", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 7, "tasks": ["4.7", "6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "6.4", "7.1", "7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4", "8.1", "8.2", "9.1", "10.1"] },
    { "id": 10, "tasks": ["7.5", "8.3", "8.4", "9.2", "10.2", "11.1", "12.1"] },
    { "id": 11, "tasks": ["10.3", "11.2", "12.2", "13.1"] },
    { "id": 12, "tasks": ["11.3", "12.3", "13.2", "13.3"] },
    { "id": 13, "tasks": ["15.1", "15.2", "15.3"] }
  ]
}
```
