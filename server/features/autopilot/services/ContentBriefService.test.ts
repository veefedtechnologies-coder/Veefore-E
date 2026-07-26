/**
 * Tests for ContentBriefService.generateBrief (Content-Brief flow · PLAN).
 *
 * Unit tests pin the concrete behaviours of `generateBrief`:
 *   - happy path: a valid LLM payload → `{ status: 'ok', brief }` persisting the
 *     five brief fields (concept, hook, shot list, instructions, suggested
 *     caption), the language, the computed Lead_Time, and the send + fallback
 *     deadlines, attributed to the mission workspace/user via withAIFeature (R7.1);
 *   - local language: the brief is authored + persisted in the Mission's local
 *     language, defaulting to English when none is configured (R9.3/R9.4);
 *   - generation failure → escalation: an LLM that throws, that returns an invalid
 *     payload, that exceeds the deadline, or a persist that fails → a PLAN-stage
 *     failure Audit_Record, an Escalation + User_Input_Notification, and
 *     `{ status: 'escalated' }` with no thrown error (R7.9);
 *   - never throws, even when the audit + notification transports themselves fail.
 *
 * The property test asserts that for any valid brief payload the persisted brief
 * round-trips its fields and never loses the target language.
 *
 * Satisfies Requirements: 7.1, 7.9, 9.3
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  ContentBriefService,
  BRIEF_AI_FEATURE,
  BRIEF_TIMEOUT_MS,
  DEFAULT_BRIEF_LANGUAGE,
  FALLBACK_DEADLINE_OFFSET_MS,
  DEFAULT_FORMAT_COMPLEXITY,
  type BriefMissionInput,
  type BriefSlotInput,
  type ContentBriefServiceOptions,
} from './ContentBriefService'
import { LeadTimeEstimator } from './LeadTimeEstimator'
import type { AuditRecordInput, AuditEscalationTarget } from './AutoPilotAuditService'
import type { UserInputNotification } from './NotificationDispatcher'
import type { IContentBrief } from '../db/models'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mission: BriefMissionInput = {
  _id: 'mission-1',
  workspaceId: 'ws-1',
  niche: 'vegan fitness',
  brandVoice: 'friendly, energetic, no hype',
  goal: { metric: 'followers', targetValue: 10_000 },
}

const NOW = new Date('2024-06-01T00:00:00.000Z').getTime()
const PUBLISH_AT = new Date('2024-06-10T12:00:00.000Z')

const slot: BriefSlotInput = {
  _id: 'slot-1',
  format: 'reel',
  theme: 'high-protein meal prep',
  scheduledAt: PUBLISH_AT,
}

const escalationTarget = { userId: 'user-1', email: 'creator@example.com' as string | null }

/** A valid raw LLM brief payload. */
function validPayload() {
  return {
    concept: 'A fast-paced meal-prep reel showing a week of high-protein vegan lunches',
    hook: 'You will never guess how much protein is in this $3 lunch',
    shotList: ['overhead chopping board', 'sizzling pan close-up', 'final plated hero shot'],
    instructions: '1) Prep ingredients. 2) Film each step in 5s clips. 3) Add trending audio.',
    suggestedCaption: 'Meal-prep Sunday, sorted 🌱 Save this for your next grocery run!',
  }
}

/** Collects the audit records the service writes. */
function recordingAudit() {
  const calls: { input: AuditRecordInput; target?: AuditEscalationTarget }[] = []
  const record = vi.fn(async (input: AuditRecordInput, target?: AuditEscalationTarget) => {
    calls.push({ input, target })
    return { recorded: true, escalated: false }
  })
  return { record, calls }
}

/** Collects the notifications the service dispatches. */
function recordingDispatcher() {
  const calls: UserInputNotification[] = []
  const dispatch = vi.fn(async (n: UserInputNotification) => {
    calls.push(n)
    return { delivered: ['in-app' as const], undelivered: false }
  })
  return { dispatch, calls }
}

/** Captures the persisted brief doc and echoes it back with an id. */
function recordingBriefStore() {
  const calls: Partial<IContentBrief>[] = []
  const create = vi.fn(async (doc: Partial<IContentBrief>) => {
    calls.push(doc)
    return { _id: 'brief-1', ...doc } as unknown as IContentBrief
  })
  return { create, calls }
}

/** Build a ContentBriefService with stub generator + recording ports. */
function makeService(generateJSON: any, overrides: ContentBriefServiceOptions = {}) {
  const audit = overrides.auditService ?? recordingAudit()
  const dispatcher = overrides.dispatcher ?? recordingDispatcher()
  const briefStore = overrides.briefStore ?? recordingBriefStore()
  const svc = new ContentBriefService({
    generator: { generateJSON },
    auditService: audit as any,
    dispatcher: dispatcher as any,
    briefStore: briefStore as any,
    ...overrides,
  })
  return {
    svc,
    audit: audit as ReturnType<typeof recordingAudit>,
    dispatcher: dispatcher as ReturnType<typeof recordingDispatcher>,
    briefStore: briefStore as ReturnType<typeof recordingBriefStore>,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Happy path (R7.1) ──────────────────────────────────────────────────────

describe('ContentBriefService.generateBrief — happy path (R7.1)', () => {
  it('generates + persists a brief with all five fields', async () => {
    const { svc, briefStore } = makeService(vi.fn(async () => validPayload()))

    const result = await svc.generateBrief(mission, slot, { now: NOW })

    expect(result.status).toBe('ok')
    expect(briefStore.calls).toHaveLength(1)
    const doc = briefStore.calls[0]
    expect(doc.concept).toBe(validPayload().concept)
    expect(doc.hook).toBe(validPayload().hook)
    expect(doc.shotList).toEqual(validPayload().shotList)
    expect(doc.instructions).toBe(validPayload().instructions)
    expect(doc.suggestedCaption).toBe(validPayload().suggestedCaption)
    expect(doc.status).toBe('pending')
    expect(doc.remindersSent).toBe(0)
    expect(doc.missionId).toBe('mission-1')
    expect(doc.slotId).toBe('slot-1')
    expect(doc.workspaceId).toBe('ws-1')
  })

  it('computes Lead_Time from the format complexity and derives send + fallback deadlines', async () => {
    const { svc, briefStore } = makeService(vi.fn(async () => validPayload()))

    await svc.generateBrief(mission, slot, { now: NOW })

    const expectedLead = new LeadTimeEstimator().estimate('reel', DEFAULT_FORMAT_COMPLEXITY.reel)
    const doc = briefStore.calls[0]
    expect(doc.leadTimeMs).toBe(expectedLead)
    // R7.3: send at publish − leadTime. R7.6: fallback at publish − 30m.
    expect((doc.sendAt as Date).getTime()).toBe(PUBLISH_AT.getTime() - expectedLead)
    expect((doc.fallbackDeadline as Date).getTime()).toBe(
      PUBLISH_AT.getTime() - FALLBACK_DEADLINE_OFFSET_MS,
    )
  })

  it('passes an AbortSignal to the LLM so the deadline can cancel it', async () => {
    const generateJSON = vi.fn(async (_p: string, _pref: unknown, opts?: { signal?: AbortSignal }) => {
      expect(opts?.signal).toBeInstanceOf(AbortSignal)
      return validPayload()
    })
    const { svc } = makeService(generateJSON)

    await svc.generateBrief(mission, slot, { now: NOW })

    expect(generateJSON).toHaveBeenCalledTimes(1)
  })

  it('runs the LLM call under the autopilot.brief AI feature (R14.2)', async () => {
    expect(BRIEF_AI_FEATURE).toBe('autopilot.brief')
    const generateJSON = vi.fn(async () => validPayload())
    const { svc } = makeService(generateJSON)

    const result = await svc.generateBrief(mission, slot, { now: NOW, userId: 'user-1' })

    expect(result.status).toBe('ok')
    expect(generateJSON).toHaveBeenCalledTimes(1)
  })

  it('trims and drops empty shot-list entries', async () => {
    const { svc, briefStore } = makeService(
      vi.fn(async () => ({ ...validPayload(), shotList: ['  wide shot  ', '', '   '] })),
    )

    const result = await svc.generateBrief(mission, slot, { now: NOW })

    expect(result.status).toBe('ok')
    expect(briefStore.calls[0].shotList).toEqual(['wide shot'])
  })
})

// ─── Local language (R9.3 / R9.4) ───────────────────────────────────────────

describe('ContentBriefService.generateBrief — local language (R9.3/R9.4)', () => {
  it('authors + persists the brief in the mission local language', async () => {
    const generateJSON = vi.fn(async () => validPayload())
    const { svc, briefStore } = makeService(generateJSON)

    await svc.generateBrief({ ...mission, localLanguage: 'Hindi' }, slot, { now: NOW })

    // Sent to the model as a preference and named in the prompt (R9.3).
    const prefs = generateJSON.mock.calls[0][1] as { multilingual?: string }
    expect(prefs.multilingual).toBe('Hindi')
    expect(generateJSON.mock.calls[0][0] as string).toContain('Hindi')
    // Persisted on the brief so downstream delivery honours it.
    expect(briefStore.calls[0].language).toBe('Hindi')
  })

  it('defaults to English when no local language is configured (R9.4)', async () => {
    const { svc, briefStore } = makeService(vi.fn(async () => validPayload()))

    await svc.generateBrief(mission, slot, { now: NOW })

    expect(briefStore.calls[0].language).toBe(DEFAULT_BRIEF_LANGUAGE)
    expect(DEFAULT_BRIEF_LANGUAGE).toBe('English')
  })
})

// ─── Escalate on generation failure (R7.9) ──────────────────────────────────

describe('ContentBriefService.generateBrief — escalate on failure (R7.9)', () => {
  it('records a PLAN failure audit, dispatches a notification, and returns escalated when the LLM throws', async () => {
    const { svc, audit, dispatcher, briefStore } = makeService(
      vi.fn(async () => {
        throw new Error('provider 500')
      }),
    )

    const result = await svc.generateBrief(mission, slot, { now: NOW, escalationTarget })

    expect(result.status).toBe('escalated')
    // No brief persisted.
    expect(briefStore.calls).toHaveLength(0)
    // R7.9: failure Audit_Record.
    const failure = audit.calls.find((c) => c.input.action === 'plan.brief-failed')
    expect(failure).toBeDefined()
    expect(failure?.input.stage).toBe('PLAN')
    expect(failure?.input.outcome).toBe('failure')
    expect(failure?.input.reversible).toBe(false)
    // R7.9: Escalation + User_Input_Notification.
    expect(dispatcher.calls).toHaveLength(1)
    expect(dispatcher.calls[0].userId).toBe('user-1')
    expect(dispatcher.calls[0].workspaceId).toBe('ws-1')
    expect(dispatcher.calls[0].type).toBe('alert')
  })

  it.each([
    ['missing concept', { ...validPayload(), concept: undefined }],
    ['empty hook', { ...validPayload(), hook: '   ' }],
    ['missing shot list', { ...validPayload(), shotList: undefined }],
    ['empty shot list', { ...validPayload(), shotList: [] }],
    ['missing instructions', { ...validPayload(), instructions: undefined }],
    ['missing caption', { ...validPayload(), suggestedCaption: undefined }],
    ['not an object', 'nonsense'],
    ['null', null],
  ])('treats an invalid payload (%s) as an escalated failure', async (_label, payload) => {
    const { svc, audit, dispatcher, briefStore } = makeService(vi.fn(async () => payload))

    const result = await svc.generateBrief(mission, slot, { now: NOW, escalationTarget })

    expect(result.status).toBe('escalated')
    expect(briefStore.calls).toHaveLength(0)
    expect(audit.calls.some((c) => c.input.action === 'plan.brief-failed')).toBe(true)
    expect(dispatcher.calls).toHaveLength(1)
  })

  it('escalates when persistence fails', async () => {
    const failingStore = {
      create: vi.fn(async () => {
        throw new Error('mongo write failed')
      }),
    }
    const { svc, audit, dispatcher } = makeService(vi.fn(async () => validPayload()), {
      briefStore: failingStore as any,
    })

    const result = await svc.generateBrief(mission, slot, { now: NOW, escalationTarget })

    expect(result.status).toBe('escalated')
    expect(audit.calls.some((c) => c.input.action === 'plan.brief-failed')).toBe(true)
    expect(dispatcher.calls).toHaveLength(1)
  })

  it('aborts and escalates when the LLM exceeds the deadline', async () => {
    vi.useFakeTimers()
    let abortedByService = false
    const generateJSON = vi.fn(
      (_p: string, _pref: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise(() => {
          opts?.signal?.addEventListener('abort', () => {
            abortedByService = true
          })
        }),
    )
    const { svc, audit, dispatcher } = makeService(generateJSON, { timeoutMs: BRIEF_TIMEOUT_MS })

    const promise = svc.generateBrief(mission, slot, { now: NOW, escalationTarget })
    await vi.advanceTimersByTimeAsync(BRIEF_TIMEOUT_MS + 1)
    const result = await promise

    expect(result.status).toBe('escalated')
    expect(abortedByService).toBe(true)
    expect(audit.calls.some((c) => c.input.action === 'plan.brief-failed')).toBe(true)
    expect(dispatcher.calls).toHaveLength(1)
  })

  it('forwards the escalation target to the audit service for the write-failure fallback (R17.2)', async () => {
    const { svc, audit } = makeService(
      vi.fn(async () => {
        throw new Error('provider down')
      }),
    )

    await svc.generateBrief(mission, slot, { now: NOW, escalationTarget })

    const failure = audit.calls.find((c) => c.input.action === 'plan.brief-failed')
    expect(failure?.target?.userId).toBe('user-1')
  })

  it('still escalates (without dispatching) when no escalation target is provided', async () => {
    const { svc, audit, dispatcher } = makeService(
      vi.fn(async () => {
        throw new Error('provider down')
      }),
    )

    const result = await svc.generateBrief(mission, slot, { now: NOW })

    expect(result.status).toBe('escalated')
    expect(audit.calls.some((c) => c.input.action === 'plan.brief-failed')).toBe(true)
    // No target → no notification, but no crash either.
    expect(dispatcher.calls).toHaveLength(0)
  })

  it('never throws even when the audit + notification transports fail', async () => {
    const svc = new ContentBriefService({
      generator: {
        generateJSON: vi.fn(async () => {
          throw new Error('provider down')
        }),
      },
      briefStore: recordingBriefStore() as any,
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

    const result = await svc.generateBrief(mission, slot, { now: NOW, escalationTarget })

    expect(result.status).toBe('escalated')
  })
})

// ─── Property: valid payloads round-trip; language preserved (R7.1, R9.3) ────
// **Validates: Requirements 7.1, 9.3**
describe('Property — a valid brief payload round-trips its fields', () => {
  it('preserves concept, hook, shot list, instructions, caption, and the language', async () => {
    const nonEmpty = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0)
    await fc.assert(
      fc.asyncProperty(
        nonEmpty,
        nonEmpty,
        fc.array(nonEmpty, { minLength: 1, maxLength: 6 }),
        nonEmpty,
        nonEmpty,
        fc.option(fc.constantFrom('Hindi', 'Spanish', 'French', 'Japanese'), { nil: undefined }),
        async (concept, hook, shotList, instructions, suggestedCaption, localLanguage) => {
          const briefStore = recordingBriefStore()
          const svc = new ContentBriefService({
            generator: {
              generateJSON: vi.fn(async () => ({
                concept,
                hook,
                shotList,
                instructions,
                suggestedCaption,
              })),
            },
            briefStore: briefStore as any,
            auditService: recordingAudit() as any,
            dispatcher: recordingDispatcher() as any,
          })

          const result = await svc.generateBrief({ ...mission, localLanguage }, slot, { now: NOW })

          expect(result.status).toBe('ok')
          const doc = briefStore.calls[0]
          expect(doc.concept).toBe(concept.trim())
          expect(doc.hook).toBe(hook.trim())
          expect(doc.shotList).toEqual(shotList.map((s) => s.trim()))
          expect(doc.instructions).toBe(instructions.trim())
          expect(doc.suggestedCaption).toBe(suggestedCaption.trim())
          expect(doc.language).toBe(localLanguage ?? DEFAULT_BRIEF_LANGUAGE)
        },
      ),
      { numRuns: 100 },
    )
  })
})
