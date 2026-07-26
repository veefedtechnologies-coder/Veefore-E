/**
 * Tests for CaptionService (vision-grounded, localized captioning · ACT).
 *
 * Unit tests pin the concrete behaviours:
 *   - vision grounding: the vision description is passed to the caption
 *     generator and the produced caption references it (R8.1);
 *   - vision failure: 30s bound + 3 retries then escalate (R8.7);
 *   - brand-voice / banned-topic revise loop then escalate (R8.5/R8.6);
 *   - hashtag count bounds 1–30 + banned-topic exclusion (R8.4);
 *   - localization: the mission's local language reaches the generator, English
 *     by default (R9.1/R9.4).
 *
 * The property test covers **Property 3 — banned topics never ship**: across
 * random banned-topic sets and random generator behaviour, whenever
 * `generateCaption` returns `status: 'ok'` neither the caption nor any hashtag
 * contains a banned topic.
 *
 * Satisfies Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 9.1, 9.4, 9.6 (Property 3)
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import {
  CaptionService,
  buildHashtags,
  extractHashtags,
  MAX_HASHTAGS,
  type CaptionGenerator,
  type CaptionMissionInput,
  type CaptionServiceOptions,
  type CaptionSlotInput,
  type VisionAnalyzer,
} from './CaptionService'
import { guardrailService } from './GuardrailService'
import type { CaptionVariation } from '../../../services/AIServiceManager'

// ── Test doubles ────────────────────────────────────────────────────────────

function variation(caption: string): CaptionVariation {
  return { caption, style: 'balanced', styleDescription: 'test' }
}

/** A vision analyzer that returns a fixed description. */
function fixedVision(description: string | undefined): VisionAnalyzer {
  return { analyzeMedia: vi.fn(async () => description) }
}

/** A caption generator that returns a fixed set of variations per call. */
function fixedGenerator(...captions: string[]): CaptionGenerator {
  return {
    generateInstagramCaptions: vi.fn(async () => captions.map(variation)),
  }
}

/** Silent audit + dispatcher stubs so escalation never touches real transports. */
const silentAudit = { record: vi.fn(async () => ({ recorded: true, escalated: false }) as any) }
const silentDispatcher = { dispatch: vi.fn(async () => ({ delivered: ['in-app'], undelivered: false }) as any) }

function makeService(overrides: CaptionServiceOptions = {}): CaptionService {
  return new CaptionService({
    auditService: silentAudit,
    dispatcher: silentDispatcher,
    // Keep tests fast: no real timers needed, but small bound is harmless.
    visionTimeoutMs: 50,
    ...overrides,
  })
}

function mission(overrides: Partial<CaptionMissionInput> = {}): CaptionMissionInput {
  return {
    _id: 'mission-1',
    workspaceId: 'ws-1',
    brandVoice: 'warm and playful',
    bannedTopics: [],
    niche: 'coffee',
    ...overrides,
  }
}

function slot(overrides: Partial<CaptionSlotInput> = {}): CaptionSlotInput {
  return {
    _id: 'slot-1',
    format: 'photo',
    theme: 'morning latte art',
    mediaUrl: 'https://cdn.example.com/latte.jpg',
    ...overrides,
  }
}

const target = { userId: 'user-1' }

// ── R8.1: vision grounding ───────────────────────────────────────────────────

describe('CaptionService.generateCaption — vision grounding (R8.1)', () => {
  it('passes the vision description to the caption generator as mediaAnalysis', async () => {
    const vision = fixedVision('A ceramic cup of latte with tulip foam art on a wooden table.')
    const generator = fixedGenerator('Slow mornings and tulip foam art in my favourite ceramic cup.')
    const svc = makeService({ visionAnalyzer: vision, captionGenerator: generator })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('ok')
    const call = (generator.generateInstagramCaptions as any).mock.calls[0][0]
    expect(call.mediaAnalysis).toContain('tulip foam art')
    if (result.status === 'ok') {
      expect(result.visionAnalysis).toContain('tulip foam art')
      // The chosen caption references at least one vision attribute (R8.1).
      expect(result.caption.toLowerCase()).toContain('tulip')
    }
  })

  it('prefers a grounded caption among clean candidates', async () => {
    const vision = fixedVision('A golden retriever puppy running on a green lawn.')
    // First candidate is clean but ungrounded; second is clean and grounded.
    const generator = fixedGenerator('Happy vibes today!', 'This retriever puppy made my whole week.')
    const svc = makeService({ visionAnalyzer: vision, captionGenerator: generator })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.caption.toLowerCase()).toContain('retriever')
    }
  })
})

// ── R8.7: vision failure → 30s bound + retries then escalate ─────────────────

describe('CaptionService.generateCaption — vision failure (R8.7)', () => {
  it('retries vision analysis then escalates when it never returns a description', async () => {
    const analyze = vi.fn(async () => undefined)
    const svc = makeService({
      visionAnalyzer: { analyzeMedia: analyze },
      captionGenerator: fixedGenerator('should never be reached'),
      visionRetries: 3,
    })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('escalated')
    if (result.status === 'escalated') expect(result.reason).toBe('vision-failed')
    // 1 initial + 3 retries = 4 attempts (R8.7).
    expect(analyze).toHaveBeenCalledTimes(4)
    expect(silentDispatcher.dispatch).toHaveBeenCalled()
  })

  it('treats a vision call that exceeds the 30s bound as a failed attempt', async () => {
    // analyzeMedia never resolves within the (tiny, test) bound → timeout.
    const analyze = vi.fn(() => new Promise<string>(() => {}))
    const svc = makeService({
      visionAnalyzer: { analyzeMedia: analyze as any },
      captionGenerator: fixedGenerator('unused'),
      visionRetries: 1,
      visionTimeoutMs: 20,
    })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('escalated')
    if (result.status === 'escalated') expect(result.reason).toBe('vision-failed')
    expect(analyze).toHaveBeenCalledTimes(2) // 1 + 1 retry
  })

  it('recovers when a later vision attempt succeeds', async () => {
    const analyze = vi
      .fn<[], Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('A cup of espresso with latte foam.')
    const svc = makeService({
      visionAnalyzer: { analyzeMedia: analyze as any },
      captionGenerator: fixedGenerator('Espresso o’clock with the perfect foam.'),
      visionRetries: 3,
    })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('ok')
    expect(analyze).toHaveBeenCalledTimes(2)
  })
})

// ── R8.5/R8.6: banned-topic revise loop then escalate ────────────────────────

describe('CaptionService.generateCaption — banned-topic revise loop (R8.5/R8.6)', () => {
  it('revises when the first caption contains a banned topic, then ships a clean one', async () => {
    const vision = fixedVision('A person holding a glass of wine at a rooftop bar.')
    // Attempt 1 contains the banned topic; attempt 2 is clean.
    const generator: CaptionGenerator = {
      generateInstagramCaptions: vi
        .fn<[], Promise<CaptionVariation[]>>()
        .mockResolvedValueOnce([variation('Rooftop wine nights are the best.')])
        .mockResolvedValueOnce([variation('Rooftop views and good company at the bar.')]),
    }
    const svc = makeService({ visionAnalyzer: vision, captionGenerator: generator })

    const result = await svc.generateCaption(
      mission({ bannedTopics: ['wine'] }),
      slot({ theme: 'rooftop bar' }),
      { escalationTarget: target },
    )

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.caption.toLowerCase()).not.toContain('wine')
      expect(result.revisions).toBe(1)
    }
    expect(generator.generateInstagramCaptions).toHaveBeenCalledTimes(2)
  })

  it('escalates after 3 revisions when every caption keeps a banned topic (R8.6)', async () => {
    const vision = fixedVision('A glass of wine on a table.')
    const generator: CaptionGenerator = {
      // Always returns a banned caption → clean candidate never found.
      generateInstagramCaptions: vi.fn(async () => [variation('More wine please')]),
    }
    const svc = makeService({ visionAnalyzer: vision, captionGenerator: generator, maxRevisions: 3 })

    const result = await svc.generateCaption(mission({ bannedTopics: ['wine'] }), slot(), {
      escalationTarget: target,
    })

    expect(result.status).toBe('escalated')
    if (result.status === 'escalated') expect(result.reason).toBe('banned-topic')
    // 1 initial + 3 revisions = 4 generation attempts.
    expect(generator.generateInstagramCaptions).toHaveBeenCalledTimes(4)
  })

  it('escalates (generation-failed) when the generator yields no usable caption', async () => {
    const svc = makeService({
      visionAnalyzer: fixedVision('A sunset over the ocean.'),
      captionGenerator: fixedGenerator('', '   '),
      maxRevisions: 2,
    })

    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })

    expect(result.status).toBe('escalated')
  })
})

// ── R8.4: hashtag count bounds + banned-topic exclusion ──────────────────────

describe('CaptionService hashtags (R8.4, Property 3)', () => {
  it('extracts inline hashtags from the caption, deduped and lower-cased', () => {
    expect(extractHashtags('Great day #Coffee #coffee #Latte ☕')).toEqual(['#coffee', '#latte'])
  })

  it('supplements from theme/niche when the caption carries none', () => {
    const tags = buildHashtags('A caption with no tags', [], { theme: 'morning latte art', niche: 'coffee' })
    expect(tags.length).toBeGreaterThanOrEqual(1)
    expect(tags).toContain('#latte')
    expect(tags).toContain('#coffee')
  })

  it('never emits more than 30 hashtags', () => {
    const many = Array.from({ length: 50 }, (_, i) => `#tag${i}`).join(' ')
    const tags = buildHashtags(`Caption ${many}`, [], {})
    expect(tags.length).toBe(MAX_HASHTAGS)
  })

  it('drops hashtags that contain a banned topic (Property 3)', () => {
    const tags = buildHashtags('Loving this #wine and #coffee vibe', ['wine'], {})
    expect(tags).toContain('#coffee')
    expect(tags).not.toContain('#wine')
  })

  it('produces 1–30 hashtags on a successful caption', async () => {
    const svc = makeService({
      visionAnalyzer: fixedVision('A latte with foam art.'),
      captionGenerator: fixedGenerator('Latte love ☕ #coffee #latteart #morning'),
    })
    const result = await svc.generateCaption(mission(), slot(), { escalationTarget: target })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.hashtags.length).toBeGreaterThanOrEqual(1)
      expect(result.hashtags.length).toBeLessThanOrEqual(MAX_HASHTAGS)
    }
  })
})

// ── R9.1/R9.4: localization ──────────────────────────────────────────────────

describe('CaptionService.generateCaption — localization (R9.1/R9.4)', () => {
  it('passes the mission local language to the caption generator', async () => {
    const generator = fixedGenerator('Café con leche por la mañana ☕')
    const svc = makeService({
      visionAnalyzer: fixedVision('Una taza de café con leche.'),
      captionGenerator: generator,
    })

    await svc.generateCaption(mission({ localLanguage: 'Spanish' }), slot(), {
      escalationTarget: target,
    })

    const call = (generator.generateInstagramCaptions as any).mock.calls[0][0]
    expect(call.preferences.multilingual).toBe('Spanish')
  })

  it('defaults to English (no multilingual preference) when no language is configured', async () => {
    const generator = fixedGenerator('Morning coffee vibes ☕')
    const svc = makeService({
      visionAnalyzer: fixedVision('A cup of coffee.'),
      captionGenerator: generator,
    })

    const result = await svc.generateCaption(mission({ localLanguage: undefined }), slot(), {
      escalationTarget: target,
    })

    const call = (generator.generateInstagramCaptions as any).mock.calls[0][0]
    expect(call.preferences.multilingual).toBeUndefined()
    if (result.status === 'ok') expect(result.language).toBe('English')
  })
})

// ── Property 3: banned topics never ship ─────────────────────────────────────

describe('Property 3 — banned topics never ship', () => {
  const wordArb = fc
    .stringMatching(/^[a-z]{3,8}$/)
    .filter((w) => w.length >= 3 && w.length <= 8)

  it('a shipped caption + hashtags never contain a banned topic', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A set of banned topics.
        fc.uniqueArray(wordArb, { minLength: 1, maxLength: 4 }),
        // A pool of caption "words" the generator will string together.
        fc.array(wordArb, { minLength: 1, maxLength: 10 }),
        // Whether the generator sprinkles in hashtags.
        fc.array(wordArb, { minLength: 0, maxLength: 5 }),
        async (bannedTopics, captionWords, tagWords) => {
          const hashtags = tagWords.map((w) => `#${w}`).join(' ')
          const captionText = `${captionWords.join(' ')} ${hashtags}`.trim()

          const svc = new CaptionService({
            auditService: silentAudit,
            dispatcher: silentDispatcher,
            visionTimeoutMs: 50,
            visionAnalyzer: fixedVision('a neutral scene description'),
            // The generator always returns the (possibly banned) candidate.
            captionGenerator: fixedGenerator(captionText),
            maxRevisions: 3,
          })

          const result = await svc.generateCaption(
            mission({ bannedTopics, niche: 'general', brandVoice: 'neutral' }),
            slot({ theme: 'general update' }),
            { escalationTarget: target },
          )

          // The safety invariant: if a caption ships, it (and its hashtags) is
          // free of every banned topic. Otherwise the service must have withheld
          // (escalated) — it must never ship banned content.
          if (result.status === 'ok') {
            expect(guardrailService.findBannedTopics(result.caption, bannedTopics)).toEqual([])
            for (const tag of result.hashtags) {
              expect(
                guardrailService.findBannedTopics(tag.replace(/^#/, ''), bannedTopics),
              ).toEqual([])
            }
          } else {
            expect(result.status).toBe('escalated')
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
