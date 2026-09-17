/**
 * Security control flags — the single authoritative source for WHICH browser
 * security protections are active.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The security posture used to be gated on `isProduction`, derived from
 * `NODE_ENV`. The live deployment runs `NODE_ENV=development` behind an HTTPS
 * Cloudflare tunnel, so every one of these evaluated to "off" in production:
 *
 *   strictTransportSecurity: isProduction ? {...} : false          → disabled
 *   contentSecurityPolicy:   isProduction && ENABLE_CSP ? ... : false → disabled
 *   frameguard:              false                                  → disabled
 *   + middleware calling res.removeHeader('X-Frame-Options')
 *
 * Verified against the live host: the responses carried no
 * `strict-transport-security`, no `content-security-policy`, and no
 * `x-frame-options`.
 *
 * The fix is NOT to flip `NODE_ENV` — that would switch the server from the
 * embedded Vite dev pipeline to static file serving and break the current
 * deployment topology. Instead, every control is driven by EXPLICIT
 * configuration and, where relevant, by whether the app is actually reached over
 * HTTPS. A deployment serving real users is therefore protected regardless of
 * `NODE_ENV` (Requirement 1.1, 1.2, 1.5).
 *
 * ROLLOUT SAFETY
 * --------------
 * Controls that can break a working app default to their SAFEST-TO-DEPLOY state,
 * not their strictest:
 *   - CSP defaults to REPORT-ONLY, so violations are observed and never block
 *     (Requirements 3.2, 16.2). Enforcement is a separate, deliberate switch.
 *   - HSTS `includeSubDomains` and `preload` default to OFF because they are
 *     effectively IRREVERSIBLE for the duration of max-age: once a browser (or
 *     the preload list) records them, sibling subdomains that are not
 *     HTTPS-capable become unreachable. They must be opted into knowingly.
 */

import { isSecureCookieContext } from './cookies';

/** Parse a boolean env var. Returns `fallback` when unset or unrecognised. */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}

/** Parse an integer env var, falling back when unset or non-numeric. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Parse a comma-separated list env var into trimmed, non-empty entries. */
function envList(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * True when the application is served over HTTPS (including TLS terminated by a
 * proxy or tunnel). Shares its resolution with the cookie policy so the two can
 * never disagree about whether this deployment is a secure context.
 */
export function isSecureDeployment(): boolean {
  return isSecureCookieContext();
}

/**
 * True for a genuinely local development context: not served over HTTPS and not
 * flagged as production. Used only to relax controls that would obstruct local
 * workflows (Requirement 1.6).
 */
export function isLocalDevelopment(): boolean {
  return !isSecureDeployment() && process.env.NODE_ENV !== 'production';
}

// ── HSTS (Requirement 2) ────────────────────────────────────────────────────

export interface HstsSettings {
  enabled: boolean;
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

/**
 * HSTS is enabled by default whenever the deployment is served over HTTPS, and
 * is never emitted for a plaintext local context (Requirement 2.4).
 */
export function hstsSettings(): HstsSettings {
  const enabled = envBool('SECURITY_HSTS_ENABLED', isSecureDeployment());
  return {
    enabled: enabled && isSecureDeployment(),
    // One year minimum (Requirement 2.2); two years is the preload-list value.
    maxAge: envInt('SECURITY_HSTS_MAX_AGE', 63072000),
    // Default OFF: irreversible for max-age once cached by browsers.
    includeSubDomains: envBool('SECURITY_HSTS_INCLUDE_SUBDOMAINS', false),
    preload: envBool('SECURITY_HSTS_PRELOAD', false),
  };
}

// ── Frame / clickjacking protection (Requirement 4) ─────────────────────────

export type FramePolicy = 'sameorigin' | 'deny' | 'off';

export interface FrameSettings {
  policy: FramePolicy;
  /** Extra origins permitted to frame the app, for CSP `frame-ancestors`. */
  allowedAncestors: string[];
}

/**
 * Frame protection defaults to `sameorigin`.
 *
 * The previous code disabled `frameguard` AND actively stripped
 * `X-Frame-Options`, commented as being for Replit iframe embedding. That
 * environment no longer serves this app, so the permissive behaviour is a
 * liability rather than a requirement. Set `SECURITY_FRAME_POLICY=off` (or list
 * origins in `SECURITY_FRAME_ANCESTORS`) if a real embedding need exists.
 */
export function frameSettings(): FrameSettings {
  const raw = process.env.SECURITY_FRAME_POLICY?.trim().toLowerCase();
  const policy: FramePolicy =
    raw === 'off' || raw === 'deny' || raw === 'sameorigin' ? raw : 'sameorigin';
  return { policy, allowedAncestors: envList('SECURITY_FRAME_ANCESTORS') };
}

// ── Content-Security-Policy (Requirement 3) ─────────────────────────────────

export interface CspSettings {
  enabled: boolean;
  /** True → emit `Content-Security-Policy-Report-Only` instead of enforcing. */
  reportOnly: boolean;
  reportUri?: string;
  /** Additional origins the app legitimately needs (CDNs, APIs, media hosts). */
  extraConnectSrc: string[];
  extraScriptSrc: string[];
  extraImgSrc: string[];
  extraStyleSrc: string[];
  extraFontSrc: string[];
  extraMediaSrc: string[];
  /**
   * Relaxations required by the embedded Vite dev pipeline (inline/eval scripts
   * and websocket HMR). Enabled automatically when the dev server is in use,
   * because a strict policy would break module loading in that mode.
   */
  allowDevInline: boolean;
}

/**
 * CSP defaults to ENABLED but REPORT-ONLY.
 *
 * Report-only is deliberate: an enforcing CSP on an app that has never had one
 * is very likely to block a legitimate resource and produce a blank page. This
 * lets violations be collected first, then enforcement flipped on with
 * `SECURITY_CSP_ENFORCE=true` once the report stream is clean
 * (Requirements 3.2, 3.3, 16.2, 16.4).
 */
export function cspSettings(): CspSettings {
  // The embedded Vite dev server injects inline module scripts and uses a
  // websocket for HMR; a strict policy breaks it.
  const usingDevServer = process.env.NODE_ENV !== 'production' && process.env.SPLIT_DEV !== '1';
  return {
    enabled: envBool('SECURITY_CSP_ENABLED', true),
    reportOnly: !envBool('SECURITY_CSP_ENFORCE', false),
    reportUri: process.env.SECURITY_CSP_REPORT_URI?.trim() || undefined,
    extraConnectSrc: envList('SECURITY_CSP_CONNECT_SRC'),
    extraScriptSrc: envList('SECURITY_CSP_SCRIPT_SRC'),
    extraImgSrc: envList('SECURITY_CSP_IMG_SRC'),
    extraStyleSrc: envList('SECURITY_CSP_STYLE_SRC'),
    extraFontSrc: envList('SECURITY_CSP_FONT_SRC'),
    extraMediaSrc: envList('SECURITY_CSP_MEDIA_SRC'),
    allowDevInline: envBool('SECURITY_CSP_ALLOW_DEV_INLINE', usingDevServer),
  };
}

// ── Cross-origin policy (Requirement 5) ─────────────────────────────────────

export interface CorsSettings {
  /** Explicit allow-list. Empty means same-origin only. */
  allowedOrigins: string[];
  /** True when configuration is absent and we fell back to same-origin only. */
  usingSameOriginDefault: boolean;
}

/**
 * Resolves the allowed cross-origin set from explicit configuration.
 *
 * `CORS_ORIGIN` was unset, so the app advertised `Access-Control-Allow-Origin: *`
 * alongside `Access-Control-Allow-Credentials: true`. Browsers refuse to send
 * credentials to a wildcard origin, so it was not directly exploitable, but it
 * misrepresented the intended policy. We now default to same-origin only and
 * warn (Requirements 5.2, 5.3).
 */
export function corsSettings(): CorsSettings {
  const configured = envList('CORS_ORIGIN').filter((o) => o !== '*');
  const wildcardRequested = envList('CORS_ORIGIN').includes('*');

  const allowedOrigins = [...configured];

  // The app's own origin is always permitted.
  const self = process.env.FRONTEND_URL?.trim() || process.env.APP_ORIGIN?.trim();
  if (self && !allowedOrigins.includes(self)) allowedOrigins.push(self);

  return {
    allowedOrigins,
    usingSameOriginDefault: configured.length === 0 && !wildcardRequested,
  };
}

// ── Startup reporting (Requirements 1.3, 1.4) ───────────────────────────────

export interface SecurityControlStatus {
  name: string;
  enabled: boolean;
  detail?: string;
}

/**
 * Snapshot of every control's ACTUAL runtime state. This is the single source
 * used for both startup logging and the security posture report, so the report
 * can never claim a control is active when it is not (Requirement 11.1, 11.2).
 */
export function securityControlStatuses(): SecurityControlStatus[] {
  const secure = isSecureDeployment();
  const hsts = hstsSettings();
  const csp = cspSettings();
  const frame = frameSettings();
  const cors = corsSettings();

  return [
    { name: 'HTTPS_CONTEXT', enabled: secure, detail: secure ? 'https' : 'plaintext' },
    {
      name: 'HSTS',
      enabled: hsts.enabled,
      detail: hsts.enabled
        ? `max-age=${hsts.maxAge}${hsts.includeSubDomains ? '; includeSubDomains' : ''}${hsts.preload ? '; preload' : ''}`
        : 'disabled',
    },
    {
      name: 'CSP',
      enabled: csp.enabled,
      detail: !csp.enabled
        ? 'disabled'
        : csp.reportOnly
          ? 'report-only (not enforcing)'
          : 'enforcing',
    },
    {
      name: 'CLICKJACKING_PROTECTION',
      enabled: frame.policy !== 'off',
      detail: frame.policy,
    },
    {
      name: 'CORS_POLICY',
      enabled: true,
      detail: cors.usingSameOriginDefault
        ? 'same-origin only (CORS_ORIGIN unset)'
        : cors.allowedOrigins.join(', '),
    },
  ];
}

/**
 * Log the security posture at startup and warn about anything disabled while
 * serving real traffic over HTTPS (Requirements 1.3, 1.4). Logs only — never
 * throws — so a misconfiguration cannot prevent the server from booting.
 */
export function reportSecurityPosture(): SecurityControlStatus[] {
  const statuses = securityControlStatuses();
  const secure = isSecureDeployment();

  console.log('[security] Control posture:');
  for (const s of statuses) {
    console.log(`[security]   ${s.enabled ? '✓' : '✗'} ${s.name}: ${s.detail ?? ''}`);
  }

  if (secure) {
    const csp = cspSettings();
    if (!hstsSettings().enabled) {
      console.warn('[security] WARNING: serving HTTPS without HSTS.');
    }
    if (!csp.enabled) {
      console.warn('[security] WARNING: serving HTTPS without a Content-Security-Policy.');
    } else if (csp.reportOnly) {
      console.warn(
        '[security] NOTICE: CSP is REPORT-ONLY and is not blocking anything. ' +
          'Set SECURITY_CSP_ENFORCE=true once the violation reports are clean.'
      );
    }
    if (frameSettings().policy === 'off') {
      console.warn('[security] WARNING: clickjacking protection is disabled.');
    }
    if (corsSettings().usingSameOriginDefault) {
      console.warn(
        '[security] NOTICE: CORS_ORIGIN is unset — defaulting to same-origin only.'
      );
    }
  }

  return statuses;
}
