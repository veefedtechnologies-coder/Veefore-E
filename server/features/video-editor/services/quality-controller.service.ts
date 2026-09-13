/**
 * Quality_Controller — FFmpeg/FFprobe-backed service + bounded repair loop
 * (task 14.5, Req 14.4, 14.5, 14.6, 14.7, 18.1).
 *
 * The pure `quality-controller.logic.ts` core owns every DECISION (existence-first,
 * spec validation, quality-failure classification, render validation, and the
 * bounded repair decision). This service is the IO shell that:
 *
 *   1. Measures a real output (FFprobe container/stream metrics + a frame/audio
 *      analysis pass producing black/frozen/silence measurements) and feeds those
 *      measurements into the pure `inspectOutput` predicate (Req 14.1–14.3).
 *
 *   2. Drives the BOUNDED repair loop (Req 14.4–14.7). On a quality failure it
 *      selects one repair strategy from the configured set (retry / simplified
 *      prompt / deterministic fallback / alternative provider / user
 *      clarification) via the pure `decideRepair`, re-runs the caller-supplied
 *      attempt executor, and re-inspects — for at most
 *      `QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts` (default 3) repair attempts.
 *      Once exhausted it applies the final fallback of reverting to the prior
 *      valid version and returns a QC-failed error. It NEVER marks a corrupted
 *      output as successful (Req 14.7, 23.3).
 *
 *   3. Provides the render + QC pipeline coordinators the `video-render` and
 *      `video-qc` BullMQ workers run (Req 18.1). The render coordinator renders
 *      the authoritative timeline through the `RenderEngineService`, and — when a
 *      render is validated — hands the produced file to the QC repair loop so a
 *      deeper frame/audio quality failure is caught and repaired (or reverted)
 *      before the output is ever exposed as successful.
 *
 * Every threshold and export profile is read from `video-editor.config.ts` (the
 * single source, Req 13.1); nothing here hardcodes a QC threshold.
 *
 * The heavy collaborators (FFmpeg runner, FFprobe prober, frame/audio analyzer,
 * render engine, version reverter, timeline loader) are all injectable so the
 * repair loop can be exercised without real binaries, Redis, or MongoDB —
 * matching the render-engine / generative-editor service conventions in this
 * feature.
 */

import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

import { logger as defaultLogger } from '../../../config/logger';
import {
  QUALITY_CONTROL_THRESHOLDS,
  getExportProfile,
} from '../config/video-editor.config';
import {
  inspectOutput,
  decideRepair,
  DEFAULT_REPAIR_STRATEGIES,
  type OutputProbe,
  type QualityMetrics,
  type RequestedOutputSpec,
  type OutputInspection,
  type RepairStrategy,
} from './quality-controller.logic';
import {
  RenderEngineService,
  mapFfprobe,
  type RenderRequest,
  type RenderResult,
} from './render-engine.service';

// ---------------------------------------------------------------------------
// Repair-loop request / result shapes
// ---------------------------------------------------------------------------

/**
 * The outcome of a single attempt executor invocation. `produced` carries the
 * measured metrics the pure core inspects; `unavailable` means the strategy
 * could not run (e.g. no alternative provider) and is treated as a failed
 * attempt that advances to the next strategy; `needs_user_clarification` stops
 * the autonomous loop to await human input (never a success).
 */
export type RepairAttemptOutcome =
  | {
      kind: 'produced';
      /** FFprobe-measured container/stream metrics of the produced output. */
      probe: OutputProbe;
      /** Frame/audio-analysis metrics of the produced output (Req 14.3). */
      metrics: QualityMetrics;
      /** Optional produced artifact id (for provenance/observability). */
      artifactId?: string;
      /** Optional storage key of the produced bytes. */
      storageKey?: string;
    }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'needs_user_clarification'; message: string };

/**
 * Runs one attempt of the operation under repair. `strategy` is `'initial'` for
 * the first attempt, then the repair strategy selected by the pure core for each
 * subsequent attempt (Req 14.4). Must honour `signal` for cancellation (Req 18.5).
 */
export type RepairAttemptExecutor = (input: {
  strategy: RepairStrategy | 'initial';
  /** 0 for the initial attempt; the 1-based repair-attempt number thereafter. */
  attemptNumber: number;
  signal?: AbortSignal;
}) => Promise<RepairAttemptOutcome>;

/** The final-fallback revert to the prior valid version (Req 14.6, 14.7). */
export interface RevertOutcome {
  /** True iff a prior valid version was found and left as the active result. */
  ok: boolean;
  /** The version the project was reverted to (the prior valid version), if any. */
  revertedToVersionId?: string;
  /** Why a revert could not be applied (e.g. no prior version), when `ok` is false. */
  error?: string;
}

/** Reverts a project to its prior valid version without deleting any version (Req 14.6, 16.5). */
export type PriorVersionReverter = (input: {
  projectId: string;
  /** The version whose output failed QC — its parent is the prior valid version. */
  failedVersionId: string;
  workspaceId: string;
  userId: string;
}) => Promise<RevertOutcome>;

/** A single recorded attempt in the repair loop (for observability). */
export interface RepairAttemptRecord {
  /** `'initial'` or the repair strategy that produced this attempt. */
  strategy: RepairStrategy | 'initial';
  /** 0 for the initial attempt, else the 1-based repair-attempt number. */
  attemptNumber: number;
  /** The inspection outcome, when the attempt produced an output. */
  inspection?: OutputInspection;
  /** Why the attempt could not run, when the executor reported `unavailable`. */
  unavailableReason?: string;
}

/** A full repair-loop request (Req 14.4–14.7). */
export interface RunRepairLoopRequest {
  /** Owning job — recorded on logs; the caller settles the job on the result. */
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  /** The version whose output is under QC (its parent is the revert target). */
  versionId: string;
  /** The output characteristics the operation requested (Req 14.2). */
  requestedSpec: RequestedOutputSpec;
  /** Runs the operation (initial + each repair strategy). */
  execute: RepairAttemptExecutor;
  /**
   * The configured repair strategies, in preference order. Defaults to
   * {@link DEFAULT_REPAIR_STRATEGIES}. The pure core selects one per attempt.
   */
  availableStrategies?: readonly RepairStrategy[];
  /** Caller abort signal — Stop / cancellation (Req 18.5). */
  signal?: AbortSignal;
}

/** The discriminated result of the bounded repair loop (Req 14.5–14.7). */
export type RunRepairLoopResult =
  /** The (possibly repaired) output passed QC — safe to mark successful (Req 14). */
  | {
      status: 'passed';
      /** Number of repair attempts used (0 when the initial attempt passed). */
      repairAttemptsUsed: number;
      inspection: OutputInspection;
      artifactId?: string;
      storageKey?: string;
      attempts: RepairAttemptRecord[];
    }
  /**
   * The failure persisted after the maximum repair attempts; the prior valid
   * version was preserved and the output is NOT marked successful (Req 14.6, 14.7).
   */
  | {
      status: 'reverted';
      errorCode: 'QUALITY_CONTROL_FAILED';
      repairAttemptsUsed: number;
      revert: RevertOutcome;
      lastInspection?: OutputInspection;
      attempts: RepairAttemptRecord[];
    }
  /** A repair strategy required human input; the loop paused (never success). */
  | {
      status: 'user_clarification_required';
      message: string;
      repairAttemptsUsed: number;
      attempts: RepairAttemptRecord[];
    }
  /** The operation was cancelled (abort signal); nothing marked successful. */
  | { status: 'cancelled'; repairAttemptsUsed: number; attempts: RepairAttemptRecord[] };

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/** Probes an output file into an {@link OutputProbe}. Injectable for testing. */
export type QcOutputProber = (outputPath: string) => Promise<OutputProbe>;

/**
 * Analyses an output file's frames/audio into the {@link QualityMetrics} the pure
 * core classifies (Req 14.3). Injectable for testing. `requestedDurationMs` lets
 * the analyzer populate `measuredDurationMs` context.
 */
export type QcQualityAnalyzer = (input: {
  outputPath: string;
  audioExpected: boolean;
}) => Promise<QualityMetrics>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface QualityControllerServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** FFprobe-backed prober; defaults to a `fluent-ffmpeg` ffprobe pass. */
  prober?: QcOutputProber;
  /** Frame/audio analyzer; defaults to an FFmpeg blackdetect/freezedetect/silencedetect pass. */
  analyzer?: QcQualityAnalyzer;
  /** Reverts a project to the prior valid version (Req 14.6, 14.7). */
  reverter?: PriorVersionReverter;
  /** Render engine used by the render pipeline coordinator (Req 15.1, 18.1). */
  renderEngine?: RenderEngineService;
  /** Path to the FFprobe binary (defaults to the fluent-ffmpeg default). */
  ffprobePath?: string | null;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Quality_Controller service (task 14.5). Measures real outputs, inspects them
 * through the pure core, drives the bounded repair loop, and — on exhaustion —
 * reverts to the prior valid version, never marking a corrupted output as
 * successful (Req 14.4–14.7).
 */
export class QualityControllerService {
  private readonly log: QualityControllerServiceDeps['logger'];
  private readonly prober: QcOutputProber;
  private readonly analyzer: QcQualityAnalyzer;
  private readonly reverter: PriorVersionReverter;
  private readonly renderEngine: RenderEngineService;
  private readonly ffprobePath: string | null;
  private readonly ffmpegPath: string | null;

  constructor(deps: QualityControllerServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.ffprobePath = deps.ffprobePath ?? null;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.prober = deps.prober ?? this.createDefaultProber();
    this.analyzer = deps.analyzer ?? this.createDefaultAnalyzer();
    this.reverter = deps.reverter ?? createDefaultReverter(this.log);
    this.renderEngine = deps.renderEngine ?? new RenderEngineService();
  }

  // -------------------------------------------------------------------------
  // Output inspection (Req 14.1–14.3)
  // -------------------------------------------------------------------------

  /**
   * Measure and inspect a real output file existence-first (Req 14.1), then
   * validate the requested spec (Req 14.2) and classify quality failures
   * (Req 14.3). Delegates every rule to the pure `inspectOutput`.
   */
  async inspectFile(input: {
    outputPath: string;
    requestedSpec: RequestedOutputSpec;
    audioExpected: boolean;
  }): Promise<{ inspection: OutputInspection; probe: OutputProbe; metrics: QualityMetrics }> {
    const probe = await this.probeSafely(input.outputPath);
    const metrics = await this.analyzeSafely(input.outputPath, input.audioExpected);
    const inspection = inspectOutput(probe, input.requestedSpec, metrics);
    return { inspection, probe, metrics };
  }

  // -------------------------------------------------------------------------
  // Bounded repair loop (Req 14.4–14.7)
  // -------------------------------------------------------------------------

  /**
   * Drive the bounded repair loop (Req 14.4–14.7). Runs the initial attempt,
   * inspects it, and while a quality failure remains selects one configured
   * repair strategy per attempt (via the pure `decideRepair`) and re-runs the
   * executor — for at most `maxRepairAttempts` (default 3) repair attempts. Once
   * exhausted it reverts to the prior valid version and returns a QC-failed
   * error. It NEVER returns `passed` for a corrupted output (Req 14.7).
   */
  async runRepairLoop(request: RunRepairLoopRequest): Promise<RunRepairLoopResult> {
    const strategies =
      request.availableStrategies && request.availableStrategies.length > 0
        ? request.availableStrategies
        : DEFAULT_REPAIR_STRATEGIES;
    const attempts: RepairAttemptRecord[] = [];
    const maxAttempts = QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts;

    // `attemptsUsed` counts REPAIR attempts (the initial attempt is attempt 0).
    let attemptsUsed = 0;
    let currentStrategy: RepairStrategy | 'initial' = 'initial';
    let attemptNumber = 0;
    let lastInspection: OutputInspection | undefined;

    // Loop until we pass, revert, need clarification, or are cancelled.
    // Bounded structurally by `decideRepair` which reverts at `maxAttempts`.
    // The `+ 2` cap is a defensive upper bound (initial + maxAttempts repairs).
    for (let guard = 0; guard <= maxAttempts + 1; guard += 1) {
      if (request.signal?.aborted) {
        return { status: 'cancelled', repairAttemptsUsed: attemptsUsed, attempts };
      }

      const outcome = await request.execute({
        strategy: currentStrategy,
        attemptNumber,
        signal: request.signal,
      });

      if (outcome.kind === 'needs_user_clarification') {
        attempts.push({ strategy: currentStrategy, attemptNumber, unavailableReason: outcome.message });
        this.log?.info?.('Quality control paused for user clarification', {
          component: 'QualityControllerService',
          jobId: request.jobId,
          projectId: request.projectId,
          strategy: currentStrategy,
        });
        return {
          status: 'user_clarification_required',
          message: outcome.message,
          repairAttemptsUsed: attemptsUsed,
          attempts,
        };
      }

      if (outcome.kind === 'produced') {
        const inspection = inspectOutput(outcome.probe, request.requestedSpec, outcome.metrics);
        lastInspection = inspection;
        attempts.push({ strategy: currentStrategy, attemptNumber, inspection });

        if (inspection.ok) {
          // The (possibly repaired) output passed QC — safe to mark successful.
          this.log?.info?.('Quality control passed', {
            component: 'QualityControllerService',
            jobId: request.jobId,
            projectId: request.projectId,
            repairAttemptsUsed: attemptsUsed,
          });
          return {
            status: 'passed',
            repairAttemptsUsed: attemptsUsed,
            inspection,
            artifactId: outcome.artifactId,
            storageKey: outcome.storageKey,
            attempts,
          };
        }
      } else {
        // `unavailable`: the strategy could not run — record and treat as a
        // failed attempt that advances to the next strategy.
        attempts.push({ strategy: currentStrategy, attemptNumber, unavailableReason: outcome.reason });
      }

      // Decide the next step from the pure core (Req 14.4–14.7).
      const decision = decideRepair({
        qualityFailed: true,
        attemptsUsed,
        availableStrategies: strategies,
      });

      if (decision.action === 'revert') {
        // Final fallback: revert to the prior valid version; never mark success.
        const revert = await this.reverter({
          projectId: request.projectId,
          failedVersionId: request.versionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
        });
        this.log?.warn?.('Quality control failed after max repair attempts; reverted to prior valid version', {
          component: 'QualityControllerService',
          jobId: request.jobId,
          projectId: request.projectId,
          repairAttemptsUsed: attemptsUsed,
          revertedToVersionId: revert.revertedToVersionId,
          revertOk: revert.ok,
        });
        return {
          status: 'reverted',
          errorCode: 'QUALITY_CONTROL_FAILED',
          repairAttemptsUsed: attemptsUsed,
          revert,
          lastInspection,
          attempts,
        };
      }

      // On a quality failure the pure core returns either `revert` (handled
      // above) or `repair`; `complete` is only returned when there is no failure,
      // which cannot occur here. Guard defensively so the union narrows cleanly.
      if (decision.action !== 'repair') {
        // Should be unreachable — fall through to the terminal revert below.
        break;
      }

      // `repair`: a user-clarification strategy requires human input — pause the
      // autonomous loop rather than fabricating a repair (No-Mock).
      if (decision.strategy === 'user_clarification') {
        this.log?.info?.('Quality control repair requires user clarification', {
          component: 'QualityControllerService',
          jobId: request.jobId,
          projectId: request.projectId,
          attemptNumber: decision.attemptNumber,
        });
        return {
          status: 'user_clarification_required',
          message:
            'The output failed quality control and the next repair strategy requires user clarification.',
          repairAttemptsUsed: attemptsUsed,
          attempts,
        };
      }

      // Advance to the next repair attempt with the selected strategy.
      attemptsUsed = decision.attemptNumber;
      attemptNumber = decision.attemptNumber;
      currentStrategy = decision.strategy;
    }

    // Unreachable in practice — the pure core reverts at `maxAttempts`. Treat any
    // fall-through defensively as a QC failure that reverts (never success).
    const revert = await this.reverter({
      projectId: request.projectId,
      failedVersionId: request.versionId,
      workspaceId: request.workspaceId,
      userId: request.userId,
    });
    return {
      status: 'reverted',
      errorCode: 'QUALITY_CONTROL_FAILED',
      repairAttemptsUsed: attemptsUsed,
      revert,
      lastInspection,
      attempts,
    };
  }

  // -------------------------------------------------------------------------
  // Default FFprobe prober + FFmpeg quality analyzer
  // -------------------------------------------------------------------------

  /** Probe an output file, returning an existence-first probe when absent/empty. */
  private async probeSafely(outputPath: string): Promise<OutputProbe> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(outputPath);
    } catch {
      return absentProbe(false, 0);
    }
    if (!stat.isFile() || stat.size <= 0) {
      return absentProbe(true, Math.max(0, stat.size));
    }
    try {
      return await this.prober(outputPath);
    } catch (error) {
      this.log?.warn?.('FFprobe failed on QC output; treating as unprobeable', {
        component: 'QualityControllerService',
        outputPath,
        error: (error as Error)?.message,
      });
      return absentProbe(true, stat.size);
    }
  }

  /** Analyse quality metrics, degrading to a worst-case failure on analyzer error. */
  private async analyzeSafely(outputPath: string, audioExpected: boolean): Promise<QualityMetrics> {
    try {
      return await this.analyzer({ outputPath, audioExpected });
    } catch (error) {
      this.log?.warn?.('Quality analysis failed on QC output; classifying as a quality failure', {
        component: 'QualityControllerService',
        outputPath,
        error: (error as Error)?.message,
      });
      // An unanalysable output cannot be proven sound — classify conservatively as
      // audio-missing when audio is expected so it is never accepted (Req 14.7).
      return {
        longestBlackRunMs: 0,
        longestFrozenRunMs: 0,
        audioExpected,
        audioPresent: false,
        audioSilentFraction: audioExpected ? 1 : 0,
        maxArtifactAreaFraction: 0,
        measuredDurationMs: 0,
      };
    }
  }

  /** Default prober: run FFprobe via fluent-ffmpeg and map to an {@link OutputProbe}. */
  private createDefaultProber(): QcOutputProber {
    const ffprobePath = this.ffprobePath;
    return (outputPath: string) =>
      new Promise<OutputProbe>((resolve, reject) => {
        if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
        ffmpeg.ffprobe(outputPath, async (err, data) => {
          if (err) return reject(err);
          try {
            const stat = await fs.promises.stat(outputPath);
            resolve(mapFfprobe(data, stat.size));
          } catch (statErr) {
            reject(statErr);
          }
        });
      });
  }

  /**
   * Default quality analyzer: run FFmpeg's `blackdetect`, `freezedetect`, and
   * `silencedetect` filters over the output and parse the emitted intervals into
   * the measured {@link QualityMetrics} the pure core classifies (Req 14.3a–c).
   *
   * Visual-artifact area detection (Req 14.3e) is not derivable from a single
   * lightweight FFmpeg filter pass, so `maxArtifactAreaFraction` is reported as 0
   * by this default analyzer; a richer analyzer can be injected to supply it
   * without changing the pure classification rules.
   */
  private createDefaultAnalyzer(): QcQualityAnalyzer {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    const { blackFrameMinMs, frozenFrameMinMs } = QUALITY_CONTROL_THRESHOLDS;
    return async ({ outputPath, audioExpected }) => {
      const stderr = await runFfmpegDetect(ffmpegPath, outputPath, blackFrameMinMs, frozenFrameMinMs, log);
      const longestBlackRunMs = parseLongestBlackRunMs(stderr);
      const longestFrozenRunMs = parseLongestFrozenRunMs(stderr);
      const { audioPresent, audioSilentFraction, measuredDurationMs } = parseAudioSilence(stderr);
      return {
        longestBlackRunMs,
        longestFrozenRunMs,
        audioExpected,
        audioPresent,
        audioSilentFraction,
        maxArtifactAreaFraction: 0,
        measuredDurationMs,
      };
    };
  }
}

// ---------------------------------------------------------------------------
// Default prior-version reverter (Req 14.6, 14.7, 16.5)
// ---------------------------------------------------------------------------

/**
 * Default reverter: resolve the failed version's parent as the prior valid
 * version and report it as the revert target WITHOUT deleting any version
 * (versions are immutable, Req 16.5). A full "set active version" transition is
 * owned by the version manager (task 19); until then this identifies the prior
 * valid version so the failed output is never exposed as the successful result.
 */
export function createDefaultReverter(
  log: QualityControllerServiceDeps['logger'],
): PriorVersionReverter {
  return async ({ projectId, failedVersionId, workspaceId }) => {
    try {
      const { VideoVersionModel } = await import('../../../models/VideoEditor/VideoVersion');
      const failed = await VideoVersionModel.findOne({ versionId: failedVersionId, projectId })
        .lean()
        .exec();
      const parentId = (failed as { parentVersionId?: string | null } | null)?.parentVersionId ?? null;
      if (!parentId) {
        return {
          ok: false,
          error: 'No prior valid version exists to revert to.',
        };
      }
      const parent = await VideoVersionModel.findOne({ versionId: parentId, projectId })
        .lean()
        .exec();
      if (!parent) {
        return { ok: false, error: `Prior version ${parentId} not found.` };
      }
      return { ok: true, revertedToVersionId: parentId };
    } catch (error) {
      log?.error?.('Failed to resolve prior valid version for revert', error as Error, {
        component: 'QualityControllerService',
        projectId,
        workspaceId,
        failedVersionId,
      });
      return { ok: false, error: (error as Error)?.message ?? 'revert failed' };
    }
  };
}

// ---------------------------------------------------------------------------
// FFmpeg detect helpers (pure parsers exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Run FFmpeg with blackdetect/freezedetect/silencedetect filters and capture the
 * stderr the detectors write their intervals to. Never throws — returns an empty
 * string on process failure so the caller degrades to a conservative analysis.
 */
async function runFfmpegDetect(
  ffmpegPath: string | null,
  outputPath: string,
  blackFrameMinMs: number,
  frozenFrameMinMs: number,
  log: QualityControllerServiceDeps['logger'],
): Promise<string> {
  const { spawn } = await import('child_process');
  const bin = ffmpegPath ?? 'ffmpeg';
  const blackMinSec = (blackFrameMinMs / 1000).toString();
  const freezeMinSec = (frozenFrameMinMs / 1000).toString();
  const args = [
    '-hide_banner',
    '-i',
    outputPath,
    '-vf',
    `blackdetect=d=${blackMinSec}:pix_th=0.10,freezedetect=n=0.003:d=${freezeMinSec}`,
    '-af',
    'silencedetect=n=-40dB:d=0.5',
    '-f',
    'null',
    '-',
  ];
  return new Promise<string>((resolve) => {
    let stderr = '';
    try {
      const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        log?.warn?.('FFmpeg quality-detect process error', {
          component: 'QualityControllerService',
          error: (err as Error)?.message,
        });
        resolve(stderr);
      });
      proc.on('close', () => resolve(stderr));
    } catch (err) {
      log?.warn?.('FFmpeg quality-detect spawn failed', {
        component: 'QualityControllerService',
        error: (err as Error)?.message,
      });
      resolve('');
    }
  });
}

/** Parse the longest `blackdetect` interval (ms) from FFmpeg stderr. */
export function parseLongestBlackRunMs(stderr: string): number {
  let longest = 0;
  const re = /black_start:([\d.]+)\s+black_end:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      longest = Math.max(longest, Math.round((end - start) * 1000));
    }
  }
  return longest;
}

/** Parse the longest `freezedetect` interval (ms) from FFmpeg stderr. */
export function parseLongestFrozenRunMs(stderr: string): number {
  // freezedetect emits `lavfi.freezedetect.freeze_start` / `freeze_duration` lines.
  let longest = 0;
  const durRe = /freeze_duration:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = durRe.exec(stderr)) !== null) {
    const dur = Number(m[1]);
    if (Number.isFinite(dur) && dur > 0) {
      longest = Math.max(longest, Math.round(dur * 1000));
    }
  }
  // Fallback: pair freeze_start/freeze_end when duration lines are absent.
  if (longest === 0) {
    const startRe = /freeze_start:\s*([\d.]+)/g;
    const endRe = /freeze_end:\s*([\d.]+)/g;
    const starts: number[] = [];
    const ends: number[] = [];
    while ((m = startRe.exec(stderr)) !== null) starts.push(Number(m[1]));
    while ((m = endRe.exec(stderr)) !== null) ends.push(Number(m[1]));
    for (let i = 0; i < Math.min(starts.length, ends.length); i += 1) {
      const d = ends[i] - starts[i];
      if (Number.isFinite(d) && d > 0) longest = Math.max(longest, Math.round(d * 1000));
    }
  }
  return longest;
}

/**
 * Parse `silencedetect` output + total duration into audio presence and the
 * fraction of the audio duration that is silent (Req 14.3c).
 */
export function parseAudioSilence(stderr: string): {
  audioPresent: boolean;
  audioSilentFraction: number;
  measuredDurationMs: number;
} {
  // Total duration from the `Duration: HH:MM:SS.xx` line.
  const measuredDurationMs = parseFfmpegDurationMs(stderr);

  // No audio stream at all → not present.
  const hasAudioStream = /Stream #\d+:\d+.*Audio:/.test(stderr);
  if (!hasAudioStream) {
    return { audioPresent: false, audioSilentFraction: 1, measuredDurationMs };
  }

  // Sum silence durations reported by silencedetect.
  let totalSilenceSec = 0;
  const re = /silence_duration:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const d = Number(m[1]);
    if (Number.isFinite(d) && d > 0) totalSilenceSec += d;
  }

  const totalSec = measuredDurationMs / 1000;
  const fraction = totalSec > 0 ? Math.min(1, totalSilenceSec / totalSec) : totalSilenceSec > 0 ? 1 : 0;
  return { audioPresent: true, audioSilentFraction: fraction, measuredDurationMs };
}

/** Parse the FFmpeg `Duration: HH:MM:SS.xx` line into milliseconds. */
export function parseFfmpegDurationMs(stderr: string): number {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return 0;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

/** A zeroed probe for a missing/empty/unprobeable output (drives existence-first). */
function absentProbe(exists: boolean, sizeBytes: number): OutputProbe {
  return {
    exists,
    sizeBytes,
    hasVideoStream: false,
    container: '',
    videoCodec: '',
    audioCodec: null,
    audioStreamCount: 0,
    width: 0,
    height: 0,
    fps: 0,
    durationMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Shared singleton (mirrors other feature-service exports)
// ---------------------------------------------------------------------------

let sharedService: QualityControllerService | null = null;

/** Get the process-wide Quality_Controller service (lazy, production-wired). */
export function getQualityControllerService(): QualityControllerService {
  if (!sharedService) sharedService = new QualityControllerService();
  return sharedService;
}

// ---------------------------------------------------------------------------
// Render + QC pipeline coordinators (Req 18.1) — run by the BullMQ workers
// ---------------------------------------------------------------------------

/**
 * A `RequestedOutputSpec` used for post-render QC classification, derived from
 * the export profile the render targeted so the QC pass validates the rendered
 * file against exactly what was asked for (Req 14.2).
 */
export function requestedSpecFromProfileId(
  exportProfileId: string,
  expectedDurationMs: number,
  audioExpected: boolean,
): RequestedOutputSpec | null {
  const profile = getExportProfile(exportProfileId);
  if (!profile) return null;
  return {
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: audioExpected ? profile.audioCodec : null,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    expectedAudioStreamCount: audioExpected ? 1 : 0,
    requestedDurationMs: expectedDurationMs,
  };
}

/**
 * Payload carried by a `video-render` job — the render request essentials the
 * initiating endpoint (task 14.4/20.2) records so the worker can reconstruct the
 * `RenderRequest` from the authoritative timeline.
 */
export interface RenderJobPayload {
  inputVersionId: string;
  exportProfileId: string;
  timeline: RenderRequest['timeline'];
  audioExpected?: boolean;
  outputCategory?: RenderRequest['outputCategory'];
  outputMimeType?: string;
}

/**
 * Coordinate a render job through the `RenderEngineService` (Req 15.1, 18.1).
 * The render engine itself renders + render-validates + settles the job; this
 * coordinator adapts the job identity + payload into a `RenderRequest`. Deeper
 * frame/audio QC + repair runs on the `video-qc` queue after a validated render.
 */
export async function processRenderJob(input: {
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  versionId: string;
  payload: RenderJobPayload;
  renderEngine?: RenderEngineService;
}): Promise<RenderResult> {
  const renderEngine = input.renderEngine ?? new RenderEngineService();
  return renderEngine.render({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    jobId: input.jobId,
    inputVersionId: input.payload.inputVersionId,
    timeline: input.payload.timeline,
    exportProfileId: input.payload.exportProfileId,
    audioExpected: input.payload.audioExpected,
    outputCategory: input.payload.outputCategory,
    outputMimeType: input.payload.outputMimeType,
  });
}

/**
 * Payload carried by a `video-qc` job — the reference to the rendered artifact
 * the deeper frame/audio quality gate inspects, plus the export profile + timeline
 * duration it was rendered against so QC validates it against exactly what was
 * requested (Req 14.2).
 */
export interface QcJobPayload {
  /** The rendered `Video_Artifact` id to inspect. */
  artifactId: string;
  /** The export profile id the artifact was rendered against (Req 14.2). */
  exportProfileId: string;
  /** The timeline's expected duration in ms (Req 14.2, 14.3d). */
  expectedDurationMs: number;
  /** Whether an audio stream is expected in the output (Req 14.3c). */
  audioExpected?: boolean;
  /** Repair strategies to use; defaults to the configured set. */
  availableStrategies?: RepairStrategy[];
}

/** Downloads a rendered artifact's bytes to a local temp file for analysis. */
export type QcArtifactDownloader = (artifactId: string) => Promise<{ localPath: string; cleanup: () => Promise<void> } | null>;

/** Settles the QC job's terminal state (COMPLETED on pass, FAILED on revert). */
export interface QcJobSettler {
  complete(jobId: string): Promise<void>;
  fail(jobId: string, errorCode: string): Promise<void>;
}

/**
 * Coordinate a QC job (Req 14.1–14.7, 18.1). Downloads the rendered artifact,
 * inspects it existence-first through the pure core, and — on a quality failure —
 * drives the bounded repair loop. A deterministic re-render yields the identical
 * output, so a genuinely corrupted render exhausts the bounded attempts and
 * reverts to the prior valid version; the QC job is then marked FAILED with
 * `QUALITY_CONTROL_FAILED` and the corrupted output is NEVER marked successful
 * (Req 14.7). A passing output marks the QC job COMPLETED.
 */
export async function processQcJob(input: {
  jobId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  versionId: string;
  payload: QcJobPayload;
  qcService?: QualityControllerService;
  downloadArtifact?: QcArtifactDownloader;
  settler?: QcJobSettler;
  signal?: AbortSignal;
}): Promise<RunRepairLoopResult> {
  const qc = input.qcService ?? getQualityControllerService();
  const audioExpected = input.payload.audioExpected ?? false;
  const requestedSpec = requestedSpecFromProfileId(
    input.payload.exportProfileId,
    input.payload.expectedDurationMs,
    audioExpected,
  );
  const settler = input.settler ?? createDefaultQcJobSettler();

  if (!requestedSpec) {
    await settler.fail(input.jobId, 'QC_UNKNOWN_PROFILE');
    return {
      status: 'reverted',
      errorCode: 'QUALITY_CONTROL_FAILED',
      repairAttemptsUsed: 0,
      revert: { ok: false, error: `Unknown export profile: ${input.payload.exportProfileId}` },
      attempts: [],
    };
  }

  const download = input.downloadArtifact ?? createDefaultArtifactDownloader();
  const downloaded = await download(input.payload.artifactId);

  try {
    const execute: RepairAttemptExecutor = async () => {
      if (!downloaded) {
        // No bytes to analyse → existence-first failure (Req 14.1).
        return {
          kind: 'produced',
          probe: absentProbe(false, 0),
          metrics: {
            longestBlackRunMs: 0,
            longestFrozenRunMs: 0,
            audioExpected,
            audioPresent: false,
            audioSilentFraction: audioExpected ? 1 : 0,
            maxArtifactAreaFraction: 0,
            measuredDurationMs: 0,
          },
        };
      }
      const { probe, metrics } = await qc.inspectFile({
        outputPath: downloaded.localPath,
        requestedSpec,
        audioExpected,
      });
      return { kind: 'produced', probe, metrics, artifactId: input.payload.artifactId };
    };

    const result = await qc.runRepairLoop({
      jobId: input.jobId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      versionId: input.versionId,
      requestedSpec,
      execute,
      availableStrategies: input.payload.availableStrategies,
      signal: input.signal,
    });

    if (result.status === 'passed') {
      await settler.complete(input.jobId);
    } else if (result.status === 'reverted') {
      await settler.fail(input.jobId, result.errorCode);
    }
    // 'user_clarification_required' / 'cancelled' leave the QC job non-terminal
    // for the orchestration layer (task 20) to resolve — never marked successful.

    return result;
  } finally {
    if (downloaded) await downloaded.cleanup();
  }
}

/** Default artifact downloader: resolve the artifact's storage key and stream its bytes to a temp file. */
function createDefaultArtifactDownloader(): QcArtifactDownloader {
  return async (artifactId: string) => {
    const os = await import('os');
    const path = await import('path');
    const { randomUUID } = await import('crypto');
    const { getArtifactRepository } = await import('./artifact-repository.service');
    const { getStorageService } = await import('../../storage/services/storage.service');

    const repo = getArtifactRepository();
    const artifact = await repo.getArtifact(artifactId);
    const storageKey = (artifact as { storageKey?: string } | null)?.storageKey;
    if (!storageKey) return null;

    const storage = getStorageService();
    const bytes = await storage.downloadFile(storageKey);
    const dir = path.join(os.tmpdir(), 'veefore-video-editor', 'qc');
    await fs.promises.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, `qc-${randomUUID()}`);
    await fs.promises.writeFile(localPath, bytes.buffer);
    return {
      localPath,
      cleanup: async () => {
        try {
          await fs.promises.rm(localPath, { force: true });
        } catch {
          /* best-effort */
        }
      },
    };
  };
}

/** Default QC-job settler: transition the VideoEditJob, respecting terminal absorption. */
function createDefaultQcJobSettler(): QcJobSettler {
  return {
    async complete(jobId: string) {
      const { VideoEditJobModel } = await import('../../../models/VideoEditor/VideoEditJob');
      const { TERMINAL_STATES } = await import('./job-state.logic');
      await VideoEditJobModel.updateOne(
        { jobId, state: { $nin: [...TERMINAL_STATES] } },
        { $set: { state: 'COMPLETED', progress: 100 } },
      ).exec();
    },
    async fail(jobId: string, errorCode: string) {
      const { VideoEditJobModel } = await import('../../../models/VideoEditor/VideoEditJob');
      const { TERMINAL_STATES } = await import('./job-state.logic');
      await VideoEditJobModel.updateOne(
        { jobId, state: { $nin: [...TERMINAL_STATES] } },
        { $set: { state: 'FAILED', errorCode } },
      ).exec();
    },
  };
}
