/**
 * Pure unit + invariant tests for the auto-cut (energy/beat-synced montage)
 * analysis core (Increment 2). No FFmpeg, no IO — exercises the total, pure
 * `computeAutoCutSegments` and `computeRmsEnvelope` decision logic.
 *
 * The key guarantees under test:
 *   - segments ALWAYS tile [0, durationMs] exactly (ordered, contiguous,
 *     non-overlapping) for any positive duration;
 *   - a flat / degenerate envelope yields a single whole-clip segment (honest
 *     "no beats", never a fabricated cut — No-Mock, Req 23);
 *   - a clear percussive envelope yields >1 segment at rising onsets;
 *   - the segment count never exceeds `maxSegments`;
 *   - identical inputs always produce identical output (determinism).
 */

import { describe, it, expect } from 'vitest';
import {
  computeAutoCutSegments,
  computeRmsEnvelope,
  DEFAULT_MIN_SEGMENT_MS,
  type EnergySample,
} from '../server/features/video-editor/services/auto-cut.logic';

/** Assert an ordered, contiguous, non-overlapping tiling of [0, durationMs]. */
function assertExactTiling(
  segments: { startMs: number; endMs: number }[],
  durationMs: number,
): void {
  expect(segments.length).toBeGreaterThan(0);
  expect(segments[0].startMs).toBe(0);
  expect(segments[segments.length - 1].endMs).toBe(durationMs);
  for (let i = 0; i < segments.length; i += 1) {
    expect(segments[i].endMs).toBeGreaterThan(segments[i].startMs);
    if (i > 0) expect(segments[i].startMs).toBe(segments[i - 1].endMs);
  }
}

/** Build a percussive envelope: quiet baseline with sharp periodic energy spikes. */
function percussiveEnvelope(
  durationMs: number,
  stepMs: number,
  beatEveryMs: number,
): EnergySample[] {
  const out: EnergySample[] = [];
  for (let t = 0; t <= durationMs; t += stepMs) {
    const isBeat = t > 0 && Math.abs(t % beatEveryMs) < stepMs / 2;
    out.push({ tMs: t, energy: isBeat ? 10 : 0.2 });
  }
  return out;
}

describe('computeAutoCutSegments (pure beat-sync)', () => {
  it('returns no segments for a non-positive/invalid duration', () => {
    expect(computeAutoCutSegments([], 0).segments).toEqual([]);
    expect(computeAutoCutSegments([], -5).segments).toEqual([]);
    expect(computeAutoCutSegments([], Number.NaN).segments).toEqual([]);
  });

  it('yields a single whole-clip segment for a flat envelope (no beats)', () => {
    const durationMs = 10_000;
    const flat: EnergySample[] = Array.from({ length: 100 }, (_, i) => ({
      tMs: i * 100,
      energy: 1,
    }));
    const result = computeAutoCutSegments(flat, durationMs);
    expect(result.segments).toEqual([{ startMs: 0, endMs: durationMs }]);
    expect(result.boundariesMs).toEqual([]);
  });

  it('yields a single whole-clip segment when there is too little signal', () => {
    const durationMs = 10_000;
    const result = computeAutoCutSegments([{ tMs: 0, energy: 5 }], durationMs);
    expect(result.segments).toEqual([{ startMs: 0, endMs: durationMs }]);
  });

  it('detects multiple cuts on a clearly percussive envelope', () => {
    const durationMs = 12_000;
    const envelope = percussiveEnvelope(durationMs, 50, 2_000);
    const result = computeAutoCutSegments(envelope, durationMs);
    expect(result.segments.length).toBeGreaterThan(1);
    assertExactTiling(result.segments, durationMs);
    // Every kept segment respects the minimum length invariant.
    for (const seg of result.segments) {
      expect(seg.endMs - seg.startMs).toBeGreaterThanOrEqual(DEFAULT_MIN_SEGMENT_MS);
    }
  });

  it('never exceeds the requested maxSegments cap', () => {
    const durationMs = 30_000;
    const envelope = percussiveEnvelope(durationMs, 50, 1_000);
    const result = computeAutoCutSegments(envelope, durationMs, { maxSegments: 4 });
    expect(result.segments.length).toBeLessThanOrEqual(4);
    assertExactTiling(result.segments, durationMs);
  });

  it('always tiles [0, durationMs] exactly across many random envelopes', () => {
    let seed = 987654321;
    const rand = () => {
      // Deterministic LCG so the test itself is reproducible.
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const durationMs = 2_000 + Math.floor(rand() * 40_000);
      const stepMs = 50;
      const envelope: EnergySample[] = [];
      for (let t = 0; t <= durationMs; t += stepMs) {
        envelope.push({ tMs: t, energy: rand() * (rand() > 0.85 ? 20 : 1) });
      }
      const result = computeAutoCutSegments(envelope, durationMs);
      assertExactTiling(result.segments, durationMs);
    }
  });

  it('is deterministic (identical input → identical output)', () => {
    const durationMs = 15_000;
    const envelope = percussiveEnvelope(durationMs, 50, 1_500);
    const a = computeAutoCutSegments(envelope, durationMs);
    const b = computeAutoCutSegments(envelope, durationMs);
    expect(a).toEqual(b);
  });
});

describe('computeRmsEnvelope (pure windowed RMS)', () => {
  it('returns [] for empty/invalid input', () => {
    expect(computeRmsEnvelope(null, 8000)).toEqual([]);
    expect(computeRmsEnvelope([], 8000)).toEqual([]);
    expect(computeRmsEnvelope([1, 2, 3], 0)).toEqual([]);
  });

  it('produces one sample per window with correct timing', () => {
    // 8000 Hz, 50ms windows → 400 samples per window.
    const samples = new Int16Array(1200).fill(1000);
    const env = computeRmsEnvelope(samples, 8000, 50);
    expect(env.length).toBe(3);
    expect(env[0].tMs).toBe(0);
    expect(env[1].tMs).toBe(50);
    expect(env[2].tMs).toBe(100);
    // Constant amplitude → RMS equals that amplitude.
    for (const s of env) expect(Math.round(s.energy)).toBe(1000);
  });

  it('is deterministic', () => {
    const samples = Array.from({ length: 4000 }, (_, i) => Math.sin(i / 3) * 5000);
    expect(computeRmsEnvelope(samples, 8000, 50)).toEqual(
      computeRmsEnvelope(samples, 8000, 50),
    );
  });
});
