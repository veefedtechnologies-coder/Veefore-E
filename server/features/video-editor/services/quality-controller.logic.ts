/**
 * Quality_Controller — pure (DB-free, IO-free, FFmpeg-free) core.
 *
 * The Quality_Controller decides whether a generative or rendered output is
 * acceptable and, when it is not, how the bounded repair loop should proceed
 * (design §"Quality_Controller", §"Render_Engine"). This module is the
 * deterministic decision core kept pure and side-effect-free so it can be
 * exercised by property tests (`quality-controller.logic.test.ts`, tasks 14.2
 * and 14.3), matching the `veegpt-*.logic.ts` convention. The DB/FFmpeg-backed
 * `quality-controller.service.ts` (task 14.5) and `render-engine.service.ts`
 * (task 14.4) wrap this core: they run FFprobe / frame analysis, feed the
 * measured metrics into these functions, and act on the returned decisions.
 *
 * The governing invariants are enforced structurally here:
 *
 *  1. Existence-first (Req 14.1). {@link inspectOutput} verifies the output file
 *     exists and is non-empty BEFORE performing any spec or quality validation —
 *     when existence fails, no further validation is even evaluated.
 *  2. Exact quality-failure classification (Req 14.3). {@link classifyQualityFailures}
 *     classifies a quality failure IF AND ONLY IF one of the five defined
 *     conditions holds, each compared against the single-source thresholds in
 *     `QUALITY_CONTROL_THRESHOLDS`.
 *  3. Requested-spec validation (Req 14.2). {@link validateRequestedSpec} checks
 *     container/codec/dimensions/fps/audio-stream-count against what the operation
 *     requested and the measured duration within 0.5 s.
 *  4. Sound render validation (Req 15.2–15.7). {@link validateRender} is a total
 *     predicate whose success implies a file that passed every profile check and
 *     whose failure never reports success — the Render_Engine marks a job
 *     COMPLETED only when this returns `valid: true`.
 *  5. Bounded repair (Req 14.5–14.7). {@link decideRepair} caps repair attempts at
 *     the configured maximum (default 3) and, once exhausted, directs a revert to
 *     the prior valid version rather than ever marking a corrupted output as
 *     successful.
 *
 * Every threshold and every export-profile field come from
 * `video-editor.config.ts` — the single source (Req 13.1). Nothing here
 * hardcodes a threshold.
 */

import { QUALITY_CONTROL_THRESHOLDS, type ExportProfile } from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Measured-output inputs
// ---------------------------------------------------------------------------

/**
 * FFprobe-derived container/stream metrics measured from an output file. The
 * service populates this from a real FFprobe pass; the pure core never performs
 * IO. `exists`/`sizeBytes` drive the existence-first check (Req 14.1); the
 * remaining fields drive spec validation (Req 14.2) and render validation
 * (Req 15.2–15.5).
 */
export interface OutputProbe {
  /** Whether the output file exists on the backing store. */
  exists: boolean;
  /** Measured file size in bytes (0 when empty). */
  sizeBytes: number;
  /** Whether the file contains at least one decodable video stream. */
  hasVideoStream: boolean;
  /** Detected container format (e.g. 'mp4'). */
  container: string;
  /** Detected video codec (e.g. 'h264'). */
  videoCodec: string;
  /** Detected audio codec, or `null` when no audio stream is present. */
  audioCodec: string | null;
  /** Number of audio streams present. */
  audioStreamCount: number;
  /** Encoded frame width in pixels. */
  width: number;
  /** Encoded frame height in pixels. */
  height: number;
  /** Measured average frame rate in fps. */
  fps: number;
  /** Measured duration in milliseconds. */
  durationMs: number;
}

/**
 * Frame-analysis metrics used to classify a quality failure (Req 14.3). The
 * service produces these from a real frame/audio analysis pass; the pure core
 * classifies them against the configured thresholds.
 */
export interface QualityMetrics {
  /** Longest fully-black frame run, in milliseconds (Req 14.3a). */
  longestBlackRunMs: number;
  /** Longest frozen (visually unchanging) frame run, in milliseconds (Req 14.3b). */
  longestFrozenRunMs: number;
  /** Whether an audio stream is expected for this output (Req 14.3c). */
  audioExpected: boolean;
  /** Whether an audio stream is actually present (Req 14.3c). */
  audioPresent: boolean;
  /**
   * Fraction (0..1) of the audio duration that is silent (Req 14.3c). A value of
   * 1 means the audio is silent for 100 percent of its duration.
   */
  audioSilentFraction: number;
  /** Maximum fraction (0..1) of any single frame's area covered by visual artifacts (Req 14.3e). */
  maxArtifactAreaFraction: number;
  /** Measured output duration in milliseconds (Req 14.3d). */
  measuredDurationMs: number;
}

/**
 * The output characteristics the operation requested, validated against the
 * measured {@link OutputProbe} (Req 14.2).
 */
export interface RequestedOutputSpec {
  /** Requested container format. */
  container: string;
  /** Requested video codec. */
  videoCodec: string;
  /** Requested audio codec, if audio was requested; `null`/omitted when none. */
  audioCodec?: string | null;
  /** Requested frame width in pixels. */
  width: number;
  /** Requested frame height in pixels. */
  height: number;
  /** Requested frame rate in fps. */
  fps: number;
  /** Expected number of audio streams in the output. */
  expectedAudioStreamCount: number;
  /** Requested output duration in milliseconds. */
  requestedDurationMs: number;
}

// ---------------------------------------------------------------------------
// Existence-first check (Req 14.1)
// ---------------------------------------------------------------------------

/** Why an output failed the existence-first check (Req 14.1). */
export type ExistenceFailureCode =
  /** The output file does not exist. */
  | 'MISSING'
  /** The output file exists but is empty (zero bytes). */
  | 'EMPTY';

/** Result of the existence-first check (Req 14.1). */
export type ExistenceResult =
  | { ok: true }
  | { ok: false; code: ExistenceFailureCode; message: string };

/**
 * Verify the output exists and is non-empty BEFORE any further validation
 * (Req 14.1). Pure and total. The service must call this first and only proceed
 * to spec/quality validation when it returns `{ ok: true }`.
 */
export function checkOutputExists(probe: OutputProbe): ExistenceResult {
  if (!probe || probe.exists !== true) {
    return { ok: false, code: 'MISSING', message: 'Output validation failed: the output file does not exist.' };
  }
  if (typeof probe.sizeBytes !== 'number' || !Number.isFinite(probe.sizeBytes) || probe.sizeBytes <= 0) {
    return { ok: false, code: 'EMPTY', message: 'Output validation failed: the output file is empty (zero bytes).' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Requested-spec validation (Req 14.2)
// ---------------------------------------------------------------------------

/** A single requested-spec attribute that did not match the measured output (Req 14.2). */
export type SpecMismatchCode =
  | 'CONTAINER'
  | 'VIDEO_CODEC'
  | 'AUDIO_CODEC'
  | 'WIDTH'
  | 'HEIGHT'
  | 'FPS'
  | 'AUDIO_STREAM_COUNT'
  | 'DURATION';

/** Result of validating the measured output against the requested spec (Req 14.2). */
export interface SpecValidationResult {
  /** True iff every requested attribute matches within tolerance. */
  valid: boolean;
  /** The specific attributes that did not match (empty when `valid`). */
  mismatches: SpecMismatchCode[];
}

/**
 * Validate that the measured output's container, codec, dimensions, frame rate,
 * and audio-stream count match what the operation requested, and that the
 * measured duration is within the configured tolerance (0.5 s) of the requested
 * duration (Req 14.2).
 *
 * Frame rate is matched within `QUALITY_CONTROL_THRESHOLDS.fpsTolerance` and
 * duration within `QUALITY_CONTROL_THRESHOLDS.durationToleranceMs` — both from
 * the single config source (Req 13.1). Pure and total.
 */
export function validateRequestedSpec(
  probe: OutputProbe,
  requested: RequestedOutputSpec,
): SpecValidationResult {
  const { durationToleranceMs, fpsTolerance } = QUALITY_CONTROL_THRESHOLDS;
  const mismatches: SpecMismatchCode[] = [];

  if (probe.container !== requested.container) mismatches.push('CONTAINER');
  if (probe.videoCodec !== requested.videoCodec) mismatches.push('VIDEO_CODEC');

  // Audio codec is only compared when an audio codec was requested (Req 14.2).
  const requestedAudioCodec = requested.audioCodec ?? null;
  if (requestedAudioCodec !== null && probe.audioCodec !== requestedAudioCodec) {
    mismatches.push('AUDIO_CODEC');
  }

  if (probe.width !== requested.width) mismatches.push('WIDTH');
  if (probe.height !== requested.height) mismatches.push('HEIGHT');
  if (!withinTolerance(probe.fps, requested.fps, fpsTolerance)) mismatches.push('FPS');
  if (probe.audioStreamCount !== requested.expectedAudioStreamCount) mismatches.push('AUDIO_STREAM_COUNT');
  if (!withinTolerance(probe.durationMs, requested.requestedDurationMs, durationToleranceMs)) {
    mismatches.push('DURATION');
  }

  return { valid: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Quality-failure classification (Req 14.3)
// ---------------------------------------------------------------------------

/** A specific quality-failure condition (Req 14.3a–e). */
export type QualityFailureCode =
  /** Fully-black frame sequence lasting ≥ configured minimum (Req 14.3a). */
  | 'BLACK_FRAMES'
  /** Frozen frame sequence lasting ≥ configured minimum (Req 14.3b). */
  | 'FROZEN_FRAMES'
  /** Expected audio stream absent or silent for 100% of its duration (Req 14.3c). */
  | 'AUDIO_MISSING_OR_SILENT'
  /** Measured duration differs from requested by more than the tolerance (Req 14.3d). */
  | 'DURATION_MISMATCH'
  /** Visual artifacts affecting ≥ configured fraction of the frame area (Req 14.3e). */
  | 'VISUAL_ARTIFACTS';

/** Result of quality-failure classification (Req 14.3). */
export interface QualityClassification {
  /** True iff at least one quality-failure condition holds. */
  isFailure: boolean;
  /** The specific conditions that held (empty when not a failure). */
  failures: QualityFailureCode[];
}

/**
 * Classify the output as a quality failure IF AND ONLY IF at least one of the
 * five defined conditions holds (Req 14.3):
 *   (a) a fully-black frame run ≥ `blackFrameMinMs`,
 *   (b) a frozen frame run ≥ `frozenFrameMinMs`,
 *   (c) an expected audio stream is absent or silent for 100% of its duration,
 *   (d) the measured duration differs from the requested by more than
 *       `durationToleranceMs`, or
 *   (e) visual artifacts cover ≥ `artifactAreaFraction` of any frame's area.
 *
 * All thresholds come from `QUALITY_CONTROL_THRESHOLDS` (single source, Req 13.1).
 * The audio condition is evaluated only when audio is expected (Req 14.3c). Pure
 * and total; produces a stable, order-deterministic list of the conditions met.
 */
export function classifyQualityFailures(
  metrics: QualityMetrics,
  requestedDurationMs: number,
): QualityClassification {
  const { blackFrameMinMs, frozenFrameMinMs, durationToleranceMs, artifactAreaFraction } =
    QUALITY_CONTROL_THRESHOLDS;
  const failures: QualityFailureCode[] = [];

  // (a) Black-frame run.
  if (metrics.longestBlackRunMs >= blackFrameMinMs) failures.push('BLACK_FRAMES');

  // (b) Frozen-frame run.
  if (metrics.longestFrozenRunMs >= frozenFrameMinMs) failures.push('FROZEN_FRAMES');

  // (c) Expected audio absent or fully silent (only when audio is expected).
  if (metrics.audioExpected && (!metrics.audioPresent || metrics.audioSilentFraction >= 1)) {
    failures.push('AUDIO_MISSING_OR_SILENT');
  }

  // (d) Duration mismatch beyond tolerance.
  if (Math.abs(metrics.measuredDurationMs - requestedDurationMs) > durationToleranceMs) {
    failures.push('DURATION_MISMATCH');
  }

  // (e) Visual artifacts over the configured fraction of frame area.
  if (metrics.maxArtifactAreaFraction >= artifactAreaFraction) failures.push('VISUAL_ARTIFACTS');

  return { isFailure: failures.length > 0, failures };
}

// ---------------------------------------------------------------------------
// Composite output inspection — existence-first (Req 14.1, 14.2, 14.3)
// ---------------------------------------------------------------------------

/**
 * The aggregate outcome of inspecting a generative/rendered output. `existence`
 * is always present. `spec` and `quality` are present ONLY when the existence
 * check passed — encoding the existence-first invariant (Req 14.1): when the
 * output is missing/empty, no further validation is even evaluated. `ok` is true
 * iff existence passed, the spec matched, and no quality failure was classified.
 */
export interface OutputInspection {
  ok: boolean;
  existence: ExistenceResult;
  spec?: SpecValidationResult;
  quality?: QualityClassification;
}

/**
 * Inspect an output existence-first (Req 14.1), then — only if it exists and is
 * non-empty — validate the requested spec (Req 14.2) and classify quality
 * failures (Req 14.3). Returns an aggregate {@link OutputInspection}. Pure and
 * total; short-circuits on existence so spec/quality are never evaluated for a
 * missing or empty output.
 */
export function inspectOutput(
  probe: OutputProbe,
  requested: RequestedOutputSpec,
  metrics: QualityMetrics,
): OutputInspection {
  const existence = checkOutputExists(probe);
  if (!existence.ok) {
    // Existence-first: perform NO further validation when the file is absent/empty.
    return { ok: false, existence };
  }

  const spec = validateRequestedSpec(probe, requested);
  const quality = classifyQualityFailures(metrics, requested.requestedDurationMs);
  return { ok: spec.valid && !quality.isFailure, existence, spec, quality };
}

// ---------------------------------------------------------------------------
// Render validation — sound success/failure predicate (Req 15.2–15.7)
// ---------------------------------------------------------------------------

/** A single render-validation check that failed (Req 15.2–15.5). */
export type RenderValidationCode =
  /** Output file does not exist (Req 15.2). */
  | 'MISSING'
  /** Output file is empty (Req 15.2). */
  | 'EMPTY'
  /** Output size is below the profile's minimum byte size (Req 15.2). */
  | 'BELOW_MIN_SIZE'
  /** No decodable video stream present (Req 15.3). */
  | 'NO_VIDEO_STREAM'
  /** Container does not match the export profile (Req 15.3). */
  | 'CONTAINER'
  /** Video codec does not match the export profile (Req 15.3). */
  | 'VIDEO_CODEC'
  /** Width does not match the export profile (Req 15.3). */
  | 'WIDTH'
  /** Height does not match the export profile (Req 15.3). */
  | 'HEIGHT'
  /** Duration outside ±tolerance of the expected timeline duration (Req 15.4). */
  | 'DURATION'
  /** Frame rate outside ±tolerance of the profile frame rate (Req 15.4). */
  | 'FPS'
  /** An audio stream was expected but is absent (Req 15.5). */
  | 'AUDIO_MISSING';

/** Input to the render-validation predicate (Req 15.2–15.5). */
export interface RenderValidationInput {
  /** FFprobe metrics measured from the rendered file. */
  probe: OutputProbe;
  /** The export profile the render targeted (from the single config source). */
  profile: ExportProfile;
  /** The timeline's expected duration in milliseconds (Req 15.4). */
  expectedDurationMs: number;
  /** Whether an audio track is expected in the render (Req 15.5). */
  audioExpected: boolean;
}

/** Result of the render-validation predicate (Req 15.6, 15.7). */
export interface RenderValidationResult {
  /** True iff EVERY render-validation check passed (Req 15.6). */
  valid: boolean;
  /** The specific checks that failed (empty iff `valid`). */
  failedChecks: RenderValidationCode[];
}

/**
 * Validate a rendered file against its export profile (Req 15.2–15.5). This is a
 * TOTAL, SOUND predicate: `valid` is true if and only if `failedChecks` is empty,
 * so a caller can never observe a "successful" render that also failed a check
 * (Req 15.6, 15.7). The Render_Engine marks the job COMPLETED only when this
 * returns `valid: true`; on any failure it marks the job FAILED, records the
 * failed-check code, retains the immutable input version, and does not expose the
 * output as a successful render (Req 15.7).
 *
 * Checks (all thresholds/profile fields from the single config source, Req 13.1):
 *  - exists and non-empty (Req 15.2)
 *  - size ≥ `profile.minOutputBytes` (Req 15.2)
 *  - has a video stream, container/codec/dimensions match the profile (Req 15.3)
 *  - duration within `durationToleranceMs` of expected, fps within `fpsTolerance`
 *    of the profile (Req 15.4)
 *  - audio stream present when expected (Req 15.5)
 *
 * Pure and total; never throws.
 */
export function validateRender(input: RenderValidationInput): RenderValidationResult {
  const { probe, profile, expectedDurationMs, audioExpected } = input;
  const { durationToleranceMs, fpsTolerance } = QUALITY_CONTROL_THRESHOLDS;
  const failedChecks: RenderValidationCode[] = [];

  // Existence + minimum-size (Req 15.2).
  const existence = checkOutputExists(probe);
  if (!existence.ok) {
    failedChecks.push(existence.code);
    // Without a real, non-empty file the remaining probe fields are meaningless.
    return { valid: false, failedChecks };
  }
  if (probe.sizeBytes < profile.minOutputBytes) failedChecks.push('BELOW_MIN_SIZE');

  // Video stream + container/codec/dimensions (Req 15.3).
  if (probe.hasVideoStream !== true) failedChecks.push('NO_VIDEO_STREAM');
  if (probe.container !== profile.container) failedChecks.push('CONTAINER');
  if (probe.videoCodec !== profile.videoCodec) failedChecks.push('VIDEO_CODEC');
  if (probe.width !== profile.width) failedChecks.push('WIDTH');
  if (probe.height !== profile.height) failedChecks.push('HEIGHT');

  // Duration + frame rate tolerances (Req 15.4).
  if (!withinTolerance(probe.durationMs, expectedDurationMs, durationToleranceMs)) {
    failedChecks.push('DURATION');
  }
  if (!withinTolerance(probe.fps, profile.fps, fpsTolerance)) failedChecks.push('FPS');

  // Audio presence when expected (Req 15.5).
  if (audioExpected && probe.audioStreamCount < 1) failedChecks.push('AUDIO_MISSING');

  return { valid: failedChecks.length === 0, failedChecks };
}

// ---------------------------------------------------------------------------
// Bounded repair loop (Req 14.4, 14.5, 14.6, 14.7)
// ---------------------------------------------------------------------------

/** A configured repair strategy the Quality_Controller may select (Req 14.4). */
export type RepairStrategy =
  | 'retry'
  | 'simplified_prompt'
  | 'deterministic_fallback'
  | 'alternative_provider'
  | 'user_clarification';

/** The default configured repair-strategy set, tried in this order (Req 14.4). */
export const DEFAULT_REPAIR_STRATEGIES: readonly RepairStrategy[] = [
  'retry',
  'simplified_prompt',
  'deterministic_fallback',
  'alternative_provider',
  'user_clarification',
];

/** Inputs to the repair-loop decision (Req 14.5–14.7). */
export interface RepairDecisionInput {
  /** Whether the latest inspection classified the output as a quality failure. */
  qualityFailed: boolean;
  /** Number of repair attempts already made for this operation (≥ 0). */
  attemptsUsed: number;
  /**
   * The configured repair strategies to draw from, in preference order. Defaults
   * to {@link DEFAULT_REPAIR_STRATEGIES}. Selection is deterministic: the strategy
   * at index `attemptsUsed` (clamped to the last) is chosen.
   */
  availableStrategies?: readonly RepairStrategy[];
}

/**
 * The next action in the bounded repair loop.
 *  - `complete`: no quality failure — accept the output (Req 14 success path).
 *  - `repair`: a quality failure remains and attempts are not exhausted — issue
 *    the selected strategy as attempt `attemptNumber` (Req 14.4, 14.5).
 *  - `revert`: attempts are exhausted — apply the final fallback of reverting to
 *    the prior valid version; the output is NOT marked successful (Req 14.6, 14.7).
 */
export type RepairDecision =
  | { action: 'complete'; reason: string }
  | { action: 'repair'; strategy: RepairStrategy; attemptNumber: number; reason: string }
  | { action: 'revert'; errorCode: 'QUALITY_CONTROL_FAILED'; reason: string };

/**
 * Decide the next step of the bounded repair loop (Req 14.5–14.7).
 *
 * When there is no quality failure the decision is `complete`. Otherwise, while
 * the number of attempts already used is below
 * `QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts` (default 3), the decision is
 * `repair` with a deterministically selected strategy and the 1-based attempt
 * number. Once the maximum is reached the decision is `revert` — the final
 * fallback of reverting to the prior valid version — and the output is never
 * marked successful (Req 14.6, 14.7).
 *
 * Pure and total; a non-positive `maxRepairAttempts` yields an immediate `revert`
 * on failure (no repair attempts are issued).
 */
export function decideRepair(input: RepairDecisionInput): RepairDecision {
  const maxAttempts = QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts;

  if (!input.qualityFailed) {
    return { action: 'complete', reason: 'Output passed quality control; no repair needed.' };
  }

  const attemptsUsed = Math.max(0, Math.floor(input.attemptsUsed));
  if (attemptsUsed >= maxAttempts) {
    return {
      action: 'revert',
      errorCode: 'QUALITY_CONTROL_FAILED',
      reason: `Quality failure persists after the maximum of ${maxAttempts} repair attempt(s); reverting to the prior valid version and not marking the output successful.`,
    };
  }

  const strategies =
    input.availableStrategies && input.availableStrategies.length > 0
      ? input.availableStrategies
      : DEFAULT_REPAIR_STRATEGIES;
  // Deterministic selection: advance through the configured set by attempt,
  // clamping to the last strategy when there are more attempts than strategies.
  const strategy = strategies[Math.min(attemptsUsed, strategies.length - 1)];
  const attemptNumber = attemptsUsed + 1;

  return {
    action: 'repair',
    strategy,
    attemptNumber,
    reason: `Quality failure detected; issuing repair strategy '${strategy}' as attempt ${attemptNumber} of ${maxAttempts}.`,
  };
}

/**
 * Whether the repair loop has any remaining attempt given the number already
 * used (Req 14.5). Convenience predicate for the service loop guard; equivalent
 * to `decideRepair(...).action === 'repair'` when a failure is present.
 */
export function canAttemptRepair(attemptsUsed: number): boolean {
  return Math.max(0, Math.floor(attemptsUsed)) < QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Is `actual` within `tolerance` (inclusive) of `expected`? A non-finite input is
 * never within tolerance. Used for duration and fps matching so the ±0.5 s /
 * ±0.01 fps rules are expressed once (Req 14.2, 15.4).
 */
function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
  if (typeof expected !== 'number' || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= tolerance;
}
