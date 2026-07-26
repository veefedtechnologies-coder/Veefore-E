import { describe, it, expect } from 'vitest';
import { deriveFormFromUser } from './deriveFormFromUser';

/**
 * Tests for niche resolution in the profile form.
 *
 * The niche is stored in two places that must stay consistent:
 *   - user.niche                    (top-level, used by social listening)
 *   - user.preferences.contentNiche (used by all AI features)
 *
 * deriveFormFromUser is the single source of truth for what the Settings form
 * displays. These tests lock in the resolution + fallback behavior so the
 * "saved niche shows empty after refresh" regression can't return.
 */
describe('deriveFormFromUser - niche resolution', () => {
  it('prefers preferences.contentNiche when present', () => {
    const form = deriveFormFromUser({
      businessType: 'solo',
      niche: 'fitness',
      preferences: { contentNiche: 'education' },
    });
    expect(form.contentNiche).toBe('education');
  });

  it('falls back to top-level niche when preferences.contentNiche is missing', () => {
    const form = deriveFormFromUser({
      businessType: 'solo',
      niche: 'fitness',
      preferences: {},
    });
    expect(form.contentNiche).toBe('fitness');
  });

  it('falls back to top-level niche when preferences is undefined', () => {
    const form = deriveFormFromUser({
      businessType: 'solo',
      niche: 'tech',
    });
    expect(form.contentNiche).toBe('tech');
  });

  it('returns empty string when no niche is set anywhere', () => {
    const form = deriveFormFromUser({ businessType: 'solo' });
    expect(form.contentNiche).toBe('');
  });

  it('maps the niche into agencyNiche for agency profiles', () => {
    const form = deriveFormFromUser({
      businessType: 'agency',
      niche: 'marketing',
      preferences: {},
    });
    expect(form.agencyNiche).toBe('marketing');
  });

  it('prefers explicit preferences.agencyNiche over top-level niche for agencies', () => {
    const form = deriveFormFromUser({
      businessType: 'agency',
      niche: 'marketing',
      preferences: { agencyNiche: 'finance' },
    });
    expect(form.agencyNiche).toBe('finance');
  });

  it('does not leak the niche into agencyNiche for non-agency profiles', () => {
    const form = deriveFormFromUser({
      businessType: 'solo',
      niche: 'fitness',
      preferences: {},
    });
    expect(form.agencyNiche).toBe('');
  });
});

describe('deriveFormFromUser - defaults and safety', () => {
  it('returns safe defaults for null/undefined user', () => {
    const form = deriveFormFromUser(undefined);
    expect(form.businessType).toBe('solo');
    expect(form.contentNiche).toBe('');
    expect(form.timezone).toBe('Asia/Kolkata (IST)');
    expect(form.language).toBe('English (US)');
    expect(form.displayName).toBe('');
  });

  it('hydrates basic and preference-backed fields', () => {
    const form = deriveFormFromUser({
      displayName: 'Arpit Choudhary',
      username: 'choudharyarpit977',
      businessType: 'solo',
      niche: 'education',
      preferences: {
        contentNiche: 'education',
        bio: 'Creator',
        phone: '+1 555',
        primaryPlatform: 'instagram',
        creatorAudienceSize: '1k-10k',
        postingFrequency: 'daily',
        timezone: 'Europe/London (GMT)',
        language: 'English (UK)',
      },
    });
    expect(form.displayName).toBe('Arpit Choudhary');
    expect(form.username).toBe('choudharyarpit977');
    expect(form.contentNiche).toBe('education');
    expect(form.bio).toBe('Creator');
    expect(form.phone).toBe('+1 555');
    expect(form.primaryPlatform).toBe('instagram');
    expect(form.creatorAudienceSize).toBe('1k-10k');
    expect(form.postingFrequency).toBe('daily');
    expect(form.timezone).toBe('Europe/London (GMT)');
    expect(form.language).toBe('English (UK)');
  });
});
