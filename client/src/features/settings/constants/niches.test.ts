import { describe, it, expect } from 'vitest';
import { NICHE_OPTIONS, nicheLabel, nicheOptionsWith } from './niches';

describe('nicheLabel', () => {
  it('returns the human label for a known niche value', () => {
    expect(nicheLabel('fitness')).toBe('Fitness & Health');
    expect(nicheLabel('tech')).toBe('Tech & AI');
  });

  it('returns the raw value for an unknown niche', () => {
    expect(nicheLabel('underwater-basket-weaving')).toBe('underwater-basket-weaving');
  });

  it('returns "Not set" for empty/undefined', () => {
    expect(nicheLabel(undefined)).toBe('Not set');
    expect(nicheLabel('')).toBe('Not set');
  });
});

describe('nicheOptionsWith', () => {
  it('returns the canonical list unchanged for a known value', () => {
    const opts = nicheOptionsWith('fitness');
    expect(opts).toEqual(NICHE_OPTIONS);
  });

  it('returns the canonical list unchanged when no value is provided', () => {
    expect(nicheOptionsWith(undefined)).toEqual(NICHE_OPTIONS);
    expect(nicheOptionsWith('')).toEqual(NICHE_OPTIONS);
  });

  it('prepends a legacy/free-text value not in the canonical list so it can render', () => {
    const opts = nicheOptionsWith('real estate automation');
    expect(opts[0]).toEqual({ value: 'real estate automation', label: 'real estate automation' });
    // The canonical options are still present after the injected one.
    expect(opts.length).toBe(NICHE_OPTIONS.length + 1);
    expect(opts.some(o => o.value === 'tech')).toBe(true);
  });

  it('does not duplicate a value that already exists in the canonical list', () => {
    const opts = nicheOptionsWith('education');
    const educationCount = opts.filter(o => o.value === 'education').length;
    expect(educationCount).toBe(1);
  });
});
