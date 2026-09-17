/**
 * Content-Security-Policy directive construction (Requirement 3).
 *
 * Kept separate from `security-flags.ts` so the POLICY (what is allowed) is
 * reviewable independently of the SWITCHES (whether it is enforced).
 *
 * The policy is built from:
 *   - a conservative baseline (self-only for the sensitive directives),
 *   - the origins this application genuinely needs,
 *   - operator-supplied additions via `SECURITY_CSP_*` env vars, so a new
 *     third-party origin does not require a code change (Requirement 3.4),
 *   - `frame-ancestors`, which supersedes the removed `X-Frame-Options`
 *     behaviour (Requirements 3.6, 4.1).
 */

import { cspSettings, frameSettings, type CspSettings, type FrameSettings } from './security-flags';

/** Origins the app itself depends on, independent of operator configuration. */
const BASE_CONNECT_SRC = [
  "'self'",
  // Firebase Authentication + Identity Toolkit (client SDK sign-in).
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://*.googleapis.com',
  // Firebase realtime/websocket transports.
  'wss://*.firebaseio.com',
];

const BASE_IMG_SRC = [
  "'self'",
  'data:',
  'blob:',
  // Social platform CDNs serve avatars and media thumbnails.
  'https://*.cdninstagram.com',
  'https://*.fbcdn.net',
  'https://scontent.cdninstagram.com',
  'https://lh3.googleusercontent.com',
  'https:',
];

const BASE_MEDIA_SRC = ["'self'", 'data:', 'blob:', 'https:'];

const BASE_FONT_SRC = ["'self'", 'data:', 'https://fonts.gstatic.com'];

const BASE_STYLE_SRC = [
  "'self'",
  // Tailwind and the runtime style injections require inline styles. Note that
  // 'unsafe-inline' for STYLES is materially lower risk than for scripts.
  "'unsafe-inline'",
  'https://fonts.googleapis.com',
];

const BASE_SCRIPT_SRC = ["'self'"];

/** De-duplicate while preserving order. */
function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

/**
 * Resolve the `frame-ancestors` directive from the frame policy. This is the
 * modern replacement for `X-Frame-Options` and is what actually constrains
 * embedding in current browsers.
 */
function frameAncestors(frame: FrameSettings): string[] {
  if (frame.policy === 'off') return ['*'];
  if (frame.policy === 'deny') return ["'none'"];
  return unique(["'self'", ...frame.allowedAncestors]);
}

/**
 * Build the CSP directive map.
 *
 * `allowDevInline` widens `script-src` with `'unsafe-inline'`/`'unsafe-eval'`
 * and permits websocket connections, because the embedded Vite dev pipeline
 * injects inline module preambles and uses a websocket for HMR. This is scoped
 * to the dev pipeline precisely so it is NOT silently carried into a built
 * production bundle.
 */
export function buildCspDirectives(
  csp: CspSettings = cspSettings(),
  frame: FrameSettings = frameSettings()
): Record<string, string[]> {
  const scriptSrc = unique([
    ...BASE_SCRIPT_SRC,
    ...csp.extraScriptSrc,
    ...(csp.allowDevInline ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
  ]);

  const connectSrc = unique([
    ...BASE_CONNECT_SRC,
    ...csp.extraConnectSrc,
    ...(csp.allowDevInline ? ['ws:', 'wss:'] : []),
  ]);

  const directives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc: unique([...BASE_STYLE_SRC, ...csp.extraStyleSrc]),
    imgSrc: unique([...BASE_IMG_SRC, ...csp.extraImgSrc]),
    fontSrc: unique([...BASE_FONT_SRC, ...csp.extraFontSrc]),
    connectSrc,
    mediaSrc: unique([...BASE_MEDIA_SRC, ...csp.extraMediaSrc]),
    // No plugins, and no <base> hijacking.
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    // Restrict where <form> submissions may go.
    formAction: ["'self'"],
    // Supersedes X-Frame-Options (Requirements 3.6, 4.1).
    frameAncestors: frameAncestors(frame),
  };

  if (csp.reportUri) {
    directives.reportUri = [csp.reportUri];
  }

  return directives;
}

/**
 * Helmet-compatible CSP option, or `false` when CSP is disabled.
 *
 * Returning helmet's own shape (rather than a raw header string) keeps helmet
 * responsible for serialisation and for choosing the enforcing vs report-only
 * header name.
 */
export function helmetCspOption(
  csp: CspSettings = cspSettings(),
  frame: FrameSettings = frameSettings()
): false | { useDefaults: false; directives: Record<string, string[]>; reportOnly: boolean } {
  if (!csp.enabled) return false;
  return {
    // Build the directive set explicitly rather than merging helmet's defaults,
    // so the effective policy is exactly what `buildCspDirectives` documents.
    useDefaults: false,
    directives: buildCspDirectives(csp, frame),
    reportOnly: csp.reportOnly,
  };
}
