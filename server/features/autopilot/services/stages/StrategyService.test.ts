/**
 * Tests for StrategyService (THINK stage — goal → strategy via LLM).
 *
 * Unit tests pin the concrete behaviours of `deriveStrategy`:
 *   - happy path: a valid LLM payload → `{ status: 'ok', strategy }` with themes,
 *     cadence, and growth actions, attributed to the mission workspace/user via
 *     withAIFeature (R2.1);
 *   - reduced-inputs propagation: the Strategy's `reducedInputs` flag mirrors
 *     SENSE's reducedInputs (R2.3);
 *   - revision inputs: prior strategy + learned insights + recent progress are
 *     fed into the prompt so THINK refines rather than regenerates (R2.6);
 *   - failure → retry-next-tick: an LLM that throws, that returns an invalid
 *     payload, or that exceeds the 300s bound → `{ status: 'retry-next-tick' }`
 *     with a THINK-stage failure Audit_Record and no thrown error (R2.1, R2.4);
 *   - never throws, even when the audit transport itself fails (R2.4).
 *
 * The property test asserts that for any valid Strategy payload the derived
 * Strategy round-trips its fields and never loses the reduced-inputs flag.
 *
 * Satisfies Requirements: 2.1, 2.4, 2.6
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  StrategyService,
  STRATEGY_AI_FEATURE,
  STRATEGY_TIMEOUT_MS,
  type Strategy,
  type StrategyMissionInput,
  type StrategyServiceOptions,
} from './StrategyService'
import type { SenseResult } from './SenseService'
import type { AuditRecordInput } from '../AutoPilotAuditService'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mission: StrategyMissionInput = {
  _id: 'mission-1',
  workspaceId: 'ws-1',
  goal: { metric: 'followers', targetValue: 10_000, startValue: 1_000 },
  niche: 'vegan fitness',
  brandVoice: 'friendly, energetic, no hype',
}

/** A SenseResult with both inputs present (no degradation). */
function senseFull(): SenseResult {
  return {
    analytics: { followers: 1000 } as unknown as SenseResult['analytics'],
    research: {
      answer: 'protein reels trending',
      keyPoints: ['reels'],
      sources: [],
      query: 'vegan fitness',
      trends: [{ topic: 'protein reels', status: 'rising' }],
    } as unknown as SenseResult['research'],
    reducedInputs: [],
    analyticsFailureStreak: 0,
    escalated: false,
  }
}

/** A SenseResult that degraded on analytics. */
function senseReduced(): SenseResult {
  return {
    research: senseFull().research,
    reducedInputs: ['analytics'],
    analyticsFailureStreak: 1,
    escalated: false,
  }
}

/** A valid raw LLM strategy payload. */
function validPayload() {
  return {
    themes: ['high-protein recipes', 'meal-prep reels'],
    cadence: { postsPer: 'week', count: 5 },
    growthActions: ['post 3 reels/week', 'reply to every comment in 1h'],
  }
}

/** Collects the audit records THINK writes. */
function recordingAudit() {
  const calls: AuditRecordInput[] = []
  const record = vi.fn(async (input: AuditRecordInput) => {
    calls.push(input)
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

/** Build a StrategyService with a stub generator + recording audit. */
function makeService(generateJSON: any, overrides: StrategyServiceOptions = {}) {
  const audit = overrides.auditService ?? recordingAudit()
  const svc = new StrategyService({
    generator: { generateJSON },
    auditService: audit as any,
    ...overrides,
  })
  return { svc, audit: audit as ReturnType<typeof recordingAudit> }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Happy path (R2.1) ────────────────────────────────────────────────────

describe('StrategyService.deriveStrategy — happy path (R2.1)', () => {
  it('returns a valid strategy with themes, cadence, and growth actions', async () => {
    const { svc } = makeService(vi.fn(async () => validPayload()))

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.status).toBe('ok')
    expect(result.strategy).toBeDefined()
    const s = result.strategy as Strategy
    expect(s.themes.length).toBeGreaterThanOrEqual(1)
    expect(s.growthActions.length).toBeGreaterThanOrEqual(1)
    expect(s.cadence).toEqual({ postsPer: 'week', count: 5 })
    expect(s.reducedInputs).toBe(false)
  })

  it('passes an AbortSignal to the LLM so the 300s bound can cancel it', async () => {
    const generateJSON = vi.fn(async (_p: string, _pref: unknown, opts?: { signal?: AbortSignal }) => {
      expect(opts?.signal).toBeInstanceOf(AbortSignal)
      return validPayload()
    })
    const { svc } = makeService(generateJSON)

    await svc.deriveStrategy(mission, senseFull())

    expect(generateJSON).toHaveBeenCalledTimes(1)
  })

  it('sends the account local language as the generation preference (R9)', async () => {
    const generateJSON = vi.fn(async () => validPayload())
    const { svc } = makeService(generateJSON)

    await svc.deriveStrategy({ ...mission, localLanguage: 'Hindi' }, senseFull())

    const prefs = generateJSON.mock.calls[0][1] as { multilingual?: string }
    expect(prefs.multilingual).toBe('Hindi')
  })

  it('trims and drops empty theme / growth-action entries', async () => {
    const { svc } = makeService(
      vi.fn(async () => ({
        themes: ['  recipes  ', '', '   '],
        cadence: { postsPer: 'day', count: 1 },
        growthActions: ['engage', ''],
      })),
    )

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.status).toBe('ok')
    expect(result.strategy?.themes).toEqual(['recipes'])
    expect(result.strategy?.growthActions).toEqual(['engage'])
  })
})

// ─── Reduced-inputs propagation (R2.3) ──────────────────────────────────────

describe('StrategyService.deriveStrategy — reduced-inputs propagation (R2.3)', () => {
  it('marks the strategy reducedInputs=true when SENSE degraded on an input', async () => {
    const { svc } = makeService(vi.fn(async () => validPayload()))

    const result = await svc.deriveStrategy(mission, senseReduced())

    expect(result.status).toBe('ok')
    expect(result.strategy?.reducedInputs).toBe(true)
  })

  it('marks reducedInputs=false when SENSE had both inputs', async () => {
    const { svc } = makeService(vi.fn(async () => validPayload()))

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.strategy?.reducedInputs).toBe(false)
  })
})

// ─── Revision from measured results (R2.6) ──────────────────────────────────

describe('StrategyService.deriveStrategy — revision inputs (R2.6)', () => {
  it('feeds prior strategy, learned insights, and recent progress into the prompt', async () => {
    const generateJSON = vi.fn(async () => validPayload())
    const { svc } = makeService(generateJSON)

    await svc.deriveStrategy(
      {
        ...mission,
        strategy: { themes: ['old theme'], cadence: { postsPer: 'week', count: 3 }, growthActions: ['x'] },
        strategyMemory: [{ insight: 'reels +40% reach' }],
        progress: [{ at: new Date('2024-01-01'), value: 1200 }],
      },
      senseFull(),
    )

    const prompt = generateJSON.mock.calls[0][0] as string
    expect(prompt).toContain('old theme')
    expect(prompt).toContain('reels +40% reach')
    expect(prompt).toContain('1200')
  })
})

// ─── withAIFeature attribution (R14.2) ──────────────────────────────────────

describe('StrategyService.deriveStrategy — credit attribution (R14.2)', () => {
  it('runs the LLM call under the autopilot.strategy AI feature', async () => {
    // The real withAIFeature only sets the async context; assert the feature
    // label is the documented one so credit spend is attributed correctly.
    expect(STRATEGY_AI_FEATURE).toBe('autopilot.strategy')

    const generateJSON = vi.fn(async () => validPayload())
    const { svc } = makeService(generateJSON)

    const result = await svc.deriveStrategy(mission, senseFull(), { userId: 'user-1' })

    expect(result.status).toBe('ok')
    expect(generateJSON).toHaveBeenCalledTimes(1)
  })
})

// ─── Failure → retry-next-tick (R2.4) ───────────────────────────────────────

describe('StrategyService.deriveStrategy — retry-next-tick on failure (R2.4)', () => {
  it('records a THINK failure audit and returns retry-next-tick when the LLM throws', async () => {
    const { svc, audit } = makeService(
      vi.fn(async () => {
        throw new Error('provider 500')
      }),
    )

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.status).toBe('retry-next-tick')
    expect(result.strategy).toBeUndefined()
    const failure = audit.calls.find((c) => c.action === 'think.strategy-failed')
    expect(failure).toBeDefined()
    expect(failure?.stage).toBe('THINK')
    expect(failure?.outcome).toBe('failure')
    expect(failure?.reversible).toBe(false)
  })

  it.each([
    ['missing themes', { cadence: { postsPer: 'week', count: 5 }, growthActions: ['x'] }],
    ['empty themes', { themes: [], cadence: { postsPer: 'week', count: 5 }, growthActions: ['x'] }],
    ['missing cadence', { themes: ['a'], growthActions: ['x'] }],
    ['invalid cadence period', { themes: ['a'], cadence: { postsPer: 'month', count: 5 }, growthActions: ['x'] }],
    ['zero cadence count', { themes: ['a'], cadence: { postsPer: 'week', count: 0 }, growthActions: ['x'] }],
    ['missing growth actions', { themes: ['a'], cadence: { postsPer: 'week', count: 5 } }],
    ['not an object', 'nonsense'],
    ['null', null],
  ])('treats an invalid payload (%s) as retry-next-tick', async (_label, payload) => {
    const { svc, audit } = makeService(vi.fn(async () => payload))

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.status).toBe('retry-next-tick')
    expect(audit.calls.some((c) => c.action === 'think.strategy-failed')).toBe(true)
  })

  it('aborts and retries next tick when the LLM exceeds the 300s bound (R2.1)', async () => {
    vi.useFakeTimers()
    let abortedByService = false
    const generateJSON = vi.fn(
      (_p: string, _pref: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          // Never resolves on its own; only the timeout should end the race.
          opts?.signal?.addEventListener('abort', () => {
            abortedByService = true
          })
        }),
    )
    const { svc, audit } = makeService(generateJSON, { timeoutMs: STRATEGY_TIMEOUT_MS })

    const promise = svc.deriveStrategy(mission, senseFull())
    // Advance past the 300s bound to trigger the timeout.
    await vi.advanceTimersByTimeAsync(STRATEGY_TIMEOUT_MS + 1)
    const result = await promise

    expect(result.status).toBe('retry-next-tick')
    expect(abortedByService).toBe(true)
    expect(audit.calls.some((c) => c.action === 'think.strategy-failed')).toBe(true)
  })

  it('never throws even when the audit transport itself fails', async () => {
    const svc = new StrategyService({
      generator: {
        generateJSON: vi.fn(async () => {
          throw new Error('provider down')
        }),
      },
      auditService: {
        record: vi.fn(async () => {
          throw new Error('audit write blew up')
        }),
      } as any,
    })

    const result = await svc.deriveStrategy(mission, senseFull())

    expect(result.status).toBe('retry-next-tick')
  })
})

// ─── Property: valid payloads round-trip; reduced flag preserved (R2.1, R2.3) ─
// **Validates: Requirements 2.1, 2.3**
describe('Property — a valid strategy payload round-trips its fields', () => {
  it('preserves themes, cadence, growth actions, and the reduced-inputs flag', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.constantFrom('day' as const, 'week' as const),
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.boolean(),
        async (themes, postsPer, count, growthActions, degraded) => {
          const svc = new StrategyService({
            generator: {
              generateJSON: vi.fn(async () => ({ themes, cadence: { postsPer, count }, growthActions })),
            },
            auditService: recordingAudit() as any,
          })

          const sense: SenseResult = {
            reducedInputs: degraded ? ['research'] : [],
            analyticsFailureStreak: 0,
            escalated: false,
          }

          const result = await svc.deriveStrategy(mission, sense)

          expect(result.status).toBe('ok')
          const s = result.strategy as Strategy
          expect(s.themes).toEqual(themes.map((t) => t.trim()))
          expect(s.growthActions).toEqual(growthActions.map((g) => g.trim()))
          expect(s.cadence).toEqual({ postsPer, count })
          expect(s.reducedInputs).toBe(degraded)
        },
      ),
      { numRuns: 100 },
    )
  })
})
