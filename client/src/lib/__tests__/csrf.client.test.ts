// @vitest-environment happy-dom
// Declared explicitly rather than relying on `environmentMatchGlobs`, which is not
// applied by the installed vitest version — without this the suite runs under the
// node environment and `document` is undefined.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  getCsrfToken,
  methodNeedsCsrf,
  csrfHeaders,
  withCsrf,
} from '../csrf';

/**
 * Client half of the double-submit CSRF scheme. The server issues a readable
 * `vf_csrf` cookie and requires the same value in the `X-CSRF-Token` header on
 * state-changing requests.
 */

function setCookie(raw: string) {
  Object.defineProperty(document, 'cookie', {
    value: raw,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  setCookie('');
});

afterEach(() => {
  setCookie('');
});

describe('getCsrfToken', () => {
  it('reads the token from the cookie jar', () => {
    setCookie(`${CSRF_COOKIE_NAME}=abc.def`);
    expect(getCsrfToken()).toBe('abc.def');
  });

  it('finds the token among other cookies', () => {
    setCookie(`theme=dark; ${CSRF_COOKIE_NAME}=tok123; vf_ws=ws-1`);
    expect(getCsrfToken()).toBe('tok123');
  });

  it('returns null when absent', () => {
    setCookie('theme=dark');
    expect(getCsrfToken()).toBeNull();
  });

  it('returns null for an empty jar', () => {
    expect(getCsrfToken()).toBeNull();
  });

  it('does not match a cookie whose name merely ENDS with the token name', () => {
    // Naive substring/regex parsing would wrongly pick this up.
    setCookie(`not_vf_csrf=wrong-value`);
    expect(getCsrfToken()).toBeNull();
  });

  it('url-decodes the value', () => {
    setCookie(`${CSRF_COOKIE_NAME}=a%2Bb%3Dc`);
    expect(getCsrfToken()).toBe('a+b=c');
  });

  it('treats an empty value as absent', () => {
    setCookie(`${CSRF_COOKIE_NAME}=`);
    expect(getCsrfToken()).toBeNull();
  });
});

describe('methodNeedsCsrf', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires a token for %s', (m) => {
    expect(methodNeedsCsrf(m)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not require a token for %s', (m) => {
    expect(methodNeedsCsrf(m)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(methodNeedsCsrf('post')).toBe(true);
  });

  it('defaults an absent method to GET', () => {
    expect(methodNeedsCsrf(undefined)).toBe(false);
  });
});

describe('csrfHeaders', () => {
  it('supplies the header for a mutation when a token exists', () => {
    setCookie(`${CSRF_COOKIE_NAME}=tok`);
    expect(csrfHeaders('POST')).toEqual({ [CSRF_HEADER_NAME]: 'tok' });
  });

  it('supplies nothing for a safe method even when a token exists', () => {
    setCookie(`${CSRF_COOKIE_NAME}=tok`);
    expect(csrfHeaders('GET')).toEqual({});
  });

  it('supplies nothing when no token is available', () => {
    // Deliberately does NOT throw: the server runs report-only before enforcement,
    // so failing hard here would break requests the server would still accept.
    expect(csrfHeaders('POST')).toEqual({});
  });
});

describe('withCsrf', () => {
  beforeEach(() => {
    setCookie(`${CSRF_COOKIE_NAME}=tok`);
  });

  it('adds the header to a plain-object headers form', () => {
    const out = withCsrf({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(out.headers).toEqual({
      'Content-Type': 'application/json',
      [CSRF_HEADER_NAME]: 'tok',
    });
  });

  it('preserves headers given as a Headers instance', () => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const out = withCsrf({ method: 'PUT', headers });

    expect(out.headers).toMatchObject({ [CSRF_HEADER_NAME]: 'tok' });

    // Header names are case-insensitive and the Headers implementation may
    // normalise them, so assert on the surviving value rather than an exact key.
    const entries = Object.entries(out.headers as Record<string, string>);
    expect(entries.some(([k, v]) => k.toLowerCase() === 'content-type' && v === 'application/json')).toBe(true);
  });

  it('preserves headers given as an array of pairs', () => {
    const out = withCsrf({ method: 'DELETE', headers: [['X-Other', '1']] });
    expect(out.headers).toEqual({ 'X-Other': '1', [CSRF_HEADER_NAME]: 'tok' });
  });

  it('leaves a safe-method request untouched', () => {
    const options = { method: 'GET', headers: { A: '1' } };
    expect(withCsrf(options)).toBe(options);
  });

  it('does not drop other request options', () => {
    const out = withCsrf({ method: 'POST', body: 'payload', cache: 'no-store' });
    expect(out.body).toBe('payload');
    expect(out.cache).toBe('no-store');
  });
});

describe('installCsrfFetchInterceptor', () => {
  let originalFetch: typeof window.fetch;
  let seen: Array<{ url: string; headers: Headers }>;

  beforeEach(async () => {
    setCookie(`${CSRF_COOKIE_NAME}=tok`);
    seen = [];
    originalFetch = window.fetch;

    window.fetch = (async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      seen.push({ url, headers: new Headers(init?.headers ?? {}) });
      return new Response('{}', { status: 200 });
    }) as any;

    // Fresh module instance each time so the install guard does not leak.
    vi.resetModules();
    const mod = await import('../csrf');
    mod.installCsrfFetchInterceptor();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.resetModules();
  });

  it('adds the header to a same-origin mutation that never touched apiRequest', async () => {
    // This is the case that would otherwise 403 on enforcement: a raw fetch from
    // e.g. WorkspaceSwitcher or the video-editor utils.
    await window.fetch('/api/workspaces/switch', { method: 'POST' });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok');
  });

  it('leaves safe methods alone', async () => {
    await window.fetch('/api/user', { method: 'GET' });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('defaults a method-less request to GET and adds nothing', async () => {
    await window.fetch('/api/user');
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('does NOT leak the token to a cross-origin request', async () => {
    await window.fetch('https://evil.example.com/collect', { method: 'POST' });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('treats an absolute same-origin URL as same-origin', async () => {
    await window.fetch(`${window.location.origin}/api/thing`, { method: 'PUT' });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok');
  });

  it('preserves headers the caller already set', async () => {
    await window.fetch('/api/thing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Other': '1' },
    });
    expect(seen[0].headers.get('x-other')).toBe('1');
    expect(seen[0].headers.get('content-type')).toBe('application/json');
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok');
  });

  it('does not overwrite an explicitly supplied token', async () => {
    await window.fetch('/api/thing', {
      method: 'POST',
      headers: { [CSRF_HEADER_NAME]: 'caller-supplied' },
    });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('caller-supplied');
  });

  it('passes the request through unchanged when no token exists', async () => {
    setCookie('');
    await window.fetch('/api/thing', { method: 'POST' });
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('is idempotent — installing twice does not double-wrap', async () => {
    const mod = await import('../csrf');
    mod.installCsrfFetchInterceptor();
    mod.installCsrfFetchInterceptor();

    await window.fetch('/api/thing', { method: 'DELETE' });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok');
  });
});
