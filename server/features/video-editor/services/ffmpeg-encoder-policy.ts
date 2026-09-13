/**
 * FFmpeg_Encoder_Policy — the SINGLE source of truth for the video-encoder
 * argument vector used by every deterministic render in the Video Editor.
 *
 * WHY this exists: four independent render sites (deterministic base opts,
 * export-profile re-encode, static caption burn-in, animated/ASS caption
 * burn-in) each hardcoded `-c:v libx264 -preset medium`. On the bundled
 * `ffmpeg-static` build that is the slowest reasonable configuration available:
 * measured on an Apple Silicon dev box with a 60s 1080x1920 30fps clip,
 *
 *   • 5s trim  — libx264 medium/crf18: 2.53s wall / 10.9s CPU
 *                h264_videotoolbox:    0.99s wall /  1.06s CPU
 *   • 60s grade — libx264 medium/crf18: 23.98s wall / 131.7s CPU
 *                h264_videotoolbox:     7.79s wall /  13.7s CPU
 *
 * i.e. a ~3x wall-clock and ~10x CPU reduction for visually equivalent output.
 * The bundled binary (ffmpeg 6.0 arm64) ships `h264_videotoolbox`, and its output
 * decodes cleanly, so the hardware path is used whenever it is actually present.
 *
 * DETERMINISM CONTRACT (read this before "fixing" anything here):
 *   • ARGUMENT construction is always deterministic — for a fixed capability set
 *     and a fixed env, the same request always yields the same argument vector.
 *   • BYTE-REPRODUCIBLE OUTPUT is only guaranteed on the SOFTWARE path. Hardware
 *     encoders (VideoToolbox) are not bit-exact across runs, driver versions, or
 *     thermal states. Callers that need byte-for-byte reproducibility MUST run
 *     with `VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE=true`.
 *
 * Design rules (mirrors `generative-daily-budget.ts`):
 *   • SELECTION is PURE and TOTAL ({@link selectVideoEncoderArgs},
 *     {@link resolveEncoderPolicyOverrides}) — no spawning, no env mutation, never
 *     throws, fully unit-testable.
 *   • DETECTION is impure, cached once per process, cheap, and NEVER throws
 *     ({@link detectEncoderCapabilities}) — any failure, timeout, or garbage
 *     output degrades to "software only".
 *   • PLATFORM-SAFE. Nothing here assumes macOS. On Linux/production the
 *     capability probe simply reports no VideoToolbox and the libx264 vector is
 *     returned transparently.
 *
 * ESM static imports only; string-first logger only.
 */

import { execFileSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

import { logger as defaultLogger } from '../../../config/logger';

const COMPONENT = 'videoEditor.FfmpegEncoderPolicy';

// ---------------------------------------------------------------------------
// Env vars (all OPTIONAL — defaults are safe on every platform)
// ---------------------------------------------------------------------------

/** `'true'` forces the software (byte-reproducible) path even when HW exists. */
export const FORCE_SOFTWARE_ENV_VAR = 'VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE';

/** Overrides the libx264/libx265 `-preset` used on the software path. */
export const SOFTWARE_PRESET_ENV_VAR = 'VIDEO_EDITOR_SOFTWARE_ENCODE_PRESET';

/** Overrides the VideoToolbox constant-quality value (`-q:v`, 1..100). */
export const HARDWARE_QUALITY_ENV_VAR = 'VIDEO_EDITOR_HARDWARE_ENCODE_QUALITY';

/** Caps `-threads` on the SOFTWARE path only (0 = ffmpeg auto). */
export const SOFTWARE_THREADS_ENV_VAR = 'VIDEO_EDITOR_SOFTWARE_ENCODE_THREADS';

// ---------------------------------------------------------------------------
// Defaults (deterministic engine constants, NOT preset/profile values)
// ---------------------------------------------------------------------------

/**
 * Software preset default. Previously `medium`; `veryfast` is the free win that
 * matters most on Linux production boxes with no VideoToolbox — roughly half the
 * wall time of `medium` at the same CRF with a small bitrate increase.
 */
export const DEFAULT_SOFTWARE_PRESET = 'veryfast';

/** Software constant-quality value (`-crf`), unchanged from the historical 18. */
export const SOFTWARE_QUALITY_CRF = 18;

/**
 * VideoToolbox constant-quality value (`-q:v`, 1..100, higher = better). 55 was
 * benchmarked as visually equivalent to libx264 crf18 on 1080x1920 social video
 * while producing a SMALLER file (46MB vs 70MB on the 60s reference clip).
 */
export const DEFAULT_HARDWARE_QUALITY = 55;

/**
 * Default software `-threads`. 0 means "omit the flag and let ffmpeg pick"
 * (one thread per core), which is what this codebase did historically and is the
 * right default for a dedicated render worker. On a SHARED server, set
 * `VIDEO_EDITOR_SOFTWARE_ENCODE_THREADS=4` (or a similar fraction of the box) so
 * a software fallback cannot peg every core and starve the API process. It is
 * deliberately not capped by default because silently halving throughput on a
 * dedicated worker would be a worse surprise than the documented opt-in.
 */
export const DEFAULT_SOFTWARE_THREADS = 0;

/** Upper bound accepted for `-threads` (anything else falls back to default). */
const MAX_SOFTWARE_THREADS = 64;

/** The x264/x265 preset ladder. Anything outside this falls back to the default. */
const VALID_SOFTWARE_PRESETS: readonly string[] = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
  'placebo',
] as const;

/** Timeout (ms) for the one-shot `ffmpeg -encoders` capability probe. */
const DETECTION_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The codec families the Video Editor can be asked to produce. */
export type VideoCodecFamily = 'h264' | 'h265' | 'vp9';

/** What the bundled ffmpeg binary can actually do (result of detection). */
export interface EncoderCapabilities {
  /** True when `h264_videotoolbox` is listed by `ffmpeg -encoders`. */
  readonly h264Videotoolbox: boolean;
}

/** Capability set used whenever detection fails, times out, or is forced off. */
export const SOFTWARE_ONLY_CAPABILITIES: EncoderCapabilities = {
  h264Videotoolbox: false,
} as const;

/** Fully-resolved env overrides (all fields always present and valid). */
export interface EncoderPolicyOverrides {
  /** Force the software, byte-reproducible path regardless of capabilities. */
  readonly forceSoftware: boolean;
  /** `-preset` for libx264/libx265. */
  readonly softwarePreset: string;
  /** `-q:v` for VideoToolbox (1..100). */
  readonly hardwareQuality: number;
  /** `-threads` for the software path; `0` omits the flag (ffmpeg auto). */
  readonly softwareThreads: number;
}

/**
 * How quality is expressed for this render:
 *   • `quality` — constant-quality (the deterministic engine default).
 *   • `bitrate` — an explicit target bitrate, used by the export-profile path so
 *     `ExportProfile.videoBitrateKbps` is still honoured on both encoders.
 */
export type EncodeQualityTarget =
  | { readonly mode: 'quality' }
  | { readonly mode: 'bitrate'; readonly videoBitrateKbps: number };

/** One render's encoder requirements (everything the pure selector needs). */
export interface VideoEncoderRequest {
  /** Target codec family (default `'h264'`). Only h264 has a hardware path. */
  readonly codecFamily?: VideoCodecFamily;
  /** Constant-quality or explicit target bitrate. */
  readonly target: EncodeQualityTarget;
  /**
   * Add `-movflags +faststart` so the moov atom is at the front and the result
   * streams/plays immediately in the chat card. Default `true` (every render site
   * in this feature writes mp4); pass `false` for non-mp4 containers.
   */
  readonly faststart?: boolean;
}

/** The selected encoder + the exact argument vector to splice into the command. */
export interface VideoEncoderSelection {
  /** The chosen ffmpeg encoder name (e.g. `libx264`, `h264_videotoolbox`). */
  readonly encoder: string;
  /** True when a hardware encoder was selected (⇒ output is NOT bit-exact). */
  readonly hardware: boolean;
  /** Ordered ffmpeg args: `-c:v … [quality] -pix_fmt yuv420p [-movflags …]`. */
  readonly args: string[];
}

// ---------------------------------------------------------------------------
// Pure: env resolution
// ---------------------------------------------------------------------------

/** Parse a boolean-ish env value. Only an explicit truthy token enables it. */
function parseBooleanFlag(raw: string | undefined): boolean {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

/**
 * Resolve the effective encoder overrides from an env-like record.
 *
 * PURE + TOTAL — never throws, never mutates. Every invalid value (empty,
 * non-numeric, out of range, unknown preset name) silently falls back to the
 * documented default, so a typo in `.env` can never break rendering.
 *
 * @param env Environment-like record (defaults to `process.env`).
 * @returns Fully-populated, validated overrides.
 */
export function resolveEncoderPolicyOverrides(
  env: Record<string, string | undefined> = process.env,
): EncoderPolicyOverrides {
  const rawPreset = typeof env[SOFTWARE_PRESET_ENV_VAR] === 'string'
    ? String(env[SOFTWARE_PRESET_ENV_VAR]).trim().toLowerCase()
    : '';
  const softwarePreset = VALID_SOFTWARE_PRESETS.includes(rawPreset)
    ? rawPreset
    : DEFAULT_SOFTWARE_PRESET;

  const rawQuality = Number(String(env[HARDWARE_QUALITY_ENV_VAR] ?? '').trim());
  const hardwareQuality =
    Number.isInteger(rawQuality) && rawQuality >= 1 && rawQuality <= 100
      ? rawQuality
      : DEFAULT_HARDWARE_QUALITY;

  const rawThreads = Number(String(env[SOFTWARE_THREADS_ENV_VAR] ?? '').trim());
  const softwareThreads =
    Number.isInteger(rawThreads) && rawThreads >= 0 && rawThreads <= MAX_SOFTWARE_THREADS
      ? rawThreads
      : DEFAULT_SOFTWARE_THREADS;

  return {
    forceSoftware: parseBooleanFlag(env[FORCE_SOFTWARE_ENV_VAR]),
    softwarePreset,
    hardwareQuality,
    softwareThreads,
  };
}

// ---------------------------------------------------------------------------
// Pure: encoder selection
// ---------------------------------------------------------------------------

/** The software encoder name for a codec family. */
function softwareEncoderFor(family: VideoCodecFamily): string {
  if (family === 'h265') return 'libx265';
  if (family === 'vp9') return 'libvpx-vp9';
  return 'libx264';
}

/**
 * Map a capability set + resolved overrides + one render request to the exact
 * ffmpeg video-encoder argument vector.
 *
 * PURE + TOTAL — spawns nothing, reads no env, never throws. This is the whole
 * decision surface of the policy, so it is fully unit-testable.
 *
 * Selection rules:
 *   1. `forceSoftware` ⇒ always the software vector (byte-reproducible mode).
 *   2. `h264` + `h264Videotoolbox` available ⇒ `h264_videotoolbox`.
 *   3. Everything else (h265, vp9, or no VideoToolbox) ⇒ the software vector.
 *
 * Quality mapping:
 *   • quality mode → `-crf 18` (libx264/libx265), `-crf 18 -b:v 0` (libvpx-vp9,
 *     which needs an explicit zero bitrate for constant quality),
 *     `-q:v 55` (VideoToolbox).
 *   • bitrate mode → `-b:v <kbps>k` on BOTH paths.
 *
 * `-pix_fmt yuv420p` is always emitted (broadest player/browser compatibility),
 * and `-movflags +faststart` is emitted for mp4 outputs so the artifact starts
 * playing before it is fully buffered.
 *
 * @param request     What this render needs (codec family + quality target).
 * @param capabilities What the ffmpeg binary can do (from detection).
 * @param overrides   Resolved env overrides.
 * @returns The chosen encoder and its argument vector.
 */
export function selectVideoEncoderArgs(
  request: VideoEncoderRequest,
  capabilities: EncoderCapabilities = SOFTWARE_ONLY_CAPABILITIES,
  overrides: EncoderPolicyOverrides = resolveEncoderPolicyOverrides({}),
): VideoEncoderSelection {
  const family: VideoCodecFamily = request.codecFamily ?? 'h264';
  const faststart = request.faststart !== false;
  const target = request.target ?? { mode: 'quality' as const };

  const useHardware =
    overrides.forceSoftware !== true &&
    family === 'h264' &&
    capabilities.h264Videotoolbox === true;

  // A bitrate target is only honoured when it is a usable positive number;
  // anything else degrades to constant quality rather than emitting `-b:v NaNk`.
  const bitrateKbps =
    target.mode === 'bitrate' && Number.isFinite(target.videoBitrateKbps)
      ? Math.max(1, Math.round(target.videoBitrateKbps))
      : null;

  const encoder = useHardware ? 'h264_videotoolbox' : softwareEncoderFor(family);
  const args: string[] = ['-c:v', encoder];

  if (useHardware) {
    if (bitrateKbps !== null) {
      args.push('-b:v', `${bitrateKbps}k`);
    } else {
      args.push('-q:v', String(overrides.hardwareQuality));
    }
    // Let VideoToolbox fall back to its own software encoder if a hardware
    // session cannot be created at runtime (headless VM, exhausted sessions)
    // instead of failing the whole render.
    args.push('-allow_sw', '1');
  } else {
    // `-preset` is an x264/x265 private option; libvpx-vp9 rejects it.
    if (family !== 'vp9') args.push('-preset', overrides.softwarePreset);
    if (bitrateKbps !== null) {
      args.push('-b:v', `${bitrateKbps}k`);
    } else {
      args.push('-crf', String(SOFTWARE_QUALITY_CRF));
      if (family === 'vp9') args.push('-b:v', '0');
    }
    if (overrides.softwareThreads > 0) {
      args.push('-threads', String(overrides.softwareThreads));
    }
  }

  args.push('-pix_fmt', 'yuv420p');
  if (faststart) args.push('-movflags', '+faststart');

  return { encoder, hardware: useHardware, args };
}

// ---------------------------------------------------------------------------
// Impure: one-shot capability detection (cached, never throws)
// ---------------------------------------------------------------------------

/**
 * Probes the ffmpeg binary and returns its `-encoders` listing. Injectable so
 * detection can be tested without spawning anything.
 */
export type EncoderProber = () => string;

/** Process-wide cache; `null` until the first detection has completed. */
let cachedCapabilities: EncoderCapabilities | null = null;

/**
 * Default prober: runs `ffmpeg -hide_banner -encoders` ONCE, synchronously, with
 * a hard timeout. Synchronous on purpose — the command builders that consume the
 * policy are synchronous pure functions, and this runs at most once per process
 * (~50ms for the bundled binary), so it cannot become a hot path.
 */
function defaultEncoderProber(): string {
  const bin = (ffmpegStatic as unknown as string | null) ?? 'ffmpeg';
  return execFileSync(bin, ['-hide_banner', '-encoders'], {
    encoding: 'utf8',
    timeout: DETECTION_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Detect (once per process) which hardware encoders the ffmpeg binary provides.
 *
 * NEVER THROWS. A missing binary, a non-zero exit, a timeout, a thrown prober, or
 * garbage output all resolve to {@link SOFTWARE_ONLY_CAPABILITIES}, so the worst
 * case is the old software behaviour rather than a failed render.
 *
 * @param prober Optional injected prober (tests); defaults to `ffmpeg -encoders`.
 * @param log    Optional logger (string-first).
 * @returns The cached capability set.
 */
export function detectEncoderCapabilities(
  prober: EncoderProber = defaultEncoderProber,
  log: Pick<typeof defaultLogger, 'info' | 'warn'> = defaultLogger,
): EncoderCapabilities {
  if (cachedCapabilities !== null) return cachedCapabilities;

  let capabilities: EncoderCapabilities = SOFTWARE_ONLY_CAPABILITIES;
  try {
    const listing = prober();
    if (typeof listing === 'string' && listing.length > 0) {
      capabilities = {
        h264Videotoolbox: /(^|\s)h264_videotoolbox(\s|$)/m.test(listing),
      };
    }
    log?.info?.(
      `[${COMPONENT}] encoder capability detection complete: h264_videotoolbox=${capabilities.h264Videotoolbox}`,
      { component: COMPONENT, h264Videotoolbox: capabilities.h264Videotoolbox },
    );
  } catch (error) {
    log?.warn?.(
      `[${COMPONENT}] encoder capability detection failed, falling back to software encoding: ${(error as Error)?.message ?? 'unknown error'}`,
      { component: COMPONENT },
    );
    capabilities = SOFTWARE_ONLY_CAPABILITIES;
  }

  cachedCapabilities = capabilities;
  return capabilities;
}

/**
 * Reset the process-wide detection cache. Test-only seam — production code calls
 * {@link detectEncoderCapabilities} exactly once and keeps the result.
 */
export function resetEncoderCapabilitiesCache(): void {
  cachedCapabilities = null;
}

/**
 * Convenience wrapper used by the render sites: detect capabilities (cached),
 * read the env overrides, and return the encoder argument vector.
 *
 * Deterministic for a fixed environment; see the DETERMINISM CONTRACT in the file
 * header for what that does and does not guarantee about output bytes.
 *
 * @param request What this render needs.
 * @returns The ordered video-encoder args to splice into the ffmpeg command.
 */
export function resolveVideoEncoderArgs(request: VideoEncoderRequest): string[] {
  const overrides = resolveEncoderPolicyOverrides();
  const capabilities = overrides.forceSoftware
    ? SOFTWARE_ONLY_CAPABILITIES
    : detectEncoderCapabilities();
  return selectVideoEncoderArgs(request, capabilities, overrides).args;
}
