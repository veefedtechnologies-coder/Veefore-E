/*
 * Centralized client-state cleanup for logout / account switch.
 *
 * WHY: there was no single place that cleared per-user client state, so many
 * keys survived logout (VeeGPT conversation state, dashboard/app cache, workspace
 * id, early-access flags, admin token, etc.). A different account signing in on
 * the same browser could then see the previous user's data. This helper wipes
 * ALL per-user state via an allowlist-keep, so any present OR future per-user key
 * is cleared by default and only genuinely device-level settings survive.
 */
import { queryClient } from './queryClient'
import { clearActiveWorkspaceCookie } from './bootstrap'

/** Device-level, non-identity keys that should SURVIVE logout. */
const KEEP_LOCAL_KEYS = new Set<string>([
  'theme',                       // UI theme preference
  'veefore_cookie_consent',      // cookie banner consent
  'veefore_cookie_preferences',  // cookie banner preferences
  'signin_email_v1',             // sign-in email prefill (convenience, not identity)
  'REACT_QUERY_CACHE_VERSION',   // migration marker; keep so purge doesn't re-run
  'veefore_logout',              // cross-tab logout guard — MUST survive the wipe,
                                 // otherwise recentlyLoggedOut() returns false in
                                 // other tabs and they immediately re-establish the
                                 // session (logging the user back in after logout).
])

/**
 * Remove all per-user client state. Safe to call from any logout path. Does NOT
 * navigate — callers handle redirect/reload.
 */
export function clearClientSessionState(): void {
  // localStorage: remove everything except the device-level allowlist.
  try {
    for (const key of Object.keys(localStorage)) {
      if (!KEEP_LOCAL_KEYS.has(key)) {
        try { localStorage.removeItem(key) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // sessionStorage is per-tab/per-session and only holds transient per-user data
  // (oauth form backup, AI insight cache, etc.) → clear all of it.
  try { sessionStorage.clear() } catch { /* ignore */ }

  // Clear the active-workspace SSR cookie so the next user's first paint doesn't
  // briefly reflect a previous selection (server also validates it, so this is
  // just cosmetic hygiene).
  try { clearActiveWorkspaceCookie() } catch { /* ignore */ }

  // In-memory React Query cache — covers any path that doesn't hard-reload.
  try { queryClient.clear() } catch { /* ignore */ }
}
