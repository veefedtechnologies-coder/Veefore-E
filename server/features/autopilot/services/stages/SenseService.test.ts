/**
 * Tests for SenseService (SENSE stage — analytics + niche trend research).
 *
 * Unit tests pin the concrete behaviours of `sense`:
 *   - happy path: both analytics and research succeed → both present, no reduced
 *     inputs, streak reset to 0, no escalation (R2.2, R3.3);
 *   - degradation: analytics unavailable → omitted, listed in reducedInputs, and
 *     recorded in an Audit_Record (R2.3, R3.7); same for research (R2.3);
 *   - research treated as unavailable when the engine is unconfigured or returns
 *     no usable signal (R2.3);
 *   - analytics-failure streak increments on failure and resets on success
 *     (R3.7);
 *   - Escalation + User_Input_Notification once the streak reaches 3 consecutive
 *     analytics failures (R3.8), identifying the affected mission;
 *   - never throws, even when audit / dispatch transports fail.
 *
 * The property test asserts the streak invariant across arbitrary sequences of
 * analytics success/failure: the streak equals the length of the current
 * trailing run of failures, and an Escalation is raised exactly on the
 * iterations where that run has reached the threshold.
 *
 * Satisfies Requirements: 2.2, 2.3, 3.3, 3.7, 3.8
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  SenseService,
  ANALYTICS_ESCALATION_STREAK,
  type PerformanceSummary,
  type SenseMissionInput,
  type SenseServiceOptions,
} from './SenseService'
import type { AuditRecordInput } from '../AutoPilotAuditService'
import type { DispatchResult, UserInputNotification } from '../NotificationDispatcher'
import type { ResearchResult } from '../../../../services/research/webResearch.service'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mission: SenseMissionInput = {
  _id: 'mission-1',
  workspaceId: 'ws-1',
  niche: 'vegan fitness',
}

/** A minimal but structurally-valid performance summary. */
function summary(): PerformanceSummary {
  return {
    overview: {
      totalViews: 100,
      totalLikes: 10,
      totalComments: 2,
      totalShares: 1,
      avgEngagement: 5,
      totalReach: 80,
      latestFollowers: 1000,
      totalFollowers: 1000,
      followerGains: 5,
      followerLosses: 1,
    },
    reach: 80,
    followers: 1000,
    growthDelta: 4,
    engagement: 5,
    posts: 3,
    period: '30D',
    growth: null,
    dailyMetrics: [],
  } as unknown as PerformanceSummary
}

/** A research result carrying a usable trend signal. */
function research(): ResearchResult {
  return {
    answer: 'High-protein vegan reels are trending.',
    keyPoints: ['protein reels', 'meal-prep carousels'],
    sources: [{ title: 'x', url: 'https://x.test', domain: 'x.test' }],
    query: 'vegan fitness',
    trends: [{ topic: 'protein reels', status: 'rising' }],
  }
}

/** Collects the notifications a dispatcher was asked to deliver. */
function recordingDispatcher(undelivered = false) {
  const calls: UserInputNotification[] = []
  const dispatch = vi.fn(async (n: UserInputNotification): Promise<DispatchResult> => {
    calls.push(n)
    return { delivered: undelivered ? [] : ['in-app'], undelivered }
  })
  return { dispatch, calls }
}

/** Collects the audit records SENSE writes. */
function recordingAudit() {
  const calls: AuditRecordInput[] = []
  const record = vi.fn(async (input: AuditRecordInput) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

/** Build a SenseService with sensible test defaults, overridable per test. */
function makeService(overrides: SenseServiceOptions = {}) {
  const audit = overrides.auditService ?? recordingAudit()
  const dispatcher = overrides.dispatcher ?? recordingDispatcher()
  const svc = new SenseService({
    analyticsReader: { getPerformanceSummary: vi.fn(async () => summary()) },
    researchRunner: vi.fn(async () => research()),
    isResearchConfigured: () => true,
    auditService: audit as any,
    dispatcher: dispatcher as any,
    ...overrides,
  })
  return { svc, audit: audit as ReturnType<typeof recordingAudit>, dispatcher: dispatcher as ReturnType<typeof recordingDispatcher> }
}

const target = { userId: 'user-1', sessionContext: 'web' as const }

// ─── Happy path (R2.2, R3.3) ─────────────────────────────────────────────

describe('SenseService.sense — happy path (R2.2, R3.3)', () => {
  it('returns both analytics and research with no reduced inputs', async () => {
    const { svc, audit, dispatcher } = makeService()

    const result = await svc.sense(mission, { previousAnalyticsFailureStreak: 2 })

    expect(result.analytics).toBeDefined()
    expect(result.research).toBeDefined()
    expect(result.reducedInputs).toEqual([])
    // A successful analytics read resets the streak (R3.7).
    expect(result.analyticsFailureStreak).toBe(0)
    expect(result.escalated).toBe(false)
    expect(audit.record).not.toHaveBeenCalled()
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('queries research with the mission niche in trends mode', async () => {
    const researchRunner = vi.fn(async () => research())
    const { svc } = makeService({ researchRunner })

    await svc.sense(mission)

    expect(researchRunner).toHaveBeenCalledWith('vegan fitness', {
      mode: 'trends',
      workspaceId: 'ws-1',
    })
  })

  it('reads analytics scoped to the workspace with the default window', async () => {
    const getPerformanceSummary = vi.fn(async () => summary())
    const { svc } = makeService({ analyticsReader: { getPerformanceSummary } })

    await svc.sense(mission)

    expect(getPerformanceSummary).toHaveBeenCalledWith('ws-1', 30)
  })
})

// ─── Degradation (R2.3, R3.7) ────────────────────────────────────────────

describe('SenseService.sense — degrades on a missing input (R2.3)', () => {
  it('omits analytics, flags it reduced, and records it when analytics throws', async () => {
    const { svc, audit } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('insights api down')
        }),
      },
    })

    const result = await svc.sense(mission, { escalationTarget: target })

    expect(result.analytics).toBeUndefined()
    expect(result.research).toBeDefined()
    expect(result.reducedInputs).toContain('analytics')
    expect(result.reducedInputs).not.toContain('research')
    // R2.3 / R3.7: the unavailable analytics input is recorded.
    const analyticsAudit = audit.calls.find((c) => c.action === 'sense.analytics-unavailable')
    expect(analyticsAudit).toBeDefined()
    expect(analyticsAudit?.stage).toBe('SENSE')
    expect(analyticsAudit?.outcome).toBe('failure')
  })

  it('treats a null analytics summary as unavailable', async () => {
    const { svc } = makeService({
      analyticsReader: { getPerformanceSummary: vi.fn(async () => null as unknown as PerformanceSummary) },
    })

    const result = await svc.sense(mission)

    expect(result.analytics).toBeUndefined()
    expect(result.reducedInputs).toContain('analytics')
    expect(result.analyticsFailureStreak).toBe(1)
  })

  it('omits research, flags it reduced, and records it when research throws', async () => {
    const { svc, audit } = makeService({
      researchRunner: vi.fn(async () => {
        throw new Error('search provider timeout')
      }),
    })

    const result = await svc.sense(mission)

    expect(result.research).toBeUndefined()
    expect(result.analytics).toBeDefined()
    expect(result.reducedInputs).toContain('research')
    // Analytics still succeeded → no analytics failure.
    expect(result.analyticsFailureStreak).toBe(0)
    expect(audit.calls.some((c) => c.action === 'sense.research-unavailable')).toBe(true)
  })

  it('treats an unconfigured research engine as unavailable without calling it', async () => {
    const researchRunner = vi.fn(async () => research())
    const { svc, audit } = makeService({
      isResearchConfigured: () => false,
      researchRunner,
    })

    const result = await svc.sense(mission)

    expect(researchRunner).not.toHaveBeenCalled()
    expect(result.research).toBeUndefined()
    expect(result.reducedInputs).toContain('research')
    expect(audit.calls.some((c) => c.action === 'sense.research-unavailable')).toBe(true)
  })

  it('treats a research result with no usable signal as unavailable', async () => {
    const empty: ResearchResult = { answer: '', keyPoints: [], sources: [], query: 'vegan fitness' }
    const { svc } = makeService({ researchRunner: vi.fn(async () => empty) })

    const result = await svc.sense(mission)

    expect(result.research).toBeUndefined()
    expect(result.reducedInputs).toContain('research')
  })

  it('degrades on both inputs at once and lists both', async () => {
    const { svc } = makeService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('down')
        }),
      },
      researchRunner: vi.fn(async () => {
        throw new Error('down')
      }),
    })

    const result = await svc.sense(mission)

    expect(result.analytics).toBeUndefined()
    expect(result.research).toBeUndefined()
    expect(result.reducedInputs).toEqual(expect.arrayContaining(['analytics', 'research']))
  })
})

// ─── Analytics-failure streak + escalation (R3.7, R3.8) ──────────────────

describe('SenseService.sense — analytics-failure streak & escalation (R3.7, R3.8)', () => {
  const failingAnalytics: SenseServiceOptions = {
    analyticsReader: {
      getPerformanceSummary: vi.fn(async () => {
        throw new Error('down')
      }),
    },
  }

  it('increments the streak from the carried-over value on failure', async () => {
    const { svc } = makeService(failingAnalytics)
    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: 1,
      escalationTarget: target,
    })
    expect(result.analyticsFailureStreak).toBe(2)
  })

  it('does not escalate before the threshold is reached', async () => {
    const { svc, dispatcher } = makeService(failingAnalytics)
    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: 1, // → 2, below the threshold of 3
      escalationTarget: target,
    })
    expect(result.escalated).toBe(false)
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('escalates with a User_Input_Notification on the 3rd consecutive failure (R3.8)', async () => {
    const { svc, dispatcher } = makeService(failingAnalytics)

    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: ANALYTICS_ESCALATION_STREAK - 1, // → 3
      escalationTarget: target,
    })

    expect(result.analyticsFailureStreak).toBe(3)
    expect(result.escalated).toBe(true)
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    const notification = dispatcher.calls[0]
    expect(notification.userId).toBe('user-1')
    expect(notification.workspaceId).toBe('ws-1')
    expect(notification.type).toBe('alert')
  })

  it('records but does not escalate when no escalation target is supplied', async () => {
    const { svc, dispatcher } = makeService(failingAnalytics)

    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: ANALYTICS_ESCALATION_STREAK - 1,
    })

    expect(result.analyticsFailureStreak).toBe(3)
    expect(result.escalated).toBe(false)
    expect(dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('reports escalated=false when the dispatcher delivered to no channel', async () => {
    const dispatcher = recordingDispatcher(true) // undelivered
    const { svc } = makeService({ ...failingAnalytics, dispatcher: dispatcher as any })

    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: 2,
      escalationTarget: target,
    })

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    expect(result.escalated).toBe(false)
  })

  it('never throws even when audit and dispatch both fail', async () => {
    const svc = new SenseService({
      analyticsReader: {
        getPerformanceSummary: vi.fn(async () => {
          throw new Error('down')
        }),
      },
      researchRunner: vi.fn(async () => {
        throw new Error('down')
      }),
      isResearchConfigured: () => true,
      auditService: {
        record: vi.fn(async () => {
          throw new Error('audit write blew up')
        }),
      } as any,
      dispatcher: {
        dispatch: vi.fn(async () => {
          throw new Error('dispatch blew up')
        }),
      } as any,
    })

    const result = await svc.sense(mission, {
      previousAnalyticsFailureStreak: 2,
      escalationTarget: target,
    })

    expect(result.reducedInputs).toEqual(expect.arrayContaining(['analytics', 'research']))
    expect(result.analyticsFailureStreak).toBe(3)
    expect(result.escalated).toBe(false)
  })
})

// ─── Property: streak tracks the trailing run of failures (R3.7, R3.8) ────
// **Validates: Requirements 3.7, 3.8**
describe('Property — the analytics-failure streak equals the trailing run of failures', () => {
  it('increments on failure, resets on success, and escalates exactly at the threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A sequence of iterations: true = analytics succeeds, false = fails.
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        async (outcomes) => {
          let streak = 0
          let expectedStreak = 0

          for (const ok of outcomes) {
            const dispatcher = recordingDispatcher()
            const svc = new SenseService({
              analyticsReader: {
                getPerformanceSummary: vi.fn(async () => {
                  if (!ok) throw new Error('down')
                  return summary()
                }),
              },
              researchRunner: vi.fn(async () => research()),
              isResearchConfigured: () => true,
              auditService: recordingAudit() as any,
              dispatcher: dispatcher as any,
            })

            const result = await svc.sense(mission, {
              previousAnalyticsFailureStreak: streak,
              escalationTarget: target,
            })

            expectedStreak = ok ? 0 : expectedStreak + 1
            expect(result.analyticsFailureStreak).toBe(expectedStreak)

            // Escalation happens iff this iteration's streak is at/over threshold.
            const shouldEscalate = !ok && expectedStreak >= ANALYTICS_ESCALATION_STREAK
            expect(dispatcher.dispatch).toHaveBeenCalledTimes(shouldEscalate ? 1 : 0)

            streak = result.analyticsFailureStreak
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
