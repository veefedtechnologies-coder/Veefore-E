/**
 * Tests for GuardrailService (pure logic: frequency cap + banned topics).
 *
 * Unit tests pin the rolling-window boundary semantics and the whole-word
 * banned-topic matching edge cases. The property tests cover:
 *   - Property 2 (frequency cap never exceeded): a schedule built by admitting
 *     actions only when `wouldExceedFrequencyCap` is false always respects the
 *     cap across any random arrival schedule; and the window arithmetic matches
 *     an independent brute-force count.
 *   - Property 3 (banned topics never ship): any content containing a banned
 *     topic as a whole word is detected, and content built solely from
 *     non-banned words is never flagged.
 *
 * Satisfies Requirements: 13.1, 13.2, 13.3 (Property 2, 3)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  GuardrailService,
  maxCountInAnyWindow,
  scheduleRespectsCap,
  type GuardrailMissionInput,
  type GuardrailAction,
} from './GuardrailService'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const ITERATIONS = 500

function mission(count: number, windowMs: number, bannedTopics: string[] = []): GuardrailMissionInput {
  return { guardrails: { postingFrequency: { count, windowMs }, bannedTopics } }
}

/** Independent O(n^2) reference: densest window anchored at each timestamp. */
function bruteForceMaxInWindow(times: number[], windowMs: number): number {
  let max = 0
  for (const anchor of times) {
    let cnt = 0
    for (const t of times) {
      if (t >= anchor && t - anchor < windowMs) cnt++
    }
    max = Math.max(max, cnt)
  }
  return max
}

// ── Frequency cap: rolling-window arithmetic ───────────────────────────────

describe('maxCountInAnyWindow — rolling-window boundary semantics (R13.2)', () => {
  it('returns 0 for an empty schedule', () => {
    expect(maxCountInAnyWindow([], DAY_MS)).toBe(0)
  })

  it('counts actions inside the same window', () => {
    const t = 1_000_000
    expect(maxCountInAnyWindow([t, t + HOUR_MS, t + 2 * HOUR_MS], DAY_MS)).toBe(3)
  })

  it('treats the window as half-open: exactly windowMs apart is a different window', () => {
    const t = 1_000_000
    expect(maxCountInAnyWindow([t, t + DAY_MS], DAY_MS)).toBe(1)
  })

  it('finds the densest sub-window, not just the endpoints', () => {
    const t = 0
    // 3 within one hour, then a lone one far later.
    const times = [t, t + 10 * MINUTE_MS, t + 20 * MINUTE_MS, t + 10 * DAY_MS]
    expect(maxCountInAnyWindow(times, HOUR_MS)).toBe(3)
  })

  it('is order-independent', () => {
    const t = 500_000
    const shuffled = [t + 2 * HOUR_MS, t, t + HOUR_MS]
    expect(maxCountInAnyWindow(shuffled, DAY_MS)).toBe(3)
  })
})

describe('GuardrailService.wouldExceedFrequencyCap (R13.2)', () => {
  const svc = new GuardrailService()

  it('allows an action when the schedule stays within the cap', () => {
    const m = mission(3, DAY_MS)
    const existing = [0, HOUR_MS]
    expect(svc.wouldExceedFrequencyCap(m, 2 * HOUR_MS, existing)).toBe(false)
  })

  it('blocks an action that would exceed the cap within the window', () => {
    const m = mission(2, DAY_MS)
    const existing = [0, HOUR_MS]
    // Adding a 3rd within the same day exceeds cap of 2.
    expect(svc.wouldExceedFrequencyCap(m, 2 * HOUR_MS, existing)).toBe(true)
  })

  it('allows an action once earlier actions fall outside the rolling window', () => {
    const m = mission(2, DAY_MS)
    const existing = [0, HOUR_MS]
    // A day later, the first two are outside the window from the candidate.
    expect(svc.wouldExceedFrequencyCap(m, 2 * DAY_MS, existing)).toBe(false)
  })

  it('with no existing actions, a single action never exceeds a cap ≥ 1', () => {
    const m = mission(1, DAY_MS)
    expect(svc.wouldExceedFrequencyCap(m, Date.now(), [])).toBe(false)
  })
})

/**
 * Property 2 — Frequency cap never exceeded.
 *
 * Building a schedule by admitting each candidate time only when
 * `wouldExceedFrequencyCap` is false yields a schedule whose densest rolling
 * window never exceeds the cap — for any random set of arrival times, cap, and
 * window length.
 *
 * **Validates: Requirements 2.7, 13.2**
 */
describe('GuardrailService — Property 2: frequency cap never exceeded', () => {
  const svc = new GuardrailService()

  it('a guard-filtered schedule always respects the cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }), // cap
        fc.integer({ min: 1, max: 30 * DAY_MS }), // window length
        fc.array(fc.integer({ min: 0, max: 60 * DAY_MS }), { minLength: 0, maxLength: 40 }),
        (cap, windowMs, arrivals) => {
          const m = mission(cap, windowMs)
          const admitted: number[] = []
          for (const at of arrivals) {
            if (!svc.wouldExceedFrequencyCap(m, at, admitted)) {
              admitted.push(at)
            }
          }
          // Invariant: the admitted schedule never breaches the cap.
          expect(scheduleRespectsCap(admitted, cap, windowMs)).toBe(true)
          expect(maxCountInAnyWindow(admitted, windowMs)).toBeLessThanOrEqual(cap)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('wouldExceedFrequencyCap is exact: false ⇔ combined schedule respects cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 30 * DAY_MS }),
        fc.array(fc.integer({ min: 0, max: 60 * DAY_MS }), { maxLength: 30 }),
        fc.integer({ min: 0, max: 60 * DAY_MS }),
        (cap, windowMs, existing, at) => {
          const m = mission(cap, windowMs)
          const exceeds = svc.wouldExceedFrequencyCap(m, at, existing)
          const respects = scheduleRespectsCap([...existing, at], cap, windowMs)
          expect(exceeds).toBe(!respects)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('window arithmetic matches an independent brute-force count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60 * DAY_MS }), { maxLength: 40 }),
        fc.integer({ min: 1, max: 30 * DAY_MS }),
        (times, windowMs) => {
          expect(maxCountInAnyWindow(times, windowMs)).toBe(
            bruteForceMaxInWindow(times, windowMs),
          )
        },
      ),
      { numRuns: ITERATIONS },
    )
  })
})

// ── Banned topics ───────────────────────────────────────────────────────────

describe('GuardrailService — banned-topic matching (R13.3)', () => {
  const svc = new GuardrailService()

  it('detects a banned topic as a whole word, case-insensitively', () => {
    expect(svc.containsBannedTopic('Our new CRYPTO fund launches', ['crypto'])).toBe(true)
  })

  it('does not match a banned topic inside a larger word', () => {
    expect(svc.containsBannedTopic('The morning broadcast aired', ['cast'])).toBe(false)
  })

  it('matches multi-word banned phrases', () => {
    expect(svc.containsBannedTopic('a bit of hate speech here', ['hate speech'])).toBe(true)
    expect(svc.containsBannedTopic('the speech was great', ['hate speech'])).toBe(false)
  })

  it('returns every matched topic', () => {
    const matched = svc.findBannedTopics('crypto and gambling promos', ['crypto', 'gambling', 'politics'])
    expect(matched.sort()).toEqual(['crypto', 'gambling'])
  })

  it('ignores empty/blank topics and empty content', () => {
    expect(svc.findBannedTopics('anything', ['', '   '])).toEqual([])
    expect(svc.findBannedTopics('', ['crypto'])).toEqual([])
    expect(svc.findBannedTopics(null, ['crypto'])).toEqual([])
  })

  it('matches at string boundaries and around punctuation', () => {
    expect(svc.containsBannedTopic('crypto', ['crypto'])).toBe(true)
    expect(svc.containsBannedTopic('#crypto!', ['crypto'])).toBe(true)
  })
})

/**
 * Property 3 — Banned topics never ship.
 *
 * (a) Content that embeds a banned topic as a whole word is always flagged, so
 *     it can be withheld/revised before publish.
 * (b) Content built solely from words disjoint from the banned set is never
 *     flagged (no false positives that would needlessly withhold clean content).
 *
 * **Validates: Requirements 8.2, 8.5, 13.3**
 */
describe('GuardrailService — Property 3: banned topics never ship', () => {
  const svc = new GuardrailService()

  // Single lowercase alpha words, safe to compose with spaces.
  const word = fc.stringMatching(/^[a-z]{2,10}$/)

  it('always detects a banned topic embedded as a whole word', () => {
    fc.assert(
      fc.property(
        word,
        fc.array(word, { maxLength: 6 }),
        fc.array(word, { maxLength: 6 }),
        (banned, before, after) => {
          const content = [...before, banned, ...after].join(' ')
          expect(svc.containsBannedTopic(content, [banned])).toBe(true)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })

  it('never flags content whose words are disjoint from the banned set', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(word, { minLength: 1, maxLength: 8 }),
        fc.uniqueArray(word, { minLength: 1, maxLength: 6 }),
        (contentWords, bannedWords) => {
          // Keep the two sets disjoint so no whole word can match.
          const bannedSet = new Set(bannedWords)
          const cleanWords = contentWords.filter((w) => !bannedSet.has(w))
          fc.pre(cleanWords.length > 0)
          const content = cleanWords.join(' ')
          expect(svc.containsBannedTopic(content, bannedWords)).toBe(false)
        },
      ),
      { numRuns: ITERATIONS },
    )
  })
})

// ── Full guardrail check (R5.1, R13.3, R13.7, R13.8) ────────────────────────

/** A fully-populated mission for `check` covering every guardrail. */
function checkMission(
  overrides: Partial<GuardrailMissionInput['guardrails']> = {},
): GuardrailMissionInput {
  return {
    brandVoice: 'friendly, upbeat, professional',
    guardrails: {
      postingFrequency: { count: 2, windowMs: DAY_MS },
      bannedTopics: ['crypto', 'gambling'],
      creditBudget: 1000,
      approvalRequiredActions: ['publish', 'automation'],
      ...overrides,
    },
  }
}

describe('GuardrailService.check — structured guardrail evaluation (R5.1)', () => {
  const svc = new GuardrailService()

  it('passes a clean action with no violations', () => {
    const action: GuardrailAction = {
      type: 'measure',
      content: 'A behind-the-scenes look at our studio setup.',
      at: 0,
      existingActionTimes: [],
      credits: { consumed: 100, estimatedCost: 50 },
    }
    const result = svc.check(checkMission(), action)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('flags a banned topic in the content (R13.3)', () => {
    const result = svc.check(checkMission(), {
      content: 'Our new crypto fund launches soon',
    })
    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual({
      kind: 'banned-topic',
      detail: 'Content includes banned topic "crypto".',
    })
  })

  it('reports every matched banned topic', () => {
    const result = svc.check(checkMission(), {
      content: 'crypto and gambling promos',
    })
    const kinds = result.violations.filter((v) => v.kind === 'banned-topic')
    expect(kinds).toHaveLength(2)
  })

  it('flags a brand-voice assessment supplied by the caller (R5.1)', () => {
    const result = svc.check(checkMission(), {
      content: 'clean content',
      brandVoiceViolation: 'Tone is aggressive, not friendly/upbeat.',
    })
    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual({
      kind: 'brand-voice',
      detail: 'Tone is aggressive, not friendly/upbeat.',
    })
  })

  it('ignores a blank brand-voice assessment', () => {
    const result = svc.check(checkMission(), {
      content: 'clean content',
      brandVoiceViolation: '   ',
    })
    expect(result.violations.some((v) => v.kind === 'brand-voice')).toBe(false)
  })

  it('flags the frequency cap when the candidate time would exceed it (R13.2)', () => {
    const result = svc.check(checkMission(), {
      content: 'clean content',
      at: 2 * HOUR_MS,
      existingActionTimes: [0, HOUR_MS], // cap is 2/day → a 3rd exceeds it
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'frequency-cap')).toBe(true)
  })

  it('does not evaluate the frequency cap when no candidate time is given', () => {
    const result = svc.check(checkMission(), {
      content: 'clean content',
      existingActionTimes: [0, HOUR_MS, 2 * HOUR_MS],
    })
    expect(result.violations.some((v) => v.kind === 'frequency-cap')).toBe(false)
  })

  it('blocks when consumed + estimated would exceed the Credit_Budget (R13.8)', () => {
    const result = svc.check(checkMission({ creditBudget: 1000 }), {
      content: 'clean content',
      credits: { consumed: 990, estimatedCost: 20 }, // 1010 > 1000
    })
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.kind === 'credit-budget')).toBe(true)
  })

  it('allows spend that exactly reaches the Credit_Budget (not exceeding)', () => {
    const result = svc.check(checkMission({ creditBudget: 1000 }), {
      content: 'clean content',
      credits: { consumed: 990, estimatedCost: 10 }, // 1000 == budget
    })
    expect(result.violations.some((v) => v.kind === 'credit-budget')).toBe(false)
  })

  it('skips the budget check when credit figures are absent', () => {
    const result = svc.check(checkMission({ creditBudget: 1 }), {
      content: 'clean content',
    })
    expect(result.violations.some((v) => v.kind === 'credit-budget')).toBe(false)
  })

  it('flags an approval-required action that is not yet approved (R13.7)', () => {
    const result = svc.check(checkMission(), {
      type: 'publish',
      content: 'clean content',
    })
    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual({
      kind: 'approval-required',
      detail: 'Action "publish" is designated human-approval-required and awaits approval.',
    })
  })

  it('passes an approval-required action once approved (R13.7)', () => {
    const result = svc.check(checkMission(), {
      type: 'publish',
      approved: true,
      content: 'clean content',
    })
    expect(result.violations.some((v) => v.kind === 'approval-required')).toBe(false)
  })

  it('does not flag an action type outside the approval-required set', () => {
    const result = svc.check(checkMission(), {
      type: 'measure',
      content: 'clean content',
    })
    expect(result.violations.some((v) => v.kind === 'approval-required')).toBe(false)
  })

  it('collects multiple simultaneous violations', () => {
    const result = svc.check(checkMission({ creditBudget: 100 }), {
      type: 'publish',
      content: 'our crypto launch',
      at: 2 * HOUR_MS,
      existingActionTimes: [0, HOUR_MS],
      brandVoiceViolation: 'off-brand',
      credits: { consumed: 95, estimatedCost: 20 },
    })
    expect(result.ok).toBe(false)
    const kinds = result.violations.map((v) => v.kind).sort()
    expect(kinds).toEqual(
      ['approval-required', 'banned-topic', 'brand-voice', 'credit-budget', 'frequency-cap'].sort(),
    )
  })
})
