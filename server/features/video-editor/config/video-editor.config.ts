/**
 * Video Editor — single-source configuration (Req 13.1, master §19).
 *
 * The ONE place Platform_Preset definitions and every tunable threshold for the
 * Veefore AI Video Editor live. Every consumer (Intent_Router, Editing_Planner,
 * Deterministic_Editor, Caption_Renderer, Quality_Controller, Render_Engine,
 * Media_Ingestion_Service, Video_Analysis_Service, Job_System) reads its values
 * from here, so changing a preset value or a threshold in this file changes the
 * value used everywhere with NO other code change (Req 13.1).
 *
 * NOTHING in the video-editor feature may hardcode these values. Provider-specific
 * limits (clip length, resolution, region availability) do NOT live here — those
 * are versioned capability metadata in the Provider_Capability_Registry (Req 7.x).
 *
 * The exported config is deep-frozen so a stray consumer cannot mutate shared
 * config at runtime; a preset change is a code change to this file, reviewed once.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A rectangular safe area expressed as fractional insets (0..1) from each edge
 * of the frame. Captions and key overlays must fall entirely within the area
 * bounded by these insets (Req 11.4).
 */
export interface SafeAreaInsets {
  /** Fraction of frame height kept clear at the top (0..1). */
  top: number;
  /** Fraction of frame height kept clear at the bottom (0..1). */
  bottom: number;
  /** Fraction of frame width kept clear on the left (0..1). */
  left: number;
  /** Fraction of frame width kept clear on the right (0..1). */
  right: number;
}

/** Where captions are anchored within the safe area for a preset. */
export type CaptionPlacement = 'top' | 'center' | 'bottom';

/** Per-preset caption behavior consumed by the Caption_Renderer (Req 11). */
export interface CaptionBehavior {
  /** Preferred vertical anchor within the safe area. */
  placement: CaptionPlacement;
  /** Maximum rendered characters per line before wrapping (Req 11.5). */
  maxCharsPerLine: number;
  /** Maximum simultaneously visible caption lines. */
  maxLines: number;
  /** Whether word-level highlight/karaoke styling is enabled when timing allows. */
  wordLevelHighlight: boolean;
}

/** Editing pace guidance the Editing_Planner uses when shaping a plan. */
export interface PacingRecommendation {
  /** Recommended minimum shot/scene length in milliseconds. */
  minShotMs: number;
  /** Recommended maximum shot/scene length in milliseconds. */
  maxShotMs: number;
  /** Recommended maximum time before a hook must land (ms). */
  hookByMs: number;
}

/** A concrete render/export profile (Req 15.1, 15.3, 15.4). */
export interface ExportProfile {
  /** Stable profile id, referenced by presets and the Render_Engine. */
  id: string;
  container: 'mp4' | 'webm' | 'mov';
  videoCodec: 'h264' | 'h265' | 'vp9';
  audioCodec: 'aac' | 'opus';
  width: number;
  height: number;
  fps: number;
  /** Target average video bitrate in kbps. */
  videoBitrateKbps: number;
  /** Target audio bitrate in kbps. */
  audioBitrateKbps: number;
  /** Minimum acceptable output size in bytes for render validation (Req 15.2). */
  minOutputBytes: number;
}

/** A Platform_Preset definition (Req 13.1, 13.2, master §19). */
export interface PlatformPreset {
  /** Stable key used to select the preset (e.g. 'instagram_reel'). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Aspect ratio as width:height (e.g. '9:16'). */
  aspectRatio: string;
  /** Recommended target duration in milliseconds. */
  recommendedDurationMs: number;
  /** Hard maximum duration in milliseconds the platform accepts. */
  maxDurationMs: number;
  /** Safe-area insets for captions/overlays. */
  safeArea: SafeAreaInsets;
  /** Caption placement/wrapping behavior. */
  caption: CaptionBehavior;
  /** Pacing recommendations. */
  pacing: PacingRecommendation;
  /** Export profile id (must exist in EXPORT_PROFILES). */
  exportProfileId: string;
}

/** Brand-aware editing defaults applied when a workspace brand profile is absent
 * or incomplete (Req 13.4, 13.5, master §20). Real workspace brand values, when
 * present, override these. */
export interface BrandDefaults {
  primaryColorHex: string;
  secondaryColorHex: string;
  captionFontFamily: string;
  captionStyle: 'modern' | 'classic' | 'bold' | 'minimal';
  /** Minimum text-to-background contrast ratio for captions (Req 11.6). */
  minContrastRatio: number;
}

/** Audio loudness/true-peak targets (Req 12.1). */
export interface AudioTargets {
  /** Integrated loudness target in LUFS. */
  integratedLoudnessLufs: number;
  /** Allowed tolerance around the loudness target in LU (Req 12.1). */
  loudnessToleranceLu: number;
  /** True-peak ceiling in dBTP that output must not exceed (Req 12.1). */
  truePeakCeilingDbtp: number;
}

/** Silence detection thresholds (Req 4.5, master §17). */
export interface SilenceThresholds {
  /** Loudness threshold below which audio counts toward silence (dB). */
  thresholdDb: number;
  /** Minimum continuous duration below threshold to classify as silence (ms). */
  minDurationMs: number;
}

/** Quality-control classification and repair thresholds (Req 14). */
export interface QualityControlThresholds {
  /** Black-frame sequence ≥ this many ms is a quality failure (Req 14.3a). */
  blackFrameMinMs: number;
  /** Frozen-frame sequence ≥ this many ms is a quality failure (Req 14.3b). */
  frozenFrameMinMs: number;
  /** Duration mismatch tolerance in ms; beyond this is a failure (Req 14.3d, 15.4). */
  durationToleranceMs: number;
  /** Frame-rate tolerance in fps for render validation (Req 15.4). */
  fpsTolerance: number;
  /** Fraction of frame area (0..1) of visual artifacts that is a failure (Req 14.3e). */
  artifactAreaFraction: number;
  /** Maximum repair attempts per operation before final fallback (Req 14.5). */
  maxRepairAttempts: number;
}

/** Media ingestion validation limits (Req 3.1–3.4, 3.10). */
export interface IngestionLimits {
  /** Minimum accepted upload size in bytes (inclusive). */
  minSizeBytes: number;
  /** Maximum accepted upload size in bytes (inclusive) — 10,240 MB. */
  maxSizeBytes: number;
  /** Uploads larger than this use resumable object-storage upload (Req 3.10). */
  resumableThresholdBytes: number;
  /** Accepted container formats (validated against byte signature, Req 3.2, 3.3). */
  acceptedContainers: readonly string[];
  /** Minimum interval at which ingestion progress must update (ms, Req 3.11). */
  progressUpdateIntervalMs: number;
}

/** Asynchronous job-system limits (Req 18). */
export interface JobLimits {
  /** Default per-job timeout in seconds (must be ≤ maxTimeoutSec, Req 18.3). */
  defaultTimeoutSec: number;
  /** Hard maximum job timeout in seconds (Req 18.3). */
  maxTimeoutSec: number;
  /** Maximum execution attempts per job (Req 18.7, 18.9). */
  maxAttempts: number;
  /** Time budget in ms within which a cancellation must take effect (Req 18.5). */
  cancellationDeadlineMs: number;
  /** Maximum cleanup retry attempts on cancellation/terminal state (Req 18.6, 20.7). */
  maxCleanupRetries: number;
  /** Seconds within which temp working files are removed after terminal state (Req 20.5). */
  tempFileTtlSec: number;
}

/** The full video-editor configuration surface. */
export interface VideoEditorConfig {
  /** Intent confidence threshold on a 0..1 scale (Req 2.6). */
  confidenceThreshold: number;
  presets: Readonly<Record<string, PlatformPreset>>;
  exportProfiles: Readonly<Record<string, ExportProfile>>;
  brandDefaults: BrandDefaults;
  audioTargets: AudioTargets;
  silence: SilenceThresholds;
  qualityControl: QualityControlThresholds;
  ingestion: IngestionLimits;
  job: JobLimits;
  /** Maximum number of variants creatable in one request (Req 16.9, 16.10). */
  maxVariantsPerRequest: number;
  /**
   * Hard maximum validity, in seconds, of any artifact Signed_URL the editor
   * issues (Req 19.3). Artifact bytes are only ever delivered through a
   * short-lived Signed_URL — never a permanent public storage path.
   */
  signedUrlMaxTtlSec: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default intent-classification confidence threshold (Req 2.6). */
export const CONFIDENCE_THRESHOLD = 0.7;

const MB = 1024 * 1024;

/** Export profiles referenced by presets and the Render_Engine (Req 15.1). */
export const EXPORT_PROFILES: Record<string, ExportProfile> = {
  vertical_1080p: {
    id: 'vertical_1080p',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 128,
    minOutputBytes: 10 * 1024,
  },
  landscape_1080p: {
    id: 'landscape_1080p',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrateKbps: 10000,
    audioBitrateKbps: 128,
    minOutputBytes: 10 * 1024,
  },
  square_1080p: {
    id: 'square_1080p',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1080,
    height: 1080,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 128,
    minOutputBytes: 10 * 1024,
  },
};

/** Shared caption behavior for short-form vertical platforms. */
const SHORT_FORM_CAPTION: CaptionBehavior = {
  placement: 'center',
  maxCharsPerLine: 24,
  maxLines: 2,
  wordLevelHighlight: true,
};

/** Shared safe area for full-bleed vertical short-form (keeps clear of UI chrome). */
const VERTICAL_SAFE_AREA: SafeAreaInsets = {
  top: 0.12,
  bottom: 0.18,
  left: 0.05,
  right: 0.05,
};

/** Shared safe area for landscape content. */
const LANDSCAPE_SAFE_AREA: SafeAreaInsets = {
  top: 0.05,
  bottom: 0.1,
  left: 0.05,
  right: 0.05,
};

/**
 * Platform_Preset definitions (Req 13.1, master §19). Each defines aspect ratio,
 * recommended/max duration, safe areas, caption behavior, pacing, and export
 * profile. Extend this map to add platforms — no consumer changes needed.
 */
export const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
  instagram_reel: {
    key: 'instagram_reel',
    label: 'Instagram Reel',
    aspectRatio: '9:16',
    recommendedDurationMs: 30_000,
    maxDurationMs: 90_000,
    safeArea: VERTICAL_SAFE_AREA,
    caption: SHORT_FORM_CAPTION,
    pacing: { minShotMs: 800, maxShotMs: 4_000, hookByMs: 3_000 },
    exportProfileId: 'vertical_1080p',
  },
  instagram_story: {
    key: 'instagram_story',
    label: 'Instagram Story',
    aspectRatio: '9:16',
    recommendedDurationMs: 15_000,
    maxDurationMs: 60_000,
    safeArea: VERTICAL_SAFE_AREA,
    caption: SHORT_FORM_CAPTION,
    pacing: { minShotMs: 800, maxShotMs: 3_000, hookByMs: 2_000 },
    exportProfileId: 'vertical_1080p',
  },
  youtube_short: {
    key: 'youtube_short',
    label: 'YouTube Short',
    aspectRatio: '9:16',
    recommendedDurationMs: 30_000,
    maxDurationMs: 60_000,
    safeArea: VERTICAL_SAFE_AREA,
    caption: SHORT_FORM_CAPTION,
    pacing: { minShotMs: 800, maxShotMs: 4_000, hookByMs: 3_000 },
    exportProfileId: 'vertical_1080p',
  },
  youtube_landscape: {
    key: 'youtube_landscape',
    label: 'YouTube Landscape',
    aspectRatio: '16:9',
    recommendedDurationMs: 600_000,
    maxDurationMs: 43_200_000,
    safeArea: LANDSCAPE_SAFE_AREA,
    caption: {
      placement: 'bottom',
      maxCharsPerLine: 42,
      maxLines: 2,
      wordLevelHighlight: false,
    },
    pacing: { minShotMs: 1_500, maxShotMs: 8_000, hookByMs: 15_000 },
    exportProfileId: 'landscape_1080p',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    aspectRatio: '9:16',
    recommendedDurationMs: 30_000,
    maxDurationMs: 600_000,
    safeArea: VERTICAL_SAFE_AREA,
    caption: SHORT_FORM_CAPTION,
    pacing: { minShotMs: 700, maxShotMs: 3_500, hookByMs: 2_000 },
    exportProfileId: 'vertical_1080p',
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    aspectRatio: '1:1',
    recommendedDurationMs: 45_000,
    maxDurationMs: 600_000,
    safeArea: LANDSCAPE_SAFE_AREA,
    caption: {
      placement: 'bottom',
      maxCharsPerLine: 32,
      maxLines: 2,
      wordLevelHighlight: false,
    },
    pacing: { minShotMs: 1_200, maxShotMs: 6_000, hookByMs: 5_000 },
    exportProfileId: 'square_1080p',
  },
  facebook: {
    key: 'facebook',
    label: 'Facebook',
    aspectRatio: '1:1',
    recommendedDurationMs: 45_000,
    maxDurationMs: 240_000,
    safeArea: LANDSCAPE_SAFE_AREA,
    caption: {
      placement: 'bottom',
      maxCharsPerLine: 32,
      maxLines: 2,
      wordLevelHighlight: false,
    },
    pacing: { minShotMs: 1_200, maxShotMs: 6_000, hookByMs: 5_000 },
    exportProfileId: 'square_1080p',
  },
  x: {
    key: 'x',
    label: 'X',
    aspectRatio: '16:9',
    recommendedDurationMs: 45_000,
    maxDurationMs: 140_000,
    safeArea: LANDSCAPE_SAFE_AREA,
    caption: {
      placement: 'bottom',
      maxCharsPerLine: 42,
      maxLines: 2,
      wordLevelHighlight: false,
    },
    pacing: { minShotMs: 1_200, maxShotMs: 6_000, hookByMs: 4_000 },
    exportProfileId: 'landscape_1080p',
  },
  ad_creative: {
    key: 'ad_creative',
    label: 'Ad Creative',
    aspectRatio: '9:16',
    recommendedDurationMs: 15_000,
    maxDurationMs: 60_000,
    safeArea: VERTICAL_SAFE_AREA,
    caption: SHORT_FORM_CAPTION,
    pacing: { minShotMs: 600, maxShotMs: 2_500, hookByMs: 1_500 },
    exportProfileId: 'vertical_1080p',
  },
};

/** Brand-aware editing defaults (Req 13.4, master §20). */
export const BRAND_DEFAULTS: BrandDefaults = {
  primaryColorHex: '#111111',
  secondaryColorHex: '#FFFFFF',
  captionFontFamily: 'Inter',
  captionStyle: 'modern',
  minContrastRatio: 4.5,
};

/** Loudness / true-peak targets (Req 12.1). */
export const AUDIO_TARGETS: AudioTargets = {
  integratedLoudnessLufs: -14,
  loudnessToleranceLu: 1.0,
  truePeakCeilingDbtp: -1.0,
};

/** Silence detection thresholds (Req 4.5) — −40 dB for 0.5 s. */
export const SILENCE_THRESHOLDS: SilenceThresholds = {
  thresholdDb: -40,
  minDurationMs: 500,
};

/** QC classification/repair thresholds (Req 14, 15). */
export const QUALITY_CONTROL_THRESHOLDS: QualityControlThresholds = {
  blackFrameMinMs: 500,
  frozenFrameMinMs: 2_000,
  durationToleranceMs: 500,
  fpsTolerance: 0.01,
  artifactAreaFraction: 0.25,
  maxRepairAttempts: 3,
};

/** Ingestion validation limits (Req 3). */
export const INGESTION_LIMITS: IngestionLimits = {
  minSizeBytes: 1,
  maxSizeBytes: 10_240 * MB,
  resumableThresholdBytes: 100 * MB,
  acceptedContainers: ['mp4', 'mov', 'webm', 'avi', 'mpeg'],
  progressUpdateIntervalMs: 5_000,
};

/** Job-system limits (Req 18, 20). */
export const JOB_LIMITS: JobLimits = {
  defaultTimeoutSec: 1_800,
  maxTimeoutSec: 3_600,
  maxAttempts: 3,
  cancellationDeadlineMs: 5_000,
  maxCleanupRetries: 3,
  tempFileTtlSec: 60,
};

/** Maximum variants creatable in a single request (Req 16.9, 16.10). */
export const MAX_VARIANTS_PER_REQUEST = 5;

/**
 * Hard cap (seconds) on the validity of any artifact Signed_URL (Req 19.3).
 * The Storage_Service itself caps at 24h; the video editor tightens that to
 * 3600s and never exposes a permanent public storage path for an artifact.
 */
export const SIGNED_URL_MAX_TTL_SECONDS = 3_600;

// ---------------------------------------------------------------------------
// Deep-freeze and single-source export
// ---------------------------------------------------------------------------

/** Recursively freeze an object graph so shared config cannot be mutated at runtime. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * THE single source of truth every video-editor consumer reads from (Req 13.1).
 * Import `VIDEO_EDITOR_CONFIG` (or the individual named exports above) — never
 * redeclare any of these values elsewhere.
 */
export const VIDEO_EDITOR_CONFIG: VideoEditorConfig = deepFreeze({
  confidenceThreshold: CONFIDENCE_THRESHOLD,
  presets: PLATFORM_PRESETS,
  exportProfiles: EXPORT_PROFILES,
  brandDefaults: BRAND_DEFAULTS,
  audioTargets: AUDIO_TARGETS,
  silence: SILENCE_THRESHOLDS,
  qualityControl: QUALITY_CONTROL_THRESHOLDS,
  ingestion: INGESTION_LIMITS,
  job: JOB_LIMITS,
  maxVariantsPerRequest: MAX_VARIANTS_PER_REQUEST,
  signedUrlMaxTtlSec: SIGNED_URL_MAX_TTL_SECONDS,
});

// ---------------------------------------------------------------------------
// Resolver helpers (the only supported way to read preset/profile values)
// ---------------------------------------------------------------------------

/**
 * Resolve a Platform_Preset by key from the single config source.
 * Returns `undefined` for an unknown platform so callers can surface an
 * "unsupported platform" error and leave state unchanged (Req 13.3).
 */
export function getPlatformPreset(key: string): PlatformPreset | undefined {
  // Guard against inherited Object.prototype members (e.g. 'valueOf',
  // 'toString', 'constructor', 'hasOwnProperty') resolving to truthy inherited
  // functions. Only own enumerable keys are valid platforms (Req 13.3).
  return Object.prototype.hasOwnProperty.call(VIDEO_EDITOR_CONFIG.presets, key)
    ? VIDEO_EDITOR_CONFIG.presets[key]
    : undefined;
}

/** Resolve an ExportProfile by id from the single config source. */
export function getExportProfile(id: string): ExportProfile | undefined {
  // Same own-property guard as getPlatformPreset: reject keys that collide with
  // inherited Object.prototype members so unknown ids resolve to undefined.
  return Object.prototype.hasOwnProperty.call(VIDEO_EDITOR_CONFIG.exportProfiles, id)
    ? VIDEO_EDITOR_CONFIG.exportProfiles[id]
    : undefined;
}

/** Resolve the ExportProfile a preset targets, from the single config source. */
export function getExportProfileForPreset(presetKey: string): ExportProfile | undefined {
  const preset = getPlatformPreset(presetKey);
  return preset ? getExportProfile(preset.exportProfileId) : undefined;
}

/** All configured platform preset keys (e.g. for validation/UI). */
export function listPlatformPresetKeys(): string[] {
  return Object.keys(VIDEO_EDITOR_CONFIG.presets);
}
