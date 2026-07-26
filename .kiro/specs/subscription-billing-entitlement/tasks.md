# Implementation Plan: Subscription, Billing & Entitlement System

## Overview

Implements a complete subscription, billing, entitlement, middleware guard, and feature access system for Veefore. The system replaces scattered entitlement logic with a single source of truth (`plan-config.ts`), integrates Cashfree as the exclusive payment gateway, and enforces all plan limits through a centralized `EntitlementService` backed by Redis caching. Implementation proceeds foundation-first: config and types → DB models → repositories → services → middleware → routes/controllers → BullMQ workers → frontend → tests.

---

## Tasks

- [x] 1. Create plan config — single source of truth
  - [x] 1.1 Write `server/config/plan-config.ts` with all types and plan data
    - Define `PlanId`, `BillingCycle`, `VeeGPTTier`, `PlanLimits`, `PlanFeatures`, `PlanPricing`, `PlanConfig`, `AddOnDefinition`, `AddOnType`, `CreditCostMap` TypeScript interfaces
    - Populate `PLAN_CONFIG` record for all 5 plans (free/creator/pro/business/enterprise) with exact values from `Veefore_Subscription_Plans_v1.md`; use `-1` for enterprise unlimited fields
    - Populate `ADDON_CONFIG` record for all 12 add-on types with exact INR pricing (paise) and `requiredMinPlan` where applicable
    - Populate `CREDIT_COSTS` map: captionGeneration=1, hashtagGeneration=1, bannerGeneration=2, aiRewrite=2, veeGPTMessage=1, aiGrowthRecommendation=3, aiContentPlan=3, aiAnalyticsInsight=2, aiBusinessInsight=3
    - Implement `getPlanConfig(planId)`, `getPlanOrder(planId)`, `isValidPlan(id)` helper functions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 17.6, 18.6_

  - [ ]* 1.2 Write property test for plan config — unknown plan rejection
    - **Property 1: Unknown plan identifiers are always rejected**
    - Use `fc.string()` filtered to strings not in `['free','creator','pro','business','enterprise']`; assert `getPlanConfig(id)` returns `null` and `isValidPlan(id)` returns `false` for every generated value
    - **Validates: Requirements 1.8**

  - [ ]* 1.3 Write unit tests for plan config exact values
    - Assert all 5 plans exist with exact numeric limits and feature flags matching `Veefore_Subscription_Plans_v1.md`
    - Assert `CREDIT_COSTS` contains all 9 keys with correct values
    - Assert `ADDON_CONFIG` contains all 12 add-on types with non-null pricing
    - _Requirements: 1.1 – 1.9, 18.4_

- [x] 2. Create MongoDB Mongoose models
  - [x] 2.1 Write `server/features/subscription/db/models/SubscriptionModel.ts`
    - Define `ISubscription` interface with all fields: `subscriptionId` (UUID default), `userId`, `workspaceId`, `plan`, `billingCycle`, `status` (enum: active/trial/cancelled/expired/payment_failed/started), `currentPeriodStart`, `currentPeriodEnd`, `nextBillingDate`, `cancelAtPeriodEnd`, `cashfreeSubscriptionId`, `cashfreeCustomerId`, `featureOverrides` (Map of Boolean), `gracePeriodEndsAt`
    - Add Mongoose schema with `timestamps: true`
    - Add indexes: `{ userId: 1 }`, `{ status: 1 }`, `{ nextBillingDate: 1 }`, `{ userId: 1, status: 1 }` (compound)
    - _Requirements: 2.1, 2.8, 14.6_

  - [x] 2.2 Write `server/features/subscription/db/models/AICreditsModel.ts`
    - Define `IAICredits` interface: `userId` (unique), `remainingCredits`, `monthlyCredits`, `purchasedCredits`, `rolloverCredits`, `usedThisCycle`, `lastResetAt`, `nextResetAt`
    - Add `min: 0` validators on all credit fields
    - Add indexes: `{ userId: 1 }` (unique), `{ nextResetAt: 1 }`
    - _Requirements: 2.3, 9.1, 9.2_

  - [x] 2.3 Write `server/features/subscription/db/models/AddOnModel.ts`
    - Define `IAddOn` interface: `addOnId` (UUID default), `userId`, `type` (enum from `AddOnType`), `quantity`, `status` (active/cancelled), `cashfreeSubscriptionId`, `currentPeriodEnd` (null for one-time)
    - Add index: `{ userId: 1, status: 1 }`
    - _Requirements: 2.4, 8.1, 8.2_

  - [x] 2.4 Write `server/features/subscription/db/models/SubscriptionEventModel.ts`
    - Define `ISubscriptionEvent` interface: `eventType`, `userId`, `subscriptionId`, `previousStatus`, `newStatus`, `previousPlan`, `newPlan`, `triggeredBy` (webhook/admin/user/cron), `adminUserId`, `metadata`, `timestamp`
    - Add indexes: `{ userId: 1, timestamp: -1 }`, `{ subscriptionId: 1 }`
    - _Requirements: 2.5, 10.5, 14.4_

- [x] 3. Create repositories
  - [x] 3.1 Write `server/features/subscription/db/repositories/SubscriptionRepository.ts`
    - Implement `findByUserId(userId)`, `findByStatus(status)`, `upsert(data)`, `updateStatus(userId, status, metadata)`, `findExpired()`, `findDueForRenewal(daysAhead)`, `findPaymentFailedPastGrace(graceDays)`
    - All writes use Mongoose atomic operations; `updateStatus` also writes a `SubscriptionEvent` document in the same logical operation
    - Export a typed `SubscriptionRepository` class; inject `SubscriptionEventModel` for audit writes
    - _Requirements: 2.5, 2.6, 10.1, 10.3_

  - [x] 3.2 Write `server/features/subscription/db/repositories/AICreditsRepository.ts`
    - Implement `findByUserId(userId)`, `upsertForUser(userId, monthlyCredits)`, `resetMonthly(userId, monthlyCredits, nextResetAt)`
    - Implement `deductCredits(userId, amount, maxRetries=3)` with atomic `findOneAndUpdate({ remainingCredits: { $gte: amount } }, { $inc: { remainingCredits: -amount, usedThisCycle: amount } })` and exponential backoff retry (50ms → 100ms → 200ms); return `{ success, remaining }` or throw on exhausted retries
    - Implement `addPurchasedCredits(userId, amount)` using `$inc` on `purchasedCredits` and `remainingCredits`
    - _Requirements: 2.3, 2.6, 9.2, 9.3, 9.5, 15.2, 15.9_

- [x] 4. Implement EntitlementService
  - [x] 4.1 Write `server/features/subscription/services/EntitlementService.ts` — core service class
    - Implement constructor accepting `redis: Redis` and `subscriptionRepo: SubscriptionRepository`
    - Implement `getPlan(userId)` — reads subscription from DB (or returns `'free'` if none), with Redis cache key `sub:entitlement:{userId}` at 60s TTL
    - Implement `getEffectiveLimits(userId)` — merges base plan limits with all active add-ons from `AddOnModel`; returns `EffectiveLimits`; uses cache
    - Implement `getLimit(userId, limitKey)` — calls `getEffectiveLimits` and returns the specific key; returns `Infinity` for enterprise `-1` fields
    - Implement `canUseFeature(userId, featureKey)` — checks `featureOverrides` map first, then plan features; returns `EntitlementResult` with `upgradeHint` on denial
    - Implement `invalidateCache(userId)` — deletes `sub:entitlement:{userId}` from Redis
    - _Requirements: 5.1, 5.2, 5.4, 5.6, 5.7, 5.8, 14.6, 18.1_

  - [x] 4.2 Write remaining EntitlementService methods
    - Implement `remainingCredits(userId)` — reads `AICredits` doc, returns `monthlyCredits + purchasedCredits + rolloverCredits - usedThisCycle`
    - Implement `deductCredits(userId, amount)` — delegates to `AICreditsRepository.deductCredits`; on success calls `QuotaNotifier.checkAndNotify` for threshold alerts
    - Implement `remainingAutomation(userId, type)`, `remainingProfiles(userId)`, `remainingWorkspaces(userId)`, `remainingPosts(userId)`, `remainingKeywords(userId)`, `remainingFollowCampaigns(userId)`
    - For `payment_failed` users with elapsed grace period: all methods return free-plan limits via `getPlanConfig('free')`
    - _Requirements: 5.1, 5.3, 5.5, 9.7, 9.8, 9.9_

  - [ ]* 4.3 Write property test — missing subscription defaults to free plan
    - **Property 2: Missing subscription defaults to free plan**
    - Generate random `fc.uuid()` values (user IDs with no DB record); assert `getPlan(userId)` returns `'free'` and all `getLimit` calls return free-plan values
    - **Validates: Requirements 2.7**

  - [ ]* 4.4 Write property test — add-on limits stack additively
    - **Property 3: Add-on limits stack additively on base plan**
    - Use `fc.constantFrom('free','creator','pro','business')` and `fc.array(fc.nat({ max: 10 }), { minLength: 1, maxLength: 5 })` for add-on quantities; assert result equals base limit plus sum of add-on increments; result always ≥ base limit
    - **Validates: Requirements 5.4, 8.6**

  - [ ]* 4.5 Write property test — enterprise plan returns Infinity for all limits
    - **Property 4: Enterprise plan always returns Infinity for numeric limits**
    - Use `fc.constantFrom(...limitKeys)` and enterprise userId; assert every `getLimit` call returns `Infinity`
    - **Validates: Requirements 5.8, 6.9**

  - [ ]* 4.6 Write property test — payment-failed users treated as free plan
    - **Property 12: Payment-failed users after grace period are treated as free plan**
    - Generate any `fc.constantFrom(...featureKeys)` against a user with `payment_failed` status and `gracePeriodEndsAt` in the past; assert result equals free-plan result for same feature
    - **Validates: Requirements 5.3, 4.7**

- [x] 5. Implement AICredits lifecycle and property tests
  - [x] 5.1 Write credit formula and deduction logic (covered in `AICreditsRepository` — validate here via tests)
    - Wire `AICreditsRepository.deductCredits` through `EntitlementService.deductCredits` so all callers use the service
    - Validate deduction order: `monthlyCredits` consumed first, then `purchasedCredits` (implement split logic in repository)
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [ ]* 5.2 Write property test — remaining credits formula is always correct
    - **Property 5: Remaining credits formula is always correct**
    - Use `fc.nat()` for `monthlyCredits`, `purchasedCredits`, `rolloverCredits`, `usedThisCycle`; assert `remainingCredits = monthlyCredits + purchasedCredits + rolloverCredits - usedThisCycle`; run with `numRuns: 500`
    - **Validates: Requirements 5.5, 9.1**

  - [ ]* 5.3 Write property test — credit deduction never produces negative balance
    - **Property 6: Credit deduction never produces negative balance**
    - Generate `fc.nat()` for `remainingCredits` and `amount` where `amount > remainingCredits`; assert deduction is rejected and `remainingCredits` unchanged
    - **Validates: Requirements 9.3**

  - [ ]* 5.4 Write property test — credit deduction decrements by exactly the requested amount
    - **Property 7: Credit deduction decrements by exactly the requested amount**
    - Generate valid `fc.nat()` pairs where `remainingCredits >= amount`; assert new `remainingCredits = old - amount` exactly; run with `numRuns: 500`
    - **Validates: Requirements 9.2**

- [x] 6. Implement WebhookVerifier and idempotency
  - [x] 6.1 Write `server/features/subscription/services/WebhookVerifier.ts`
    - Implement `verify(rawBody: Buffer, signatureHeader: string, secret: string): boolean` using `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` and `crypto.timingSafeEqual()` for constant-time comparison
    - Implement `isAlreadyProcessed(eventId: string, redis: Redis): Promise<boolean>` — checks Redis key `sub:webhook:processed:{eventId}` with 24-hour TTL
    - Implement `markProcessed(eventId: string, redis: Redis): Promise<void>` — sets the idempotency key
    - _Requirements: 4.1, 4.2, 4.9, 4.10, 15.4_

  - [ ]* 6.2 Write property test — webhook HMAC verification is a pure gate
    - **Property 8: Webhook HMAC verification is a pure gate**
    - Use `fc.uint8Array()` for payload, `fc.string()` for secret; assert `verify(payload, hmac(payload, secret), secret)` returns `true`; assert `verify(payload, anyOtherSig, secret)` returns `false`; assert any single-byte mutation to payload invalidates the original signature
    - **Validates: Requirements 4.1, 4.2, 15.4**

  - [ ]* 6.3 Write property test — webhook processing is idempotent
    - **Property 9: Webhook processing is idempotent**
    - Generate `fc.record(webhookEventShape)`; process the event twice; assert DB state is same as processing once; assert `SubscriptionEvent` audit log contains exactly one record per event ID
    - **Validates: Requirements 4.9**

- [x] 7. Implement CashfreeService
  - [x] 7.1 Write `server/features/subscription/services/CashfreeService.ts`
    - Load `CASHFREE_BASE_URL`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET` exclusively from `process.env`; throw at startup if any are missing
    - Implement `createCustomer(userId, email, phone)` — POST to Cashfree customers API; return `CashfreeCustomer`
    - Implement `createSubscription(params)` — POST to Cashfree subscriptions API; return checkout URL and `cashfreeSubscriptionId`
    - Implement `cancelSubscription(cashfreeSubscriptionId)`, `getSubscription(cashfreeSubscriptionId)`, `listSubscriptions(customerId)`
    - Implement `createRefund(paymentId, amount, reason)` — POST to Cashfree refunds API
    - On any Cashfree API failure: log with `logger.error({ module: 'subscription', ... })` including full request context; throw — never partially update DB
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8, 14.5, 15.7_

- [x] 8. Implement QuotaNotifier
  - [x] 8.1 Write `server/features/subscription/services/QuotaNotifier.ts`
    - Implement `checkAndNotify(userId, quotaType, used, limit)` — compute percentage, check thresholds 80/90/100%; before sending, check Redis dedup key `sub:notification:{userId}:{quotaType}:{threshold}:{cycleStart}`; if absent send via existing `server/email-service.ts`; on send set key with TTL until end of billing cycle
    - Implement `sendPreRenewalNotification(subscription)` — email 3 days before `nextBillingDate`; include renewal amount and billing management link
    - Implement `sendPaymentFailedNotification(userId)` — immediate email with instructions to update payment method
    - Implement `sendCancellationConfirmation(userId, accessEndsAt)` — email with access end date
    - Implement `sendCreditPurchaseConfirmation(userId, creditsAdded, newBalance)`
    - Write every sent notification to DB with `notificationType`, `userId`, `sentAt`, `channel`
    - _Requirements: 9.7, 9.8, 9.9, 10.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [x] 9. Implement SubscriptionService and AddOnService
  - [x] 9.1 Write `server/features/subscription/services/SubscriptionService.ts`
    - Implement `create(userId, workspaceId, planId, billingCycle, email, phone)` — call `CashfreeService.createCustomer` and `createSubscription`; upsert Subscription doc with status `started`; record `SubscriptionEvent`; return `{ checkoutUrl }`
    - Implement `upgrade(userId, newPlanId)` — validate plan order > current; call Cashfree proration; update DB immediately; invalidate cache; record event
    - Implement `downgrade(userId, newPlanId)` — validate plan order < current; set `cancelAtPeriodEnd = true`; schedule new plan at period end; record event
    - Implement `cancel(userId)` — set `cancelAtPeriodEnd = true`; call `CashfreeService.cancelSubscription`; send cancellation confirmation email; record event
    - Implement `resume(userId)` — clear `cancelAtPeriodEnd`; reactivate Cashfree subscription; record event
    - All state-changing methods: invalidate Redis entitlement cache, write `SubscriptionEvent`, validate `userId` matches authenticated user
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.8, 15.6_

  - [x] 9.2 Write `server/features/subscription/services/AddOnService.ts`
    - Implement `addAddOn(userId, addonType, quantity)` — check `requiredMinPlan` from `ADDON_CONFIG`; if one-time credit pack call `AICreditsRepository.addPurchasedCredits` directly; else create Cashfree subscription for add-on; upsert `AddOn` document; invalidate cache; send confirmation if credit pack
    - Implement `removeAddOn(userId, addonId)` — cancel Cashfree subscription; set status `cancelled`; keep active until `currentPeriodEnd`; invalidate cache
    - Implement `listActiveAddOns(userId)` — return `AddOn` docs with `status: active`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7_

  - [ ]* 9.3 Write property test — subscription status changes always produce an audit event
    - **Property 10: Subscription status changes always produce an audit event**
    - Use `fc.constantFrom(...statuses)` pairs for `previousStatus`/`newStatus`; trigger each transition; assert exactly one `SubscriptionEvent` document exists with correct `previousStatus`, `newStatus`, `triggeredBy`
    - **Validates: Requirements 2.5**

- [x] 10. Implement Webhook controller and route
  - [x] 10.1 Write `server/features/subscription/controllers/webhook.controller.ts`
    - Implement `handleCashfreeWebhook(req, res)` — receive raw Buffer body; call `WebhookVerifier.verify()`; on failure return 401 and log source IP + first 50 bytes
    - Check idempotency via `WebhookVerifier.isAlreadyProcessed()`; if already seen return 200 immediately
    - Route on `event.type` to one of 7 handlers: `subscription.activated`, `subscription.renewed`, `subscription.cancelled`, `subscription.expired`, `payment.success`, `payment.failed`, `refund.processed`
    - Each handler: update DB, invalidate cache, record `SubscriptionEvent`, trigger `QuotaNotifier` as appropriate
    - After successful processing: call `markProcessed(eventId)` in Redis
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 10.2 Write `server/features/subscription/routes/webhook.routes.ts`
    - Mount `POST /api/webhooks/cashfree` with `express.raw({ type: 'application/json' })` BEFORE `express.json()` — do NOT use the global JSON body parser on this route
    - Apply `cashfreeRateLimiter` (300 req/min) using existing rate-limiting infrastructure
    - _Requirements: 4.10, 15.5_

- [x] 11. Implement entitlement middleware stack
  - [x] 11.1 Write `server/middleware/entitlement.middleware.ts` — all 10 middleware functions
    - Implement `requireSubscription()` — reject cancelled/expired/payment_failed-past-grace with HTTP 402 + `{ error, currentPlan, upgradeUrl, reason }`
    - Implement `requireFeature(featureKey)` — call `canUseFeature()`; HTTP 403 + `{ error, featureKey, currentPlan, requiredPlan, upgradeHint }` on denial
    - Implement `requireCredits(amount)` — check `remainingCredits >= amount` atomically; HTTP 402 + `{ error, required, remaining, purchaseUrl }` if insufficient
    - Implement `requireWorkspaceLimit()` — count workspaces for user; compare to `getLimit(userId, 'maxWorkspaces')`; HTTP 403 + `{ error, currentCount, maxAllowed, currentPlan, upgradeHint }`
    - Implement `requireProfileLimit()` — count profiles across all user workspaces; compare to `getLimit(userId, 'maxProfiles')`
    - Implement `requireAnalyticsLimit(requestedDays)` — verify `requestedDays <= analyticsHistoryDays` limit; HTTP 403 + `upgradeHint`
    - Implement `requireAutomationLimit(type)` — check `remainingAutomation(userId, type) > 0`
    - Implement `requireRole(roleLevel)` — verify user role within workspace
    - Implement `requireAddon(addonType)` — verify user has active add-on of specified type
    - Implement `requirePlan(minimumPlan)` — verify `getPlanOrder(userPlan) >= getPlanOrder(minimumPlan)`
    - Enterprise bypass: all functions call `next()` immediately for enterprise users without numeric checks
    - All functions log entitlement check result using `logger` with `{ module: 'subscription', userId, action: 'entitlement_check', result, planId, timestamp }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.11_

  - [ ]* 11.2 Write property test — analytics history enforcement is monotone with plan tier
    - **Property 11: Analytics history enforcement is monotone with plan tier**
    - Use `fc.constantFrom(...plans)` and `fc.nat({ max: 800 })` for `requestedDays`; assert request allowed iff `requestedDays <= plan.limits.analyticsHistoryDays`; assert plan with larger limit permits all ranges that smaller limit permits plus more
    - **Validates: Requirements 16.1, 7.3**

  - [ ]* 11.3 Write property test — VeeGPT tier access follows plan hierarchy
    - **Property 13: VeeGPT tier access follows plan hierarchy**
    - Use `fc.constantFrom('free','creator','pro','business','enterprise')` and `fc.constantFrom('basic','full','advanced')`; assert access granted iff `veeGPTLevel(plan) >= requestedTier` in the hierarchy `basic < full < advanced`
    - **Validates: Requirements 17.1, 17.2**

- [x] 12. Checkpoint — core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement subscription routes and controllers
  - [x] 13.1 Write `server/features/subscription/controllers/subscription.controller.ts`
    - Define Zod schemas for all request bodies: `CreateSubscriptionSchema`, `UpgradeSchema`, `DowngradeSchema`, `CancelSchema`, `ResumeSchema`, `AddAddonSchema`, `RemoveAddonSchema`
    - Implement `createSubscription(req, res)` — validate body, call `SubscriptionService.create`, return `{ checkoutUrl }`
    - Implement `upgradeSubscription(req, res)` — validate plan order, call `SubscriptionService.upgrade`
    - Implement `downgradeSubscription(req, res)` — call `SubscriptionService.downgrade`
    - Implement `cancelSubscription(req, res)` — call `SubscriptionService.cancel`
    - Implement `resumeSubscription(req, res)` — call `SubscriptionService.resume`
    - Implement `getSubscriptionMe(req, res)` — call `EntitlementService.getEffectiveLimits`, query usage counts, read `AICredits`, list add-ons; compose `SubscriptionMeResponse`; cache response in Redis for 30s per user
    - Implement `addAddon(req, res)` and `removeAddon(req, res)` — delegate to `AddOnService`
    - Implement `listAddons(req, res)` — delegate to `AddOnService.listActiveAddOns`
    - Validate `userId` in each operation matches `req.user.id`; reject with 403 otherwise
    - _Requirements: 3.7, 11.1, 11.2, 11.3, 11.6, 15.3, 15.6_

  - [x] 13.2 Write `server/features/subscription/routes/subscription.routes.ts`
    - Mount all 9 endpoints under `/api/subscription` with `requireAuth` middleware on every route
    - Apply `express.json()` body parser for these routes
    - _Requirements: 3.7_

- [x] 14. Implement admin routes and controllers
  - [x] 14.1 Write `server/features/subscription/controllers/admin.controller.ts`
    - Implement `getUserSubscription(req, res)` — return full subscription state, plan, usage, credits for `:userId`
    - Implement `setUserPlan(req, res)` — validate new plan with `isValidPlan()`; update `Subscription` doc; invalidate cache; write audit `SubscriptionEvent` with `triggeredBy: 'admin'` and `adminUserId`
    - Implement `adjustCredits(req, res)` — validate non-negative amount; call `$inc` on `AICredits`; write audit event
    - Implement `grantRevokAddon(req, res)` — upsert or soft-delete `AddOn` document; invalidate cache
    - Implement `forceCancelSubscription(req, res)`, `extendBillingPeriod(req, res)`, `applyCoupon(req, res)`
    - Implement `getSubscriptionHistory(req, res)` — query `SubscriptionEvent` sorted by `timestamp desc`
    - Implement `processRefund(req, res)` — call `CashfreeService.createRefund`; update payment record
    - Implement `setFeatureOverride(req, res)` — update `featureOverrides` map in `Subscription`; invalidate cache
    - Sanitize and validate all inputs with Zod; reject negative credit values and unknown plan identifiers
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 15.8_

  - [x] 14.2 Write `server/features/subscription/routes/admin.routes.ts`
    - Mount all 10 admin endpoints under `/api/admin/subscription` with admin authentication middleware
    - _Requirements: 14.1, 14.7_

- [x] 15. Implement BullMQ queue and cron worker
  - [x] 15.1 Write `server/queues/subscriptionCronQueue.ts`
    - Export `subscriptionCronQueue` as a BullMQ `Queue<SubscriptionCronJobData>` named `subscription-cron-queue` using `getSharedRedisConnection()`
    - Define `CronJobType` union: `daily_expiry_check | grace_period_check | reconciliation | monthly_quota_reset | pre_renewal_notifications`
    - Define `SubscriptionCronJobData` interface with `type` and `triggeredAt` fields
    - _Requirements: 10.7_

  - [x] 15.2 Write `server/workers/subscriptionCronWorker.ts`
    - Implement `getSubscriptionCronWorker()` lazy-init function matching existing `getResearchWorker()` pattern
    - Implement processor: dispatch on `job.data.type` to 5 handlers
    - `daily_expiry_check` — find subscriptions with `currentPeriodEnd < now` and status `active`; transition to `expired`; write `SubscriptionEvent`; downgrade to free-plan entitlements
    - `grace_period_check` — find `payment_failed` where `gracePeriodEndsAt < now`; downgrade entitlements to free plan; write event
    - `reconciliation` — fetch subscriptions from Cashfree API in batches; compare status with local DB; correct discrepancies; log each correction
    - `monthly_quota_reset` — find subscriptions whose `nextBillingDate` matches today; reset `AICredits.remainingCredits` to plan allocation; set `rolloverCredits = 0`; log reset per user; update `nextBillingDate`
    - `pre_renewal_notifications` — find active paid subscriptions with `nextBillingDate` 3 days away; call `QuotaNotifier.sendPreRenewalNotification`
    - Per-user failures: catch and log error with `logger.error`; continue batch (never throw from inner loop)
    - Configure BullMQ job options with `attempts: 3` and exponential backoff
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 15.3 Register cron schedules on server startup
    - In the subscription module's `index.ts` or server startup file, add 5 repeatable jobs to `subscriptionCronQueue` with BullMQ cron expressions: `daily_expiry_check` at `0 2 * * *`, `grace_period_check` at `0 3 * * *`, `reconciliation` at `0 4 * * *`, `monthly_quota_reset` at `0 1 * * *`, `pre_renewal_notifications` at `0 9 * * *`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

- [x] 16. Apply route guards to existing premium routes
  - [x] 16.1 Guard scheduling, analytics, and social listening routes
    - Add `requireSubscription()` → `requireProfileLimit()` → `requireFeature('scheduling')` middleware chain to `POST /api/content/schedule` (or equivalent scheduler route in `server/routes.ts` or `server/scheduler-service.ts`)
    - Add `requireFeature('bulkScheduling')` to bulk schedule endpoint
    - Add `requireAnalyticsLimit(requestedDays)` to analytics date-range query routes in `server/features/analytics/`
    - Add `requireFeature('socialListening')` to social listening endpoints
    - Add `requireFeature('advancedSocialListening')` to competitor mentions, sentiment, and trend endpoints
    - Add `requireFeature('customDashboards')` to custom dashboard creation endpoint
    - _Requirements: 7.1, 7.3, 7.4, 7.10, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_
    - VERIFIED (re-audit): guard chains from `apply-route-guards.ts` were previously dead code — defined but never imported into any route file, so no enforcement was active. Now actually wired in: `schedulingGuards` → `content.routes.ts` (`POST /:contentId/schedule`, `PUT /:contentId/reschedule`) and `scheduler.routes.ts` (`POST /create`); `analyticsHistoryGuard()` → `analytics.routes.ts` (`GET /workspace/:workspaceId/date-range`, `GET /historical`); `customDashboardGuards` → `analytics.routes.ts` dashboard router mount (added `requireAuth` there too, since it was missing); `analyticsExportGuards` + `injectAnalyticsExportMode()` → `analytics-reports.routes.ts` (`GET /export-data`); `socialListeningGuards` / `advancedSocialListeningGuards` → 12 endpoints in `social-listening.ts`. No bulk-schedule endpoint exists yet, so `bulkSchedulingGuards` has no route to attach to. Confirmed zero new diagnostics on all touched files.

  - [x] 16.2 Guard automation, VeeGPT, team, and AI routes
    - Add `requireSubscription()` → `requireAutomationLimit('workflows')` → `requireFeature('automation')` to automation creation routes
    - Add `requirePlan('creator')` to Full VeeGPT endpoints; `requirePlan('pro')` to Advanced VeeGPT endpoints
    - Add `requireCredits(CREDIT_COSTS[operation])` before every AI credit-consuming endpoint (caption gen, banner gen, AI rewrite, VeeGPT message, growth recommendations, content planning, analytics insights, business insights)
    - Add `requireAutomationLimit('teamMembers')` to team member invite endpoints
    - Add `requireFeature('apiAccess')` (or `requireAddon('api_access')`) to API access endpoints
    - Add `requireFeature('whiteLabelReports')` to white-label report generation
    - Add `requirePlan('pro')` to AI Rewrite, AI Content Planning, AI Growth Recommendations, AI Analytics Insights
    - Add `requirePlan('business')` to AI Business Insights
    - _Requirements: 7.2, 7.5, 7.6, 7.7, 7.8, 7.9, 17.2, 17.3, 17.4, 17.5, 17.7_
    - VERIFIED (re-audit): guard chains from `ai-route-guards.ts` were previously dead code — same issue as 16.1. Now wired in: `captionGenerationGuards`/`hashtagGenerationGuards`/`bannerGenerationGuards`/`aiRewriteGuards` → `ai.routes.ts` (`/generate-caption`, `/regenerate-captions`, `/generate-hashtags`, `/generate-image`, `/generate-content`, `/adapt-caption`); `analyticsInsightGuards`/`growthRecommendationGuards` → `analytics.routes.ts` (`/generate-insight`, `/growth-recommendations`); `automationGuards` → `automation.routes.ts` (`POST /rules`); `teamInviteGuards` → `workspace.routes.ts` (`POST /:workspaceId/invite`); `veeGPTBasicGuards` → `veegpt-chat.routes.ts` message/conversation endpoints. No distinct backend route exists yet for AI Content Planning, AI Business Insights (separate from Pro-tier analytics insights), white-label report generation, or a dedicated API-access endpoint, so those guard chains remain unattached pending those features being built. Confirmed zero new diagnostics on all touched files.

- [x] 17. Register subscription module in server entry point
  - [x] 17.1 Wire all subscription routes into `server/routes.ts` or `server/index.ts`
    - Import and mount `subscriptionRouter` at `/api/subscription`
    - Import and mount `webhookRouter` at `/api/webhooks` — ensure this registration happens BEFORE the global `express.json()` middleware so raw body parsing on `/api/webhooks/cashfree` is not overridden
    - Import and mount `adminSubscriptionRouter` at `/api/admin/subscription`
    - Call `getSubscriptionCronWorker()` on server startup to initialise the BullMQ worker
    - Export the `EntitlementService` singleton instance for import by existing middleware and features
    - Write `server/features/subscription/index.ts` exporting all public service, model, and type interfaces
    - _Requirements: 18.1, 18.8_

- [x] 18. Checkpoint — backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement frontend useSubscription hook and UpgradeDialog
  - [x] 19.1 Write `client/src/hooks/useSubscription.ts`
    - Use `useQuery` from React Query with `queryKey: ['subscription', 'me']` and `queryFn: () => api.get('/api/subscription/me')`
    - Set `staleTime: 30_000` to align with server-side 30s Redis cache
    - Return `{ plan, status, limits, usage, aiCredits, addOns, isLoading, error }`
    - Do NOT include any frontend plan-gating logic in the hook — expose data only
    - _Requirements: 11.3, 12.6_

  - [x] 19.2 Write `client/src/components/UpgradeDialog.tsx`
    - Accept props: `upgradeHint: { reason, currentLimit, nextPlan, nextPlanLimit, upgradeUrl }` sourced directly from the server 403 response body
    - Render modal with: reason text, current limit display, next plan name and limit, upgrade CTA button linking to `upgradeUrl`
    - Do NOT hardcode any plan names, limits, or pricing — render whatever the server returns
    - Export trigger mechanism that opens dialog when a 403 response is intercepted by the API client (Axios/fetch interceptor)
    - _Requirements: 12.1, 12.2, 12.6_

  - [x] 19.3 Add quota usage indicators to subscription settings page
    - Use `useSubscription()` data to render quota usage progress bars (workspaces, profiles, AI credits, posts, keyword conversations, AI conversations)
    - Add soft warning badge on sidebar nav item when `usage[key] / limits[key] >= 0.8`
    - Display `payment_failed` status banner with link to billing page when `status === 'payment_failed'`
    - Show `cancelAtPeriodEnd` notice with access end date
    - _Requirements: 11.4, 12.3, 12.4, 12.5_

- [ ] 20. Write remaining unit and integration tests
  - [ ]* 20.1 Write unit tests for EntitlementService — `entitlement.service.test.ts`
    - `canUseFeature` for all 5 plans × all feature keys in `PlanFeatures`
    - `remainingCredits` after various deduction sequences
    - `getLimit` with and without add-ons applied
    - Grace period boundary: exactly at 3 days elapsed vs 1 second before
    - _Requirements: 18.4_

  - [ ]* 20.2 Write unit tests for WebhookVerifier — `webhook-verifier.test.ts`
    - Valid signature accepted
    - Invalid signature rejected
    - Payload mutation invalidates signature
    - `timingSafeEqual` is used (verify no timing leak in test environment)
    - _Requirements: 18.5_

  - [ ]* 20.3 Write unit tests for subscription controller — `subscription.controller.test.ts`
    - Zod validation rejects malformed request bodies for all 9 endpoints
    - Upgrade/downgrade/cancel return correct response shapes
    - Cross-user manipulation rejected with 403
    - _Requirements: 15.3, 15.6_

  - [ ]* 20.4 Write unit tests for admin controller — `admin.controller.test.ts`
    - Admin-only auth enforced (non-admin gets 403)
    - Manual plan set invalidates entitlement cache
    - Audit trail written on every admin action
    - Negative credit values rejected with 400
    - Unknown plan identifiers rejected with 400
    - _Requirements: 14.7, 15.8_

  - [ ]* 20.5 Write integration test — concurrent credit deductions
    - Fire 10 concurrent `deductCredits` calls against a single `AICredits` document with `remainingCredits = 5` and each deduction requesting 1 credit
    - Assert final `remainingCredits = 0`; exactly 5 calls succeed, 5 fail with `insufficient_credits`; no balance goes negative
    - _Requirements: 2.6, 9.2, 9.3, 15.2_

  - [ ]* 20.6 Write integration test — webhook end-to-end for all 7 event types
    - Mock Cashfree HTTP responses; fire each of the 7 webhook event types with valid HMAC signatures
    - Assert correct DB state transition for each event type
    - Assert duplicate event (same event ID) produces no additional DB changes
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 20.7 Write integration test — `GET /api/subscription/me` response shape
    - Assert response strictly matches `SubscriptionMeResponse` TypeScript interface
    - Assert `usage` fields are computed from actual DB counts, not static values
    - Assert Redis caching returns same value within 30s without additional DB queries
    - _Requirements: 11.1, 11.2, 11.6_

- [x] 21. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Implementation language: **TypeScript** (matches existing codebase convention)
- Testing library: **Vitest + fast-check** for property-based tests; each property test runs minimum 100 iterations (500 for credit arithmetic)
- All plan numeric values live exclusively in `server/config/plan-config.ts`; no other file may hardcode plan limits or pricing
- The webhook route (`/api/webhooks/cashfree`) MUST be registered before the global `express.json()` middleware to preserve raw body for HMAC verification
- Redis connection: use `getSharedRedisConnection()` from `server/lib/redis.ts` — same pattern as existing BullMQ queues
- Logger: use `logger` from `server/config/logger.ts` with `{ module: 'subscription' }` field on every log call
- Existing `server/razorpay-service.ts`, `server/subscription-service.ts`, `server/subscription-middleware.ts`, `server/subscription-config.ts`, and `server/pricing-config.ts` are superseded by this feature; remove or mark deprecated after migration


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1", "6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "4.6", "5.2", "5.3", "5.4", "6.2", "6.3", "9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "15.1"] },
    { "id": 7, "tasks": ["9.3", "10.2", "11.1", "15.2"] },
    { "id": 8, "tasks": ["11.2", "11.3", "13.1", "14.1", "15.3"] },
    { "id": 9, "tasks": ["13.2", "14.2", "16.1", "16.2"] },
    { "id": 10, "tasks": ["17.1"] },
    { "id": 11, "tasks": ["19.1", "19.2"] },
    { "id": 12, "tasks": ["19.3"] },
    { "id": 13, "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6", "20.7"] }
  ]
}
```
