/**
 * Server session-cookie helpers (SSR instant-load — Phase 1).
 *
 * After Firebase sign-in we exchange the ID token for a long-lived, server-
 * verifiable `__session` cookie. The HTML route then uses it to inline the
 * user's dashboard data on the first byte. These calls are best-effort and
 * fire-and-forget — failures never affect the app (it falls back to the
 * client fetch).
 */

let lastSync = 0;
const SYNC_THROTTLE_MS = 5 * 60 * 1000; // refresh the session cookie at most every 5 min
const FAILURE_BACKOFF_MS = 60 * 1000; // after a failure, wait at least 60s before retrying

/**
 * True if a logout happened in ANY tab within the last few seconds. Used to stop
 * the cookie-writing paths (session-login / update-token) from re-creating
 * `__session` / `auth_token` during the brief window between a cross-tab logout
 * and this tab reloading — which would otherwise log the user back in.
 */
export function recentlyLoggedOut(): boolean {
  try {
    const raw = localStorage.getItem('veefore_logout');
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < 15 * 1000;
  } catch {
    return false;
  }
}

/** Create / refresh the server session cookie from a fresh Firebase ID token. */
export async function ensureSessionCookie(idToken: string): Promise<void> {
  // Never (re)create the session cookie right after a logout in any tab.
  if (recentlyLoggedOut()) return;
  try {
    const now = Date.now();
    if (now - lastSync < SYNC_THROTTLE_MS) return;
    const res = await fetch('/api/auth/session-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      keepalive: true,
    });
    // On success: throttle the next attempt for the full window. On failure:
    // back off for a shorter window so we DON'T hammer the endpoint on every auth
    // event (which previously produced a 429 storm), but still retry soon.
    lastSync = res.ok ? now : now - (SYNC_THROTTLE_MS - FAILURE_BACKOFF_MS);
  } catch {
    // Network error → apply the same short backoff to avoid a retry storm.
    lastSync = Date.now() - (SYNC_THROTTLE_MS - FAILURE_BACKOFF_MS);
  }
}

/** Clear the server session cookie (on logout). */
export async function clearSessionCookie(): Promise<void> {
  try {
    lastSync = 0;
    await fetch('/api/auth/session-logout', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    /* non-fatal */
  }
}
