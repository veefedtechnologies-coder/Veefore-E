/**
 * Authentication cookie policy — THE single source of truth.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The auth cookies (`auth_token`, `__session`) used to be constructed inline at
 * five different call sites, each deriving `secure` and `domain` from its own
 * ad-hoc mix of `NODE_ENV` and `FRONTEND_URL.startsWith('https')`. Under the
 * real deployment (`NODE_ENV=development`, served over HTTPS through the
 * Cloudflare tunnel, `COOKIE_DOMAIN` set) those expressions disagreed:
 *
 *   OAuth callback   → auth_token  Domain=<COOKIE_DOMAIN>
 *   signIn           → auth_token  host-only  (no Domain)
 *   session-login    → __session   host-only  (no Domain)
 *   session-logout   → __session   host-only  (no Domain)
 *   update-token     → __session   Domain=<COOKIE_DOMAIN>
 *
 * Per RFC 6265 a host-only cookie and a `Domain`-scoped cookie WITH THE SAME
 * NAME are two DISTINCT entries in the browser's cookie jar. The browser sends
 * both in one `Cookie` header (`__session=A; __session=B`) and `cookie-parser`
 * keeps only the FIRST. Consequences, both of which we observed:
 *
 *   1. CORRECTNESS: the surviving duplicate may be the STALE one, so
 *      `verifySessionCookie` fails, the HTML bootstrap reports "logged out" for
 *      a user who IS logged in, and the public landing page flashes before the
 *      client session restores.
 *   2. SECURITY: logout cleared only one variant, so the other survived and the
 *      server kept resolving a valid session AFTER logout — the session
 *      outlived the logout.
 *
 * THE INVARIANT THIS MODULE ENFORCES
 * ----------------------------------
 * Every auth cookie is written and cleared through this module, so the
 * (name, domain, path, secure, sameSite) tuple is IDENTICAL everywhere. A
 * cookie set by one route is therefore always overwritten — never duplicated —
 * by another, and `clearAuthCookies` provably removes it.
 *
 * ATTRIBUTE RATIONALE
 * -------------------
 * - httpOnly: always. Session material must never be readable from JavaScript,
 *   so XSS cannot exfiltrate it.
 * - secure: driven by explicit config (see `isSecureCookieContext`). Never
 *   inferred from `NODE_ENV` alone, because this deployment runs
 *   `NODE_ENV=development` over real HTTPS.
 * - sameSite='lax': REQUIRED, not incidental. Google OAuth returns via a
 *   top-level cross-site GET redirect; 'strict' would withhold the cookie on
 *   that navigation and break sign-in. 'lax' still blocks the cross-site
 *   POST/PUT/PATCH/DELETE vectors that CSRF relies on.
 * - path='/': the SPA and API share one session.
 * - domain: see `resolveCookieDomain`.
 */

/** Names of every cookie that carries authentication state. */
export const AUTH_COOKIE_NAME = 'auth_token';
export const SESSION_COOKIE_NAME = '__session';

/**
 * All auth cookie names, used as the default target set when clearing on logout.
 * Module-internal: callers clear via `clearAuthCookieVariants`.
 */
const ALL_AUTH_COOKIE_NAMES = [AUTH_COOKIE_NAME, SESSION_COOKIE_NAME] as const;

/**
 * Lifetime of the durable, server-verifiable Firebase session cookie.
 * Firebase Admin caps `createSessionCookie` at 14 days.
 */
export const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Lifetime of the `auth_token` cookie (persistent sign-in). Module-internal:
 * callers get it via `authCookieOptions()`.
 */
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether cookies must carry the `Secure` attribute.
 *
 * Resolution order (first match wins):
 *   1. `COOKIE_SECURE` — explicit operator override ('true' / 'false'). Use this
 *      for deployments the heuristics below cannot infer (e.g. a proxy that
 *      terminates TLS while the app itself speaks plain HTTP).
 *   2. `NODE_ENV=production`.
 *   3. `FRONTEND_URL` / `APP_ORIGIN` served over https — this is what makes the
 *      HTTPS-via-tunnel deployment correct even though NODE_ENV=development.
 *
 * Deliberately NOT derived from `NODE_ENV` alone: the production host runs with
 * `NODE_ENV=development` behind an HTTPS tunnel, and omitting `Secure` there
 * would let the session cookie be sent over a plaintext downgrade.
 */
export function isSecureCookieContext(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  if (process.env.NODE_ENV === 'production') return true;

  const origins = [process.env.FRONTEND_URL, process.env.APP_ORIGIN];
  return origins.some((o) => typeof o === 'string' && o.trim().startsWith('https'));
}

/**
 * The `Domain` attribute to scope auth cookies to, or `undefined` for a
 * host-only cookie (the tighter, preferred default).
 *
 * A cookie is only sent over HTTPS-capable, properly scoped contexts, so we
 * apply `COOKIE_DOMAIN` ONLY in a secure context. In an insecure local context
 * we always fall back to host-only, because a `Domain`-scoped cookie on
 * `localhost` is either ignored or leaks across local ports.
 *
 * IMPORTANT: whatever this returns, it is returned CONSISTENTLY to every call
 * site — that consistency is the whole point of this module. Changing
 * `COOKIE_DOMAIN` changes the scope everywhere at once, so a cookie can never
 * be set under one scope and cleared under another.
 */
export function resolveCookieDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  // A domain-scoped cookie requires a secure, real-hostname context. Never scope
  // to a bare local host.
  if (!isSecureCookieContext()) return undefined;
  if (raw === 'localhost' || raw === '127.0.0.1') return undefined;
  return raw;
}

export interface AuthCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  domain?: string;
  maxAge?: number;
}

/**
 * Canonical attributes shared by every auth cookie. `maxAge` is supplied by the
 * specific helpers so the identity tuple (name, domain, path, secure, sameSite)
 * is always identical between set and clear.
 */
function baseAuthCookieOptions(): AuthCookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookieContext(),
    sameSite: 'lax',
    path: '/',
    ...(resolveCookieDomain() ? { domain: resolveCookieDomain() } : {}),
  };
}

/** Options for writing the durable `__session` cookie (SSR-verifiable, 14d). */
export function sessionCookieOptions(): AuthCookieOptions {
  return { ...baseAuthCookieOptions(), maxAge: SESSION_COOKIE_MAX_AGE_MS };
}

/** Options for writing the `auth_token` cookie (30d). */
export function authCookieOptions(): AuthCookieOptions {
  return { ...baseAuthCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS };
}

/**
 * Every (domain, secure) variant an auth cookie may EVER have been written
 * under — including the historical, inconsistent combinations that predate this
 * module. Logout must clear all of them.
 *
 * `res.clearCookie` only deletes a cookie whose domain and path MATCH how it was
 * set, so clearing a single canonical variant would leave a legacy
 * differently-scoped duplicate alive — which is exactly how a session survived
 * logout before. Enumerating the variants makes logout total and idempotent, and
 * also cleans up any duplicate left in a browser from a previous deploy.
 *
 * Emitting extra `Set-Cookie` headers for cookies that do not exist is harmless.
 */
function authCookieClearVariants(): AuthCookieOptions[] {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  const base = { httpOnly: true as const, sameSite: 'lax' as const, path: '/' as const };

  const variants: AuthCookieOptions[] = [
    { ...base, secure: true },
    { ...base, secure: false },
  ];

  if (domain) {
    variants.push({ ...base, secure: true, domain });
    variants.push({ ...base, secure: false, domain });
  }

  return variants;
}

/**
 * Minimal shape of the Express response bits we need. Declared locally so this
 * config module stays dependency-free and trivially unit-testable.
 */
interface CookieClearingResponse {
  clearCookie(name: string, options?: Record<string, unknown>): unknown;
}

/** Minimal shape of the Express request bits we need. */
interface CookieBearingRequest {
  cookies?: Record<string, unknown>;
}

/**
 * True when `value` has the exact shape of a JWT: three non-empty base64url
 * segments (`header.payload.signature`).
 *
 * Shape alone confers NO trust — it is only a cheap structural filter so we
 * don't hand obvious garbage to the token verifier. Authorization always comes
 * from `admin.auth().verifyIdToken()` / `verifySessionCookie()` downstream.
 */
export function isJwtShaped(value: string): boolean {
  const segments = value.split('.');
  if (segments.length !== 3) return false;
  return segments.every((s) => s.length > 0 && /^[A-Za-z0-9_-]+$/.test(s));
}

/**
 * Read the `auth_token` cookie as a Firebase JWT, or return null.
 *
 * This replaces the former `SessionManager.getAuthToken`, which wrapped the
 * cookie in an HMAC-SHA256 signature. That layer was removed because:
 *
 *  - Nothing wrote signed cookies. Every production writer (routes/auth.ts,
 *    AuthController) writes `auth_token` as a RAW Firebase JWT via
 *    `authCookieOptions()` above, so the HMAC verify step could never succeed.
 *  - Worse, it made the cookie fallback silently unusable: the old verifier
 *    required exactly two dot-separated parts while a JWT has three, so it
 *    always returned null and every cookie-authenticated request to the routes
 *    behind `authenticateUser` failed with 401.
 *  - The HMAC added no security. A Firebase JWT is already RS256-signed by
 *    Google, and the caller verifies it with the Firebase Admin SDK. Our own
 *    symmetric signature over an already-signed token protected nothing, while
 *    the `SESSION_SECRET` it depended on is independently validated by
 *    `RefreshTokenStore` for the encryption that genuinely needs it.
 *
 * Returning the raw cookie is therefore safe AND correct: the token still has
 * to survive `verifyIdToken`, so a forged or tampered cookie is rejected there.
 */
export function readAuthTokenCookie(req: CookieBearingRequest): string | null {
  const raw = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return isJwtShaped(raw) ? raw : null;
}

/**
 * Remove the given auth cookie(s) under EVERY (domain, secure) variant they may
 * have been written with. Use this both on logout and immediately before
 * (re)writing a cookie, so a legacy differently-scoped duplicate can never
 * shadow the canonical value.
 *
 * Idempotent and safe to call when the cookies do not exist.
 */
export function clearAuthCookieVariants(
  res: CookieClearingResponse,
  ...names: string[]
): void {
  const targets = names.length > 0 ? names : [...ALL_AUTH_COOKIE_NAMES];
  for (const opts of authCookieClearVariants()) {
    for (const name of targets) {
      // `maxAge` is meaningless for a clear and would only add noise to the header.
      const { maxAge: _ignored, ...clearOpts } = opts;
      res.clearCookie(name, clearOpts as Record<string, unknown>);
    }
  }
}

/**
 * Validate the cookie configuration at boot and report anything that would
 * silently weaken or break sessions. Logs only — never throws — so a
 * misconfiguration can't take the server down, but it is loud enough to catch in
 * deploy logs.
 *
 * Returns the list of problems found (also useful for tests).
 */
export function validateCookieConfig(): string[] {
  const problems: string[] = [];
  const secure = isSecureCookieContext();
  const domain = resolveCookieDomain();
  const frontendUrl = process.env.FRONTEND_URL?.trim();

  // An HTTPS origin with non-Secure cookies means the session cookie can be sent
  // over a plaintext downgrade.
  if (frontendUrl?.startsWith('https') && !secure) {
    problems.push(
      'FRONTEND_URL is https but cookies are not marked Secure (COOKIE_SECURE=false?). ' +
        'Session cookies would be transmittable over plaintext.'
    );
  }

  // COOKIE_DOMAIN must actually match the origin host, or the browser silently
  // rejects the cookie and every session write is a no-op.
  if (domain && frontendUrl) {
    try {
      const host = new URL(frontendUrl).hostname;
      const scope = domain.startsWith('.') ? domain.slice(1) : domain;
      if (host !== scope && !host.endsWith('.' + scope)) {
        problems.push(
          `COOKIE_DOMAIN="${domain}" does not cover FRONTEND_URL host "${host}". ` +
            'The browser will reject the cookie and sessions will not persist.'
        );
      }
    } catch {
      problems.push(`FRONTEND_URL="${frontendUrl}" is not a valid URL.`);
    }
  }

  if (problems.length > 0) {
    console.error('[cookie-config] INVALID COOKIE CONFIGURATION:');
    for (const p of problems) console.error('[cookie-config]  - ' + p);
  } else {
    console.log('[cookie-config] OK', {
      secure,
      domain: domain ?? '(host-only)',
      sameSite: 'lax',
    });
  }

  return problems;
}
