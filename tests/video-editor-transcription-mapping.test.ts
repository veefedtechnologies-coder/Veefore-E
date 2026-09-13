/**
 * Unit tests for the PURE Whisper `verbose_json` → `CaptionSegment[]` mapping,
 * with a focus on the hallucination-suppression filter (No-Mock correctness).
 *
 * Whisper invents plausible-looking words on non-speech audio (engine/road
 * noise, music). `mapWhisperToCaptionSegments` drops hallucination-likely
 * segments using the standard per-segment quality signals so a noise-only clip
 * yields ZERO caption segments (the driver then skips captions honestly) rather
 * than burning in a bogus word. When those fields are absent (older responses)
 * the mapping falls back to prior behaviour and does not over-drop.
 *
 * No network, no ffmpeg — the mapping is pure and total.
 *
 * Framework: vitest.
 */

import { describe, it, expect } from 'vitest';

import {
  mapWhisperToCaptionSegments,
  mapWhisperToCaptionSegmentsWithDiagnostics,
} from '../server/features/video-editor/services/transcription.service';

describe('mapWhisperToCaptionSegments — hallucination suppression', () => {
  it('(a) drops a high no_speech_prob segment (noise misheard as speech)', () => {
    const segments = mapWhisperToCaptionSegments({
      text: 'from',
      segments: [{ start: 0, end: 2, text: ' from', no_speech_prob: 0.9 }],
    });
    expect(segments).toEqual([]);
  });

  it('(a2) drops a very-low avg_logprob segment (low confidence)', () => {
    const segments = mapWhisperToCaptionSegments({
      segments: [{ start: 0, end: 2, text: ' from', avg_logprob: -1.5 }],
    });
    expect(segments).toEqual([]);
  });

  it('(b) keeps a genuine, confident segment', () => {
    const segments = mapWhisperToCaptionSegments({
      text: 'Hello world',
      segments: [
        {
          start: 0,
          end: 1.5,
          text: 'Hello world',
          no_speech_prob: 0.02,
          avg_logprob: -0.2,
          compression_ratio: 1.1,
        },
      ],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startMs: 0, endMs: 1500, text: 'Hello world' });
  });

  it('(c) drops a degenerate/repetitive high compression_ratio segment', () => {
    const segments = mapWhisperToCaptionSegments({
      segments: [
        {
          start: 0,
          end: 3,
          text: 'you you you you you you you you',
          compression_ratio: 3.0,
        },
      ],
    });
    expect(segments).toEqual([]);
  });

  it('drops punctuation-only and single very-short-token segments', () => {
    const segments = mapWhisperToCaptionSegments({
      segments: [
        { start: 0, end: 1, text: '...' },
        { start: 1, end: 2, text: 'a' },
        { start: 2, end: 3, text: 'ok ok ok' },
      ],
    });
    expect(segments).toEqual([]);
  });

  it('falls back to prior behaviour when quality fields are ABSENT (no over-drop)', () => {
    // No no_speech_prob / avg_logprob / compression_ratio present → keep the
    // confident-looking real text as before.
    const segments = mapWhisperToCaptionSegments({
      segments: [
        { start: 0, end: 1.2, text: 'The quick brown fox' },
        { start: 1.2, end: 2.4, text: 'jumps over the dog' },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('The quick brown fox');
    expect(segments[1].text).toBe('jumps over the dog');
  });

  it('keeps only the genuine segment when noise + speech are mixed', () => {
    const segments = mapWhisperToCaptionSegments({
      segments: [
        { start: 0, end: 2, text: ' from', no_speech_prob: 0.85 },
        {
          start: 2,
          end: 4,
          text: 'welcome to the show',
          no_speech_prob: 0.03,
          avg_logprob: -0.3,
          compression_ratio: 1.2,
        },
      ],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('welcome to the show');
  });

  it('does NOT resurrect hallucinated words via the top-level word fallback', () => {
    // Every structurally-usable segment is a hallucination; top-level words carry
    // the same bogus token. The word fallback must NOT fire → zero segments.
    const segments = mapWhisperToCaptionSegments({
      segments: [{ start: 0, end: 2, text: ' from', no_speech_prob: 0.9 }],
      words: [{ word: ' from', start: 0, end: 2 }],
    });
    expect(segments).toEqual([]);
  });
});

describe('mapWhisperToCaptionSegmentsWithDiagnostics — diagnostics reporting', () => {
  it('reports the SAME segments as mapWhisperToCaptionSegments (behaviour unchanged)', () => {
    const responses = [
      null,
      undefined,
      {} as const,
      { text: 'from', segments: [{ start: 0, end: 2, text: ' from', no_speech_prob: 0.9 }] },
      {
        segments: [
          { start: 0, end: 2, text: ' from', no_speech_prob: 0.85 },
          {
            start: 2,
            end: 4,
            text: 'welcome to the show',
            no_speech_prob: 0.03,
            avg_logprob: -0.3,
            compression_ratio: 1.2,
          },
        ],
      },
      {
        segments: [{ start: 0, end: 1, text: 'Hi there' }],
        words: [
          { word: 'Hi', start: 0, end: 0.4 },
          { word: 'there', start: 0.4, end: 1 },
        ],
      },
      { words: [{ word: 'solo', start: 1, end: 2 }] },
    ];
    for (const response of responses) {
      const viaWrapper = mapWhisperToCaptionSegments(response as never);
      const { segments } = mapWhisperToCaptionSegmentsWithDiagnostics(response as never);
      expect(segments).toEqual(viaWrapper);
    }
  });

  it('multi-segment speech: counts every kept segment and its span', () => {
    const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics({
      segments: [
        { start: 0, end: 1.5, text: 'Hello world', words: [{ word: 'Hello', start: 0, end: 0.7 }] },
        { start: 1.5, end: 3, text: 'this is a real caption' },
        { start: 3, end: 4.2, text: 'across the whole clip' },
      ],
    });
    expect(segments).toHaveLength(3);
    expect(diagnostics.rawSegmentCount).toBe(3);
    expect(diagnostics.structurallyUsableSegments).toBe(3);
    expect(diagnostics.droppedByHallucination).toBe(0);
    expect(diagnostics.keptSegmentCount).toBe(3);
    expect(diagnostics.mappedSpanMs).toEqual({ minStartMs: 0, maxEndMs: 4200 });
    expect(diagnostics.rawTranscriptSpanMs).toEqual({ minStartMs: 0, maxEndMs: 4200 });
    expect(diagnostics.segmentsWithWordTiming).toBe(1);
    expect(diagnostics.segmentPreview).toHaveLength(3);
    expect(diagnostics.segmentPreview[0]).toMatchObject({
      startMs: 0,
      endMs: 1500,
      hadWords: true,
      droppedByHallucination: false,
    });
  });

  it('all-hallucination-dropped: keptSegmentCount 0, droppedByHallucination counts all', () => {
    const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics({
      segments: [
        { start: 0, end: 2, text: ' from', no_speech_prob: 0.9 },
        { start: 2, end: 4, text: 'you you you you you', compression_ratio: 3.0 },
      ],
    });
    expect(segments).toEqual([]);
    expect(diagnostics.rawSegmentCount).toBe(2);
    expect(diagnostics.structurallyUsableSegments).toBe(2);
    expect(diagnostics.droppedByHallucination).toBe(2);
    expect(diagnostics.keptSegmentCount).toBe(0);
    expect(diagnostics.mappedSpanMs).toEqual({ minStartMs: null, maxEndMs: null });
    // Raw span still reflects what Whisper THINKS it heard, even though dropped.
    expect(diagnostics.rawTranscriptSpanMs).toEqual({ minStartMs: 0, maxEndMs: 4000 });
    expect(diagnostics.segmentPreview).toHaveLength(2);
    expect(diagnostics.segmentPreview.every((p) => p.droppedByHallucination)).toBe(true);
  });

  it('coarse single segment + top-level words spanning beyond it (the ~2s bug)', () => {
    // Whisper returns ONE short segment but top-level words span the whole clip.
    // The mapping keeps the single segment (structurally usable), so mappedSpan
    // is tiny while rawTranscriptSpan reflects the full word coverage — exactly
    // the signal that explains "captions only cover ~2s".
    const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics({
      segments: [{ start: 0, end: 2, text: 'Welcome everyone' }],
      words: [
        { word: 'Welcome', start: 0, end: 0.8 },
        { word: 'everyone', start: 0.8, end: 2 },
        { word: 'to', start: 5, end: 5.3 },
        { word: 'the', start: 5.3, end: 5.6 },
        { word: 'show', start: 5.6, end: 6.2 },
      ],
    });
    expect(segments).toHaveLength(1);
    expect(diagnostics.rawSegmentCount).toBe(1);
    expect(diagnostics.structurallyUsableSegments).toBe(1);
    expect(diagnostics.keptSegmentCount).toBe(1);
    expect(diagnostics.rawTopLevelWordCount).toBe(5);
    expect(diagnostics.usableTopLevelWordCount).toBe(5);
    // Mapped span is only the single coarse segment...
    expect(diagnostics.mappedSpanMs).toEqual({ minStartMs: 0, maxEndMs: 2000 });
    // ...while Whisper's words reach 6.2s → the coverage gap is visible.
    expect(diagnostics.rawTranscriptSpanMs).toEqual({ minStartMs: 0, maxEndMs: 6200 });
  });

  it('empty response: all counters zero and spans null', () => {
    const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics({});
    expect(segments).toEqual([]);
    expect(diagnostics).toMatchObject({
      rawSegmentCount: 0,
      structurallyUsableSegments: 0,
      droppedByHallucination: 0,
      keptSegmentCount: 0,
      rawTopLevelWordCount: 0,
      usableTopLevelWordCount: 0,
      rawTranscriptSpanMs: { minStartMs: null, maxEndMs: null },
      mappedSpanMs: { minStartMs: null, maxEndMs: null },
      segmentsWithWordTiming: 0,
    });
    expect(diagnostics.segmentPreview).toEqual([]);
  });

  it('caps the per-segment preview at 40 entries while counting all segments', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      start: i,
      end: i + 0.5,
      text: `caption number ${i}`,
    }));
    const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics({ segments: many });
    expect(segments).toHaveLength(50);
    expect(diagnostics.rawSegmentCount).toBe(50);
    expect(diagnostics.keptSegmentCount).toBe(50);
    expect(diagnostics.segmentPreview).toHaveLength(40);
  });
});
