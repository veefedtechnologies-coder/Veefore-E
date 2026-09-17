import { describe, it, expect } from 'vitest';

import { classifyCredentialPath } from '../credential-rate-limit';

/**
 * Requirement 9 — credential endpoints must be rate limited, WITHOUT producing
 * false 429s during normal use (9.3).
 *
 * The classification is the crux: interactive credential verification and
 * client-driven session upkeep have very different legitimate volumes, so they must
 * land in different buckets. Misclassifying `/session-login` as a verification
 * endpoint would reintroduce exactly the false-429 bug the original narrowing fixed.
 */

describe('classifyCredentialPath', () => {
  it.each([
    '/signin',
    '/api/auth/signin',
    '/signup',
    '/login',
    '/reset-password',
  ])('classifies %s as interactive verification (tight bucket)', (path) => {
    expect(classifyCredentialPath(path)).toBe('verification');
  });

  it.each([
    '/session-login',
    '/api/auth/session-login',
    '/update-token',
    '/api/auth/update-token',
    '/refresh',
    '/session',
  ])('classifies %s as session maintenance (generous bucket)', (path) => {
    expect(classifyCredentialPath(path)).toBe('maintenance');
  });

  it('does NOT mistake /session-login for a login-verification path', () => {
    // REGRESSION GUARD: a looser substring match would classify this as
    // verification and throttle it to ~10/min. It fires on every page load, so the
    // result would be spurious 429s on sign-in — the original bug.
    expect(classifyCredentialPath('/api/auth/session-login')).toBe('maintenance');
  });

  it.each([
    '/api/workspaces',
    '/api/user',
    '/api/auth/google/start',
    '/api/content/workspace/abc',
  ])('leaves non-credential path %s unthrottled by this limiter', (path) => {
    expect(classifyCredentialPath(path)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyCredentialPath('/API/AUTH/SIGNIN')).toBe('verification');
  });
});
