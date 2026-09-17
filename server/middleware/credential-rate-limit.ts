/**
 * Rate limiting for credential endpoints
 * (spec: production-security-hardening, Requirement 9).
 *
 * THE GAP THIS FIXES
 * ------------------
 * `oauthRateLimiter` throttles ONLY `GET …/start`. That narrowing was a deliberate
 * fix — the limiter is mounted on the whole `/api/auth` router, and the
 * session-maintenance endpoints fire on every page load, so an undifferentiated
 * bucket was being drained by normal navigation and producing false 429s on
 * sign-in. But it left the endpoints that actually accept credentials
 * (`/signin`, `/session-login`, `/update-token`, `/refresh`) with no limiter at
 * all, so credential stuffing against them was unthrottled (Requirement 9.1).
 *
 * WHY A SEPARATE LIMITER
 * ----------------------
 * The two classes of endpoint have genuinely different traffic shapes, so one
 * bucket cannot serve both without either false-positiving on maintenance traffic
 * or being uselessly loose on credential traffic. This limiter therefore keys on
 * (client IP + endpoint class):
 *
 *   - VERIFICATION endpoints (`/signin`) — a human typing a password. Tight bucket.
 *   - MAINTENANCE endpoints (`/session-login`, `/update-token`, `/refresh`) — fired
 *     automatically by the client, legitimately many times per session. Generous
 *     bucket, sized to be unreachable by normal use but still bounded, so a
 *     token-guessing loop cannot run unbounded (Requirement 9.3).
 */

import type { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, type RateLimiterRes } from 'rate-limiter-flexible';

import { recordAuthEventFromRequest } from '../lib/auth-audit';

/** Endpoint classes with distinct traffic shapes. */
type CredentialClass = 'verification' | 'maintenance';

/** Tight: interactive credential verification. */
const VERIFICATION_POINTS = 10;
/** Generous: client-driven session upkeep that fires on every page load. */
const MAINTENANCE_POINTS = 120;
const WINDOW_SECONDS = 60;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const verificationLimiter = new RateLimiterMemory({
  points: envInt('SECURITY_CREDENTIAL_RATE_LIMIT', VERIFICATION_POINTS),
  duration: WINDOW_SECONDS,
  blockDuration: WINDOW_SECONDS,
  keyPrefix: 'cred_verify',
});

const maintenanceLimiter = new RateLimiterMemory({
  points: envInt('SECURITY_SESSION_RATE_LIMIT', MAINTENANCE_POINTS),
  duration: WINDOW_SECONDS,
  blockDuration: WINDOW_SECONDS,
  keyPrefix: 'cred_maint',
});

/** Path suffixes that verify a credential a human supplied. */
const VERIFICATION_PATHS = ['/signin', '/signup', '/login', '/reset-password'];
/** Path suffixes the client fires automatically to maintain a session. */
const MAINTENANCE_PATHS = ['/session-login', '/update-token', '/refresh', '/session'];

/** Classify a request, or null when it is not a credential endpoint. */
export function classifyCredentialPath(path: string): CredentialClass | null {
  const p = path.toLowerCase();
  // Verification is checked first: '/session-login' must not be mistaken for a
  // login-verification path by a looser substring match.
  if (VERIFICATION_PATHS.some((s) => p === s || p.endsWith(s))) return 'verification';
  if (MAINTENANCE_PATHS.some((s) => p === s || p.endsWith(s))) return 'maintenance';
  return null;
}

/**
 * Real client address behind the deployment proxy (Requirement 9.4). Without this
 * every request behind the tunnel shares one key and a single user would exhaust
 * the bucket for everyone.
 */
function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Throttle credential endpoints. Only POST/PUT/PATCH is consumed — a GET cannot
 * submit a credential, so counting it would burn the bucket on navigation.
 *
 * Fails OPEN on limiter error: an infrastructure fault must not lock everyone out
 * of signing in. That is the correct trade-off here because the limiter is an
 * abuse-mitigation control, not an authorization control — authorization is still
 * enforced by the endpoint itself.
 */
export async function credentialRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (process.env.SECURITY_CREDENTIAL_RATE_LIMIT_ENABLED?.trim().toLowerCase() === 'false') {
      return next();
    }

    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

    const cls = classifyCredentialPath(req.path);
    if (!cls) return next();

    const limiter = cls === 'verification' ? verificationLimiter : maintenanceLimiter;
    const key = `${clientKey(req)}:${cls}`;

    try {
      const result: RateLimiterRes = await limiter.consume(key);
      res.setHeader('X-RateLimit-Limit', String(limiter.points));
      res.setHeader('X-RateLimit-Remaining', String(result.remainingPoints));
      next();
    } catch (rejection: any) {
      const retryAfter = Math.ceil((rejection?.msBeforeNext ?? WINDOW_SECONDS * 1000) / 1000);
      res.setHeader('X-RateLimit-Limit', String(limiter.points));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(retryAfter));

      // Requirement 9.5: record the trip.
      recordAuthEventFromRequest(req, {
        type: 'rate_limit',
        reason: `credential_${cls}`,
        detail: { retryAfter },
      });

      res.status(429).json({
        error: 'too_many_requests',
        message: 'Too many requests, please try again later',
        retryAfter,
      });
    }
  } catch (error) {
    console.error('[credential-rate-limit] limiter error — allowing request:', error);
    next();
  }
}

export default credentialRateLimiter;
