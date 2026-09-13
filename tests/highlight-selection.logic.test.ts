/**
 * Pure unit + invariant tests for the highlight-selection ("editorial brain")
 * analysis core. No FFmpeg, no IO — exercises the total, pure
 * `computeHighlightSegments` decision logic.
 *
 * The key guarantees under test:
 *   - an invalid/non-positive duration yields no segments;
 *   - a clip already at/under the target yields the honest whole clip;
 *   - a degenerate envelope AND no speech yields the honest whole clip (never a
 *     fabricated highlight — No-Mock, Req 23);
 *   - a clear high-energy speech region is preferred over quiet regions;
 *   - segments are ALWAYS ordered, non-overlapping, and within [0, durationMs];
 *   - kept duration stays close to the requested target;
 *   - identical inputs always produce identical output (determinism), including
 *     across ~200 deterministic LCG-seeded random envelopes.
 */

import { describe, it, expect } from 'vitest';
import {
  computeHighlightSegments,
  DEFAULT_HIGHLIGHT_TARGET_MS,
  DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS,
  type HighlightSegment,
  type HighlightSpeechSpan,
} from '../server/features/video-editor/services/highlight-selection.logic';
import type { EnergySample } from '../server/features/video-editor/services/auto-cut.logic';

/** Assert ordered, non-overlapping segments each within [0, durationMs]. */
function assertOrderedNonOverlapping(
  segments: HighlightSegment[],
  durationMs: number,
): void {
  for (let i = 0; i < segments.length; i += 1) {
    expect(segments[i].startMs).toBeGreaterThanOrEqual(0);
    expect(segments[i].endMs).toBeLessThanOrEqual(durationMs);
    expect(segments[i].endMs).toBeGreaterThan(segments[i].startMs);
    if (i > 0) expect(segments[i].startMs).toBeGreaterThanOrEqual(segments[i - 1].endMs);
  }
}

/** Assert keptMs / droppedMs are consistent with the returned segments. */
function assertTotalsConsistent(
  result: { segments: HighlightSegment[]; keptMs: number; droppedMs: number },
  durationMs: number,
): void {
  let sum = 0;
  for (const s of result.segments) sum += s.endMs - s.startMs;
  expect(result.keptMs).toBe(sum);
  expect(result.droppedMs).toBe(durationMs - result.keptMs);
}

/** Build a flat (uniform) envelope over [0, durationMs]. */
function flatEnvelope(durationMs: number, stepMs: number, energy: number): EnergySample[] {
  const out: EnergySample[] = [];
  for (let t = 0; t <= durationMs; t += stepMs) out.push({ tMs: t, energy });
  return out;
}

describe('computeHighlightSegments (pure editorial brain)', () => {
  it('returns no segments for a non-positive/invalid duration', () => {
    for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = computeHighlightSegments([], [], d as number);
      expect(r.segments).toEqual([]);
      expect(r.keptMs).toBe(0);
      expect(r.droppedMs).toBe(0);
    }
  });

  it('returns the whole clip when the clip is already at/under the target', () => {
    const durationMs = 20_000;
    const r = computeHighlightSegments([], [], durationMs, { targetDurationMs: 30_000 });
    expect(r.segments).toEqual([{ startMs: 0, endMs: durationMs }]);
    expect(r.keptMs).toBe(durationMs);
    expect(r.droppedMs).toBe(0);
  });

  it('returns the whole clip for a degenerate envelope AND no speech (never fabricates)', () => {
    const durationMs = 120_000;
    // Empty envelope, no speech.
    expect(computeHighlightSegments([], [], durationMs).segments).toEqual([
      { startMs: 0, endMs: durationMs },
    ]);
    // Flat (uniform) envelope carries no discriminating signal, no speech.
    const flat = flatEnvelope(durationMs, 500, 1);
    expect(computeHighlightSegments(flat, [], durationMs).segments).toEqual([
      { startMs: 0, endMs: durationMs },
    ]);
    // All-zero envelope, no speech.
    const zero = flatEnvelope(durationMs, 500, 0);
    expect(computeHighlightSegments(zero, null, durationMs).segments).toEqual([
      { startMs: 0, endMs: durationMs },
    ]);
  });

  it('prefers a clear high-energy speech region over quiet regions', () => {
    const durationMs = 120_000;
    // Quiet everywhere except a loud region at [60s, 75s].
    const envelope: EnergySample[] = [];
    for (let t = 0; t <= durationMs; t += 500) {
      const loud = t >= 60_000 && t < 75_000;
      envelope.push({ tMs: t, energy: loud ? 10 : 0.1 });
    }
    // Speech overlaps the same loud region.
    const speech: HighlightSpeechSpan[] = [{ startMs: 60_000, endMs: 75_000 }];

    const r = computeHighlightSegments(envelope, speech, durationMs, {
      targetDurationMs: 10_000,
    });
    assertOrderedNonOverlapping(r.segments, durationMs);
    assertTotalsConsistent(r, durationMs);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    // The kept content must lie inside the loud/spoken region.
    const first = r.segments[0];
    expect(first.startMs).toBeGreaterThanOrEqual(55_000);
    expect(first.endMs).toBeLessThanOrEqual(80_000);
  });

  it('keeps a duration close to the requested target', () => {
    const durationMs = 120_000;
    const envelope: EnergySample[] = [];
    for (let t = 0; t <= durationMs; t += 500) {
      // Several loud islands so there is enough high-scoring material.
      const loud =
        (t >= 10_000 && t < 20_000) ||
        (t >= 50_000 && t < 65_000) ||
        (t >= 90_000 && t < 105_000);
      envelope.push({ tMs: t, energy: loud ? 8 : 0.2 });
    }
    const target = 30_000;
    const r = computeHighlightSegments(envelope, [], durationMs, { targetDurationMs: target });
    assertOrderedNonOverlapping(r.segments, durationMs);
    assertTotalsConsistent(r, durationMs);
    // Kept ≈ target: at least the target minus a window, at most target plus one
    // min-segment of overshoot.
    expect(r.keptMs).toBeGreaterThanOrEqual(target - 1000);
    expect(r.keptMs).toBeLessThanOrEqual(target + DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS);
  });

  it('works with speech-only scoring (no envelope)', () => {
    const durationMs = 90_000;
    const speech: HighlightSpeechSpan[] = [
      { startMs: 5_000, endMs: 12_000 },
      { startMs: 40_000, endMs: 52_000 },
    ];
    const r = computeHighlightSegments(null, speech, durationMs, { targetDurationMs: 15_000 });
    assertOrderedNonOverlapping(r.segments, durationMs);
    assertTotalsConsistent(r, durationMs);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds the requested maxSegments cap', () => {
    const durationMs = 200_000;
    const envelope: EnergySample[] = [];
    for (let t = 0; t <= durationMs; t += 500) {
      // Many tiny loud spikes scattered throughout.
      envelope.push({ tMs: t, energy: t % 4000 < 500 ? 9 : 0.2 });
    }
    const r = computeHighlightSegments(envelope, [], durationMs, {
      targetDurationMs: 120_000,
      maxSegments: 3,
    });
    expect(r.segments.length).toBeLessThanOrEqual(3);
    assertOrderedNonOverlapping(r.segments, durationMs);
  });

  it('is deterministic (identical input → identical output)', () => {
    const durationMs = 120_000;
    const envelope: EnergySample[] = [];
    for (let t = 0; t <= durationMs; t += 500) {
      envelope.push({ tMs: t, energy: t >= 50_000 && t < 70_000 ? 7 : 0.3 });
    }
    const speech: HighlightSpeechSpan[] = [{ startMs: 52_000, endMs: 68_000 }];
    const a = computeHighlightSegments(envelope, speech, durationMs, { targetDurationMs: 15_000 });
    const b = computeHighlightSegments(envelope, speech, durationMs, { targetDurationMs: 15_000 });
    expect(a).toEqual(b);
  });

  it('holds the invariants across ~200 deterministic random envelopes', () => {
    let seed = 246813579;
    const rand = () => {
      // Deterministic LCG so the test itself is reproducible.
      seed = (1103515245 * seed + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const durationMs = 5_000 + Math.floor(rand() * 300_000);
      const stepMs = 500;
      const envelope: EnergySample[] = [];
      for (let t = 0; t <= durationMs; t += stepMs) {
        envelope.push({ tMs: t, energy: rand() * (rand() > 0.8 ? 15 : 1) });
      }
      // Randomly include a couple of speech spans.
      const speech: HighlightSpeechSpan[] = [];
      if (rand() > 0.5) {
        const a = Math.floor(rand() * durationMs);
        speech.push({ startMs: a, endMs: Math.min(durationMs, a + 3_000) });
      }
      const target = 5_000 + Math.floor(rand() * Math.max(1, durationMs - 5_000));
      const r = computeHighlightSegments(envelope, speech, durationMs, {
        targetDurationMs: target,
      });
      assertOrderedNonOverlapping(r.segments, durationMs);
      assertTotalsConsistent(r, durationMs);
      // Determinism within the loop.
      const r2 = computeHighlightSegments(envelope, speech, durationMs, {
        targetDurationMs: target,
      });
      expect(r2).toEqual(r);
      // keptMs never exceeds the whole clip.
      expect(r.keptMs).toBeLessThanOrEqual(durationMs);
      expect(r.keptMs).toBeGreaterThan(0);
    }
  });

  it('uses the exported default target when none is supplied', () => {
    const durationMs = DEFAULT_HIGHLIGHT_TARGET_MS + 60_000;
    const envelope: EnergySample[] = [];
    for (let t = 0; t <= durationMs; t += 500) {
      envelope.push({ tMs: t, energy: t < DEFAULT_HIGHLIGHT_TARGET_MS ? 6 : 0.2 });
    }
    const r = computeHighlightSegments(envelope, [], durationMs);
    assertOrderedNonOverlapping(r.segments, durationMs);
    // Kept content should not blow far past the default target.
    expect(r.keptMs).toBeLessThanOrEqual(DEFAULT_HIGHLIGHT_TARGET_MS + DEFAULT_HIGHLIGHT_MIN_SEGMENT_MS);
  });
});
