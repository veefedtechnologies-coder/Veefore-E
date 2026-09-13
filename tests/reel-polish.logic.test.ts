/**
 * Pure unit tests for the one-shot "premium reel" polish preset (Increment 3).
 *
 * Verifies the detector recognises reel-polish phrasing (and does NOT swallow a
 * specific single-op instruction), and that the expansion produces a curated,
 * ordered change list whose every phrase routes — via the SAME pure classifiers
 * the planner uses — to a known DETERMINISTIC engine op (filter / aspect /
 * audio_process / fades / auto_cut / caption). This proves the preset introduces
 * NO new routing and stays honest (No-Mock, Req 23).
 */

import { describe, it, expect } from 'vitest';
import {
  isReelPolishRequest,
  buildReelPolishIntent,
  expandReelPolishChanges,
  REEL_POLISH_CHANGES,
  classifyRequestedChange,
} from '../server/features/video-editor/services/intent-extraction.logic';

describe('isReelPolishRequest', () => {
  it('recognises common reel-polish phrasings', () => {
    for (const msg of [
      'make this a premium reel',
      'turn it into a reel',
      'polish this into a professional reel',
      'make this a reel',
      'premium reel please',
      'make my video pop like a pro',
      'convert this to a viral reel',
    ]) {
      expect(isReelPolishRequest(msg)).toBe(true);
    }
  });

  it('recognises bare "auto-edit everything" phrasings', () => {
    for (const msg of [
      'auto edit this',
      'auto-edit this video',
      'edit this properly',
      'edit it professionally',
      'edit my video for me',
      'just edit it nicely',
      'edit this properly for Instagram',
      'edit this for tiktok',
      'make it for reels',
      'optimize this for youtube shorts',
      'prepare this for instagram',
      'make it social-ready',
      'make this post ready',
      'get it ready to post',
      'make it ready for instagram',
    ]) {
      expect(isReelPolishRequest(msg)).toBe(true);
    }
  });

  it('auto-edit phrasings expand into the curated premium chain', () => {
    for (const msg of ['auto edit this', 'edit this properly for Instagram', 'make it social-ready']) {
      const intent = buildReelPolishIntent(msg);
      expect(intent.requiresDeterministicEditing).toBe(true);
      expect(intent.requiresGenerativeAI).toBe(false);
      expect(intent.requestedChanges).toEqual([...REEL_POLISH_CHANGES]);
    }
  });

  it('does NOT trigger on a specific single-op instruction', () => {
    for (const msg of [
      'just add captions',
      'reframe to 9:16',
      'trim the first 5 seconds',
      'speed it up 2x',
      'normalize the audio',
      '',
    ]) {
      expect(isReelPolishRequest(msg)).toBe(false);
    }
  });
});

describe('expandReelPolishChanges', () => {
  it('returns the curated preset changes when there are no prior changes', () => {
    expect(expandReelPolishChanges([])).toEqual([...REEL_POLISH_CHANGES]);
    expect(expandReelPolishChanges(null)).toEqual([...REEL_POLISH_CHANGES]);
  });

  it('keeps the user\u2019s explicit changes FIRST and de-dupes', () => {
    const expanded = expandReelPolishChanges(['make it black and white']);
    expect(expanded[0]).toBe('make it black and white');
    // Curated changes still present, appended after the explicit one.
    for (const c of REEL_POLISH_CHANGES) expect(expanded).toContain(c);
    // No duplicates.
    expect(new Set(expanded).size).toBe(expanded.length);
  });
});

describe('buildReelPolishIntent', () => {
  it('every curated change routes to a deterministic engine op', () => {
    for (const change of REEL_POLISH_CHANGES) {
      expect(classifyRequestedChange(change)).toBe('deterministic');
    }
  });

  it('produces a deterministic, non-generative vertical reel intent', () => {
    const intent = buildReelPolishIntent('make this a premium reel');
    expect(intent.requiresDeterministicEditing).toBe(true);
    expect(intent.requiresGenerativeAI).toBe(false);
    expect(intent.targetAspectRatio).toBe('9:16');
    expect(intent.requestedChanges).toEqual([...REEL_POLISH_CHANGES]);
  });

  it('honours an aspect ratio stated in the message', () => {
    const intent = buildReelPolishIntent('make this a reel in 1:1 square');
    expect(intent.targetAspectRatio).toBe('1:1');
  });

  it('merges a base intent\u2019s explicit changes and lifts confidence', () => {
    const base = buildReelPolishIntent('make this a reel');
    const merged = buildReelPolishIntent('make this a reel but keep it black and white', {
      ...base,
      requestedChanges: ['keep it black and white'],
      confidence: 0.72,
    });
    expect(merged.requestedChanges[0]).toBe('keep it black and white');
    expect(merged.confidence).toBeGreaterThanOrEqual(0.9);
    expect(merged.requiresGenerativeAI).toBe(false);
  });
});
