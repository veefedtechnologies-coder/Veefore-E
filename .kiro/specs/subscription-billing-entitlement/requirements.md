# Requirements Document

## Introduction

Veefore requires an enterprise-grade Subscription, Billing, Entitlement, Middleware, Guard, and Feature Access System. The system must replace the current scattered, inconsistent entitlement logic with a single source of truth: the plan definitions in `Veefore_Subscription_Plans_v1.md`. Every premium feature in Veefore must be controlled exclusively by backend entitlement checks — the frontend only displays quota information returned from the server, never makes access decisions. The payment gateway is Cashfree. The system must handle the complete subscription lifecycle, all quota types, add-ons, admin overrides, webhook reconciliation, quota notifications, and cron-driven resets.

---

## Glossary

- **Entitlement_Service**: The centralized backend service that is the sole authority for all plan capabilities, quota checks, and feature access decisions.
- **Plan**: One of the defined tiers: `free`, `creator`, `pro`, `business`, `enterprise`.
- **Billing_Cycle**: Either `monthly` or `yearly`.
- **Subscription**: A MongoDB document recording a user's active plan, billing cycle, status, and Cashfree subscription reference.
- **PlanEntitlement**: A MongoDB document or in-memory config object that defines all numeric limits and feature flags for a given plan, sourced exclusively from `Veefore_Subscription_Plans_v1.md`.
- **AICredits**: A MongoDB document per user tracking `remainingCredits`, `monthlyCredits`, `purchasedCredits`, and `rolloverCredits` that resets on the billing cycle.
- **AddOn**: A purchasable extension that increases specific quota dimensions beyond the base plan limit.
- **Cashfree**: The payment gateway used for all billing operations.
- **Webhook_Verifier**: The server-side component that validates every Cashfree webhook using HMAC-SHA256 signature before processing.
- **Quota_Notifier**: The service responsible for sending 80%, 90%, and 100% usage alerts and pre-renewal, payment failure, and credit expiry notifications.
- **Entitlement_Middleware**: The Express middleware stack (`requireSubscription`, `requireFeature`, `requireCredits`, `requireWorkspaceLimit`, `requireAutomationLimit`, `requireAnalyticsLimit`, `requireRole`, `requireAddon`, `requirePlan`, `requireProfileLimit`) that guards all premium API routes.
- **Admin_Panel**: The internal admin interface for managing plans, subscriptions, credits, add-ons, coupons, and manual overrides without code changes.
- **Subscription_Status**: One of: `active`, `trial`, `cancelled`, `expired`, `payment_failed`, `started`.
- **VeeGPT**: Veefore's AI assistant with three tiers: Basic (free), Full (creator), Advanced (pro/business/enterprise).
- **Upgrade_Dialog**: A frontend modal triggered on quota hit, showing reason, current limit, next plan benefits, and a CTA, driven entirely by data returned from the server.


---

## Requirements

### Requirement 1: Plan Definition Config (Single Source of Truth)

**User Story:** As a developer, I want all plan values to come from a single versioned config so that plan changes never require scattered code edits.

#### Acceptance Criteria

1. THE Entitlement_Service SHALL load all plan limits and feature flags exclusively from `server/config/plan-config.ts`, which mirrors `Veefore_Subscription_Plans_v1.md` without deviation.
2. THE Entitlement_Service SHALL define the following plans with exact values: `free`, `creator`, `pro`, `business`, `enterprise`.
3. FOR the `free` plan, THE Entitlement_Service SHALL enforce: 1 workspace, 6 social profiles, 1 team member, 30 scheduled posts/month, 30 days analytics history, 50 AI credits/month, 1 workflow, 1 AI workflow, 3 keyword triggers, 50 keyword trigger conversations/month, 30 AI-powered conversations/month, no follow campaign, no social listening, Basic VeeGPT only, watermarked PDF export only.
4. FOR the `creator` plan, THE Entitlement_Service SHALL enforce: 2 workspaces, 15 social profiles, 1 team member, unlimited scheduling, bulk scheduling, 1 year analytics history, PDF/Excel/CSV/PowerPoint export, 500 AI credits/month, 5 workflows, 5 AI workflows, 20 keyword triggers, 500 keyword trigger conversations/month, 300 AI-powered conversations/month, follow campaign with 100 conversations/month, Full VeeGPT, AI Rewrite, basic social listening.
5. FOR the `pro` plan, THE Entitlement_Service SHALL enforce: 5 workspaces, 75 social profiles, 5 team members, 2 years analytics history, custom dashboards, advanced reports, 2000 AI credits/month, unlimited workflows, unlimited AI workflows, unlimited keyword triggers, 5000 keyword trigger conversations/month, 3000 AI-powered conversations/month, 1000 follow campaign conversations/month, multi-step AI journeys, smart logic builder, advanced social listening, Advanced VeeGPT, AI growth recommendations, AI content planning.
6. FOR the `business` plan, THE Entitlement_Service SHALL enforce: 20 workspaces, 300 social profiles, 20 team members, all Pro features plus white-label reports, client reporting, 5000 AI credits/month, 50000 keyword trigger conversations/month, 30000 AI-powered conversations/month, 10000 follow campaign conversations/month, approval workflow, advanced roles and permissions.
7. FOR the `enterprise` plan, THE Entitlement_Service SHALL treat all numeric limits as unlimited (represented as -1), and SHALL include: custom AI credits, SSO, API access, dedicated infrastructure, SLA.
8. IF a plan identifier is not one of the five defined plans, THEN THE Entitlement_Service SHALL reject the request with HTTP 400 and log the unknown plan identifier.
9. THE Entitlement_Service SHALL expose a `getPlanConfig(planId)` function that returns the full plan definition including all numeric limits and boolean feature flags.


---

### Requirement 2: Database Schema — Subscription, PlanEntitlement, AICredits, AddOns

**User Story:** As a backend engineer, I want well-defined MongoDB collections so that subscription state, entitlements, and credits are always consistent and queryable.

#### Acceptance Criteria

1. THE System SHALL maintain a `Subscription` collection with the following fields: `subscriptionId` (UUID), `userId`, `workspaceId`, `plan` (enum: free/creator/pro/business/enterprise), `billingCycle` (enum: monthly/yearly), `status` (enum: active/trial/cancelled/expired/payment_failed/started), `currentPeriodStart`, `currentPeriodEnd`, `nextBillingDate`, `cancelAtPeriodEnd` (boolean), `cashfreeSubscriptionId`, `cashfreeCustomerId`, `createdAt`, `updatedAt`.
2. THE System SHALL maintain a `PlanEntitlement` collection or in-memory config that stores all numeric limits and feature flags per plan, keyed by plan identifier, and SHALL be the exclusive source for entitlement lookups.
3. THE System SHALL maintain an `AICredits` document per user containing: `userId`, `remainingCredits`, `monthlyCredits` (base plan allocation), `purchasedCredits` (from add-on packs), `rolloverCredits`, `lastResetAt`, `nextResetAt`.
4. THE System SHALL maintain an `AddOn` collection tracking: `addOnId`, `userId`, `type` (enum: extra_workspace/extra_team_member/extra_profiles/ai_credits/ai_conversations/keyword_conversations/follow_campaign_conversations/white_label_reports/api_access/priority_support), `quantity`, `status` (active/cancelled), `cashfreeSubscriptionId`, `currentPeriodEnd`.
5. WHEN a subscription status changes, THE System SHALL record the change in a `SubscriptionEvent` audit log with: `eventType`, `previousStatus`, `newStatus`, `triggeredBy` (webhook/admin/user/cron), `timestamp`, `metadata`.
6. THE System SHALL use MongoDB atomic operations for all credit deduction writes to prevent race conditions.
7. IF a user document does not have a Subscription record, THEN THE Entitlement_Service SHALL treat that user as being on the `free` plan.
8. THE System SHALL index the `Subscription` collection on `userId`, `status`, and `nextBillingDate` for efficient cron job queries.


---

### Requirement 3: Cashfree Payment Gateway Integration

**User Story:** As a user, I want to subscribe and pay through Cashfree so that my subscription is activated immediately and managed automatically.

#### Acceptance Criteria

1. THE System SHALL integrate exclusively with Cashfree for all subscription billing operations, replacing any existing Razorpay integration.
2. THE System SHALL support monthly and yearly billing cycles via Cashfree subscription plans.
3. WHEN a user initiates a subscription, THE System SHALL create a Cashfree customer record and subscription, storing the `cashfreeSubscriptionId` and `cashfreeCustomerId` in the Subscription document.
4. THE System SHALL handle the complete subscription lifecycle: activation, renewal, cancellation, upgrade, downgrade, resume, and failed payment recovery.
5. WHEN a user upgrades from a lower plan to a higher plan mid-cycle, THE System SHALL calculate and apply proration via Cashfree and immediately update the user's entitlements in the database.
6. WHEN a user downgrades, THE System SHALL schedule the downgrade to take effect at the end of the current billing period and set `cancelAtPeriodEnd = true` for the current higher plan.
7. THE System SHALL expose the following API endpoints for billing operations: `POST /api/subscription/create`, `POST /api/subscription/upgrade`, `POST /api/subscription/downgrade`, `POST /api/subscription/cancel`, `POST /api/subscription/resume`, `GET /api/subscription/me`, `POST /api/subscription/addon/add`, `POST /api/subscription/addon/remove`.
8. IF a Cashfree API call fails, THEN THE System SHALL log the error with full request/response context, return an appropriate error to the client, and NOT update the subscription status.
9. WHERE a yearly billing cycle is selected, THE System SHALL apply the yearly price as defined in the plan config (e.g., ₹7,999/year for Creator) rather than 12× the monthly price.


---

### Requirement 4: Cashfree Webhook Handling

**User Story:** As a system operator, I want all subscription state changes driven exclusively by verified Cashfree webhooks so that the system is always in sync with the payment gateway.

#### Acceptance Criteria

1. THE Webhook_Verifier SHALL validate every incoming Cashfree webhook using HMAC-SHA256 signature verification before any processing occurs.
2. IF a Cashfree webhook signature is invalid, THEN THE System SHALL reject the request with HTTP 401 and log the rejection with the source IP and raw payload.
3. THE System SHALL handle the following Cashfree webhook events: `subscription.activated`, `subscription.renewed`, `subscription.cancelled`, `subscription.expired`, `payment.success`, `payment.failed`, `refund.processed`.
4. WHEN a `subscription.activated` webhook is received and verified, THE System SHALL set the subscription status to `active`, set `currentPeriodStart` and `currentPeriodEnd`, allocate the plan's monthly AI credits to the user's `AICredits` document, and reset all monthly quotas.
5. WHEN a `subscription.renewed` webhook is received and verified, THE System SHALL update `currentPeriodStart`, `currentPeriodEnd`, and `nextBillingDate`, reset all monthly quotas, and re-allocate monthly AI credits.
6. WHEN a `subscription.cancelled` webhook is received and verified, THE System SHALL set `cancelAtPeriodEnd = true` and maintain `active` status until `currentPeriodEnd`, at which point the status transitions to `cancelled`.
7. WHEN a `payment.failed` webhook is received and verified, THE System SHALL set the subscription status to `payment_failed`, send a payment failure notification to the user, and block access to premium features after a grace period of 3 days.
8. WHEN a `subscription.expired` webhook is received and verified, THE System SHALL downgrade the user to the `free` plan, update their entitlements immediately, and notify the user.
9. THE System SHALL implement idempotent webhook processing using the Cashfree event ID to prevent duplicate state transitions.
10. THE System SHALL expose the webhook endpoint at `POST /api/webhooks/cashfree` and raw body parsing MUST be available for signature verification.


---

### Requirement 5: Centralized Entitlement Service

**User Story:** As a backend engineer, I want a single entitlement service that all features query so that access logic is never duplicated across the codebase.

#### Acceptance Criteria

1. THE Entitlement_Service SHALL expose the following public methods: `canUseFeature(userId, featureKey)`, `getPlan(userId)`, `getLimit(userId, limitKey)`, `remainingCredits(userId)`, `remainingAutomation(userId, automationType)`, `remainingProfiles(userId)`, `remainingWorkspaces(userId)`, `remainingPosts(userId)`, `remainingKeywords(userId)`, `remainingFollowCampaigns(userId)`.
2. WHEN any entitlement method is called, THE Entitlement_Service SHALL read the subscription status from the database, never from JWT claims or session data alone.
3. IF the user's subscription status is `payment_failed` and the 3-day grace period has elapsed, THEN THE Entitlement_Service SHALL return `false` for all premium feature checks and treat limits as if the user is on the `free` plan.
4. THE Entitlement_Service SHALL apply add-on quantities on top of base plan limits when computing remaining quotas. FOR EXAMPLE, if a user has the `pro` plan and an add-on of `+1000 keyword trigger conversations`, the effective limit SHALL be 6000 (5000 + 1000).
5. WHEN `remainingCredits` is called, THE Entitlement_Service SHALL return `monthlyCredits + purchasedCredits + rolloverCredits - usedCredits` computed atomically from the `AICredits` document.
6. THE Entitlement_Service SHALL cache subscription and entitlement data in Redis with a 60-second TTL to reduce database load, and SHALL invalidate the cache immediately on any subscription status change.
7. THE Entitlement_Service SHALL be the only component in the codebase that reads from the `Subscription` and `AICredits` collections for access-control decisions.
8. FOR ALL limit keys where the plan value is -1 (enterprise unlimited), THE Entitlement_Service SHALL return `Infinity` for the remaining quota.


---

### Requirement 6: Entitlement Middleware Stack

**User Story:** As a backend engineer, I want a composable middleware stack so that any API route can be protected with the correct entitlement checks in a single line.

#### Acceptance Criteria

1. THE System SHALL implement the following middleware functions in `server/middleware/entitlement.middleware.ts`: `requireSubscription()`, `requireFeature(featureKey)`, `requireCredits(amount)`, `requireWorkspaceLimit()`, `requireAutomationLimit(automationType)`, `requireAnalyticsLimit(historyMonths)`, `requireRole(roleLevel)`, `requireAddon(addonType)`, `requirePlan(minimumPlan)`, `requireProfileLimit()`.
2. WHEN `requireSubscription()` is applied to a route, THE Middleware SHALL reject requests from users with subscription status `cancelled`, `expired`, or `payment_failed` (after grace period) with HTTP 402 and a JSON payload including `{ error, currentPlan, upgradeUrl, reason }`.
3. WHEN `requireFeature(featureKey)` is applied, THE Middleware SHALL call `Entitlement_Service.canUseFeature()`, and IF the check fails, SHALL return HTTP 403 with `{ error, featureKey, currentPlan, requiredPlan, upgradeReason }`.
4. WHEN `requireCredits(amount)` is applied, THE Middleware SHALL verify `remainingCredits >= amount` using an atomic read; IF insufficient, SHALL return HTTP 402 with `{ error, required, remaining, purchaseUrl }`.
5. WHEN `requireWorkspaceLimit()` is applied to `POST /api/workspaces`, THE Middleware SHALL count existing workspaces for the user and compare to `getLimit(userId, 'maxWorkspaces')`; IF at limit, SHALL return HTTP 403 with `{ error, currentCount, maxAllowed, currentPlan, upgradeReason }`.
6. WHEN `requireProfileLimit()` is applied to social profile connection routes, THE Middleware SHALL count existing profiles across all user workspaces and compare to `getLimit(userId, 'maxProfiles')`.
7. WHEN `requireAnalyticsLimit(historyMonths)` is applied, THE Middleware SHALL verify the requested analytics date range does not exceed `getLimit(userId, 'analyticsHistoryMonths')`.
8. WHEN `requireAutomationLimit(automationType)` is applied, THE Middleware SHALL check the remaining quota for the specified automation type (keywordConversations, aiConversations, followCampaignConversations, workflows, aiWorkflows, keywordTriggers).
9. ALL middleware functions SHALL call `next()` immediately if the authenticated user is on the `enterprise` plan, bypassing all numeric limit checks.
10. ALL middleware SHALL log the entitlement check result (allowed/denied) with userId, planId, featureKey or limitKey, and timestamp for audit purposes.


---

### Requirement 7: Route Guards for Premium API Endpoints

**User Story:** As a product owner, I want every premium feature's API route guarded by the entitlement middleware so that no backend access is possible without a valid entitlement.

#### Acceptance Criteria

1. THE System SHALL apply the following middleware chain to `POST /api/content/schedule`: `requireSubscription()` → `requireWorkspaceLimit()` → `requireProfileLimit()` → `requireFeature('scheduling')` → route handler.
2. THE System SHALL apply the following middleware chain to `POST /api/automation` and related automation creation routes: `requireSubscription()` → `requireAutomationLimit('workflows')` → `requireAutomationLimit('aiWorkflows')` → `requireAutomationLimit('keywordConversations')` → `requireFeature('automation')` → route handler.
3. THE System SHALL guard analytics date-range queries with `requireAnalyticsLimit(requestedMonths)` so that users cannot query beyond their plan's analytics history limit.
4. THE System SHALL guard social listening endpoints with `requireFeature('socialListening')` so that free plan users receive HTTP 403.
5. THE System SHALL guard VeeGPT endpoints with `requirePlan('creator')` for Full VeeGPT features and `requirePlan('pro')` for Advanced VeeGPT features.
6. THE System SHALL guard white-label report generation with `requireFeature('whiteLabelReports')`.
7. THE System SHALL guard team member invite endpoints with `requireAutomationLimit('teamMembers')`.
8. THE System SHALL guard API access endpoints with `requireFeature('apiAccess')` or `requireAddon('api_access')`.
9. THE System SHALL guard AI credit consumption endpoints with `requireCredits(cost)` before executing any AI operation.
10. THE System SHALL guard bulk scheduling with `requireFeature('bulkScheduling')` — available from `creator` plan and above only.
11. WHEN any guard returns a 403 response, THE response body SHALL include an `upgradeHint` object containing `{ reason, currentLimit, nextPlan, nextPlanLimit, upgradeUrl }` to power the frontend Upgrade_Dialog.


---

### Requirement 8: Add-On Management

**User Story:** As a user, I want to purchase add-ons to extend specific limits beyond my base plan so that I do not need to upgrade to a full higher plan.

#### Acceptance Criteria

1. THE System SHALL support the following add-ons with exact pricing from `Veefore_Subscription_Plans_v1.md`: Extra Workspace (₹299/month), Extra Team Member (₹199/month), Extra 10 Profiles (₹199/month), AI Credits 500 pack (₹299), AI Credits 2000 pack (₹899), AI Credits 5000 pack (₹1,999), +500 AI-Powered Conversations (₹299/month), +1,000 Keyword Trigger Conversations (₹299/month), +500 Follow Campaign Conversations (₹199/month), White-label Reports (₹499/month), API Access for Creator/Pro (₹999/month), Priority Support (₹499/month).
2. WHEN a user purchases a recurring add-on, THE System SHALL create a Cashfree subscription for the add-on, store it in the `AddOn` collection, and immediately update the computed limits in the Entitlement_Service cache.
3. WHEN a user purchases an AI Credits pack (one-time), THE System SHALL add the credits to `purchasedCredits` in the user's `AICredits` document atomically.
4. WHEN an add-on subscription is cancelled, THE System SHALL maintain the add-on until the end of its current billing period and then decrement the effective limit accordingly.
5. THE System SHALL prevent purchasing an add-on that contradicts the plan — for example, IF a free plan user attempts to purchase White-label Reports, THEN THE System SHALL return HTTP 403 with an explanation that this add-on requires the `business` plan or higher.
6. THE Entitlement_Service SHALL aggregate all active add-ons for a user when computing effective limits, ensuring add-on quantities are stacked additively on top of the base plan.
7. THE System SHALL expose `GET /api/subscription/addons` to list all active add-ons for the authenticated user with remaining quota for each.


---

### Requirement 9: AI Credits Lifecycle

**User Story:** As a user, I want my AI credits to be tracked accurately and reset monthly so that I always know my available AI capacity.

#### Acceptance Criteria

1. WHEN a subscription is activated or renewed, THE System SHALL set `monthlyCredits` to the plan's AI credit allocation and reset `remainingCredits` to `monthlyCredits + purchasedCredits + rolloverCredits`.
2. WHEN an AI feature is used, THE System SHALL atomically deduct the cost from `remainingCredits` using a MongoDB `findOneAndUpdate` with `$inc` to prevent race conditions.
3. IF `remainingCredits` would drop below zero after a deduction, THEN THE System SHALL reject the operation with HTTP 402 and SHALL NOT apply the deduction.
4. WHEN monthly credits are reset, THE System SHALL set `rolloverCredits = 0` (no rollover in the initial implementation), `monthlyCredits` to the plan allocation, and log the reset event.
5. WHERE a user has purchased AI credit add-on packs, THE System SHALL track them in `purchasedCredits` separately from `monthlyCredits`, and SHALL deduct from `monthlyCredits` first, then `purchasedCredits`.
6. THE System SHALL expose `GET /api/subscription/me` which includes `aiCredits: { remaining, monthly, purchased, nextResetAt }` in its response.
7. WHEN `remainingCredits` reaches 80% consumed (i.e., 20% remaining), THE Quota_Notifier SHALL send an in-app and email alert to the user.
8. WHEN `remainingCredits` reaches 90% consumed, THE Quota_Notifier SHALL send a second, more urgent alert.
9. WHEN `remainingCredits` reaches 0, THE Quota_Notifier SHALL send a final alert and block all AI operations that require credits.


---

### Requirement 10: Monthly Quota Resets (Cron Jobs)

**User Story:** As a system operator, I want automated cron jobs to reset monthly quotas and reconcile subscription states so that no manual intervention is required for routine billing operations.

#### Acceptance Criteria

1. THE System SHALL run a daily cron job that checks for subscriptions with `currentPeriodEnd` in the past and status `active`, and transitions them to `expired` if no renewal webhook has been received.
2. THE System SHALL run a monthly cron job that resets the following per-user counters on each user's billing anniversary: `aiCredits.remainingCredits` (to monthly plan allocation), `usedKeywordTriggerConversations`, `usedAiConversations`, `usedFollowCampaignConversations`, `usedScheduledPosts`.
3. THE System SHALL run a daily cron job that checks for `payment_failed` subscriptions where the grace period (3 days) has elapsed and downgrades them to `free` plan entitlements.
4. THE System SHALL run a daily cron job that reconciles subscription states against Cashfree's subscription API, correcting any discrepancies between the local database and Cashfree's records.
5. WHEN a monthly reset cron job runs, THE System SHALL log the reset for each user with: userId, plan, previous credit balance, new credit balance, reset timestamp.
6. THE System SHALL send a pre-renewal notification email 3 days before `nextBillingDate` for active paid subscriptions.
7. ALL cron jobs SHALL be implemented using BullMQ with a dedicated queue (`subscription-cron-queue`) to leverage the existing BullMQ infrastructure in the project.
8. IF a cron job fails for a specific user, THE System SHALL log the error and continue processing remaining users rather than stopping the entire batch.


---

### Requirement 11: Subscription Status API (Frontend Data Source)

**User Story:** As a frontend developer, I want a single API endpoint that returns the authenticated user's complete subscription state so that the UI can display accurate plan information without making access decisions itself.

#### Acceptance Criteria

1. THE System SHALL expose `GET /api/subscription/me` as an authenticated endpoint that returns the following structure: `{ plan, billingCycle, status, currentPeriodEnd, nextBillingDate, cancelAtPeriodEnd, limits: { maxWorkspaces, maxProfiles, maxTeamMembers, analyticsHistoryMonths, scheduledPostsPerMonth, aiCreditsPerMonth, workflowLimit, aiWorkflowLimit, keywordTriggerLimit, keywordTriggerConversationsPerMonth, aiConversationsPerMonth, followCampaignConversationsPerMonth, features: { socialListening, bulkScheduling, customDashboards, whiteLabelReports, apiAccess, approvalWorkflow, multiStepJourneys, veeGPTLevel } }, usage: { workspacesUsed, profilesUsed, teamMembersUsed, scheduledPostsThisCycle, keywordConversationsThisCycle, aiConversationsThisCycle, followCampaignConversationsThisCycle }, aiCredits: { remaining, monthly, purchased, nextResetAt }, addOns: [] }`.
2. THE System SHALL compute all `usage` fields by querying current counts from the respective collections and return them as part of the response.
3. THE Frontend SHALL use the `limits` and `usage` fields exclusively to render quota indicators — the frontend SHALL NOT hardcode any plan limits.
4. WHEN the `GET /api/subscription/me` response indicates a quota is near (usage ≥ 80% of limit), THE frontend SHALL render a warning indicator on the relevant feature.
5. WHEN the `GET /api/subscription/me` response includes `status: payment_failed`, THE frontend SHALL display a prominent payment failure banner with a link to update billing.
6. THE System SHALL cache the `GET /api/subscription/me` response in Redis for 30 seconds per user to reduce database load during high-traffic periods.


---

### Requirement 12: Upgrade Dialog and Frontend Entitlement Display

**User Story:** As a user, I want to see an informative upgrade prompt when I hit a limit so that I understand exactly why I am blocked and what I gain by upgrading.

#### Acceptance Criteria

1. WHEN the backend returns HTTP 403 with an `upgradeHint` payload, THE Frontend SHALL display an Upgrade_Dialog modal containing: the reason for blocking, the user's current limit on that dimension, the next plan that unlocks the feature or increases the limit, the benefit gained by upgrading, and a CTA button linking to the upgrade flow.
2. THE Upgrade_Dialog SHALL be driven entirely by the `upgradeHint` object from the server response and SHALL NOT contain any hardcoded plan values.
3. THE Frontend SHALL display real-time quota usage bars on the billing/subscription settings page, sourced from `GET /api/subscription/me`.
4. WHEN a user's usage crosses 80% of any quota, THE Frontend SHALL display a soft warning badge on the relevant sidebar navigation item.
5. THE Frontend billing settings page SHALL display the current plan, next renewal date, billing cycle, payment method (masked), active add-ons, and a one-click upgrade/downgrade option.
6. THE Frontend SHALL never block feature access based on frontend logic — it SHALL always rely on the backend 403 response to trigger the Upgrade_Dialog.


---

### Requirement 13: Quota Notifications

**User Story:** As a user, I want to receive timely notifications about my quota usage and billing events so that I am never surprised by a blocked action.

#### Acceptance Criteria

1. THE Quota_Notifier SHALL send an in-app notification and an email WHEN any of the following quota thresholds are crossed: 80% consumed (warning), 90% consumed (urgent), 100% consumed (blocked) — for AI credits, keyword trigger conversations, AI-powered conversations, and follow campaign conversations.
2. THE Quota_Notifier SHALL send a pre-renewal email notification 3 days before `nextBillingDate` for all active paid subscriptions, including the renewal amount and a link to manage billing.
3. WHEN a `payment.failed` webhook is processed, THE Quota_Notifier SHALL immediately send a payment failure notification with instructions to update the payment method and a link to the billing page.
4. WHEN a subscription is cancelled, THE Quota_Notifier SHALL send a cancellation confirmation email including the date when access reverts to the free plan.
5. WHEN AI credits are purchased (add-on pack), THE Quota_Notifier SHALL send a confirmation notification with the new credit balance.
6. THE Quota_Notifier SHALL use the existing email service infrastructure in the project and SHALL NOT introduce a new email provider.
7. THE Quota_Notifier SHALL record every notification sent in the database with: `notificationType`, `userId`, `sentAt`, `channel` (email/in-app), to prevent duplicate notifications for the same threshold crossing within the same billing cycle.


---

### Requirement 14: Admin Panel — Subscription Management

**User Story:** As an admin, I want full control over subscriptions, plans, credits, and add-ons through a dynamic admin panel so that I can manage any user's subscription without code changes.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide UI and corresponding API endpoints (`/api/admin/subscription/*`) to: view a user's current subscription status, plan, usage, and credits; manually set a user's plan; grant or revoke add-ons; add or deduct AI credits; force-cancel a subscription; extend a billing period; apply a coupon.
2. WHEN an admin manually sets a user's plan, THE System SHALL update the `Subscription` document, invalidate the user's entitlement cache, and log the change with admin user ID, previous plan, new plan, and timestamp.
3. THE Admin_Panel SHALL support granting lifetime subscriptions by setting `cancelAtPeriodEnd = false` and `currentPeriodEnd = null` for the specified user.
4. THE Admin_Panel SHALL display subscription history (all past plans, payments, events) and payment history for any user.
5. THE Admin_Panel SHALL support manual refund processing by calling the Cashfree refund API and updating the payment record status.
6. THE Admin_Panel SHALL allow enabling or disabling individual features per user as overrides, stored in the user's `Subscription` document under a `featureOverrides` map, which the Entitlement_Service checks before applying plan defaults.
7. ALL admin actions on subscriptions SHALL require admin authentication and SHALL be logged in the audit trail with the admin's user ID.
8. THE Admin_Panel SHALL dynamically reflect plan changes made in `server/config/plan-config.ts` without requiring UI code changes — plan names, limits, and features are read from the config at runtime.


---

### Requirement 15: Security and Atomicity

**User Story:** As a security engineer, I want all entitlement and billing operations to be secure, atomic, and tamper-proof so that no user can bypass their plan limits.

#### Acceptance Criteria

1. THE System SHALL never trust frontend or JWT claims alone for entitlement decisions — every access check SHALL verify subscription status from the database via the Entitlement_Service.
2. THE System SHALL use MongoDB atomic `$inc` and `findOneAndUpdate` operations with conditions (optimistic locking) for all credit deductions and quota increments to prevent race conditions.
3. THE System SHALL validate all subscription and billing request bodies using Zod schemas before processing.
4. THE Webhook_Verifier SHALL use constant-time comparison when validating Cashfree webhook signatures to prevent timing attacks.
5. THE System SHALL rate-limit the webhook endpoint (`POST /api/webhooks/cashfree`) to a maximum of 300 requests per minute using the existing rate-limiting infrastructure.
6. THE System SHALL validate that the `userId` in a subscription operation matches the authenticated user's ID — cross-user subscription manipulation SHALL be rejected with HTTP 403.
7. ALL Cashfree API calls from the server SHALL use the Cashfree secret key stored exclusively in environment variables, never hardcoded.
8. THE System SHALL sanitize and validate all admin override inputs to prevent injection of invalid plan identifiers or negative credit values.
9. WHEN deducting credits, IF the operation fails due to a concurrency conflict, THE System SHALL retry up to 3 times with exponential backoff before returning HTTP 409.


---

### Requirement 16: Analytics and Social Listening Entitlement

**User Story:** As a user, I want analytics history and social listening features gated by my plan so that I have a clear reason to upgrade for deeper data access.

#### Acceptance Criteria

1. WHEN a user requests analytics data, THE System SHALL enforce the following maximum history windows per plan: free = 30 days, creator = 365 days, pro = 730 days, business = 730 days, enterprise = unlimited.
2. WHEN a free plan user requests analytics data older than 30 days, THE System SHALL return HTTP 403 with `upgradeHint` pointing to the Creator plan.
3. WHEN a free plan user attempts to access any social listening endpoint, THE System SHALL return HTTP 403 since social listening is not available on the free plan.
4. THE System SHALL gate custom dashboard creation behind `requireFeature('customDashboards')`, available from the `pro` plan and above.
5. THE System SHALL gate analytics export formats: free = watermarked PDF only; creator and above = PDF, Excel, CSV, PowerPoint (without watermark).
6. WHEN a user on the creator plan attempts to access advanced social listening features (competitor mentions, sentiment analysis, trend detection), THE System SHALL return HTTP 403 since advanced social listening is available from `pro` plan only.
7. THE System SHALL gate white-label report generation with `requireFeature('whiteLabelReports')`, available only on the `business` plan and above, or via the White-label Reports add-on.


---

### Requirement 17: VeeGPT and AI Feature Entitlement

**User Story:** As a user, I want VeeGPT and AI features gated by my plan level so that advanced AI capabilities are a meaningful differentiator across plans.

#### Acceptance Criteria

1. THE System SHALL enforce three tiers of VeeGPT access: `basic` (free plan), `full` (creator plan and above), `advanced` (pro/business/enterprise plans).
2. WHEN a free plan user accesses VeeGPT, THE System SHALL restrict responses to Basic VeeGPT capabilities only and reject requests to full or advanced features with HTTP 403.
3. THE System SHALL gate AI Rewrite, AI Content Planning, AI Growth Recommendations, and AI Analytics Insights behind `requirePlan('pro')`.
4. THE System SHALL gate Multi-Step AI Journeys and Smart Logic Builder behind `requirePlan('pro')`.
5. WHEN any AI feature that consumes credits is used, THE System SHALL call `requireCredits(cost)` middleware BEFORE executing the AI operation.
6. THE System SHALL define a credit cost map in `plan-config.ts` that specifies the credit cost per AI operation type (e.g., caption generation = 1 credit, rewrite = 2 credits, VeeGPT message = 1 credit).
7. THE System SHALL gate AI Business Insights behind `requirePlan('business')`.


---

### Requirement 18: Architecture and Code Quality Standards

**User Story:** As a tech lead, I want the subscription system built with clean architecture, strong typing, and testable design so that it remains maintainable as the business scales.

#### Acceptance Criteria

1. THE System SHALL place all subscription business logic in service classes under `server/features/subscription/services/`, with controllers in `server/features/subscription/controllers/` and routes in `server/features/subscription/routes/`.
2. THE System SHALL use strong TypeScript interfaces for all plan config objects, subscription documents, entitlement responses, and middleware request extensions.
3. THE System SHALL define Zod validation schemas for all incoming API request bodies related to subscription operations.
4. THE System SHALL include unit tests for the Entitlement_Service covering: `canUseFeature` for all five plans and all feature keys, `remainingCredits` after deductions, `getLimit` with add-ons applied, grace period logic for `payment_failed` status.
5. THE System SHALL include unit tests for the Webhook_Verifier covering: valid signature acceptance, invalid signature rejection, and idempotent event processing.
6. THE plan config in `server/config/plan-config.ts` SHALL be the only file containing plan numeric values — no other file SHALL hardcode plan limits, credit allocations, or pricing.
7. THE System SHALL use the existing logger (`server/config/logger.ts`) for all subscription system log output, with structured log fields: `module: 'subscription'`, `userId`, `action`, `result`.
8. THE System SHALL follow the existing feature folder structure (`server/features/`) consistent with the analytics feature module already present in the codebase.

