import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  isAbsolutelyExpired,
  isIdleExpired,
  idleTimeoutSeconds,
  absoluteTimeoutSeconds,
  lifetimeLimitsEnabled,
} from '../session-lifetime';

/**
 * Requirement 7 — session lifetime limits.
 *
 * The subtle requirement is 7.5: continued activity must NOT extend the absolute
 * limit. If it did, a continuously active session would never expire and the limit
 * would be decorative. That is why the absolute age is derived from the token's
 * signed `auth_time`/`iat` claim rather than from any server-side activity marker.
 */

const ORIGINAL_ENV = { ...process.env };
const NOW = 1_700_000_000_000; // fixed clock, ms
const SECOND = 1000;
const DAY = 24 * 60 * 60;

beforeEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('SECURITY_SESSION_')) delete process.env[k];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('configuration (Requirement 7.3)', () => {
  it('exposes defaults for both limits', () => {
    expect(idleTimeoutSeconds()).toBe(7 * DAY);
    expect(absoluteTimeoutSeconds()).toBe(30 * DAY);
  });

  it('honours explicit overrides', () => {
    process.env.SECURITY_SESSION_IDLE_SECONDS = '3600';
    process.env.SECURITY_SESSION_ABSOLUTE_SECONDS = '86400';
    expect(idleTimeoutSeconds()).toBe(3600);
    expect(absoluteTimeoutSeconds()).toBe(86400);
  });

  it('ignores a non-numeric or non-positive override', () => {
    process.env.SECURITY_SESSION_IDLE_SECONDS = 'banana';
    expect(idleTimeoutSeconds()).toBe(7 * DAY);
    process.env.SECURITY_SESSION_IDLE_SECONDS = '-5';
    expect(idleTimeoutSeconds()).toBe(7 * DAY);
  });

  it('is enabled by default and can be turned off', () => {
    expect(lifetimeLimitsEnabled()).toBe(true);
    process.env.SECURITY_SESSION_LIFETIME_ENABLED = 'false';
    expect(lifetimeLimitsEnabled()).toBe(false);
  });
});

describe('absolute timeout (Requirements 7.2, 7.5)', () => {
  /** auth_time is in SECONDS since epoch, per the JWT convention. */
  const authTimeSecondsAgo = (s: number) => NOW / 1000 - s;

  it('does not expire a session within the cap', () => {
    expect(isAbsolutelyExpired(authTimeSecondsAgo(10 * DAY), NOW, 30 * DAY)).toBe(false);
  });

  it('EXPIRES a session older than the cap', () => {
    expect(isAbsolutelyExpired(authTimeSecondsAgo(31 * DAY), NOW, 30 * DAY)).toBe(true);
  });

  it('is measured from original authentication, so activity cannot extend it', () => {
    // The only input is the signed auth_time claim — there is no activity parameter
    // that could push this boundary out. A session authenticated 31 days ago is
    // expired no matter how recently it was used.
    const authTime = authTimeSecondsAgo(31 * DAY);
    expect(isAbsolutelyExpired(authTime, NOW, 30 * DAY)).toBe(true);
    // Same claim evaluated a second later is still expired.
    expect(isAbsolutelyExpired(authTime, NOW + SECOND, 30 * DAY)).toBe(true);
  });

  it('treats an absent claim as not expired (legacy tokens keep working)', () => {
    expect(isAbsolutelyExpired(undefined, NOW, 30 * DAY)).toBe(false);
    expect(isAbsolutelyExpired(null, NOW, 30 * DAY)).toBe(false);
  });

  it('treats a malformed claim as not expired rather than throwing', () => {
    expect(isAbsolutelyExpired('not-a-number', NOW, 30 * DAY)).toBe(false);
    expect(isAbsolutelyExpired(0, NOW, 30 * DAY)).toBe(false);
  });

  it('tolerates clock skew producing a future auth_time', () => {
    // A negative age must not be read as a huge age.
    expect(isAbsolutelyExpired(NOW / 1000 + 60, NOW, 30 * DAY)).toBe(false);
  });

  it('accepts a string claim', () => {
    expect(isAbsolutelyExpired(String(authTimeSecondsAgo(31 * DAY)), NOW, 30 * DAY)).toBe(true);
  });
});

describe('idle timeout (Requirement 7.1)', () => {
  it('does not expire a recently active session', () => {
    expect(isIdleExpired(NOW - 60 * SECOND, NOW, 7 * DAY)).toBe(false);
  });

  it('EXPIRES a session idle beyond the window', () => {
    expect(isIdleExpired(NOW - 8 * DAY * SECOND, NOW, 7 * DAY)).toBe(true);
  });

  it('treats no recorded activity as active (cache miss must not log users out)', () => {
    expect(isIdleExpired(null, NOW, 7 * DAY)).toBe(false);
  });

  it('tolerates a future timestamp from clock skew', () => {
    expect(isIdleExpired(NOW + 60 * SECOND, NOW, 7 * DAY)).toBe(false);
  });

  it('is a sliding window — the boundary moves with the last activity', () => {
    const idle = 60; // seconds
    expect(isIdleExpired(NOW - 59 * SECOND, NOW, idle)).toBe(false);
    expect(isIdleExpired(NOW - 61 * SECOND, NOW, idle)).toBe(true);
  });
});
