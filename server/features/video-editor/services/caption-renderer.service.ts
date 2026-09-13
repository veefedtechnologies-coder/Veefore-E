/**
 * Caption_Renderer — deterministic FFmpeg burn-in service (task 13.3,
 * Req 11.3, 11.7, 11.8).
 *
 * This is the IO-bearing shell that turns the layout decisions made by the pure
 * `caption-layout.logic.ts` core into a real, deterministically burned-in video.
 * It owns three responsibilities and delegates every layout *decision* (timing
 * granularity, wrapping, safe-area placement, contrast treatment) to the pure
 * core:
 *
 *   1. Deterministic burn-in (Req 11.3). `buildCaptionBurnInCommand` derives an
 *      FFmpeg `drawtext` filter chain and argument vector from the laid-out
 *      captions, the target `Platform_Preset`, the resolved typography, and the
 *      output dimensions — with a stable caption ordering, fixed number
 *      formatting, fixed escaping, and a fixed encoder vector resolved from the
 *      single `ffmpeg-encoder-policy.ts`. Two calls with the same captions +
 *      preset + typography produce a byte-identical COMMAND.
 *
 *      DETERMINISM CONTRACT: ARGUMENT construction is always deterministic. Output
 *      BYTES are only reproducible on the software encoder path — the policy may
 *      select a hardware encoder (VideoToolbox, ~3x faster wall / ~10x cheaper CPU),
 *      which is not bit-exact across runs. Set
 *      `VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE=true` when byte-for-byte reproducible
 *      burn-in output is required.
 *
 *   2. Brand typography with default fallback (Req 11.7, 11.8). `resolveTypography`
 *      applies the workspace brand typography WHERE it is defined; if loading the
 *      brand font fails (missing/unreadable file), it falls back to the default
 *      typography from the single-source config AND surfaces an indication that the
 *      fallback occurred, rather than failing caption generation.
 *
 *   3. Running the burn-in (`renderCaptions`). Computes layout via the pure core's
 *      `layoutCaptions`, builds the deterministic command, and executes it through
 *      an injectable FFmpeg runner (defaulting to `fluent-ffmpeg` + `ffmpeg-static`).
 *
 * Every preset/brand value (safe area, max chars-per-line, placement, min
 * contrast, default font family/style) flows from `video-editor.config.ts` via the
 * pure core — this module hardcodes none of them (Req 13.1). The only local
 * constants are deterministic rendering heuristics (default font-size fraction,
 * scrim opacity), not preset values.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Side-effect: point fluent-ffmpeg at the bundled ffmpeg/ffprobe binaries so the
// animated (libass) burn-in runs with the same bundled binary as everything else.
import '../../../config/ffmpeg-paths';
import { logger as defaultLogger } from '../../../config/logger';
import { resolveVideoEncoderArgs } from './ffmpeg-encoder-policy';
import {
  BRAND_DEFAULTS,
  getPlatformPreset,
  type BrandDefaults,
  type PlatformPreset,
} from '../config/video-editor.config';
import {
  layoutCaptions,
  captionLayoutConfigFromPreset,
  parseHexColor,
  type CaptionSegment,
  type LaidOutCaption,
} from './caption-layout.logic';
import {
  buildCaptionAss,
  getAssPreset,
  DEFAULT_ASS_PRESET_KEY,
} from './caption-ass.logic';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Typography types (Req 11.7, 11.8)
// ---------------------------------------------------------------------------

/**
 * Fully-resolved caption typography used to build the deterministic burn-in
 * command. `fontFile` is an absolute path to a font file consumed by FFmpeg
 * `drawtext` (`fontfile=`); when it is empty the fontconfig family name is used
 * (`font=`) instead, so the command remains valid without a bundled font.
 */
export interface CaptionTypography {
  /** Font family name (used for `font=` when no `fontFile` is available). */
  fontFamily: string;
  /** Absolute path to the font file for `drawtext fontfile=` (may be empty). */
  fontFile: string;
  /** Font size as a fraction (0..1) of the output frame HEIGHT (deterministic). */
  fontSizeFrac: number;
  /** Caption style token carried from the brand profile. */
  style: BrandDefaults['captionStyle'];
}

/**
 * Workspace brand typography, as it may be defined on a workspace brand profile.
 * Any field may be absent; a defined `fontFile` is the thing that can "fail to
 * load" and trigger the default fallback (Req 11.8).
 */
export interface WorkspaceBrandTypography {
  fontFamily?: string;
  fontFile?: string;
  fontSizeFrac?: number;
  style?: BrandDefaults['captionStyle'];
}

/** The result of resolving typography, including the fallback indication (Req 11.8). */
export interface TypographyResolution {
  /** The typography that WILL be applied (brand or default). */
  typography: CaptionTypography;
  /** True iff defined brand typography failed to load and the default was used. */
  fallbackApplied: boolean;
  /** Human-readable indication of why the fallback occurred (Req 11.8). */
  fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

/** Output frame dimensions the burn-in positions/sizes captions against. */
export interface CaptionRenderDimensions {
  width: number;
  height: number;
}

/** Inputs to the deterministic burn-in command builder. */
export interface CaptionBurnInCommandInput {
  /** Laid-out captions from the pure core (already wrapped/placed/contrasted). */
  captions: readonly LaidOutCaption[];
  /** Resolved typography (brand or default). */
  typography: CaptionTypography;
  /** Output frame dimensions. */
  dimensions: CaptionRenderDimensions;
  /** Source video path FFmpeg reads (unmodified). */
  inputPath: string;
  /** Destination path for the burned-in output. */
  outputPath: string;
  /**
   * Explicit video-encoder args, bypassing `ffmpeg-encoder-policy.ts`. Lets tests
   * assert policy behaviour (forced-software vs hardware) without touching env or
   * spawning a capability probe. Production callers omit this.
   */
  videoEncoderArgs?: readonly string[];
}

/**
 * A deterministic FFmpeg burn-in invocation derived purely from its inputs. The
 * same captions + preset + typography + dimensions always yield an identical
 * `args` vector and `videoFilter` (Req 11.3).
 */
export interface CaptionBurnInCommand {
  /** Full FFmpeg argument vector (excludes the `ffmpeg` binary). */
  args: string[];
  /** The `-vf` drawtext filter chain (also present inside `args`). */
  videoFilter: string;
  /** Fixed output encoder options (also present inside `args`). */
  outputOptions: string[];
  inputPath: string;
  outputPath: string;
}

// ---------------------------------------------------------------------------
// Deterministic rendering heuristics (NOT preset values)
// ---------------------------------------------------------------------------

/** Default caption font size as a fraction of frame height (deterministic). */
const DEFAULT_FONT_SIZE_FRAC = 0.05;

/** Scrim (contrast-treatment box) opacity applied behind caption text. */
const SCRIM_OPACITY = 0.6;

/** Scrim box border width as a fraction of the font size (deterministic). */
const SCRIM_BORDER_FRAC = 0.25;

// ---------------------------------------------------------------------------
// Typography resolution (Req 11.7, 11.8)
// ---------------------------------------------------------------------------

/** Build the default typography from the single-source brand defaults (Req 13.1). */
function defaultTypography(defaultFontFile: string, brand: BrandDefaults): CaptionTypography {
  return {
    fontFamily: brand.captionFontFamily,
    fontFile: typeof defaultFontFile === 'string' ? defaultFontFile : '',
    fontSizeFrac: DEFAULT_FONT_SIZE_FRAC,
    style: brand.captionStyle,
  };
}

/** Does a font file exist and is it readable? (default font loader). */
function defaultFontLoader(fontFile: string): boolean {
  try {
    fs.accessSync(fontFile, fs.constants.R_OK);
    const stat = fs.statSync(fontFile);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the typography to apply for captions (Req 11.7, 11.8).
 *
 * - WHERE the workspace defines brand typography (Req 11.7), it is applied. A
 *   defined brand `fontFile` is validated via `fontLoader`.
 * - IF the brand font fails to load (Req 11.8), the default typography is used
 *   AND `fallbackApplied` is set with a `fallbackReason` indication — caption
 *   generation is NEVER failed because of a bad brand font.
 * - When no brand typography is defined, the default typography is used with NO
 *   fallback indication (nothing failed).
 */
export function resolveTypography(
  brandTypography: WorkspaceBrandTypography | undefined | null,
  options: {
    defaultFontFile?: string;
    brand?: BrandDefaults;
    fontLoader?: (fontFile: string) => boolean;
  } = {},
): TypographyResolution {
  const brand = options.brand ?? BRAND_DEFAULTS;
  const defaultFontFile = options.defaultFontFile ?? '';
  const fontLoader = options.fontLoader ?? defaultFontLoader;
  const fallback = defaultTypography(defaultFontFile, brand);

  // No brand typography defined → default, no fallback indication (Req 11.7 is
  // conditional on the workspace DEFINING brand typography).
  const hasBrandTypography =
    !!brandTypography &&
    (brandTypography.fontFile != null ||
      brandTypography.fontFamily != null ||
      brandTypography.fontSizeFrac != null ||
      brandTypography.style != null);
  if (!hasBrandTypography) {
    return { typography: fallback, fallbackApplied: false };
  }

  // A brand font file is defined → it must load; a failure triggers fallback +
  // indication (Req 11.8).
  const brandFontFile = brandTypography!.fontFile;
  if (typeof brandFontFile === 'string' && brandFontFile.length > 0) {
    let loaded = false;
    try {
      loaded = fontLoader(brandFontFile) === true;
    } catch {
      loaded = false;
    }
    if (!loaded) {
      return {
        typography: fallback,
        fallbackApplied: true,
        fallbackReason: `Workspace brand font could not be loaded ("${brandFontFile}"); rendered captions with default typography.`,
      };
    }
    return {
      typography: {
        fontFamily: brandTypography!.fontFamily ?? brand.captionFontFamily,
        fontFile: brandFontFile,
        fontSizeFrac:
          typeof brandTypography!.fontSizeFrac === 'number' && brandTypography!.fontSizeFrac > 0
            ? brandTypography!.fontSizeFrac
            : DEFAULT_FONT_SIZE_FRAC,
        style: brandTypography!.style ?? brand.captionStyle,
      },
      fallbackApplied: false,
    };
  }

  // Brand typography defined without a font file (family/size/style only): apply
  // it over the defaults; there is no font file to fail to load.
  return {
    typography: {
      fontFamily: brandTypography!.fontFamily ?? brand.captionFontFamily,
      fontFile: fallback.fontFile,
      fontSizeFrac:
        typeof brandTypography!.fontSizeFrac === 'number' && brandTypography!.fontSizeFrac > 0
          ? brandTypography!.fontSizeFrac
          : DEFAULT_FONT_SIZE_FRAC,
      style: brandTypography!.style ?? brand.captionStyle,
    },
    fallbackApplied: false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic drawtext command generation (Req 11.3)
// ---------------------------------------------------------------------------

/** Format whole milliseconds as a fixed-precision seconds timestamp (3 dp). */
function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * Convert a caption `#RRGGBB` color to FFmpeg's `0xRRGGBB` form deterministically.
 * Unparseable colors fall back to opaque white/black so the command is total.
 */
function toFfmpegColor(hex: string, fallbackHex: string): string {
  const rgb = parseHexColor(hex) ?? parseHexColor(fallbackHex) ?? [255, 255, 255];
  const [r, g, b] = rgb;
  const hh = (n: number) => n.toString(16).padStart(2, '0');
  return `0x${hh(r)}${hh(g)}${hh(b)}`;
}

/**
 * Escape a caption text value for use inside an FFmpeg `drawtext` `text=` option
 * within a single `-vf` filtergraph argument. The escaping is fixed and
 * deterministic so identical text always yields identical command bytes.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * A total ordering over laid-out captions that depends ONLY on caption data,
 * giving a stable filter order regardless of input order — a prerequisite for a
 * byte-identical command from identical captions (Req 11.3). Ordered by start,
 * then end, then joined text.
 */
function compareCaptions(a: LaidOutCaption, b: LaidOutCaption): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  const at = a.lines.join('\n');
  const bt = b.lines.join('\n');
  if (at !== bt) return at < bt ? -1 : 1;
  return 0;
}

/** Build a single deterministic `drawtext` filter for one laid-out caption. */
function buildDrawtextFilter(
  caption: LaidOutCaption,
  typography: CaptionTypography,
  dimensions: CaptionRenderDimensions,
): string | null {
  if (!caption.lines || caption.lines.length === 0) return null;

  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));

  const fontSize = Math.max(1, Math.round(typography.fontSizeFrac * height));
  const x = Math.round(caption.boundingBox.xFrac * width);
  const y = Math.round(caption.boundingBox.yFrac * height);

  const text = escapeDrawtext(caption.lines.join('\n'));
  const fontColor = toFfmpegColor(caption.contrast.textColorHex, '#FFFFFF');

  // Font source: prefer an explicit fontfile for deterministic glyphs; fall back
  // to a fontconfig family name when no file is available.
  const fontOption =
    typography.fontFile && typography.fontFile.length > 0
      ? `fontfile='${typography.fontFile.replace(/'/g, "\\'")}'`
      : `font='${(typography.fontFamily || 'sans').replace(/'/g, "\\'")}'`;

  const parts = [
    `text='${text}'`,
    fontOption,
    `fontcolor=${fontColor}`,
    `fontsize=${fontSize}`,
    `x=${x}`,
    `y=${y}`,
  ];

  // Contrast treatment: when the pure core applied a scrim, render an opaque box
  // behind the text using the treated background so the ≥4.5:1 ratio holds (Req 11.6).
  if (caption.contrast.treatmentApplied) {
    const boxColor = toFfmpegColor(caption.contrast.backgroundColorHex, '#000000');
    const boxBorder = Math.max(1, Math.round(fontSize * SCRIM_BORDER_FRAC));
    parts.push('box=1', `boxcolor=${boxColor}@${SCRIM_OPACITY.toFixed(2)}`, `boxborderw=${boxBorder}`);
  }

  // Enable window: show the caption only during its cue window (fixed 3 dp).
  parts.push(`enable='between(t,${msToSeconds(caption.startMs)},${msToSeconds(caption.endMs)})'`);

  return `drawtext=${parts.join(':')}`;
}

/**
 * Build the deterministic FFmpeg caption burn-in command (Req 11.3).
 *
 * The captions are consumed in a stable, data-derived order and every value
 * (position, size, color, timing, escaping) is fixed, and the encoder vector comes
 * from the process-wide `ffmpeg-encoder-policy.ts` decision, so two calls with
 * identical inputs produce an identical `args` vector.
 *
 * Video is re-encoded (the policy picks the encoder — hardware VideoToolbox when
 * available, libx264 otherwise) because burning captions modifies frames; audio is
 * stream-copied so the voice stays byte-identical (Req 12.4). Output BYTES are
 * reproducible only on the software path; see the file header.
 */
export function buildCaptionBurnInCommand(input: CaptionBurnInCommandInput): CaptionBurnInCommand {
  const { captions, typography, dimensions, inputPath, outputPath } = input;

  const ordered = [...captions].sort(compareCaptions);
  const filters = ordered
    .map((c) => buildDrawtextFilter(c, typography, dimensions))
    .filter((f): f is string => f !== null);

  // Empty caption set → identity copy filter, so the command is always valid and
  // deterministic even with nothing to draw.
  const videoFilter = filters.length > 0 ? filters.join(',') : 'null';

  // Encoder options from the single policy (never per-call tuning). Audio is
  // stream-copied so the voice bytes are untouched by the burn-in.
  const outputOptions = [
    ...(input.videoEncoderArgs
      ? [...input.videoEncoderArgs]
      : resolveVideoEncoderArgs({ target: { mode: 'quality' } })),
    '-c:a',
    'copy',
  ];

  const args = ['-y', '-hide_banner', '-nostdin', '-i', inputPath, '-vf', videoFilter, ...outputOptions, outputPath];

  return { args, videoFilter, outputOptions, inputPath, outputPath };
}

/** The command as a single shell-style string (deterministic; mirrors `args`). */
export function captionBurnInCommandToString(command: CaptionBurnInCommand): string {
  return ['ffmpeg', ...command.args].join(' ');
}

// ---------------------------------------------------------------------------
// Service (IO shell)
// ---------------------------------------------------------------------------

/** Runs a built burn-in command against FFmpeg. Injectable for testing. */
export type CaptionFfmpegRunner = (command: CaptionBurnInCommand) => Promise<void>;

/** Burns an ASS subtitle file onto a video with libass. Injectable for testing. */
export type AnimatedCaptionRunner = (input: {
  inputPath: string;
  outputPath: string;
  assPath: string;
}) => Promise<void>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface CaptionRendererServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Absolute path to the bundled default caption font (fallback typography). */
  defaultFontFile?: string;
  /** Brand defaults source (defaults to single-source config). */
  brand?: BrandDefaults;
  /** Font-load predicate for brand-font validation (Req 11.8). */
  fontLoader?: (fontFile: string) => boolean;
  /** FFmpeg runner; defaults to a `fluent-ffmpeg` + `ffmpeg-static` runner. */
  runner?: CaptionFfmpegRunner;
  /** Animated (libass ASS) runner; defaults to a `fluent-ffmpeg` runner. */
  animatedRunner?: AnimatedCaptionRunner;
  /**
   * Detects whether the ffmpeg build exposes the libass `subtitles` filter.
   * Defaults to probing `ffmpeg -hide_banner -filters` once (cached). Injectable
   * so tests can force the fallback path without a real ffmpeg build.
   */
  libassProbe?: (ffmpegPath: string | null) => Promise<boolean>;
  /** Base directory for temporary `.ass` working files (defaults to OS temp). */
  tempDir?: string;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
}

/** Request to burn captions into a video. */
export interface RenderCaptionsRequest {
  /** Transcript/caption segments (word- or segment-level timing). */
  segments: readonly CaptionSegment[];
  /** Target platform preset key (drives safe area, wrapping, placement). */
  presetKey: string;
  /** Source video path (read unmodified). */
  inputPath: string;
  /** Destination path for the burned-in output. */
  outputPath: string;
  /** Output frame dimensions. */
  dimensions: CaptionRenderDimensions;
  /** Optional workspace brand typography (Req 11.7). */
  brandTypography?: WorkspaceBrandTypography | null;
  /** Optional real workspace brand caption colors (override brand defaults). */
  colors?: { textColorHex?: string; backgroundColorHex?: string };
  /**
   * Choose the PROFESSIONAL ANIMATED word-level caption path (ASS + libass) over
   * the legacy static `drawtext` burn-in. When `true`, {@link CaptionRendererService.renderCaptions}
   * delegates to {@link CaptionRendererService.renderAnimatedCaptions}. Omitted /
   * `false` preserves the legacy deterministic static path (back-compat).
   */
  animated?: boolean;
  /**
   * Animated-caption style preset key (`bold_pop` | `clean_minimal` |
   * `karaoke_box`). Defaults to `bold_pop`. Ignored on the static path.
   */
  assPresetKey?: string;
}

/**
 * Result of an ANIMATED (ASS + libass) caption burn-in. Distinct from the static
 * {@link RenderCaptionsResult} because the animated path is driven by an ASS
 * document rather than a `drawtext` command. When the bundled ffmpeg lacks the
 * libass `subtitles` filter, the renderer transparently falls back to the static
 * `drawtext` path and reports it here (`mode: 'static-fallback'`) — captions are
 * NEVER silently dropped.
 */
export interface AnimatedRenderCaptionsResult {
  /** The output path written by FFmpeg. */
  outputPath: string;
  /** `animated` when libass burned the ASS; `static-fallback` when it degraded. */
  mode: 'animated' | 'static-fallback';
  /** The animated-caption preset key used. */
  assPresetKey: string;
  /** The generated ASS document (also written to the temp `.ass` file). */
  assDocument: string;
  /** Number of `Dialogue:` events in the ASS document. */
  dialogueCount: number;
  /** Whether the bundled ffmpeg supports the libass `subtitles` filter. */
  libassSupported: boolean;
  /** Set when the static fallback was used, explaining why. */
  fallbackReason?: string;
}

/** Result of a caption burn-in render. */
export interface RenderCaptionsResult {
  /** The output path written by FFmpeg. */
  outputPath: string;
  /** The deterministic command that was executed. */
  command: CaptionBurnInCommand;
  /** The laid-out captions used (from the pure core). */
  captions: LaidOutCaption[];
  /** The typography applied. */
  typography: CaptionTypography;
  /** True iff brand typography failed to load and the default was used (Req 11.8). */
  typographyFallbackApplied: boolean;
  /** Indication surfaced when the fallback occurred (Req 11.8). */
  typographyFallbackReason?: string;
}

/**
 * Deterministic Caption_Renderer service (Req 11.3, 11.7, 11.8). Computes layout
 * with the pure core, resolves brand typography (default fallback + indication on
 * failure), builds a deterministic burn-in command, and executes it via FFmpeg.
 */
export class CaptionRendererService {
  private readonly log: CaptionRendererServiceDeps['logger'];
  private readonly defaultFontFile: string;
  private readonly brand: BrandDefaults;
  private readonly fontLoader: (fontFile: string) => boolean;
  private readonly runner: CaptionFfmpegRunner;
  private readonly animatedRunner: AnimatedCaptionRunner;
  private readonly libassProbe: (ffmpegPath: string | null) => Promise<boolean>;
  private readonly tempDir: string;
  private readonly ffmpegPath: string | null;
  /** Cached libass-support probe result (probed at most once per instance). */
  private libassSupportCache: boolean | null = null;

  constructor(deps: CaptionRendererServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.defaultFontFile = deps.defaultFontFile ?? process.env.VIDEO_EDITOR_DEFAULT_FONT ?? '';
    this.brand = deps.brand ?? BRAND_DEFAULTS;
    this.fontLoader = deps.fontLoader ?? defaultFontLoader;
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor-ass');
    this.runner = deps.runner ?? this.createDefaultRunner();
    this.animatedRunner = deps.animatedRunner ?? this.createDefaultAnimatedRunner();
    this.libassProbe = deps.libassProbe ?? defaultLibassProbe;
  }

  /**
   * Resolve the typography that would be applied for a render, including the
   * fallback indication (Req 11.7, 11.8). Exposed so callers can surface the
   * indication independently of executing a render.
   */
  resolveTypography(brandTypography?: WorkspaceBrandTypography | null): TypographyResolution {
    return resolveTypography(brandTypography, {
      defaultFontFile: this.defaultFontFile,
      brand: this.brand,
      fontLoader: this.fontLoader,
    });
  }

  /**
   * Compute layout (pure core), resolve typography, and build the deterministic
   * burn-in command WITHOUT executing FFmpeg. Useful for tests and for the
   * Render_Engine to compose commands deterministically.
   */
  buildCommand(request: RenderCaptionsRequest): {
    command: CaptionBurnInCommand;
    captions: LaidOutCaption[];
    resolution: TypographyResolution;
  } {
    const preset = this.requirePreset(request.presetKey);
    const layoutConfig = captionLayoutConfigFromPreset(preset, this.brand, request.colors);
    const captions = layoutCaptions(request.segments, layoutConfig);
    const resolution = this.resolveTypography(request.brandTypography ?? null);

    const command = buildCaptionBurnInCommand({
      captions,
      typography: resolution.typography,
      dimensions: request.dimensions,
      inputPath: request.inputPath,
      outputPath: request.outputPath,
    });

    return { command, captions, resolution };
  }

  /**
   * Burn captions into the source video. When `request.animated` is `true`,
   * delegates to the PROFESSIONAL ANIMATED word-level path
   * ({@link renderAnimatedCaptions}); otherwise runs the legacy deterministic
   * static `drawtext` burn-in (back-compat).
   */
  async renderCaptions(
    request: RenderCaptionsRequest,
  ): Promise<RenderCaptionsResult | AnimatedRenderCaptionsResult> {
    if (request.animated === true) {
      return this.renderAnimatedCaptions(request);
    }
    return this.renderStaticCaptions(request);
  }

  /**
   * Legacy deterministic static caption burn-in (Req 11.3), applying brand
   * typography with default fallback + indication on failure (Req 11.7, 11.8).
   * Retained for back-compat and used as the fallback when libass is unavailable.
   */
  async renderStaticCaptions(request: RenderCaptionsRequest): Promise<RenderCaptionsResult> {
    const { command, captions, resolution } = this.buildCommand(request);

    if (resolution.fallbackApplied) {
      this.log?.warn?.('Caption brand typography fallback applied', {
        component: 'CaptionRendererService',
        presetKey: request.presetKey,
        reason: resolution.fallbackReason,
      });
    }

    await this.runner(command);

    return {
      outputPath: command.outputPath,
      command,
      captions,
      typography: resolution.typography,
      typographyFallbackApplied: resolution.fallbackApplied,
      typographyFallbackReason: resolution.fallbackReason,
    };
  }

  /**
   * Burn PROFESSIONAL ANIMATED word-level captions (CapCut / Opus / Hormozi
   * style) onto the source video with a generated ASS document + ffmpeg's libass
   * `subtitles` filter — big bold outlined text, a word-by-word active-word
   * highlight (colour swap + subtle pop), and safe-area placement.
   *
   * The ASS document is built PURELY by {@link buildCaptionAss} and written to a
   * temp `.ass` file; ffmpeg re-encodes the video with the encoder vector from
   * `ffmpeg-encoder-policy.ts` and stream-copies the audio, matching the static
   * path's quality settings exactly.
   *
   * If the bundled ffmpeg lacks the libass `subtitles` filter, this DETECTS that
   * and transparently falls back to the static `drawtext` path
   * ({@link renderStaticCaptions}) — captions are never silently dropped — and
   * reports the fallback in the result (`mode: 'static-fallback'`).
   */
  async renderAnimatedCaptions(
    request: RenderCaptionsRequest,
  ): Promise<AnimatedRenderCaptionsResult> {
    const preset = getAssPreset(request.assPresetKey ?? DEFAULT_ASS_PRESET_KEY);
    const assDocument = buildCaptionAss(request.segments, preset, request.dimensions);
    const dialogueCount = (assDocument.match(/^Dialogue:/gm) ?? []).length;

    // Detect libass support once (cached). No support → honest static fallback.
    const libassSupported = await this.detectLibassSupport();
    if (!libassSupported) {
      const fallbackReason =
        'The bundled ffmpeg build does not expose the libass "subtitles" filter; rendered captions with the static drawtext path instead.';
      this.log?.warn?.('libass unavailable; falling back to static caption burn-in', {
        component: 'CaptionRendererService',
        presetKey: request.presetKey,
        assPresetKey: preset.key,
      });
      const legacy = await this.renderStaticCaptions(request);
      return {
        outputPath: legacy.outputPath,
        mode: 'static-fallback',
        assPresetKey: preset.key,
        assDocument,
        dialogueCount,
        libassSupported: false,
        fallbackReason,
      };
    }

    // Write the ASS to a temp file and burn it with libass.
    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const assPath = path.join(workDir, 'captions.ass');
    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      await fs.promises.writeFile(assPath, assDocument, 'utf8');
      await this.animatedRunner({
        inputPath: request.inputPath,
        outputPath: request.outputPath,
        assPath,
      });
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log?.warn?.('Failed to clean up animated caption temp dir', {
          component: 'CaptionRendererService',
          workDir,
        });
      });
    }

    this.log?.info?.('Animated captions burned in with libass', {
      component: 'CaptionRendererService',
      assPresetKey: preset.key,
      dialogueCount,
    });

    return {
      outputPath: request.outputPath,
      mode: 'animated',
      assPresetKey: preset.key,
      assDocument,
      dialogueCount,
      libassSupported: true,
    };
  }

  /** Probe (once, cached) whether the ffmpeg build exposes the libass filter. */
  private async detectLibassSupport(): Promise<boolean> {
    if (this.libassSupportCache !== null) return this.libassSupportCache;
    let supported = false;
    try {
      supported = await this.libassProbe(this.ffmpegPath);
    } catch {
      supported = false;
    }
    this.libassSupportCache = supported;
    return supported;
  }

  /** Resolve a preset from the single-source config or throw a clear error. */
  private requirePreset(presetKey: string): PlatformPreset {
    const preset = getPlatformPreset(presetKey);
    if (!preset) {
      throw new Error(`Unknown Platform_Preset "${presetKey}" for caption rendering`);
    }
    return preset;
  }

  /** Default runner: executes the built command via fluent-ffmpeg. */
  private createDefaultRunner(): CaptionFfmpegRunner {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return (command: CaptionBurnInCommand) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(command.inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .videoFilters(command.videoFilter)
          .outputOptions(command.outputOptions)
          .on('error', (err: Error) => {
            log?.error?.('Caption burn-in FFmpeg failed', err, {
              component: 'CaptionRendererService',
            });
            reject(err);
          })
          .on('end', () => resolve())
          .save(command.outputPath);
      });
  }

  /**
   * Default animated runner: burns the ASS file onto the input with the libass
   * `subtitles` filter via fluent-ffmpeg. Re-encodes video with the SAME encoder
   * vector as the static path (resolved from `ffmpeg-encoder-policy.ts`) and
   * stream-copies the audio so the voice stays byte-identical.
   */
  private createDefaultAnimatedRunner(): AnimatedCaptionRunner {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return ({ inputPath, outputPath, assPath }) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .videoFilters(`subtitles='${escapeSubtitlesPath(assPath)}'`)
          .outputOptions([
            ...resolveVideoEncoderArgs({ target: { mode: 'quality' } }),
            '-c:a',
            'copy',
          ])
          .on('error', (err: Error) => {
            log?.error?.('Animated caption burn-in FFmpeg failed', err, {
              component: 'CaptionRendererService',
            });
            reject(err);
          })
          .on('end', () => resolve())
          .save(outputPath);
      });
  }
}

/**
 * Escape a `.ass` file path for use inside ffmpeg's `subtitles='<path>'` filter
 * argument. Backslashes, single quotes, and colons are the characters that break
 * filtergraph parsing; escaping them keeps the value literal. (Windows drive
 * colons are not a concern on the mac/linux target, but the colon escape is
 * harmless and correct there too.)
 */
export function escapeSubtitlesPath(p: string): string {
  return (typeof p === 'string' ? p : '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

/**
 * Default libass-support probe: runs `ffmpeg -hide_banner -filters` once and
 * checks that the `subtitles` (and `ass`) filters are listed. Returns `false`
 * (rather than throwing) if ffmpeg is unavailable or the probe fails, so the
 * caller degrades to the static path honestly.
 */
async function defaultLibassProbe(ffmpegPath: string | null): Promise<boolean> {
  const bin = ffmpegPath ?? (ffmpegStatic as unknown as string | null);
  if (!bin) return false;
  try {
    const { stdout } = await execFileAsync(bin, ['-hide_banner', '-filters'], {
      maxBuffer: 8 * 1024 * 1024,
    });
    // fluent output lists one filter per line: "... subtitles         V->V ...".
    return /(^|\s)subtitles(\s|$)/m.test(stdout);
  } catch {
    return false;
  }
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const captionRendererService = new CaptionRendererService();
