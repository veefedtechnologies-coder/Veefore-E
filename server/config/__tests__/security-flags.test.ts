import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  isSecureDeployment,
  isLocalDevelopment,
  hstsSettings,
  frameSettings,
  cspSettings,
  corsSettings,
  securityControlStatuses,
} from '../security-flags';
import { buildCspDirectives, helmetCspOption } from '../csp-policy';

/**
 * Regression guards for spec `production-security-hardening`.
 *
 * The defect these lock in: the security posture was gated on `isProduction`
 * (derived from NODE_ENV). The live host runs NODE_ENV=development behind an
 * HTTPS tunnel, so HSTS, CSP and clickjacking protection were all silently
 * disabled on real user traffic.
 */

const ORIGINAL_ENV = { ...process.env };

/** The real production deployment: NODE_ENV=development, served over HTTPS. */
function useTunnelProdEnv() {
  process.env.NODE_ENV = 'development';
  process.env.FRONTEND_URL = 'https://app.veefore.com';
  process.env.COOKIE_DOMAIN = 'app.veefore.com';
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('SECURITY_')) delete process.env[k];
  }
  delete process.env.COOKIE_SECURE;
  delete process.env.CORS_ORIGIN;
}

beforeEach(() => {
  useTunnelProdEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('secure deployment detection (Requirement 1)', () => {
  it('treats an https origin as a secure deployment despite NODE_ENV=development', () => {
    expect(isSecureDeployment()).toBe(true);
    expect(isLocalDevelopment()).toBe(false);
  });

  it('treats plain local http as local development', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    expect(isSecureDeployment()).toBe(false);
    expect(isLocalDevelopment()).toBe(true);
  });
});

describe('HSTS (Requirement 2)', () => {
  it('is ENABLED on the https tunnel deployment (previously disabled)', () => {
    // This is the core regression: the old `isProduction ? {...} : false` gate
    // produced no HSTS header at all on the live host.
    expect(hstsSettings().enabled).toBe(true);
  });

  it('uses a max-age of at least one year', () => {
    expect(hstsSettings().maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it('defaults includeSubDomains and preload to OFF (irreversible if enabled)', () => {
    const hsts = hstsSettings();
    expect(hsts.includeSubDomains).toBe(false);
    expect(hsts.preload).toBe(false);
  });

  it('allows opting into includeSubDomains and preload explicitly', () => {
    process.env.SECURITY_HSTS_INCLUDE_SUBDOMAINS = 'true';
    process.env.SECURITY_HSTS_PRELOAD = 'true';
    const hsts = hstsSettings();
    expect(hsts.includeSubDomains).toBe(true);
    expect(hsts.preload).toBe(true);
  });

  it('is never emitted for a plaintext local context', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    expect(hstsSettings().enabled).toBe(false);
  });

  it('cannot be force-enabled on a plaintext context', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.SECURITY_HSTS_ENABLED = 'true';
    expect(hstsSettings().enabled).toBe(false);
  });
});

describe('CSP (Requirement 3)', () => {
  it('is enabled by default', () => {
    expect(cspSettings().enabled).toBe(true);
  });

  it('defaults to REPORT-ONLY so it cannot break a working app', () => {
    expect(cspSettings().reportOnly).toBe(true);
    expect(helmetCspOption()).toMatchObject({ reportOnly: true });
  });

  it('switches to enforcing when explicitly configured', () => {
    process.env.SECURITY_CSP_ENFORCE = 'true';
    expect(cspSettings().reportOnly).toBe(false);
    expect(helmetCspOption()).toMatchObject({ reportOnly: false });
  });

  it('can be disabled entirely', () => {
    process.env.SECURITY_CSP_ENABLED = 'false';
    expect(helmetCspOption()).toBe(false);
  });

  it('locks down the high-risk directives', () => {
    const d = buildCspDirectives();
    expect(d.objectSrc).toEqual(["'none'"]);
    expect(d.baseUri).toEqual(["'self'"]);
    expect(d.formAction).toEqual(["'self'"]);
    expect(d.defaultSrc).toEqual(["'self'"]);
  });

  it('permits the identity provider endpoints sign-in requires', () => {
    const connect = buildCspDirectives().connectSrc.join(' ');
    expect(connect).toContain('identitytoolkit.googleapis.com');
    expect(connect).toContain('securetoken.googleapis.com');
  });

  it('accepts operator-supplied extra origins without a code change', () => {
    process.env.SECURITY_CSP_CONNECT_SRC = 'https://api.example.com,https://cdn.example.com';
    const connect = buildCspDirectives().connectSrc;
    expect(connect).toContain('https://api.example.com');
    expect(connect).toContain('https://cdn.example.com');
  });

  it('does not allow unsafe script sources once dev inline is off', () => {
    process.env.SECURITY_CSP_ALLOW_DEV_INLINE = 'false';
    const scriptSrc = buildCspDirectives().scriptSrc;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('relaxes script-src only when the dev pipeline needs it', () => {
    process.env.SECURITY_CSP_ALLOW_DEV_INLINE = 'true';
    const scriptSrc = buildCspDirectives().scriptSrc;
    expect(scriptSrc).toContain("'unsafe-inline'");
  });

  it('emits a report-uri when configured', () => {
    process.env.SECURITY_CSP_REPORT_URI = '/api/security/csp-report';
    expect(buildCspDirectives().reportUri).toEqual(['/api/security/csp-report']);
  });
});

describe('clickjacking protection (Requirement 4)', () => {
  it('defaults to sameorigin rather than the previous permissive behaviour', () => {
    expect(frameSettings().policy).toBe('sameorigin');
  });

  it('expresses the default as frame-ancestors self', () => {
    expect(buildCspDirectives().frameAncestors).toEqual(["'self'"]);
  });

  it('supports an explicit embedding allow-list instead of allowing all origins', () => {
    process.env.SECURITY_FRAME_ANCESTORS = 'https://trusted.example.com';
    const ancestors = buildCspDirectives().frameAncestors;
    expect(ancestors).toContain("'self'");
    expect(ancestors).toContain('https://trusted.example.com');
    expect(ancestors).not.toContain('*');
  });

  it('supports full deny', () => {
    process.env.SECURITY_FRAME_POLICY = 'deny';
    expect(buildCspDirectives().frameAncestors).toEqual(["'none'"]);
  });

  it('only permits all origins when explicitly turned off', () => {
    process.env.SECURITY_FRAME_POLICY = 'off';
    expect(buildCspDirectives().frameAncestors).toEqual(['*']);
  });

  it('ignores an unrecognised policy value and stays protective', () => {
    process.env.SECURITY_FRAME_POLICY = 'banana';
    expect(frameSettings().policy).toBe('sameorigin');
  });
});

describe('CORS policy (Requirement 5)', () => {
  it('defaults to same-origin only when CORS_ORIGIN is unset', () => {
    const cors = corsSettings();
    expect(cors.usingSameOriginDefault).toBe(true);
    expect(cors.allowedOrigins).not.toContain('*');
  });

  it('always includes the app origin', () => {
    expect(corsSettings().allowedOrigins).toContain('https://app.veefore.com');
  });

  it('never returns a wildcard even when one is configured', () => {
    process.env.CORS_ORIGIN = '*';
    expect(corsSettings().allowedOrigins).not.toContain('*');
  });

  it('honours an explicit allow-list', () => {
    process.env.CORS_ORIGIN = 'https://a.example.com,https://b.example.com';
    const origins = corsSettings().allowedOrigins;
    expect(origins).toContain('https://a.example.com');
    expect(origins).toContain('https://b.example.com');
  });
});

describe('security posture reporting (Requirement 11)', () => {
  it('reports control state derived from actual configuration', () => {
    const byName = Object.fromEntries(securityControlStatuses().map((s) => [s.name, s]));

    expect(byName.HTTPS_CONTEXT.enabled).toBe(true);
    expect(byName.HSTS.enabled).toBe(true);
    expect(byName.CSP.enabled).toBe(true);
    expect(byName.CLICKJACKING_PROTECTION.enabled).toBe(true);
  });

  it('reports CSP as report-only rather than implying enforcement', () => {
    const csp = securityControlStatuses().find((s) => s.name === 'CSP');
    expect(csp?.detail).toMatch(/report-only/i);
  });

  it('reflects a disabled control as disabled', () => {
    process.env.SECURITY_CSP_ENABLED = 'false';
    process.env.SECURITY_FRAME_POLICY = 'off';

    const byName = Object.fromEntries(securityControlStatuses().map((s) => [s.name, s]));
    expect(byName.CSP.enabled).toBe(false);
    expect(byName.CLICKJACKING_PROTECTION.enabled).toBe(false);
  });
});
