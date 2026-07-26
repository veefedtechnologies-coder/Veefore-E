/**
 * Tests for AutoPilotAuditService (audit write with retry-then-escalate).
 *
 * Unit tests pin the concrete behaviours of `record`:
 *   - persists exactly one record capturing context / outcome / reversibility
 *     and the R13.5 reversal metadata, applying defaults;
 *   - retries the write per the policy (R17.2) and succeeds on a later attempt;
 *   - escalates via the NotificationDispatcher when the write never succeeds,
 *     identifying the affected action, and never throws.
 *
 * The property test covers Property 10 (audit completeness): for any action
 * input, a working writer records exactly one Audit_Record carrying the action's
 * context, outcome, and reversibility; and when the writer always fails, the
 * action is never silently dropped — it always results in an Escalation.
 *
 * Satisfies Requirements: 5.5, 13.5, 17.1, 17.2 (Property 10)
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  AutoPilotAuditService,
  type AuditDocumentInput,
  type AuditReader,
  type AuditRecordInput,
  type AuditReversalUpdater,
  type AuditWriter,
  type EscalationDispatcher,
  type ReversalExecutor,
} from './AutoPilotAuditService'
import type { DispatchResult } from './NotificationDispatcher'
import type { IAutoPilotAuditRecord } from '../db/models'

const ITERATIONS = 300

/** A writer that records the docs it was asked to persist and returns an id. */
function recordingWriter(): AuditWriter & { docs: AuditDocumentInput[]; calls: number } {
  const docs: AuditDocumentInput[] = []
  return {
    docs,
    calls: 0,
    async create(doc: AuditDocumentInput) {
      this.calls++
      docs.push(doc)
      return { _id: `id-${this.calls}`, ...doc } as never
    },
  }
}

/** A writer that throws for the first `failTimes` calls, then succeeds. */
function flakyWriter(failTimes: number): AuditWriter & { calls: number } {
  return {
    calls: 0,
    async create(doc: AuditDocumentInput) {
      this.calls++
      if (this.calls <= failTimes) throw new Error(`write failure #${this.calls}`)
      return { _id: `id-${this.calls}`, ...doc } as never
    },
  }
}

/** A writer that always throws. */
const alwaysFailingWriter: AuditWriter = {
  async create() {
    throw new Error('permanent write failure')
  },
}

/** A dispatcher spy that records dispatches and returns a delivered result. */
function spyDispatcher(
  result: DispatchResult = { delivered: ['in-app'], undelivered: false },
): EscalationDispatcher & { dispatched: unknown[] } {
  const dispatched: unknown[] = []
  return {
    dispatched,
    async dispatch(userInput) {
      dispatched.push(userInput)
      return result
    },
  }
}

const baseInput: AuditRecordInput = {
  missionId: 'mission-1',
  workspaceId: 'ws-1',
  stage: 'ACT',
  action: 'publish',
  triggeringContext: { slotId: 'slot-1' },
  outcome: 'success',
  reversible: true,
  preExecutionState: { status: 'scheduled' },
  reversalOp: { type: 'unpublish', postId: 'p1' },
}

describe('AutoPilotAuditService.record — happy path (R17.1, R13.5)', () => {
  it('persists exactly one record capturing context, outcome, and reversibility', async () => {
    const writer = recordingWriter()
    const svc = new AutoPilotAuditService({ writer, dispatcher: spyDispatcher() })

    const result = await svc.record(baseInput)

    expect(result.recorded).toBe(true)
    expect(result.escalated).toBe(false)
    expect(writer.calls).toBe(1)
    expect(writer.docs).toHaveLength(1)

    const doc = writer.docs[0]
    expect(doc.action).toBe('publish')
    expect(doc.stage).toBe('ACT')
    expect(doc.outcome).toBe('success')
    expect(doc.reversible).toBe(true)
    expect(doc.triggeringContext).toEqual({ slotId: 'slot-1' })
  })

  it('captures the pre-execution state and reversal op for reversible actions (R13.5)', async () => {
    const writer = recordingWriter()
    const svc = new AutoPilotAuditService({ writer })

    await svc.record(baseInput)

    expect(writer.docs[0].preExecutionState).toEqual({ status: 'scheduled' })
    expect(writer.docs[0].reversalOp).toEqual({ type: 'unpublish', postId: 'p1' })
  })

  it('applies defaults: empty context, reversible=false, no reversal metadata', async () => {
    const writer = recordingWriter()
    const svc = new AutoPilotAuditService({ writer })

    await svc.record({
      missionId: 'm',
      workspaceId: 'w',
      stage: 'SENSE',
      action: 'analytics-unavailable',
      outcome: 'failure',
    })

    const doc = writer.docs[0]
    expect(doc.triggeringContext).toEqual({})
    expect(doc.reversible).toBe(false)
    expect(doc.preExecutionState).toBeUndefined()
    expect(doc.reversalOp).toBeUndefined()
  })
})

describe('AutoPilotAuditService.record — retry policy (R17.2)', () => {
  it('retries the write and succeeds on a later attempt', async () => {
    const writer = flakyWriter(2) // fails twice, succeeds on the 3rd
    const svc = new AutoPilotAuditService({ writer, maxAttempts: 3 })

    const result = await svc.record(baseInput)

    expect(result.recorded).toBe(true)
    expect(result.escalated).toBe(false)
    expect(writer.calls).toBe(3)
  })

  it('honours retry delays via the injected sleep', async () => {
    const writer = flakyWriter(2)
    const sleep = vi.fn().mockResolvedValue(undefined)
    const svc = new AutoPilotAuditService({
      writer,
      maxAttempts: 3,
      retryDelaysMs: [10, 20],
      sleep,
    })

    await svc.record(baseInput)

    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 10)
    expect(sleep).toHaveBeenNthCalledWith(2, 20)
  })
})

describe('AutoPilotAuditService.record — escalation on persistent failure (R17.2)', () => {
  it('escalates via the dispatcher when the write never succeeds, without throwing', async () => {
    const dispatcher = spyDispatcher()
    const svc = new AutoPilotAuditService({
      writer: alwaysFailingWriter,
      dispatcher,
      maxAttempts: 3,
    })

    const result = await svc.record(baseInput, { userId: 'user-1', email: 'u@example.com' })

    expect(result.recorded).toBe(false)
    expect(result.escalated).toBe(true)
    expect(dispatcher.dispatched).toHaveLength(1)

    const notification = dispatcher.dispatched[0] as { userId: string; message: string }
    expect(notification.userId).toBe('user-1')
    // R17.2: the notification identifies the affected action.
    expect(notification.message).toContain('publish')
  })

  it('reports escalated=false when no escalation target is provided', async () => {
    const dispatcher = spyDispatcher()
    const svc = new AutoPilotAuditService({ writer: alwaysFailingWriter, dispatcher })

    const result = await svc.record(baseInput)

    expect(result.recorded).toBe(false)
    expect(result.escalated).toBe(false)
    expect(dispatcher.dispatched).toHaveLength(0)
  })

  it('reports escalated=false when the notification is undelivered on all channels', async () => {
    const dispatcher = spyDispatcher({ delivered: [], undelivered: true })
    const svc = new AutoPilotAuditService({ writer: alwaysFailingWriter, dispatcher })

    const result = await svc.record(baseInput, { userId: 'user-1' })

    expect(result.recorded).toBe(false)
    expect(result.escalated).toBe(false)
  })

  it('never throws even if the dispatcher itself throws', async () => {
    const throwingDispatcher: EscalationDispatcher = {
      async dispatch() {
        throw new Error('dispatcher down')
      },
    }
    const svc = new AutoPilotAuditService({
      writer: alwaysFailingWriter,
      dispatcher: throwingDispatcher,
    })

    const result = await svc.record(baseInput, { userId: 'user-1' })
    expect(result).toEqual({ recorded: false, escalated: false })
  })
})

/**
 * Property 10 — Every autonomous action is audited.
 *
 * (a) With a working writer, any action input produces exactly one persisted
 *     Audit_Record whose context, outcome, and reversibility match the input —
 *     never zero, never more than one.
 * (b) With a permanently failing writer, an action is never silently dropped:
 *     it always results in an Escalation (given an escalation target).
 *
 * **Validates: Requirements 5.5, 17.1**
 */
describe('AutoPilotAuditService — Property 10: every action is audited', () => {
  const stageArb = fc.constantFrom(
    'SENSE',
    'THINK',
    'PLAN',
    'GATE',
    'ACT',
    'MEASURE',
    'LEARN',
  ) as fc.Arbitrary<AuditRecordInput['stage']>
  const outcomeArb = fc.constantFrom(
    'success',
    'failure',
    'blocked',
    'deferred',
  ) as fc.Arbitrary<AuditRecordInput['outcome']>

  const inputArb: fc.Arbitrary<AuditRecordInput> = fc.record({
    missionId: fc.string({ minLength: 1, maxLength: 12 }),
    workspaceId: fc.string({ minLength: 1, maxLength: 12 }),
    stage: stageArb,
    action: fc.string({ minLength: 1, maxLength: 20 }),
    triggeringContext: fc.dictionary(fc.string({ maxLength: 6 }), fc.string({ maxLength: 6 }), {
      maxKeys: 4,
    }),
    outcome: outcomeArb,
    reversible: fc.boolean(),
  })

  it('records exactly one Audit_Record per action, capturing its fields', async () => {
    await fc.assert(
      fc.asyncProperty(inputArb, async (input) => {
        const writer = recordingWriter()
        const svc = new AutoPilotAuditService({ writer, dispatcher: spyDispatcher() })

        const result = await svc.record(input)

        // Exactly one record, and it was persisted.
        expect(result.recorded).toBe(true)
        expect(result.escalated).toBe(false)
        expect(writer.docs).toHaveLength(1)

        const doc = writer.docs[0]
        expect(doc.action).toBe(input.action)
        expect(doc.outcome).toBe(input.outcome)
        expect(doc.reversible).toBe(input.reversible)
        expect(doc.stage).toBe(input.stage)
      }),
      { numRuns: ITERATIONS },
    )
  })

  it('never silently drops an action: a permanent write failure always escalates', async () => {
    await fc.assert(
      fc.asyncProperty(inputArb, async (input) => {
        const dispatcher = spyDispatcher()
        const svc = new AutoPilotAuditService({
          writer: alwaysFailingWriter,
          dispatcher,
          maxAttempts: 2,
        })

        const result = await svc.record(input, { userId: 'user-x' })

        // Not recorded, but escalated — the action is accounted for, not lost.
        expect(result.recorded).toBe(false)
        expect(result.escalated).toBe(true)
        expect(dispatcher.dispatched).toHaveLength(1)
      }),
      { numRuns: ITERATIONS },
    )
  })
})

/**
 * Tests for AutoPilotAuditService.reverse (undo) — R13.6, R17.3, R17.4, R17.5.
 *
 *   - successful reversal of a reversible action applies the stored reversal op,
 *     stamps `reversedAt`, and notifies the user (R13.6, R17.3);
 *   - a not-reversible action is declined without touching state (R17.5);
 *   - a failed reversal preserves the pre-undo state — no `reversedAt` written —
 *     and reports that the undo could not be completed, identifying the action
 *     (R17.4).
 */

/** Build an audit-record stand-in with sensible defaults for reverse tests. */
function auditRecord(overrides: Partial<IAutoPilotAuditRecord> = {}): IAutoPilotAuditRecord {
  return {
    _id: 'audit-1',
    missionId: 'mission-1',
    workspaceId: 'ws-1',
    stage: 'ACT',
    action: 'publish',
    triggeringContext: {},
    outcome: 'success',
    reversible: true,
    preExecutionState: { status: 'scheduled' },
    reversalOp: { type: 'unpublish', postId: 'p1' },
    createdAt: new Date(),
    ...overrides,
  } as unknown as IAutoPilotAuditRecord
}

/** A reader that returns a fixed record (or null) and counts lookups. */
function fixedReader(
  record: IAutoPilotAuditRecord | null,
): AuditReader & { calls: number } {
  return {
    calls: 0,
    async findById() {
      this.calls++
      return record
    },
  }
}

/** A reversal-stamp spy that records the ids it stamped. */
function spyUpdater(ok = true): AuditReversalUpdater & { stamped: string[] } {
  const stamped: string[] = []
  return {
    stamped,
    async markReversed(auditId: string) {
      stamped.push(auditId)
      return ok
    },
  }
}

/** An executor that succeeds and records the records it reversed. */
function succeedingExecutor(): ReversalExecutor & { reversed: IAutoPilotAuditRecord[] } {
  const reversed: IAutoPilotAuditRecord[] = []
  return {
    reversed,
    async execute(record) {
      reversed.push(record)
    },
  }
}

/** An executor that always throws (reversal cannot be completed). */
const failingExecutor: ReversalExecutor = {
  async execute() {
    throw new Error('reversal transport failure')
  },
}

describe('AutoPilotAuditService.reverse — successful reversal (R13.6, R17.3)', () => {
  it('applies the stored reversal op, stamps reversedAt, and notifies the user', async () => {
    const record = auditRecord()
    const executor = succeedingExecutor()
    const updater = spyUpdater()
    const dispatcher = spyDispatcher()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(record),
      reversalUpdater: updater,
      reversalExecutor: executor,
      dispatcher,
    })

    const result = await svc.reverse('audit-1', { userId: 'user-1' })

    expect(result.reversed).toBe(true)
    expect(result.declined).toBe(false)
    expect(result.action).toBe('publish')
    expect(result.message).toContain('publish')
    expect(result.message).toContain('reversed')

    // The stored reversal op was applied to the correct record (R13.6).
    expect(executor.reversed).toHaveLength(1)
    expect(executor.reversed[0].reversalOp).toEqual({ type: 'unpublish', postId: 'p1' })

    // reversedAt was stamped, and the user was notified (R17.3).
    expect(updater.stamped).toEqual(['audit-1'])
    expect(dispatcher.dispatched).toHaveLength(1)
  })

  it('succeeds without a notification when no user is given (best-effort notify)', async () => {
    const dispatcher = spyDispatcher()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord()),
      reversalUpdater: spyUpdater(),
      reversalExecutor: succeedingExecutor(),
      dispatcher,
    })

    const result = await svc.reverse('audit-1')

    expect(result.reversed).toBe(true)
    expect(dispatcher.dispatched).toHaveLength(0)
  })
})

describe('AutoPilotAuditService.reverse — declines non-reversible actions (R17.5)', () => {
  it('declines the undo, identifies the action, and does not touch state', async () => {
    const executor = succeedingExecutor()
    const updater = spyUpdater()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord({ reversible: false, action: 'delete-media' })),
      reversalUpdater: updater,
      reversalExecutor: executor,
    })

    const result = await svc.reverse('audit-1', { userId: 'user-1' })

    expect(result.reversed).toBe(false)
    expect(result.declined).toBe(true)
    expect(result.reason).toBe('not-reversible')
    expect(result.action).toBe('delete-media')
    expect(result.message).toContain('delete-media')
    expect(result.message).toContain('cannot be undone')

    // No reversal attempted, no state changed.
    expect(executor.reversed).toHaveLength(0)
    expect(updater.stamped).toHaveLength(0)
  })

  it('declines an already-reversed action to avoid double-undo', async () => {
    const executor = succeedingExecutor()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord({ reversedAt: new Date() })),
      reversalUpdater: spyUpdater(),
      reversalExecutor: executor,
    })

    const result = await svc.reverse('audit-1')

    expect(result.reversed).toBe(false)
    expect(result.declined).toBe(true)
    expect(result.reason).toBe('already-reversed')
    expect(executor.reversed).toHaveLength(0)
  })
})

describe('AutoPilotAuditService.reverse — state preserved on failure (R17.4)', () => {
  it('does not stamp reversedAt and reports the undo could not be completed', async () => {
    const updater = spyUpdater()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord({ action: 'reschedule' })),
      reversalUpdater: updater,
      reversalExecutor: failingExecutor,
    })

    const result = await svc.reverse('audit-1', { userId: 'user-1' })

    expect(result.reversed).toBe(false)
    expect(result.declined).toBe(false)
    expect(result.reason).toBe('reversal-failed')
    expect(result.action).toBe('reschedule')
    expect(result.message).toContain('reschedule')
    expect(result.message).toContain('could not be undone')

    // R17.4: pre-undo state preserved — reversedAt was never written.
    expect(updater.stamped).toHaveLength(0)
  })

  it('reports reversal-failed when a reversible record carries no reversal op', async () => {
    const updater = spyUpdater()
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord({ reversalOp: undefined })),
      reversalUpdater: updater,
      reversalExecutor: succeedingExecutor(),
    })

    const result = await svc.reverse('audit-1')

    expect(result.reversed).toBe(false)
    expect(result.reason).toBe('reversal-failed')
    expect(updater.stamped).toHaveLength(0)
  })

  it('returns not-found when no audit record exists', async () => {
    const svc = new AutoPilotAuditService({
      reader: fixedReader(null),
      reversalExecutor: succeedingExecutor(),
    })

    const result = await svc.reverse('missing-id')

    expect(result.reversed).toBe(false)
    expect(result.declined).toBe(false)
    expect(result.reason).toBe('not-found')
    expect(result.auditId).toBe('missing-id')
  })

  it('never throws when the executor throws — always returns a result', async () => {
    const svc = new AutoPilotAuditService({
      reader: fixedReader(auditRecord()),
      reversalUpdater: spyUpdater(),
      reversalExecutor: failingExecutor,
    })

    await expect(svc.reverse('audit-1', { userId: 'user-1' })).resolves.toMatchObject({
      reversed: false,
      reason: 'reversal-failed',
    })
  })
})
