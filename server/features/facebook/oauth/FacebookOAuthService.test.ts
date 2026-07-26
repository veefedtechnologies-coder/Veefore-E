/**
 * Unit tests for FacebookOAuthService
 *
 * Covers: createSession, getSession, deleteSession, TTL expiry, and
 * automatic cleanup via _pruneExpiredSessions.
 *
 * Requirements: 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createSession,
  getSession,
  deleteSession,
  _pruneExpiredSessions,
  _sessionCount,
  _clearAllSessions,
} from './FacebookOAuthService.js'
import type { ManagedPage, OAuthCallbackResult } from '../../social/providers/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ManagedPage> = {}): ManagedPage {
  return {
    pageId: 'page-001',
    pageName: 'Test Page',
    profilePictureUrl: 'https://example.com/pic.jpg',
    pageCategory: 'Media',
    accessToken: 'page-access-token',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    permissions: ['pages_read_engagement'],
    ...overrides,
  }
}

function makeCallbackResult(overrides: Partial<OAuthCallbackResult> = {}): OAuthCallbackResult {
  return {
    longLivedToken: 'long-lived-token-abc',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    userId: 'user-123',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearAllSessions()
  vi.useRealTimers()
})

afterEach(() => {
  _clearAllSessions()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('returns a non-empty string token', () => {
    const token = createSession('ws-1', [makePage()], makeCallbackResult())
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('returns a UUID v4-shaped token', () => {
    const token = createSession('ws-1', [makePage()], makeCallbackResult())
    // UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('creates unique tokens for successive calls', () => {
    const t1 = createSession('ws-1', [], makeCallbackResult())
    const t2 = createSession('ws-1', [], makeCallbackResult())
    expect(t1).not.toBe(t2)
  })

  it('stores workspaceId, pages, and callbackResult', () => {
    const pages = [makePage({ pageId: 'p-abc' })]
    const cb = makeCallbackResult({ userId: 'u-999' })
    const token = createSession('ws-42', pages, cb)
    const session = getSession(token)
    expect(session?.workspaceId).toBe('ws-42')
    expect(session?.pages).toHaveLength(1)
    expect(session?.pages[0].pageId).toBe('p-abc')
    expect(session?.callbackResult.userId).toBe('u-999')
  })

  it('stores multiple pages', () => {
    const pages = [makePage({ pageId: 'p-1' }), makePage({ pageId: 'p-2' }), makePage({ pageId: 'p-3' })]
    const token = createSession('ws-1', pages, makeCallbackResult())
    const session = getSession(token)
    expect(session?.pages).toHaveLength(3)
  })

  it('increments the session count', () => {
    expect(_sessionCount()).toBe(0)
    createSession('ws-1', [], makeCallbackResult())
    createSession('ws-2', [], makeCallbackResult())
    expect(_sessionCount()).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('getSession', () => {
  it('returns null for an unknown token', () => {
    expect(getSession('does-not-exist')).toBeNull()
  })

  it('returns the session data for a valid token', () => {
    const token = createSession('ws-1', [makePage()], makeCallbackResult())
    const session = getSession(token)
    expect(session).not.toBeNull()
    expect(session?.workspaceId).toBe('ws-1')
  })

  it('returns null after session has expired (fake timers)', () => {
    vi.useFakeTimers()
    const token = createSession('ws-1', [], makeCallbackResult())
    // Advance 11 minutes — past the 10-minute TTL
    vi.advanceTimersByTime(11 * 60 * 1_000)
    expect(getSession(token)).toBeNull()
  })

  it('eagerly removes expired session from the store on access', () => {
    vi.useFakeTimers()
    const token = createSession('ws-1', [], makeCallbackResult())
    expect(_sessionCount()).toBe(1)
    vi.advanceTimersByTime(11 * 60 * 1_000)
    getSession(token)
    expect(_sessionCount()).toBe(0)
  })

  it('returns a valid session just before the TTL boundary', () => {
    vi.useFakeTimers()
    const token = createSession('ws-1', [], makeCallbackResult())
    // Advance 9 minutes 59 seconds — still valid
    vi.advanceTimersByTime(9 * 60 * 1_000 + 59_000)
    expect(getSession(token)).not.toBeNull()
  })

  it('session expiresAt is roughly 10 minutes from creation', () => {
    const before = Date.now()
    const token = createSession('ws-1', [], makeCallbackResult())
    const session = getSession(token)!
    const after = Date.now()
    const ttlMs = 10 * 60 * 1_000
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs)
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs + 50)
  })
})

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

describe('deleteSession', () => {
  it('removes the session so getSession returns null', () => {
    const token = createSession('ws-1', [], makeCallbackResult())
    deleteSession(token)
    expect(getSession(token)).toBeNull()
  })

  it('is a no-op for unknown tokens (does not throw)', () => {
    expect(() => deleteSession('ghost-token')).not.toThrow()
  })

  it('does not affect other sessions', () => {
    const t1 = createSession('ws-1', [], makeCallbackResult())
    const t2 = createSession('ws-2', [], makeCallbackResult())
    deleteSession(t1)
    expect(getSession(t1)).toBeNull()
    expect(getSession(t2)).not.toBeNull()
  })

  it('decrements session count', () => {
    const token = createSession('ws-1', [], makeCallbackResult())
    expect(_sessionCount()).toBe(1)
    deleteSession(token)
    expect(_sessionCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// _pruneExpiredSessions
// ---------------------------------------------------------------------------

describe('_pruneExpiredSessions', () => {
  it('removes expired sessions but keeps valid ones', () => {
    vi.useFakeTimers()

    const expiredToken = createSession('ws-expired', [], makeCallbackResult())
    // Advance past TTL so the first session is now expired
    vi.advanceTimersByTime(11 * 60 * 1_000)

    // Create a fresh session (not yet expired)
    const validToken = createSession('ws-valid', [], makeCallbackResult())

    expect(_sessionCount()).toBe(2)
    _pruneExpiredSessions()
    expect(_sessionCount()).toBe(1)
    expect(getSession(expiredToken)).toBeNull()
    expect(getSession(validToken)).not.toBeNull()
  })

  it('is a no-op when all sessions are still valid', () => {
    createSession('ws-1', [], makeCallbackResult())
    createSession('ws-2', [], makeCallbackResult())
    expect(_sessionCount()).toBe(2)
    _pruneExpiredSessions()
    expect(_sessionCount()).toBe(2)
  })

  it('removes all sessions when all have expired', () => {
    vi.useFakeTimers()
    createSession('ws-1', [], makeCallbackResult())
    createSession('ws-2', [], makeCallbackResult())
    vi.advanceTimersByTime(11 * 60 * 1_000)
    _pruneExpiredSessions()
    expect(_sessionCount()).toBe(0)
  })
})
