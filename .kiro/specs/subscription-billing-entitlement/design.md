# Design Document: Subscription, Billing & Entitlement System

## Overview

The Subscription, Billing & Entitlement System replaces Veefore's scattered entitlement logic with a single source of truth: `server/config/plan-config.ts`. All plan capabilities, quota enforcement, credit management, and billing lifecycle operations flow through a centralized `EntitlementService`. The payment gateway is exclusively Cashfree.

The system spans:
- **Plan Config** — single versioned file defining all five plans and add-ons
- **MongoDB collections** — Subscription, AICredits, AddOn, SubscriptionEvent
- **EntitlementService** — Redis-cached, atomic quota authority
- **Middleware stack** — composable Express guards for all premium routes
- **Cashfree integration** — subscription lifecycle + HMAC-verified webhooks
- **BullMQ cron jobs** — automated quota resets, expiry checks, reconciliation
- **REST API** — billing CRUD, status endpoint, admin panel routes

The feature lives entirely under `server/features/subscription/` following the analytics module convention.

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Express Routes                        │
│   /api/subscription/*   /api/webhooks/cashfree   /api/admin/ │
└────────────┬────────────────────────┬──────────────────────-─┘
             │                        │
     ┌───────▼──────────┐    ┌────────▼─────────┐
     │ Entitlement       │    │ Webhook Verifier  │
     │ Middleware Stack  │    │ (HMAC-SHA256)     │
     └───────┬──────────┘    └────────┬──────────┘
             │                        │
     ┌───────▼────────────────────────▼──────────┐
     │              EntitlementService             │
     │   canUseFeature | getLimit | remainingCredits│
     └──────┬──────────────────┬──────────────────┘
            │                  │
    ┌───────▼──────┐   ┌───────▼──────┐
    │  Redis Cache  │   │  MongoDB      │
    │  (60s TTL)    │   │  Subscription │
    │               │   │  AICredits    │
    └───────────────┘   │  AddOn        │
                        │  SubEvent     │
                        └──────────────┘
            │
    ┌───────▼──────────────┐
    │   BullMQ Workers      │
    │  subscription-cron-q  │
    │  - daily expiry check │
    │  - monthly reset      │
    │  - reconciliation     │
    └──────────────────────┘
```

### Folder Structure

```
server/
├── config/
│   └── plan-config.ts                    # Single source of truth for all plan values
│
├── features/
│   └── subscription/
│       ├── index.ts                      # Public exports
│       ├── db/
│       │   ├── models/
│       │   │   ├── SubscriptionModel.ts
│       │   │   ├── AICreditsModel.ts
│       │   │   ├── AddOnModel.ts
│       │   │   └── SubscriptionEventModel.ts
│       │   └── repositories/
│       │       ├── SubscriptionRepository.ts
│       │       └── AICreditsRepository.ts
│       ├── services/
│       │   ├── EntitlementService.ts     # Core authority for all access decisions
│       │   ├── CashfreeService.ts        # Cashfree API client wrapper
│       │   ├── WebhookVerifier.ts        # HMAC-SHA256 verification
│       │   ├── QuotaNotifier.ts          # 80/90/100% threshold alerts
│       │   └── AddOnService.ts           # Add-on lifecycle management
│       ├── controllers/
│       │   ├── subscription.controller.ts
│       │   ├── webhook.controller.ts
│       │   └── admin.controller.ts
│       └── routes/
│           ├── subscription.routes.ts
│           ├── webhook.routes.ts
│           └── admin.routes.ts
│
├── middleware/
│   └── entitlement.middleware.ts         # requireSubscription, requireFeature, etc.
│
├── queues/
│   └── subscriptionCronQueue.ts          # BullMQ queue definition
│
└── workers/
    └── subscriptionCronWorker.ts         # Cron job processor
```

---

## Components and Interfaces

### Plan Config (`server/config/plan-config.ts`)

The single source of truth. No other file may contain plan numeric values.

```typescript
export type PlanId = 'free' | 'creator' | 'pro' | 'business' | 'enterprise';
export type VeeGPTTier = 'basic' | 'full' | 'advanced';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanLimits {
  maxWorkspaces: number;           // -1 = unlimited
  maxProfiles: number;
  maxTeamMembers: number;
  scheduledPostsPerMonth: number;
  analyticsHistoryDays: number;
  aiCreditsPerMonth: number;
  workflowLimit: number;
  aiWorkflowLimit: number;
  keywordTriggerLimit: number;
  keywordTriggerConversationsPerMonth: number;
  aiConversationsPerMonth: number;
  followCampaignConversationsPerMonth: number;
}

export interface PlanFeatures {
  bulkScheduling: boolean;
  customDashboards: boolean;
  advancedReports: boolean;
  whiteLabelReports: boolean;
  clientReporting: boolean;
  apiAccess: boolean;
  approvalWorkflow: boolean;
  multiStepJourneys: boolean;
  smartLogicBuilder: boolean;
  socialListening: boolean;
  advancedSocialListening: boolean;
  sso: boolean;
  veeGPTLevel: VeeGPTTier;
  analyticsExport: 'watermarked_pdf' | 'full';
}

export interface PlanPricing {
  monthly: number;   // INR paise
  yearly: number;    // INR paise
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  features: PlanFeatures;
}

export interface AddOnDefinition {
  type: AddOnType;
  name: string;
  priceMonthly: number | null;  // null = one-time
  priceOneTime: number | null;
  quantityIncrement: number;
  limitKey: keyof PlanLimits | 'purchasedCredits';
  requiredMinPlan?: PlanId;
}

export type AddOnType =
  | 'extra_workspace' | 'extra_team_member' | 'extra_profiles'
  | 'ai_credits_500' | 'ai_credits_2000' | 'ai_credits_5000'
  | 'ai_conversations_500' | 'keyword_conversations_1000'
  | 'follow_campaign_500' | 'white_label_reports'
  | 'api_access' | 'priority_support';

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = { /* ... see plan values ... */ };
export const ADDON_CONFIG: Record<AddOnType, AddOnDefinition> = { /* ... */ };

export interface CreditCostMap {
  captionGeneration: number;
  hashtagGeneration: number;
  bannerGeneration: number;
  aiRewrite: number;
  veeGPTMessage: number;
  aiGrowthRecommendation: number;
  aiContentPlan: number;
  aiAnalyticsInsight: number;
  aiBusinessInsight: number;
}

export const CREDIT_COSTS: CreditCostMap = {
  captionGeneration: 1,
  hashtagGeneration: 1,
  bannerGeneration: 2,
  aiRewrite: 2,
  veeGPTMessage: 1,
  aiGrowthRecommendation: 3,
  aiContentPlan: 3,
  aiAnalyticsInsight: 2,
  aiBusinessInsight: 3,
};

export function getPlanConfig(planId: string): PlanConfig | null { /* ... */ }
export function getPlanOrder(planId: PlanId): number { /* free=0, creator=1, pro=2, business=3, enterprise=4 */ }
export function isValidPlan(id: string): id is PlanId { /* ... */ }
```

### EntitlementService

The only component that reads `Subscription` and `AICredits` for access-control decisions.

```typescript
export interface EffectiveLimits {
  maxWorkspaces: number;
  maxProfiles: number;
  maxTeamMembers: number;
  scheduledPostsPerMonth: number;
  analyticsHistoryDays: number;
  aiCreditsPerMonth: number;
  workflowLimit: number;
  aiWorkflowLimit: number;
  keywordTriggerLimit: number;
  keywordTriggerConversationsPerMonth: number;
  aiConversationsPerMonth: number;
  followCampaignConversationsPerMonth: number;
  features: PlanFeatures;
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  currentPlan: PlanId;
  requiredPlan?: PlanId;
  upgradeHint?: UpgradeHint;
}

export interface UpgradeHint {
  reason: string;
  currentLimit: number | string;
  nextPlan: PlanId;
  nextPlanLimit: number | string;
  upgradeUrl: string;
}

export class EntitlementService {
  constructor(private redis: Redis, private subscriptionRepo: SubscriptionRepository) {}

  async getPlan(userId: string): Promise<PlanId>
  async getEffectiveLimits(userId: string): Promise<EffectiveLimits>
  async getLimit(userId: string, limitKey: keyof PlanLimits): Promise<number>
  async canUseFeature(userId: string, featureKey: keyof PlanFeatures): Promise<EntitlementResult>
  async remainingCredits(userId: string): Promise<number>
  async remainingAutomation(userId: string, type: AutomationType): Promise<number>
  async remainingProfiles(userId: string): Promise<number>
  async remainingWorkspaces(userId: string): Promise<number>
  async remainingPosts(userId: string): Promise<number>
  async remainingKeywords(userId: string): Promise<number>
  async remainingFollowCampaigns(userId: string): Promise<number>
  async deductCredits(userId: string, amount: number): Promise<DeductResult>
  async invalidateCache(userId: string): Promise<void>

  // Cache key: sub:entitlement:{userId}  TTL: 60s
  private async getCached(userId: string): Promise<EffectiveLimits | null>
  private async setCached(userId: string, data: EffectiveLimits): Promise<void>
}
```

**Redis cache strategy:**
- Key: `sub:entitlement:{userId}`, TTL 60 seconds
- Cache stores `EffectiveLimits` (plan limits + active add-ons merged)
- Cache is invalidated immediately on any subscription or add-on change
- On cache miss, reads `Subscription` + `AddOn` documents and recomputes

### Entitlement Middleware Stack (`server/middleware/entitlement.middleware.ts`)

```typescript
// All middleware calls entitlementService from a shared singleton

export const requireSubscription = () => MiddlewareFunction
// Rejects cancelled/expired/payment_failed (after grace) with HTTP 402
// Response: { error, currentPlan, upgradeUrl, reason }

export const requireFeature = (featureKey: keyof PlanFeatures) => MiddlewareFunction
// Calls canUseFeature(); HTTP 403 with { error, featureKey, currentPlan, requiredPlan, upgradeHint }

export const requireCredits = (amount: number) => MiddlewareFunction
// Checks remainingCredits >= amount (atomic read); HTTP 402 with { error, required, remaining, purchaseUrl }

export const requireWorkspaceLimit = () => MiddlewareFunction
// Compares existing workspace count vs getLimit(userId, 'maxWorkspaces')
// HTTP 403 with { error, currentCount, maxAllowed, currentPlan, upgradeHint }

export const requireProfileLimit = () => MiddlewareFunction
// Compares existing profiles vs getLimit(userId, 'maxProfiles')

export const requireAnalyticsLimit = (requestedDays: number) => MiddlewareFunction
// Verifies requestedDays <= getLimit(userId, 'analyticsHistoryDays')

export const requireAutomationLimit = (type: AutomationType) => MiddlewareFunction
// Checks remainingAutomation(userId, type) > 0

export const requireRole = (roleLevel: RoleLevel) => MiddlewareFunction
// Verifies user role meets minimum level within workspace

export const requireAddon = (addonType: AddOnType) => MiddlewareFunction
// Verifies user has an active add-on of specified type

export const requirePlan = (minimumPlan: PlanId) => MiddlewareFunction
// Verifies getPlanOrder(userPlan) >= getPlanOrder(minimumPlan)
```

**Enterprise bypass:** All middleware functions call `next()` immediately for enterprise users without checking numeric limits — only `requireFeature` for features that enterprise explicitly gates (none currently) applies.

**Audit logging:** Every check logs `{ module: 'subscription', userId, action: 'entitlement_check', featureKey/limitKey, result: 'allowed'|'denied', planId, timestamp }` using the existing `logger`.

### Cashfree Service (`services/CashfreeService.ts`)

```typescript
export class CashfreeService {
  private readonly baseUrl: string;   // from CASHFREE_BASE_URL env
  private readonly clientId: string;  // from CASHFREE_CLIENT_ID env
  private readonly clientSecret: string; // from CASHFREE_CLIENT_SECRET env

  async createCustomer(userId: string, email: string, phone: string): Promise<CashfreeCustomer>
  async createSubscription(params: CreateSubscriptionParams): Promise<CashfreeSubscription>
  async cancelSubscription(cashfreeSubscriptionId: string): Promise<void>
  async getSubscription(cashfreeSubscriptionId: string): Promise<CashfreeSubscription>
  async createRefund(paymentId: string, amount: number, reason: string): Promise<CashfreeRefund>
  async listSubscriptions(customerId: string): Promise<CashfreeSubscription[]>
}
```

All secrets loaded exclusively from `process.env`. If Cashfree API call fails, log full request/response context and throw — the subscription status in MongoDB is never updated on API failure.

### Webhook Verifier (`services/WebhookVerifier.ts`)

```typescript
export class WebhookVerifier {
  verify(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signatureHeader, 'hex')
    );
  }
}
```

The webhook route MUST use `express.raw({ type: 'application/json' })` to preserve the raw body for signature verification. The route is mounted **before** `express.json()` is applied to that path.

**Idempotency:** After signature verification, the event ID (`cashfree_event_id`) is checked against processed event IDs stored in Redis with a 24-hour TTL key `sub:webhook:processed:{eventId}`. If already processed, returns HTTP 200 immediately without re-processing.

### QuotaNotifier (`services/QuotaNotifier.ts`)

```typescript
export class QuotaNotifier {
  async checkAndNotify(userId: string, quotaType: QuotaType, used: number, limit: number): Promise<void>
  async sendPreRenewalNotification(subscription: SubscriptionDocument): Promise<void>
  async sendPaymentFailedNotification(userId: string): Promise<void>
  async sendCancellationConfirmation(userId: string, accessEndsAt: Date): Promise<void>
  async sendCreditPurchaseConfirmation(userId: string, creditsAdded: number, newBalance: number): Promise<void>
}
```

Uses existing email infrastructure (`server/email-service.ts` + `@sendgrid/mail`). Deduplication: before sending, checks Redis key `sub:notification:{userId}:{quotaType}:{threshold}:{billingCycleStart}`. If key exists, skip. On send, set key with TTL until end of billing cycle.

### BullMQ Queue & Worker

**Queue definition** (`server/queues/subscriptionCronQueue.ts`):

```typescript
import { Queue } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

export type CronJobType =
  | 'daily_expiry_check'
  | 'grace_period_check'
  | 'reconciliation'
  | 'monthly_quota_reset'
  | 'pre_renewal_notifications';

export interface SubscriptionCronJobData {
  type: CronJobType;
  triggeredAt: string;
}

export const subscriptionCronQueue = new Queue<SubscriptionCronJobData>(
  'subscription-cron-queue',
  { connection: getSharedRedisConnection() }
);
```

**Scheduled cron jobs** (added on server startup):

| Job | BullMQ cron | Description |
|-----|-------------|-------------|
| `daily_expiry_check` | `0 2 * * *` | Mark subscriptions past `currentPeriodEnd` as expired |
| `grace_period_check` | `0 3 * * *` | Downgrade payment_failed after 3-day grace period |
| `reconciliation` | `0 4 * * *` | Reconcile local state vs Cashfree subscription API |
| `monthly_quota_reset` | `0 1 * * *` | Reset per-user counters on billing anniversary |
| `pre_renewal_notifications` | `0 9 * * *` | Email users whose `nextBillingDate` is 3 days away |

**Worker** (`server/workers/subscriptionCronWorker.ts`):

Each job handler processes users in batches. If a single user's processing fails, it logs the error and continues the batch (requirement 10.8). The worker is initialized using `getSubscriptionCronWorker()` lazy-init pattern matching the existing `getResearchWorker()` pattern.

### API Route Map

**Subscription routes** (authenticated):

| Method | Path | Middleware chain |
|--------|------|-----------------|
| `POST` | `/api/subscription/create` | `requireAuth` |
| `POST` | `/api/subscription/upgrade` | `requireAuth` |
| `POST` | `/api/subscription/downgrade` | `requireAuth` |
| `POST` | `/api/subscription/cancel` | `requireAuth` |
| `POST` | `/api/subscription/resume` | `requireAuth` |
| `GET`  | `/api/subscription/me` | `requireAuth` |
| `POST` | `/api/subscription/addon/add` | `requireAuth` |
| `POST` | `/api/subscription/addon/remove` | `requireAuth` |
| `GET`  | `/api/subscription/addons` | `requireAuth` |

**Webhook route** (public, rate-limited):

| Method | Path | Middleware |
|--------|------|-----------|
| `POST` | `/api/webhooks/cashfree` | `cashfreeRateLimiter(300/min)`, `express.raw()` |

**Admin routes** (admin auth required):

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/subscription/user/:userId` | View user subscription state |
| `POST` | `/api/admin/subscription/user/:userId/plan` | Manually set plan |
| `POST` | `/api/admin/subscription/user/:userId/credits` | Add/deduct credits |
| `POST` | `/api/admin/subscription/user/:userId/addon` | Grant/revoke add-on |
| `POST` | `/api/admin/subscription/user/:userId/cancel` | Force cancel |
| `POST` | `/api/admin/subscription/user/:userId/extend` | Extend billing period |
| `POST` | `/api/admin/subscription/user/:userId/coupon` | Apply coupon |
| `GET`  | `/api/admin/subscription/user/:userId/history` | Subscription + payment history |
| `POST` | `/api/admin/subscription/user/:userId/refund` | Process refund |
| `POST` | `/api/admin/subscription/user/:userId/override` | Feature override |

### Frontend Hook Pattern

The frontend reads all subscription state from `GET /api/subscription/me`. The hook never makes access decisions.

```typescript
// client/src/hooks/useSubscription.ts
export function useSubscription() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['subscription', 'me'],
    queryFn: () => api.get('/api/subscription/me'),
    staleTime: 30_000,  // matches server-side 30s Redis cache
  });

  return {
    plan: data?.plan,
    status: data?.status,
    limits: data?.limits,
    usage: data?.usage,
    aiCredits: data?.aiCredits,
    addOns: data?.addOns,
    isLoading,
    // Upgrade dialog is triggered by backend 403 response's upgradeHint,
    // NOT by frontend logic comparing plan values.
  };
}
```

The `upgradeHint` in every 403 response powers the `UpgradeDialog` modal. The frontend never hardcodes plan values — it renders whatever the server returns in `upgradeHint.{reason, currentLimit, nextPlan, nextPlanLimit, upgradeUrl}`.

---

## Data Models

### Subscription Collection

```typescript
// server/features/subscription/db/models/SubscriptionModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  subscriptionId: string;       // UUID
  userId: string;
  workspaceId: string;
  plan: PlanId;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;   // active|trial|cancelled|expired|payment_failed|started
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingDate: Date;
  cancelAtPeriodEnd: boolean;
  cashfreeSubscriptionId: string | null;
  cashfreeCustomerId: string | null;
  featureOverrides: Record<string, boolean>;  // admin overrides
  gracePeriodEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  subscriptionId: { type: String, required: true, unique: true, default: () => uuidv4() },
  userId:         { type: String, required: true },
  workspaceId:    { type: String, required: true },
  plan:           { type: String, enum: ['free','creator','pro','business','enterprise'], required: true },
  billingCycle:   { type: String, enum: ['monthly','yearly'], required: true },
  status:         { type: String, enum: ['active','trial','cancelled','expired','payment_failed','started'], required: true },
  currentPeriodStart: Date,
  currentPeriodEnd:   Date,
  nextBillingDate:    Date,
  cancelAtPeriodEnd:  { type: Boolean, default: false },
  cashfreeSubscriptionId: String,
  cashfreeCustomerId: String,
  featureOverrides: { type: Map, of: Boolean, default: {} },
  gracePeriodEndsAt: Date,
}, { timestamps: true });

// Indexes (Requirement 2.8)
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ nextBillingDate: 1 });
SubscriptionSchema.index({ userId: 1, status: 1 });
```

### AICredits Collection

```typescript
export interface IAICredits extends Document {
  userId: string;
  remainingCredits: number;
  monthlyCredits: number;        // base plan allocation, reset monthly
  purchasedCredits: number;      // from one-time add-on packs
  rolloverCredits: number;       // future feature, initially 0
  usedThisCycle: number;         // for quota notification thresholds
  lastResetAt: Date;
  nextResetAt: Date;
}

const AICreditsSchema = new Schema<IAICredits>({
  userId:           { type: String, required: true, unique: true },
  remainingCredits: { type: Number, required: true, min: 0, default: 0 },
  monthlyCredits:   { type: Number, required: true, min: 0, default: 0 },
  purchasedCredits: { type: Number, required: true, min: 0, default: 0 },
  rolloverCredits:  { type: Number, required: true, min: 0, default: 0 },
  usedThisCycle:    { type: Number, required: true, min: 0, default: 0 },
  lastResetAt:      { type: Date, required: true },
  nextResetAt:      { type: Date, required: true },
}, { timestamps: true });

AICreditsSchema.index({ userId: 1 }, { unique: true });
AICreditsSchema.index({ nextResetAt: 1 });
```

**Atomic deduction** (Requirement 9.2 / 15.2):

```typescript
// AICreditsRepository.ts — atomic credit deduction with retry
async deductCredits(userId: string, amount: number, maxRetries = 3): Promise<DeductResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await AICreditsModel.findOneAndUpdate(
      { userId, remainingCredits: { $gte: amount } },
      {
        $inc: { remainingCredits: -amount, usedThisCycle: amount },
        // Deduct monthly first: handled by application logic computing split
      },
      { new: true }
    );
    if (result) return { success: true, remaining: result.remainingCredits };
    // Check if it was a concurrency conflict vs genuinely insufficient credits
    const doc = await AICreditsModel.findOne({ userId });
    if (!doc || doc.remainingCredits < amount) {
      return { success: false, reason: 'insufficient_credits', remaining: doc?.remainingCredits ?? 0 };
    }
    // Concurrency conflict — exponential backoff
    await sleep(Math.pow(2, attempt) * 50);
  }
  throw new Error('CONCURRENCY_CONFLICT'); // HTTP 409 to caller
}
```

### AddOn Collection

```typescript
export interface IAddOn extends Document {
  addOnId: string;
  userId: string;
  type: AddOnType;
  quantity: number;
  status: 'active' | 'cancelled';
  cashfreeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;    // null for one-time purchases
  createdAt: Date;
  updatedAt: Date;
}

const AddOnSchema = new Schema<IAddOn>({
  addOnId:   { type: String, required: true, unique: true, default: () => uuidv4() },
  userId:    { type: String, required: true },
  type:      { type: String, enum: ADDON_TYPES, required: true },
  quantity:  { type: Number, required: true, min: 1 },
  status:    { type: String, enum: ['active', 'cancelled'], default: 'active' },
  cashfreeSubscriptionId: String,
  currentPeriodEnd: Date,
}, { timestamps: true });

AddOnSchema.index({ userId: 1, status: 1 });
```

### SubscriptionEvent Collection (Audit Log)

```typescript
export interface ISubscriptionEvent extends Document {
  eventType: string;
  userId: string;
  subscriptionId: string;
  previousStatus: SubscriptionStatus | null;
  newStatus: SubscriptionStatus | null;
  previousPlan: PlanId | null;
  newPlan: PlanId | null;
  triggeredBy: 'webhook' | 'admin' | 'user' | 'cron';
  adminUserId?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

const SubscriptionEventSchema = new Schema<ISubscriptionEvent>({
  eventType:      { type: String, required: true },
  userId:         { type: String, required: true },
  subscriptionId: { type: String, required: true },
  previousStatus: String,
  newStatus:      String,
  previousPlan:   String,
  newPlan:        String,
  triggeredBy:    { type: String, enum: ['webhook', 'admin', 'user', 'cron'], required: true },
  adminUserId:    String,
  metadata:       { type: Schema.Types.Mixed, default: {} },
  timestamp:      { type: Date, default: Date.now },
});

SubscriptionEventSchema.index({ userId: 1, timestamp: -1 });
SubscriptionEventSchema.index({ subscriptionId: 1 });
```

### `/api/subscription/me` Response Shape

```typescript
export interface SubscriptionMeResponse {
  plan: PlanId;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
  limits: EffectiveLimits;
  usage: {
    workspacesUsed: number;
    profilesUsed: number;
    teamMembersUsed: number;
    scheduledPostsThisCycle: number;
    keywordConversationsThisCycle: number;
    aiConversationsThisCycle: number;
    followCampaignConversationsThisCycle: number;
  };
  aiCredits: {
    remaining: number;
    monthly: number;
    purchased: number;
    nextResetAt: string;
  };
  addOns: ActiveAddOnView[];
}
```

---

## Data Flow Diagrams

### Subscription Creation Flow

```
Client                  API Server              Cashfree         MongoDB
  │                         │                      │                │
  ├─POST /subscription/─────►│                      │                │
  │    create               │                      │                │
  │                         ├─validate Zod schema  │                │
  │                         ├─requireAuth()        │                │
  │                         │                      │                │
  │                         ├─createCustomer()─────►│                │
  │                         │◄────── customerId ───┤                │
  │                         │                      │                │
  │                         ├─createSubscription()─►│                │
  │                         │◄─ cashfree sub ID ───┤                │
  │                         │                      │                │
  │                         ├─── upsert Subscription doc ──────────►│
  │                         │    (status: started)                  │
  │                         │                      │                │
  │◄── { checkoutUrl } ─────┤                      │                │
  │                         │                      │                │
  │    [user pays]          │                      │                │
  │                         │                      │                │
  │              POST /webhooks/cashfree            │                │
  │◄────────────────────────┤◄─ subscription.activated ────────────┤
  │                         ├─verify HMAC sig       │                │
  │                         ├─check idempotency     │                │
  │                         ├─update status: active ───────────────►│
  │                         ├─allocate AI credits ──────────────────►│
  │                         ├─invalidate Redis cache│                │
  │                         ├─record SubscriptionEvent ────────────►│
  │                         ├─send activation email │                │
```

### Credit Deduction Flow

```
Route Handler           requireCredits(cost)     AICreditsRepo       Redis
     │                        │                       │                │
     ├────────────────────────►│                       │                │
     │                        ├─ getCached(userId) ───────────────────►│
     │                        │◄─ EffectiveLimits ────────────────────┤
     │                        │   (or DB fetch on miss)               │
     │                        ├─ if remaining >= cost → next()        │
     │                        │  else HTTP 402                        │
     ▼ route handler executes │                       │                │
     ├─ deductCredits(cost) ──────────────────────────►│                │
     │                        │  findOneAndUpdate     │                │
     │                        │  { $gte: cost }       │                │
     │                        │  { $inc: -cost }      │                │
     │                        │◄── success / retry ───┤                │
     │                        │                       │                │
     │                        ├─ check 80/90/100% ────►│                │
     │                        │   thresholds          │                │
     │                        ├─ notify if threshold crossed           │
```

### Webhook Processing Flow

```
Cashfree Webhook         POST /api/webhooks/cashfree
                                   │
                        ┌──────────▼──────────────┐
                        │ cashfreeRateLimiter       │
                        │ 300 req/min               │
                        └──────────┬──────────────-─┘
                                   │
                        ┌──────────▼──────────────┐
                        │ WebhookVerifier.verify()  │
                        │ timingSafeEqual HMAC-256  │
                        │ → 401 if invalid          │
                        └──────────┬───────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │ Idempotency check        │
                        │ Redis: sub:webhook:{id}  │
                        │ → 200 if already seen    │
                        └──────────┬───────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │ Event router             │
                        │ subscription.activated   │
                        │ subscription.renewed     │
                        │ subscription.cancelled   │
                        │ subscription.expired     │
                        │ payment.success          │
                        │ payment.failed           │
                        │ refund.processed         │
                        └──────────┬───────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │ Update MongoDB           │
                        │ Invalidate Redis cache   │
                        │ Record SubscriptionEvent │
                        │ Trigger notifications    │
                        └─────────────────────────┘
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unknown plan identifiers are always rejected

*For any* string that is not one of the five known plan identifiers (`free`, `creator`, `pro`, `business`, `enterprise`), calling `getPlanConfig(id)` SHALL return `null` and the `EntitlementService` SHALL reject the request.

**Validates: Requirements 1.8**

---

### Property 2: Missing subscription defaults to free plan

*For any* user ID that has no Subscription document in MongoDB, every call to `EntitlementService.getPlan(userId)` SHALL return `'free'`, and every limit returned by `EntitlementService.getLimit(userId, key)` SHALL equal the free-plan value from `plan-config.ts`.

**Validates: Requirements 2.7**

---

### Property 3: Add-on limits stack additively on base plan

*For any* plan and any non-empty list of active add-ons, `EntitlementService.getLimit(userId, limitKey)` SHALL return a value equal to the base plan's limit for that key plus the sum of all add-on quantity increments for that limit key. The result is always ≥ the base plan limit.

**Validates: Requirements 5.4, 8.6**

---

### Property 4: Enterprise plan always returns Infinity for numeric limits

*For any* limit key defined in `PlanLimits`, `EntitlementService.getLimit(userId, limitKey)` for an enterprise user SHALL return `Infinity` (or a sentinel value representing unlimited), never a finite number.

**Validates: Requirements 5.8, 6.9**

---

### Property 5: Remaining credits formula is always correct

*For any* `AICredits` document with valid non-negative values for `monthlyCredits`, `purchasedCredits`, `rolloverCredits`, and `usedThisCycle`, `EntitlementService.remainingCredits(userId)` SHALL return exactly `monthlyCredits + purchasedCredits + rolloverCredits - usedThisCycle`.

**Validates: Requirements 5.5, 9.1**

---

### Property 6: Credit deduction never produces negative balance

*For any* credit deduction of amount `N` where `remainingCredits < N`, the deduction SHALL be rejected and the `remainingCredits` value in the database SHALL remain unchanged. The deduction result SHALL indicate failure.

**Validates: Requirements 9.3**

---

### Property 7: Credit deduction decrements by exactly the requested amount

*For any* `AICredits` document with `remainingCredits >= N`, atomically deducting `N` credits SHALL result in `remainingCredits` decreasing by exactly `N` — no more, no less.

**Validates: Requirements 9.2**

---

### Property 8: Webhook HMAC verification is a pure gate

*For any* raw webhook payload and any secret, `WebhookVerifier.verify(payload, correctSignature, secret)` SHALL return `true`, and `WebhookVerifier.verify(payload, anyOtherSignature, secret)` SHALL return `false`. Furthermore, for any modification to the payload bytes, the original signature SHALL no longer verify.

**Validates: Requirements 4.1, 4.2, 15.4**

---

### Property 9: Webhook processing is idempotent

*For any* valid webhook event, processing it a second time (same event ID) SHALL produce the same final database state as processing it exactly once. The `SubscriptionEvent` audit log SHALL contain exactly one record for that event ID regardless of how many times it was received.

**Validates: Requirements 4.9**

---

### Property 10: Subscription status changes always produce an audit event

*For any* transition from a previous subscription status to a new subscription status, the system SHALL record exactly one `SubscriptionEvent` document with the correct `previousStatus`, `newStatus`, and `triggeredBy` fields.

**Validates: Requirements 2.5**

---

### Property 11: Analytics history enforcement is monotone with plan tier

*For any* plan and *for any* requested analytics history window in days, the request is allowed if and only if `requestedDays <= plan.limits.analyticsHistoryDays`. Equivalently, for any two plans where plan A has a larger `analyticsHistoryDays` than plan B, plan A permits all date ranges that plan B permits, plus additional ranges.

**Validates: Requirements 16.1, 7.3**

---

### Property 12: Payment-failed users after grace period are treated as free plan

*For any* user with subscription status `payment_failed` and `gracePeriodEndsAt` in the past, *for any* feature key, `EntitlementService.canUseFeature(userId, featureKey)` SHALL return the same result as it would for a user on the free plan.

**Validates: Requirements 5.3, 4.7**

---

### Property 13: VeeGPT tier access follows plan hierarchy

*For any* plan and *for any* requested VeeGPT capability tier, access is granted if and only if the plan's `veeGPTLevel` is at or above the requested tier in the hierarchy `basic < full < advanced`. No plan grants access to a tier above its own level.

**Validates: Requirements 17.1, 17.2**

---

## Error Handling

### Cashfree API Failures
- Log full request/response context with `logger.error` including `module: 'subscription'`
- Return appropriate HTTP error to client (502 for gateway failures)
- Never partially update subscription state — database writes only happen after successful API response

### Webhook Signature Failure
- Reject with HTTP 401
- Log source IP and first 50 bytes of raw payload (not full body for security)
- Increment a Redis counter `sub:webhook:rejected:{date}` for monitoring

### Credit Concurrency Conflict
- Retry up to 3 times with exponential backoff (50ms, 100ms, 200ms)
- If all retries exhausted, return HTTP 409 `{ error: 'CONCURRENT_OPERATION', message: 'Please retry your request' }`

### Entitlement Cache Miss
- Fall through to database read transparently
- Log a `debug` level message if cache miss rate exceeds expected levels
- Never serve stale data: always set fresh TTL on write

### Unknown Plan Identifier
- `getPlanConfig` returns `null`
- EntitlementService treats as free plan with a warning log
- POST endpoints receiving an unknown plan reject with HTTP 400 + Zod validation error

### Cron Job Failures
- Per-user failures are caught, logged, and processing continues for remaining users
- If the batch itself fails (e.g., DB connectivity), the BullMQ job is retried via `attempts: 3` with backoff
- Failed cron job attempts are retained in BullMQ failed queue for inspection

---

## Testing Strategy

### Property-Based Testing (Vitest + fast-check)

Property-based tests validate the correctness properties above. Each test generates hundreds of random inputs to find edge cases that hand-written examples would miss.

Library: **fast-check** (installed alongside Vitest — `npm install --save-dev fast-check`)

Configuration: each property test runs a minimum of **100 iterations** (fast-check default is 100; critical properties like credit arithmetic use `numRuns: 500`).

Tag format comment before each test: `// Feature: subscription-billing-entitlement, Property N: <property_text>`

```typescript
// Example: Property 3 — Add-on limits stack additively
// Feature: subscription-billing-entitlement, Property 3: Add-on limits stack additively on base plan
it('add-on limits stack additively on base plan', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<PlanId>('free', 'creator', 'pro', 'business'),
      fc.array(fc.nat({ max: 10 }), { minLength: 1, maxLength: 5 }),
      (planId, addonQuantities) => {
        const basePlan = PLAN_CONFIG[planId];
        const effectiveLimit = basePlan.limits.maxWorkspaces === -1
          ? Infinity
          : basePlan.limits.maxWorkspaces + addonQuantities.reduce((s, q) => s + q, 0);
        expect(computeEffectiveLimit(planId, 'maxWorkspaces', addonQuantities)).toBe(effectiveLimit);
      }
    ),
    { numRuns: 200 }
  );
});
```

**Tests per property:**

| Property | Test file | fast-check arbitraries |
|----------|-----------|------------------------|
| 1: Unknown plan rejection | `plan-config.test.ts` | `fc.string()` filtered to non-plan strings |
| 2: Missing sub → free plan | `entitlement.service.test.ts` | `fc.uuid()` (userId with no DB record) |
| 3: Add-on stacking | `entitlement.service.test.ts` | `fc.constantFrom(plans)`, `fc.array(fc.nat)` |
| 4: Enterprise → Infinity | `entitlement.service.test.ts` | `fc.constantFrom(limitKeys)` |
| 5: Credits formula | `ai-credits.test.ts` | `fc.nat()` for monthly/purchased/rollover/used |
| 6: Deduction rejection | `ai-credits.test.ts` | `fc.nat()` where amount > remaining |
| 7: Exact deduction | `ai-credits.test.ts` | `fc.nat()` for credits and deduction amount |
| 8: HMAC webhook gate | `webhook-verifier.test.ts` | `fc.uint8Array()` for payload, `fc.string()` for secret |
| 9: Webhook idempotency | `webhook.controller.test.ts` | `fc.record(webhookEventShape)` |
| 10: Status change audit | `subscription.service.test.ts` | `fc.constantFrom(statuses)` pairs |
| 11: Analytics history monotone | `entitlement.middleware.test.ts` | `fc.constantFrom(plans)`, `fc.nat(days)` |
| 12: Payment-failed → free | `entitlement.service.test.ts` | `fc.constantFrom(featureKeys)` |
| 13: VeeGPT tier hierarchy | `entitlement.service.test.ts` | `fc.constantFrom(plans, tiers)` |

### Unit Tests (Vitest — example-based)

- `plan-config.test.ts` — assert all five plans exist with exact config values
- `entitlement.service.test.ts` — specific examples: `canUseFeature` for all 5 plans × all feature keys
- `webhook-verifier.test.ts` — valid sig accepted, invalid sig rejected, constant-time impl (uses `timingSafeEqual`)
- `subscription.controller.test.ts` — Zod validation rejects malformed inputs; upgrade/downgrade/cancel response shapes
- `admin.controller.test.ts` — admin-only auth enforced; manual plan set invalidates cache; audit trail written

### Integration Tests

- Cashfree webhook end-to-end: mock Cashfree HTTP, fire each event type, assert DB state transitions
- Credit deduction concurrency: fire 10 concurrent deductions against a single AICredits doc, assert final balance is correct
- BullMQ cron worker: mock DB, trigger each job type, assert correct users are processed
- `GET /api/subscription/me`: assert response shape matches `SubscriptionMeResponse` interface

### Test File Structure

```
server/features/subscription/
└── __tests__/
    ├── plan-config.test.ts
    ├── entitlement.service.test.ts
    ├── ai-credits.test.ts
    ├── webhook-verifier.test.ts
    ├── webhook.controller.test.ts
    ├── subscription.service.test.ts
    ├── entitlement.middleware.test.ts
    └── admin.controller.test.ts
```
