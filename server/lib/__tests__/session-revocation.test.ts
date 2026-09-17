import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { isSessionVersionStale } from '../session-revocation';

/**
 * Requirement 15.3 — a session presenting a stale Session_Version must be
 * rejected.
 *
 * `isSessionVersionStale` is the pure comparison at the heart of revocation, so
 * it is tested directly. The surrounding `checkSessionRevoked` adds caching and
 * datastore access; its fail-closed behaviour is covered separately below with
 * the datastore mocked.
 */

describe('isSessionVersionStale', () => {
  it('accepts a token whose version matches the user', () => {
    expect(isSessionVersionStale(3, 3)).toBe(false);
  });

  it('rejects a token whose version is behind the user (post-logout bump)', () => {
    expect(isSessionVersionStale(2, 3)).toBe(true);
  });

  it('rejects a token whose version is ahead of the user', () => {
    // Should never happen, but a mismatch in either direction means the token
    // does not correspond to the user's current session generation.
    expect(isSessionVersionStale(4, 3)).toBe(true);
  });

  it('treats a missing claim as acceptable (fail-open for legacy tokens)', () => {
    // Rejecting here would sign out every user holding a token minted before the
    // claim existed. Freshly minted tokens all carry it.
    expect(isSessionVersionStale(undefined, 3)).toBe(false);
    expect(isSessionVersionStale(null, 3)).toBe(false);
  });

  it('defaults an absent user version to 1', () => {
    expect(isSessionVersionStale(1, undefined)).toBe(false);
    expect(isSessionVersionStale(2, undefined)).toBe(true);
  });

  it('compares numerically across string and number representations', () => {
    // JWT claims can arrive as strings; a type difference must not read as stale.
    expect(isSessionVersionStale('3', 3)).toBe(false);
    expect(isSessionVersionStale('2', 3)).toBe(true);
  });

  it('treats malformed versions as version 1 rather than throwing', () => {
    expect(isSessionVersionStale('not-a-number', 1)).toBe(false);
    expect(isSessionVersionStale('not-a-number', 5)).toBe(true);
  });
});

describe('checkSessionRevoked', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('accepts immediately when the token carries no version claim', async () => {
    // Must not even consult the datastore — this keeps legacy tokens free.
    const findById = vi.fn();
    vi.doMock('../../models/User/User', () => ({ User: { findById } }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => {
        throw new Error('redis unavailable');
      },
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', undefined)).resolves.toEqual({ revoked: false });
    expect(findById).not.toHaveBeenCalled();
  });

  it('accepts when the stored version matches the claim', async () => {
    vi.doMock('../../models/User/User', () => ({
      User: {
        findById: () => ({
          select: () => ({ lean: async () => ({ sessionVersion: 7 }) }),
        }),
      },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => {
        throw new Error('no cache');
      },
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', 7)).resolves.toEqual({ revoked: false });
  });

  it('rejects a stale claim as session_invalidated', async () => {
    vi.doMock('../../models/User/User', () => ({
      User: {
        findById: () => ({
          select: () => ({ lean: async () => ({ sessionVersion: 8 }) }),
        }),
      },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => {
        throw new Error('no cache');
      },
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', 7)).resolves.toEqual({
      revoked: true,
      reason: 'session_invalidated',
    });
  });

  it('FAILS CLOSED when the version cannot be determined (Requirement 6.7)', async () => {
    // Datastore unavailable while the token DOES carry a claim. An availability
    // problem must never become an authorization bypass.
    vi.doMock('../../models/User/User', () => ({
      User: {
        findById: () => ({
          select: () => ({
            lean: async () => {
              throw new Error('db down');
            },
          }),
        }),
      },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => {
        throw new Error('no cache');
      },
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', 7)).resolves.toEqual({
      revoked: true,
      reason: 'revocation_check_failed',
    });
  });

  it('fails closed when the user no longer exists', async () => {
    vi.doMock('../../models/User/User', () => ({
      User: {
        findById: () => ({ select: () => ({ lean: async () => null }) }),
      },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => {
        throw new Error('no cache');
      },
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('deleted-user', 1)).resolves.toEqual({
      revoked: true,
      reason: 'revocation_check_failed',
    });
  });

  it('uses the cached version and avoids hitting the database (Requirement 6.6)', async () => {
    const lean = vi.fn();
    vi.doMock('../../models/User/User', () => ({
      User: { findById: () => ({ select: () => ({ lean }) }) },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => ({
        get: async () => '5',
        set: async () => 'OK',
        del: async () => 1,
      }),
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', 5)).resolves.toEqual({ revoked: false });
    expect(lean).not.toHaveBeenCalled();
  });

  it('rejects a stale claim using the cached version', async () => {
    vi.doMock('../../models/User/User', () => ({
      User: { findById: () => ({ select: () => ({ lean: vi.fn() }) }) },
    }));
    vi.doMock('../redis', () => ({
      getRedisClient: () => ({
        get: async () => '9',
        set: async () => 'OK',
        del: async () => 1,
      }),
    }));

    const { checkSessionRevoked } = await import('../session-revocation');
    await expect(checkSessionRevoked('user-1', 8)).resolves.toEqual({
      revoked: true,
      reason: 'session_invalidated',
    });
  });
});
