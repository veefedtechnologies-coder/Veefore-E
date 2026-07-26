/**
 * Tests for GateService (GATE stage — approval routing).
 *
 * Unit tests pin the routing rule from the design + requirements:
 *   - Copilot: every item is emitted as an Approval_Card, none auto-executed (R4.1/R4.2).
 *   - Autopilot + guardrails pass: item is auto-executed, no card (R5.1).
 *   - Autopilot + guardrail violation: item is emitted as a card, not executed ("else card").
 *   - Autopilot + approval-required action: item is emitted as a card even though other
 *     guardrails pass (R5.2).
 *
 * A property test covers the invariant: every routed item is either auto-executed
 * or has a card, never both, and Copilot never auto-executes.
 *
 * All I/O is faked (an in-memory approval store, a spy dispatcher, the real pure
 * GuardrailService), so routing is verified without a database or a transport.
 *
 * Satisfies Requirements: 4.1, 4.2, 5.1, 5.2
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  GateService,
  type GateMissionInput,
  type GateableItem,
  type GateApprovalStore,
  type GateNotificationDispatcher,
} from './GateService'
import { GuardrailService } from '../GuardrailService'
import type { IApproval } from '../../db/models'
import type { OperatingMode } from '../../db/models'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
let idCounter = 0

/** In-memory approval store recording every created doc. */
function makeApprovalStore(): GateApprovalStore & { created: Partial<IApproval>[] } {
  const created: Partial<IApproval>[] = []
  return {
    created,
    async create(doc: Partial<IApproval>) {
      const withId = { ...doc, _id: `approval-${++idCounter}` }
      created.push(withId)
      return withId as unknown as IApproval
    },
  }
}

/** A dispatcher spy that always "delivers" on in-app. */
function makeDispatcher(): GateNotificationDispatcher & { calls: any[] } {
  const calls: any[] = []
  return {
    calls,
    async dispatch(input: any) {
      calls.push(input)
      return { delivered: ['in-app'], undelivered: false }
    },
  }
}

function mission(
  operatingMode: OperatingMode,
  overrides: Partial<GateMissionInput> = {},
): GateMissionInput {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    operatingMode,
    brandVoice: 'friendly and upbeat',
    guardrails: {
      postingFrequency: { count: 3, per: 'week', windowMs: WEEK_MS },
      bannedTopics: ['politics'],
      creditBudget: 1000,
      approvalRequiredActions: ['publish'],
    },
    ...overrides,
  }
}

/** A clean item that passes every guardrail (not approval-required). */
function cleanItem(overrides: Partial<GateableItem> = {}): GateableItem {
  return {
    itemType: 'caption',
    itemRef: 'slot-1',
    action: {
      type: 'caption',
      content: 'A lovely sunny photo of our new product.',
      at: Date.now(),
      existingActionTimes: [],
      credits: { consumed: 10, estimatedCost: 5 },
    },
    ...overrides,
  }
}

function makeService(store = makeApprovalStore(), dispatcher = makeDispatcher()) {
  const service = new GateService({
    guardrailService: new GuardrailService(),
    approvalStore: store,
    dispatcher,
  })
  return { service, store, dispatcher }
}

describe('GateService.route — Copilot mode (R4.1/R4.2)', () => {
  it('emits an Approval_Card for every item and auto-executes none', async () => {
    const { service, store } = makeService()
    const items: GateableItem[] = [
      cleanItem({ itemType: 'content-slot', itemRef: 'slot-1' }),
      cleanItem({ itemType: 'caption', itemRef: 'slot-1' }),
      cleanItem({ itemType: 'automation', itemRef: 'rule-1' }),
    ]

    const result = await service.route(mission('copilot'), items)

    expect(result.autoExecute).toHaveLength(0)
    expect(result.approvals).toHaveLength(3)
    expect(store.created).toHaveLength(3)
    expect(result.routed.every((r) => r.decision === 'approval-required')).toBe(true)
    // Even a clean, non-approval-required item is carded in Copilot.
    for (const created of store.created) {
      expect(created.status).toBe('pending')
      expect(created.missionId).toBe('mission-1')
      expect(created.workspaceId).toBe('ws-1')
    }
  })

  it('sets the approval expiry to the slot publish time (R4.7)', async () => {
    const { service, store } = makeService()
    const expiresAt = new Date(Date.now() + WEEK_MS)
    await service.route(mission('copilot'), [
      cleanItem({ itemType: 'content-slot', itemRef: 'slot-1', expiresAt }),
    ])
    expect(store.created[0].expiresAt).toEqual(expiresAt)
  })

  it('dispatches a User_Input_Notification per card when a notify target is given', async () => {
    const { service, dispatcher } = makeService()
    await service.route(mission('copilot'), [cleanItem(), cleanItem({ itemRef: 'slot-2' })], {
      notify: { userId: 'user-1', email: 'creator@example.com' },
    })
    expect(dispatcher.calls).toHaveLength(2)
    expect(dispatcher.calls[0].userId).toBe('user-1')
    expect(dispatcher.calls[0].workspaceId).toBe('ws-1')
  })
})

describe('GateService.route — Autopilot mode (R5.1/R5.2)', () => {
  it('auto-executes an item when guardrails pass', async () => {
    const { service, store } = makeService()
    // Not approval-required: an automation (only "publish" is approval-gated here).
    const item = cleanItem({ itemType: 'automation', itemRef: 'rule-1', action: { type: 'automation', content: 'Tag a friend below!', at: Date.now(), existingActionTimes: [], credits: { consumed: 0, estimatedCost: 1 } } })

    const result = await service.route(mission('autopilot'), [item])

    expect(result.autoExecute).toHaveLength(1)
    expect(result.approvals).toHaveLength(0)
    expect(store.created).toHaveLength(0)
    expect(result.routed[0].decision).toBe('auto-execute')
    expect(result.routed[0].guardrail.ok).toBe(true)
  })

  it('emits a card (no auto-execute) when a guardrail is violated', async () => {
    const { service, store } = makeService()
    const bannedItem = cleanItem({
      itemType: 'caption',
      itemRef: 'slot-1',
      action: {
        type: 'caption',
        content: 'Here are my thoughts on politics today.',
        at: Date.now(),
        existingActionTimes: [],
      },
    })

    const result = await service.route(mission('autopilot'), [bannedItem])

    expect(result.autoExecute).toHaveLength(0)
    expect(result.approvals).toHaveLength(1)
    expect(store.created).toHaveLength(1)
    expect(result.routed[0].decision).toBe('approval-required')
    expect(result.routed[0].guardrail.violations.some((v) => v.kind === 'banned-topic')).toBe(true)
  })

  it('emits a card for a human-approval-required action even when other guardrails pass (R5.2)', async () => {
    const { service, store } = makeService()
    // A clean publish action, but "publish" is designated approval-required and
    // not yet approved → guardrail check fails on approval-required → card.
    const publishItem = cleanItem({
      itemType: 'content-slot',
      itemRef: 'slot-1',
      action: {
        type: 'publish',
        approved: false,
        content: 'Clean on-brand caption.',
        at: Date.now(),
        existingActionTimes: [],
        credits: { consumed: 0, estimatedCost: 1 },
      },
    })

    const result = await service.route(mission('autopilot'), [publishItem])

    expect(result.autoExecute).toHaveLength(0)
    expect(result.approvals).toHaveLength(1)
    expect(store.created).toHaveLength(1)
    expect(result.routed[0].decision).toBe('approval-required')
    expect(result.routed[0].guardrail.violations.some((v) => v.kind === 'approval-required')).toBe(
      true,
    )
    expect(result.routed[0].reason).toMatch(/human-approval-required/i)
  })

  it('auto-executes an approval-required action once it is approved', async () => {
    const { service } = makeService()
    const approvedPublish = cleanItem({
      itemType: 'content-slot',
      itemRef: 'slot-1',
      action: {
        type: 'publish',
        approved: true,
        content: 'Clean on-brand caption.',
        at: Date.now(),
        existingActionTimes: [],
      },
    })

    const result = await service.route(mission('autopilot'), [approvedPublish])
    expect(result.routed[0].decision).toBe('auto-execute')
    expect(result.autoExecute).toHaveLength(1)
  })

  it('routes a mixed batch: clean items execute, violating items get cards', async () => {
    const { service } = makeService()
    const items: GateableItem[] = [
      cleanItem({ itemType: 'automation', itemRef: 'rule-1', action: { type: 'automation', content: 'clean', at: Date.now(), existingActionTimes: [] } }),
      cleanItem({ itemType: 'caption', itemRef: 'slot-2', action: { type: 'caption', content: 'politics rant', at: Date.now(), existingActionTimes: [] } }),
    ]

    const result = await service.route(mission('autopilot'), [...items])
    expect(result.autoExecute).toHaveLength(1)
    expect(result.approvals).toHaveLength(1)
    expect(result.routed[0].decision).toBe('auto-execute')
    expect(result.routed[1].decision).toBe('approval-required')
  })
})

describe('GateService.route — graceful degradation', () => {
  it('routes the item as approval-required with a null approval when persistence fails', async () => {
    const failingStore: GateApprovalStore = {
      async create() {
        throw new Error('db down')
      },
    }
    const dispatcher = makeDispatcher()
    const service = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: failingStore,
      dispatcher,
    })

    const result = await service.route(mission('copilot'), [cleanItem()])
    expect(result.routed[0].decision).toBe('approval-required')
    expect(result.routed[0].approval).toBeNull()
    expect(result.approvals).toHaveLength(0)
    // Notification is not attempted when the card could not be persisted.
    expect(dispatcher.calls).toHaveLength(0)
  })

  it('does not throw when the notification dispatcher fails', async () => {
    const store = makeApprovalStore()
    const throwingDispatcher: GateNotificationDispatcher = {
      async dispatch() {
        throw new Error('transport error')
      },
    }
    const service = new GateService({
      guardrailService: new GuardrailService(),
      approvalStore: store,
      dispatcher: throwingDispatcher,
    })

    const result = await service.route(mission('copilot'), [cleanItem()], {
      notify: { userId: 'user-1' },
    })
    // The approval is still persisted and returned despite the dispatch failure.
    expect(result.approvals).toHaveLength(1)
    expect(result.routed[0].approval).not.toBeNull()
  })

  it('does not dispatch when no notify target is supplied', async () => {
    const { service, dispatcher } = makeService()
    await service.route(mission('copilot'), [cleanItem()])
    expect(dispatcher.calls).toHaveLength(0)
  })
})

describe('GateService.route — routing invariants (property)', () => {
  it('each item is auto-executed XOR carded; Copilot never auto-executes', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OperatingMode>('copilot', 'autopilot'),
        fc.array(
          fc.record({
            banned: fc.boolean(),
            approvalRequired: fc.boolean(),
          }),
          { minLength: 0, maxLength: 8 },
        ),
        async (mode, specs) => {
          const { service } = makeService()
          const items: GateableItem[] = specs.map((spec, i) => ({
            itemType: 'caption',
            itemRef: `slot-${i}`,
            action: {
              type: spec.approvalRequired ? 'publish' : 'caption',
              approved: false,
              content: spec.banned ? 'a politics take' : 'a clean on-brand caption',
              at: Date.now(),
              existingActionTimes: [],
            },
          }))

          const result = await service.route(mission(mode), items)

          // Exactly one decision per item, and the union covers every item.
          expect(result.routed).toHaveLength(items.length)
          const autoCount = result.routed.filter((r) => r.decision === 'auto-execute').length
          const cardCount = result.routed.filter((r) => r.decision === 'approval-required').length
          expect(autoCount + cardCount).toBe(items.length)
          expect(result.autoExecute).toHaveLength(autoCount)

          if (mode === 'copilot') {
            // R4.1/R4.2: Copilot cards everything, executes nothing.
            expect(autoCount).toBe(0)
          } else {
            // Autopilot: auto-executed items must have passed guardrails, and any
            // banned/approval-required item must be carded.
            for (const r of result.routed) {
              if (r.decision === 'auto-execute') {
                expect(r.guardrail.ok).toBe(true)
              }
            }
            for (let i = 0; i < specs.length; i++) {
              if (specs[i].banned || specs[i].approvalRequired) {
                expect(result.routed[i].decision).toBe('approval-required')
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
