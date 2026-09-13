/**
 * Provider_Capability_Registry seed data (task 2.3).
 *
 * The initial, versioned `VideoModelCapabilities` records the DB-backed registry
 * service persists on first startup, plus the canonical deterministic-performable
 * operation-kind set. These are METADATA (Req 7.1, 7.3): upgrading a provider is
 * a matter of appending a new-version record, never editing routing source code.
 *
 * Nothing here duplicates the single-source config in `video-editor.config.ts` —
 * provider-specific limits (clip length, resolution, region availability) belong
 * in capability metadata, not in the preset/threshold config (Req 7.x).
 */

import type { VideoModelCapabilities } from './provider-capability-registry.logic';
import { DETERMINISTIC_PERFORMABLE_KINDS } from './provider-capability-registry.logic';

/**
 * Operation kinds a deterministic (FFmpeg) pipeline performs reliably, so the
 * Model_Router MUST NEVER route them to a generative provider (Req 6.1, 8.2,
 * master §4): trim, cut, concat, crop, resize, aspect conversion, fps conversion,
 * audio, captions, speed, fades, encoding. Re-exported from the pure core's
 * canonical list so there is exactly one definition.
 */
export const SEED_DETERMINISTIC_PERFORMABLE_KINDS: readonly string[] =
  DETERMINISTIC_PERFORMABLE_KINDS;

/**
 * Seed capability records. Each is version `1.0.0` for its provider/model; a real
 * upgrade appends `1.1.0`, `2.0.0`, … without mutating these (append-only, Req 7.5).
 *
 * Values reflect the master spec's Gemini Omni / Veo capability envelopes and are
 * intentionally conservative; they are tuned by appending new versions, not by
 * editing code that consumes them.
 */
export const SEED_VIDEO_MODEL_CAPABILITIES: readonly VideoModelCapabilities[] = [
  {
    provider: 'gemini',
    model: 'omni-1',
    version: '1.0.0',
    // Gemini Omni performs generative visual synthesis/editing on bounded clips.
    supportedOperations: [
      'generative_edit',
      'remove_object',
      'replace_background',
      'inpaint',
      'outpaint',
      'style_transfer',
      'add_broll',
      'generate',
    ],
    editableInputSeconds: { min: 1, max: 8 },
    outputSeconds: { min: 1, max: 8 },
    outputResolutions: ['1080x1920', '1920x1080', '1080x1080', '1280x720'],
    inputModalities: ['video', 'image', 'text'],
    outputModalities: ['video'],
    priorityRank: 100,
    costPerOutputSecondInr: 3.5,
    // Omni can guarantee identity/voice/audio preservation on edit operations.
    guaranteesPreservation: ['face', 'voice', 'original_audio', 'logo'],
  },
  {
    provider: 'google',
    model: 'veo-3',
    version: '1.0.0',
    // Veo is generation-first (text/image → video); higher-fidelity, longer clips.
    supportedOperations: [
      'generate',
      'generative_edit',
      'replace_background',
      'add_broll',
      'style_transfer',
      'outpaint',
    ],
    editableInputSeconds: { min: 1, max: 8 },
    outputSeconds: { min: 4, max: 60 },
    outputResolutions: ['1080x1920', '1920x1080', '1080x1080', '3840x2160'],
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['video'],
    priorityRank: 90,
    costPerOutputSecondInr: 6.0,
    // Veo does not guarantee facial/voice identity preservation of source footage.
    guaranteesPreservation: [],
  },
];
