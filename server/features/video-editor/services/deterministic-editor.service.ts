/**
 * Deterministic_Editor — FFmpeg-based media processing service (task 11.1 &
 * 11.2, Req 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 12.1, 12.2, 12.3, 12.4).
 *
 * This is the engine that performs every NON-generative edit — trim/cut, crop,
 * resize, aspect conversion, fps conversion, speed change, fades, re-encode, and
 * audio processing (loudness normalization + silence removal) — using FFmpeg
 * (`fluent-ffmpeg`). It is the deterministic half of the
 * deterministic-first architecture and, by construction, **never calls any AI
 * provider** (Req 8.1): the only collaborators it imports are `fluent-ffmpeg`,
 * the `StorageService` (to read source bytes and store the output), and the
 * `ArtifactRepository` (to persist the immutable result). No provider adapter,
 * `AIServiceManager`, or generative client is referenced anywhere in this file.
 *
 * Responsibilities and invariants:
 *
 *   1. Deterministic command generation (mirrors `caption-renderer.service.ts`).
 *      Every operation is turned into a fully-specified FFmpeg argument vector by
 *      a PURE builder (`buildDeterministicCommand`) with fixed number formatting,
 *      fixed filter ordering, and a fixed encoder vector resolved from the single
 *      `ffmpeg-encoder-policy.ts`. Two calls with the same operation always yield
 *      an identical command.
 *
 *      DETERMINISM CONTRACT: ARGUMENT construction is always deterministic. Output
 *      BYTES are only reproducible on the software encoder path — the policy may
 *      select a hardware encoder (VideoToolbox), which is ~3x faster in wall time
 *      and ~10x cheaper in CPU but is NOT bit-exact across runs. Callers that need
 *      byte-for-byte reproducible artifacts must run with
 *      `VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE=true` (see `ffmpeg-encoder-policy.ts`).
 *
 *   2. Source bytes are read unmodified (Req 8.4). The service downloads the
 *      immutable Video_Source bytes into a fresh temporary INPUT file, runs
 *      FFmpeg reading that file, and writes to a separate temporary OUTPUT file.
 *      It never writes back to the source storage key, so the immutable
 *      Video_Source is left unchanged.
 *
 *   3. Exactly one traceable artifact on success (Req 8.3). A successful
 *      operation produces EXACTLY ONE `Video_Artifact` via the `ArtifactRepository`,
 *      with deterministic provenance (`provider`/`model` = the `ffmpeg` engine id,
 *      `jobId` linking it to the originating Video_Edit_Job, `costCredits` = 0).
 *
 *   4. Failure records an error code, marks the job failed, and produces no
 *      artifact (Req 8.6). Any failure (download, FFmpeg, empty output, upload)
 *      transitions the associated Video_Edit_Job to FAILED with an error code and
 *      throws a typed `DeterministicEditError`; no artifact is created.
 *
 * All tunable values (encoder settings here are deterministic engine constants,
 * not preset values) that ARE preset/profile values (e.g. export dimensions/codec
 * for a re-encode) are read from the single-source `video-editor.config.ts`
 * (Req 13.1) via `getExportProfile`.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Side-effect import: points fluent-ffmpeg at the bundled ffmpeg/ffprobe static
// binaries (idempotent). Assembly probes each input for an audio stream via
// ffprobe, so the ffprobe path must be configured (Req 8, ffmpeg-paths reuse).
import '../../../config/ffmpeg-paths';
import { logger as defaultLogger } from '../../../config/logger';
import {
  VideoEditJobModel as DefaultVideoEditJobModel,
  type IVideoEditJob,
} from '../../../models/VideoEditor/VideoEditJob';
import type { Model } from 'mongoose';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import {
  getExportProfile,
  type ExportProfile,
  AUDIO_TARGETS,
} from '../config/video-editor.config';
import { resolveVideoEncoderArgs } from './ffmpeg-encoder-policy';
import { enqueueTempFileCleanup } from './temp-file-cleanup.worker';
import type { TimeRangeMs } from './audio-analysis.logic';
import {
  buildLoudnormFilter,
  planSilenceRemoval,
  type SilenceRemovalRequest,
} from './silence-removal.logic';
import { TERMINAL_STATES } from './job-state.logic';
import {
  DETERMINISTIC_ENGINE_ID,
  type ArtifactCategory,
} from './artifact-provenance.logic';
import {
  getArtifactRepository,
  type ArtifactRepository,
  type CreateArtifactResult,
} from './artifact-repository.service';

// ---------------------------------------------------------------------------
// Operation model
// ---------------------------------------------------------------------------

/**
 * The deterministic operation kinds this engine performs. Each maps to a fixed,
 * provider-free FFmpeg pipeline (Req 8.1, 8.2). `aspect` and `resize` are the
 * canonical deterministic-routed operations of Req 8.2.
 */
export type DeterministicOperationKind =
  | 'trim'
  | 'cut'
  | 'crop'
  | 'resize'
  | 'aspect'
  | 'fps'
  | 'speed'
  | 'fades'
  | 'filter'
  | 'encode'
  | 'audio_normalize'
  | 'silence_removal'
  | 'auto_cut';

/** Trim/cut a contiguous range `[startMs, endMs)` from the source (ms). */
export interface TrimParams {
  startMs: number;
  endMs: number;
}

/** Crop a rectangle `width×height` at offset `(x, y)` in pixels. */
export interface CropParams {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** Resize to exact `width×height` pixels. */
export interface ResizeParams {
  width: number;
  height: number;
}

/**
 * Convert to a target aspect ratio. When `width`/`height` are supplied the frame
 * is scaled to fit and then either padded (letterbox) or cropped to those exact
 * dimensions; otherwise only the display/sample aspect ratio is set.
 */
export interface AspectParams {
  /** Target aspect ratio expressed as `W:H` (e.g. `'9:16'`). */
  aspectRatio: string;
  /** Optional target output width in pixels. */
  width?: number;
  /** Optional target output height in pixels. */
  height?: number;
  /** How to fit the source into the target box (default `'pad'`). */
  mode?: 'pad' | 'crop';
}

/** Convert to a target constant frame rate (fps). */
export interface FpsParams {
  fps: number;
}

/** Change playback speed by `factor` (>1 faster, <1 slower); audio is retimed. */
export interface SpeedParams {
  factor: number;
}

/** Apply a fade-in and/or fade-out over the given durations (ms). */
export interface FadesParams {
  fadeInMs?: number;
  fadeOutMs?: number;
  /** Total output duration in ms, required to place the fade-out. */
  totalDurationMs: number;
}

/** Re-encode to a configured export profile (from the single-source config). */
export interface EncodeParams {
  /** Export profile id resolved from `video-editor.config.ts` (Req 13.1). */
  exportProfileId: string;
}

/**
 * The closed set of named colour/look filters this engine can apply. Each maps
 * to a fixed, deterministic FFmpeg video-filter chain (see {@link FILTER_LOOK_CHAINS}).
 * The looks are chosen so every filter they use is present in `ffmpeg-static`'s
 * standard build (`eq`, `curves`, `colorbalance`, `hue`) — no build-specific or
 * optional filter is referenced, so the chain always runs.
 */
export type FilterLook = 'cinematic' | 'warm' | 'cool' | 'vivid' | 'bw' | 'vintage';

/** Apply a named colour/look grade to the video (audio is left untouched). */
export interface FilterParams {
  /** The named look to apply (see {@link FilterLook}). */
  look: FilterLook;
}

/**
 * Normalize the output audio to the configured integrated-loudness target within
 * ±1.0 LU with a true-peak ceiling (Req 12.1). The video stream is copied
 * unmodified; only the audio stream is re-encoded through the deterministic
 * `loudnorm` filter built from the single-source config (Req 13.1). No params —
 * targets come exclusively from `AUDIO_TARGETS`.
 */
export interface AudioNormalizeParams {
  /** Reserved for future explicit overrides; targets are read from config. */
  readonly _?: never;
}

/**
 * Remove the pre-planned silence ranges from the source, keeping only the
 * `keepRanges` (the complement of the analysis-classified silence). The ranges
 * MUST already have been validated by `planSilenceRemoval` (Req 8.5, 12.2, 12.3)
 * — this operation performs the deterministic cut, it does not re-check speech
 * conflicts. Both streams are re-timed via `select`/`aselect`, so audio is
 * re-encoded.
 */
export interface SilenceRemovalParams {
  /** Contiguous ranges to keep, in timeline order (from `planSilenceRemoval`). */
  keepRanges: readonly TimeRangeMs[];
}

/**
 * Concatenate the pre-computed beat-synced keep-`segments` into a montage
 * (Increment 2 "auto-cut"). Like {@link SilenceRemovalParams}, the segments MUST
 * already have been computed by the pure `computeAutoCutSegments` analysis — this
 * operation performs the deterministic cut, it does NOT analyse audio. Both
 * streams are re-timed via `select`/`aselect`, so audio is re-encoded.
 *
 * When `punchInZoom` is true a subtle, fixed centred zoom is applied to the
 * concatenated video for a dynamic "montage punch" — implemented with the `crop`
 * filter (which ships in the standard `ffmpeg-static` build) so it always runs.
 */
export interface AutoCutParams {
  /** Ordered, non-overlapping keep-segments (from `computeAutoCutSegments`). */
  segments: readonly { startMs: number; endMs: number }[];
  /** Apply a subtle fixed centred punch-in zoom to the montage (default false). */
  punchInZoom?: boolean;
}

/** A single deterministic operation: exactly one kind + its typed params. */
export type DeterministicOperation =
  | { kind: 'trim'; params: TrimParams }
  | { kind: 'cut'; params: TrimParams }
  | { kind: 'crop'; params: CropParams }
  | { kind: 'resize'; params: ResizeParams }
  | { kind: 'aspect'; params: AspectParams }
  | { kind: 'fps'; params: FpsParams }
  | { kind: 'speed'; params: SpeedParams }
  | { kind: 'fades'; params: FadesParams }
  | { kind: 'encode'; params: EncodeParams }
  | { kind: 'filter'; params: FilterParams }
  | { kind: 'audio_normalize'; params: AudioNormalizeParams }
  | { kind: 'silence_removal'; params: SilenceRemovalParams }
  | { kind: 'auto_cut'; params: AutoCutParams };

// ---------------------------------------------------------------------------
// Deterministic engine constants (NOT preset values)
// ---------------------------------------------------------------------------

/**
 * Resolve the constant-quality video encoder options for a frame-modifying
 * operation. Delegates to the single `ffmpeg-encoder-policy.ts` so all four render
 * sites in this feature share ONE encoder decision (hardware VideoToolbox when the
 * bundled ffmpeg provides it, libx264 otherwise or when forced).
 *
 * The returned vector is stable for a given process + env, so command construction
 * stays deterministic; see the DETERMINISM CONTRACT in the file header for what
 * that means for output bytes.
 *
 * @param override Explicit encoder args (tests / callers that pin the encoder).
 * @returns The ordered `-c:v …` options, always including `-pix_fmt yuv420p`.
 */
function baseVideoOptions(override?: readonly string[]): string[] {
  return override ? [...override] : resolveVideoEncoderArgs({ target: { mode: 'quality' } });
}

/** Copy the audio stream unmodified (used when the op only touches video). */
const AUDIO_COPY = ['-c:a', 'copy'] as const;

/**
 * Copy the video stream unmodified (used when the op only touches audio).
 * `-movflags +faststart` puts the moov atom first so the resulting mp4 streams
 * immediately in the chat card (the encode paths get this from the encoder policy).
 */
const VIDEO_COPY = ['-c:v', 'copy', '-movflags', '+faststart'] as const;

/** Fixed AAC audio re-encode (used when the op retimes/filters/cuts audio). */
const AUDIO_AAC = ['-c:a', 'aac', '-b:a', '128k'] as const;

/**
 * Fixed auto-cut punch-in zoom factor (Increment 2). A subtle 1.08× centred
 * crop-zoom applied when `AutoCutParams.punchInZoom` is set. Implemented with the
 * `crop` filter alone (present in the standard `ffmpeg-static` build) using
 * even-dimension truncation so the yuv420p output is always valid.
 */
const AUTO_CUT_PUNCH_IN_ZOOM = 1.08;

/**
 * Deterministic FFmpeg video-filter chains for each named {@link FilterLook}.
 * Each look is an ordered list of filters joined into a single `-vf` chain, with
 * fixed numeric parameters so the same look always produces byte-identical output
 * for a given FFmpeg build. Every filter used (`eq`, `curves`, `colorbalance`,
 * `hue`) ships in `ffmpeg-static`'s standard build. Audio is never touched by a
 * filter op (the video stream is graded; the audio stream is copied verbatim).
 *
 *   - `cinematic` — a subtle, tasteful film grade: mild contrast/saturation lift
 *     plus a gentle warm colour balance (no crushed blacks or blown highlights).
 *   - `warm`      — golden/warm colour balance (reds up, blues down).
 *   - `cool`      — cooler colour balance (blues up, reds down).
 *   - `vivid`     — higher saturation + contrast for a vibrant pop.
 *   - `bw`        — desaturated monochrome (`hue=s=0`) with a slight contrast lift.
 *   - `vintage`   — the built-in `curves` vintage preset with a faded, warm cast.
 */
const FILTER_LOOK_CHAINS: Readonly<Record<FilterLook, readonly string[]>> = {
  cinematic: [
    'eq=contrast=1.04:saturation=1.06:gamma=0.99',
    'colorbalance=rs=0.03:gs=0.01:bs=-0.03:rm=0.02:bm=-0.02',
  ],
  warm: [
    'eq=contrast=1.05:saturation=1.10',
    'colorbalance=rs=0.08:rm=0.06:gs=0.02:bs=-0.08:bm=-0.06',
  ],
  cool: [
    'eq=contrast=1.05:saturation=1.05',
    'colorbalance=rs=-0.06:rm=-0.05:bs=0.08:bm=0.06',
  ],
  vivid: [
    'eq=contrast=1.20:saturation=1.40:brightness=0.02',
    'curves=preset=increase_contrast',
  ],
  bw: ['hue=s=0', 'eq=contrast=1.10:gamma=0.98'],
  vintage: [
    'curves=preset=vintage',
    'eq=saturation=0.90:contrast=1.05',
    'colorbalance=rs=0.05:gs=0.02:bs=-0.06',
  ],
} as const;

/** The closed set of valid {@link FilterLook} values as a runtime array. */
export const FILTER_LOOKS: readonly FilterLook[] = [
  'cinematic',
  'warm',
  'cool',
  'vivid',
  'bw',
  'vintage',
] as const;

// ---------------------------------------------------------------------------
// Pure command builder (Req 8.2 deterministic-routed, deterministic output)
// ---------------------------------------------------------------------------

/** A deterministic FFmpeg invocation derived purely from a single operation. */
export interface DeterministicCommand {
  /** Full FFmpeg argument vector (excludes the `ffmpeg` binary itself). */
  args: string[];
  /**
   * Options that MUST be placed BEFORE `-i` (input-side seek for trim/cut).
   * Empty for every operation that reads the input from the start.
   */
  inputOptions: string[];
  /** The `-vf` video filter chain (empty when no video filtering is needed). */
  videoFilter: string;
  /** The `-af` audio filter chain (empty when audio is not filtered). */
  audioFilter: string;
  /** Fixed output encoder + duration options (placed after `-i`). */
  outputOptions: string[];
  /** Human-readable operation description (used as artifact provenance prompt). */
  description: string;
  inputPath: string;
  outputPath: string;
}

/** Format whole milliseconds as a fixed-precision seconds value (3 dp). */
function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** A finite, positive integer guard for pixel/fps values. */
function requirePositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new DeterministicEditError(
      'DETERMINISTIC_INVALID_PARAM',
      `Invalid ${label}: expected a positive integer, got ${String(value)}`,
    );
  }
  return value;
}

/** A finite, non-negative number guard (offsets, durations). */
function requireNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DeterministicEditError(
      'DETERMINISTIC_INVALID_PARAM',
      `Invalid ${label}: expected a non-negative number, got ${String(value)}`,
    );
  }
  return value;
}

/**
 * Decompose a speed factor into a chain of `atempo` filters, each within FFmpeg's
 * supported [0.5, 2.0] range, whose product equals the factor. Deterministic:
 * a given factor always yields the same ordered chain.
 */
function atempoChain(factor: number): string[] {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new DeterministicEditError(
      'DETERMINISTIC_INVALID_PARAM',
      `Invalid speed factor: expected a positive number, got ${String(factor)}`,
    );
  }
  const parts: string[] = [];
  let remaining = factor;
  while (remaining > 2.0) {
    parts.push('atempo=2.000000');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push('atempo=0.500000');
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(6)}`);
  return parts;
}

/** Optional overrides for {@link buildDeterministicCommand} (tests / pinning). */
export interface BuildDeterministicCommandOptions {
  /**
   * Explicit video-encoder args, bypassing `ffmpeg-encoder-policy.ts`. Lets tests
   * assert policy behaviour (forced-software vs hardware) without touching env or
   * spawning a capability probe.
   */
  videoEncoderArgs?: readonly string[];
}

/**
 * Build the deterministic FFmpeg command for one operation. Performs no IO of its
 * own; the returned `inputOptions`/`args`/`videoFilter`/`audioFilter`/
 * `outputOptions` are fully determined by the operation plus the process-wide
 * encoder policy decision, so identical operations always produce an identical
 * command.
 *
 * The video is re-encoded (the policy picks the encoder) because most of these
 * operations modify frames; audio is stream-copied when untouched and re-encoded
 * (AAC) when the operation retimes, fades, or cuts it.
 */
export function buildDeterministicCommand(
  operation: DeterministicOperation,
  inputPath: string,
  outputPath: string,
  options: BuildDeterministicCommandOptions = {},
): DeterministicCommand {
  let videoFilters: string[] = [];
  let audioFilters: string[] = [];
  // Options placed BEFORE `-i` (input-side seek).
  let leadingInputOptions: string[] = [];
  // Leading options placed BEFORE the output filename (trim duration).
  let leadingOutputOptions: string[] = [];
  let audioOpts: readonly string[] = AUDIO_COPY;
  // When true the video stream is copied unmodified (audio-only operations).
  let videoCopy = false;
  let description: string;

  switch (operation.kind) {
    case 'trim':
    case 'cut': {
      const { startMs, endMs } = operation.params;
      requireNonNegative(startMs, 'trim.startMs');
      if (!Number.isFinite(endMs) || endMs <= startMs) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          `Invalid trim range: endMs (${endMs}) must be greater than startMs (${startMs})`,
        );
      }
      // INPUT-side seek: `-ss` goes BEFORE `-i` so FFmpeg seeks the container to
      // the nearest keyframe and decodes only from there. Since FFmpeg 2.1 this is
      // still FRAME-ACCURATE when re-encoding (it decodes-and-discards from the
      // preceding keyframe up to the exact requested timestamp), so the older
      // "output-side seek for frame-exactness" reasoning is obsolete — output-side
      // seek only added cost by decoding every frame from 0. Measured on a 60s
      // 1080x1920 clip, a 5s trim went 4.26s → 2.53s wall (software) purely from
      // this change.
      //
      // After an input-side seek the output timeline is REBASED to 0, so the
      // duration must be expressed as `-t <endMs-startMs>`; `-to <endMs>` would cut
      // the clip short (it would be interpreted against the rebased timeline).
      // Both streams are cut, so audio is re-encoded (AAC) to preserve A/V sync.
      leadingInputOptions = ['-ss', msToSeconds(startMs)];
      leadingOutputOptions = ['-t', msToSeconds(endMs - startMs)];
      audioOpts = AUDIO_AAC;
      description = `${operation.kind} [${msToSeconds(startMs)}s..${msToSeconds(endMs)}s]`;
      break;
    }

    case 'crop': {
      const w = requirePositiveInt(operation.params.width, 'crop.width');
      const h = requirePositiveInt(operation.params.height, 'crop.height');
      const x = requireNonNegative(operation.params.x, 'crop.x');
      const y = requireNonNegative(operation.params.y, 'crop.y');
      videoFilters = [`crop=${w}:${h}:${x}:${y}`];
      description = `crop ${w}x${h}@(${x},${y})`;
      break;
    }

    case 'resize': {
      const w = requirePositiveInt(operation.params.width, 'resize.width');
      const h = requirePositiveInt(operation.params.height, 'resize.height');
      videoFilters = [`scale=${w}:${h}`];
      description = `resize ${w}x${h}`;
      break;
    }

    case 'aspect': {
      const { aspectRatio, width, height, mode = 'pad' } = operation.params;
      if (typeof aspectRatio !== 'string' || !/^\d+:\d+$/.test(aspectRatio)) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          `Invalid aspectRatio: expected "W:H", got ${String(aspectRatio)}`,
        );
      }
      if (typeof width === 'number' && typeof height === 'number') {
        const w = requirePositiveInt(width, 'aspect.width');
        const h = requirePositiveInt(height, 'aspect.height');
        if (mode === 'crop') {
          videoFilters = [
            `scale=${w}:${h}:force_original_aspect_ratio=increase`,
            `crop=${w}:${h}`,
          ];
        } else {
          videoFilters = [
            `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
            `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
          ];
        }
        description = `aspect ${aspectRatio} → ${w}x${h} (${mode})`;
      } else {
        // No explicit pixel box: set the display aspect ratio deterministically.
        const [arw, arh] = aspectRatio.split(':');
        videoFilters = ['setsar=1', `setdar=${arw}/${arh}`];
        description = `aspect ${aspectRatio} (dar)`;
      }
      break;
    }

    case 'fps': {
      const fps = requirePositiveInt(operation.params.fps, 'fps.fps');
      videoFilters = [`fps=${fps}`];
      description = `fps ${fps}`;
      break;
    }

    case 'speed': {
      const factor = operation.params.factor;
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          `Invalid speed factor: expected a positive number, got ${String(factor)}`,
        );
      }
      // Video: scale presentation timestamps by 1/factor. Audio: retime via an
      // atempo chain (so audio is filtered → re-encode to AAC).
      videoFilters = [`setpts=${(1 / factor).toFixed(6)}*PTS`];
      audioFilters = atempoChain(factor);
      audioOpts = AUDIO_AAC;
      description = `speed x${factor}`;
      break;
    }

    case 'fades': {
      const { fadeInMs = 0, fadeOutMs = 0, totalDurationMs } = operation.params;
      requireNonNegative(fadeInMs, 'fades.fadeInMs');
      requireNonNegative(fadeOutMs, 'fades.fadeOutMs');
      if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          `Invalid fades.totalDurationMs: expected a positive number, got ${String(totalDurationMs)}`,
        );
      }
      const v: string[] = [];
      const a: string[] = [];
      if (fadeInMs > 0) {
        v.push(`fade=t=in:st=0:d=${msToSeconds(fadeInMs)}`);
        a.push(`afade=t=in:st=0:d=${msToSeconds(fadeInMs)}`);
      }
      if (fadeOutMs > 0) {
        const start = Math.max(0, totalDurationMs - fadeOutMs);
        v.push(`fade=t=out:st=${msToSeconds(start)}:d=${msToSeconds(fadeOutMs)}`);
        a.push(`afade=t=out:st=${msToSeconds(start)}:d=${msToSeconds(fadeOutMs)}`);
      }
      if (v.length === 0) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          'Invalid fades: at least one of fadeInMs or fadeOutMs must be > 0',
        );
      }
      videoFilters = v;
      audioFilters = a;
      audioOpts = AUDIO_AAC;
      description = `fades in=${fadeInMs}ms out=${fadeOutMs}ms`;
      break;
    }

    case 'audio_normalize': {
      // Audio-only enhancement (Req 12.1): copy video, re-encode audio through
      // the deterministic loudnorm filter built from the single-source targets.
      videoCopy = true;
      audioFilters = [buildLoudnormFilter(AUDIO_TARGETS)];
      audioOpts = AUDIO_AAC;
      description = `audio normalize (loudnorm I=${AUDIO_TARGETS.integratedLoudnessLufs}LUFS TP=${AUDIO_TARGETS.truePeakCeilingDbtp}dBTP)`;
      break;
    }

    case 'silence_removal': {
      // Deterministic silence cut (Req 8.5, 12.2). The keep-ranges MUST already
      // be validated by `planSilenceRemoval` (speech-conflict blocking happens
      // there); here we only assert the ranges are well-formed and build the
      // select/aselect filtergraph that concatenates them.
      const { keepRanges } = operation.params;
      if (!Array.isArray(keepRanges) || keepRanges.length === 0) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          'Invalid silence_removal: keepRanges must be a non-empty array of ranges',
        );
      }
      const exprTerms: string[] = [];
      for (const range of keepRanges) {
        requireNonNegative(range.startMs, 'silence_removal.keepRanges.startMs');
        if (!Number.isFinite(range.endMs) || range.endMs <= range.startMs) {
          throw new DeterministicEditError(
            'DETERMINISTIC_INVALID_PARAM',
            `Invalid silence_removal range: endMs (${range.endMs}) must be greater than startMs (${range.startMs})`,
          );
        }
        exprTerms.push(`between(t,${msToSeconds(range.startMs)},${msToSeconds(range.endMs)})`);
      }
      // Single-quote the select expression so its internal commas are not parsed
      // as filtergraph separators. `setpts`/`asetpts` re-time the kept pieces so
      // they play back contiguously.
      const selectExpr = exprTerms.join('+');
      videoFilters = [`select='${selectExpr}'`, 'setpts=N/FRAME_RATE/TB'];
      audioFilters = [`aselect='${selectExpr}'`, 'asetpts=N/SR/TB'];
      audioOpts = AUDIO_AAC;
      description = `silence removal (keep ${keepRanges.length} range(s))`;
      break;
    }

    case 'auto_cut': {
      // Deterministic beat-synced montage (Increment 2). The keep-`segments` MUST
      // already be computed by the pure `computeAutoCutSegments` — here we only
      // assert they are well-formed and build the select/aselect filtergraph that
      // concatenates them (mirrors `silence_removal`). This engine never analyses
      // audio; it only renders pre-planned segments (No-Mock, Req 23).
      const { segments, punchInZoom } = operation.params;
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          'Invalid auto_cut: segments must be a non-empty array of keep-segments',
        );
      }
      const cutTerms: string[] = [];
      for (const seg of segments) {
        requireNonNegative(seg.startMs, 'auto_cut.segments.startMs');
        if (!Number.isFinite(seg.endMs) || seg.endMs <= seg.startMs) {
          throw new DeterministicEditError(
            'DETERMINISTIC_INVALID_PARAM',
            `Invalid auto_cut segment: endMs (${seg.endMs}) must be greater than startMs (${seg.startMs})`,
          );
        }
        cutTerms.push(`between(t,${msToSeconds(seg.startMs)},${msToSeconds(seg.endMs)})`);
      }
      // Single-quote the select expression so its internal commas are not parsed
      // as filtergraph separators. `setpts`/`asetpts` re-time the kept pieces so
      // they play back contiguously as one montage.
      const cutExpr = cutTerms.join('+');
      const v: string[] = [`select='${cutExpr}'`, 'setpts=N/FRAME_RATE/TB'];
      if (punchInZoom === true) {
        // Subtle fixed centred punch-in via `crop` only (in the standard build).
        // Even-dimension truncation keeps yuv420p valid; default x/y centre it.
        const zoom = AUTO_CUT_PUNCH_IN_ZOOM.toFixed(6);
        v.push(`crop=2*trunc(iw/${zoom}/2):2*trunc(ih/${zoom}/2)`);
      }
      videoFilters = v;
      audioFilters = [`aselect='${cutExpr}'`, 'asetpts=N/SR/TB'];
      audioOpts = AUDIO_AAC;
      description = `auto-cut montage (${segments.length} segment(s)${punchInZoom === true ? ', punch-in' : ''})`;
      break;
    }

    case 'filter': {
      // Colour/look grade (video-only): apply the named look's fixed filter chain
      // and copy the audio stream verbatim. The look must be one of the closed
      // FilterLook set; anything else is a validated parameter error.
      const look = operation.params.look;
      const chain = FILTER_LOOK_CHAINS[look as FilterLook];
      if (!chain) {
        throw new DeterministicEditError(
          'DETERMINISTIC_INVALID_PARAM',
          `Invalid filter look: expected one of ${FILTER_LOOKS.join(', ')}, got ${String(look)}`,
        );
      }
      videoFilters = [...chain];
      description = `filter ${look}`;
      break;
    }

    case 'encode': {
      const profile = getExportProfile(operation.params.exportProfileId);
      if (!profile) {
        throw new DeterministicEditError(
          'DETERMINISTIC_UNKNOWN_PROFILE',
          `Unknown export profile "${operation.params.exportProfileId}"`,
        );
      }
      return buildEncodeCommand(profile, inputPath, outputPath, options);
    }

    default: {
      // Exhaustiveness guard — unreachable for a well-typed operation.
      const _never: never = operation;
      throw new DeterministicEditError(
        'DETERMINISTIC_UNSUPPORTED_OPERATION',
        `Unsupported deterministic operation: ${JSON.stringify(_never)}`,
      );
    }
  }

  const videoFilter = videoFilters.join(',');
  const audioFilter = audioFilters.join(',');

  const outputOptions: string[] = [
    ...leadingOutputOptions,
    ...(videoCopy ? VIDEO_COPY : baseVideoOptions(options.videoEncoderArgs)),
    ...audioOpts,
  ];

  const inputOptions = [...leadingInputOptions];

  // Input-side options MUST precede `-i`; everything else follows the input.
  const args = ['-y', '-hide_banner', '-nostdin', ...inputOptions, '-i', inputPath];
  if (videoFilter) args.push('-vf', videoFilter);
  if (audioFilter) args.push('-af', audioFilter);
  args.push(...outputOptions, outputPath);

  return {
    args,
    inputOptions,
    videoFilter,
    audioFilter,
    outputOptions,
    description,
    inputPath,
    outputPath,
  };
}

/**
 * Build the deterministic re-encode command for an export profile.
 *
 * The profile's target BITRATE is authoritative here (unlike the constant-quality
 * base path), so the encoder policy is asked for a bitrate-mode vector — it maps
 * to `-b:v <kbps>k` on both the hardware and software encoders, keeping the
 * profile contract intact whichever encoder is selected.
 */
function buildEncodeCommand(
  profile: ExportProfile,
  inputPath: string,
  outputPath: string,
  options: BuildDeterministicCommandOptions = {},
): DeterministicCommand {
  const codecFamily = profile.videoCodec === 'h264' ? 'h264'
    : profile.videoCodec === 'h265' ? 'h265'
    : 'vp9';
  const acodec = profile.audioCodec === 'aac' ? 'aac' : 'libopus';

  const videoEncoderOpts = options.videoEncoderArgs
    ? [...options.videoEncoderArgs]
    : resolveVideoEncoderArgs({
        codecFamily,
        target: { mode: 'bitrate', videoBitrateKbps: profile.videoBitrateKbps },
      });

  const videoFilter = `scale=${profile.width}:${profile.height}`;
  const outputOptions = [
    ...videoEncoderOpts,
    '-r',
    String(profile.fps),
    '-c:a',
    acodec,
    '-b:a',
    `${profile.audioBitrateKbps}k`,
  ];

  const args = [
    '-y',
    '-hide_banner',
    '-nostdin',
    '-i',
    inputPath,
    '-vf',
    videoFilter,
    ...outputOptions,
    outputPath,
  ];

  return {
    args,
    inputOptions: [],
    videoFilter,
    audioFilter: '',
    outputOptions,
    description: `encode ${profile.id} (${profile.width}x${profile.height}@${profile.fps})`,
    inputPath,
    outputPath,
  };
}

/** The command as a single shell-style string (deterministic; mirrors `args`). */
export function deterministicCommandToString(command: DeterministicCommand): string {
  return ['ffmpeg', ...command.args].join(' ');
}

/** Promisified `child_process.execFile` used by the multi-input assembly runner. */
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Multi-clip assembly (stitch N sources → ONE video) — pure command builder
// ---------------------------------------------------------------------------

/** Tunable box + frame-rate for a multi-clip assembly (all engine constants otherwise). */
export interface AssembleCommandOptions {
  /** Target output width in pixels (every clip is letterboxed to fit this box). */
  width: number;
  /** Target output height in pixels. */
  height: number;
  /** Target constant frame rate for the assembled output (fps). */
  fps: number;
  /**
   * Explicit video-encoder args, bypassing `ffmpeg-encoder-policy.ts`. Lets tests
   * assert policy behaviour (forced-software vs hardware) without touching env.
   */
  videoEncoderArgs?: readonly string[];
}

/** A deterministic multi-input FFmpeg assembly invocation. */
export interface AssembleCommand {
  /** Full FFmpeg argument vector (excludes the `ffmpeg` binary itself). */
  args: string[];
  /** Human-readable description (used as artifact provenance prompt). */
  description: string;
  /** The ordered input file paths (one `-i` each). */
  inputPaths: string[];
  /** The single assembled output file path. */
  outputPath: string;
  /** The `-filter_complex` graph string (for inspection/tests). */
  filterComplex: string;
}

/**
 * Build the deterministic FFmpeg command that stitches N inputs into ONE video.
 * PURE — performs no IO. For each input the graph:
 *
 *   • scales the video to FIT within `width`×`height` preserving aspect
 *     (`force_original_aspect_ratio=decrease`), then pads (letterboxes) to
 *     EXACTLY the target dimensions, forces a square sample aspect (`setsar=1`),
 *     sets the constant frame rate (`fps`), and normalises pixel format to
 *     `yuv420p`; and
 *   • resamples the audio to 48 kHz stereo (`aresample`/`aformat`),
 *
 * then concatenates all normalised segments with a single
 * `concat=n=N:v=1:a=1` node into one video + one audio stream, re-encoded with the
 * encoder vector resolved from `ffmpeg-encoder-policy.ts` (+ `AUDIO_AAC`). Two
 * calls with the same inputs/opts always yield an identical command; output bytes
 * are reproducible only on the software encoder path (see the file header).
 *
 * Each input is expected to carry an audio stream — the IO shell
 * ({@link DeterministicEditorService.executeAssembly}) normalises any audioless
 * input by adding a silent 48 kHz stereo track BEFORE this command runs, so the
 * concat audio stream stays continuous (deterministic normalization, not
 * fabricated content — No-Mock, Req 23).
 */
export function buildAssembleCommand(
  inputPaths: string[],
  outputPath: string,
  opts: AssembleCommandOptions,
): AssembleCommand {
  if (!Array.isArray(inputPaths) || inputPaths.length < 2) {
    throw new DeterministicEditError(
      'DETERMINISTIC_INVALID_PARAM',
      `Invalid assembly: expected at least 2 input paths, got ${Array.isArray(inputPaths) ? inputPaths.length : 0}`,
    );
  }
  const width = requirePositiveInt(opts.width, 'assemble.width');
  const height = requirePositiveInt(opts.height, 'assemble.height');
  const fps = requirePositiveInt(opts.fps, 'assemble.fps');

  const n = inputPaths.length;
  const graphParts: string[] = [];
  const concatPads: string[] = [];
  for (let i = 0; i < n; i += 1) {
    // Per-input video: fit within the box, letterbox to exact dims, fix SAR/fps,
    // normalise pixel format so every segment is concat-compatible.
    graphParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`,
    );
    // Per-input audio: resample to a fixed 48 kHz stereo layout so the concat
    // audio stream is uniform across segments.
    graphParts.push(
      `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    );
    concatPads.push(`[v${i}][a${i}]`);
  }
  // Single deterministic concat node → one video + one audio output pad.
  graphParts.push(`${concatPads.join('')}concat=n=${n}:v=1:a=1[outv][outa]`);
  const filterComplex = graphParts.join(';');

  const args: string[] = ['-y', '-hide_banner', '-nostdin'];
  for (const p of inputPaths) args.push('-i', p);
  args.push('-filter_complex', filterComplex, '-map', '[outv]', '-map', '[outa]');
  args.push(...baseVideoOptions(opts.videoEncoderArgs), ...AUDIO_AAC, outputPath);

  return {
    args,
    description: `assemble ${n} clips \u2192 ${width}x${height}@${fps}`,
    inputPaths: [...inputPaths],
    outputPath,
    filterComplex,
  };
}

// ---------------------------------------------------------------------------
// Errors (Req 8.6)
// ---------------------------------------------------------------------------

/**
 * Thrown on any deterministic-editing failure. Carries a stable `code` used to
 * record the failure cause on the Video_Edit_Job (Req 8.6). When thrown after a
 * job is known, the service marks that job FAILED with this code and produces no
 * artifact.
 */
export class DeterministicEditError extends Error {
  readonly statusCode = 422;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DeterministicEditError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Service (IO shell)
// ---------------------------------------------------------------------------

/** Runs a built deterministic command against FFmpeg. Injectable for testing. */
export type DeterministicFfmpegRunner = (command: DeterministicCommand) => Promise<void>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface DeterministicEditorServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Storage backend for reading source bytes + storing the output artifact. */
  storage?: IStorageService;
  /** Artifact repository (persists the single immutable output artifact). */
  artifactRepository?: ArtifactRepository;
  /** Video_Edit_Job model (marked FAILED on failure, Req 8.6). */
  jobModel?: Model<IVideoEditJob>;
  /** FFmpeg runner; defaults to a `fluent-ffmpeg` + `ffmpeg-static` runner. */
  runner?: DeterministicFfmpegRunner;
  /**
   * Multi-input assembly runner; defaults to an `execFile` runner that invokes
   * the resolved `ffmpeg` binary with the built {@link AssembleCommand} args
   * (a single deterministic invocation with N `-i` inputs + a `-filter_complex`
   * concat graph). Injectable for tests.
   */
  assemblyRunner?: (command: AssembleCommand) => Promise<void>;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
  /** Base directory for temporary working files (defaults to the OS temp dir). */
  tempDir?: string;
  /**
   * Schedule a deferred temp-file cleanup on the `video-cleanup` queue when
   * inline removal fails, so removal is retried up to 3 times with an error
   * recorded if all fail (Req 20.7). Injectable for tests; the default enqueues
   * via `VideoEditorQueueManager`. Returns the enqueued job id or `null`.
   */
  scheduleCleanupRetry?: (input: DeterministicCleanupRetryInput) => Promise<string | null>;
}

/** Identity + paths for a deferred deterministic temp-file cleanup (Req 20.7). */
export interface DeterministicCleanupRetryInput {
  projectId: string;
  versionId: string;
  opId: string;
  workspaceId: string;
  userId: string;
  tempFilePaths: string[];
}

/**
 * A request to stitch SEVERAL immutable Video_Sources into ONE assembled video
 * (multi-clip assembly). The assembled output is a normal deterministic artifact
 * the existing grade/caption/beat-cut/highlight chain can then operate on.
 *
 * No-Mock (Req 23): the caller MUST supply at least 2 usable sources — with
 * fewer than 2, {@link DeterministicEditorService.executeAssembly} throws rather
 * than inventing clips.
 */
export interface DeterministicAssembleRequest {
  /** Owning Video_Project (scopes the output artifact folder). */
  projectId: string;
  /** Owning workspace (persisted on the artifact for isolation). */
  workspaceId: string;
  /** Owning user (persisted on the artifact for isolation). */
  userId: string;
  /** Originating Video_Edit_Job id — the artifact is traceable to it (Req 8.3). */
  jobId: string;
  /** Input Video_Version the assembly derives from (artifact provenance). */
  inputVersionId: string;
  /** The ordered immutable sources to stitch (≥ 2). */
  sources: Array<{ storageKey: string; fileName: string }>;
  /** Target output width in pixels (every clip is letterboxed into this box). */
  targetWidth: number;
  /** Target output height in pixels. */
  targetHeight: number;
  /** Target constant frame rate (fps); defaults to 30 when omitted. */
  fps?: number;
  /** Output artifact category (default `'renders'`). */
  outputCategory?: ArtifactCategory;
  /** Output MIME type (default `'video/mp4'`). */
  outputMimeType?: string;
}

/** A request to perform one deterministic operation on a Video_Source. */
export interface DeterministicEditRequest {
  /** Owning Video_Project (scopes the output artifact folder). */
  projectId: string;
  /** Owning workspace (persisted on the artifact for isolation). */
  workspaceId: string;
  /** Owning user (persisted on the artifact for isolation). */
  userId: string;
  /** Originating Video_Edit_Job id — the artifact is traceable to it (Req 8.3). */
  jobId: string;
  /** Input Video_Version the operation derives from (artifact provenance). */
  inputVersionId: string;
  /** Storage key of the immutable Video_Source bytes to read (Req 8.4). */
  sourceStorageKey: string;
  /** Original source filename (used to derive temp/artifact file extension). */
  sourceFileName: string;
  /** The single deterministic operation to perform. */
  operation: DeterministicOperation;
  /** Output artifact category (default `'renders'`). */
  outputCategory?: ArtifactCategory;
  /** Output MIME type (default `'video/mp4'`). */
  outputMimeType?: string;
}

/**
 * A request to remove silence from a Video_Source. Unlike a plain
 * {@link DeterministicEditRequest}, the removal is *planned* from the analysis
 * silence/speech segments (Req 8.5, 12.2, 12.3) before any FFmpeg work: the pure
 * `planSilenceRemoval` decides the keep-ranges and blocks the operation when a
 * requested removal range overlaps speech.
 */
export interface SilenceRemovalEditRequest
  extends Omit<DeterministicEditRequest, 'operation'> {
  /**
   * Silence-removal planning inputs: whether removal was explicitly requested,
   * the analysis silence & speech segments, the source duration, and any
   * explicit requested ranges. Passed verbatim to `planSilenceRemoval`.
   */
  plan: SilenceRemovalRequest;
}

/** Result of a successful deterministic operation (exactly one artifact). */
export interface DeterministicEditResult {
  /** The single immutable output artifact (Req 8.3). */
  artifact: CreateArtifactResult['artifact'];
  /** The stable storage key holding the output bytes. */
  storageKey: string;
  /** The deterministic command that was executed. */
  command: DeterministicCommand;
}

/**
 * Deterministic_Editor service (Req 8.1–8.4, 8.6). Reads immutable source bytes,
 * runs a deterministic FFmpeg command, and persists EXACTLY ONE traceable output
 * artifact on success — or, on any failure, records an error code, marks the job
 * FAILED, and produces no artifact. It NEVER calls a provider (Req 8.1).
 */
export class DeterministicEditorService {
  private readonly log: DeterministicEditorServiceDeps['logger'];
  private readonly storage: IStorageService;
  private readonly artifactRepository: ArtifactRepository;
  private readonly jobModel: Model<IVideoEditJob>;
  private readonly runner: DeterministicFfmpegRunner;
  private readonly assemblyRunner: (command: AssembleCommand) => Promise<void>;
  private readonly ffmpegPath: string | null;
  private readonly tempDir: string;
  private readonly scheduleCleanupRetry: (
    input: DeterministicCleanupRetryInput,
  ) => Promise<string | null>;

  constructor(deps: DeterministicEditorServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.artifactRepository = deps.artifactRepository ?? getArtifactRepository();
    this.jobModel = deps.jobModel ?? DefaultVideoEditJobModel;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor');
    this.runner = deps.runner ?? this.createDefaultRunner();
    this.assemblyRunner = deps.assemblyRunner ?? this.createDefaultAssemblyRunner();
    this.scheduleCleanupRetry =
      deps.scheduleCleanupRetry ??
      ((input) => enqueueTempFileCleanup({ ...input, reason: 'deterministic-cleanup' }));
  }

  /**
   * Build the deterministic command for a request WITHOUT executing FFmpeg.
   * Useful for tests and for callers that want to inspect the exact command.
   */
  buildCommand(operation: DeterministicOperation, inputPath: string, outputPath: string): DeterministicCommand {
    return buildDeterministicCommand(operation, inputPath, outputPath);
  }

  /**
   * Perform one deterministic operation end-to-end (Req 8.1–8.4, 8.6):
   *
   *   1. Download the immutable source bytes to a temp INPUT file (source is
   *      never modified — Req 8.4).
   *   2. Run the deterministic FFmpeg command to a temp OUTPUT file.
   *   3. On success, persist EXACTLY ONE traceable artifact (Req 8.3) and return it.
   *   4. On any failure, mark the job FAILED with an error code and produce no
   *      artifact (Req 8.6), rethrowing a `DeterministicEditError`.
   *
   * Temporary files are always cleaned up.
   */
  async execute(request: DeterministicEditRequest): Promise<DeterministicEditResult> {
    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const inExt = path.extname(request.sourceFileName) || '.mp4';
    const inputPath = path.join(workDir, `input${inExt}`);
    const outputPath = path.join(workDir, `output.mp4`);

    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      // 1. Read source bytes UNMODIFIED into the temp input file (Req 8.4). We
      //    download by key and never write back to the source key.
      const source = await this.storage.downloadFile(request.sourceStorageKey);
      await fs.promises.writeFile(inputPath, source.buffer);

      // 2. Build the deterministic command and run FFmpeg.
      const command = buildDeterministicCommand(request.operation, inputPath, outputPath);
      this.log?.info?.('Running deterministic FFmpeg operation', {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        projectId: request.projectId,
        kind: request.operation.kind,
      });
      await this.runner(command);

      // 3. Verify the output exists and is non-empty before persisting.
      const outBuffer = await this.readNonEmptyOutput(outputPath);

      // 4. Persist EXACTLY ONE traceable artifact (Req 8.3). Deterministic
      //    provenance: provider/model = the ffmpeg engine id, cost 0, linked to
      //    the originating job.
      const created = await this.artifactRepository.createArtifact({
        projectId: request.projectId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        category: request.outputCategory ?? 'renders',
        buffer: outBuffer,
        originalName: `${request.operation.kind}-${workId}.mp4`,
        mimeType: request.outputMimeType ?? 'video/mp4',
        deterministic: true,
        provenance: {
          jobId: request.jobId,
          inputVersionId: request.inputVersionId,
          provider: DETERMINISTIC_ENGINE_ID,
          model: DETERMINISTIC_ENGINE_ID,
          prompt: command.description,
          costCredits: 0,
        },
      });

      this.log?.info?.('Deterministic operation produced artifact', {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        artifactId: created.artifact.artifactId,
        kind: request.operation.kind,
      });

      return { artifact: created.artifact, storageKey: created.storageKey, command };
    } catch (error) {
      // 5. Failure path (Req 8.6): record the error code, mark the job FAILED,
      //    and produce NO artifact. We never overwrite/mutate the source.
      const code =
        error instanceof DeterministicEditError ? error.code : 'DETERMINISTIC_OPERATION_FAILED';
      await this.failJob(request.jobId, code);
      this.log?.error?.('Deterministic operation failed', error as Error, {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        projectId: request.projectId,
        kind: request.operation.kind,
        errorCode: code,
      });
      if (error instanceof DeterministicEditError) throw error;
      throw new DeterministicEditError(code, (error as Error)?.message ?? 'Deterministic operation failed');
    } finally {
      await this.cleanup(workDir, {
        projectId: request.projectId,
        versionId: request.inputVersionId,
        opId: `det-clean-${workId}`,
        workspaceId: request.workspaceId,
        userId: request.userId,
      });
    }
  }

  /**
   * Stitch SEVERAL immutable Video_Sources into ONE assembled video end-to-end
   * (multi-clip assembly). Follows the SAME shape as {@link execute}:
   *
   *   1. Require ≥ 2 sources — else throw `DETERMINISTIC_INVALID_PARAM` and
   *      produce no artifact (No-Mock, Req 23: never invent clips).
   *   2. Download each immutable source to its OWN temp INPUT file (sources are
   *      never modified — Req 8.4). Any input lacking an audio stream is
   *      normalised by adding a silent 48 kHz stereo track so the concat audio
   *      stream stays continuous (deterministic normalization, not fabricated
   *      content).
   *   3. Run ONE deterministic FFmpeg invocation (N `-i` inputs + a
   *      `-filter_complex` concat graph) that letterboxes every clip to the exact
   *      target box, normalises fps/SAR/pixel-format + 48 kHz stereo audio, and
   *      concatenates them, re-encoding libx264 + AAC.
   *   4. On success, persist EXACTLY ONE traceable artifact (Req 8.3) with
   *      deterministic provenance (cost 0, linked to the job) and return it.
   *   5. On any failure, mark the job FAILED with an error code and produce no
   *      artifact (Req 8.6), rethrowing a `DeterministicEditError`.
   *
   * Temporary files are always cleaned up.
   */
  async executeAssembly(request: DeterministicAssembleRequest): Promise<DeterministicEditResult> {
    if (!Array.isArray(request.sources) || request.sources.length < 2) {
      throw new DeterministicEditError(
        'DETERMINISTIC_INVALID_PARAM',
        `Assembly needs at least 2 clips, got ${Array.isArray(request.sources) ? request.sources.length : 0}`,
      );
    }

    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const outputPath = path.join(workDir, 'output.mp4');
    const fps =
      typeof request.fps === 'number' && Number.isFinite(request.fps) && request.fps > 0
        ? Math.round(request.fps)
        : 30;

    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      // 1. Read each immutable source UNMODIFIED into its own temp input file
      //    (Req 8.4), then ensure it carries an audio stream so the concat audio
      //    stream is continuous (silent normalization for audioless inputs).
      const inputPaths: string[] = [];
      for (let i = 0; i < request.sources.length; i += 1) {
        const src = request.sources[i];
        const inExt = path.extname(src.fileName) || '.mp4';
        const rawPath = path.join(workDir, `input-${i}${inExt}`);
        const dl = await this.storage.downloadFile(src.storageKey);
        await fs.promises.writeFile(rawPath, dl.buffer);
        const ready = await this.ensureAudioTrack(rawPath, workDir, i);
        inputPaths.push(ready);
      }

      // 2. Build the deterministic assembly command and run FFmpeg (one call).
      const command = buildAssembleCommand(inputPaths, outputPath, {
        width: request.targetWidth,
        height: request.targetHeight,
        fps,
      });
      this.log?.info?.('Running deterministic multi-clip assembly', {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        projectId: request.projectId,
        clips: inputPaths.length,
        width: request.targetWidth,
        height: request.targetHeight,
        fps,
      });
      await this.assemblyRunner(command);

      // 3. Verify the output exists and is non-empty before persisting.
      const outBuffer = await this.readNonEmptyOutput(outputPath);

      // 4. Persist EXACTLY ONE traceable artifact (Req 8.3) with deterministic
      //    provenance (cost 0, linked to the originating job).
      const created = await this.artifactRepository.createArtifact({
        projectId: request.projectId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        category: request.outputCategory ?? 'renders',
        buffer: outBuffer,
        originalName: `assemble-${workId}.mp4`,
        mimeType: request.outputMimeType ?? 'video/mp4',
        deterministic: true,
        provenance: {
          jobId: request.jobId,
          inputVersionId: request.inputVersionId,
          provider: DETERMINISTIC_ENGINE_ID,
          model: DETERMINISTIC_ENGINE_ID,
          prompt: command.description,
          costCredits: 0,
        },
      });

      this.log?.info?.('Deterministic assembly produced artifact', {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        artifactId: created.artifact.artifactId,
        clips: inputPaths.length,
      });

      // Adapt the multi-input assembly command to the shared result command shape
      // (the assembly is a single invocation with no per-stream -vf/-af).
      const resultCommand: DeterministicCommand = {
        args: command.args,
        inputOptions: [],
        videoFilter: '',
        audioFilter: '',
        outputOptions: [...baseVideoOptions(), ...AUDIO_AAC],
        description: command.description,
        inputPath: inputPaths[0],
        outputPath,
      };

      return { artifact: created.artifact, storageKey: created.storageKey, command: resultCommand };
    } catch (error) {
      const code =
        error instanceof DeterministicEditError ? error.code : 'DETERMINISTIC_ASSEMBLY_FAILED';
      await this.failJob(request.jobId, code);
      this.log?.error?.('Deterministic assembly failed', error as Error, {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        projectId: request.projectId,
        clips: request.sources.length,
        errorCode: code,
      });
      if (error instanceof DeterministicEditError) throw error;
      throw new DeterministicEditError(code, (error as Error)?.message ?? 'Deterministic assembly failed');
    } finally {
      await this.cleanup(workDir, {
        projectId: request.projectId,
        versionId: request.inputVersionId,
        opId: `det-assemble-clean-${workId}`,
        workspaceId: request.workspaceId,
        userId: request.userId,
      });
    }
  }

  /**
   * Ensure `inputPath` carries an audio stream. Inputs that already have audio
   * are returned unchanged; an audioless input is normalised by muxing a silent
   * 48 kHz stereo track (video stream-copied) into a sibling temp file whose path
   * is returned. This keeps the concat audio stream continuous WITHOUT fabricating
   * content (No-Mock, Req 23). A probe failure conservatively assumes audio is
   * present so a real track is never dropped.
   */
  private async ensureAudioTrack(inputPath: string, workDir: string, index: number): Promise<string> {
    const hasAudio = await this.probeHasAudio(inputPath);
    if (hasAudio) return inputPath;

    const silencedPath = path.join(workDir, `input-${index}-silenced.mp4`);
    const args = [
      '-y',
      '-hide_banner',
      '-nostdin',
      '-i',
      inputPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-shortest',
      '-map',
      '0:v:0',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      silencedPath,
    ];
    await execFileAsync(this.ffmpegPath || 'ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
    return silencedPath;
  }

  /** Whether `inputPath` has at least one audio stream (ffprobe). */
  private probeHasAudio(inputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        ffmpeg.ffprobe(inputPath, (err: Error | null, data: { streams?: Array<{ codec_type?: string }> } | undefined) => {
          if (err || !data || !Array.isArray(data.streams)) {
            // Conservative: assume audio present so a real track is never dropped;
            // the concat fails honestly if audio is truly absent.
            resolve(true);
            return;
          }
          resolve(data.streams.some((s) => s?.codec_type === 'audio'));
        });
      } catch {
        resolve(true);
      }
    });
  }

  /**
   * Plan and perform a silence removal (Req 8.5, 12.2, 12.3).
   *
   *   1. Plan the removal purely from the analysis silence/speech segments. If
   *      the request is blocked — a requested removal range overlaps a detected
   *      speech segment (Req 12.3) or the duration is invalid — mark the job
   *      FAILED with the plan's error code, produce NO artifact, and leave the
   *      source audio unmodified, then throw a `DeterministicEditError`.
   *   2. Otherwise execute a deterministic `silence_removal` operation that keeps
   *      only the planned keep-ranges, so every detected speech segment stays
   *      present and uncut (Req 12.2).
   *
   * Removes nothing (and still produces a faithful re-encode) when the plan's
   * removal set is empty — e.g. silence removal was not explicitly requested.
   */
  async removeSilence(request: SilenceRemovalEditRequest): Promise<DeterministicEditResult> {
    const plan = planSilenceRemoval(request.plan);
    if (!plan.ok) {
      // Req 12.3: block, leave the source unmodified, record the error code.
      await this.failJob(request.jobId, plan.errorCode);
      this.log?.warn?.('Silence removal blocked before FFmpeg', {
        component: 'DeterministicEditorService',
        jobId: request.jobId,
        projectId: request.projectId,
        errorCode: plan.errorCode,
        conflicts: plan.conflicts.length,
      });
      throw new DeterministicEditError(plan.errorCode, plan.message);
    }

    const { plan: _plan, ...base } = request;
    return this.execute({
      ...base,
      operation: { kind: 'silence_removal', params: { keepRanges: plan.keepRanges } },
    });
  }

  /** Read the FFmpeg output, rejecting a missing or empty file (Req 8.6). */
  private async readNonEmptyOutput(outputPath: string): Promise<Buffer> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(outputPath);
    } catch {
      throw new DeterministicEditError(
        'DETERMINISTIC_NO_OUTPUT',
        'FFmpeg produced no output file',
      );
    }
    if (!stat.isFile() || stat.size <= 0) {
      throw new DeterministicEditError(
        'DETERMINISTIC_EMPTY_OUTPUT',
        'FFmpeg produced an empty output file',
      );
    }
    return fs.promises.readFile(outputPath);
  }

  /**
   * Mark the associated Video_Edit_Job FAILED with an error code (Req 8.6),
   * respecting terminal-state absorption — a job already in a terminal state is
   * not overwritten. Best-effort: an update failure is logged, not thrown, so it
   * cannot mask the original error.
   */
  private async failJob(jobId: string, errorCode: string): Promise<void> {
    try {
      await this.jobModel
        .updateOne(
          { jobId, state: { $nin: [...TERMINAL_STATES] } },
          { $set: { state: 'FAILED', errorCode } },
        )
        .exec();
    } catch (error) {
      this.log?.warn?.('Failed to mark job FAILED after deterministic error', {
        component: 'DeterministicEditorService',
        jobId,
        error: (error as Error)?.message,
      });
    }
  }

  /**
   * Remove the temporary working directory within 60 s of the operation settling
   * (Req 20.5, 20.6). Inline removal is the fast path; when it fails, the removal
   * is deferred to the `video-cleanup` queue so it is retried up to 3 times with
   * an error recorded if all fail (Req 20.7). A scheduling failure is logged and
   * never propagated — cleanup must not mask the operation's result.
   */
  private async cleanup(
    workDir: string,
    retry?: Omit<DeterministicCleanupRetryInput, 'tempFilePaths'>,
  ): Promise<void> {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      this.log?.warn?.('Failed to clean up deterministic temp dir; scheduling retry', {
        component: 'DeterministicEditorService',
        workDir,
        error: (error as Error)?.message,
      });
      if (retry) {
        try {
          await this.scheduleCleanupRetry({ ...retry, tempFilePaths: [workDir] });
        } catch (scheduleError) {
          this.log?.warn?.('Failed to schedule deterministic temp-dir cleanup retry', {
            component: 'DeterministicEditorService',
            workDir,
            error: (scheduleError as Error)?.message,
          });
        }
      }
    }
  }

  /**
   * Default assembly runner: invokes the resolved `ffmpeg` binary with the built
   * {@link AssembleCommand} args in ONE deterministic call. Uses `execFile`
   * (not fluent-ffmpeg) because the assembly is a multi-input `-filter_complex`
   * invocation whose exact argument vector the pure builder already produced.
   */
  private createDefaultAssemblyRunner(): (command: AssembleCommand) => Promise<void> {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return async (command: AssembleCommand) => {
      const bin = ffmpegPath || 'ffmpeg';
      try {
        await execFileAsync(bin, command.args, { maxBuffer: 64 * 1024 * 1024 });
      } catch (err) {
        log?.error?.('Deterministic assembly FFmpeg failed', err as Error, {
          component: 'DeterministicEditorService',
        });
        throw err;
      }
    };
  }

  /**
   * Default runner: executes the built command via fluent-ffmpeg.
   *
   * `command.inputOptions` are applied with `inputOptions()` so they land BEFORE
   * `-i` — that is what makes a trim's `-ss` an INPUT-side seek (decode starts at
   * the cut point instead of frame 0). Passing them through `outputOptions()` would
   * silently restore the slow output-side seek.
   */
  private createDefaultRunner(): DeterministicFfmpegRunner {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return (command: DeterministicCommand) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(command.inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        if (command.inputOptions.length > 0) cmd.inputOptions([...command.inputOptions]);
        if (command.videoFilter) cmd.videoFilters(command.videoFilter);
        if (command.audioFilter) cmd.audioFilters(command.audioFilter);
        cmd
          .outputOptions(command.outputOptions)
          .on('error', (err: Error) => {
            log?.error?.('Deterministic FFmpeg failed', err, {
              component: 'DeterministicEditorService',
            });
            reject(err);
          })
          .on('end', () => resolve())
          .save(command.outputPath);
      });
  }
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const deterministicEditorService = new DeterministicEditorService();
