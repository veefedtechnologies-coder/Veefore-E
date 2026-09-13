import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  planSilenceRemoval,
  speechFullyPreserved,
  mustPreserveOriginalVoice,
  SILENCE_REMOVAL_SPEECH_CONFLICT,
  type SilenceRemovalRequest,
  type AudioProcessingIntent,
} from '../server/features/video-editor/services/silence-removal.logic';
import type { TimeRangeMs } from '../server/features/video-editor/services/audio-analysis.logic';

// ===========================================================================
// Task 11.3 — Property tests for the pure audio-processing core
// (server/features/video-editor/services/silence-removal.logic.ts).
//
//   Property 31: Silence removal removes only silence and never touches speech
//                Validates: Requirements 12.2, 12.3, 8.5
//   Property 32: Original voice is byte-identical unless a voice change is
//                requested
//                Validates: Requirements 12.4
//
// Every property runs many fast-check iterations. Generators are shaped to the
// input space (disjoint alternating speech/silence segments, as the analysis
// emits them, plus adversarial requested ranges) so the checks are meaningful
// rather than vacuous.
// ===========================================================================

const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A disjoint, ordered partition of `[0, durationMs)` into alternating segments,
 * each independently tagged as either "speech" or "silence" — the real shape
 * the Video_Analysis_Service produces (speech and silence never overlap).
 * Returns the total duration together with the two segment lists.
 */
const analyzedAudioArb = fc
  .record({
    // Segment lengths (gap-free, contiguous from 0).
    lengths: fc.array(fc.integer({ min: 1, max: 2_000 }), {
      minLength: 1,
      maxLength: 20,
    }),
    // For each segment, is it speech (true) or silence (false)?
    isSpeech: fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
  })
  .map(({ lengths, isSpeech }) => {
    const speechSegments: TimeRangeMs[] = [];
    const silenceSegments: TimeRangeMs[] = [];
    let cursor = 0;
    const n = Math.min(lengths.length, isSpeech.length);
    for (let i = 0; i < n; i++) {
      const startMs = cursor;
      const endMs = cursor + lengths[i];
      const range: TimeRangeMs = { startMs, endMs };
      if (isSpeech[i]) speechSegments.push(range);
      else silenceSegments.push(range);
      cursor = endMs;
    }
    return { sourceDurationMs: cursor, speechSegments, silenceSegments };
  })
  .filter((a) => a.sourceDurationMs > 0);

/** An arbitrary half-open range within `[0, durationMs]`. */
function rangeWithinArb(durationMs: number): fc.Arbitrary<TimeRangeMs> {
  return fc
    .record({
      startMs: fc.integer({ min: 0, max: Math.max(0, durationMs - 1) }),
      len: fc.integer({ min: 1, max: Math.max(1, durationMs) }),
    })
    .map(({ startMs, len }) => ({
      startMs,
      endMs: Math.min(durationMs, startMs + len),
    }))
    .filter((r) => r.endMs > r.startMs);
}

// ---------------------------------------------------------------------------
// Local reference helpers (independent of the module under test).
// ---------------------------------------------------------------------------

/** Do two half-open ranges overlap on a region of positive length? */
function overlaps(a: TimeRangeMs, b: TimeRangeMs): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** Is point `ms` inside some half-open range `[start, end)`? */
function inSome(ms: number, ranges: readonly TimeRangeMs[]): boolean {
  return ranges.some((r) => ms >= r.startMs && ms < r.endMs);
}

// ===========================================================================
// Property 31: Silence removal removes only silence and never touches speech
// Validates: Requirements 12.2, 12.3, 8.5
// ===========================================================================

describe('Property 31: Silence removal removes only silence and never touches speech (Req 12.2, 12.3, 8.5)', () => {
  it('removes nothing when silence removal is not explicitly requested (Req 12.2)', () => {
    fc.assert(
      fc.property(analyzedAudioArb, (audio) => {
        const request: SilenceRemovalRequest = {
          requested: false,
          silenceSegments: audio.silenceSegments,
          speechSegments: audio.speechSegments,
          sourceDurationMs: audio.sourceDurationMs,
        };
        const plan = planSilenceRemoval(request);
        expect(plan.ok).toBe(true);
        if (plan.ok) {
          expect(plan.removeRanges).toEqual([]);
          // The whole source is kept intact.
          expect(plan.keepRanges).toEqual([
            { startMs: 0, endMs: audio.sourceDurationMs },
          ]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('when requested with no explicit ranges: removes only analysis silence and keeps every speech segment uncut (Req 8.5, 12.2)', () => {
    fc.assert(
      fc.property(analyzedAudioArb, (audio) => {
        const request: SilenceRemovalRequest = {
          requested: true,
          silenceSegments: audio.silenceSegments,
          speechSegments: audio.speechSegments,
          sourceDurationMs: audio.sourceDurationMs,
        };
        const plan = planSilenceRemoval(request);
        // Analysis speech and silence are disjoint here, so this always succeeds.
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;

        // Every point removed lies inside an analysis silence segment (Req 8.5).
        for (const r of plan.removeRanges) {
          const mid = Math.floor((r.startMs + r.endMs) / 2);
          expect(inSome(mid, audio.silenceSegments)).toBe(true);
          // And never inside a speech segment.
          expect(inSome(mid, audio.speechSegments)).toBe(false);
          // No remove range overlaps any speech segment.
          for (const s of audio.speechSegments) {
            expect(overlaps(r, s)).toBe(false);
          }
        }

        // Every detected speech segment is present and uncut in the kept output.
        expect(
          speechFullyPreserved(
            audio.speechSegments,
            plan.keepRanges,
            audio.sourceDurationMs,
          ),
        ).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keepRanges are the exact complement of removeRanges and cover the source (Req 12.2)', () => {
    fc.assert(
      fc.property(analyzedAudioArb, (audio) => {
        const plan = planSilenceRemoval({
          requested: true,
          silenceSegments: audio.silenceSegments,
          speechSegments: audio.speechSegments,
          sourceDurationMs: audio.sourceDurationMs,
        });
        if (!plan.ok) return;

        // Kept and removed are disjoint.
        for (const k of plan.keepRanges) {
          for (const r of plan.removeRanges) {
            expect(overlaps(k, r)).toBe(false);
          }
        }
        // Kept + removed together tile the whole source duration exactly.
        const keptTotal = plan.keepRanges.reduce(
          (sum, r) => sum + (r.endMs - r.startMs),
          0,
        );
        const removedTotal = plan.removeRanges.reduce(
          (sum, r) => sum + (r.endMs - r.startMs),
          0,
        );
        expect(keptTotal + removedTotal).toBe(audio.sourceDurationMs);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('blocks with a speech-conflict error and leaves the source unmodified when a requested range overlaps speech (Req 12.3)', () => {
    fc.assert(
      fc.property(
        analyzedAudioArb.filter((a) => a.speechSegments.length > 0),
        fc.integer({ min: 0, max: 1_000 }),
        (audio, offset) => {
          // Build a requested range that provably overlaps a speech segment.
          const speech = audio.speechSegments[offset % audio.speechSegments.length];
          const requestedRange: TimeRangeMs = {
            startMs: speech.startMs,
            endMs: Math.min(audio.sourceDurationMs, speech.startMs + 1),
          };

          const plan = planSilenceRemoval({
            requested: true,
            silenceSegments: audio.silenceSegments,
            speechSegments: audio.speechSegments,
            sourceDurationMs: audio.sourceDurationMs,
            requestedRanges: [requestedRange],
          });

          // The whole operation is blocked (no removal, source unmodified).
          expect(plan.ok).toBe(false);
          if (!plan.ok) {
            expect(plan.errorCode).toBe(SILENCE_REMOVAL_SPEECH_CONFLICT);
            expect(plan.conflicts.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('when requested with explicit ranges that succeed: removal is confined to silence AND the request, never touching speech (Req 8.5, 12.2, 12.3)', () => {
    fc.assert(
      fc.property(
        analyzedAudioArb.chain((audio) =>
          fc.record({
            audio: fc.constant(audio),
            // At least one explicit range: an empty list falls back to
            // "remove all analysis silence" (a separate, already-covered case).
            requestedRanges: fc.array(rangeWithinArb(audio.sourceDurationMs), {
              minLength: 1,
              maxLength: 6,
            }),
          }),
        ),
        ({ audio, requestedRanges }) => {
          const plan = planSilenceRemoval({
            requested: true,
            silenceSegments: audio.silenceSegments,
            speechSegments: audio.speechSegments,
            sourceDurationMs: audio.sourceDurationMs,
            requestedRanges,
          });

          if (!plan.ok) {
            // A block only ever happens for a speech conflict here.
            expect(plan.errorCode).toBe(SILENCE_REMOVAL_SPEECH_CONFLICT);
            expect(plan.conflicts.length).toBeGreaterThan(0);
            return;
          }

          // On success: every removed point is inside analysis silence AND inside
          // some requested range, and never inside speech.
          for (const r of plan.removeRanges) {
            const mid = Math.floor((r.startMs + r.endMs) / 2);
            expect(inSome(mid, audio.silenceSegments)).toBe(true);
            expect(inSome(mid, requestedRanges)).toBe(true);
            expect(inSome(mid, audio.speechSegments)).toBe(false);
          }
          // Speech stays present and uncut.
          expect(
            speechFullyPreserved(
              audio.speechSegments,
              plan.keepRanges,
              audio.sourceDurationMs,
            ),
          ).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Property 32: Original voice is byte-identical unless a voice change is
// requested.
// Validates: Requirements 12.4
//
// The pure core decides whether the service must stream-copy the source audio
// (`-c:a copy`) — which is what guarantees byte-for-byte voice preservation. We
// model output bytes as a deterministic function of that decision: when the
// core says "preserve", the emitted voice bytes equal the source bytes exactly;
// only an explicit voice-change request may alter them.
// ===========================================================================

describe('Property 32: Original voice is byte-identical unless a voice change is requested (Req 12.4)', () => {
  /** Model the audio pipeline's byte output from the preservation decision. */
  function pipelineVoiceBytes(
    sourceBytes: readonly number[],
    intent: AudioProcessingIntent,
  ): readonly number[] {
    if (mustPreserveOriginalVoice(intent)) {
      // Stream-copy: output bytes are the source bytes, untouched.
      return sourceBytes;
    }
    // A voice change was explicitly requested — re-encode is permitted.
    return sourceBytes.map((b) => (b + 1) & 0xff);
  }

  const sourceBytesArb = fc.array(fc.integer({ min: 0, max: 255 }), {
    minLength: 0,
    maxLength: 256,
  });

  it('preserves the original voice byte-for-byte whenever no voice change is requested', () => {
    fc.assert(
      fc.property(sourceBytesArb, (sourceBytes) => {
        const intent: AudioProcessingIntent = { voiceChangeRequested: false };
        expect(mustPreserveOriginalVoice(intent)).toBe(true);
        const output = pipelineVoiceBytes(sourceBytes, intent);
        expect(output).toEqual(sourceBytes);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('only an explicit voice-change request permits altering the voice bytes', () => {
    fc.assert(
      fc.property(fc.boolean(), (voiceChangeRequested) => {
        const intent: AudioProcessingIntent = { voiceChangeRequested };
        // Preservation is required exactly when no change was requested.
        expect(mustPreserveOriginalVoice(intent)).toBe(!voiceChangeRequested);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
