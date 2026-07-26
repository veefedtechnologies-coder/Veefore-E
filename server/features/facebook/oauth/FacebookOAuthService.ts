/**
 * FacebookOAuthService — page-selection session management
 *
 * During the Facebook OAuth flow the backend receives a long-lived User Access
 * Token and the list of Pages the user manages *before* the user has had a
 * chance to pick which Pages to connect. This service bridges that gap with a
 * short-lived, in-memory session so the page-selection UI can retrieve the
 * token and page list without those values ever being passed through the
 * browser URL bar.
 *
 * Design decisions
 * ────────────────
 * • In-memory Map — sessions are ephemeral and intentionally do not survive a
 *   process restart. Redis is not required for MVP.
 * • 10-minute TTL — generous enough to let the user complete page selection
 *   even on a slow connection, short enough to minimise the attack window if
 *   a session token leaks.
 * • Automatic cleanup — a setInterval scans for and removes expired entries
 *   every minute. The interval is unref()-ed so it does not keep the Node
 *   process alive in test environments.
 * • Crypto-random tokens — `crypto.randomUUID()` (Node ≥ 14.17, standard on
 *   Node ≥ 20 which this project requires) produces 122 bits of entropy,
 *   which is sufficient for a short-lived session token.
 *
 * Requirements: 2.4, 2.5
 */

import { randomUUID } from 'crypto'
import type { OAuthCallbackResult, ManagedPage } from '../../social/providers/types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Data stored in a page-selection session.
 */
export interface PageSelectionSessionData {
  /** The Veefore workspace that initiated the OAuth flow. */
  workspaceId: string
  /** All Pages the authenticated user manages (returned by `/me/accounts`). */
  pages: ManagedPage[]
  /**
   * The OAuth callback result containing the long-lived User Access Token.
   * This is kept server-side so the token never travels through the browser.
   */
  callbackResult: OAuthCallbackResult
  /** UTC timestamp when this session expires. */
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Session TTL in milliseconds (10 minutes). */
const SESSION_TTL_MS = 10 * 60 * 1_000

/** How often the cleanup sweep runs (1 minute). */
const CLEANUP_INTERVAL_MS = 60 * 1_000

// ---------------------------------------------------------------------------
// Internal store
// ---------------------------------------------------------------------------

const _sessions = new Map<string, PageSelectionSessionData>()

// ---------------------------------------------------------------------------
// Automatic cleanup of expired sessions
// ---------------------------------------------------------------------------

/**
 * Removes all expired sessions from the store.
 * Called automatically by the background interval; exposed for testing.
 */
export function _pruneExpiredSessions(): void {
  const now = Date.now()
  for (const [token, session] of _sessions) {
    if (session.expiresAt.getTime() <= now) {
      _sessions.delete(token)
    }
  }
}

// Start the cleanup interval and unref it so it does not keep the process alive
// when running inside Vitest or similar test runners.
const _cleanupInterval = setInterval(_pruneExpiredSessions, CLEANUP_INTERVAL_MS)
if (typeof _cleanupInterval.unref === 'function') {
  _cleanupInterval.unref()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new page-selection session and returns the opaque session token.
 *
 * The session is valid for {@link SESSION_TTL_MS} (10 minutes) from the moment
 * of creation. The token should be passed to the frontend as a URL query
 * parameter so the page-selection UI can call {@link getSession} to retrieve
 * the page list and OAuth result.
 *
 * @param workspaceId    - The Veefore workspace initiating the connection.
 * @param pages          - The managed pages returned by `FacebookProvider.getManagedPages`.
 * @param callbackResult - The OAuth callback result (long-lived UAT + expiry).
 * @returns A short-lived, crypto-random session token (UUID v4).
 *
 * Requirements: 2.4
 */
export function createSession(
  workspaceId: string,
  pages: ManagedPage[],
  callbackResult: OAuthCallbackResult,
): string {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  _sessions.set(token, { workspaceId, pages, callbackResult, expiresAt })
  return token
}

/**
 * Retrieves the session data for the given token if the session is still valid.
 *
 * Returns `null` when the token is unknown or the session has expired.
 * Expired sessions are not deleted on read — the background sweep handles
 * that — but they are treated as if they do not exist.
 *
 * @param token - The session token returned by {@link createSession}.
 * @returns The session data, or `null` if not found / expired.
 *
 * Requirements: 2.4, 2.5
 */
export function getSession(token: string): PageSelectionSessionData | null {
  const session = _sessions.get(token)
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    // Eagerly remove on access so subsequent calls don't even reach the map.
    _sessions.delete(token)
    return null
  }
  return session
}

/**
 * Deletes the session for the given token.
 *
 * Should be called by the page-connect route handler after the Pages have been
 * successfully saved as `SocialAccount` records, so the token cannot be reused.
 * Safe to call with an unknown or already-expired token — it is a no-op in
 * that case.
 *
 * @param token - The session token to invalidate.
 *
 * Requirements: 2.5
 */
export function deleteSession(token: string): void {
  _sessions.delete(token)
}

/**
 * Returns the current number of entries in the session store (including
 * expired ones that have not yet been swept). Primarily intended for testing
 * and monitoring.
 */
export function _sessionCount(): number {
  return _sessions.size
}

/**
 * Clears all sessions from the store. Intended for use in test teardown only.
 * Do NOT call from production code.
 */
export function _clearAllSessions(): void {
  _sessions.clear()
}
