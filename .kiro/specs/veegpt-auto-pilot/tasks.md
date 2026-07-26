# Implementation Plan

## Overview

Tasks build Auto Pilot incrementally: pure logic and data models first, then the
Operating Loop stages, then queues/workers, API, and client. Each task is
test-driven where it involves non-trivial logic and references the requirements
it satisfies. Auto Pilot orchestrates existing services (analytics, research,
`aiServiceManager`, `AutomationRule` stack, `TieredJobScheduler`,
`SimpleInstagramPublisher`, `withAIFeature`, notification queue) rather than
reimplementing them.

## Tasks

- [x] 1. Scaffold the `server/features/autopilot/` module
  - Create `index.ts` with a `registerAutoPilot(app)` export stub and folder
    structure (`db/models`, `db/repositories`, `services`, `services/stages`,
    `queues`, `workers`, `controllers`, `routes`, `ports`) per the design.
  - Add barrel exports; wire `registerAutoPilot(app)` into `server/index.ts`
    behind a no-op so nothing breaks before endpoints exist.
  - _Requirements: 1_

- [x] 2. Data models and repositories
- [x] 2.1 Create Mongoose models
  - Implement `AutoPilotMissionModel`, `ContentSlotModel`, `MediaPoolItemModel`,
    `ContentBriefModel`, `ApprovalModel`, `AutoPilotAuditRecordModel` with the
    fields and indexes from the design (all `workspaceId`-scoped and indexed).
  - _Requirements: 1, 2, 6, 7, 13, 17_
- [x] 2.2 Create repositories
  - Implement `MissionRepository`, `ContentSlotRepository`, `MediaPoolRepository`,
    `ApprovalRepository` extending the existing `BaseRepository` pattern.
  - _Requirements: 1, 6, 17_
- [x] 2.3 Unit-test model validation
  - Test goal target-metric range (1–100,000,000), niche/brand-voice length
    bounds, credit-budget range (1–1,000,000), and status enums.
  - _Requirements: 1.2, 1.3, 1.4, 14.6_

- [x] 3. Pure logic services (no I/O, fully unit-tested first)
- [x] 3.1 `LeadTimeEstimator`
  - Implement complexity→base-duration table, ≥25% buffer, clamp to [2h, 14d].
  - Property test: output always within bounds and includes the buffer.
  - _Requirements: 7.2 (Property 11)_
- [x] 3.2 `GuardrailService` frequency-cap + banned-topic checks
  - Implement `wouldExceedFrequencyCap` (rolling window) and banned-topic
    matching. Property test: cap never exceeded across random schedules.
  - _Requirements: 13.1, 13.2, 13.3 (Property 2, 3)_
- [x] 3.3 `CreditBudgetService.projectCost`
  - Implement projected-cost computation over planned items. Unit-test the sum.
  - _Requirements: 14.1_

- [x] 4. Guardrail and credit enforcement (I/O)
- [x] 4.1 Full `GuardrailService.check`
  - Evaluate brand voice, banned topics, frequency cap, credit budget, and
    approval-required designation; return structured violations.
  - _Requirements: 5.1, 13.3, 13.7, 13.8_
- [x] 4.2 `CreditBudgetService.canSpend`/`consumed`
  - Read consumed credits from `withAIFeature` usage records for the mission;
    withhold when a spend would exceed the budget; handle tracking-unavailable.
  - _Requirements: 14.2, 14.3, 14.4, 14.7 (Property 4)_

- [ ] 5. Notification dispatch
- [x] 5.1 `EmailNotifier` port + no-op default
  - Define the `EmailNotifier` interface; provide an unconfigured default whose
    `isConfigured()` returns false.
  - _Requirements: 15.3_
- [x] 5.2 `NotificationDispatcher`
  - Route to FCM (mobile device token present), in-app inbox (persist
    `NotificationModel` + `RealtimeService` broadcast via
    `NotificationQueueManager.sendNotification`), and email fallback; record
    `undelivered` when nothing succeeds without failing the caller.
  - Retry FCM ×3 then email; web email fallback when inbox unread 15m.
  - _Requirements: 15.1, 15.2, 15.4, 15.5, 15.6, 15.7_
- [x] 5.3 Test notification routing (mobile/web/degraded)
  - _Requirements: 15.2, 15.4_

- [x] 6. Audit service
- [x] 6.1 `AutoPilotAuditService`
  - Write `AutoPilotAuditRecord` (context, action, outcome, reversibility,
    pre-execution state, reversal op) with retry-then-escalate on write failure.
  - _Requirements: 5.5, 13.5, 17.1, 17.2 (Property 10)_
- [x] 6.2 Reversal (undo) logic
  - Implement reversal using stored reversal op; decline non-reversible actions;
    preserve state on reversal failure.
  - _Requirements: 13.6, 17.3, 17.4, 17.5_

- [x] 7. Media pool
- [x] 7.1 `MediaPoolService`
  - Upload validation (≤100MB, image/video), add-to-pool within 10s, mark
    available, keep items reusable until removed, record assignment audit.
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_
- [x] 7.2 Media upload/list/delete endpoints
  - _Requirements: 6.1, 6.5, 6.6_

- [x] 8. SENSE and strategy (THINK)
- [x] 8.1 `SenseService`
  - Read `AnalyticsService.getPerformanceSummary` + `research(niche, {mode:'trends'})`;
    track analytics-failure streak; degrade with reduced-inputs flag.
  - _Requirements: 2.2, 2.3, 3.3, 3.7, 3.8_
- [x] 8.2 `StrategyService.deriveStrategy`
  - LLM (`generateJSON` under `withAIFeature('autopilot.strategy', …)`) → themes,
    cadence, growth actions; 300s bound; retry-next-tick on failure.
  - _Requirements: 2.1, 2.4, 2.6_

- [x] 9. PLAN stage
- [x] 9.1 `ContentSourceResolver`
  - Resolve pool | user-brief | ai-generated per `contentSourcePreference`.
  - _Requirements: 6.2, 7.1_
- [x] 9.2 `PlannerService.plan`
  - Produce/refresh `ContentSlot` docs ≥7 days ahead within the frequency cap;
    set `briefSendAt` for user-brief slots via `LeadTimeEstimator`.
  - _Requirements: 2.5, 2.7, 13.2 (Property 2)_

- [x] 10. Content brief flow
- [x] 10.1 `ContentBriefService.generateBrief`
  - LLM brief (concept, hook, shot list, instructions, suggested caption) in the
    mission's local language; escalate on generation failure.
  - _Requirements: 7.1, 7.9, 9.3_
- [x] 10.2 `autopilot-brief` queue + worker
  - Schedule brief send at `publishTime − leadTime` and ≤3 reminders at 50/25/10%
    remaining lead time (null-safe without Redis, lazy worker).
  - _Requirements: 7.3, 7.4, 7.5 (Property 12)_
- [x] 10.3 Brief delivery + fallback resolution
  - On delivery attach media to slot + pool; at fallback deadline
    (publish − 30m) substitute AI backup or reschedule; record audit.
  - _Requirements: 7.6, 7.7, 7.8 (Property 1)_

- [x] 11. Content generation + vision-grounded captioning
- [x] 11.1 Media generation adapter
  - Wrap `replicateService.generateImage` / `WorkingVideoGenerator` /
    `runwayService` behind a single `generateMedia(format, prompt)` used for
    ai-generated and backup media; add to pool.
  - _Requirements: 6.3, 8.3_
- [x] 11.2 Caption + hashtags (vision-grounded, localized)
  - `analyzeMedia` (30s, 3 retries, escalate) → `generateInstagramCaptions`
    grounded in vision output; enforce brand voice + banned topics (≤3 revise,
    then escalate); generate 1–30 hashtags; produce in local language.
  - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 9.1, 9.4, 9.6 (Property 3)_

- [x] 12. Human-like automation decision
- [x] 12.1 `AutomationDecisionService.decide`
  - Single LLM call (≤30s) → structured decision (needs/type/keyword/reply/dm);
    default to no-automation on failure/no-keyword.
  - Table-driven test for each CTA pattern in the design.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7 (Property 7)_
- [x] 12.2 `draftRule` mapping
  - Map decision → `AutomationRuleModel` draft (`isActive:false`, `action` =
    {responses, dmResponses, dmButtons}) compatible with `TriggerEngine`.
  - _Requirements: 10.6_

- [x] 13. GATE stage (approval routing)
- [x] 13.1 `GateService.route`
  - Copilot → emit Approval_Card for every slot/caption/automation; Autopilot →
    auto-execute when guardrails pass and not approval-required, else card.
  - _Requirements: 4.1, 4.2, 5.1, 5.2_
- [x] 13.2 Approval lifecycle + endpoints
  - approve / edit (re-validate against guardrails, reject bad edits) / reject
    (regenerate or reschedule slot) / expiry at publish time → fallback + notify.
  - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 11.7 (Property 5, 6)_

- [x] 14. ACT stage — publishing
- [x] 14.1 Write `ContentModel` + register publish job
  - Create `ContentModel` (status `scheduled`) and register `JobType.SCHEDULED_POST`
    with `TieredJobScheduler`; pre-publish media/fallback guard 5m prior.
  - _Requirements: 12.2, 12.6_
- [x] 14.2 `autopilot-publish` worker
  - Publish via `SimpleInstagramPublisher.publishPost` within 60s; 3 retries
    30s→300s; audit each attempt; escalate on exhaustion; never double-publish.
  - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.7 (Property 1, 8)_

- [x] 15. Engagement automation lifecycle
- [x] 15.1 `autopilot-automation` worker
  - Activate approved/guardrails-passed rule within 60s of publish confirm via
    `automationRuleRepository.toggleActive`; deactivate at publish+90d; retry +
    escalate on failure; audit activate/deactivate.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8_

- [ ] 16. MEASURE and LEARN
- [x] 16.1 `MeasureService.measure`
  - Record current goal-metric value + per-slot performance into mission
    `progress` history.
  - _Requirements: 3.4_
- [ ] 16.2 `LearnService.learn`
  - Update `strategyMemory` insights from measured results (pure over inputs).
  - _Requirements: 2.6_

- [ ] 17. Orchestrator + loop queue
- [ ] 17.1 `AutoPilotOrchestrator.runIteration`
  - Run stages in order, idempotent, Redis-lock per mission; convert failures to
    audit + escalation, never crash the loop; preserve state.
  - Unit-test stage ordering + failure-recovery scenarios.
  - _Requirements: 3.1, 2.4, 18.3, 18.4 (Property 9)_
- [ ] 17.2 `autopilot-loop` repeatable queue + worker
  - Repeatable job per active mission (≤60 min cadence); removed on pause/stop;
    null-safe without Redis.
  - _Requirements: 3.2, 3.5, 3.6_
- [ ] 17.3 Backing-service outage handling
  - Preserve state on single-iteration outage; pause mission + surface failure
    after 3 consecutive outages.
  - _Requirements: 18.4, 18.5_

- [ ] 18. Mission REST API + controller
- [ ] 18.1 `AutoPilotController` + `autopilot.routes.ts`
  - Missions CRUD, activate/pause/resume, slots, activity log, budget raise,
    undo; zod validation; workspace/account ownership checks; mount in
    `server/routes/v1/index.ts`.
  - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 3.5, 14.5, 16.1_
- [ ] 18.2 Mission activation validation
  - Reject missing target metric, past target date, no connected IG account.
  - _Requirements: 1.3, 1.4, 1.6_
- [ ] 18.3 Non-Instagram guard
  - Allow non-IG platform in mission model but decline autonomous execution.
  - _Requirements: 18.6, 18.7_

- [ ] 19. VeeGPT chat bridge + Mission Control view
- [ ] 19.1 `AutoPilotChatBridge`
  - Ensure per-mission Auto Pilot conversation; append `ChatMessage` with
    `autopilotCard`; live-broadcast via `RealtimeService`.
  - _Requirements: 16.2, 16.3_
- [ ] 19.2 Client: wire sidebar button + `/autopilot` route
  - Replace the mock Auto Pilot button in `ConversationSidebar.tsx` to navigate
    to the new `AutoPilotPage`.
  - _Requirements: 16.1_
- [ ] 19.3 Client: `MissionSetupWizard`
  - Form for goal/niche/brand voice/mode/guardrails with validation + retained
    values on error.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
- [ ] 19.4 Client: `MissionControlDashboard`
  - Goal progress widget, pending approvals (count + contents), activity log;
    live updates over the WebSocket channel.
  - _Requirements: 16.4, 16.5_
- [ ] 19.5 Client: `ApprovalCard` + `ContentBriefCard` + `MediaPoolPanel`
  - Render in VeeGPT chat via `renderMessageCard`; approve/edit/reject actions;
    media upload + brief delivery.
  - _Requirements: 4.3, 4.5, 6.1, 7.8_

- [ ] 20. Integration + end-to-end verification
- [ ] 20.1 Wiring integration tests
  - Queues null-safe without Redis; publish writes `ContentModel` + calls
    publisher; approval endpoints transition state; automation go-live toggles
    the rule.
  - _Requirements: 11.2, 12.1, 12.2_
- [ ] 20.2 Full-cycle orchestrator scenarios
  - Copilot cycle, Autopilot cycle, brief→AI-backup, brief→reschedule,
    publish-retry-exhaustion, budget-exceeded, pause-suspends-ACT.
  - _Requirements: 3, 4, 5, 7, 12, 14_
- [ ] 20.3 Run diagnostics, typecheck, and the full test suite; fix failures
  - _Requirements: all_

## Task Dependency Graph

```
1 (scaffold)
├── 2 (models + repos)
│   ├── 3 (pure logic: lead-time, guardrail math, cost projection)
│   │   ├── 4 (guardrail + credit enforcement)
│   │   └── 3.1 → 9.2 (planner uses lead-time)
│   ├── 5 (notification dispatch)  ── depends on 1
│   ├── 6 (audit service)          ── depends on 2
│   └── 7 (media pool)             ── depends on 2
│
├── 8 (SENSE + THINK)              ── depends on 2
│   └── 9 (PLAN)                   ── depends on 3.1, 7, 8
│       └── 10 (content brief)     ── depends on 5, 9
│           └── 11 (content gen + captions) ── depends on 7, 10
│               └── 12 (automation decision) ── depends on 11
│                   └── 13 (GATE)  ── depends on 4, 5, 6, 12
│                       └── 14 (ACT publish) ── depends on 6, 13
│                           └── 15 (automation lifecycle) ── depends on 12, 14
│                               └── 16 (MEASURE + LEARN)  ── depends on 8, 14
│                                   └── 17 (orchestrator + loop) ── depends on 8–16
│
├── 18 (REST API)                  ── depends on 2, 4, 7, 17
├── 19 (chat bridge + client UI)   ── depends on 17, 18
└── 20 (integration + e2e verify)  ── depends on 17, 18, 19
```

Critical path: **1 → 2 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20**.
Tasks 3, 5, 6, 7 can proceed in parallel once their dependency (1 or 2) is met.

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "dependsOn": [] },
    { "wave": 2, "tasks": ["2"], "dependsOn": ["1"] },
    { "wave": 3, "tasks": ["3", "5", "6", "7", "8"], "dependsOn": ["2"] },
    { "wave": 4, "tasks": ["4", "9"], "dependsOn": ["3", "7", "8"] },
    { "wave": 5, "tasks": ["10"], "dependsOn": ["5", "9"] },
    { "wave": 6, "tasks": ["11"], "dependsOn": ["7", "10"] },
    { "wave": 7, "tasks": ["12"], "dependsOn": ["11"] },
    { "wave": 8, "tasks": ["13"], "dependsOn": ["4", "5", "6", "12"] },
    { "wave": 9, "tasks": ["14"], "dependsOn": ["6", "13"] },
    { "wave": 10, "tasks": ["15", "16"], "dependsOn": ["14"] },
    { "wave": 11, "tasks": ["17"], "dependsOn": ["8", "9", "10", "11", "12", "13", "14", "15", "16"] },
    { "wave": 12, "tasks": ["18"], "dependsOn": ["2", "4", "7", "17"] },
    { "wave": 13, "tasks": ["19"], "dependsOn": ["17", "18"] },
    { "wave": 14, "tasks": ["20"], "dependsOn": ["17", "18", "19"] }
  ]
}
```

## Notes

- **Reuse over rebuild.** No task reimplements publishing, the automation engine,
  research, analytics, credit tracking, or notification transport — each wraps the
  existing service named in the design.
- **Graceful degradation.** Every queue follows the `researchQueue` pattern: null
  queue and inline fallback when `REDIS_URL` is absent; lazy worker init.
- **Credit safety.** All AI calls are wrapped in
  `withAIFeature('autopilot.<stage>', { userId, workspaceId }, …)` so usage is
  attributed and the budget ceiling (Property 4) holds.
- **One net-new dependency.** The `EmailNotifier` port (Task 5.1) has no transport
  yet; web email fallback is inert until an SES/Resend implementation is wired.
- **Verification.** Run `getDiagnostics`, typecheck, and the test suite after each
  major task group; Task 20.3 is the final gate.
- **Property tests** (fast-check) back the 12 correctness properties from the
  design, matching the repo's existing property-test style.
