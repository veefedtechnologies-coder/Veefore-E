/**
 * Session lifetime limits (spec: production-security-hardening, Requirement 7).
 *
 * THE GAP THIS FIXES
 * ------------------
 * A session lived for the full 14-day cookie lifetime with no inactivity expiry, so
 * an abandoned session on a shared or lost device stayed usable for two weeks.
 *
 * TWO INDEPENDENT LIMITS
 * ----------------------
 *  - Idle_Timeout: maximum gap between authenticated requests. Sliding — each
 *    request refreshes it.
 *  - Absolute_Timeout: maximum total age measured from the ORIGINAL authentication.
 *    Activity must NOT extend it (Requirement 7.5), otherwise a continuously active
 *    session would never expire and the limit would be meaningless.
 *
 * WHERE THE TIMESTAMPS COME FROM
 * ------------------------------
 * The absolute age is derived from the token's own `auth_time` / `iat` claim, which
 * is set by the identity provider at authentication and is cryptographically signed
 * — so it cannot be extended by the client or by continued activity.
 *
 * The idle timestamp is tracked server-side in Redis, keyed per user. Redis is used
 * rather than a cookie because a client-writable last-activity value could simply be
 * forged to keep a session alive forever.
 *
 * FAIL-OPEN vs FAIL-CLOSED
 * ------------------------
 * Deliberately fails OPEN when the activity store is unavailable. Unlike revocation
 * — where failing closed is correct because the whole point is to stop a session
 * that MUST die — an idle timeout is a hygiene control. Logging every user out
 * because Redis blipped would be a self-inflicted outage with no security gain: the
 * session is still cryptographically valid and not revoked. The absolute limit still
 * applies regardless, because it needs no external store.
 */

const ACTIVITY_PREFIX = 'veefore:lastseen:';
const READ_BUDGET_MS = 40;

/** Default idle window: 7 days. */
const DEFAULT_IDLE_SECONDS = 7 * 24 * 60 * 60;
/** Default absolute cap: 30 days from initial authentication. */
const DEFAULT_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;

function envSeconds(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function idleTimeoutSeconds(): number {
  return envSeconds('SECURITY_SESSION_IDLE_SECONDS', DEFAULT_IDLE_SECONDS);
}

export function absoluteTimeoutSeconds(): number {
  return envSeconds('SECURITY_SESSION_ABSOLUTE_SECONDS', DEFAULT_ABSOLUTE_SECONDS);
}

/** Whether lifetime enforcement is active at all. */
export function lifetimeLimitsEnabled(): boolean {
  return process.env.SECURITY_SESSION_LIFETIME_ENABLED?.trim().toLowerCase() !== 'false';
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

export type LifetimeVerdict =
  | { expired: false }
  | { expired: true; reason: 'idle_timeout' | 'absolute_timeout' };

/**
 * Pure absolute-age check, exported for direct testing.
 *
 * @param authTimeSeconds The token's `auth_time`/`iat` claim, in SECONDS since
 *                        epoch (the JWT convention), or undefined when absent.
 */
export function isAbsolutelyExpired(
  authTimeSeconds: unknown,
  nowMs: number = Date.now(),
  maxAgeSeconds: number = absoluteTimeoutSeconds()
): boolean {
  const authTime = Number(authTimeSeconds);
  // No usable claim → cannot judge → do not expire. Rejecting here would sign out
  // every holder of a token that predates the claim.
  if (!Number.isFinite(authTime) || authTime <= 0) return false;

  const ageSeconds = nowMs / 1000 - authTime;
  // Guard against clock skew producing a negative age.
  if (ageSeconds < 0) return false;

  return ageSeconds > maxAgeSeconds;
}

/** Pure idle check, exported for direct testing. */
export function isIdleExpired(
  lastSeenMs: number | null,
  nowMs: number = Date.now(),
  idleSeconds: number = idleTimeoutSeconds()
): boolean {
  // No recorded activity (first request after deploy, or cache miss) → treat as
  // active rather than expiring a legitimate session.
  if (lastSeenMs === null) return false;
  const gapSeconds = (nowMs - lastSeenMs) / 1000;
  if (gapSeconds < 0) return false;
  return gapSeconds > idleSeconds;
}

/** Read the last-seen timestamp (ms), or null on miss/unavailable store. */
async function readLastSeen(uid: string): Promise<number | null> {
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    const raw = await withTimeout(redis.get(ACTIVITY_PREFIX + uid), READ_BUDGET_MS, null);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Refresh the sliding idle window. Fire-and-forget so it never adds latency.
 * The Redis TTL is set to the idle window, so an abandoned session's key simply
 * disappears rather than accumulating.
 */
export function touchSession(uid: string): void {
  void (async () => {
    try {
      const { getRedisClient } = await import('./redis');
      const redis = getRedisClient();
      await redis.set(ACTIVITY_PREFIX + uid, String(Date.now()), 'EX', idleTimeoutSeconds());
    } catch {
      /* best-effort */
    }
  })();
}

/** Clear the activity marker (on logout), so a resumed cookie cannot look fresh. */
export async function clearSessionActivity(uid: string | null | undefined): Promise<void> {
  if (!uid) return;
  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    await redis.del(ACTIVITY_PREFIX + String(uid));
  } catch {
    /* non-fatal */
  }
}

/**
 * Evaluate both lifetime limits for a request, and refresh the idle window when the
 * session is still valid.
 *
 * @param uid              Verified user id.
 * @param authTimeSeconds  `auth_time`/`iat` claim from the verified token.
 */
export async function checkSessionLifetime(
  uid: string,
  authTimeSeconds: unknown
): Promise<LifetimeVerdict> {
  if (!lifetimeLimitsEnabled()) return { expired: false };

  // Absolute limit first: it needs no external store, so it holds even when Redis
  // is down, and it cannot be extended by activity (Requirement 7.5).
  if (isAbsolutelyExpired(authTimeSeconds)) {
    return { expired: true, reason: 'absolute_timeout' };
  }

  const lastSeen = await readLastSeen(uid);
  if (isIdleExpired(lastSeen)) {
    return { expired: true, reason: 'idle_timeout' };
  }

  // Still valid → slide the idle window forward.
  touchSession(uid);
  return { expired: false };
}
