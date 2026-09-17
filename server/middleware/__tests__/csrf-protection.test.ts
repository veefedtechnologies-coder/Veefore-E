import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  evaluateCsrf,
  mintCsrfToken,
  verifyCsrfToken,
  sessionFingerprint,
  isCsrfProtectionActive,
  isCsrfExempt,
  issueCsrfCookie,
  csrfProtection,
} from '../csrf-protection';

/**
 * Requirement 15.2 — a State_Changing_Request without a valid CSRF_Token must be
 * rejected.
 */

const ORIGINAL_ENV = { ...process.env };
const SESSION_VALUE = 'session-cookie-value-abc123';

function makeReq(overrides: Partial<Request> & { cookies?: Record<string, unknown> } = {}): Request {
  return {
    method: 'POST',
    path: '/api/workspaces',
    headers: {},
    cookies: { __session: SESSION_VALUE },
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: any = {
    cookie: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response & { cookie: any; status: any; json: any };
}

/** A token that correctly matches the session in `makeReq`. */
function validTokenFor(req: Request): string {
  const fp = sessionFingerprint(req);
  const token = mintCsrfToken(fp!);
  return token!;
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'x'.repeat(48);
  process.env.SECURITY_CSRF_ENABLED = 'true';
  process.env.SECURITY_CSRF_ENFORCE = 'true';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('token binding (Requirement 8.4)', () => {
  it('mints a token that verifies against its own session fingerprint', () => {
    const req = makeReq();
    const fp = sessionFingerprint(req)!;
    const token = mintCsrfToken(fp)!;
    expect(verifyCsrfToken(token, fp)).toBe(true);
  });

  it('rejects a token transplanted from a DIFFERENT session', () => {
    const tokenForOther = mintCsrfToken(sessionFingerprint(makeReq())!)!;
    const otherReq = makeReq({ cookies: { __session: 'a-completely-different-session' } });
    expect(verifyCsrfToken(tokenForOther, sessionFingerprint(otherReq)!)).toBe(false);
  });

  it('rejects a token with a tampered signature', () => {
    const fp = sessionFingerprint(makeReq())!;
    const token = mintCsrfToken(fp)!;

    // The mutation must be GUARANTEED to change the value. Appending a fixed
    // character (e.g. '0') is not: the signature is random hex, so roughly 1 in 16
    // runs it already ended in that character and the "tampered" token was
    // byte-identical to the original — a flaky test that passed most of the time.
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(tampered).not.toBe(token);

    expect(verifyCsrfToken(tampered, fp)).toBe(false);
  });

  it('rejects a structurally invalid token', () => {
    const fp = sessionFingerprint(makeReq())!;
    expect(verifyCsrfToken('no-separator', fp)).toBe(false);
    expect(verifyCsrfToken('', fp)).toBe(false);
  });

  it('never embeds recoverable session material in the fingerprint', () => {
    const fp = sessionFingerprint(makeReq())!;
    expect(fp).not.toContain(SESSION_VALUE);
  });

  it('returns no fingerprint when there is no session cookie', () => {
    expect(sessionFingerprint(makeReq({ cookies: {} }))).toBeNull();
  });
});

describe('request evaluation', () => {
  it('REJECTS a state-changing cookie-authorized request with no token', () => {
    expect(evaluateCsrf(makeReq())).toBe('missing_token');
  });

  it('ACCEPTS a request carrying a matching, correctly bound token', () => {
    const req = makeReq();
    const token = validTokenFor(req);
    const withToken = makeReq({
      headers: { [CSRF_HEADER_NAME]: token },
      cookies: { __session: SESSION_VALUE, [CSRF_COOKIE_NAME]: token },
    });
    expect(evaluateCsrf(withToken)).toBeNull();
  });

  it('rejects when the header does not match the cookie', () => {
    const req = makeReq();
    const token = validTokenFor(req);
    const mismatched = makeReq({
      headers: { [CSRF_HEADER_NAME]: 'attacker-supplied-value' },
      cookies: { __session: SESSION_VALUE, [CSRF_COOKIE_NAME]: token },
    });
    expect(evaluateCsrf(mismatched)).toBe('token_mismatch');
  });

  it('rejects a matching pair that is bound to another session', () => {
    // Attacker replays a token/cookie pair harvested from a different session.
    const foreign = mintCsrfToken('some-other-fingerprint')!;
    const req = makeReq({
      headers: { [CSRF_HEADER_NAME]: foreign },
      cookies: { __session: SESSION_VALUE, [CSRF_COOKIE_NAME]: foreign },
    });
    expect(evaluateCsrf(req)).toBe('token_not_bound_to_session');
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require a token for safe method %s', (method) => {
    expect(evaluateCsrf(makeReq({ method }))).toBeNull();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'requires a token for state-changing method %s',
    (method) => {
      expect(evaluateCsrf(makeReq({ method }))).toBe('missing_token');
    }
  );

  it('does not require a token for a Bearer-authorized request (Requirement 8.5)', () => {
    const req = makeReq({ headers: { authorization: 'Bearer some.jwt.token' } });
    expect(evaluateCsrf(req)).toBeNull();
  });

  it('does not require a token when there is no ambient session cookie', () => {
    // Nothing for an attacker to ride on.
    expect(evaluateCsrf(makeReq({ cookies: {} }))).toBeNull();
  });

  it('treats an auth_token-only session as ambient authority', () => {
    const req = makeReq({ cookies: { auth_token: 'a.b.c' } });
    expect(evaluateCsrf(req)).toBe('missing_token');
  });

  it('reports not_configured when SESSION_SECRET is unusable', () => {
    process.env.SESSION_SECRET = 'too-short';
    expect(evaluateCsrf(makeReq())).toBe('not_configured');
  });
});

describe('third-party exemptions (Requirement 8.6)', () => {
  it.each([
    '/api/webhooks/instagram',
    '/api/instagram/webhook',
    '/api/subscription/razorpay/callback',
    '/api/auth/session-login',
    '/api/auth/logout',
  ])('exempts %s', (path) => {
    expect(isCsrfExempt(path)).toBe(true);
    expect(evaluateCsrf(makeReq({ path }))).toBeNull();
  });

  it('does not exempt ordinary API routes', () => {
    expect(isCsrfExempt('/api/workspaces')).toBe(false);
    expect(isCsrfExempt('/api/user')).toBe(false);
  });
});

describe('middleware behaviour and safe rollout (Requirement 16)', () => {
  it('blocks with 403 and does not call next when enforcing', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the request through in REPORT-ONLY mode', () => {
    process.env.SECURITY_CSRF_ENFORCE = 'false';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    csrfProtection(req, res, next);

    // Observation only: nothing is blocked, so an un-updated client keeps working.
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('can be disabled entirely', () => {
    process.env.SECURITY_CSRF_ENABLED = 'false';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('issues a token cookie so the client can start sending the header', () => {
    const req = makeReq();
    const res = makeRes();

    issueCsrfCookie(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        // MUST be readable by client JS — that is the double-submit mechanism.
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      })
    );
  });

  it('does not reissue a token that is already valid for the session', () => {
    const token = validTokenFor(makeReq());
    const req = makeReq({ cookies: { __session: SESSION_VALUE, [CSRF_COOKIE_NAME]: token } });
    const res = makeRes();

    issueCsrfCookie(req, res);

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('issues no token when there is no session', () => {
    const res = makeRes();
    issueCsrfCookie(makeReq({ cookies: {} }), res);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});

describe('posture reporting honesty (Requirement 11)', () => {
  it('reports inactive while in report-only mode', () => {
    process.env.SECURITY_CSRF_ENFORCE = 'false';
    // Must NOT claim protection while nothing is being blocked.
    expect(isCsrfProtectionActive()).toBe(false);
  });

  it('reports active only when actually enforcing', () => {
    process.env.SECURITY_CSRF_ENFORCE = 'true';
    expect(isCsrfProtectionActive()).toBe(true);
  });

  it('reports inactive when disabled', () => {
    process.env.SECURITY_CSRF_ENABLED = 'false';
    expect(isCsrfProtectionActive()).toBe(false);
  });

  it('reports inactive when SESSION_SECRET cannot support signing', () => {
    process.env.SESSION_SECRET = 'short';
    expect(isCsrfProtectionActive()).toBe(false);
  });
});
