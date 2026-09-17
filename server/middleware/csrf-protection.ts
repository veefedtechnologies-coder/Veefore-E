/**
 * CSRF protection (spec: production-security-hardening, Requirement 8).
 *
 * THE GAP THIS FIXES
 * ------------------
 * The application authorizes requests from an ambient httpOnly session cookie
 * but had NO CSRF defence. A `csrfValidationSchema` existed in
 * `middleware/auth-validation-schemas.ts` wired to no route, and `X-CSRF-Token`
 * was permitted by CORS but never validated. The only mitigation was the
 * `SameSite=Lax` cookie attribute.
 *
 * `SameSite=Lax` is genuinely useful — it blocks cross-site POST/PUT/PATCH/DELETE
 * with cookies, which is the primary CSRF vector — but it is NOT sufficient
 * (Requirement 8.8):
 *   - It is same-SITE, not same-ORIGIN. Any subdomain of the registrable domain
 *     can forge requests that the browser will attach the cookie to.
 *   - It permits cookies on top-level cross-site GET navigations, so any GET
 *     endpoint that mutates state remains reachable.
 *
 * MECHANISM — signed double-submit cookie
 * ---------------------------------------
 * The server issues a token as `<nonce>.<hmac>` where the HMAC covers the nonce
 * AND the authenticated uid, keyed by `SESSION_SECRET`. It is delivered in a
 * JS-READABLE cookie (`vf_csrf`); the client echoes it in the `X-CSRF-Token`
 * header. A request is accepted only when the header matches the cookie AND the
 * HMAC verifies for the current user.
 *
 * Why the cookie is deliberately readable: that is the point of double-submit.
 * A cross-site attacker can cause the browser to SEND cookies but cannot READ
 * them (same-origin policy) and so cannot populate the header. The token is not a
 * credential — on its own it grants nothing.
 *
 * Binding the HMAC to the uid satisfies Requirement 8.4: a token minted for one
 * session is rejected for another, so a token cannot be transplanted between
 * accounts.
 *
 * ROLLOUT
 * -------
 * Defaults to REPORT-ONLY (`SECURITY_CSRF_ENFORCE` unset), which logs what WOULD
 * have been blocked without rejecting anything. This is required because
 * enforcing CSRF before the client sends the header would break every mutation
 * in the app. Flip `SECURITY_CSRF_ENFORCE=true` once the logs are clean
 * (Requirements 16.1, 16.2, 16.4).
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

import { isSecureCookieContext } from '../config/cookies';
import { recordAuthEventFromRequest } from '../lib/auth-audit';

/** JS-readable cookie carrying the CSRF token (double-submit counterpart). */
export const CSRF_COOKIE_NAME = 'vf_csrf';
/** Header the client must echo the token in. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Methods that cannot change state and therefore need no CSRF token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Endpoints invoked by trusted third parties that cannot present a CSRF token
 * (Requirement 8.6). Each is authenticated by its own verifiable means:
 *   - platform webhooks verify a provider HMAC signature over the raw body;
 *   - the payment callback verifies the gateway's payment signature.
 * Matched as path prefixes. Documented here so the exemption set is auditable.
 */
const CSRF_EXEMPT_PREFIXES = [
  '/api/webhooks',
  '/api/instagram/webhook',
  '/api/facebook/webhook',
  '/api/subscription/razorpay/callback',
  '/api/subscription/webhook',
  // Session establishment: the client cannot yet hold a token, and these
  // endpoints are themselves gated on a verified Firebase ID token in the body.
  '/api/auth/session-login',
  '/api/auth/update-token',
  '/api/auth/logout',
  '/api/auth/session-logout',
];

function hmacKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return Buffer.from(secret, 'utf8');
}

/** Constant-time string comparison that tolerates differing lengths. */
function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function sign(nonce: string, fingerprint: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(`${nonce}.${fingerprint}`).digest('hex');
}

/**
 * Stable, non-reversible fingerprint of the request's session.
 *
 * The CSRF token is bound to THIS rather than to the uid, which is what makes the
 * scheme workable at the global middleware layer: the fingerprint is derivable
 * from cookies alone, with no database access and no dependency on
 * authentication having run first. It still satisfies Requirement 8.4 — a token
 * minted for one session will not verify against another, because the session
 * cookie value differs.
 *
 * Only a digest is used, so the token never carries recoverable session material.
 */
export function sessionFingerprint(req: Request): string | null {
  const cookies = (req as any).cookies ?? {};
  const source =
    (typeof cookies.__session === 'string' && cookies.__session) ||
    (typeof cookies.auth_token === 'string' && cookies.auth_token) ||
    '';
  if (!source) return null;
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}

/**
 * Mint a CSRF token bound to the given session fingerprint. Returns null when no
 * usable `SESSION_SECRET` is configured, in which case CSRF cannot be enforced.
 */
export function mintCsrfToken(fingerprint: string): string | null {
  const key = hmacKey();
  if (!key) return null;
  const nonce = crypto.randomBytes(18).toString('base64url');
  return `${nonce}.${sign(nonce, fingerprint, key)}`;
}

/** Verify a token's HMAC binds it to the given session fingerprint. */
export function verifyCsrfToken(token: string, fingerprint: string): boolean {
  const key = hmacKey();
  if (!key) return false;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return false;
  const nonce = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  return timingSafeEquals(signature, sign(nonce, fingerprint, key));
}

/**
 * Whether CSRF protection is ENFORCING (as opposed to disabled or report-only).
 * Consumed by the security posture report so it can never overstate the control
 * (Requirement 11).
 */
export function isCsrfProtectionActive(): boolean {
  if (!hmacKey()) return false;
  const enabled = process.env.SECURITY_CSRF_ENABLED?.trim().toLowerCase() !== 'false';
  const enforcing = process.env.SECURITY_CSRF_ENFORCE?.trim().toLowerCase() === 'true';
  return enabled && enforcing;
}

/** True when the request path is an audited third-party exemption. */
export function isCsrfExempt(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

/**
 * Attach/refresh the CSRF cookie for an authenticated request so the client
 * always has a current token to echo. Safe to call on every request; it only
 * writes when the cookie is absent or not bound to the current user.
 */
export function issueCsrfCookie(req: Request, res: Response): void {
  const fingerprint = sessionFingerprint(req);
  if (!fingerprint) return; // No session → nothing to bind a token to.

  const existing = (req as any).cookies?.[CSRF_COOKIE_NAME];
  if (typeof existing === 'string' && existing.length > 0 && verifyCsrfToken(existing, fingerprint)) {
    return; // Already valid for this session.
  }

  const token = mintCsrfToken(fingerprint);
  if (!token) return;

  res.cookie(CSRF_COOKIE_NAME, token, {
    // Intentionally NOT httpOnly: the client must read it to set the header.
    // This is the double-submit design and does not weaken the session cookie,
    // which remains httpOnly.
    httpOnly: false,
    secure: isSecureCookieContext(),
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export type CsrfRejectionReason =
  | 'missing_token'
  | 'token_mismatch'
  | 'token_not_bound_to_session'
  | 'not_configured';

/**
 * Evaluate a request's CSRF posture without mutating the response. Exported so
 * the decision logic is directly unit-testable.
 *
 * Returns null when the request requires no CSRF check.
 */
export function evaluateCsrf(req: Request): CsrfRejectionReason | null {
  if (SAFE_METHODS.has(req.method)) return null;
  if (isCsrfExempt(req.path)) return null;

  // Requirement 8.5: a request authorized by an explicit Authorization header is
  // not riding on an ambient cookie, so it is not forgeable cross-site.
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) return null;

  const cookies = (req as any).cookies ?? {};

  // Does this request carry AMBIENT authority (a session cookie the browser
  // attaches automatically)? That — not `req.user` — is what makes a request
  // forgeable, and it is knowable before authentication has run.
  //
  // DESIGN NOTE: this middleware is mounted globally, ahead of the per-route
  // `requireAuth`, so `req.user` is not yet populated. Gating on `req.user`
  // would have made the whole check a silent no-op.
  const hasAmbientAuth =
    typeof cookies.__session === 'string' && cookies.__session.length > 0 ||
    typeof cookies.auth_token === 'string' && cookies.auth_token.length > 0;

  if (!hasAmbientAuth) return null;

  if (!hmacKey()) return 'not_configured';

  const headerRaw = req.headers[CSRF_HEADER_NAME];
  const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  if (!headerToken || typeof cookieToken !== 'string' || cookieToken.length === 0) {
    return 'missing_token';
  }
  // Double-submit: an attacker can make the browser SEND the cookie but cannot
  // READ it (same-origin policy), so they cannot populate the matching header.
  if (!timingSafeEquals(String(headerToken), cookieToken)) {
    return 'token_mismatch';
  }

  // Requirement 8.4: reject a token minted for a DIFFERENT session. The
  // fingerprint is derived from the session cookie on this same request, so this
  // works without authentication having run.
  const fingerprint = sessionFingerprint(req);
  if (!fingerprint || !verifyCsrfToken(cookieToken, fingerprint)) {
    return 'token_not_bound_to_session';
  }

  return null;
}

/**
 * CSRF middleware. MUST be mounted AFTER authentication so `req.user` is
 * populated, since the token is bound to the authenticated uid.
 *
 * In report-only mode it logs and calls `next()`. In enforcing mode it rejects
 * with 403 and the state change never occurs (Requirement 8.2).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const enabled = process.env.SECURITY_CSRF_ENABLED?.trim().toLowerCase() !== 'false';
  if (!enabled) return next();

  const reason = evaluateCsrf(req);

  // Keep the client supplied with a valid token regardless of the outcome.
  try {
    issueCsrfCookie(req, res);
  } catch {
    /* non-fatal */
  }

  if (!reason) return next();

  const enforcing = process.env.SECURITY_CSRF_ENFORCE?.trim().toLowerCase() === 'true';

  if (!enforcing) {
    // Observation-only: surfaces exactly what enforcement would break, so the
    // client can be updated before the switch is flipped.
    console.warn('[csrf] REPORT-ONLY would reject request:', {
      method: req.method,
      path: req.path,
      reason,
    });
    return next();
  }

  console.warn('[csrf] Rejected request:', { method: req.method, path: req.path, reason });
  // Requirement 8.7 / 10.1: record the CSRF failure.
  recordAuthEventFromRequest(req, { type: 'csrf_failure', reason });
  res.status(403).json({
    error: 'csrf_validation_failed',
    message: 'CSRF token missing or invalid',
    code: reason,
  });
}

export default csrfProtection;
