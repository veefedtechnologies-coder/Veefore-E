/**
 * Tests for AutomationDecisionService.decide (human-like automation decision · R10).
 *
 * The table-driven unit test walks **every CTA pattern in the design's decision
 * table** and asserts `decide` normalises the LLM output into the right decision:
 *   - no response-driving CTA               → no automation (R10.5);
 *   - "comment X and I'll DM you the link"   → comment-to-dm + keyword (R10.4);
 *   - "DM me X for …"                        → dm-only + keyword (R10.3);
 *   - "tag a friend / comment your thoughts" → comment-only (R10.2);
 *   - LLM failure/timeout                    → no automation (R10.7);
 *   - keyword not derivable                  → no automation (R10.7).
 *
 * The property test covers **Property 7 — exactly one automation type**: across
 * random LLM payloads, whenever `decide` returns `needsAutomation:true` exactly
 * one valid type is selected with the fields it requires, and whenever it returns
 * `needsAutomation:false` no automation type is attached.
 *
 * Satisfies Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7 (Property 7)
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  AutomationDecisionService,
  AUTOMATION_TYPES,
  AUTOPILOT_PLATFORM,
  RULE_TYPE_BY_DECISION,
  type AutomationDecision,
  type AutomationDecisionMissionInput,
  type AutomationDecisionSlotInput,
  type AutomationJSONGenerator,
} from './AutomationDecisionService'

// ── Test doubles ────────────────────────────────────────────────────────────

/** A generator that returns a fixed raw payload (what a well-behaved LLM emits). */
function fixedGenerator(payload: unknown): AutomationJSONGenerator {
  return { generateJSON: vi.fn(async () => payload) }
}

/** A generator that always throws (LLM failure). */
function throwingGenerator(message = 'provider unavailable'): AutomationJSONGenerator {
  return {
    generateJSON: vi.fn(async () => {
      throw new Error(message)
    }),
  }
}

/** A generator that never resolves before the deadline (timeout). */
function hangingGenerator(): AutomationJSONGenerator {
  return {
    generateJSON: vi.fn(
      (_prompt, _prefs, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    ),
  }
}

function makeService(generator: AutomationJSONGenerator, timeoutMs = 50): AutomationDecisionService {
  return new AutomationDecisionService({ generator, timeoutMs })
}

function mission(
  overrides: Partial<AutomationDecisionMissionInput> = {},
): AutomationDecisionMissionInput {
  return { _id: 'mission-1', workspaceId: 'ws-1', ...overrides }
}

function slot(overrides: Partial<AutomationDecisionSlotInput> = {}): AutomationDecisionSlotInput {
  return { _id: 'slot-1', format: 'reel', theme: 'launch day', ...overrides }
}

// ── Table-driven test over each CTA pattern in the design ───────────────────

interface CtaCase {
  name: string
  caption: string
  /** Raw payload the LLM returns for this caption. */
  payload: unknown
  assert: (decision: Awaited<ReturnType<AutomationDecisionService['decide']>>) => void
}

const CTA_CASES: CtaCase[] = [
  {
    name: 'no response-driving CTA → no automation (R10.5)',
    caption: 'A quiet morning with a fresh espresso. ☕',
    payload: { needsAutomation: false, reason: 'informational post, no CTA' },
    assert: (d) => {
      expect(d.needsAutomation).toBe(false)
      expect(d.type).toBeUndefined()
      expect(d.triggerKeyword).toBeUndefined()
    },
  },
  {
    name: '"comment X and I\'ll DM you the guide" → comment-to-dm (R10.4)',
    caption: "Comment GUIDE and I'll DM you the free brewing guide! 👇",
    payload: {
      needsAutomation: true,
      type: 'comment-to-dm',
      triggerKeyword: 'GUIDE',
      commentReply: 'Sent! Check your DMs 📩',
      dmMessage: "Here's your free brewing guide: https://example.com/guide",
      dmButtons: [{ label: 'Get the guide', url: 'https://example.com/guide' }],
      reason: 'caption drives comment-to-DM with keyword GUIDE',
    },
    assert: (d) => {
      expect(d.needsAutomation).toBe(true)
      expect(d.type).toBe('comment-to-dm')
      expect(d.triggerKeyword).toBe('GUIDE')
      expect(d.commentReply).toBeTruthy()
      expect(d.dmMessage).toContain('guide')
      expect(d.dmButtons).toEqual([{ label: 'Get the guide', url: 'https://example.com/guide' }])
    },
  },
  {
    name: '"DM me X for …" → dm-only (R10.3)',
    caption: 'DM me INFO for the full pricing breakdown.',
    payload: {
      needsAutomation: true,
      type: 'dm-only',
      triggerKeyword: 'INFO',
      dmMessage: "Here's the full pricing breakdown you asked for.",
      reason: 'DM-driven CTA with keyword INFO',
    },
    assert: (d) => {
      expect(d.needsAutomation).toBe(true)
      expect(d.type).toBe('dm-only')
      expect(d.triggerKeyword).toBe('INFO')
      expect(d.dmMessage).toBeTruthy()
      expect(d.commentReply).toBeUndefined()
    },
  },
  {
    name: '"tag a friend / comment your thoughts" → comment-only (R10.2)',
    caption: 'Tag a friend who needs to see this! What do you think? 💬',
    payload: {
      needsAutomation: true,
      type: 'comment-only',
      commentReply: 'Love this! Thanks for tagging a friend 🙌',
      reason: 'engagement CTA inviting public replies',
    },
    assert: (d) => {
      expect(d.needsAutomation).toBe(true)
      expect(d.type).toBe('comment-only')
      expect(d.commentReply).toBeTruthy()
      expect(d.dmMessage).toBeUndefined()
    },
  },
]

describe('AutomationDecisionService.decide — CTA pattern table', () => {
  for (const testCase of CTA_CASES) {
    it(testCase.name, async () => {
      const service = makeService(fixedGenerator(testCase.payload))
      const decision = await service.decide(mission(), slot(), testCase.caption)
      testCase.assert(decision)
    })
  }
})

// ── Failure / no-keyword → no automation (R10.7) ────────────────────────────

describe('AutomationDecisionService.decide — defaults to no automation', () => {
  it('LLM throws → no automation, never rejects (R10.7)', async () => {
    const service = makeService(throwingGenerator())
    const decision = await service.decide(mission(), slot(), 'Comment WIN to enter!')
    expect(decision.needsAutomation).toBe(false)
    expect(decision.type).toBeUndefined()
  })

  it('LLM times out past the bound → no automation (R10.1/R10.7)', async () => {
    const service = makeService(hangingGenerator(), 20)
    const decision = await service.decide(mission(), slot(), 'DM me DEAL for the offer')
    expect(decision.needsAutomation).toBe(false)
    expect(decision.type).toBeUndefined()
  })

  it('keyword-driven type but no derivable keyword → no automation (R10.7)', async () => {
    const service = makeService(
      fixedGenerator({
        needsAutomation: true,
        type: 'comment-to-dm',
        // triggerKeyword omitted — cannot be derived
        dmMessage: 'the link',
        reason: 'wanted comment-to-dm but no keyword',
      }),
    )
    const decision = await service.decide(mission(), slot(), 'Comment for the link!')
    expect(decision.needsAutomation).toBe(false)
    expect(decision.type).toBeUndefined()
  })

  it('unknown automation type → no automation (R10.2)', async () => {
    const service = makeService(
      fixedGenerator({ needsAutomation: true, type: 'story-poll', reason: 'made up' }),
    )
    const decision = await service.decide(mission(), slot(), 'Vote in my story!')
    expect(decision.needsAutomation).toBe(false)
    expect(decision.type).toBeUndefined()
  })

  it('empty caption → no automation without calling the LLM (R10.5)', async () => {
    const generator = fixedGenerator({ needsAutomation: true, type: 'dm-only' })
    const service = makeService(generator)
    const decision = await service.decide(mission(), slot(), '   ')
    expect(decision.needsAutomation).toBe(false)
    expect(generator.generateJSON).not.toHaveBeenCalled()
  })

  it('non-object payload → no automation (R10.7)', async () => {
    const service = makeService(fixedGenerator('not json'))
    const decision = await service.decide(mission(), slot(), 'Comment YES!')
    expect(decision.needsAutomation).toBe(false)
  })
})

// ── Property 7: exactly one automation type ─────────────────────────────────

describe('AutomationDecisionService.decide — Property 7', () => {
  it('needs-automation ⇒ exactly one valid type with required fields; else none', async () => {
    const buttonArb = fc.array(
      fc.record({ label: fc.string(), url: fc.webUrl() }),
      { maxLength: 3 },
    )

    // Arbitrary LLM payloads: valid/invalid types, present/absent fields.
    const payloadArb = fc.record(
      {
        needsAutomation: fc.boolean(),
        type: fc.oneof(
          fc.constantFrom(...AUTOMATION_TYPES),
          fc.string(), // possibly-invalid type
          fc.constant(undefined),
        ),
        triggerKeyword: fc.oneof(fc.string(), fc.constant(undefined)),
        commentReply: fc.oneof(fc.string(), fc.constant(undefined)),
        dmMessage: fc.oneof(fc.string(), fc.constant(undefined)),
        dmButtons: fc.oneof(buttonArb, fc.constant(undefined)),
        reason: fc.string(),
      },
      { requiredKeys: ['needsAutomation'] },
    )

    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        const service = makeService(fixedGenerator(payload))
        const d = await service.decide(mission(), slot(), 'some caption with a CTA')

        if (d.needsAutomation) {
          // Exactly one valid type (R10.2, Property 7).
          expect(AUTOMATION_TYPES).toContain(d.type)
          // Required fields per type are present (R10.3/R10.4).
          if (d.type === 'comment-to-dm') {
            expect(typeof d.triggerKeyword).toBe('string')
            expect(d.triggerKeyword!.length).toBeGreaterThan(0)
            expect(typeof d.dmMessage).toBe('string')
            expect(d.dmMessage!.length).toBeGreaterThan(0)
            expect(typeof d.commentReply).toBe('string')
            expect(d.commentReply!.length).toBeGreaterThan(0)
          } else if (d.type === 'dm-only') {
            expect(typeof d.triggerKeyword).toBe('string')
            expect(d.triggerKeyword!.length).toBeGreaterThan(0)
            expect(typeof d.dmMessage).toBe('string')
            expect(d.dmMessage!.length).toBeGreaterThan(0)
          } else if (d.type === 'comment-only') {
            expect(typeof d.commentReply).toBe('string')
            expect(d.commentReply!.length).toBeGreaterThan(0)
          }
        } else {
          // No automation → nothing attached (R10.5, Property 7).
          expect(d.type).toBeUndefined()
          expect(d.triggerKeyword).toBeUndefined()
          expect(d.commentReply).toBeUndefined()
          expect(d.dmMessage).toBeUndefined()
          expect(d.dmButtons).toBeUndefined()
        }
      }),
      { numRuns: 300 },
    )
  })
})

// ── draftRule mapping (decision → AutomationRule draft · R10.6) ─────────────
//
// draftRule is a pure mapping (no I/O). These tests assert:
//   - a no-automation decision drafts nothing (R10.5/R10.7);
//   - each decision type maps to the correct AutomationRule `type` and populates
//     action.{responses,dmResponses,dmButtons} exactly as TriggerEngine reads it;
//   - the derived keyword lands top-level and in `trigger`, and every draft is
//     isActive:false (never activated here · R11.1/R11.2).

// A draftRule-only service (the mapping never touches the LLM generator).
const draftService = new AutomationDecisionService({ generator: fixedGenerator({}) })

function decision(overrides: Partial<AutomationDecision> = {}): AutomationDecision {
  return { needsAutomation: true, reason: 'test decision', ...overrides }
}

describe('AutomationDecisionService.draftRule — mapping', () => {
  it('no-automation decision → drafts nothing (R10.5/R10.7)', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      { needsAutomation: false, reason: 'no CTA' },
    )
    expect(draft).toBeNull()
  })

  it('decision needs automation but has no type → drafts nothing', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      { needsAutomation: true, reason: 'ambiguous' },
    )
    expect(draft).toBeNull()
  })

  it('comment-to-dm → comment_dm with responses + dmResponses + buttons (R10.4)', () => {
    const draft = draftService.draftRule(
      mission({ workspaceId: 'ws-42' }),
      slot({ _id: 'slot-99' }),
      decision({
        type: 'comment-to-dm',
        triggerKeyword: 'GUIDE',
        commentReply: 'Sent! Check your DMs 📩',
        dmMessage: "Here's your free guide: https://example.com/guide",
        dmButtons: [{ label: 'Get the guide', url: 'https://example.com/guide' }],
      }),
    )
    expect(draft).not.toBeNull()
    expect(draft!.isActive).toBe(false)
    expect(draft!.type).toBe('comment_dm')
    expect(draft!.platform).toBe(AUTOPILOT_PLATFORM)
    expect(draft!.workspaceId).toBe('ws-42')
    expect(draft!.slotId).toBe('slot-99')
    expect(draft!.keywords).toEqual(['GUIDE'])
    expect(draft!.matchMode).toBe('contains')
    expect(draft!.trigger).toEqual({
      type: 'comment',
      keywords: ['GUIDE'],
      matchMode: 'contains',
      negativeKeywords: [],
    })
    expect(draft!.action.responses).toEqual(['Sent! Check your DMs 📩'])
    expect(draft!.action.dmResponses).toEqual([
      "Here's your free guide: https://example.com/guide",
    ])
    // Decision {label,url} buttons normalised to the stack's {type,text,url}.
    expect(draft!.action.dmButtons).toEqual([
      { type: 'web_url', text: 'Get the guide', url: 'https://example.com/guide' },
    ])
  })

  it('dm-only → dm_only with empty comment responses (R10.3)', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      decision({
        type: 'dm-only',
        triggerKeyword: 'INFO',
        dmMessage: 'Here is the pricing breakdown.',
      }),
    )
    expect(draft!.type).toBe('dm_only')
    expect(draft!.isActive).toBe(false)
    expect(draft!.keywords).toEqual(['INFO'])
    expect(draft!.matchMode).toBe('contains')
    expect(draft!.action.responses).toEqual([])
    expect(draft!.action.dmResponses).toEqual(['Here is the pricing breakdown.'])
    expect(draft!.action.dmButtons).toEqual([])
  })

  it('comment-only with keyword → comment_only, no DM, contains match', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      decision({
        type: 'comment-only',
        triggerKeyword: 'DONE',
        commentReply: 'Love it! 🙌',
      }),
    )
    expect(draft!.type).toBe('comment_only')
    expect(draft!.isActive).toBe(false)
    expect(draft!.keywords).toEqual(['DONE'])
    expect(draft!.matchMode).toBe('contains')
    expect(draft!.action.responses).toEqual(['Love it! 🙌'])
    expect(draft!.action.dmResponses).toEqual([])
    expect(draft!.action.dmButtons).toEqual([])
  })

  it('keyword-less comment-only → matchMode "any" so it still fires', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      decision({ type: 'comment-only', commentReply: 'Thanks for sharing!' }),
    )
    expect(draft!.type).toBe('comment_only')
    expect(draft!.keywords).toEqual([])
    expect(draft!.matchMode).toBe('any')
    expect(draft!.trigger.matchMode).toBe('any')
    expect(draft!.action.responses).toEqual(['Thanks for sharing!'])
  })

  it('drops buttons that lack a label', () => {
    const draft = draftService.draftRule(
      mission(),
      slot(),
      decision({
        type: 'comment-to-dm',
        triggerKeyword: 'X',
        commentReply: 'ok',
        dmMessage: 'msg',
        dmButtons: [
          { label: '   ', url: 'https://a.com' } as any,
          { label: 'Valid', url: 'https://b.com' },
        ],
      }),
    )
    expect(draft!.action.dmButtons).toEqual([
      { type: 'web_url', text: 'Valid', url: 'https://b.com' },
    ])
  })

  it('never activates a rule: isActive is always false for every type', () => {
    for (const type of AUTOMATION_TYPES) {
      const draft = draftService.draftRule(
        mission(),
        slot(),
        decision({
          type,
          triggerKeyword: 'KW',
          commentReply: 'reply',
          dmMessage: 'dm',
        }),
      )
      expect(draft).not.toBeNull()
      expect(draft!.isActive).toBe(false)
      // Maps to the automation stack's underscored type variant.
      expect(draft!.type).toBe(RULE_TYPE_BY_DECISION[type])
    }
  })
})
