/**
 * Property tests for the Timeline_Engine pure core (task 12.2).
 *
 * Framework: vitest + fast-check, >=100 runs per property.
 *
 * Properties under test (design.md):
 *  - Property 26: Invalid timeline placements and source timings are rejected
 *    without mutating the model
 *      Validates: Requirements 10.3, 10.6
 *  - Property 27: Clip source in/out points are independent of timeline placement
 *      Validates: Requirements 10.5
 *  - Property 28: Rendering an unchanged timeline is deterministic
 *      Validates: Requirements 10.4, 11.3, 15.1
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createTimeline,
  addElement,
  updateElement,
  buildRenderCommand,
  renderCommandToString,
  trackCount,
  type TimelineModel,
  type TimelineElement,
  type TimelineSequence,
  type TimelineOpContext,
  type RenderEncoderProfile,
} from '../server/features/video-editor/services/timeline-engine.logic';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A sequence layout with a positive integer track count. */
const seqArb: fc.Arbitrary<TimelineSequence> = fc
  .integer({ min: 1, max: 8 })
  .map((tracks) => ({ tracks }));

const sequencesArb: fc.Arbitrary<TimelineSequence[]> = fc.array(seqArb, {
  minLength: 1,
  maxLength: 3,
});

const kindArb = fc.constantFrom(
  'clip' as const,
  'audioClip' as const,
  'captionClip' as const,
  'effect' as const,
  'transition' as const,
);

/** A VALID element for a model with `tracks` tracks and a known source duration. */
function validElementArb(tracks: number, sourceDurationMs: number): fc.Arbitrary<TimelineElement> {
  return fc
    .record({
      kind: kindArb,
      trackIndex: fc.integer({ min: 0, max: Math.max(0, tracks - 1) }),
      timelineStartMs: fc.integer({ min: 0, max: 100_000 }),
      // duration ensures end > start
      durationMs: fc.integer({ min: 1, max: 100_000 }),
      // valid source in/out within [0, sourceDurationMs]
      sourceInMs: fc.integer({ min: 0, max: Math.max(0, sourceDurationMs - 1) }),
      extraOutMs: fc.integer({ min: 1, max: 100_000 }),
    })
    .map(({ kind, trackIndex, timelineStartMs, durationMs, sourceInMs, extraOutMs }) => {
      const sourceOutMs = Math.min(sourceDurationMs, sourceInMs + extraOutMs);
      const el: TimelineElement = {
        kind,
        trackIndex,
        timelineStartMs,
        timelineEndMs: timelineStartMs + durationMs,
        sourceAssetId: 'asset-1',
        sourceInMs,
        // guarantee out > in even after the min() clamp
        sourceOutMs: sourceOutMs > sourceInMs ? sourceOutMs : sourceInMs + 1,
      };
      return el;
    });
}

/** A valid model plus op context (with the source duration registered). */
const validModelArb: fc.Arbitrary<{
  model: TimelineModel;
  ctx: TimelineOpContext;
  sourceDurationMs: number;
}> = fc
  .record({
    sequences: sequencesArb,
    sourceDurationMs: fc.integer({ min: 2, max: 500_000 }),
  })
  .chain(({ sequences, sourceDurationMs }) => {
    const base = createTimeline(sequences);
    const tracks = trackCount(base);
    return fc
      .array(validElementArb(tracks, sourceDurationMs), { minLength: 0, maxLength: 6 })
      .map((elements) => {
        let model = base;
        const ctx: TimelineOpContext = { sourceDurationsMs: { 'asset-1': sourceDurationMs } };
        for (const el of elements) {
          const res = addElement(model, el, ctx);
          if (res.ok) model = res.model;
        }
        return { model, ctx, sourceDurationMs };
      });
  });

/** Deep clone a model for before/after comparison. */
function snapshot(model: TimelineModel): string {
  return JSON.stringify(model);
}

// ---------------------------------------------------------------------------
// Property 26: Invalid placements/source timings are rejected without mutating.
// Validates: Requirements 10.3, 10.6
// ---------------------------------------------------------------------------

describe('Property 26: invalid placements and source timings are rejected without mutating the model', () => {
  it('rejects invalid PLACEMENT (negative start / start>=end / out-of-range track) and leaves model unchanged', () => {
    fc.assert(
      fc.property(
        validModelArb,
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: -50_000, max: 50_000 }),
        fc.integer({ min: -50_000, max: 50_000 }),
        fc.integer({ min: -5, max: 20 }),
        ({ model, ctx }, violationKind, a, b, badTrack) => {
          const tracks = trackCount(model);
          let element: TimelineElement;
          if (violationKind === 0) {
            // negative start
            element = {
              kind: 'clip',
              trackIndex: 0,
              timelineStartMs: -Math.abs(a) - 1,
              timelineEndMs: Math.abs(b) + 10,
            };
          } else if (violationKind === 1) {
            // start >= end
            const s = Math.abs(a);
            element = {
              kind: 'clip',
              trackIndex: 0,
              timelineStartMs: s,
              timelineEndMs: s, // equal -> invalid
            };
          } else {
            // out-of-range track index (force outside [0, tracks))
            const t = badTrack < 0 ? badTrack : tracks + badTrack;
            element = {
              kind: 'clip',
              trackIndex: t,
              timelineStartMs: 0,
              timelineEndMs: 100,
            };
          }

          const before = snapshot(model);
          const res = addElement(model, element, ctx);
          const after = snapshot(model);

          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(typeof res.error).toBe('string');
            expect(res.error.length).toBeGreaterThan(0);
          }
          // input model is never mutated
          expect(after).toBe(before);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('rejects invalid SOURCE timing (negative in / out<=in / out>duration) and leaves model unchanged', () => {
    fc.assert(
      fc.property(
        validModelArb,
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 100_000 }),
        ({ model, ctx, sourceDurationMs }, violationKind, k) => {
          const base = {
            kind: 'clip' as const,
            trackIndex: 0,
            timelineStartMs: 0,
            timelineEndMs: 1000,
            sourceAssetId: 'asset-1',
          };
          let element: TimelineElement;
          if (violationKind === 0) {
            // negative in-point
            element = { ...base, sourceInMs: -(k + 1), sourceOutMs: k + 100 };
          } else if (violationKind === 1) {
            // out <= in
            element = { ...base, sourceInMs: k, sourceOutMs: k };
          } else {
            // out exceeds source duration
            element = { ...base, sourceInMs: 0, sourceOutMs: sourceDurationMs + k + 1 };
          }

          const before = snapshot(model);
          const res = addElement(model, element, ctx);
          const after = snapshot(model);

          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.error.length).toBeGreaterThan(0);
          }
          expect(after).toBe(before);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('accepts a valid element and returns a NEW model without mutating the input', () => {
    fc.assert(
      fc.property(validModelArb, ({ model, ctx, sourceDurationMs }) => {
        const tracks = trackCount(model);
        const element: TimelineElement = {
          kind: 'clip',
          trackIndex: tracks - 1,
          timelineStartMs: 0,
          timelineEndMs: 500,
          sourceAssetId: 'asset-1',
          sourceInMs: 0,
          sourceOutMs: Math.min(500, sourceDurationMs),
        };
        const before = snapshot(model);
        const res = addElement(model, element, ctx);
        const after = snapshot(model);

        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.model).not.toBe(model);
          expect(res.model.elements.length).toBe(model.elements.length + 1);
        }
        // input model still unchanged (copy-on-write)
        expect(after).toBe(before);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 27: Source in/out points are independent of timeline placement.
// Validates: Requirements 10.5
// ---------------------------------------------------------------------------

describe('Property 27: clip source in/out points are independent of timeline placement', () => {
  it('changing timeline start/end preserves source in/out unchanged', () => {
    fc.assert(
      fc.property(
        fc.record({
          sourceDurationMs: fc.integer({ min: 10, max: 500_000 }),
          sourceInMs: fc.integer({ min: 0, max: 100_000 }),
          extraOutMs: fc.integer({ min: 1, max: 100_000 }),
          startA: fc.integer({ min: 0, max: 100_000 }),
          durA: fc.integer({ min: 1, max: 100_000 }),
          startB: fc.integer({ min: 0, max: 100_000 }),
          durB: fc.integer({ min: 1, max: 100_000 }),
        }),
        ({ sourceDurationMs, sourceInMs, extraOutMs, startA, durA, startB, durB }) => {
          const inMs = Math.min(sourceInMs, sourceDurationMs - 1);
          const outMs = Math.min(sourceDurationMs, inMs + extraOutMs);
          const sourceOutMs = outMs > inMs ? outMs : inMs + 1;

          const ctx: TimelineOpContext = { sourceDurationsMs: { 'asset-1': sourceDurationMs } };
          const model = createTimeline([{ tracks: 1 }]);

          // Place clip at position A
          const elA: TimelineElement = {
            kind: 'clip',
            trackIndex: 0,
            timelineStartMs: startA,
            timelineEndMs: startA + durA,
            sourceAssetId: 'asset-1',
            sourceInMs: inMs,
            sourceOutMs,
          };
          const resA = addElement(model, elA, ctx);
          expect(resA.ok).toBe(true);
          if (!resA.ok) return;

          // Move the same clip to a different timeline placement B (source in/out kept identical)
          const elB: TimelineElement = {
            ...elA,
            timelineStartMs: startB,
            timelineEndMs: startB + durB,
          };
          const resB = updateElement(resA.model, 0, elB, ctx);
          expect(resB.ok).toBe(true);
          if (!resB.ok) return;

          const stored = resB.model.elements[0];
          // Source timings survive the timeline move untouched.
          expect(stored.sourceInMs).toBe(inMs);
          expect(stored.sourceOutMs).toBe(sourceOutMs);
          // And the timeline placement did change.
          expect(stored.timelineStartMs).toBe(startB);
          expect(stored.timelineEndMs).toBe(startB + durB);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('source validity does not depend on timeline values (same source across arbitrary placements)', () => {
    fc.assert(
      fc.property(
        fc.record({
          sourceDurationMs: fc.integer({ min: 10, max: 500_000 }),
          sourceInMs: fc.integer({ min: 0, max: 9_000 }),
          start: fc.integer({ min: 0, max: 1_000_000 }),
          dur: fc.integer({ min: 1, max: 1_000_000 }),
        }),
        ({ sourceDurationMs, sourceInMs, start, dur }) => {
          const inMs = Math.min(sourceInMs, sourceDurationMs - 1);
          const sourceOutMs = Math.min(sourceDurationMs, inMs + 1);
          const ctx: TimelineOpContext = { sourceDurationsMs: { 'asset-1': sourceDurationMs } };
          const model = createTimeline([{ tracks: 1 }]);
          const el: TimelineElement = {
            kind: 'clip',
            trackIndex: 0,
            timelineStartMs: start,
            timelineEndMs: start + dur,
            sourceAssetId: 'asset-1',
            sourceInMs: inMs,
            sourceOutMs,
          };
          // Valid source timing accepted regardless of how large/small the timeline placement is.
          const res = addElement(model, el, ctx);
          expect(res.ok).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28: Rendering an unchanged timeline is deterministic.
// Validates: Requirements 10.4, 11.3, 15.1
// ---------------------------------------------------------------------------

const profileArb: fc.Arbitrary<RenderEncoderProfile> = fc.record({
  container: fc.constantFrom('mp4' as const, 'webm' as const, 'mov' as const),
  videoCodec: fc.constantFrom('h264' as const, 'h265' as const, 'vp9' as const),
  audioCodec: fc.constantFrom('aac' as const, 'opus' as const),
  width: fc.integer({ min: 16, max: 3840 }),
  height: fc.integer({ min: 16, max: 2160 }),
  fps: fc.integer({ min: 1, max: 120 }),
  videoBitrateKbps: fc.integer({ min: 100, max: 50_000 }),
  audioBitrateKbps: fc.integer({ min: 32, max: 512 }),
});

describe('Property 28: rendering an unchanged timeline is deterministic', () => {
  it('two renders of an unchanged model produce identical command vectors', () => {
    fc.assert(
      fc.property(validModelArb, profileArb, ({ model }, profile) => {
        const c1 = buildRenderCommand(model, profile);
        const c2 = buildRenderCommand(model, profile);
        expect(c1.args).toEqual(c2.args);
        expect(renderCommandToString(c1)).toBe(renderCommandToString(c2));
      }),
      { numRuns: RUNS },
    );
  });

  it('input ordering is stable regardless of element insertion order', () => {
    fc.assert(
      fc.property(validModelArb, profileArb, ({ model }, profile) => {
        // Build a permuted-but-equivalent model by reversing element order.
        const reversed: TimelineModel = {
          sequences: model.sequences.map((s) => ({ tracks: s.tracks })),
          elements: [...model.elements].reverse(),
        };
        const c1 = buildRenderCommand(model, profile);
        const c2 = buildRenderCommand(reversed, profile);
        // Stable data-derived ordering => identical commands.
        expect(c1.args).toEqual(c2.args);
      }),
      { numRuns: RUNS },
    );
  });

  it('a change to the model can change the command (renders reflect model state)', () => {
    fc.assert(
      fc.property(validModelArb, profileArb, ({ model, ctx, sourceDurationMs }, profile) => {
        const tracks = trackCount(model);
        const before = buildRenderCommand(model, profile);
        // Add a NEW sourced clip; command must incorporate the new input.
        const added = addElement(
          model,
          {
            kind: 'clip',
            trackIndex: tracks - 1,
            timelineStartMs: 0,
            timelineEndMs: 500,
            sourceAssetId: 'asset-new',
            sourceInMs: 0,
            sourceOutMs: Math.min(500, sourceDurationMs),
          },
          { sourceDurationsMs: { ...ctx.sourceDurationsMs, 'asset-new': sourceDurationMs } },
        );
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        const after = buildRenderCommand(added.model, profile);
        // The new sourced input appears in the after-command's input order.
        expect(after.inputOrder.length).toBe(before.inputOrder.length + 1);
        expect(after.args).toContain('asset-new');
      }),
      { numRuns: RUNS },
    );
  });
});
