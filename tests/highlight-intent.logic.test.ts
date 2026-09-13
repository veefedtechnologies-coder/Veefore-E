/**
 * Pure detection/routing tests for the highlight ("editorial brain") verb.
 *
 * Verifies that highlight phrasing is classified as DETERMINISTIC-performable by
 * the same pure classifier the router uses, and that the planner's
 * `deterministicKindFor` routes highlight phrases to the `highlight` kind while
 * STILL routing auto-cut and trim phrases to their own kinds (no regressions).
 * The highlight check must win even for phrases that also contain "cut" (e.g.
 * "cut it down to the best parts") or that look reel-shaped ("highlight reel").
 */

import { describe, it, expect } from 'vitest';
import { classifyRequestedChange } from '../server/features/video-editor/services/intent-extraction.logic';
import { deterministicKindFor } from '../server/features/video-editor/services/editing-planner.logic';

const HIGHLIGHT_PHRASES = [
  'make a 30 second highlight reel',
  'highlight',
  'highlights',
  'best parts',
  'best bits',
  'best moments',
  'make a highlight',
  'highlight reel',
  'find the good parts',
  'keep the good parts',
  'cut it down to the best',
  'make it a 45 second highlight',
  'make it a 15 second reel',
  'summarize the video',
  'shorten to the highlights',
];

describe('highlight intent classification', () => {
  it('classifies highlight phrasing as deterministic', () => {
    for (const phrase of HIGHLIGHT_PHRASES) {
      expect(classifyRequestedChange(phrase)).toBe('deterministic');
    }
  });

  it('classifies the canonical example as deterministic', () => {
    expect(classifyRequestedChange('make a 30 second highlight reel')).toBe('deterministic');
  });
});

describe('deterministicKindFor — highlight routing + no regressions', () => {
  it('routes highlight phrases to the highlight kind', () => {
    for (const phrase of HIGHLIGHT_PHRASES) {
      expect(deterministicKindFor(phrase)).toBe('highlight');
    }
  });

  it('still routes auto-cut phrases to auto_cut (highlight does not steal them)', () => {
    expect(deterministicKindFor('auto cut this')).toBe('auto_cut');
    expect(deterministicKindFor('cut to the beat')).toBe('auto_cut');
    expect(deterministicKindFor('make a montage')).toBe('auto_cut');
    expect(deterministicKindFor('beat sync the cuts')).toBe('auto_cut');
    expect(deterministicKindFor('tighten the pacing')).toBe('auto_cut');
  });

  it('still routes trim phrases to trim', () => {
    expect(deterministicKindFor('trim the first 5 seconds')).toBe('trim');
    expect(deterministicKindFor('shorten it')).toBe('trim');
    expect(deterministicKindFor('snip the ending')).toBe('trim');
  });

  it('still routes other deterministic verbs correctly', () => {
    expect(deterministicKindFor('reframe to 9:16')).toBe('aspect');
    expect(deterministicKindFor('add a caption')).toBe('caption');
    expect(deterministicKindFor('burn in a subtitle')).toBe('caption');
    expect(deterministicKindFor('normalize the audio')).toBe('audio_process');
    expect(deterministicKindFor('remove the silence')).toBe('remove_silence');
    expect(deterministicKindFor('apply a cinematic look')).toBe('filter');
  });
});
