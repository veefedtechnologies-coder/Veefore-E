/**
 * Tests for ApprovalLifecycleService (GATE stage — approval lifecycle · Task 13.2).
 *
 * Unit tests pin each transition from the design + requirements:
 *   - approve → approved + executable (R4.6)
 *   - edit clean → edited + executable, edited payload stored (R4.3)
 *   - edit violating guardrails → rejected edit, approval left pending in its
 *     pre-edit state, violated guardrail returned (R4.4)
 *   - reject → rejected + audited; a Content_Slot is resolved so it never
 *     publishes empty (R4.5, R5.3, R11.7)
 *   - expiry at publish time → expired + slot fallback + notify (R4.7)
 *
 * Property tests cover the two correctness properties this task owns:
 *   - Property 5 (Copilot never acts unapproved): an item is executable only
 *     after approve or a clean edit — never while pending, rejected, or expired,
 *     and never after an edit that violates guardrails.
 *   - Property 6 (approval-required honored in both modes): an approval-required
 *     item is never executable without approval, in either operating mode.
 *
 * All I/O is faked (an in-memory approval store, a spy slot resolver, the real
 * pure GuardrailService), so the lifecycle is verified without a database or a
 * notification transport.
 *
 * Satisfies Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 11.7 (Property 5, 6)
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  ApprovalLifecycleService,
  isExecutable,
  type ApprovalLifecycleStore,
  type ApprovalMissionLookup,
  type ApprovalMissionView,
  type SlotFallbackResolver,
} from './ApprovalLifecycleService'
import { GuardrailService } from './GuardrailService'
import type { IApproval, ApprovalItemType, ApprovalStatus, OperatingMode } from '../db/models'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function makeApproval(overrides: Partial<IApproval> = {}): IApproval {
  return {
    _id: 'approval-1',
    missionId: 'mission-1',
    workspaceId: 'ws-1',
    itemType: 'caption',
    itemRef: 'slot-1',
    status: 'pending',
    ...overrides,
  } as unknown as IApproval
}

/** In-memory approval store around a single mutable approval. */
function makeStore(initial: IApproval): ApprovalLifecycleStore & { current: () => IApproval } {
  let approval = initial
  return {
    current: () => approval,
    async load() {
      return approval
    },
    async decide(_id, status, editedPayload) {
      approval = {
        ...approval,
        status,
        decidedAt: new Date(),
        ...(editedPayload !== undefined ? { editedPayload } : {}),
      } as unknown as IApproval
      return approval
    },
    async markExpired() {
      approval = { ...approval, status: 'expired', decidedAt: new Date() } as unknown as IApproval
      return approval
    },
    async findExpired() {
      return approval.status === 'pending' ? [approval] : []
    },
  }
}

function makeMissionLookup(
  operatingMode: OperatingMode = 'copilot',
  overrides: Partial<ApprovalMissionView> = {},
): ApprovalMissionLookup {
  return {
    async findById() {
      return {
        _id: 'mission-1',
        workspaceId: 'ws-1',
        operatingMode,
        brandVoice: 'friendly and upbeat',
        guardrails: {
          postingFrequency: { count: 3, per: 'week', windowMs: WEEK_MS } as never,
          bannedTopics: ['politics'],
          creditBudget: 1000,
          approvalRequiredActions: ['publish'],
        },
        ...overrides,
      }
    },
  }
}

function makeSlotResolver(resolution: 'ai-backup' | 'rescheduled' = 'rescheduled') {
  return {
    resolve: vi.fn(async () => resolution),
  } satisfies SlotFallbackResolver & { resolve: ReturnType<typeof vi.fn> }
}

function makeService(opts: {
  store: ApprovalLifecycleStore
  mode?: OperatingMode
  slotResolver?: SlotFallbackResolver
  dispatcher?: { dispatch: ReturnType<typeof vi.fn> }
  audit?: { record: ReturnType<typeof vi.fn> }
}) {
  const audit = opts.audit ?? { record: vi.fn(async () => ({ recorded: true, escalated: false })) }
  const dispatcher =
    opts.dispatcher ?? { dispatch: vi.fn(async () => ({ delivered: ['in-app'], undelivered: false })) }
  const slotResolver = opts.slotResolver ?? makeSlotResolver()
  const service = new ApprovalLifecycleService({
    approvalStore: opts.store,
    missionLookup: makeMissionLookup(opts.mode ?? 'copilot'),
    guardrailService: new GuardrailService(),
    slotFallbackResolver: slotResolver,
    auditService: audit as never,
    dispatcher: dispatcher as never,
  })
  return { service, audit, dispatcher, slotResolver }
}

describe('isExecutable — the Property 5 & 6 executability rule', () => {
  it('is true only for approved and edited', () => {
    expect(isExecutable('approved')).toBe(true)
    expect(isExecutable('edited')).toBe(true)
    expect(isExecutable('pending')).toBe(false)
    expect(isExecutable('rejected')).toBe(false)
    expect(isExecutable('expired')).toBe(false)
  })
})

describe('ApprovalLifecycleService.approve (R4.6)', () => {
  it('marks a pending approval approved and executable', async () => {
    const store = makeStore(makeApproval())
    const { service, audit } = makeService({ store })

    const result = await service.approve('approval-1')

    expect(result.status).toBe('approved')
    if (result.status === 'approved') expect(result.executable).toBe(true)
    expect(store.current().status).toBe('approved')
    expect(isExecutable(store.current().status)).toBe(true)
    expect(audit.record).toHaveBeenCalledTimes(1)
  })

  it('is a no-op on an already-decided approval', async () => {
    const store = makeStore(makeApproval({ status: 'approved' }))
    const { service } = makeService({ store })
    const result = await service.approve('approval-1')
    expect(result.status).toBe('already-decided')
  })

  it('returns not-found when the approval does not exist', async () => {
    const store: ApprovalLifecycleStore = {
      async load() {
        return null
      },
      async decide() {
        return null
      },
      async markExpired() {
        return null
      },
      async findExpired() {
        return []
      },
    }
    const { service } = makeService({ store })
    const result = await service.approve('missing')
    expect(result.status).toBe('not-found')
  })
})

describe('ApprovalLifecycleService.edit (R4.3/R4.4)', () => {
  it('applies a clean edit and makes the item executable (R4.3)', async () => {
    const store = makeStore(makeApproval())
    const { service } = makeService({ store })

    const result = await service.edit('approval-1', { content: 'A lovely on-brand caption.' })

    expect(result.status).toBe('edited')
    if (result.status === 'edited') expect(result.executable).toBe(true)
    expect(store.current().status).toBe('edited')
    expect(store.current().editedPayload).toEqual({ content: 'A lovely on-brand caption.' })
  })

  it('rejects an edit that introduces a banned topic and preserves pre-edit state (R4.4)', async () => {
    const store = makeStore(makeApproval())
    const { service } = makeService({ store })

    const result = await service.edit('approval-1', { content: 'Here are my thoughts on politics.' })

    expect(result.status).toBe('edit-rejected')
    if (result.status === 'edit-rejected') {
      expect(result.violations.some((v) => v.kind === 'banned-topic')).toBe(true)
      expect(result.message).toMatch(/politics/i)
    }
    // Pre-edit state preserved: still pending, no edited payload, not executable.
    expect(store.current().status).toBe('pending')
    expect(store.current().editedPayload).toBeUndefined()
    expect(isExecutable(store.current().status)).toBe(false)
  })

  it('rejects an edit that exceeds the credit budget (R4.4)', async () => {
    const store = makeStore(makeApproval())
    const { service } = makeService({ store })

    const result = await service.edit(
      'approval-1',
      { content: 'clean caption' },
      { credits: { consumed: 995, estimatedCost: 20 } },
    )

    expect(result.status).toBe('edit-rejected')
    if (result.status === 'edit-rejected') {
      expect(result.violations.some((v) => v.kind === 'credit-budget')).toBe(true)
    }
    expect(store.current().status).toBe('pending')
  })

  it('is a no-op on an already-decided approval', async () => {
    const store = makeStore(makeApproval({ status: 'rejected' }))
    const { service } = makeService({ store })
    const result = await service.edit('approval-1', { content: 'clean' })
    expect(result.status).toBe('already-decided')
  })
})

describe('ApprovalLifecycleService.reject (R4.5/R5.3/R11.7)', () => {
  it('rejects a caption approval and audits the outcome, no slot resolution', async () => {
    const store = makeStore(makeApproval({ itemType: 'caption' }))
    const { service, audit, slotResolver } = makeService({ store })

    const result = await service.reject('approval-1')

    expect(result.status).toBe('rejected')
    expect(store.current().status).toBe('rejected')
    expect(isExecutable(store.current().status)).toBe(false)
    expect((slotResolver as { resolve: ReturnType<typeof vi.fn> }).resolve).not.toHaveBeenCalled()
    expect(audit.record).toHaveBeenCalledTimes(1)
  })

  it('resolves a rejected Content_Slot so it never publishes empty (R4.5)', async () => {
    const store = makeStore(makeApproval({ itemType: 'content-slot', itemRef: 'slot-9' }))
    const slotResolver = makeSlotResolver('rescheduled')
    const { service } = makeService({ store, slotResolver })

    const result = await service.reject('approval-1')

    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.slotResolution).toBe('rescheduled')
    expect(slotResolver.resolve).toHaveBeenCalledWith('slot-9', 'rejected')
  })

  it('is a no-op on an already-decided approval', async () => {
    const store = makeStore(makeApproval({ status: 'approved' }))
    const { service } = makeService({ store })
    const result = await service.reject('approval-1')
    expect(result.status).toBe('already-decided')
  })
})

describe('ApprovalLifecycleService.resolveExpired (R4.7)', () => {
  it('expires a pending slot card past publish time, applies fallback + notifies', async () => {
    const past = new Date(Date.now() - 60_000)
    const store = makeStore(
      makeApproval({ itemType: 'content-slot', itemRef: 'slot-3', expiresAt: past }),
    )
    const slotResolver = makeSlotResolver('rescheduled')
    const { service, dispatcher } = makeService({ store, slotResolver })

    const result = await service.resolveExpired('approval-1', {
      notify: { userId: 'user-1', email: 'creator@example.com' },
    })

    expect(result.status).toBe('expired')
    if (result.status === 'expired') {
      expect(result.slotResolution).toBe('rescheduled')
      expect(result.notified).toBe(true)
    }
    expect(store.current().status).toBe('expired')
    expect(isExecutable(store.current().status)).toBe(false)
    expect(slotResolver.resolve).toHaveBeenCalledWith('slot-3', 'expired')
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
  })

  it('does not expire a card before its publish time', async () => {
    const future = new Date(Date.now() + WEEK_MS)
    const store = makeStore(makeApproval({ itemType: 'content-slot', expiresAt: future }))
    const { service } = makeService({ store })

    const result = await service.resolveExpired('approval-1')

    expect(result.status).toBe('not-expired')
    expect(store.current().status).toBe('pending')
  })

  it('is idempotent on an already-resolved approval', async () => {
    const store = makeStore(makeApproval({ status: 'approved' }))
    const { service } = makeService({ store })
    const result = await service.resolveExpired('approval-1')
    expect(result.status).toBe('already-resolved')
  })

  it('sweeps expired pending approvals (R4.7)', async () => {
    const past = new Date(Date.now() - 60_000)
    const store = makeStore(makeApproval({ itemType: 'caption', expiresAt: past }))
    const { service } = makeService({ store })
    const result = await service.sweepExpired()
    expect(result.resolved).toBe(1)
    expect(store.current().status).toBe('expired')
  })
})

const ITEM_TYPES: ApprovalItemType[] = ['content-slot', 'caption', 'automation', 'plan', 'budget']

describe('Property 5: Copilot never acts unapproved', () => {
  it('an item is executable only after approve or a clean edit — never otherwise', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'approve' | 'edit' | 'reject' | 'expire'>(
          'approve',
          'edit',
          'reject',
          'expire',
        ),
        fc.boolean(), // whether an edit introduces a banned topic
        fc.constantFrom(...ITEM_TYPES),
        async (op, editBanned, itemType) => {
          const past = new Date(Date.now() - 1000)
          const store = makeStore(makeApproval({ itemType, expiresAt: past }))
          // Copilot: GATE cards every item, so this covers Property 5.
          const { service } = makeService({ store, mode: 'copilot' })

          let becameExecutable = false
          if (op === 'approve') {
            const r = await service.approve('approval-1')
            becameExecutable = r.status === 'approved'
          } else if (op === 'edit') {
            const content = editBanned ? 'a hot take on politics' : 'a clean on-brand caption'
            const r = await service.edit('approval-1', { content })
            becameExecutable = r.status === 'edited'
          } else if (op === 'reject') {
            await service.reject('approval-1')
          } else {
            await service.resolveExpired('approval-1')
          }

          const finalStatus = store.current().status

          // The store's executability must agree with the operation:
          //  - approve / clean-edit → executable
          //  - edit with a banned topic → NOT executable, still pending
          //  - reject → rejected (not executable)
          //  - expire → expired (not executable)
          if (op === 'approve') {
            expect(finalStatus).toBe('approved')
            expect(isExecutable(finalStatus)).toBe(true)
            expect(becameExecutable).toBe(true)
          } else if (op === 'edit' && !editBanned) {
            expect(finalStatus).toBe('edited')
            expect(isExecutable(finalStatus)).toBe(true)
          } else if (op === 'edit' && editBanned) {
            // R4.4 / Property 3: a guardrail-violating edit never ships.
            expect(finalStatus).toBe('pending')
            expect(isExecutable(finalStatus)).toBe(false)
            expect(becameExecutable).toBe(false)
          } else if (op === 'reject') {
            expect(finalStatus).toBe('rejected')
            expect(isExecutable(finalStatus)).toBe(false)
          } else {
            expect(finalStatus).toBe('expired')
            expect(isExecutable(finalStatus)).toBe(false)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('Property 6: approval-required honored in both modes', () => {
  it('an approval-required item is never executable without approval, in either mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OperatingMode>('copilot', 'autopilot'),
        fc.constantFrom<'none' | 'reject' | 'expire' | 'approve'>(
          'none',
          'reject',
          'expire',
          'approve',
        ),
        async (mode, op) => {
          const past = new Date(Date.now() - 1000)
          // A content-slot standing in for a human-approval-required publish.
          const store = makeStore(
            makeApproval({ itemType: 'content-slot', itemRef: 'slot-1', expiresAt: past }),
          )
          const { service } = makeService({ store, mode })

          // Before any decision, the pending approval is never executable —
          // regardless of operating mode (R5.2 / R13.7).
          expect(isExecutable(store.current().status)).toBe(false)

          if (op === 'approve') {
            await service.approve('approval-1')
            // Only an explicit approval makes it executable.
            expect(isExecutable(store.current().status)).toBe(true)
          } else if (op === 'reject') {
            await service.reject('approval-1')
            expect(isExecutable(store.current().status)).toBe(false)
          } else if (op === 'expire') {
            await service.resolveExpired('approval-1')
            expect(isExecutable(store.current().status)).toBe(false)
          } else {
            // No decision → still pending → still not executable in either mode.
            expect(isExecutable(store.current().status)).toBe(false)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
