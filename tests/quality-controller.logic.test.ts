import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkOutputExists,
  classifyQualityFailures,
  validateRequestedSpec,
  inspectOutput,
  decideRepair,
  canAttemptRepair,
  validateRender,
  DEFAULT_REPAIR_STRATEGIES,
  type OutputProbe,
  type QualityMetrics,
  type RequestedOutputSpec,
  type QualityFailureCode,
  type SpecMismatchCode,
  type RepairStrategy,
  type RenderValidationInput,
  type RenderValidationCode,
} from '../server/features/video-editor/services/quality-controller.logic';
import {
  QUALITY_CONTROL_THRESHOLDS,
  EXPORT_PROFILES,
  type ExportProfile,
} from '../server/features/video-editor/config/video-editor.config';

// ===========================================================================
// Task 14.2 — Property tests for the pure Quality_Controller core
// (server/features/video-editor/services/quality-controller.logic.ts).
//
//   Property 35: QC classifies quality failures exactly per definition and
//                checks existence first
//                Validates: Requirements 14.1, 14.2, 14.3
//   Property 36: Repair attempts are bounded and terminal failure preserves
//                the prior valid version
//                Validates: Requirements 14.5, 14.6, 14.7
//
// Every property runs ≥100 fast-check iterations. Generators are shaped to the
// real input space and deliberately concentrate mass around each threshold
// (black ≥0.5s, frozen ≥2.0s, duration ±0.5s, artifacts ≥25%) so the boundary
// behaviour is exercised rather than checked vacuously. Independent oracles
// re-derive the spec definition instead of re-using the implementation.
// ===========================================================================

const NUM_RUNS = 300;

const {
  blackFrameMinMs,
  frozenFrameMinMs,
  durationToleranceMs,
  fpsTolerance,
  artifactAreaFraction,
  maxRepairAttempts,
} = QUALITY_CONTROL_THRESHOLDS;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * An integer that concentrates around a threshold so the ≥ boundary is hit
 * often: values just below, exactly at, and just above `center`.
 */
const aroundArb = (center: number, spread: number) =>
  fc.integer({ min: Math.max(0, center - spread), max: center + spread });

/** A fractional value concentrating around a fractional threshold [0,1]. */
const aroundFractionArb = (center: number, spread: number) =>
  fc
    .double({ min: Math.max(0, center - spread), max: Math.min(1, center + spread), noNaN: true });

/** Quality metrics whose fields straddle every configured threshold. */
const metricsArb: fc.Arbitrary<QualityMetrics> = fc.record({
  longestBlackRunMs: aroundArb(blackFrameMinMs, 300),
  longestFrozenRunMs: aroundArb(frozenFrameMinMs, 500),
  audioExpected: fc.boolean(),
  audioPresent: fc.boolean(),
  audioSilentFraction: fc.oneof(
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.constant(1), // exact 100%-silent boundary
  ),
  maxArtifactAreaFraction: aroundFractionArb(artifactAreaFraction, 0.2),
  measuredDurationMs: fc.integer({ min: 0, max: 120_000 }),
});

/** A requested duration in a realistic clip range. */
const requestedDurationArb = fc.integer({ min: 1_000, max: 120_000 });

/** A probe that exists and is non-empty (existence check passes). */
const goodContainer = fc.constantFrom('mp4', 'webm', 'mov', 'avi');
const goodCodec = fc.constantFrom('h264', 'h265', 'vp9');

const presentProbeArb: fc.Arbitrary<OutputProbe> = fc.record({
  exists: fc.constant(true),
  sizeBytes: fc.integer({ min: 1, max: 50_000_000 }),
  hasVideoStream: fc.boolean(),
  container: goodContainer,
  videoCodec: goodCodec,
  audioCodec: fc.oneof(fc.constantFrom('aac', 'opus'), fc.constant(null)),
  audioStreamCount: fc.integer({ min: 0, max: 3 }),
  width: fc.integer({ min: 320, max: 3840 }),
  height: fc.integer({ min: 240, max: 2160 }),
  fps: fc.constantFrom(24, 25, 30, 50, 60),
  durationMs: fc.integer({ min: 0, max: 120_000 }),
});

/** A requested output spec drawn from the same value space as the probe. */
const requestedSpecArb: fc.Arbitrary<RequestedOutputSpec> = fc.record({
  container: goodContainer,
  videoCodec: goodCodec,
  audioCodec: fc.oneof(fc.constantFrom('aac', 'opus'), fc.constant(null), fc.constant(undefined)),
  width: fc.integer({ min: 320, max: 3840 }),
  height: fc.integer({ min: 240, max: 2160 }),
  fps: fc.constantFrom(24, 25, 30, 50, 60),
  expectedAudioStreamCount: fc.integer({ min: 0, max: 3 }),
  requestedDurationMs: requestedDurationArb,
});

// ---------------------------------------------------------------------------
// Independent oracles re-deriving the spec definitions (Req 14.2, 14.3)
// ---------------------------------------------------------------------------

/** Oracle for the five quality-failure conditions (Req 14.3a–e). */
function oracleFailures(metrics: QualityMetrics, requestedDurationMs: number): QualityFailureCode[] {
  const out: QualityFailureCode[] = [];
  if (metrics.longestBlackRunMs >= blackFrameMinMs) out.push('BLACK_FRAMES');
  if (metrics.longestFrozenRunMs >= frozenFrameMinMs) out.push('FROZEN_FRAMES');
  if (metrics.audioExpected && (!metrics.audioPresent || metrics.audioSilentFraction >= 1)) {
    out.push('AUDIO_MISSING_OR_SILENT');
  }
  if (Math.abs(metrics.measuredDurationMs - requestedDurationMs) > durationToleranceMs) {
    out.push('DURATION_MISMATCH');
  }
  if (metrics.maxArtifactAreaFraction >= artifactAreaFraction) out.push('VISUAL_ARTIFACTS');
  return out;
}

/** Oracle for requested-spec mismatch classification (Req 14.2). */
function oracleMismatches(probe: OutputProbe, requested: RequestedOutputSpec): SpecMismatchCode[] {
  const out: SpecMismatchCode[] = [];
  if (probe.container !== requested.container) out.push('CONTAINER');
  if (probe.videoCodec !== requested.videoCodec) out.push('VIDEO_CODEC');
  const reqAudio = requested.audioCodec ?? null;
  if (reqAudio !== null && probe.audioCodec !== reqAudio) out.push('AUDIO_CODEC');
  if (probe.width !== requested.width) out.push('WIDTH');
  if (probe.height !== requested.height) out.push('HEIGHT');
  if (Math.abs(probe.fps - requested.fps) > fpsTolerance) out.push('FPS');
  if (probe.audioStreamCount !== requested.expectedAudioStreamCount) out.push('AUDIO_STREAM_COUNT');
  if (Math.abs(probe.durationMs - requested.requestedDurationMs) > durationToleranceMs) {
    out.push('DURATION');
  }
  return out;
}

// ===========================================================================
// Property 35: QC classifies quality failures exactly per definition and
// checks existence first
// Validates: Requirements 14.1, 14.2, 14.3
// ===========================================================================

describe('Property 35: QC classifies exactly per definition and checks existence first (Req 14.1, 14.2, 14.3)', () => {
  // -------------------------------------------------------------------------
  // Req 14.3 — quality-failure classification is exactly the definition.
  // -------------------------------------------------------------------------
  it('classifyQualityFailures matches the independent oracle exactly (iff)', () => {
    fc.assert(
      fc.property(metricsArb, requestedDurationArb, (metrics, requestedDurationMs) => {
        const result = classifyQualityFailures(metrics, requestedDurationMs);
        const expected = oracleFailures(metrics, requestedDurationMs);
        expect(result.failures).toEqual(expected);
        expect(result.isFailure).toBe(expected.length > 0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the black-frame condition holds exactly at the ≥ blackFrameMinMs boundary (14.3a)', () => {
    fc.assert(
      fc.property(metricsArb, requestedDurationArb, (metrics, dur) => {
        const has = classifyQualityFailures(metrics, dur).failures.includes('BLACK_FRAMES');
        expect(has).toBe(metrics.longestBlackRunMs >= blackFrameMinMs);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the frozen-frame condition holds exactly at the ≥ frozenFrameMinMs boundary (14.3b)', () => {
    fc.assert(
      fc.property(metricsArb, requestedDurationArb, (metrics, dur) => {
        const has = classifyQualityFailures(metrics, dur).failures.includes('FROZEN_FRAMES');
        expect(has).toBe(metrics.longestFrozenRunMs >= frozenFrameMinMs);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the audio condition is evaluated only when audio is expected (14.3c)', () => {
    fc.assert(
      fc.property(metricsArb, requestedDurationArb, (metrics, dur) => {
        const has = classifyQualityFailures(metrics, dur).failures.includes(
          'AUDIO_MISSING_OR_SILENT',
        );
        if (!metrics.audioExpected) {
          // No audio expected → never an audio failure regardless of presence/silence.
          expect(has).toBe(false);
        } else {
          expect(has).toBe(!metrics.audioPresent || metrics.audioSilentFraction >= 1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the artifact condition holds exactly at the ≥ artifactAreaFraction boundary (14.3e)', () => {
    fc.assert(
      fc.property(metricsArb, requestedDurationArb, (metrics, dur) => {
        const has = classifyQualityFailures(metrics, dur).failures.includes('VISUAL_ARTIFACTS');
        expect(has).toBe(metrics.maxArtifactAreaFraction >= artifactAreaFraction);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('duration-mismatch uses a STRICT > 0.5s tolerance (14.3d): exactly ±tolerance is not a failure', () => {
    fc.assert(
      fc.property(
        requestedDurationArb,
        fc.integer({ min: -durationToleranceMs, max: durationToleranceMs }),
        (dur, delta) => {
          // Any measured duration within the closed ±tolerance band is NOT a mismatch.
          const metrics: QualityMetrics = {
            longestBlackRunMs: 0,
            longestFrozenRunMs: 0,
            audioExpected: false,
            audioPresent: true,
            audioSilentFraction: 0,
            maxArtifactAreaFraction: 0,
            measuredDurationMs: dur + delta,
          };
          expect(classifyQualityFailures(metrics, dur).failures).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('a duration just outside the tolerance band IS a mismatch (14.3d)', () => {
    fc.assert(
      fc.property(requestedDurationArb, fc.integer({ min: 1, max: 5_000 }), (dur, extra) => {
        const metrics: QualityMetrics = {
          longestBlackRunMs: 0,
          longestFrozenRunMs: 0,
          audioExpected: false,
          audioPresent: true,
          audioSilentFraction: 0,
          maxArtifactAreaFraction: 0,
          measuredDurationMs: dur + durationToleranceMs + extra,
        };
        expect(classifyQualityFailures(metrics, dur).failures).toContain('DURATION_MISMATCH');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a clean output (all metrics below thresholds) is never a failure', () => {
    fc.assert(
      fc.property(requestedDurationArb, (dur) => {
        const metrics: QualityMetrics = {
          longestBlackRunMs: blackFrameMinMs - 1,
          longestFrozenRunMs: frozenFrameMinMs - 1,
          audioExpected: true,
          audioPresent: true,
          audioSilentFraction: 0,
          maxArtifactAreaFraction: artifactAreaFraction - 0.01,
          measuredDurationMs: dur,
        };
        const result = classifyQualityFailures(metrics, dur);
        expect(result.isFailure).toBe(false);
        expect(result.failures).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 14.2 — requested-spec validation.
  // -------------------------------------------------------------------------
  it('validateRequestedSpec reports exactly the mismatching attributes (oracle iff)', () => {
    fc.assert(
      fc.property(presentProbeArb, requestedSpecArb, (probe, requested) => {
        const result = validateRequestedSpec(probe, requested);
        const expected = oracleMismatches(probe, requested);
        expect(result.mismatches).toEqual(expected);
        expect(result.valid).toBe(expected.length === 0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a probe matching every requested attribute validates as valid', () => {
    fc.assert(
      fc.property(presentProbeArb, (probe) => {
        const requested: RequestedOutputSpec = {
          container: probe.container,
          videoCodec: probe.videoCodec,
          audioCodec: probe.audioCodec,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          expectedAudioStreamCount: probe.audioStreamCount,
          requestedDurationMs: probe.durationMs,
        };
        const result = validateRequestedSpec(probe, requested);
        expect(result.valid).toBe(true);
        expect(result.mismatches).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('audio codec is only compared when an audio codec was requested (14.2)', () => {
    fc.assert(
      fc.property(presentProbeArb, (probe) => {
        // Requesting no audio codec (null) must never yield an AUDIO_CODEC mismatch,
        // regardless of the probe's audio codec.
        const requested: RequestedOutputSpec = {
          container: probe.container,
          videoCodec: probe.videoCodec,
          audioCodec: null,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          expectedAudioStreamCount: probe.audioStreamCount,
          requestedDurationMs: probe.durationMs,
        };
        expect(validateRequestedSpec(probe, requested).mismatches).not.toContain('AUDIO_CODEC');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Req 14.1 — existence-first: no spec/quality validation for a missing/empty
  // output. inspectOutput must short-circuit.
  // -------------------------------------------------------------------------
  it('checkOutputExists fails for a non-existent file and passes only when present & non-empty', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: -10, max: 10_000 }),
        (exists, sizeBytes) => {
          const probe = { exists, sizeBytes } as OutputProbe;
          const result = checkOutputExists(probe);
          if (!exists) {
            expect(result).toEqual({ ok: false, code: 'MISSING', message: expect.any(String) });
          } else if (sizeBytes <= 0) {
            expect(result).toEqual({ ok: false, code: 'EMPTY', message: expect.any(String) });
          } else {
            expect(result).toEqual({ ok: true });
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('inspectOutput performs NO spec/quality validation when the output is missing or empty (14.1)', () => {
    // A missing/empty probe combined with fully-failing metrics and a mismatching
    // spec: the existence-first invariant means spec & quality are never even evaluated.
    const missingOrEmptyProbeArb: fc.Arbitrary<OutputProbe> = presentProbeArb.chain((p) =>
      fc.oneof(
        fc.constant({ ...p, exists: false }),
        fc.constant({ ...p, exists: true, sizeBytes: 0 }),
      ),
    );
    fc.assert(
      fc.property(
        missingOrEmptyProbeArb,
        requestedSpecArb,
        metricsArb,
        (probe, requested, metrics) => {
          const inspection = inspectOutput(probe, requested, metrics);
          expect(inspection.ok).toBe(false);
          expect(inspection.existence.ok).toBe(false);
          // The invariant: spec/quality are absent (never evaluated).
          expect(inspection.spec).toBeUndefined();
          expect(inspection.quality).toBeUndefined();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('inspectOutput evaluates spec & quality ONLY when existence passes, and ok ⇔ spec valid ∧ no quality failure (14.1–14.3)', () => {
    fc.assert(
      fc.property(presentProbeArb, requestedSpecArb, metricsArb, (probe, requested, metrics) => {
        const inspection = inspectOutput(probe, requested, metrics);
        expect(inspection.existence.ok).toBe(true);
        // With existence passing, both sub-validations are present.
        expect(inspection.spec).toBeDefined();
        expect(inspection.quality).toBeDefined();
        const specValid = inspection.spec!.valid;
        const qualityFailed = inspection.quality!.isFailure;
        expect(inspection.ok).toBe(specValid && !qualityFailed);
        // And the sub-results agree with the standalone functions / oracle.
        expect(inspection.spec!.mismatches).toEqual(oracleMismatches(probe, requested));
        expect(inspection.quality!.failures).toEqual(
          oracleFailures(metrics, requested.requestedDurationMs),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Property 36: Repair attempts are bounded and terminal failure preserves the
// prior valid version
// Validates: Requirements 14.5, 14.6, 14.7
// ===========================================================================

/** A configured strategy set, sometimes empty (falls back to defaults). */
const strategiesArb: fc.Arbitrary<readonly RepairStrategy[]> = fc.oneof(
  fc.constant(undefined as unknown as readonly RepairStrategy[]),
  fc.constant([] as readonly RepairStrategy[]),
  fc.subarray([...DEFAULT_REPAIR_STRATEGIES], { minLength: 1 }),
);

describe('Property 36: Repair attempts are bounded; terminal failure preserves prior version (Req 14.5, 14.6, 14.7)', () => {
  it('no quality failure → decision is always "complete" (no repair issued)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), strategiesArb, (attemptsUsed, strategies) => {
        const decision = decideRepair({
          qualityFailed: false,
          attemptsUsed,
          availableStrategies: strategies,
        });
        expect(decision.action).toBe('complete');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('repair attempts never exceed the configured maximum (14.5)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), strategiesArb, (attemptsUsed, strategies) => {
        const decision = decideRepair({
          qualityFailed: true,
          attemptsUsed,
          availableStrategies: strategies,
        });
        if (decision.action === 'repair') {
          // A repair is only issued while used attempts are below the max, and the
          // 1-based attempt number never exceeds the configured maximum.
          expect(Math.max(0, Math.floor(attemptsUsed))).toBeLessThan(maxRepairAttempts);
          expect(decision.attemptNumber).toBeGreaterThanOrEqual(1);
          expect(decision.attemptNumber).toBeLessThanOrEqual(maxRepairAttempts);
        } else {
          // Otherwise the attempts are exhausted and we revert.
          expect(decision.action).toBe('revert');
          expect(Math.max(0, Math.floor(attemptsUsed))).toBeGreaterThanOrEqual(maxRepairAttempts);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('once the maximum is reached, a persisting failure reverts and is NOT marked successful (14.6, 14.7)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: maxRepairAttempts, max: maxRepairAttempts + 50 }),
        strategiesArb,
        (attemptsUsed, strategies) => {
          const decision = decideRepair({
            qualityFailed: true,
            attemptsUsed,
            availableStrategies: strategies,
          });
          expect(decision.action).toBe('revert');
          if (decision.action === 'revert') {
            // Terminal failure returns the QC-failed error indication (14.7) and,
            // being a revert (not a "complete"), never marks the output successful.
            expect(decision.errorCode).toBe('QUALITY_CONTROL_FAILED');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('below the maximum, a failure issues a repair whose 1-based number is attemptsUsed+1 (14.5)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Math.max(0, maxRepairAttempts - 1) }),
        strategiesArb,
        (attemptsUsed, strategies) => {
          const decision = decideRepair({
            qualityFailed: true,
            attemptsUsed,
            availableStrategies: strategies,
          });
          // maxRepairAttempts is ≥1 in config; each used-count below it issues a repair.
          expect(decision.action).toBe('repair');
          if (decision.action === 'repair') {
            expect(decision.attemptNumber).toBe(attemptsUsed + 1);
            // The selected strategy is one of the configured (or default) set.
            const set =
              strategies && strategies.length > 0 ? strategies : DEFAULT_REPAIR_STRATEGIES;
            expect(set).toContain(decision.strategy);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('decideRepair is deterministic for identical input', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 100 }),
        strategiesArb,
        (qualityFailed, attemptsUsed, strategies) => {
          const a = decideRepair({ qualityFailed, attemptsUsed, availableStrategies: strategies });
          const b = decideRepair({ qualityFailed, attemptsUsed, availableStrategies: strategies });
          expect(a).toEqual(b);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('canAttemptRepair agrees with the bound and with decideRepair on a failure', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 100 }), (attemptsUsed) => {
        const allowed = canAttemptRepair(attemptsUsed);
        expect(allowed).toBe(Math.max(0, Math.floor(attemptsUsed)) < maxRepairAttempts);
        const decision = decideRepair({ qualityFailed: true, attemptsUsed });
        expect(decision.action === 'repair').toBe(allowed);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('negative or fractional attemptsUsed is normalized (never grants extra attempts)', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (attemptsUsed) => {
        const decision = decideRepair({ qualityFailed: true, attemptsUsed });
        const normalized = Math.max(0, Math.floor(attemptsUsed));
        if (normalized >= maxRepairAttempts) {
          expect(decision.action).toBe('revert');
        } else {
          expect(decision.action).toBe('repair');
          if (decision.action === 'repair') {
            expect(decision.attemptNumber).toBe(normalized + 1);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Task 14.3 — Property test for render-validation soundness
// (validateRender in quality-controller.logic.ts).
//
//   Property 37: Render validation is sound — success implies a valid file,
//                failure never exposes success
//                Validates: Requirements 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
//
// validateRender is the total, sound predicate the Render_Engine consults
// before marking a Video_Edit_Job COMPLETED (Req 15.6) or FAILED (Req 15.7).
// The soundness contract: `valid === true` IFF `failedChecks` is empty, a valid
// result implies every profile/timeline check passed (Req 15.2–15.5), and every
// failing condition surfaces its corresponding failure code. Generators below
// concentrate mass around the profile's minimum byte size, the ±0.5s duration
// band, and the ±0.01 fps band so the tolerance boundaries are exercised. An
// independent oracle re-derives the check set (including the existence-first
// short-circuit) rather than re-using the implementation.
// ===========================================================================

const RENDER_PROFILES = Object.values(EXPORT_PROFILES);

/** All valid profile-relevant containers/codecs, incl. values that mismatch a profile. */
const anyContainerArb = fc.constantFrom('mp4', 'webm', 'mov', 'avi', 'mkv');
const anyVideoCodecArb = fc.constantFrom('h264', 'h265', 'vp9', 'av1');

/**
 * A RenderValidationInput drawn against a real export profile, with probe fields
 * concentrated around each profile/timeline threshold so boundary behaviour is
 * hit often. `exists` is weighted toward true so the post-existence checks are
 * exercised, but missing/empty cases still occur to cover the short-circuit.
 */
const renderInputArb: fc.Arbitrary<RenderValidationInput> = fc
  .constantFrom(...RENDER_PROFILES)
  .chain((profile) =>
    fc.integer({ min: 0, max: 120_000 }).chain((expectedDurationMs) =>
      fc.record<RenderValidationInput>({
        profile: fc.constant(profile),
        expectedDurationMs: fc.constant(expectedDurationMs),
        audioExpected: fc.boolean(),
        probe: fc.record<OutputProbe>({
          exists: fc.oneof(
            { weight: 5, arbitrary: fc.constant(true) },
            { weight: 1, arbitrary: fc.constant(false) },
          ),
          // Concentrate around the profile minimum-size boundary, plus 0/large.
          sizeBytes: fc.oneof(
            fc.constant(0),
            fc.integer({
              min: Math.max(0, profile.minOutputBytes - 4),
              max: profile.minOutputBytes + 4,
            }),
            fc.integer({ min: 1, max: 50_000_000 }),
          ),
          hasVideoStream: fc.oneof(
            { weight: 4, arbitrary: fc.constant(true) },
            { weight: 1, arbitrary: fc.constant(false) },
          ),
          container: fc.oneof(
            { weight: 4, arbitrary: fc.constant(profile.container) },
            { weight: 1, arbitrary: anyContainerArb },
          ),
          videoCodec: fc.oneof(
            { weight: 4, arbitrary: fc.constant(profile.videoCodec) },
            { weight: 1, arbitrary: anyVideoCodecArb },
          ),
          audioCodec: fc.oneof(fc.constantFrom('aac', 'opus'), fc.constant(null)),
          audioStreamCount: fc.integer({ min: 0, max: 3 }),
          width: fc.oneof(
            { weight: 4, arbitrary: fc.constant(profile.width) },
            { weight: 1, arbitrary: fc.integer({ min: 320, max: 3840 }) },
          ),
          height: fc.oneof(
            { weight: 4, arbitrary: fc.constant(profile.height) },
            { weight: 1, arbitrary: fc.integer({ min: 240, max: 2160 }) },
          ),
          // Concentrate around the ±fpsTolerance band around the profile fps.
          fps: fc.oneof(
            fc.constant(profile.fps),
            fc.double({
              min: profile.fps - 0.05,
              max: profile.fps + 0.05,
              noNaN: true,
            }),
            fc.constantFrom(24, 25, 50, 60),
          ),
          // Concentrate around the ±durationToleranceMs band around expected.
          durationMs: fc.oneof(
            fc.constant(expectedDurationMs),
            fc.integer({
              min: Math.max(0, expectedDurationMs - durationToleranceMs - 3),
              max: expectedDurationMs + durationToleranceMs + 3,
            }),
            fc.integer({ min: 0, max: 120_000 }),
          ),
        }),
      }),
    ),
  );

/**
 * Independent oracle re-deriving validateRender's failed-check set from the spec
 * (Req 15.2–15.5), including the existence-first short-circuit: when the file is
 * missing/empty, only that single existence code is reported and no other check
 * is evaluated.
 */
function oracleRenderChecks(input: RenderValidationInput): RenderValidationCode[] {
  const { probe, profile, expectedDurationMs, audioExpected } = input;
  // Existence-first (Req 15.2): missing or empty short-circuits everything else.
  if (!probe || probe.exists !== true) return ['MISSING'];
  if (
    typeof probe.sizeBytes !== 'number' ||
    !Number.isFinite(probe.sizeBytes) ||
    probe.sizeBytes <= 0
  ) {
    return ['EMPTY'];
  }

  const checks: RenderValidationCode[] = [];
  if (probe.sizeBytes < profile.minOutputBytes) checks.push('BELOW_MIN_SIZE'); // Req 15.2
  if (probe.hasVideoStream !== true) checks.push('NO_VIDEO_STREAM'); // Req 15.3
  if (probe.container !== profile.container) checks.push('CONTAINER'); // Req 15.3
  if (probe.videoCodec !== profile.videoCodec) checks.push('VIDEO_CODEC'); // Req 15.3
  if (probe.width !== profile.width) checks.push('WIDTH'); // Req 15.3
  if (probe.height !== profile.height) checks.push('HEIGHT'); // Req 15.3
  if (!(Math.abs(probe.durationMs - expectedDurationMs) <= durationToleranceMs)) {
    checks.push('DURATION'); // Req 15.4
  }
  if (!(Math.abs(probe.fps - profile.fps) <= fpsTolerance)) checks.push('FPS'); // Req 15.4
  if (audioExpected && probe.audioStreamCount < 1) checks.push('AUDIO_MISSING'); // Req 15.5
  return checks;
}

/** A profile-conforming probe: passes every render-validation check. */
function conformingProbe(profile: ExportProfile, expectedDurationMs: number): OutputProbe {
  return {
    exists: true,
    sizeBytes: profile.minOutputBytes,
    hasVideoStream: true,
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: profile.audioCodec,
    audioStreamCount: 1,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    durationMs: expectedDurationMs,
  };
}

describe('Property 37: Render validation is sound — success ⇔ valid file, failure never exposes success (Req 15.2–15.7)', () => {
  // -------------------------------------------------------------------------
  // Core soundness (Req 15.6, 15.7): valid IFF no failed checks.
  // -------------------------------------------------------------------------
  it('valid === true if and only if failedChecks is empty', () => {
    fc.assert(
      fc.property(renderInputArb, (input) => {
        const result = validateRender(input);
        expect(result.valid).toBe(result.failedChecks.length === 0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Exactness: the reported checks equal the independent oracle (Req 15.2–15.5).
  // -------------------------------------------------------------------------
  it('failedChecks equals the independent oracle exactly (existence-first short-circuit included)', () => {
    fc.assert(
      fc.property(renderInputArb, (input) => {
        const result = validateRender(input);
        expect(result.failedChecks).toEqual(oracleRenderChecks(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Soundness of success (Req 15.2–15.6): valid === true IMPLIES a real file
  // that satisfies every profile/timeline condition.
  // -------------------------------------------------------------------------
  it('a valid result implies the file exists, is non-empty, and satisfies every profile/timeline check', () => {
    fc.assert(
      fc.property(renderInputArb, (input) => {
        const result = validateRender(input);
        if (result.valid) {
          const { probe, profile, expectedDurationMs, audioExpected } = input;
          // Req 15.2 — exists, non-empty, size ≥ profile minimum.
          expect(probe.exists).toBe(true);
          expect(probe.sizeBytes).toBeGreaterThan(0);
          expect(probe.sizeBytes).toBeGreaterThanOrEqual(profile.minOutputBytes);
          // Req 15.3 — video stream + container/codec/dimensions match profile.
          expect(probe.hasVideoStream).toBe(true);
          expect(probe.container).toBe(profile.container);
          expect(probe.videoCodec).toBe(profile.videoCodec);
          expect(probe.width).toBe(profile.width);
          expect(probe.height).toBe(profile.height);
          // Req 15.4 — duration within ±0.5s, fps within ±0.01.
          expect(Math.abs(probe.durationMs - expectedDurationMs)).toBeLessThanOrEqual(
            durationToleranceMs,
          );
          expect(Math.abs(probe.fps - profile.fps)).toBeLessThanOrEqual(fpsTolerance);
          // Req 15.5 — audio stream present when expected.
          if (audioExpected) expect(probe.audioStreamCount).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a fully profile-conforming render is always valid with no failed checks (Req 15.6)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RENDER_PROFILES),
        fc.integer({ min: 0, max: 120_000 }),
        fc.boolean(),
        (profile, expectedDurationMs, audioExpected) => {
          const result = validateRender({
            profile,
            expectedDurationMs,
            audioExpected,
            probe: conformingProbe(profile, expectedDurationMs),
          });
          expect(result.valid).toBe(true);
          expect(result.failedChecks).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // -------------------------------------------------------------------------
  // Failure never exposes success (Req 15.7): any single broken condition
  // yields valid === false carrying the corresponding code.
  // -------------------------------------------------------------------------
  it('a missing file yields valid === false with only MISSING (existence-first, Req 15.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RENDER_PROFILES),
        fc.integer({ min: 0, max: 120_000 }),
        fc.boolean(),
        (profile, expectedDurationMs, audioExpected) => {
          const probe = { ...conformingProbe(profile, expectedDurationMs), exists: false };
          const result = validateRender({ profile, expectedDurationMs, audioExpected, probe });
          expect(result.valid).toBe(false);
          expect(result.failedChecks).toEqual(['MISSING']);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('an empty file yields valid === false with only EMPTY (existence-first, Req 15.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RENDER_PROFILES),
        fc.integer({ min: 0, max: 120_000 }),
        fc.boolean(),
        (profile, expectedDurationMs, audioExpected) => {
          const probe = { ...conformingProbe(profile, expectedDurationMs), sizeBytes: 0 };
          const result = validateRender({ profile, expectedDurationMs, audioExpected, probe });
          expect(result.valid).toBe(false);
          expect(result.failedChecks).toEqual(['EMPTY']);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('each single broken condition yields valid === false carrying the corresponding code (Req 15.2–15.5, 15.7)', () => {
    // Break exactly one condition on an otherwise-conforming, existing, non-empty
    // probe and assert the matching failure code is reported and valid is false.
    const breakers: Array<{
      code: RenderValidationCode;
      audioExpected: boolean;
      mutate: (p: OutputProbe, profile: ExportProfile, expectedDurationMs: number) => OutputProbe;
    }> = [
      {
        code: 'BELOW_MIN_SIZE',
        audioExpected: false,
        mutate: (p, profile) => ({ ...p, sizeBytes: Math.max(1, profile.minOutputBytes - 1) }),
      },
      { code: 'NO_VIDEO_STREAM', audioExpected: false, mutate: (p) => ({ ...p, hasVideoStream: false }) },
      { code: 'CONTAINER', audioExpected: false, mutate: (p) => ({ ...p, container: 'mkv' }) },
      { code: 'VIDEO_CODEC', audioExpected: false, mutate: (p) => ({ ...p, videoCodec: 'av1' }) },
      { code: 'WIDTH', audioExpected: false, mutate: (p) => ({ ...p, width: p.width + 2 }) },
      { code: 'HEIGHT', audioExpected: false, mutate: (p) => ({ ...p, height: p.height + 2 }) },
      {
        code: 'DURATION',
        audioExpected: false,
        mutate: (p, _profile, expectedDurationMs) => ({
          ...p,
          durationMs: expectedDurationMs + durationToleranceMs + 1,
        }),
      },
      {
        code: 'FPS',
        audioExpected: false,
        mutate: (p, profile) => ({ ...p, fps: profile.fps + fpsTolerance + 0.01 }),
      },
      { code: 'AUDIO_MISSING', audioExpected: true, mutate: (p) => ({ ...p, audioStreamCount: 0 }) },
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...RENDER_PROFILES),
        fc.integer({ min: 0, max: 120_000 }),
        fc.constantFrom(...breakers),
        (profile, expectedDurationMs, breaker) => {
          const base = conformingProbe(profile, expectedDurationMs);
          const probe = breaker.mutate(base, profile, expectedDurationMs);
          const result = validateRender({
            profile,
            expectedDurationMs,
            audioExpected: breaker.audioExpected,
            probe,
          });
          expect(result.valid).toBe(false);
          expect(result.failedChecks).toContain(breaker.code);
          // Breaking exactly one condition surfaces exactly that one code.
          expect(result.failedChecks).toEqual([breaker.code]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('validateRender is total and deterministic (never throws; identical input ⇒ identical result)', () => {
    fc.assert(
      fc.property(renderInputArb, (input) => {
        const a = validateRender(input);
        const b = validateRender(input);
        expect(a).toEqual(b);
        expect(typeof a.valid).toBe('boolean');
        expect(Array.isArray(a.failedChecks)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
