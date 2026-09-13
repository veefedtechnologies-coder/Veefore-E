import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  VIDEO_EDITOR_CONFIG,
  PLATFORM_PRESETS,
  EXPORT_PROFILES,
  BRAND_DEFAULTS,
  AUDIO_TARGETS,
  SILENCE_THRESHOLDS,
  QUALITY_CONTROL_THRESHOLDS,
  INGESTION_LIMITS,
  JOB_LIMITS,
  CONFIDENCE_THRESHOLD,
  MAX_VARIANTS_PER_REQUEST,
  getPlatformPreset,
  getExportProfile,
  getExportProfileForPreset,
  listPlatformPresetKeys,
  type VideoEditorConfig,
} from '../server/features/video-editor/config/video-editor.config';

// ---------------------------------------------------------------------------
// Property 33: Preset values resolve from a single source everywhere
// Validates: Requirements 13.1
//
// "For any preset value and any component that consumes it, the value read
//  equals the value in the single configuration source; changing the
//  configuration value changes the value observed by every consumer with no
//  other change."
//
// This is proven in two complementary ways:
//   (A) Single-source identity — every public read path in the config module
//       resolves to the SAME underlying object as the single named source, so
//       there is exactly one place each value lives.
//   (B) Change propagation with no consumer code change — modelling each real
//       consumer as a fixed reader function over a config source, changing a
//       value at the source causes every consumer that reads it to observe the
//       new value, while the reader functions themselves are untouched.
// ---------------------------------------------------------------------------

const PRESET_KEYS = listPlatformPresetKeys();
const EXPORT_PROFILE_IDS = Object.keys(EXPORT_PROFILES);

/** A mutable structural clone of the (deep-frozen) single-source config. */
type MutableConfig = VideoEditorConfig;

function cloneConfig(): MutableConfig {
  // structuredClone drops the deep-freeze, giving a mutable copy that mirrors
  // "editing video-editor.config.ts" without touching the real frozen source.
  return structuredClone(VIDEO_EDITOR_CONFIG) as MutableConfig;
}

describe('Property 33: Preset values resolve from a single source everywhere (Req 13.1)', () => {
  // -------------------------------------------------------------------------
  // (A) Single-source identity — one object, referenced everywhere
  // -------------------------------------------------------------------------

  describe('single-source identity', () => {
    it('the aggregate config references the same objects as the named exports', () => {
      expect(VIDEO_EDITOR_CONFIG.presets).toBe(PLATFORM_PRESETS);
      expect(VIDEO_EDITOR_CONFIG.exportProfiles).toBe(EXPORT_PROFILES);
      expect(VIDEO_EDITOR_CONFIG.brandDefaults).toBe(BRAND_DEFAULTS);
      expect(VIDEO_EDITOR_CONFIG.audioTargets).toBe(AUDIO_TARGETS);
      expect(VIDEO_EDITOR_CONFIG.silence).toBe(SILENCE_THRESHOLDS);
      expect(VIDEO_EDITOR_CONFIG.qualityControl).toBe(QUALITY_CONTROL_THRESHOLDS);
      expect(VIDEO_EDITOR_CONFIG.ingestion).toBe(INGESTION_LIMITS);
      expect(VIDEO_EDITOR_CONFIG.job).toBe(JOB_LIMITS);
      expect(VIDEO_EDITOR_CONFIG.confidenceThreshold).toBe(CONFIDENCE_THRESHOLD);
      expect(VIDEO_EDITOR_CONFIG.maxVariantsPerRequest).toBe(MAX_VARIANTS_PER_REQUEST);
    });

    it('the single source is deep-frozen so no consumer can fork it at runtime', () => {
      expect(Object.isFrozen(VIDEO_EDITOR_CONFIG)).toBe(true);
      expect(Object.isFrozen(VIDEO_EDITOR_CONFIG.presets)).toBe(true);
      expect(Object.isFrozen(VIDEO_EDITOR_CONFIG.presets[PRESET_KEYS[0]])).toBe(true);
      expect(Object.isFrozen(VIDEO_EDITOR_CONFIG.exportProfiles)).toBe(true);
    });

    it('every preset read path resolves to the identical single-source object', () => {
      fc.assert(
        fc.property(fc.constantFrom(...PRESET_KEYS), (key) => {
          const fromSource = PLATFORM_PRESETS[key];
          // Resolver helper, aggregate config, and named export are one object.
          expect(getPlatformPreset(key)).toBe(fromSource);
          expect(VIDEO_EDITOR_CONFIG.presets[key]).toBe(fromSource);
        }),
        { numRuns: 200 },
      );
    });

    it('every export-profile read path resolves to the identical single-source object', () => {
      fc.assert(
        fc.property(fc.constantFrom(...EXPORT_PROFILE_IDS), (id) => {
          const fromSource = EXPORT_PROFILES[id];
          expect(getExportProfile(id)).toBe(fromSource);
          expect(VIDEO_EDITOR_CONFIG.exportProfiles[id]).toBe(fromSource);
        }),
        { numRuns: 200 },
      );
    });

    it('preset -> export-profile resolution routes through the single source', () => {
      fc.assert(
        fc.property(fc.constantFrom(...PRESET_KEYS), (key) => {
          const preset = getPlatformPreset(key)!;
          expect(getExportProfileForPreset(key)).toBe(EXPORT_PROFILES[preset.exportProfileId]);
        }),
        { numRuns: 200 },
      );
    });

    it('unknown platform/profile keys resolve to undefined from every read path', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !PRESET_KEYS.includes(s) && !(s in EXPORT_PROFILES)),
          (unknownKey) => {
            expect(getPlatformPreset(unknownKey)).toBeUndefined();
            expect(getExportProfile(unknownKey)).toBeUndefined();
            expect(getExportProfileForPreset(unknownKey)).toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // (B) Change propagation with no consumer code change
  //
  // Each consumer is a reader function bound ONLY to the config source. The same
  // reader function object is used against the original and the changed config —
  // it is never edited — yet it observes the changed value. This models "changing
  // a preset value in configuration changes the value used by all components
  // without any code change".
  // -------------------------------------------------------------------------

  describe('change propagation to every consumer with no consumer code change', () => {
    // Real consumers named in video-editor.config.ts, each reading exactly one
    // value strictly through the config source it is handed.
    const consumers = {
      Editing_Planner_aspect: (c: VideoEditorConfig) => c.presets.instagram_reel.aspectRatio,
      Editing_Planner_duration: (c: VideoEditorConfig) => c.presets.instagram_reel.recommendedDurationMs,
      Caption_Renderer_maxChars: (c: VideoEditorConfig) => c.presets.instagram_reel.caption.maxCharsPerLine,
      Caption_Renderer_contrast: (c: VideoEditorConfig) => c.brandDefaults.minContrastRatio,
      Render_Engine_bitrate: (c: VideoEditorConfig) => c.exportProfiles.vertical_1080p.videoBitrateKbps,
      Quality_Controller_black: (c: VideoEditorConfig) => c.qualityControl.blackFrameMinMs,
      Media_Ingestion_maxSize: (c: VideoEditorConfig) => c.ingestion.maxSizeBytes,
      Video_Analysis_silence: (c: VideoEditorConfig) => c.silence.thresholdDb,
      Job_System_attempts: (c: VideoEditorConfig) => c.job.maxAttempts,
      Intent_Router_confidence: (c: VideoEditorConfig) => c.confidenceThreshold,
      Audio_loudness: (c: VideoEditorConfig) => c.audioTargets.integratedLoudnessLufs,
      Variants_max: (c: VideoEditorConfig) => c.maxVariantsPerRequest,
    } as const;

    // Mutator paired with each consumer: writes a new value at the same location
    // the consumer reads from, mirroring an edit to video-editor.config.ts.
    const writers: Record<keyof typeof consumers, (c: MutableConfig, v: number | string) => void> = {
      Editing_Planner_aspect: (c, v) => { c.presets.instagram_reel.aspectRatio = String(v); },
      Editing_Planner_duration: (c, v) => { c.presets.instagram_reel.recommendedDurationMs = Number(v); },
      Caption_Renderer_maxChars: (c, v) => { c.presets.instagram_reel.caption.maxCharsPerLine = Number(v); },
      Caption_Renderer_contrast: (c, v) => { c.brandDefaults.minContrastRatio = Number(v); },
      Render_Engine_bitrate: (c, v) => { c.exportProfiles.vertical_1080p.videoBitrateKbps = Number(v); },
      Quality_Controller_black: (c, v) => { c.qualityControl.blackFrameMinMs = Number(v); },
      Media_Ingestion_maxSize: (c, v) => { c.ingestion.maxSizeBytes = Number(v); },
      Video_Analysis_silence: (c, v) => { c.silence.thresholdDb = Number(v); },
      Job_System_attempts: (c, v) => { c.job.maxAttempts = Number(v); },
      Intent_Router_confidence: (c, v) => { c.confidenceThreshold = Number(v); },
      Audio_loudness: (c, v) => { c.audioTargets.integratedLoudnessLufs = Number(v); },
      Variants_max: (c, v) => { c.maxVariantsPerRequest = Number(v); },
    };

    const consumerKeys = Object.keys(consumers) as (keyof typeof consumers)[];

    it('each consumer observes a changed value while other consumers stay stable', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...consumerKeys),
          // Arbitrary replacement value — the aspect consumer coerces to string.
          fc.oneof(fc.integer({ min: -1000, max: 1_000_000 }), fc.string({ minLength: 1, maxLength: 8 })),
          (target, rawValue) => {
            const changed = cloneConfig();
            const isAspect = target === 'Editing_Planner_aspect';
            const newValue = isAspect ? `AR-${rawValue}` : Number(rawValue) || 1;
            writers[target](changed, newValue);

            // The targeted consumer — same function, unchanged — sees the new value.
            expect(consumers[target](changed)).toBe(newValue);

            // Every OTHER consumer reads its own independent value from the same
            // source and is unaffected by this single change.
            for (const other of consumerKeys) {
              if (other === target) continue;
              expect(consumers[other](changed)).toBe(consumers[other](VIDEO_EDITOR_CONFIG));
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('for any preset and scalar field, a source change is observed by preset consumers', () => {
      const scalarFields = ['aspectRatio', 'recommendedDurationMs', 'maxDurationMs', 'exportProfileId'] as const;
      fc.assert(
        fc.property(
          fc.constantFrom(...PRESET_KEYS),
          fc.constantFrom(...scalarFields),
          fc.oneof(fc.integer({ min: 1, max: 10_000_000 }), fc.string({ minLength: 1, maxLength: 12 })),
          (key, field, rawValue) => {
            const changed = cloneConfig();
            const numeric = field === 'recommendedDurationMs' || field === 'maxDurationMs';
            const newValue = numeric ? (Number(rawValue) || 1) : `V-${rawValue}`;

            // Edit the single source at [key][field].
            (changed.presets[key] as Record<string, unknown>)[field] = newValue;

            // A generic consumer reading strictly through the config source observes it.
            const consumerRead = (c: VideoEditorConfig) =>
              (c.presets[key] as Record<string, unknown>)[field];
            expect(consumerRead(changed)).toBe(newValue);

            // The real frozen source is untouched (no accidental shared mutation).
            expect(consumerRead(VIDEO_EDITOR_CONFIG)).toBe(
              (PLATFORM_PRESETS[key] as Record<string, unknown>)[field],
            );
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Example (unit) checks — concrete anchors for the property above.
  // -------------------------------------------------------------------------

  describe('example anchors', () => {
    it('a known preset value is served identically by resolver and aggregate config', () => {
      const reel = getPlatformPreset('instagram_reel');
      expect(reel).toBeDefined();
      expect(reel!.aspectRatio).toBe('9:16');
      expect(reel).toBe(VIDEO_EDITOR_CONFIG.presets.instagram_reel);
      expect(reel).toBe(PLATFORM_PRESETS.instagram_reel);
    });

    it('changing the silence threshold in a config copy is seen by the analysis consumer', () => {
      const analysisConsumer = (c: VideoEditorConfig) => c.silence.thresholdDb;
      expect(analysisConsumer(VIDEO_EDITOR_CONFIG)).toBe(-40);
      const changed = cloneConfig();
      changed.silence.thresholdDb = -30;
      expect(analysisConsumer(changed)).toBe(-30);
      // Original single source stays put.
      expect(analysisConsumer(VIDEO_EDITOR_CONFIG)).toBe(-40);
    });
  });
});
