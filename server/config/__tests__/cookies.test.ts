import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  AUTH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  authCookieOptions,
  sessionCookieOptions,
  clearAuthCookieVariants,
  isSecureCookieContext,
  resolveCookieDomain,
  validateCookieConfig,
  readAuthTokenCookie,
  isJwtShaped,
} from '../cookies';

/**
 * These tests lock in the invariant that caused both the landing-page flash and
 * the session-survives-logout hole: every auth cookie must be written and cleared
 * under ONE identical (domain, path, secure, sameSite) tuple.
 */

const ORIGINAL_ENV = { ...process.env };

/** Reproduces the real deployment: NODE_ENV=development served over HTTPS. */
function useTunnelProdEnv() {
  process.env.NODE_ENV = 'development';
  process.env.FRONTEND_URL = 'https://app.veefore.com';
  process.env.COOKIE_DOMAIN = 'app.veefore.com';
  delete process.env.COOKIE_SECURE;
  delete process.env.APP_ORIGIN;
}

/** Collects clearCookie calls so we can assert on the emitted variants. */
function makeRes() {
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  return {
    cleared,
    clearCookie(name: string, options?: Record<string, unknown>) {
      cleared.push({ name, options: options ?? {} });
    },
  };
}

beforeEach(() => {
  useTunnelProdEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('cookie policy: secure context resolution', () => {
  it('marks cookies Secure for an https origin even when NODE_ENV is development', () => {
    // This is the deployment that previously produced non-Secure cookies.
    expect(isSecureCookieContext()).toBe(true);
  });

  it('honours an explicit COOKIE_SECURE override', () => {
    process.env.COOKIE_SECURE = 'false';
    expect(isSecureCookieContext()).toBe(false);

    process.env.COOKIE_SECURE = 'true';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    expect(isSecureCookieContext()).toBe(true);
  });

  it('is not Secure for a plain local http origin', () => {
    process.env.NODE_ENV = 'development';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    expect(isSecureCookieContext()).toBe(false);
  });

  it('is Secure whenever NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    expect(isSecureCookieContext()).toBe(true);
  });
});

describe('cookie policy: domain resolution', () => {
  it('applies COOKIE_DOMAIN in a secure context', () => {
    expect(resolveCookieDomain()).toBe('app.veefore.com');
  });

  it('falls back to host-only when no COOKIE_DOMAIN is configured', () => {
    delete process.env.COOKIE_DOMAIN;
    expect(resolveCookieDomain()).toBeUndefined();
  });

  it('never scopes to a bare local host', () => {
    process.env.COOKIE_SECURE = 'true';
    process.env.COOKIE_DOMAIN = 'localhost';
    expect(resolveCookieDomain()).toBeUndefined();
  });

  it('does not scope to a domain in an insecure context', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.COOKIE_DOMAIN = 'app.veefore.com';
    expect(resolveCookieDomain()).toBeUndefined();
  });
});

describe('cookie policy: the core consistency invariant', () => {
  it('gives auth_token and __session an IDENTICAL scope tuple', () => {
    const auth = authCookieOptions();
    const session = sessionCookieOptions();

    // The identity tuple that determines which jar entry a cookie occupies.
    // If these ever diverge, duplicate cookies reappear.
    expect(auth.domain).toBe(session.domain);
    expect(auth.path).toBe(session.path);
    expect(auth.secure).toBe(session.secure);
    expect(auth.sameSite).toBe(session.sameSite);
  });

  it('always sets httpOnly, Secure and SameSite=Lax in the deployed config', () => {
    for (const opts of [authCookieOptions(), sessionCookieOptions()]) {
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      // 'lax' is required: Google OAuth returns via a top-level cross-site
      // redirect, which 'strict' would block.
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
    }
  });

  it('caps the session cookie at Firebase\u2019s 14-day maximum', () => {
    expect(sessionCookieOptions().maxAge).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

describe('cookie policy: clearing is total', () => {
  it('clears both auth cookies under host-only AND domain-scoped variants', () => {
    const res = makeRes();
    clearAuthCookieVariants(res);

    const names = new Set(res.cleared.map((c) => c.name));
    expect(names).toEqual(new Set([AUTH_COOKIE_NAME, SESSION_COOKIE_NAME]));

    // For each cookie we must clear the host-only variant (no domain) AND the
    // domain-scoped variant, because a differently-scoped duplicate is a distinct
    // jar entry that clearCookie only removes on an exact domain match.
    for (const name of [AUTH_COOKIE_NAME, SESSION_COOKIE_NAME]) {
      const forName = res.cleared.filter((c) => c.name === name);
      const hostOnly = forName.filter((c) => c.options.domain === undefined);
      const domainScoped = forName.filter((c) => c.options.domain === 'app.veefore.com');

      expect(hostOnly.length).toBeGreaterThan(0);
      expect(domainScoped.length).toBeGreaterThan(0);
    }
  });

  it('covers both secure=true and secure=false for every scope', () => {
    const res = makeRes();
    clearAuthCookieVariants(res, SESSION_COOKIE_NAME);

    const secureFlags = new Set(res.cleared.map((c) => c.options.secure));
    expect(secureFlags).toEqual(new Set([true, false]));
  });

  it('can target a single cookie without clearing the other', () => {
    const res = makeRes();
    clearAuthCookieVariants(res, SESSION_COOKIE_NAME);
    expect(res.cleared.every((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);
  });

  it('never emits maxAge on a clear', () => {
    const res = makeRes();
    clearAuthCookieVariants(res);
    expect(res.cleared.every((c) => c.options.maxAge === undefined)).toBe(true);
  });

  it('still clears legacy domain-scoped cookies after COOKIE_DOMAIN is removed', () => {
    // A deploy that unsets COOKIE_DOMAIN must still be able to delete cookies a
    // PREVIOUS deploy wrote with a domain, or they linger forever and can outlive
    // logout. The clear list is therefore driven by the raw env var, not by the
    // secure-context-filtered resolveCookieDomain().
    process.env.COOKIE_DOMAIN = 'app.veefore.com';
    process.env.FRONTEND_URL = 'http://localhost:5173'; // insecure → host-only writes
    expect(resolveCookieDomain()).toBeUndefined();

    const res = makeRes();
    clearAuthCookieVariants(res, SESSION_COOKIE_NAME);
    const domains = new Set(res.cleared.map((c) => c.options.domain));
    expect(domains.has('app.veefore.com')).toBe(true);
    expect(domains.has(undefined)).toBe(true);
  });
});

describe('readAuthTokenCookie', () => {
  const VALID_JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ1LTEifQ.c2lnbmF0dXJl';

  it('returns a structurally valid Firebase JWT unchanged', () => {
    // The bug this replaces: the old HMAC reader required exactly two
    // dot-separated parts, so a three-part JWT was always rejected and the
    // cookie auth fallback never worked.
    expect(readAuthTokenCookie({ cookies: { auth_token: VALID_JWT } })).toBe(VALID_JWT);
  });

  it('returns null when the cookie is absent', () => {
    expect(readAuthTokenCookie({ cookies: {} })).toBeNull();
  });

  it('returns null when there are no cookies at all', () => {
    expect(readAuthTokenCookie({})).toBeNull();
  });

  it('returns null for an empty cookie value', () => {
    expect(readAuthTokenCookie({ cookies: { auth_token: '' } })).toBeNull();
  });

  it('returns null for a non-string cookie value', () => {
    expect(readAuthTokenCookie({ cookies: { auth_token: 12345 } })).toBeNull();
  });

  it.each([
    ['no separators', 'opaque-token'],
    ['two segments (legacy signed shape)', 'payload.deadbeef'],
    ['four segments', 'a.b.c.d'],
    ['empty middle segment', 'header..signature'],
    ['illegal characters', 'not valid.$$$.chars!'],
  ])('returns null for a malformed token: %s', (_label, value) => {
    expect(readAuthTokenCookie({ cookies: { auth_token: value } })).toBeNull();
  });

  it('does not treat shape as authorization', () => {
    // A structurally valid but forged token is still returned here — it is the
    // caller's Firebase verification that rejects it. This test documents that
    // boundary so nobody mistakes the shape check for an auth decision.
    const forged = 'Zm9yZ2Vk.cGF5bG9hZA.bm90LWEtcmVhbC1zaWc';
    expect(isJwtShaped(forged)).toBe(true);
    expect(readAuthTokenCookie({ cookies: { auth_token: forged } })).toBe(forged);
  });
});

describe('cookie policy: configuration validation', () => {
  it('reports no problems for the deployed configuration', () => {
    expect(validateCookieConfig()).toEqual([]);
  });

  it('flags an https origin with Secure disabled', () => {
    process.env.COOKIE_SECURE = 'false';
    const problems = validateCookieConfig();
    expect(problems.join(' ')).toMatch(/not marked Secure/i);
  });

  it('flags a COOKIE_DOMAIN that does not cover the origin host', () => {
    process.env.COOKIE_DOMAIN = 'example.com';
    const problems = validateCookieConfig();
    expect(problems.join(' ')).toMatch(/does not cover/i);
  });

  it('accepts a parent domain that covers the origin host', () => {
    process.env.FRONTEND_URL = 'https://app.veefore.com';
    process.env.COOKIE_DOMAIN = '.veefore.com';
    expect(validateCookieConfig()).toEqual([]);
  });
});
