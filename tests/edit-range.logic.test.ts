/**
 * Unit tests for the PURE edit-range parser ({@link parseEditRange}) that decides
 * whether a chat edit instruction targets a specific TIME RANGE (segment) or the
 * WHOLE clip (global).
 *
 * Covers each recognised pattern, clamping to `[0, duration]`, the minimum
 * window, whole-clip → global promotion, the safe global default, and
 * determinism (same input → same output).
 *
 * Framework: vitest. Pure logic — no IO, no network.
 */

import { describe, it, expect } from 'vitest';

import {
  parseEditRange,
  parseTimeToken,
} from '../server/features/video-editor/services/edit-range.logic';

const DUR = 30_000; // 30s working clip for most cases.

describe('parseTimeToken', () => {
  it('parses M:SS timestamps', () => {
    expect(parseTimeToken('0:05')).toBe(5_000);
    expect(parseTimeToken('1:30')).toBe(90_000);
    expect(parseTimeToken('0:00')).toBe(0);
  });

  it('parses bare seconds and explicit second units', () => {
    expect(parseTimeToken('5')).toBe(5_000);
    expect(parseTimeToken('5s')).toBe(5_000);
    expect(parseTimeToken('5 seconds')).toBe(5_000);
    expect(parseTimeToken('5 secs')).toBe(5_000);
    expect(parseTimeToken('2.5 seconds')).toBe(2_500);
  });

  it('parses minutes', () => {
    expect(parseTimeToken('1 minute')).toBe(60_000);
    expect(parseTimeToken('2 mins')).toBe(120_000);
    expect(parseTimeToken('1m')).toBe(60_000);
  });

  it('returns null for non-times', () => {
    expect(parseTimeToken('')).toBeNull();
    expect(parseTimeToken('hello')).toBeNull();
  });
});

describe('parseEditRange — explicit two-sided ranges', () => {
  it('"from 0:05 to 0:10"', () => {
    const scope = parseEditRange('remove the guy from 0:05 to 0:10', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 5_000, endMs: 10_000 });
  });

  it('"0:05-0:10" (dash, no spaces)', () => {
    const scope = parseEditRange('blur 0:05-0:10', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 5_000, endMs: 10_000 });
  });

  it('"between 5 and 10 seconds"', () => {
    const scope = parseEditRange('brighten between 5 and 10 seconds', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 5_000, endMs: 10_000 });
  });
});

describe('parseEditRange — point windows', () => {
  it('"at 0:07" expands to a ±1.5s window', () => {
    const scope = parseEditRange('remove the logo at 0:07', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 5_500, endMs: 8_500 });
  });

  it('a point near the start clamps the window to 0', () => {
    const scope = parseEditRange('fix it at 0:00', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 0, endMs: 1_500 });
  });
});

describe('parseEditRange — single-sided ranges', () => {
  it('"the first 5 seconds" → 0..5', () => {
    const scope = parseEditRange('clean up the first 5 seconds', DUR);
    expect(scope.range).toEqual({ startMs: 0, endMs: 5_000 });
  });

  it('"the last 5 seconds" → dur-5..dur', () => {
    const scope = parseEditRange('remove the watermark in the last 5 seconds', DUR);
    expect(scope.range).toEqual({ startMs: 25_000, endMs: 30_000 });
  });

  it('"after 0:10" → 10..dur', () => {
    const scope = parseEditRange('replace the background after 0:10', DUR);
    expect(scope.range).toEqual({ startMs: 10_000, endMs: 30_000 });
  });

  it('"before 0:05" → 0..5', () => {
    const scope = parseEditRange('remove the intro card before 0:05', DUR);
    expect(scope.range).toEqual({ startMs: 0, endMs: 5_000 });
  });
});

describe('parseEditRange — clamping and minimum window', () => {
  it('clamps an end beyond the clip duration', () => {
    const scope = parseEditRange('from 0:20 to 1:00', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range).toEqual({ startMs: 20_000, endMs: 30_000 });
  });

  it('clamps "the last 5 seconds" on a very short clip and promotes to global', () => {
    // dur=3s, last 5s → 0..3 which covers the whole clip → global.
    const scope = parseEditRange('remove the logo in the last 5 seconds', 3_000);
    expect(scope.mode).toBe('global');
  });

  it('expands a point at the very end to at least the minimum window', () => {
    const scope = parseEditRange('at 0:30', DUR);
    expect(scope.mode).toBe('segment');
    expect(scope.range!.endMs).toBe(30_000);
    expect(scope.range!.endMs - scope.range!.startMs).toBeGreaterThanOrEqual(500);
  });
});

describe('parseEditRange — whole-clip → global', () => {
  it('"from 0:00 to 0:30" (covers the whole clip) → global', () => {
    const scope = parseEditRange('restyle from 0:00 to 0:30', DUR);
    expect(scope.mode).toBe('global');
    expect(scope.range).toBeUndefined();
  });

  it('"the first 30 seconds" on a 30s clip → global', () => {
    const scope = parseEditRange('grade the first 30 seconds', DUR);
    expect(scope.mode).toBe('global');
  });
});

describe('parseEditRange — global indicators and safe default', () => {
  it('"restyle the whole video" → global', () => {
    expect(parseEditRange('restyle the whole video', DUR).mode).toBe('global');
  });

  it('"change the background" (no range) → global', () => {
    expect(parseEditRange('change the background to a beach', DUR).mode).toBe('global');
  });

  it('"make it look like a painting" (no range) → global', () => {
    expect(parseEditRange('make it look like a painting', DUR).mode).toBe('global');
  });

  it('"throughout" / "entire" / "everywhere" → global', () => {
    expect(parseEditRange('brighten it throughout', DUR).mode).toBe('global');
    expect(parseEditRange('sharpen the entire clip', DUR).mode).toBe('global');
    expect(parseEditRange('add a glow everywhere', DUR).mode).toBe('global');
  });

  it('a message with no time and no global word defaults to global', () => {
    expect(parseEditRange('remove the person', DUR).mode).toBe('global');
    expect(parseEditRange('', DUR).mode).toBe('global');
  });

  it('a non-positive duration is always global (no timeline to scope)', () => {
    expect(parseEditRange('from 0:05 to 0:10', 0).mode).toBe('global');
  });
});

describe('parseEditRange — determinism', () => {
  it('returns the same result across repeated calls', () => {
    const msg = 'remove the guy from 0:05 to 0:10';
    const a = parseEditRange(msg, DUR);
    const b = parseEditRange(msg, DUR);
    const c = parseEditRange(msg, DUR);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
