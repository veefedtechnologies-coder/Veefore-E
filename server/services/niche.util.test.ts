import { describe, it, expect } from 'vitest';
import { resolveNiche, resolveNicheOrDefault, syncNicheUpdate, DEFAULT_NICHE } from './niche.util';

describe('resolveNiche', () => {
  it('prefers the top-level niche', () => {
    expect(resolveNiche({ niche: 'fitness', preferences: { contentNiche: 'tech' } })).toBe('fitness');
  });

  it('falls back to preferences.contentNiche', () => {
    expect(resolveNiche({ preferences: { contentNiche: 'tech' } })).toBe('tech');
  });

  it('trims whitespace', () => {
    expect(resolveNiche({ niche: '  fitness  ' })).toBe('fitness');
  });

  it('returns undefined when nothing is set', () => {
    expect(resolveNiche({})).toBeUndefined();
    expect(resolveNiche(null)).toBeUndefined();
  });
});

describe('resolveNicheOrDefault', () => {
  it('returns the resolved niche when present', () => {
    expect(resolveNicheOrDefault({ niche: 'tech' })).toBe('tech');
  });

  it('returns the platform default when absent', () => {
    expect(resolveNicheOrDefault({})).toBe(DEFAULT_NICHE);
  });

  it('honors a custom fallback', () => {
    expect(resolveNicheOrDefault({}, 'business')).toBe('business');
  });
});

describe('syncNicheUpdate', () => {
  it('mirrors a top-level niche into preferences.contentNiche', () => {
    const patch = syncNicheUpdate({ niche: 'fitness' }, { bio: 'hello' });
    expect(patch.niche).toBe('fitness');
    expect(patch.preferences.contentNiche).toBe('fitness');
    // Existing preferences are preserved.
    expect(patch.preferences.bio).toBe('hello');
  });

  it('mirrors preferences.contentNiche up to the top-level niche', () => {
    const patch = syncNicheUpdate({ preferences: { contentNiche: 'tech' } }, {});
    expect(patch.niche).toBe('tech');
    expect(patch.preferences.contentNiche).toBe('tech');
  });

  it('lets an explicit top-level niche win over preferences.contentNiche', () => {
    const patch = syncNicheUpdate(
      { niche: 'fitness', preferences: { contentNiche: 'tech' } },
      {}
    );
    expect(patch.niche).toBe('fitness');
    expect(patch.preferences.contentNiche).toBe('fitness');
  });

  it('does not touch niche when the update has no niche-related fields', () => {
    const patch = syncNicheUpdate({ displayName: 'Arpit' }, { contentNiche: 'tech' });
    expect(patch.displayName).toBe('Arpit');
    expect(patch.niche).toBeUndefined();
    // No preferences object is forced when there is no niche change.
    expect(patch.preferences).toBeUndefined();
  });

  it('preserves unrelated incoming preference keys while syncing niche', () => {
    const patch = syncNicheUpdate(
      { niche: 'tech', preferences: { primaryPlatform: 'instagram' } },
      { bio: 'existing' }
    );
    expect(patch.preferences.contentNiche).toBe('tech');
    expect(patch.preferences.primaryPlatform).toBe('instagram');
    expect(patch.preferences.bio).toBe('existing');
  });

  it('ignores empty/whitespace-only niche values', () => {
    const patch = syncNicheUpdate({ niche: '   ' }, {});
    expect(patch.niche).toBeUndefined();
  });
});
