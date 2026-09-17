/**
 * Session revocation enforcement (spec: production-security-hardening, Req 6).
 *
 * THE DEFECT THIS FIXES
 * ---------------------
 * Revocation was not enforced on the authenticated request path. Both
 * `middleware/require-auth.ts` and `lib/verify-auth-token.ts` called
 * `verifySessionCookie(session, false)` — `checkRevoked: false` — and NEITHER
 * validated the `sessionVersion` claim. `sessionVersion` was only checked on the
 * session-maintenance endpoints (`/session`, `/update-token`, `/refresh`).
 *
 * Consequence: after a logout or a global invalidation, a session cookie that
 * had been captured outside the browser continued to authorize API requests
 * until it expired naturally — up to 14 days. Clearing the browser's cookie (the
 * normal logout path) hid this from ordinary users, but it meant a stolen
 * session could not be revoked at all. This contradicted Requirements 7.3 and
 * 8.3 of the enterprise-session-auth spec.
 *
 * MECHANISM
 * ---------
 * `sessionVersion` is a monotonically increasing per-user counter embedded as a
 * token claim. Logout and the admin invalidation endpoint increment it. A token
 * whose claim is behind the user's current value is treated as revoked.
 *
 * Because Firebase session cookies inherit the custom claims of the ID token
 * they were minted from, `sessionVersion` is present on both the ID-token path
 * and the `__session` cookie path.
 *
 * FAIL-OPEN vs FAIL-CLOSED — deliberate asymmetry
 * -----------------------------------------------
 *  - A token with NO `sessionVersion` claim is ACCEPTED. Rejecting would sign
 *    out every user holding a token minted before the claim existed. Every
 *    freshly minted token carries it, so a post-logout bump still invalidates
 *    the sessions that matter. This mirrors the existing
 *    `isSessionVersionStale` semantics in `routes/auth.ts`.
 *  - A token WITH a claim that cannot be checked because the datastore is
 *    unavailable is REJECTED (fail closed, Requirement 6.7). Availability
 *    problems must not become an authorization bypass.
 *
 * OVERHEAD
 * --------
 * The user's current `sessionVersion` is cached in Redis for a few seconds, so
 * the check costs at most one cheap read per request and usually nothing
 * (Requirement 6.6). The cache is invalidated explicitly whenever the version is
 * bumped, so revocation still takes effect immediately.
 */

const CACHE_PREFIX = 'veefore:sessver:';
/**
 * Short TTL. This is the ONLY window in which a revoked session could still be
 * accepted, so it is deliberately small. Explicit invalidation on bump means the
 * common path is immediate anyway; the TTL only covers a lost invalidation.
 */
const CACHE_TTL_SEC = 10;
const CACHE_READ_BUDGET_MS = 40;

/** Resolve a promise with a fallback if it does not settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

/** Normalise a session version to a positive integer; legacy users default to 1. */
function normalizeVersion(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Pure comparison: is `tokenVersion` stale relative to `currentVersion`?
 *
 * Exported for direct unit testing, and to keep the fail-open rule for an absent
 * claim in exactly one place.
 */
export function isSessionVersionStale(tokenVersion: unknown, currentVersion: unknown): boolean {
  // No claim → cannot judge → accept (see the fail-open rationale above).
  if (tokenVersion === undefined || tokenVersion === null) return false;
  return normalizeVersion(tokenVersion) !== normalizeVersion(currentVersion);
}

/** Read a cached session version, or null on miss/unavailable cache. */
async function readCachedVersion(uid: string): Promise<number | null> {
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    const raw = await withTimeout(redis.get(CACHE_PREFIX + uid), CACHE_READ_BUDGET_MS, null);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Cache a session version. Fire-and-forget; never blocks the request. */
function writeCachedVersion(uid: string, version: number): void {
  void (async () => {
    try {
      const { getRedisClient } = await import('./redis');
      const redis = getRedisClient();
      await redis.set(CACHE_PREFIX + uid, String(version), 'EX', CACHE_TTL_SEC);
    } catch {
      /* cache is best-effort */
    }
  })();
}

/**
 * Drop a user's cached session version so the NEXT request re-reads it from the
 * database. MUST be called whenever `sessionVersion` is incremented (logout,
 * global invalidation, password change), otherwise revocation could be delayed
 * by up to the cache TTL.
 */
export async function invalidateSessionVersionCache(uid: string | null | undefined): Promise<void> {
  if (!uid) return;
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    await redis.del(CACHE_PREFIX + String(uid));
  } catch {
    /* non-fatal: the short TTL bounds the staleness */
  }
}

/** The user's current session version, or null if it could not be determined. */
async function currentSessionVersion(uid: string): Promise<number | null> {
  const cached = await readCachedVersion(uid);
  if (cached !== null) return cached;

  try {
    const { User } = await import('../models/User/User');
    const doc: any = await User.findById(uid).select('sessionVersion').lean();
    // A missing user is NOT "version unknown" — there is nothing to authorize.
    if (!doc) return null;
    const version = normalizeVersion(doc.sessionVersion);
    writeCachedVersion(uid, version);
    return version;
  } catch {
    return null;
  }
}

export type RevocationVerdict =
  | { revoked: false }
  | { revoked: true; reason: 'session_invalidated' | 'revocation_check_failed' };

/**
 * Decide whether a presented session must be rejected as revoked.
 *
 * @param uid           Cryptographically verified user id from the token.
 * @param tokenVersion  The token's `sessionVersion` claim, if any.
 */
export async function checkSessionRevoked(
  uid: string,
  tokenVersion: unknown
): Promise<RevocationVerdict> {
  // Absent claim → accept without touching the datastore (fail-open rule), which
  // also keeps this free for legacy tokens.
  if (tokenVersion === undefined || tokenVersion === null) {
    return { revoked: false };
  }

  const current = await currentSessionVersion(uid);

  // The claim exists but could not be checked → fail CLOSED (Requirement 6.7).
  if (current === null) {
    return { revoked: true, reason: 'revocation_check_failed' };
  }

  if (isSessionVersionStale(tokenVersion, current)) {
    return { revoked: true, reason: 'session_invalidated' };
  }

  return { revoked: false };
}
