/**
 * Tests for CreditBudgetService.projectCost (pure logic).
 *
 * Unit tests pin the per-slot cost mapping (caption + hashtags, plus media
 * generation for ai-generated slots and brief authoring for user-brief slots)
 * and confirm that `projectCost` is the exact sum of the per-slot costs across
 * a mixed Content_Plan, including the empty-plan and additivity edge cases.
 *
 * Satisfies Requirements: 14.1
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  CreditBudgetService,
  CreditTrackingUnavailableError,
  DEFAULT_AUTOPILOT_COST_TABLE,
  type AutoPilotCostTable,
  type BudgetMissionInput,
  type ConsumedCreditsReader,
  type ProjectableItem,
} from './CreditBudgetService'
import type { ContentFormat, ContentSourceKind } from '../db/models/ContentSlotModel'

const t = DEFAULT_AUTOPILOT_COST_TABLE
const BASE = t.caption + t.hashtags // every slot: caption + hashtags

function slot(format: ContentFormat, kind: ContentSourceKind): ProjectableItem {
  return { format, source: { kind } }
}

describe('CreditBudgetService.projectSlotCost — per-source cost mapping (R14.1)', () => {
  const svc = new CreditBudgetService()

  it('pool slot costs only caption + hashtags', () => {
    expect(svc.projectSlotCost(slot('photo', 'pool'))).toBe(BASE)
  })

  it('user-brief slot adds the brief-authoring cost', () => {
    expect(svc.projectSlotCost(slot('carousel', 'user-brief'))).toBe(BASE + t.brief)
  })

  it('ai-generated reel adds a video generation cost', () => {
    expect(svc.projectSlotCost(slot('reel', 'ai-generated'))).toBe(BASE + t.videoGeneration)
  })

  it('ai-generated non-reel adds an image generation cost', () => {
    expect(svc.projectSlotCost(slot('photo', 'ai-generated'))).toBe(BASE + t.imageGeneration)
    expect(svc.projectSlotCost(slot('carousel', 'ai-generated'))).toBe(BASE + t.imageGeneration)
    expect(svc.projectSlotCost(slot('story', 'ai-generated'))).toBe(BASE + t.imageGeneration)
  })
})

describe('CreditBudgetService.projectCost — sum over a plan (R14.1)', () => {
  const svc = new CreditBudgetService()

  it('an empty plan projects to 0', () => {
    expect(svc.projectCost([])).toBe(0)
  })

  it('sums the per-slot costs of a mixed plan exactly', () => {
    const plan: ProjectableItem[] = [
      slot('photo', 'pool'), // BASE
      slot('reel', 'ai-generated'), // BASE + video
      slot('carousel', 'ai-generated'), // BASE + image
      slot('photo', 'user-brief'), // BASE + brief
    ]

    const expected = 4 * BASE + t.videoGeneration + t.imageGeneration + t.brief

    expect(svc.projectCost(plan)).toBe(expected)
    // The projection is exactly the sum of the individual slot projections.
    const manual = plan.reduce((s, item) => s + svc.projectSlotCost(item), 0)
    expect(svc.projectCost(plan)).toBe(manual)
  })

  it('is additive: cost of a whole equals the sum of its parts', () => {
    const a: ProjectableItem[] = [slot('reel', 'ai-generated'), slot('photo', 'pool')]
    const b: ProjectableItem[] = [slot('story', 'user-brief'), slot('carousel', 'ai-generated')]

    expect(svc.projectCost([...a, ...b])).toBe(svc.projectCost(a) + svc.projectCost(b))
  })

  it('scales linearly with repeated identical slots', () => {
    const one = slot('photo', 'ai-generated')
    const many: ProjectableItem[] = Array.from({ length: 7 }, () => one)

    expect(svc.projectCost(many)).toBe(7 * svc.projectSlotCost(one))
  })
})

describe('CreditBudgetService — custom cost table + fractional rounding', () => {
  it('honors an injected cost table', () => {
    const table: AutoPilotCostTable = {
      caption: 1,
      hashtags: 1,
      imageGeneration: 10,
      videoGeneration: 4,
      brief: 2,
    }
    const svc = new CreditBudgetService(table)

    expect(svc.projectSlotCost(slot('photo', 'pool'))).toBe(2)
    expect(svc.projectSlotCost(slot('reel', 'ai-generated'))).toBe(6)
    expect(svc.projectCost([slot('photo', 'pool'), slot('reel', 'ai-generated')])).toBe(8)
  })

  it('rounds fractional credit sums to 2 decimals (no float drift)', () => {
    const table: AutoPilotCostTable = {
      caption: 0.1,
      hashtags: 0.2,
      imageGeneration: 0.3,
      videoGeneration: 0.3,
      brief: 0.3,
    }
    const svc = new CreditBudgetService(table)
    // 0.1 + 0.2 = 0.3 per pool slot; three of them = 0.9 exactly, not 0.30000004.
    const plan = [slot('photo', 'pool'), slot('photo', 'pool'), slot('photo', 'pool')]
    expect(svc.projectCost(plan)).toBe(0.9)
  })
})

// ─── canSpend / consumed — the I/O-backed budget gate (R14.2/14.3/14.4/14.7) ──

/** A stub reader that returns a fixed consumed figure (or null / throws). */
function reader(
  value: number | null | (() => Promise<number | null>),
): ConsumedCreditsReader {
  return {
    read: typeof value === 'function' ? value : async () => value,
  }
}

/** A minimal budget mission with the given Credit_Budget. */
function mission(creditBudget: number): BudgetMissionInput {
  return { workspaceId: 'ws-1', guardrails: { creditBudget } }
}

describe('CreditBudgetService.consumed — reads reported consumption (R14.3)', () => {
  it('returns the credits reported by the tracking, rounded to 2 decimals', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(12.005))
    await expect(svc.consumed(mission(100))).resolves.toBe(12.01)
  })

  it('returns 0 when nothing has been consumed yet', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(0))
    await expect(svc.consumed(mission(100))).resolves.toBe(0)
  })

  it('throws CreditTrackingUnavailableError when the reader returns null (R14.7)', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(null))
    await expect(svc.consumed(mission(100))).rejects.toBeInstanceOf(CreditTrackingUnavailableError)
  })

  it('throws CreditTrackingUnavailableError when the reader rejects (R14.7)', async () => {
    const svc = new CreditBudgetService(
      DEFAULT_AUTOPILOT_COST_TABLE,
      reader(async () => {
        throw new Error('mongo down')
      }),
    )
    await expect(svc.consumed(mission(100))).rejects.toBeInstanceOf(CreditTrackingUnavailableError)
  })

  it('throws when the reader reports a non-finite or negative figure (R14.7)', async () => {
    const nan = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(Number.NaN))
    await expect(nan.consumed(mission(100))).rejects.toBeInstanceOf(CreditTrackingUnavailableError)

    const neg = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(-5))
    await expect(neg.consumed(mission(100))).rejects.toBeInstanceOf(CreditTrackingUnavailableError)
  })
})

describe('CreditBudgetService.canSpend — budget ceiling gate (R14.3/14.4/14.7)', () => {
  it('allows a spend that stays strictly under the budget', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(40))
    await expect(svc.canSpend(mission(100), 30)).resolves.toBe(true)
  })

  it('allows a spend that lands exactly on the budget', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(70))
    await expect(svc.canSpend(mission(100), 30)).resolves.toBe(true)
  })

  it('withholds a spend that would exceed the budget (R14.4)', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(80))
    await expect(svc.canSpend(mission(100), 30)).resolves.toBe(false)
  })

  it('withholds when already at the budget and any further spend is requested', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(100))
    await expect(svc.canSpend(mission(100), 0.01)).resolves.toBe(false)
    // A zero-cost operation at the ceiling is still permitted.
    await expect(svc.canSpend(mission(100), 0)).resolves.toBe(true)
  })

  it('withholds when the credit tracking is unavailable (R14.7)', async () => {
    const nullReader = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(null))
    await expect(nullReader.canSpend(mission(100), 10)).resolves.toBe(false)

    const throwing = new CreditBudgetService(
      DEFAULT_AUTOPILOT_COST_TABLE,
      reader(async () => {
        throw new Error('tracking down')
      }),
    )
    await expect(throwing.canSpend(mission(100), 10)).resolves.toBe(false)
  })

  it('withholds when the projected cost cannot be computed (R14.7)', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(0))
    await expect(svc.canSpend(mission(100), Number.NaN)).resolves.toBe(false)
    await expect(svc.canSpend(mission(100), Number.POSITIVE_INFINITY)).resolves.toBe(false)
    await expect(svc.canSpend(mission(100), -1)).resolves.toBe(false)
  })

  it('withholds when the mission has an invalid Credit_Budget', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(0))
    await expect(svc.canSpend({ workspaceId: 'w', guardrails: { creditBudget: Number.NaN } }, 1))
      .resolves.toBe(false)
  })

  it('does not drift on fractional sums (0.1 + 0.2 ≤ 0.3)', async () => {
    const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(0.1))
    await expect(svc.canSpend(mission(0.3), 0.2)).resolves.toBe(true)
  })
})

// ─── Property 4: Budget is a hard ceiling ─────────────────────────────────────
// The sum of credits consumed by a Mission never exceeds its Credit_Budget; the
// operation that would cross it is withheld without spend.
// **Validates: Requirements 14.3, 14.4**
describe('Property 4 — the Credit_Budget is a hard ceiling', () => {
  it('gating every spend through canSpend never lets consumption exceed the budget', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }), // Credit_Budget (R14.6 range)
        // A sequence of operation costs (2-decimal credit amounts, incl. 0).
        fc.array(fc.integer({ min: 0, max: 200_000 }).map((n) => n / 100), { maxLength: 60 }),
        async (creditBudget, costs) => {
          // A stateful reader reflecting the credits actually spent so far.
          let spent = 0
          const svc = new CreditBudgetService(
            DEFAULT_AUTOPILOT_COST_TABLE,
            reader(async () => spent),
          )
          const m = mission(creditBudget)

          for (const cost of costs) {
            const allowed = await svc.canSpend(m, cost)
            if (allowed) {
              // The operation proceeds and consumes its credits.
              spent = Math.round((spent + cost) * 100) / 100
            }
            // Invariant: consumption never crosses the budget.
            expect(spent).toBeLessThanOrEqual(creditBudget)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('withholding is exact: canSpend is false iff the spend would exceed the budget', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 200_000_000 }).map((n) => n / 100), // consumed
        fc.integer({ min: 0, max: 2_000_000 }).map((n) => n / 100), // estimated cost
        async (creditBudget, consumed, estimatedCost) => {
          const svc = new CreditBudgetService(
            DEFAULT_AUTOPILOT_COST_TABLE,
            reader(async () => consumed),
          )
          const allowed = await svc.canSpend(mission(creditBudget), estimatedCost)
          const wouldExceed = Math.round((consumed + estimatedCost) * 100) / 100 > creditBudget
          expect(allowed).toBe(!wouldExceed)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('an unavailable tracking read always withholds, regardless of budget/cost (R14.7)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }).map((n) => n / 100),
        async (creditBudget, estimatedCost) => {
          const svc = new CreditBudgetService(DEFAULT_AUTOPILOT_COST_TABLE, reader(null))
          await expect(svc.canSpend(mission(creditBudget), estimatedCost)).resolves.toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
