/**
 * Tests for the `autopilot-automation` worker (Engagement_Automation lifecycle, Task 15.1).
 *
 * Unit tests pin the design + requirements:
 *   - Activates an approved / guardrails-passed rule via the injected rule store,
 *     audits the success, and schedules the 90-day deactivation (R11.2, R11.4, R11.3).
 *   - Gates activation: an ineligible rule (pending approval / copilot-no-approval)
 *     is a no-op; a rejected draft is discarded and audited (R11.1, R11.7).
 *   - Retries a failing activation up to 4 attempts with 30s→300s backoff, and on
 *     exhaustion audits the failure + escalates + does NOT schedule deactivation
 *     (R11.5).
 *   - Deactivates a rule, auditing the success (R11.3, R11.4); on exhaustion it
 *     records a failure audit and does NOT escalate (R11.6).
 *
 * Property test (fast-check):
 *   - Across any activation outcome, the rule is activated (and a deactivation
 *     scheduled) IFF the toggle ultimately succeeds AND the gate allowed it —
 *     an ineligible rule is never activated (R11.1/R11.2).
 *
 * All I/O is faked (spy rule store, scripted gate, spy audit service, spy
 * dispatcher, spy scheduler), so the gate → toggle → retry → resolve flow is
 * verified without Redis, Mongo, or the real automation stack.
 *
 * Satisfies Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import {
  createAutomationJobProcessor,
  AUTOMATION_MAX_ATTEMPTS,
  AUTOMATION_RETRY_DELAYS_MS,
  AUTOMATION_MAX_RETRY_DELAY_MS,
  type AutomationRuleStore,
  type ActivationGate,
  type ActivationEligibility,
  type DeactivationScheduler,
  type AutomationWorkerDeps,
  type AutomationEscalationTargetResolver,
} from './autopilotAutomationWorker'
import type { AutopilotAutomationJobData } from '../queues/autopilotAutomationQueue'

// --- Fakes ------------------------------------------------------------------

/**
 * A spy rule store. `activateResults` / `deactivateResults` are consumed one per
 * attempt; a `'throw'` entry rejects (exercising the retry loop). Records calls.
 */
function makeRuleStore(opts: {
  activate?: Array<boolean | 'throw'>
  deactivate?: Array<boolean | 'throw'>
} = {}) {
  const activateCalls: string[] = []
  const deactivateCalls: string[] = []
  let ai = 0
  let di = 0
  const consume = (arr: Array<boolean | 'throw'> | undefined, i: number): boolean => {
    const r = arr && arr.length ? arr[Math.min(i, arr.length - 1)] : true
    if (r === 'throw') throw new Error('toggle failed')
    return r
  }
  const store: AutomationRuleStore = {
    async activate(ruleId) {
      activateCalls.push(ruleId)
      return consume(opts.activate, ai++)
    },
    async deactivate(ruleId) {
      deactivateCalls.push(ruleId)
      return consume(opts.deactivate, di++)
    },
  }
  return { store, activateCalls, deactivateCalls }
}

function allowGate(reason = 'ok'): ActivationGate {
  return { async canActivate() { return { allowed: true, reason } } }
}

function blockGate(eligibility: ActivationEligibility): ActivationGate {
  return { async canActivate() { return eligibility } }
}

function makeAuditService() {
  const records: any[] = []
  return {
    service: {
      async record(input: any) {
        records.push(input)
        return { recorded: true, escalated: false }
      },
    },
    records,
  }
}

function makeDispatcher(undelivered = false) {
  const dispatched: any[] = []
  return {
    dispatcher: {
      async dispatch(input: any) {
        dispatched.push(input)
        return { delivered: undelivered ? [] : ['in-app'], undelivered }
      },
    },
    dispatched,
  }
}

function makeScheduler(ok = true) {
  const calls: AutopilotAutomationJobData[] = []
  const scheduler: DeactivationScheduler = {
    async schedule(data) {
      calls.push(data)
      return ok
    },
  }
  return { scheduler, calls }
}

const RESOLVER: AutomationEscalationTargetResolver = {
  async resolve() {
    return { userId: 'owner-1', sessionContext: 'web' }
  },
}

const ACTIVATE_JOB: AutopilotAutomationJobData = {
  kind: 'activate',
  missionId: 'm1',
  workspaceId: 'w1',
  slotId: 's1',
  ruleId: 'r1',
  publishedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
}

const DEACTIVATE_JOB: AutopilotAutomationJobData = {
  kind: 'deactivate',
  missionId: 'm1',
  workspaceId: 'w1',
  slotId: 's1',
  ruleId: 'r1',
}

function baseDeps(overrides: Partial<AutomationWorkerDeps> = {}): AutomationWorkerDeps {
  const { store } = makeRuleStore({ activate: [true], deactivate: [true] })
  const { service } = makeAuditService()
  const { dispatcher } = makeDispatcher()
  const { scheduler } = makeScheduler()
  return {
    store,
    auditService: service,
    dispatcher,
    gate: allowGate(),
    deactivationScheduler: scheduler,
    escalationTargetResolver: RESOLVER,
    sleep: async () => {}, // no real waiting in tests
    ...overrides,
  }
}

// --- Constants --------------------------------------------------------------

describe('autopilot-automation worker — constants (R11.5, R11.6)', () => {
  it('uses 4 total attempts and 30s→300s backoff', () => {
    expect(AUTOMATION_MAX_ATTEMPTS).toBe(4)
    expect(AUTOMATION_RETRY_DELAYS_MS[0]).toBe(30_000)
    expect(AUTOMATION_RETRY_DELAYS_MS[AUTOMATION_RETRY_DELAYS_MS.length - 1]).toBe(
      AUTOMATION_MAX_RETRY_DELAY_MS,
    )
    expect(AUTOMATION_RETRY_DELAYS_MS.length).toBe(AUTOMATION_MAX_ATTEMPTS - 1)
    for (let i = 1; i < AUTOMATION_RETRY_DELAYS_MS.length; i++) {
      expect(AUTOMATION_RETRY_DELAYS_MS[i]).toBeGreaterThanOrEqual(AUTOMATION_RETRY_DELAYS_MS[i - 1])
      expect(AUTOMATION_RETRY_DELAYS_MS[i]).toBeLessThanOrEqual(AUTOMATION_MAX_RETRY_DELAY_MS)
    }
  })
})

// --- Activation happy path --------------------------------------------------

describe('autopilot-automation worker — activation (R11.2, R11.3, R11.4)', () => {
  it('activates an eligible rule, audits success, schedules 90-day deactivation', async () => {
    const rs = makeRuleStore({ activate: [true] })
    const audit = makeAuditService()
    const sched = makeScheduler()
    const process = createAutomationJobProcessor(
      baseDeps({ store: rs.store, auditService: audit.service, deactivationScheduler: sched.scheduler }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toEqual({ action: 'activated', ruleId: 'r1', attempts: 1, deactivationScheduled: true })
    expect(rs.activateCalls).toEqual(['r1'])
    // R11.4: success audited, marked reversible with a deactivate reversal op.
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({
      action: 'automation-activate',
      outcome: 'success',
      reversible: true,
      stage: 'ACT',
    })
    expect(audit.records[0].reversalOp).toMatchObject({ op: 'deactivate-rule', ruleId: 'r1' })
    // R11.3: the 90-day deactivation was scheduled for the same rule.
    expect(sched.calls).toHaveLength(1)
    expect(sched.calls[0].ruleId).toBe('r1')
  })

  it('retries a failing activation then succeeds, waiting with rising backoff (R11.5)', async () => {
    const rs = makeRuleStore({ activate: ['throw', false, true] })
    const audit = makeAuditService()
    const sleep = vi.fn(async () => {})
    const process = createAutomationJobProcessor(
      baseDeps({ store: rs.store, auditService: audit.service, sleep }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toMatchObject({ action: 'activated', attempts: 3 })
    expect(rs.activateCalls).toHaveLength(3)
    // waited twice with the rising backoff before the 3rd (successful) attempt.
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, AUTOMATION_RETRY_DELAYS_MS[0])
    expect(sleep).toHaveBeenNthCalledWith(2, AUTOMATION_RETRY_DELAYS_MS[1])
    // exactly one success audit (no per-attempt failure spam for activation).
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0].outcome).toBe('success')
  })
})

// --- Activation gating ------------------------------------------------------

describe('autopilot-automation worker — activation gating (R11.1, R11.7)', () => {
  it('skips activation for a rule pending approval (no toggle, no audit)', async () => {
    const rs = makeRuleStore({ activate: [true] })
    const audit = makeAuditService()
    const sched = makeScheduler()
    const process = createAutomationJobProcessor(
      baseDeps({
        store: rs.store,
        auditService: audit.service,
        deactivationScheduler: sched.scheduler,
        gate: blockGate({ allowed: false, reason: 'automation approval is pending' }),
      }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toEqual({ action: 'skipped', ruleId: 'r1', reason: 'automation approval is pending' })
    expect(rs.activateCalls).toHaveLength(0) // never toggled the rule (R11.1)
    expect(audit.records).toHaveLength(0)
    expect(sched.calls).toHaveLength(0)
  })

  it('discards + audits a rejected draft (R11.7)', async () => {
    const rs = makeRuleStore({ activate: [true] })
    const audit = makeAuditService()
    const process = createAutomationJobProcessor(
      baseDeps({
        store: rs.store,
        auditService: audit.service,
        gate: blockGate({ allowed: false, rejected: true, reason: 'automation draft rejected by user' }),
      }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toMatchObject({ action: 'skipped', reason: 'automation draft rejected by user' })
    expect(rs.activateCalls).toHaveLength(0)
    // R11.7: the rejection outcome is recorded in an Audit_Record.
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({ action: 'automation-activate', outcome: 'blocked' })
  })

  it('skips (never activates) when the gate itself throws', async () => {
    const rs = makeRuleStore({ activate: [true] })
    const process = createAutomationJobProcessor(
      baseDeps({
        store: rs.store,
        gate: { async canActivate() { throw new Error('db down') } },
      }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result.action).toBe('skipped')
    expect(rs.activateCalls).toHaveLength(0)
  })
})

// --- Activation exhaustion + escalation -------------------------------------

describe('autopilot-automation worker — activation exhaustion (R11.5)', () => {
  it('after 4 failed attempts audits the failure, escalates, and does not schedule deactivation', async () => {
    const rs = makeRuleStore({ activate: [false] }) // never reaches active
    const audit = makeAuditService()
    const disp = makeDispatcher()
    const sched = makeScheduler()
    const process = createAutomationJobProcessor(
      baseDeps({
        store: rs.store,
        auditService: audit.service,
        dispatcher: disp.dispatcher,
        deactivationScheduler: sched.scheduler,
        sleep: async () => {},
      }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toMatchObject({ action: 'failed', kind: 'activate', attempts: AUTOMATION_MAX_ATTEMPTS, escalated: true })
    expect(rs.activateCalls).toHaveLength(AUTOMATION_MAX_ATTEMPTS)
    // R11.5: failure recorded in an Audit_Record + Escalation delivered.
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({ action: 'automation-activate', outcome: 'failure' })
    expect(disp.dispatched).toHaveLength(1)
    expect(disp.dispatched[0]).toMatchObject({ userId: 'owner-1', workspaceId: 'w1', type: 'alert' })
    // window never opened → no stand-down scheduled.
    expect(sched.calls).toHaveLength(0)
  })

  it('prefers an explicit job target over the resolver for escalation', async () => {
    const rs = makeRuleStore({ activate: [false] })
    const disp = makeDispatcher()
    const process = createAutomationJobProcessor(
      baseDeps({ store: rs.store, dispatcher: disp.dispatcher, sleep: async () => {} }),
    )

    await process({ ...ACTIVATE_JOB, target: { userId: 'explicit-user', email: 'x@y.z' } })

    expect(disp.dispatched[0]).toMatchObject({ userId: 'explicit-user', email: 'x@y.z' })
  })

  it('resolves failed (not escalated) when there is no escalation target', async () => {
    const rs = makeRuleStore({ activate: [false] })
    const disp = makeDispatcher()
    const process = createAutomationJobProcessor(
      baseDeps({
        store: rs.store,
        dispatcher: disp.dispatcher,
        escalationTargetResolver: { async resolve() { return null } },
        sleep: async () => {},
      }),
    )

    const result = await process(ACTIVATE_JOB)

    expect(result).toMatchObject({ action: 'failed', escalated: false })
    expect(disp.dispatched).toHaveLength(0)
  })
})

// --- Deactivation -----------------------------------------------------------

describe('autopilot-automation worker — deactivation (R11.3, R11.4, R11.6)', () => {
  it('deactivates a rule and audits the success', async () => {
    const rs = makeRuleStore({ deactivate: [true] })
    const audit = makeAuditService()
    const process = createAutomationJobProcessor(
      baseDeps({ store: rs.store, auditService: audit.service }),
    )

    const result = await process(DEACTIVATE_JOB)

    expect(result).toEqual({ action: 'deactivated', ruleId: 'r1', attempts: 1 })
    expect(rs.deactivateCalls).toEqual(['r1'])
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({ action: 'automation-deactivate', outcome: 'success' })
  })

  it('after exhausted deactivation records a failure audit and does NOT escalate (R11.6)', async () => {
    const rs = makeRuleStore({ deactivate: ['throw'] })
    const audit = makeAuditService()
    const disp = makeDispatcher()
    const process = createAutomationJobProcessor(
      baseDeps({ store: rs.store, auditService: audit.service, dispatcher: disp.dispatcher, sleep: async () => {} }),
    )

    const result = await process(DEACTIVATE_JOB)

    expect(result).toMatchObject({ action: 'failed', kind: 'deactivate', attempts: AUTOMATION_MAX_ATTEMPTS, escalated: false })
    expect(rs.deactivateCalls).toHaveLength(AUTOMATION_MAX_ATTEMPTS)
    expect(audit.records).toHaveLength(1)
    expect(audit.records[0]).toMatchObject({ action: 'automation-deactivate', outcome: 'failure' })
    // R11.6 requires audit only — no User_Input_Notification for deactivation.
    expect(disp.dispatched).toHaveLength(0)
  })
})

// --- Property: activation happens iff eligible AND toggle succeeds -----------

describe('autopilot-automation worker — Property (activation gating + success)', () => {
  it('activates (and schedules stand-down) iff the gate allows AND the toggle succeeds', async () => {
    // **Validates: Requirements 11.1, 11.2**
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // gate allows?
        fc.integer({ min: 0, max: AUTOMATION_MAX_ATTEMPTS + 1 }), // leading toggle failures
        async (allowed, failuresBeforeSuccess) => {
          const rs = makeRuleStore({
            activate: (() => {
              const script: Array<boolean | 'throw'> = []
              for (let k = 0; k < failuresBeforeSuccess && k < AUTOMATION_MAX_ATTEMPTS; k++) {
                script.push(false)
              }
              if (failuresBeforeSuccess < AUTOMATION_MAX_ATTEMPTS) script.push(true)
              return script.length ? script : [false]
            })(),
          })
          const sched = makeScheduler()
          const process = createAutomationJobProcessor(
            baseDeps({
              store: rs.store,
              deactivationScheduler: sched.scheduler,
              gate: allowed
                ? allowGate()
                : blockGate({ allowed: false, reason: 'blocked' }),
              sleep: async () => {},
            }),
          )

          const result = await process(ACTIVATE_JOB)

          const toggleWouldSucceed = failuresBeforeSuccess < AUTOMATION_MAX_ATTEMPTS
          if (!allowed) {
            // Ineligible → never toggled, never activated (R11.1).
            expect(result.action).toBe('skipped')
            expect(rs.activateCalls).toHaveLength(0)
            expect(sched.calls).toHaveLength(0)
          } else if (toggleWouldSucceed) {
            expect(result.action).toBe('activated')
            expect(sched.calls).toHaveLength(1) // R11.3 stand-down scheduled
          } else {
            expect(result.action).toBe('failed')
            expect(sched.calls).toHaveLength(0)
          }
        },
      ),
      { numRuns: 60 },
    )
  })
})
