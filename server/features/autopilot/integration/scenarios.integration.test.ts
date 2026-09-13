/**
 * Auto Pilot — full-cycle orchestrator scenario tests (Task 20.2).
 *
 * Where {@link ../services/AutoPilotOrchestrator.test.ts} exercises the loop
 * *composer* with synthetic stage steps, and {@link ./wiring.integration.test.ts}
 * proves the individual processors compose correctly, these tests exercise the
 * **composed Operating Loop end-to-end** for each named scenario in the design's
 * "Testing Strategy → Orchestrator tests with fakes":
 *
 *   1. **Copilot cycle** — every planned item is routed to an Approval_Card;
 *      nothing auto-executes (R4). The real {@link GateService} +
 *      {@link ApprovalLifecycleService} drive a card through approve → executable.
 *   2. **Autopilot cycle** — guardrail-passing items auto-execute; violating or
 *      approval-required items get cards (R5), through the real GateService +
 *      real {@link GuardrailService}.
 *   3. **brief → AI-backup** — an undelivered brief at its fallback deadline
 *      substitutes AI backup media (R7.6), through the real
 *      {@link BriefResolutionService}.
 *   4. **brief → reschedule** — an undelivered brief with no producible backup
 *      reschedules the slot (R7.7).
 *   5. **publish-retry-exhaustion** — a publish that fails all attempts marks the
 *      content + slot failed and escalates (R12.5), through the real
 *      {@link createPublishJobProcessor}.
 *   6. **budget-exceeded** — a spend that would exceed the Credit_Budget is
 *      withheld (R14), through the real {@link CreditBudgetService} +
 *      GuardrailService gate.
 *   7. **pause-suspends-ACT** — a paused mission runs its read-only stages but
 *      not GATE/ACT (R3.5), through the real {@link AutoPilotOrchestrator}
 *      composed with real GateService + {@link ActPublishService} side-effect
 *      stages.
 *
 * Every scenario composes the *real* services and wires only their I/O seams to
 * deterministic in-memory fakes — no live Redis, Mongo, or Instagram API, and no
 * real timers/network (clocks + sleeps are injected).
 *
 * Satisfies Requirements: 3, 4, 5, 7, 12, 14
 */

import { describe, it, expect, vi } from 'vitest'

import { GateService, type GateMissionInput, type GateableItem } from '../services/stages/GateService'
import { ActPublishService, type ActMissionInput, type ActSlotInput } from '../services/stages/ActPublishService'
import { GuardrailService, type GuardrailMissionInput } from '../services/GuardrailService'
import {
  CreditBudgetService,
  type BudgetMissionInput,
  type ConsumedCreditsReader,
  type ProjectableItem,
} from '../services/CreditBudgetService'
import {
  BriefResolutionService,
  BACKUP_MEDIA_TYPE_BY_FORMAT,
  type ResolutionBriefStore,
  type ResolutionSlotStore,
  type ResolutionSlotPatch,
  type ResolutionBriefView,
  type ResolutionSlotView,
  type BackupMediaGenerator,
} from '../services/BriefResolutionService'
import {
  ApprovalLifecycleService,
  isExecutable,
  type ApprovalLifecycleStore,
  type ApprovalMissionLookup,
} from '../services/ApprovalLifecycleService'
import {
  createPublishJobProcessor,
  type AutopilotPublishJobData,
  type PublishContentStore,
  type PublishSlotStore,
  type Publisher,
  type PublishableContent,
} from '../workers/autopilotPublishWorker'
import {
  AutoPilotOrchestrator,
  LocalMissionLock,
  SIDE_EFFECT_STAGES,
  type LoopStageStep,
  type LoopContext,
} from '../services/AutoPilotOrchestrator'
import type {
  IApproval,
  IAutoPilotMission,
  LoopStage,
  MissionStatus,
  OperatingMode,
} from '../db/models'

// ─────────────────────────────────────────────────────────────────────────────
// Shared fakes / helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The guardrails block used across scenarios (structural, no Mongoose doc). */
function makeGuardrails(
  overrides: Partial<GuardrailMissionInput['guardrails']> = {},
): GuardrailMissionInput['guardrails'] {
  return {
    postingFrequency: { count: 3, per: 'week', windowMs: WEEK_MS } as never,
    bannedTopics: ['politics'],
    creditBudget: 1000,
    approvalRequiredActions: ['publish'],
    ...overrides,
  }
}

/** A no-op audit service satisfying `Pick<AutoPilotAuditService, 'record'>`. */
function makeAudit() {
  const records: Array<Record<string, unknown>> = []
  return {
    records,
    record: vi.fn(async (input: Record<string, unknown>) => {
      records.push(input)
      return { recorded: true, escalated: false } as never
    }),
  }
}

/** A dispatcher fake recording every dispatch and reporting delivery. */
function makeDispatcher(opts: { undelivered?: boolean } = {}) {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    dispatch: vi.fn(async (input: Record<string, unknown>) => {
      calls.push(input)
      return {
        delivered: opts.undelivered ? [] : (['in-app'] as never),
        undelivered: opts.undelivered ?? false,
      }
    }),
  }
}

/** An in-memory approval store shared by GateService (create) + the lifecycle. */
function makeApprovalStore() {
  const byId = new Map<string, IApproval>()
  let seq = 0
  const store = {
    all: () => [...byId.values()],
    get: (id: string) => byId.get(id),
    // GateApprovalStore.create
    async create(doc: Partial<IApproval>): Promise<IApproval> {
      const _id = `approval-${++seq}`
      const approval = { _id, status: 'pending', ...doc } as unknown as IApproval
      byId.set(_id, approval)
      return approval
    },
    // ApprovalLifecycleStore
    async load(id: string): Promise<IApproval | null> {
      return byId.get(id) ?? null
    },
    async decide(
      id: string,
      status: IApproval['status'],
      editedPayload?: Record<string, unknown>,
    ): Promise<IApproval | null> {
      const cur = byId.get(id)
      if (!cur) return null
      const next = {
        ...cur,
        status,
        decidedAt: new Date(),
        ...(editedPayload !== undefined ? { editedPayload } : {}),
      } as unknown as IApproval
      byId.set(id, next)
      return next
    },
    async markExpired(id: string): Promise<IApproval | null> {
      const cur = byId.get(id)
      if (!cur) return null
      const next = { ...cur, status: 'expired' } as unknown as IApproval
      byId.set(id, next)
      return next
    },
    async findExpired(): Promise<IApproval[]> {
      return [...byId.values()].filter((a) => a.status === 'pending')
    },
  }
  return store
}

function makeGateMission(mode: OperatingMode): GateMissionInput {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    operatingMode: mode,
    brandVoice: 'friendly and upbeat',
    guardrails: makeGuardrails(),
  }
}

/** A gateable content-slot item that passes all guardrails (clean caption). */
function cleanSlotItem(id: string, at: Date): GateableItem {
  return {
    itemType: 'content-slot',
    itemRef: id,
    action: { type: 'schedule', content: 'a delightful on-brand post', at, existingActionTimes: [] },
    expiresAt: at,
    title: 'Approve this post',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Copilot cycle: every item → Approval_Card, nothing auto-executes
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · Copilot cycle — every planned item is routed to an Approval_Card (R4)', () => {
  it('routes every item to approval-required, auto-executes nothing, and a card approve makes it executable', async () => {
    const approvals = makeApprovalStore()
    const dispatcher = makeDispatcher()
    const gate = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: approvals,
      dispatcher,
    })

    const at = new Date('2025-01-10T12:00:00Z')
    const items: GateableItem[] = [
      cleanSlotItem('slot-1', at),
      { itemType: 'caption', itemRef: 'slot-1', action: { content: 'a lovely caption' } },
      { itemType: 'automation', itemRef: 'rule-1', action: { content: 'comment YES for the link' } },
    ]

    const result = await gate.route(makeGateMission('copilot'), items, { notify: { userId: 'user-1' } })

    // R4.1/R4.2: nothing auto-executes; every item awaits approval.
    expect(result.autoExecute).toEqual([])
    expect(result.routed.map((r) => r.decision)).toEqual([
      'approval-required',
      'approval-required',
      'approval-required',
    ])
    expect(result.approvals).toHaveLength(3)
    expect(approvals.all().every((a) => a.status === 'pending')).toBe(true)
    // A User_Input_Notification was raised for each card.
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(3)

    // The real approval lifecycle drives one card to approved → executable (R4.6).
    const audit = makeAudit()
    const missionLookup: ApprovalMissionLookup = {
      async findById() {
        return {
          _id: 'mission-1',
          workspaceId: 'ws-1',
          operatingMode: 'copilot',
          brandVoice: 'friendly and upbeat',
          guardrails: makeGuardrails(),
        }
      },
    }
    const lifecycle = new ApprovalLifecycleService({
      approvalStore: approvals as unknown as ApprovalLifecycleStore,
      missionLookup,
      guardrailService: new GuardrailService(),
      slotFallbackResolver: { resolve: vi.fn(async () => 'rescheduled') },
      auditService: audit as never,
      dispatcher: dispatcher as never,
    })

    const firstId = String(result.approvals[0]._id)
    const approved = await lifecycle.approve(firstId)

    expect(approved.status).toBe('approved')
    expect(isExecutable(approvals.get(firstId)!.status)).toBe(true)
    // The other two remain pending — Copilot never acts on them unapproved.
    expect(approvals.all().filter((a) => a.status === 'pending')).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Autopilot cycle: guardrail-passing auto-executes; else cards
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · Autopilot cycle — guardrail-passing items auto-execute; violating/approval-required get cards (R5)', () => {
  it('auto-executes the clean item, cards the banned-topic item and the approval-required item', async () => {
    const approvals = makeApprovalStore()
    const dispatcher = makeDispatcher()
    const gate = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: approvals,
      dispatcher,
    })

    const at = new Date('2025-02-01T09:00:00Z')
    const clean = cleanSlotItem('slot-clean', at)
    // Banned-topic caption → guardrail fails → card (R5.2 · Property 3).
    const banned: GateableItem = {
      itemType: 'caption',
      itemRef: 'slot-banned',
      action: { content: 'my hot take on politics today' },
    }
    // A publish action is in approvalRequiredActions → card even in Autopilot (R5.2 · Property 6).
    const approvalRequired: GateableItem = {
      itemType: 'content-slot',
      itemRef: 'slot-approval',
      action: { type: 'publish', approved: false, content: 'clean copy', at, existingActionTimes: [] },
      expiresAt: at,
    }

    const result = await gate.route(makeGateMission('autopilot'), [clean, banned, approvalRequired], {
      notify: { userId: 'user-1' },
    })

    // Only the clean item is eligible for auto-execution (R5.1).
    expect(result.autoExecute).toEqual([clean])
    const byRef = Object.fromEntries(result.routed.map((r) => [r.item.itemRef, r]))
    expect(byRef['slot-clean'].decision).toBe('auto-execute')
    expect(byRef['slot-banned'].decision).toBe('approval-required')
    expect(byRef['slot-approval'].decision).toBe('approval-required')

    // The banned-topic violation and the approval-required designation are surfaced.
    expect(byRef['slot-banned'].guardrail.violations.some((v) => v.kind === 'banned-topic')).toBe(true)
    expect(byRef['slot-approval'].guardrail.violations.some((v) => v.kind === 'approval-required')).toBe(true)

    // Two cards emitted (the two withheld items); the clean one needs none.
    expect(result.approvals).toHaveLength(2)
    expect(approvals.all()).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 & 4 — undelivered brief → AI-backup / reschedule
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · undelivered brief resolution (R7.6/R7.7 · Property 1)', () => {
  /** In-memory brief store capturing the terminal status transitions. */
  function makeBriefStore(view: ResolutionBriefView) {
    let current = view
    const statuses: string[] = []
    const store: ResolutionBriefStore = {
      async load() {
        return current
      },
      async setStatus(_id, status) {
        statuses.push(status)
        current = { ...current, status } as ResolutionBriefView
      },
    }
    return { store, statuses }
  }

  /** In-memory slot store capturing the applied resolution patch. */
  function makeSlotStore(view: ResolutionSlotView) {
    const patches: ResolutionSlotPatch[] = []
    const store: ResolutionSlotStore = {
      async load() {
        return view
      },
      async apply(_slotId, patch) {
        patches.push(patch)
      },
    }
    return { store, patches }
  }

  /** A media-pool fake exposing only what the AI-backup path uses. */
  function makeMediaPoolFake() {
    return {
      addGeneratedMedia: vi.fn(async () => ({ _id: 'pool-item-1' })),
      assignToSlot: vi.fn(async () => undefined),
    }
  }

  it('substitutes AI backup media when a matching backup can be produced (R7.6)', async () => {
    const brief = makeBriefStore({
      _id: 'brief-1',
      missionId: 'mission-1',
      workspaceId: 'ws-1',
      slotId: 'slot-1',
      status: 'sent',
    })
    const slot = makeSlotStore({
      _id: 'slot-1',
      format: 'photo',
      scheduledAt: new Date('2025-03-01T12:00:00Z'),
      status: 'brief-sent',
    })
    const pool = makeMediaPoolFake()
    const audit = makeAudit()
    const backupGenerator: BackupMediaGenerator = {
      canGenerate: () => true,
      generate: async ({ format }) => ({
        mediaUrl: 'https://cdn.example/backup.jpg',
        mediaType: BACKUP_MEDIA_TYPE_BY_FORMAT[format],
        sizeBytes: 1024,
        format: 'jpg',
      }),
    }

    const service = new BriefResolutionService({
      briefStore: brief.store,
      slotStore: slot.store,
      mediaPoolService: pool as never,
      auditService: audit as never,
      backupGenerator,
    })

    const result = await service.resolveUndeliveredBrief('brief-1', { now: Date.now() })

    expect(result).toEqual({ status: 'resolved', resolution: 'ai-backup', slotId: 'slot-1' })
    // The slot ends with AI-backup media assigned so it never publishes empty (Property 1).
    const applied = slot.patches.at(-1)!
    expect(applied.source).toEqual({ kind: 'ai-generated', mediaPoolItemId: 'pool-item-1' })
    expect(applied.status).toBe('ready')
    expect(applied.fallbackResolution).toBe('ai-backup')
    expect(brief.statuses.at(-1)).toBe('ai-backup')
    expect(pool.addGeneratedMedia).toHaveBeenCalledTimes(1)
  })

  it('reschedules the slot when no matching backup can be produced (R7.7)', async () => {
    const originalAt = new Date('2025-03-01T12:00:00Z')
    const brief = makeBriefStore({
      _id: 'brief-2',
      missionId: 'mission-1',
      workspaceId: 'ws-1',
      slotId: 'slot-2',
      status: 'sent',
    })
    const slot = makeSlotStore({ _id: 'slot-2', format: 'reel', scheduledAt: originalAt, status: 'brief-sent' })
    const audit = makeAudit()
    // Default generator cannot produce a backup → reschedule (R7.7).
    const backupGenerator: BackupMediaGenerator = {
      canGenerate: () => false,
      generate: async () => null,
    }

    const service = new BriefResolutionService({
      briefStore: brief.store,
      slotStore: slot.store,
      mediaPoolService: {} as never,
      auditService: audit as never,
      backupGenerator,
    })

    const now = originalAt.getTime()
    const result = await service.resolveUndeliveredBrief('brief-2', { now })

    expect(result).toEqual({ status: 'resolved', resolution: 'rescheduled', slotId: 'slot-2' })
    const applied = slot.patches.at(-1)!
    expect(applied.status).toBe('rescheduled')
    expect(applied.fallbackResolution).toBe('rescheduled')
    // The slot is pushed into the future so it never publishes empty (Property 1).
    expect(applied.scheduledAt!.getTime()).toBeGreaterThan(now)
    expect(brief.statuses.at(-1)).toBe('rescheduled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — publish-retry-exhaustion → content + slot failed + escalation
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · publish-retry-exhaustion — all attempts fail → failed + escalation (R12.5)', () => {
  const PUBLISHABLE: PublishableContent = {
    accountId: 'acct-1',
    accessToken: 'token-abc',
    content: 'an on-brand caption',
    mediaFiles: [{ url: 'https://cdn.example/x.jpg', type: 'photo' }],
    hashtags: '#a #b',
    postType: 'post',
  }

  function makeContentStore() {
    const record = { id: 'c1', status: 'scheduled' as string }
    const store: PublishContentStore = {
      async claimForPublishing(contentId) {
        if (contentId !== record.id || record.status !== 'scheduled') return null
        record.status = 'publishing'
        return PUBLISHABLE
      },
      async markPublished(contentId) {
        if (contentId === record.id) record.status = 'published'
      },
      async markFailed(contentId) {
        if (contentId === record.id) record.status = 'failed'
      },
    }
    return { store, record }
  }

  function makeSlotStore() {
    const failedSlots: string[] = []
    const publishedSlots: string[] = []
    const store: PublishSlotStore = {
      async markPublished(slotId) {
        publishedSlots.push(slotId)
      },
      async markFailed(slotId) {
        failedSlots.push(slotId)
      },
    }
    return { store, failedSlots, publishedSlots }
  }

  const JOB: AutopilotPublishJobData = { missionId: 'm1', workspaceId: 'w1', slotId: 's1', contentId: 'c1' }

  it('marks content + slot failed after 4 attempts and escalates to the user', async () => {
    const cs = makeContentStore()
    const ss = makeSlotStore()
    const audit = makeAudit()
    const dispatcher = makeDispatcher()
    // A publisher that never succeeds (every attempt fails).
    const publishPost = vi.fn(async () => ({ success: false, error: 'IG 500' }))
    const publisher: Publisher = { publishPost }

    const process = createPublishJobProcessor({
      store: cs.store,
      slotStore: ss.store,
      publisher,
      auditService: audit as never,
      dispatcher: dispatcher as never,
      escalationTargetResolver: { resolve: async () => ({ userId: 'user-1', sessionContext: 'web' }) },
      sleep: async () => {}, // deterministic: no real backoff waits
    })

    const result = await process(JOB)

    expect(result).toMatchObject({ action: 'failed', contentId: 'c1', attempts: 4, escalated: true })
    // 1 initial + 3 retries = 4 total attempts (R12.3).
    expect(publishPost).toHaveBeenCalledTimes(4)
    // Content + slot left in a terminal failed state (R12.5 · Property 1); never published.
    expect(cs.record.status).toBe('failed')
    expect(ss.failedSlots).toEqual(['s1'])
    expect(ss.publishedSlots).toEqual([])
    // Every attempt is audited (R12.4) and the user is escalated to (R12.5).
    expect(audit.records).toHaveLength(4)
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', type: 'alert' }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — budget-exceeded → spend withheld (R14 · Property 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · budget-exceeded — a spend that would exceed the Credit_Budget is withheld (R14)', () => {
  it('CreditBudgetService.canSpend withholds when consumed + projected would cross the budget', async () => {
    // Consumed is close to the ceiling; the projected plan cost would cross it.
    const consumedReader: ConsumedCreditsReader = { async read() { return 995 } }
    const service = new CreditBudgetService(undefined, consumedReader)
    const mission: BudgetMissionInput = { workspaceId: 'ws-1', guardrails: { creditBudget: 1000 } }

    const plan: ProjectableItem[] = [
      { format: 'reel', source: { kind: 'ai-generated' } },
      { format: 'photo', source: { kind: 'ai-generated' } },
    ]
    const projected = service.projectCost(plan)
    expect(projected).toBeGreaterThan(0)

    // 995 consumed + a non-trivial projected cost > 1000 budget → withheld (R14.4).
    await expect(service.canSpend(mission, projected)).resolves.toBe(false)
    // A spend that stays within the ceiling is permitted.
    await expect(service.canSpend(mission, 3)).resolves.toBe(true)
  })

  it('the GATE guardrail gate withholds a budget-exceeding action (routes it to an Approval_Card, not auto-execute)', async () => {
    const approvals = makeApprovalStore()
    const gate = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: approvals,
      dispatcher: makeDispatcher(),
    })

    const at = new Date('2025-04-01T10:00:00Z')
    // consumed(950) + estimatedCost(120) = 1070 > creditBudget(1000) → credit-budget violation.
    const overBudget: GateableItem = {
      itemType: 'content-slot',
      itemRef: 'slot-budget',
      action: {
        content: 'a perfectly clean caption',
        at,
        existingActionTimes: [],
        credits: { consumed: 950, estimatedCost: 120 },
      },
      expiresAt: at,
    }

    const result = await gate.route(makeGateMission('autopilot'), [overBudget])

    // The budget-exceeding action is withheld from auto-execution (Property 4).
    expect(result.autoExecute).toEqual([])
    expect(result.routed[0].decision).toBe('approval-required')
    expect(result.routed[0].guardrail.violations.some((v) => v.kind === 'credit-budget')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — pause suspends ACT: paused mission runs read-only stages only
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario · pause-suspends-ACT — a paused mission runs read-only stages but not GATE/ACT (R3.5)', () => {
  function makeMission(status: MissionStatus): IAutoPilotMission {
    return {
      _id: 'mission-1',
      workspaceId: 'ws-1',
      accountId: 'acct-1',
      platform: 'instagram',
      operatingMode: 'autopilot',
      status,
      guardrails: makeGuardrails(),
    } as unknown as IAutoPilotMission
  }

  /**
   * Compose the real orchestrator with read-only stage steps (recording that
   * they ran) plus GATE + ACT steps that invoke the REAL {@link GateService} and
   * {@link ActPublishService} (marked `sideEffect`), so we can assert those real
   * services are never touched while paused but do run when active.
   */
  function buildHarness() {
    const order: LoopStage[] = []
    const readOnly: LoopStage[] = ['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN']
    const readOnlySteps: LoopStageStep[] = readOnly.map((stage) => ({
      stage,
      run: async (_ctx: LoopContext) => {
        order.push(stage)
        return {}
      },
    }))

    // Real GateService (autopilot) wired to an in-memory approval store.
    const gateService = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: makeApprovalStore(),
      dispatcher: makeDispatcher(),
    })
    const gateSpy = vi.spyOn(gateService, 'route')
    const gateStep: LoopStageStep = {
      stage: 'GATE',
      sideEffect: true,
      run: async (ctx: LoopContext) => {
        order.push('GATE')
        const at = new Date(ctx.now + 24 * 60 * 60 * 1000)
        await gateService.route(makeGateMission('autopilot'), [cleanSlotItem('slot-1', at)])
        return {}
      },
    }

    // Real ActPublishService wired to in-memory content/slot stores + scheduler.
    const contentCreate = vi.fn(async () => ({ _id: 'content-1' }))
    const dispatchOrDefer = vi.fn(async () => 'dispatched' as const)
    const actService = new ActPublishService({
      contentStore: { create: contentCreate, cancel: async () => {} },
      scheduler: { dispatchOrDefer },
      slotStore: { linkContent: async () => ({}), updateStatus: async () => ({}), setFallbackResolution: async () => ({}) },
      auditService: makeAudit() as never,
    })
    const actSpy = vi.spyOn(actService, 'scheduleSlotForPublishing')
    const actStep: LoopStageStep = {
      stage: 'ACT',
      sideEffect: true,
      run: async (ctx: LoopContext) => {
        order.push('ACT')
        const mission: ActMissionInput = { _id: 'mission-1', workspaceId: 'ws-1', accountId: 'acct-1', platform: 'instagram' }
        const slot: ActSlotInput = {
          _id: 'slot-1',
          scheduledAt: new Date(ctx.now + 24 * 60 * 60 * 1000),
          format: 'photo',
          theme: 'growth',
          caption: 'clean caption',
          source: { kind: 'pool', mediaPoolItemId: 'pool-1' },
          status: 'ready',
        }
        await actService.scheduleSlotForPublishing(mission, slot)
        return {}
      },
    }

    const stages: LoopStageStep[] = [...readOnlySteps, gateStep, actStep]
    return { order, stages, gateSpy, actSpy, contentCreate, dispatchOrDefer }
  }

  function makeOrchestrator(mission: IAutoPilotMission, stages: LoopStageStep[]) {
    return new AutoPilotOrchestrator({
      stages,
      lock: new LocalMissionLock(),
      audit: makeAudit() as never,
      missionLoader: { findById: async () => mission },
      // Store not "ready" so the outage-streak bookkeeping stays inert in the test.
      isStoreReady: () => false,
    })
  }

  it('skips the real GATE + ACT services while paused, running only the read-only stages', async () => {
    const h = buildHarness()
    const orchestrator = makeOrchestrator(makeMission('paused'), h.stages)

    const result = await orchestrator.runIteration('mission-1', Date.parse('2025-05-01T00:00:00Z'))

    // R3.5: GATE + ACT are suspended; the five read-only stages run.
    expect(h.order).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(result.stagesRun).toEqual(['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'])
    expect(SIDE_EFFECT_STAGES).toEqual(['GATE', 'ACT'])
    // The real side-effecting services were never touched — no autonomous action.
    expect(h.gateSpy).not.toHaveBeenCalled()
    expect(h.actSpy).not.toHaveBeenCalled()
    expect(h.contentCreate).not.toHaveBeenCalled()
    expect(h.dispatchOrDefer).not.toHaveBeenCalled()
    expect(result.completed).toBe(true)
  })

  it('runs the real GATE + ACT services when the same mission is active (contrast)', async () => {
    const h = buildHarness()
    const orchestrator = makeOrchestrator(makeMission('active'), h.stages)

    const result = await orchestrator.runIteration('mission-1', Date.parse('2025-05-01T00:00:00Z'))

    // Active: all seven stages run in canonical order and the real services fire.
    expect(h.order).toEqual(['SENSE', 'THINK', 'PLAN', 'GATE', 'ACT', 'MEASURE', 'LEARN'])
    expect(h.gateSpy).toHaveBeenCalledTimes(1)
    expect(h.actSpy).toHaveBeenCalledTimes(1)
    // ACT wrote the ContentModel execution record + registered the publish job.
    expect(h.contentCreate).toHaveBeenCalledTimes(1)
    expect(h.dispatchOrDefer).toHaveBeenCalledTimes(1)
    expect(result.completed).toBe(true)
  })
})
