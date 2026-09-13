/**
 * Property-based tests for the pure Editing_Planner core
 * (`server/features/video-editor/services/editing-planner.logic.ts`).
 *
 * Task 9.2 — three named properties from the design (§"Editing Planner"),
 * each exercised with fast-check at ≥100 runs and tagged with the requirement
 * it validates.
 *
 * Framework: vitest + fast-check (per design test stack).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildEditingPlan,
  applyPlatformPreset,
  applyBrandProfile,
  planVariants,
  isValidRange,
  rangesOverlap,
  deterministicKindFor,
  isGradingHighlightSense,
  isHighlightSelectionRequest,
  type BuildEditingPlanInput,
  type EditingPlan,
  type OperationType,
  type PlannerAnalysis,
  type TimelineRangeMs,
} from '../server/features/video-editor/services/editing-planner.logic';
import {
  buildFallbackVideoIntent,
  normalizeVideoIntent,
  type ProtectedElement,
  type VideoIntentAction,
  type VideoIntentCandidate,
} from '../server/features/video-editor/services/intent-extraction.logic';
import {
  getPlatformPreset,
  listPlatformPresetKeys,
  MAX_VARIANTS_PER_REQUEST,
} from '../server/features/video-editor/config/video-editor.config';

// ---------------------------------------------------------------------------
// Shared generators / fixtures
// ---------------------------------------------------------------------------

const ACTIONS: readonly VideoIntentAction[] = [
  'VIDEO_EDIT',
  'VIDEO_ANALYZE',
  'VIDEO_REPURPOSE',
  'VIDEO_SHORTEN',
  'VIDEO_GENERATE',
  'VIDEO_CAPTION',
  'VIDEO_AUDIO_ENHANCE',
  'VIDEO_REMOVE_OBJECT',
  'VIDEO_REPLACE_BACKGROUND',
  'VIDEO_ADD_BROLL',
  'VIDEO_CREATE_AD',
  'VIDEO_RESIZE',
  'VIDEO_EXPORT',
  'VIDEO_QC',
];

const PROTECTED_ELEMENTS: readonly ProtectedElement[] = [
  'face',
  'voice',
  'product',
  'logo',
  'text',
  'background',
  'camera_movement',
  'colors',
  'original_audio',
];

const OPERATION_TYPES: readonly OperationType[] = [
  'deterministic',
  'generative',
  'analysis',
  'render',
];

/** Requested-change phrases spanning all three execution classes. */
const GENERATIVE_PHRASES: readonly string[] = [
  'remove the person from the background',
  'replace the background with a beach',
  'generate new b-roll footage',
];
const DETERMINISTIC_PHRASES: readonly string[] = [
  'trim the first five seconds',
  'crop to 9:16',
  'add captions',
  'remove the silence',
];
/** Neutral phrases classify as 'unknown' → unavailable operations (Req 5.6). */
const NEUTRAL_PHRASES: readonly string[] = [
  'make it more engaging',
  'give it a professional feel',
];
const ALL_PHRASES: readonly string[] = [
  ...GENERATIVE_PHRASES,
  ...DETERMINISTIC_PHRASES,
  ...NEUTRAL_PHRASES,
];

const actionArb = fc.constantFrom(...ACTIONS);
const protectedElementArb = fc.constantFrom(...PROTECTED_ELEMENTS);
/** A positive, finite, plannable source duration in ms (up to ~1 hour). */
const durationArb = fc.integer({ min: 1, max: 3_600_000 });

/**
 * A well-formed `VideoIntent` built through the module's own normaliser (the
 * same path the Intent_Router uses in production).
 */
const intentArb = fc
  .record({
    action: actionArb,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    requestedChanges: fc.array(fc.constantFrom(...ALL_PHRASES), { maxLength: 5 }),
    protectedElements: fc.uniqueArray(protectedElementArb, {
      maxLength: PROTECTED_ELEMENTS.length,
    }),
    targetDurationMs: fc.option(fc.integer({ min: 1, max: 3_600_000 }), { nil: undefined }),
    targetPlatform: fc.option(fc.constantFrom('instagram_reel', 'tiktok', 'x'), {
      nil: undefined,
    }),
    targetAspectRatio: fc.option(fc.constantFrom('9:16', '16:9', '1:1'), { nil: undefined }),
  })
  .map((c) => normalizeVideoIntent(c as VideoIntentCandidate));

/** A plannable analysis with a valid source duration and no protected regions. */
const analysisArb: fc.Arbitrary<PlannerAnalysis> = durationArb.map((sourceDurationMs) => ({
  sourceDurationMs,
}));

const buildInputArb: fc.Arbitrary<BuildEditingPlanInput> = fc.record({
  intent: intentArb,
  analysis: analysisArb,
  includeRenderOperation: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 14: Every editing plan is well-formed and never null
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
// ---------------------------------------------------------------------------

describe('Property 14: Every editing plan is well-formed and never null', () => {
  it('produces a non-null, structurally well-formed plan for any intent + analysis', () => {
    fc.assert(
      fc.property(buildInputArb, (input) => {
        const plan = buildEditingPlan(input);

        // Req 5.2 — never null/absent.
        expect(plan).toBeDefined();
        expect(plan).not.toBeNull();
        expect(typeof plan.projectGoal).toBe('string');
        expect(Array.isArray(plan.operations)).toBe(true);

        const sourceDurationMs = input.analysis.sourceDurationMs;
        const declared = new Set(input.intent.protectedElements);

        plan.operations.forEach((op, index) => {
          // Req 5.1 — explicit, strictly-ordered sequence indices (0,1,2,...).
          expect(op.sequenceIndex).toBe(index);

          // Req 5.3 — exactly one type from the closed set.
          expect(OPERATION_TYPES).toContain(op.type);

          // Req 5.4 — range well-formed and within source duration.
          expect(isValidRange(op.range, sourceDurationMs)).toBe(true);

          // Req 5.5 — preservation constraints are a subset of declared elements,
          // deduplicated, and (with no explicit regions, every element spans the
          // whole source) every declared element overlaps and must be attached.
          const constraints = op.preservationConstraints;
          expect(new Set(constraints).size).toBe(constraints.length);
          constraints.forEach((el) => expect(declared.has(el)).toBe(true));
          expect(new Set(constraints)).toEqual(declared);

          // Req 5.6 — an unavailable op carries a limitation and is not executable.
          if (op.status === 'unavailable') {
            expect(typeof op.limitation).toBe('string');
            expect((op.limitation ?? '').length).toBeGreaterThan(0);
            expect(op.status).not.toBe('executable');
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('an unfulfillable intent (invalid source duration) yields an empty, non-null plan (Req 5.2)', () => {
    const invalidDurationArb = fc.oneof(
      fc.constant(0),
      fc.integer({ min: -3_600_000, max: -1 }),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
    );
    fc.assert(
      fc.property(intentArb, invalidDurationArb, (intent, sourceDurationMs) => {
        const plan = buildEditingPlan({ intent, analysis: { sourceDurationMs } });
        expect(plan).not.toBeNull();
        expect(plan.operations).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('only-neutral requested changes yield error-only (unavailable) operations (Req 5.2, 5.6)', () => {
    fc.assert(
      fc.property(
        actionArb,
        fc.array(fc.constantFrom(...NEUTRAL_PHRASES), { minLength: 1, maxLength: 4 }),
        durationArb,
        (action, neutral, sourceDurationMs) => {
          const intent = normalizeVideoIntent({ action, confidence: 1, requestedChanges: neutral });
          const plan = buildEditingPlan({ intent, analysis: { sourceDurationMs } });
          // Every derived op is unavailable; no executable op ⇒ no render appended.
          expect(plan.operations.length).toBeGreaterThan(0);
          plan.operations.forEach((op) => {
            expect(op.status).toBe('unavailable');
            expect(op.status).not.toBe('executable');
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('attaches a preservation constraint exactly when an op range overlaps a protected region (Req 5.5)', () => {
    fc.assert(
      fc.property(
        durationArb,
        fc.integer({ min: 1, max: 3_600_000 }),
        fc.integer({ min: 0, max: 3_600_000 }),
        fc.integer({ min: 1, max: 3_600_000 }),
        (sourceDurationMs, targetDurationMs, regionStart, regionSpan) => {
          // A single deterministic trim op with range [0, min(target, source)].
          const intent = normalizeVideoIntent({
            action: 'VIDEO_SHORTEN',
            confidence: 1,
            targetDurationMs,
            protectedElements: ['face'],
          });
          const regionStartMs = Math.min(regionStart, sourceDurationMs);
          const regionEndMs = Math.min(regionStartMs + regionSpan, sourceDurationMs);
          const region: TimelineRangeMs = { startMs: regionStartMs, endMs: regionEndMs };
          const analysis: PlannerAnalysis = {
            sourceDurationMs,
            protectedRegions: [{ element: 'face', range: region }],
          };

          const plan = buildEditingPlan({
            intent,
            analysis,
            includeRenderOperation: false, // isolate the single edit op
          });

          expect(plan.operations.length).toBe(1);
          const op = plan.operations[0];

          // A region is only honoured when it is itself a valid in-bounds range;
          // otherwise the planner falls back to whole-source (always overlaps).
          const effectiveRegion = isValidRange(region, sourceDurationMs)
            ? region
            : { startMs: 0, endMs: sourceDurationMs };
          const expectOverlap = rangesOverlap(op.range, effectiveRegion);

          expect(op.preservationConstraints.includes('face')).toBe(expectOverlap);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 34: Unsupported platform or missing brand leaves the plan unchanged
// Validates: Requirements 13.3, 13.5, 13.7
//
// The pure planner owns the 13.3 (unsupported platform) and 13.5 (missing brand)
// rejections asserted below. Req 13.7 (blocking render/export while a preset
// constraint is violated) is enforced at the service/render layer (tasks 14.x)
// and is out of scope for this pure-core module.
// ---------------------------------------------------------------------------

describe('Property 34: Unsupported platform or missing brand leaves the plan unchanged', () => {
  const presetKeys = listPlatformPresetKeys();
  const knownKeyArb = fc.constantFrom(...presetKeys);
  const unknownKeyArb = fc
    .string()
    .filter((s) => !presetKeys.includes(s));

  it('selecting an unsupported platform is rejected and leaves the plan unchanged (Req 13.3)', () => {
    fc.assert(
      fc.property(buildInputArb, unknownKeyArb, (input, unknownKey) => {
        const plan = buildEditingPlan(input);
        const snapshot = structuredClone(plan);

        const result = applyPlatformPreset(plan, unknownKey);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('UNSUPPORTED_PLATFORM');
          expect(result.plan).toEqual(snapshot); // returned plan unchanged
        }
        expect(plan).toEqual(snapshot); // input plan not mutated
      }),
      { numRuns: 200 },
    );
  });

  it('selecting a known platform applies the preset without mutating the input plan (Req 13.2)', () => {
    fc.assert(
      fc.property(buildInputArb, knownKeyArb, (input, knownKey) => {
        const plan = buildEditingPlan(input);
        const snapshot = structuredClone(plan);

        const result = applyPlatformPreset(plan, knownKey);
        const preset = getPlatformPreset(knownKey)!;

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.plan.target.platform).toBe(preset.key);
          expect(result.plan.target.aspectRatio).toBe(preset.aspectRatio);
          expect(result.plan.target.maxDurationMs).toBe(preset.maxDurationMs);
          expect(result.plan.target.recommendedDurationMs).toBe(preset.recommendedDurationMs);
          expect(result.plan.target.exportProfile).toBe(preset.exportProfileId);
        }
        // The original plan object is never mutated (a new plan is returned).
        expect(plan).toEqual(snapshot);
      }),
      { numRuns: 200 },
    );
  });

  it('requesting brand style with no brand profile is rejected and leaves the plan unchanged (Req 13.5)', () => {
    const absentBrandArb = fc.constantFrom<null | undefined>(null, undefined);
    fc.assert(
      fc.property(buildInputArb, absentBrandArb, (input, absentBrand) => {
        const plan = buildEditingPlan(input);
        const snapshot = structuredClone(plan);

        const result = applyBrandProfile(plan, absentBrand);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('BRAND_PROFILE_UNAVAILABLE');
          expect(result.plan).toEqual(snapshot);
        }
        expect(plan).toEqual(snapshot);
      }),
      { numRuns: 200 },
    );
  });

  it('applying a defined brand profile stamps brand styling without mutating the input plan (Req 13.4)', () => {
    const brandArb = fc.record({
      primaryColorHex: fc.option(fc.constantFrom('#111111', '#FF0000'), { nil: undefined }),
      fontFamily: fc.option(fc.constantFrom('Inter', 'Roboto'), { nil: undefined }),
      captionStyle: fc.option(fc.constantFrom('modern', 'bold'), { nil: undefined }),
    });
    fc.assert(
      fc.property(buildInputArb, brandArb, (input, brand) => {
        const plan = buildEditingPlan(input);
        const snapshot = structuredClone(plan);

        const result = applyBrandProfile(plan, brand);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.plan.brand).not.toBeNull();
        }
        expect(plan).toEqual(snapshot);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 39: Variant requests are bounded and independent
// Validates: Requirements 16.9, 16.10
//
// The pure planner fans a request into N independent plan object graphs. The
// "render and meter each independently" clause of Req 16.9 is a service-layer
// concern (tasks 14.x / 16.x); this module guarantees the structural
// independence asserted below.
// ---------------------------------------------------------------------------

describe('Property 39: Variant requests are bounded and independent', () => {
  it('a request for 1..MAX variants produces that many independent plans (Req 16.9)', () => {
    fc.assert(
      fc.property(
        buildInputArb,
        fc.integer({ min: 1, max: MAX_VARIANTS_PER_REQUEST }),
        (input, count) => {
          const result = planVariants(input, count);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          expect(result.plans).toHaveLength(count);

          // Structural independence: every plan is a distinct object graph, so
          // mutating one variant never affects another.
          for (let i = 0; i < result.plans.length; i++) {
            for (let j = i + 1; j < result.plans.length; j++) {
              expect(result.plans[i]).not.toBe(result.plans[j]);
              expect(result.plans[i].operations).not.toBe(result.plans[j].operations);
            }
          }

          const first: EditingPlan = result.plans[0];
          const others = result.plans.slice(1).map((p) => structuredClone(p));
          first.projectGoal = 'MUTATED';
          first.operations.push({
            sequenceIndex: 999,
            type: 'render',
            kind: 'render',
            range: { startMs: 0, endMs: 1 },
            preservationConstraints: [],
            status: 'executable',
            params: {},
          });
          result.plans.slice(1).forEach((p, idx) => {
            expect(p).toEqual(others[idx]); // untouched by mutating variant 0
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a request for more than MAX variants is rejected and creates no variant (Req 16.10)', () => {
    fc.assert(
      fc.property(
        buildInputArb,
        fc.integer({ min: MAX_VARIANTS_PER_REQUEST + 1, max: MAX_VARIANTS_PER_REQUEST + 500 }),
        (input, count) => {
          const result = planVariants(input, count);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('VARIANT_LIMIT_EXCEEDED');
          }
          expect('plans' in result).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a non-integer or < 1 variant count is rejected as an invalid count', () => {
    fc.assert(
      fc.property(
        buildInputArb,
        fc.oneof(
          fc.integer({ min: -100, max: 0 }),
          fc.double({ min: 0.1, max: 4.9, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (input, count) => {
          const result = planVariants(input, count);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('INVALID_VARIANT_COUNT');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// "highlights" word-sense disambiguation — colour grading vs best-moments
// ---------------------------------------------------------------------------

/**
 * THE DEFECT THIS PINS: the highlight-SELECTION regex carried the bare
 * alternative `highlights?`, so the COLOUR-GRADING phrase "slightly crushed
 * highlights" was planned as a "Pick the best moments" operation. A pure
 * colour-grade instruction then triggered the expensive editorial-brain pass
 * (audio energy envelope + full speech transcription) before it could discover
 * it had nothing to do.
 *
 * The rule these tests lock in: the tonal sense of "highlights" (the bright end
 * of the range) routes to `filter`; the `highlight` op requires EDITORIAL intent
 * (selection/reel language, "highlights" as the object of a selection verb, or a
 * standalone bare "highlights" noun).
 */

/** The verbatim instruction that reached the tool in the recorded trace. */
const TRACE_GRADING_INSTRUCTION =
  'Apply a cinematic color grade to the attached video: teal/blue bias, high contrast, '
  + 'lifted shadows, and slightly crushed highlights to convey a premium business vibe. '
  + 'Ensure skin tones remain natural, framing and audio remain unchanged, and no branding '
  + 'elements are altered.';

/** Colour-grading collocations in which "highlights" means the tonal range. */
const GRADING_HIGHLIGHT_PHRASES = [
  'slightly crushed highlights',
  'crushed highlights',
  'blown highlights',
  'blown-out highlights',
  'clipped highlights',
  'recover the highlights',
  'recovered highlights',
  'recovering highlights',
  'highlight rolloff',
  'highlight roll-off',
  'lifted shadows and slightly crushed highlights',
  'shadows and highlights',
  'keep highlight detail',
  'specular highlights',
  'soft highlights',
  'warm highlights',
  'cool highlights',
  'highlight compression',
];

describe('deterministicKindFor — colour-grading "highlights" is never a selection', () => {
  it('routes every grading collocation to filter, never highlight', () => {
    for (const phrase of GRADING_HIGHLIGHT_PHRASES) {
      expect(deterministicKindFor(phrase)).toBe('filter');
      expect(deterministicKindFor(phrase)).not.toBe('highlight');
      expect(isGradingHighlightSense(phrase)).toBe(true);
      expect(isHighlightSelectionRequest(phrase)).toBe(false);
    }
  });

  it('routes the verbatim 274-char grading instruction from the trace to filter', () => {
    expect(deterministicKindFor(TRACE_GRADING_INSTRUCTION)).toBe('filter');
    expect(deterministicKindFor(TRACE_GRADING_INSTRUCTION)).not.toBe('highlight');
  });

  it('still routes genuine editorial selection to highlight', () => {
    expect(deterministicKindFor('make me a 30s highlight reel')).toBe('highlight');
    expect(deterministicKindFor('cut it down to the best moments')).toBe('highlight');
    expect(deterministicKindFor('keep only the highlights')).toBe('highlight');
    expect(deterministicKindFor('highlights')).toBe('highlight');
    expect(isHighlightSelectionRequest('make me a 30s highlight reel')).toBe(true);
    expect(isHighlightSelectionRequest('cut it down to the best moments')).toBe(true);
  });

  it('still routes caption phrasing to caption (no collateral damage)', () => {
    expect(deterministicKindFor('add captions')).toBe('caption');
    expect(deterministicKindFor('burn in subtitles')).toBe('caption');
  });

  it('a reel + grade request keeps BOTH senses available', () => {
    // The reel language wins for the combined clause (it is genuinely editorial),
    // and the grading clause on its own still routes to filter.
    expect(
      deterministicKindFor('make me a 30s highlight reel and apply a cinematic colour grade'),
    ).toBe('highlight');
    expect(deterministicKindFor('apply a cinematic colour grade')).toBe('filter');
  });
});

describe('plan level — grading instruction plans no highlight operation', () => {
  const analysis: PlannerAnalysis = { sourceDurationMs: 10_560 };

  it('the verbatim trace instruction yields a filter op and NO highlight op', () => {
    const intent = buildFallbackVideoIntent(TRACE_GRADING_INSTRUCTION);
    expect(intent).not.toBeNull();
    const plan = buildEditingPlan({ intent: intent!, analysis });
    const kinds = plan.operations.map((op) => op.kind);
    expect(kinds).not.toContain('highlight');
    expect(kinds).toContain('filter');
  });

  it('"make me a 30s highlight reel and apply a cinematic grade" yields BOTH ops', () => {
    const intent = buildFallbackVideoIntent(
      'make me a 30s highlight reel and apply a cinematic colour grade',
    );
    expect(intent).not.toBeNull();
    const plan = buildEditingPlan({
      intent: intent!,
      analysis: { sourceDurationMs: 120_000 },
    });
    const kinds = plan.operations.map((op) => op.kind);
    expect(kinds).toContain('highlight');
    expect(kinds).toContain('filter');
  });
});
