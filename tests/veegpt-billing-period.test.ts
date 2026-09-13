/**
 * Billing-period resolution (spec §13).
 *
 * Quota must follow the subscription's own period, not the calendar. Getting this
 * wrong either grants a free early reset or strands usage across two periods.
 */

import { describe, it, expect } from 'vitest';
import { calendarPeriod } from '../server/services/veegpt-billing-period';

describe('calendar fallback period', () => {
  it('spans exactly the containing UTC month', () => {
    const p = calendarPeriod(new Date('2026-08-09T12:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(p.id).toBe('cal:2026-08');
    expect(p.calendarFallback).toBe(true);
  });

  it('rolls over across a year boundary', () => {
    const p = calendarPeriod(new Date('2026-12-31T23:59:00Z'));
    expect(p.id).toBe('cal:2026-12');
    expect(p.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles February in a leap year', () => {
    const p = calendarPeriod(new Date('2028-02-29T10:00:00Z'));
    expect(p.id).toBe('cal:2028-02');
    expect(p.end.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  it('reports a positive time remaining, even at the last instant', () => {
    const p = calendarPeriod(new Date('2026-08-31T23:59:59.999Z'));
    expect(p.secondsRemaining).toBeGreaterThan(0);
  });

  it('gives distinct ids to distinct months so counters cannot collide', () => {
    const a = calendarPeriod(new Date('2026-08-31T23:00:00Z'));
    const b = calendarPeriod(new Date('2026-09-01T01:00:00Z'));
    expect(a.id).not.toBe(b.id);
  });

  it('always produces a window that contains the instant it was asked about', () => {
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-06-15T13:37:00Z',
      '2026-12-31T23:59:59Z',
      '2027-02-28T12:00:00Z',
    ]) {
      const at = new Date(iso);
      const p = calendarPeriod(at);
      expect(p.start.getTime()).toBeLessThanOrEqual(at.getTime());
      expect(p.end.getTime()).toBeGreaterThan(at.getTime());
    }
  });
});
