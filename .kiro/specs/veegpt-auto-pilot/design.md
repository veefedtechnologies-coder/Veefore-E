# Design Document: VeeGPT Auto Pilot

## Overview

VeeGPT Auto Pilot is an autonomous, goal-driven growth agent. A user defines a
**Mission** (goal + niche + brand voice + guardrails + operating mode) bound to
one workspace and one connected Instagram account. Auto Pilot then runs a
continuous **Operating Loop** — SENSE → THINK → PLAN → GATE → ACT → MEASURE →
LEARN — that turns the goal into a rolling content + growth strategy, produces
and schedules posts, drafts engagement automations, and reports progress inside
the VeeGPT chat.

Auto Pilot is deliberately an **orchestrator**, not a reimplementation. It composes
services that already exist:

| Capability | Reused service |
|---|---|
| Analytics / follower + performance metrics | `AnalyticsService.getPerformanceSummary`, `InsightsDataService` |
| Trend / niche research | `research()` / `deepResearch()` (`webResearch.service.ts`) |
| AI text + JSON + vision | `aiServiceManager.generateText/generateJSON/analyzeMedia` |
| Caption generation | `aiServiceManager.generateInstagramCaptions` |
| AI image | `replicateService.generateImage`, `ThumbnailAIService` |
| AI video | `WorkingVideoGenerator`, `runwayService` |
| Engagement automation | `AutomationRuleModel` + `automationRuleRepository` + `TriggerEngine` + `automationWorker` + `AntiSpamService` |
| Scheduling | `TieredJobScheduler` (`JobType.SCHEDULED_POST`) |
| Publishing | `SimpleInstagramPublisher` → `InstagramService.publishMedia` |
| Scheduled content record | `ContentModel` (collection `contents`) |
| Credit / usage tracking | `withAIFeature(feature, {userId, workspaceId}, fn)` |
| Notifications (in-app) | `NotificationQueueManager.sendNotification` → `RealtimeService` |
| Chat surface | VeeGPT NDJSON stream + `RealtimeService` WebSocket + `ChatMessage` |
| Job infrastructure | BullMQ queue/worker pattern (`researchQueue`/`researchWorker`) |

The feature lives entirely under `server/features/autopilot/` (following the
`server/features/subscription/` and analytics module conventions) plus a client
feature module under `client/src/features/autopilot/`.

### Scope reminder (from requirements)

- **v1 platform:** Instagram only for autonomous execution; the Mission model
  carries a `platform` field so other platforms can be added later.
- **Primary content source:** the user Media Pool fed by the just-in-time
  Content Brief flow; AI generation is the fallback/backup source.
- **Modes:** `Copilot` (propose-and-approve) and `Autopilot` (execute within
  guardrails), per Mission.

### Key design decisions (and honest gaps)

1. **Background loop cannot use the VeeGPT HTTP stream.** The chat stream
   (`writeEvent`/NDJSON) only exists during a user's request. Auto Pilot runs in
   BullMQ workers, so it pushes narration and Approval Cards into a dedicated
   Auto Pilot conversation via **two channels**: (a) persist a `ChatMessage`
   (with an `autopilotCard` payload) so it is there on next load, and (b)
   `RealtimeService.broadcastToWorkspace(...)` for live delivery. This mirrors
   the existing notification worker's WebSocket broadcast.
2. **No email service currently exists** in the repo (the notification worker
   only broadcasts over WebSocket). R15 requires an email fallback for web. The
   design introduces a thin `EmailNotifier` port with a single implementation
   slot; if no transport is configured it degrades to in-app-only and records
   the notification as `undelivered` (R15.2) rather than failing the loop. This
   is called out as the one net-new external dependency.
3. **Audit records.** `AuditTrailService` is scoped to comment/DM reply actions.
   Auto Pilot mission-level actions (publish, generate, schedule, reschedule,
   substitute, guardrail block) are persisted in a new `AutoPilotAuditRecord`
   collection following the same shape, while engagement-automation execution
   continues to use the existing `AuditTrailService`. Both satisfy the
   Audit_Record requirement; reversibility metadata lives on
   `AutoPilotAuditRecord`.
4. **Reusing `ContentModel`.** Each Content_Slot that reaches ACT is written as a
   `ContentModel` document (status `scheduled` → `publishing` → `published`),
   so Auto Pilot posts appear in the existing Posts UI and reuse the existing
   publish path and metrics polling. The Content_Slot is Auto Pilot's planning
   record; `ContentModel` is the execution record.
---

## Architecture

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                              Client (React)                             │
│  client/src/features/autopilot/                                         │
│   • MissionSetup (wizard)   • MissionControl (dashboard)                │
│   • Sidebar "Auto Pilot" button → /autopilot route                      │
│   • Approval Cards rendered inside VeeGPT chat (autopilotCard)          │
└───────────────┬───────────────────────────────────────┬────────────────┘
                │ REST (/api/v1/autopilot/*)             │ WebSocket (RealtimeService)
                │                                        │ live narration + approvals
┌───────────────▼────────────────────────────────────────▼───────────────┐
│                       Auto Pilot API (Express)                          │
│  routes/autopilot.routes.ts  →  AutoPilotController                     │
│  missions CRUD · guardrails · approvals · media upload · activity log   │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│                       AutoPilotOrchestrator                             │
│   runs ONE Operating-Loop iteration for a Mission                       │
│   SENSE → THINK → PLAN → GATE → ACT → MEASURE → LEARN                    │
└───┬──────┬───────┬───────┬───────┬───────┬───────┬──────────────────────┘
    │      │       │       │       │       │       │
 ┌──▼──┐┌──▼───┐┌──▼────┐┌─▼────┐┌─▼────┐┌─▼─────┐┌▼──────┐
 │Sense││Strat.││Planner││ Gate ││ Act  ││Measure││ Learn │   (stage services)
 └──┬──┘└──┬───┘└──┬────┘└──┬───┘└──┬───┘└──┬────┘└───────┘
    │      │       │        │       │       │
    │      │       │        │       │       └─ AnalyticsService (progress)
    │      │       │        │       └───────── ActService → ContentSource,
    │      │       │        │                   Publisher, AutomationDecision
    │      │       │        └───────────────── GuardrailService + Approvals
    │      │       └────────────────────────── ContentSourceResolver +
    │      │                                    LeadTimeEstimator + BriefService
    │      └────────────────────────────────── StrategyService (LLM)
    └───────────────────────────────────────── AnalyticsService + research()
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│                      Shared / Reused Infrastructure                     │
│  MongoDB (missions, slots, media, briefs, audit) · Redis · BullMQ        │
│  TieredJobScheduler · AutomationRule stack · withAIFeature · Notifier    │
└─────────────────────────────────────────────────────────────────────────┘
```

### BullMQ Queues (mirroring researchQueue conventions: lazy worker, null-on-no-Redis)

| Queue | Purpose | Trigger |
|---|---|---|
| `autopilot-loop` | Repeatable job per active Mission → one Operating-Loop iteration | Repeatable every ≤60 min (R3.2); paused/removed when Mission paused |
| `autopilot-brief` | Delayed jobs: send a Content Brief + escalating reminders | Scheduled at `publishTime − leadTime` and reminder offsets (R7) |
| `autopilot-publish` | Publish a Content_Slot at its slot time | Registered via `TieredJobScheduler` (`JobType.SCHEDULED_POST`) (R12) |
| `autopilot-automation` | Activate/deactivate drafted Engagement_Automations | On publish confirm + at 90-day staleness (R11) |

Each queue: `getSharedRedisConnection()`, `null` queue when Redis absent, a
`XxxQueueManager.enqueue()` with dedupe `jobId`, and a lazily-initialised worker
(`getAutoPilotLoopWorker()` etc.).

### Folder Structure

```
server/features/autopilot/
├── index.ts                          # public exports + registerAutoPilot(app)
├── db/
│   ├── models/
│   │   ├── AutoPilotMissionModel.ts
│   │   ├── ContentSlotModel.ts
│   │   ├── MediaPoolItemModel.ts
│   │   ├── ContentBriefModel.ts
│   │   ├── ApprovalModel.ts
│   │   └── AutoPilotAuditRecordModel.ts
│   └── repositories/
│       ├── MissionRepository.ts
│       ├── ContentSlotRepository.ts
│       ├── MediaPoolRepository.ts
│       └── ApprovalRepository.ts
├── services/
│   ├── AutoPilotOrchestrator.ts      # runs one loop iteration (state machine)
│   ├── stages/
│   │   ├── SenseService.ts
│   │   ├── StrategyService.ts        # THINK: goal → strategy (LLM)
│   │   ├── PlannerService.ts         # PLAN: strategy → Content_Plan/Slots
│   │   ├── GateService.ts            # approval routing (Copilot/Autopilot)
│   │   ├── ActService.ts             # execute approved/auto actions
│   │   ├── MeasureService.ts         # record progress
│   │   └── LearnService.ts           # per-account strategy memory update
│   ├── ContentSourceResolver.ts      # pool | brief | ai-generate
│   ├── LeadTimeEstimator.ts          # complexity → lead time + buffer
│   ├── ContentBriefService.ts        # generate brief + schedule reminders
│   ├── AutomationDecisionService.ts  # LLM decision → draft AutomationRule
│   ├── MediaPoolService.ts
│   ├── GuardrailService.ts
│   ├── CreditBudgetService.ts
│   ├── NotificationDispatcher.ts     # FCM | in-app | email adapter
│   ├── AutoPilotChatBridge.ts        # narration + approval cards → chat
│   └── AutoPilotAuditService.ts
├── queues/
│   ├── autopilotLoopQueue.ts
│   ├── autopilotBriefQueue.ts
│   └── autopilotAutomationQueue.ts
├── workers/
│   ├── autopilotLoopWorker.ts
│   ├── autopilotBriefWorker.ts
│   └── autopilotAutomationWorker.ts
├── controllers/
│   └── autopilot.controller.ts
├── routes/
│   └── autopilot.routes.ts
└── ports/
    └── EmailNotifier.ts              # thin port; degrades if unconfigured

client/src/features/autopilot/
├── index.ts
├── pages/AutoPilotPage.tsx           # /autopilot route
├── components/
│   ├── MissionSetupWizard.tsx
│   ├── MissionControlDashboard.tsx
│   ├── GoalProgressWidget.tsx
│   ├── ActivityLog.tsx
│   ├── MediaPoolPanel.tsx
│   ├── ContentBriefCard.tsx          # rendered in chat + inbox
│   └── ApprovalCard.tsx              # rendered in VeeGPT chat
├── hooks/
│   ├── useMission.ts
│   ├── useMissionControl.ts
│   └── useAutoPilotApprovals.ts
└── api/autopilotApi.ts
```
---

## The Operating Loop (state machine)

An active Mission owns a repeatable `autopilot-loop` job. Each tick runs
`AutoPilotOrchestrator.runIteration(missionId)`, which advances the stages in
order (R3.1) and is **idempotent** — a crashed/retried iteration recomputes from
persisted state rather than double-acting.

```
                   ┌─────────── Mission.status = 'active' ───────────┐
                   ▼                                                  │
  ┌───────┐   ┌────────┐   ┌───────┐   ┌──────┐   ┌─────┐   ┌────────┐   ┌───────┐
  │ SENSE │──▶│ THINK  │──▶│ PLAN  │──▶│ GATE │──▶│ ACT │──▶│MEASURE │──▶│ LEARN │
  └───────┘   └────────┘   └───────┘   └──────┘   └─────┘   └────────┘   └───┬───┘
   analytics   strategy     content     approval   publish   progress    memory │
   + research  (LLM)        slots       routing    + auto    vs goal      update │
        ▲                                                                        │
        └──────────────── next iteration (≤ 60 min later) ──────────────────────┘
```

Mission lifecycle states: `draft → active ⇄ paused → completed | failed`.
`paused` suspends only ACT-stage side effects (R3.5); SENSE/MEASURE may still run
read-only. A pause request flips `status` and removes the repeatable job so no
new autonomous action starts within 60s (R3.6).

### Stage responsibilities

- **SENSE** — `SenseService.sense(mission)` → `{ analytics, research, reducedInputs[] }`.
  Reads `AnalyticsService.getPerformanceSummary(workspaceId, days)` for the current
  progress metric + performance mix, and `research(niche, {mode:'trends', onStatus})`
  for trend signals. Missing input → degrade + record (R2.3); 3 consecutive
  analytics failures → Escalation (R3.8).
- **THINK** — `StrategyService.deriveStrategy(mission, senseResult)` uses
  `aiServiceManager.generateJSON` (tagged via `withAIFeature('autopilot.strategy', …)`)
  to produce `Strategy` (themes, cadence, growth actions) within 300s (R2.1),
  revised each iteration from the latest MEASURE (R2.6).
- **PLAN** — `PlannerService.plan(mission, strategy)` produces/refreshes
  `ContentSlot` docs covering ≥7 days (R2.5). For each slot,
  `ContentSourceResolver` picks the source and `LeadTimeEstimator` sets the brief
  send time when user media is required.
- **GATE** — `GateService.route(mission, plannedItems)` decides per item:
  auto-execute (Autopilot + passes Guardrails + not approval-required) or emit an
  Approval Card (Copilot, or approval-required item) (R4, R5).
- **ACT** — `ActService.execute(item)` performs the approved/auto action:
  resolve media → generate caption (vision-grounded) → `AutomationDecisionService`
  → write `ContentModel` + register publish job → draft/activate automation.
  Every action writes an `AutoPilotAuditRecord` with pre-execution state (R13.5).
- **MEASURE** — `MeasureService.measure(mission)` records the current metric value
  and per-slot performance deltas into the Mission's `progress` history (R3.4).
- **LEARN** — `LearnService.learn(mission, measures)` updates the Mission's
  `strategyMemory` (e.g. "reels +40% reach; carousels flat") which feeds the next
  THINK. Pure function over measured results → stored insights.

---

## Components and Interfaces

### AutoPilotOrchestrator

```ts
interface LoopContext {
  mission: AutoPilotMission;
  now: number;                    // injectable for deterministic tests
}

class AutoPilotOrchestrator {
  // One full iteration. Never throws to the worker; converts failures into
  // Audit records + Escalations and lets the next tick recover (R2.4, R18.3).
  async runIteration(missionId: string, now?: number): Promise<IterationResult>;
}

interface IterationResult {
  stagesRun: LoopStage[];
  actionsExecuted: number;
  approvalsRaised: number;
  escalations: number;
  progressValue?: number;
}
```

### SenseService / StrategyService / PlannerService

```ts
interface SenseResult {
  analytics?: PerformanceSummary;   // from AnalyticsService
  research?: ResearchResult;        // from research()
  reducedInputs: ('analytics'|'research')[];  // R2.3
  analyticsFailureStreak: number;   // for R3.8
}

interface Strategy {
  themes: string[];                 // ≥1 (R2.1)
  cadence: { postsPer: 'day'|'week'; count: number };
  growthActions: string[];          // ≥1
  reducedInputs: boolean;           // R2.3 flag
}

interface PlannedSlot {
  slotId: string;
  scheduledAt: Date;                // within frequency cap (R2.7)
  format: 'reel'|'photo'|'carousel'|'story';
  theme: string;
  source: ContentSource;            // resolved
  briefSendAt?: Date;               // when source = 'user-brief'
}
```

### ContentSourceResolver + LeadTimeEstimator

```ts
type ContentSource =
  | { kind: 'pool'; mediaPoolItemId: string }
  | { kind: 'user-brief' }         // needs a Content Brief
  | { kind: 'ai-generated' };      // fallback/backup

class ContentSourceResolver {
  // Preference order per Mission.contentSourcePreference:
  //   'user-first' → pool → brief → ai ;  'ai-first' → ai → pool → brief
  resolve(mission, slot, pool): ContentSource;
}

class LeadTimeEstimator {
  // R7.2: estimate creation duration from format complexity, add ≥25% buffer,
  // clamp to [2h, 14d]. Pure + unit-tested.
  estimate(format: PlannedSlot['format'], complexity: 'low'|'med'|'high'): number; // ms
}
```

Complexity → base duration table (config, not hardcoded in logic):
`photo:low≈2h`, `carousel:med≈8h`, `reel:high≈24h`, `story:low≈1h`; buffer =
`max(0.25 × base, 30min)`; final Lead_Time = `clamp(base+buffer, 2h, 14d)`.

### ContentBriefService

```ts
class ContentBriefService {
  // R7.1: concept, hook, shot list, step-by-step instructions, suggested caption
  // (in Mission local language — R9.3). Uses generateJSON under withAIFeature.
  async generateBrief(mission, slot): Promise<ContentBrief>;

  // Schedules the brief send (publishTime − leadTime) + up to 3 reminders at
  // 50/25/10% remaining lead time via autopilot-brief queue (R7.3–R7.5).
  async scheduleBriefDelivery(brief): Promise<void>;

  // R7.6/7.7: at fallback deadline (publishTime − 30m) with no delivery →
  // AI backup if producible, else reschedule slot. Records Audit + notifies.
  async resolveUndeliveredBrief(briefId): Promise<'ai-backup'|'rescheduled'>;
}
```
### AutomationDecisionService (the "acts like a human" component)

Because Auto Pilot authored the caption/CTA, it already knows the trigger keyword —
no guessing. After a slot's caption is finalized, this service runs one LLM call
(`generateJSON`, ≤30s, R10.1) that returns a structured decision, then maps it to
an `AutomationRule` compatible with the existing `TriggerEngine`/`automationWorker`.

```ts
interface AutomationDecision {
  needsAutomation: boolean;                       // R10.1
  type?: 'comment-only' | 'dm-only' | 'comment-to-dm';  // exactly one (R10.2)
  triggerKeyword?: string;                        // derived from CTA (R10.3)
  commentReply?: string;                          // public reply text
  dmMessage?: string;                             // content named in CTA (R10.4)
  dmButtons?: { label: string; url?: string }[];
  reason: string;                                 // for narration/audit
}

class AutomationDecisionService {
  async decide(mission, slot, caption): Promise<AutomationDecision>;

  // Maps decision → AutomationRuleModel draft (isActive:false until go-live).
  // action = { responses, dmResponses, dmButtons }  (matches existing schema).
  async draftRule(mission, slot, decision): Promise<AutomationRule /* isActive:false */>;
}
```

Decision rules (LLM-guided, enumerated for testability):

| Caption CTA pattern | Decision |
|---|---|
| No response-driving CTA | `needsAutomation:false` → attach nothing (R10.5) |
| "comment `X` and I'll DM you the link/guide" | `comment-to-dm`, keyword=`X`, commentReply + dmMessage(link) (R10.4) |
| "DM me `X` for …" | `dm-only`, keyword=`X` |
| "tag a friend / comment your thoughts" | `comment-only` (engagement reply) |
| LLM failure/timeout or keyword not derivable | default `needsAutomation:false`, preserve slot state (R10.7) |

The drafted rule is stored linked to the slot. Go-live is governed by
`AutomationLifecycle` (below), never activated in Copilot without approval (R11.1).

### GuardrailService

```ts
interface GuardrailCheck { ok: boolean; violations: GuardrailViolation[]; }
interface GuardrailViolation {
  kind: 'banned-topic'|'frequency-cap'|'credit-budget'|'approval-required'|'brand-voice';
  detail: string;
}

class GuardrailService {
  // Evaluated immediately before execution (R5.1). Used by GATE and ACT.
  check(mission, action): GuardrailCheck;
  // R13.2 frequency cap = max published actions per rolling window.
  wouldExceedFrequencyCap(mission, at: Date): boolean;
}
```

### CreditBudgetService

```ts
class CreditBudgetService {
  // R14.1: projected numeric cost of a plan/strategy before execution.
  projectCost(plannedItems: PlannedSlot[]): number;
  // R14.3/14.4: gate an AI op against remaining budget (reads consumed via
  // withAIFeature usage records for the mission).
  async canSpend(mission, estimatedCost: number): Promise<boolean>;
  async consumed(mission): Promise<number>;
}
```

All AI operations in every stage are wrapped:
`withAIFeature('autopilot.<stage>', { userId, workspaceId }, () => …)` so the
existing usage/credit tracking attributes spend to the Mission's workspace
(R14.2).

### NotificationDispatcher + EmailNotifier port

```ts
type Channel = 'fcm' | 'in-app' | 'email';

class NotificationDispatcher {
  // R15: mobile → FCM; web → in-app inbox (+ email fallback if unread 15m).
  async dispatch(userInput: UserInputNotification): Promise<{ delivered: Channel[]; undelivered: boolean }>;
}

interface EmailNotifier {           // NEW pluggable port (no transport exists yet)
  isConfigured(): boolean;
  send(to: string, subject: string, body: string): Promise<boolean>;
}
```

- In-app + mobile reuse `NotificationQueueManager.sendNotification` →
  `RealtimeService` broadcast + a persisted `NotificationModel` row (inbox).
- Mobile FCM: delivered through the mobile app's existing FCM registration
  (device token already synced by `NotificationService.ts`). NotificationDispatcher
  targets FCM when the user has a registered device token.
- **Email fallback**: if `EmailNotifier.isConfigured()` is false, the dispatcher
  logs the notification as `undelivered:false` on in-app success and does not fail
  the loop (R15.2 graceful path). Configuring a transport (e.g. SES/Resend) is a
  one-file change behind the port.

### AutoPilotChatBridge + Mission Control

```ts
class AutoPilotChatBridge {
  // Ensures a per-Mission Auto Pilot conversation exists, appends a ChatMessage
  // carrying an optional autopilotCard, and live-broadcasts it (R16.2, R16.3).
  async narrate(mission, text: string): Promise<void>;
  async pushApprovalCard(mission, approval: Approval): Promise<void>;
}
```

- The sidebar **Auto Pilot** button (currently a no-op in `ConversationSidebar.tsx`)
  navigates to `/autopilot` → `MissionControlDashboard` (R16.1).
- Narration + approval cards are delivered as a new chat message type
  `autopilotCard` (client renders `<ApprovalCard>` / `<ContentBriefCard>` via the
  existing `renderMessageCard` switch in `VeeGPT.tsx`).
- `MissionControlDashboard` shows goal progress (`GoalProgressWidget`), pending
  approvals count+contents, and the Operating-Loop activity log (R16.4), refreshed
  live via the same WebSocket channel (R16.5).
### Publishing & Automation lifecycle

- **Publish (R12):** ACT writes a `ContentModel` (status `scheduled`) and registers
  a `JobType.SCHEDULED_POST` job with `TieredJobScheduler`. `autopilotPublishWorker`
  fires at slot time (≤60s, R12.1), calls `SimpleInstagramPublisher.publishPost({
  accountId, accessToken, content, mediaFiles, hashtags, postType })`, and on
  success flips `ContentModel.status` → `published` and records the Instagram post
  id. Retry policy: up to 3 retries with backoff 30s→300s (R12.3); each attempt →
  `AutoPilotAuditRecord` (R12.4); exhaustion → Escalation + slot stays unpublished
  (R12.5). A pre-publish guard (5 min before) verifies media/fallback is present
  (R12.6) and refuses to double-publish an already-published slot (R12.7).
- **Automation go-live (R11):** on publish confirmation, `autopilotAutomationWorker`
  activates the drafted rule via `automationRuleRepository.toggleActive(ruleId, true)`
  within 60s (R11.2) — only after approval in Copilot (R11.1). At publish+90 days it
  deactivates (R11.3). All execution flows through the existing `TriggerEngine` +
  `automationWorker` + `AntiSpamService` (R11.8, R18.2); Auto Pilot never messages
  Instagram directly (R18.1).

---

## Data Models

### AutoPilotMissionModel (collection `autopilot_missions`)

```ts
{
  workspaceId: Mixed,            // indexed; bound 1:1 with a connected account (R1.4)
  accountId: string,            // connected Instagram account
  platform: string,             // 'instagram' (v1); model allows others (R18.6)
  goal: {
    metric: 'followers'|'engagement'|'reach',
    targetValue: number,        // 1..100_000_000 (R1.2)
    targetDate?: Date,          // must be future (R1.4)
    startValue: number,         // captured at activation
  },
  niche: string,                // 1..100 chars
  brandVoice: string,           // 1..2000 chars
  localLanguage?: string,       // R9; default English when absent (R9.4)
  operatingMode: 'copilot'|'autopilot',
  contentSourcePreference: 'user-first'|'ai-first',
  guardrails: {
    bannedTopics: string[],
    postingFrequency: { count: number; per: 'day'|'week'; windowMs: number },
    creditBudget: number,       // 1..1_000_000 (R14.6)
    approvalRequiredActions: string[],  // e.g. ['publish','automation']
  },
  strategy?: Strategy,          // latest THINK output
  strategyMemory: object[],     // LEARN insights (per-account learning)
  progress: { at: Date; value: number }[],  // MEASURE history
  status: 'draft'|'active'|'paused'|'completed'|'failed',
  lastIterationAt?: Date,
  createdAt, updatedAt
}
```

### ContentSlotModel (collection `autopilot_content_slots`)

```ts
{
  missionId: ObjectId,          // indexed
  workspaceId: Mixed,
  scheduledAt: Date,            // within frequency cap
  format: 'reel'|'photo'|'carousel'|'story',
  theme: string,
  source: { kind: 'pool'|'user-brief'|'ai-generated'; mediaPoolItemId?: string },
  caption?: string,
  hashtags?: string[],
  automationDraftId?: ObjectId, // linked drafted AutomationRule (if any)
  contentId?: ObjectId,         // linked ContentModel once ACT runs
  status: 'planned'|'brief-sent'|'awaiting-approval'|'ready'|'scheduled'
        |'published'|'rescheduled'|'failed'|'cancelled',
  fallbackResolution?: 'ai-backup'|'rescheduled',
  createdAt, updatedAt
}
```

### MediaPoolItemModel (collection `autopilot_media_pool`)

```ts
{
  workspaceId: Mixed,           // indexed; pool is workspace-scoped
  missionId?: ObjectId,
  origin: 'user-upload'|'ai-generated'|'brief-delivery',
  mediaUrl: string,
  mediaType: 'image'|'video',
  format?: string,
  sizeBytes: number,            // ≤ 100MB accepted (R6.5)
  visionAnalysis?: object,      // cached analyzeMedia() output
  available: boolean,           // reusable until user removes (R6.6)
  usedInSlots: ObjectId[],
  createdAt, updatedAt
}
```

### ContentBriefModel (collection `autopilot_content_briefs`)

```ts
{
  missionId: ObjectId, slotId: ObjectId, workspaceId: Mixed,
  concept: string, hook: string, shotList: string[],
  instructions: string, suggestedCaption: string,
  language: string,
  leadTimeMs: number, sendAt: Date, fallbackDeadline: Date,
  remindersSent: number,        // ≤3 (R7.5)
  status: 'pending'|'sent'|'delivered'|'ai-backup'|'rescheduled'|'failed',
  deliveredMediaPoolItemId?: ObjectId,
  createdAt, updatedAt
}
```

### ApprovalModel (collection `autopilot_approvals`)

```ts
{
  missionId: ObjectId, workspaceId: Mixed,
  itemType: 'content-slot'|'caption'|'automation'|'plan'|'budget',
  itemRef: ObjectId,
  chatMessageId?: number,       // the ChatMessage carrying the card
  status: 'pending'|'approved'|'edited'|'rejected'|'expired',
  editedPayload?: object,
  decidedAt?: Date, expiresAt?: Date,  // slot publish time (R4.7)
  createdAt, updatedAt
}
```

### AutoPilotAuditRecordModel (collection `autopilot_audit_records`)

```ts
{
  missionId: ObjectId, workspaceId: Mixed,
  stage: LoopStage, action: string,           // 'publish'|'generate'|'reschedule'|…
  triggeringContext: object,                  // R17.1
  outcome: 'success'|'failure'|'blocked'|'deferred',
  reversible: boolean,                        // R17.1
  preExecutionState?: object,                 // R13.5 (for reversal)
  reversalOp?: object,
  reversedAt?: Date,
  createdAt
}
```

Engagement-automation execution (comment/DM replies) continues to be audited by
the existing `AuditTrailService` / `AutomationAuditRecord` — Auto Pilot does not
duplicate that.
---

## REST API

All routes under `/api/v1/autopilot`, mounted in `server/routes/v1/index.ts`,
protected by `requireAuth` + `validateRequest` (zod), following the existing
`automation.routes.ts` convention. Workspace/account ownership is enforced per
request.

| Method | Path | Purpose | Req |
|---|---|---|---|
| POST | `/missions` | Create Mission (validates goal, target date, account, budget) | R1, R14.6 |
| GET | `/missions` | List missions for workspace | R16 |
| GET | `/missions/:id` | Mission detail + progress + strategy | R16.4 |
| PATCH | `/missions/:id` | Update mode / guardrails (applies to subsequent actions) | R1.8, R13.4 |
| POST | `/missions/:id/activate` | draft → active (starts loop) | R2.1, R3 |
| POST | `/missions/:id/pause` | active → paused (stops new actions ≤60s) | R3.5, R3.6 |
| POST | `/missions/:id/resume` | paused → active | R3.5 |
| GET | `/missions/:id/slots` | Content plan (upcoming slots) | R2.5 |
| GET | `/missions/:id/activity` | Operating-loop activity log (audit) | R16.4, R17 |
| POST | `/missions/:id/media` | Upload media to pool (≤100MB, image/video) | R6.1, R6.5 |
| GET | `/missions/:id/media` | List pool | R6 |
| DELETE | `/media/:itemId` | Remove pool item | R6.6 |
| POST | `/approvals/:id/approve` | Approve card | R4.6 |
| POST | `/approvals/:id/edit` | Edit + re-validate against guardrails | R4.3, R4.4 |
| POST | `/approvals/:id/reject` | Reject (regenerate/reschedule if slot) | R4.5 |
| POST | `/briefs/:id/deliver` | Attach delivered media to slot | R7.8 |
| POST | `/actions/:auditId/undo` | Reverse a reversible action | R17.2, R13.6 |
| POST | `/missions/:id/budget` | Raise budget / approve continued spend | R14.5 |

---

## Cross-Cutting Concerns

### Concurrency & idempotency
- Only one `runIteration` per Mission at a time — enforced by a Redis lock keyed
  on `missionId` (reuse `distributed-lock.ts`). A repeated/retried loop job that
  finds the lock held is a no-op.
- Publishing is idempotent on `ContentModel.status` (R12.7); brief reminders track
  `remindersSent` so retries never over-notify (R7.5).

### Multi-account / workspace isolation
- Every model is `workspaceId`-scoped and indexed; the Media Pool is
  workspace-scoped (reusable across that workspace's missions).

### Local language (R9)
- `Mission.localLanguage` is threaded into every generation prompt
  (captions, briefs, replies). Non-English comment interpretation happens inside
  the reused automation stack; `AutomationDecisionService` prompts include the
  language. Undetectable language falls back to configured language (R9.5);
  missing config defaults to English (R9.4).

### Extensibility to other platforms (R18.6/18.7)
- `platform` on Mission + a thin publisher/automation adapter boundary. v1 wires
  only the Instagram adapter; a non-Instagram autonomous request is declined with
  a clear message while the Mission definition is retained.

---

## Error Handling

| Failure | Handling | Req |
|---|---|---|
| Analytics unavailable in SENSE | degrade to research-only, audit, retry next tick | R2.3, R3.7 |
| 3 consecutive analytics failures | Escalation + User_Input_Notification | R3.8 |
| Strategy generation fails | audit + retry next iteration, mission stays active | R2.4 |
| Vision analysis fails (30s, 3 retries) | Escalation + notify | R8.7 |
| Caption still has banned topic after 3 tries | withhold + Escalation | R8.6 |
| Automation decision LLM fails / no keyword | default to no automation, preserve slot | R10.7 |
| Publish fails | 3 retries 30s→300s; exhaustion → Escalation, slot unpublished | R12.3, R12.5 |
| Automation activate fails | retry; else Escalation + audit | R11.5 |
| Credit budget would be exceeded | withhold op (no spend), Escalation, notify | R14.4 |
| Credit tracking unavailable | withhold op, preserve state, Escalation | R14.7 |
| Notification queue create fails | retry ×3; else record undelivered, keep pending state | R15.2 |
| FCM delivery fails | retry ×3; else email fallback | R15.4 |
| Local-language generation fails | withhold, preserve state, error indication | R9.6 |
| Backing service unreachable (single iteration) | preserve state, resume next tick | R18.4 |
| Backing service unreachable 3 iterations | pause mission, surface failure, keep state | R18.5 |
| Audit write fails | retry; else Escalation | R17.2 |

Principle: **a stage failure never crashes the loop or loses Mission state** —
it is recorded and recovered on the next tick. Redis/Mongo/BullMQ absence
degrades gracefully (null queues, in-line fallback) exactly like the existing
research/insights queues.

---

## Testing Strategy

- **Pure unit tests (no I/O):** `LeadTimeEstimator` (buffer + clamp math),
  frequency-cap window arithmetic in `GuardrailService`, credit projection in
  `CreditBudgetService`, the `AutomationDecision → AutomationRule` mapping, and
  the loop state-machine ordering. These mirror the repo's existing pure-function
  test style (e.g. `TieredJobScheduler` pure statics).
- **Orchestrator tests with fakes:** in-memory repositories + mocked
  analytics/research/AI/publisher, driving named scenarios: full Copilot cycle,
  full Autopilot cycle, brief undelivered → AI backup, brief undelivered →
  reschedule, publish-retry-exhaustion → Escalation, budget-exceeded → withhold,
  pause suspends ACT only. Deterministic via injected `now`.
- **Automation decision matrix:** table-driven test for each CTA pattern in R10.
- **Guardrail property tests:** banned-topic never published; frequency cap never
  exceeded across random schedules (fast-check, matching existing property tests).
- **Notification routing:** mobile→FCM, web→in-app(+email when configured, graceful
  when not).
- **Integration (wiring):** BullMQ queues null-safe without Redis; publish path
  writes a `ContentModel` and calls `SimpleInstagramPublisher`; approval endpoints
  transition state correctly.

---

## Requirements Traceability

| Requirement | Primary components |
|---|---|
| R1 Mission setup | `AutoPilotController`, `MissionRepository`, `MissionSetupWizard` |
| R2 Strategy | `SenseService`, `StrategyService`, `PlannerService` |
| R3 Operating loop | `AutoPilotOrchestrator`, `autopilot-loop` queue/worker |
| R4 Copilot approval | `GateService`, `ApprovalModel`, `ApprovalCard` |
| R5 Autopilot execution | `GateService`, `GuardrailService`, `ActService` |
| R6 Media pool | `MediaPoolService`, `MediaPoolItemModel` |
| R7 Content brief + lead time | `ContentBriefService`, `LeadTimeEstimator`, `autopilot-brief` |
| R8 Vision-grounded captions | `ActService` + `analyzeMedia` + `generateInstagramCaptions` |
| R9 Local language | `Mission.localLanguage` threading, generation prompts |
| R10 Automation decision | `AutomationDecisionService` |
| R11 Automation lifecycle | `autopilotAutomationWorker`, `automationRuleRepository` |
| R12 Publishing reliability | `ActService`, `autopilot-publish`, `TieredJobScheduler`, `SimpleInstagramPublisher` |
| R13 Guardrails | `GuardrailService` |
| R14 Credit budget | `CreditBudgetService`, `withAIFeature` |
| R15 Notifications | `NotificationDispatcher`, `EmailNotifier` port |
| R16 Chat + Mission Control | `AutoPilotChatBridge`, `MissionControlDashboard`, sidebar wiring |
| R17 Audit + reversibility | `AutoPilotAuditService`, `AutoPilotAuditRecordModel` |
| R18 Meta policy + reliability | reused publishing/automation stack, adapter boundary |
---

## Correctness Properties

These invariants must hold for any input and are the basis for the property-based
tests (fast-check), matching the repo's existing property-test style.

### Property 1: No empty publish
For every Content_Slot that reaches its publish time, it has delivered media,
AI-generated media, or a fallback resolution assigned — a slot never publishes
empty.
**Validates: Requirements 7.6, 7.7, 12.6**

### Property 2: Frequency cap never exceeded
Across any generated Content_Plan, the count of scheduled/published actions
within any rolling window never exceeds the Mission's posting-frequency cap.
**Validates: Requirements 2.7, 13.2**

### Property 3: Banned topics never ship
No caption or automation content that contains a banned topic is ever published
or activated; it is withheld or revised first.
**Validates: Requirements 8.2, 8.5, 13.3**

### Property 4: Budget is a hard ceiling
The sum of credits consumed by a Mission never exceeds its Credit_Budget; the
operation that would cross it is withheld without spend.
**Validates: Requirements 13.8, 14.3, 14.4**

### Property 5: Copilot never acts unapproved
While `operatingMode = copilot`, no post is published and no Engagement_Automation
is activated without an approved Approval_Card.
**Validates: Requirements 4.2, 11.1**

### Property 6: Approval-required is honored in both modes
Any action in `approvalRequiredActions` is never executed without approval, even
in `autopilot`.
**Validates: Requirements 5.2, 13.7**

### Property 7: Exactly one automation type
When an Automation_Decision needs automation, exactly one of {comment-only,
dm-only, comment-to-dm} is selected; when it does not, no automation is attached.
**Validates: Requirements 10.2, 10.5**

### Property 8: Idempotent publishing
A Content_Slot that has published successfully is never published again,
regardless of retries or re-ticks.
**Validates: Requirements 12.7**

### Property 9: State preserved on failure
Any stage failure leaves Mission and slot state unchanged (no partial mutation)
and is recoverable on the next iteration.
**Validates: Requirements 2.4, 9.6, 14.4, 18.4**

### Property 10: Every autonomous action is audited
Each executed action produces exactly one Audit_Record capturing context,
outcome, and reversibility.
**Validates: Requirements 5.5, 17.1**

### Property 11: Bounded lead time
Every computed Lead_Time lies within [2h, 14d] and includes a buffer of at least
25% of the estimated creation duration.
**Validates: Requirements 7.2**

### Property 12: Bounded reminders
No more than 3 escalating reminders are sent per Content_Brief before its
fallback deadline.
**Validates: Requirements 7.5**
