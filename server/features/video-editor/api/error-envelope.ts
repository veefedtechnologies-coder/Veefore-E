/**
 * Shared error-envelope + secret-redaction helpers for the Video Editor API
 * (task 21.1, Req 19.8, 21.6, 21.7, 23.4, 23.5).
 *
 * Consolidates the response conventions that every Video Editor router follows
 * so behaviour is identical across `project.routes`, `artifact.routes`, and
 * `conversation.routes`:
 *
 *   - the newer `{ success:true, data }` / `{ success:false, error:{ code, message } }`
 *     response envelope used by the subscription/workspace/analytics modules;
 *   - typed error classes carrying a `statusCode` + stable `code` (as in
 *     `InsufficientAICreditsError`, `RenderEngineError`, `MediaIngestionRejectedError`)
 *     are mapped straight onto that envelope (Req 21.7);
 *   - zod validation failures become a `400 VALIDATION_ERROR` naming the failed
 *     constraint, and — because validation runs BEFORE any persistence — nothing
 *     is created or mutated (Req 21.6);
 *   - any other/unexpected error becomes a generic `500` whose user-facing
 *     message NEVER contains provider API keys, secrets, tokens, signed URLs, or
 *     stack traces; the full detail is logged server-side only via `logger`
 *     (Req 19.8);
 *   - a failed operation therefore always reports a FAILURE state and never a
 *     fabricated success (No-Mock integrity, Req 23.5), and an unimplemented
 *     capability surfaces an explicit `unavailable` envelope (Req 23.4).
 *
 * The `redactSecrets` helper is the single place secret-like values are stripped
 * from a string or object before it is surfaced to a caller. `logger` already
 * redacts by well-known KEY (`server/config/logger.ts`); `redactSecrets`
 * additionally scrubs secret-like VALUES embedded in free text and URLs so a
 * user-facing message can never leak them.
 */

import type { Response } from 'express';
import { ZodError } from 'zod';

import { logger as defaultLogger } from '../../../config/logger';

// ── Envelope types ───────────────────────────────────────────────────────────

export interface SuccessEnvelope<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

export type Envelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * A typed HTTP error: an `Error` subclass exposing an HTTP `statusCode` and a
 * stable machine-readable `code` (the Video Editor convention — see
 * `RenderEngineError`, `DeterministicEditError`, `MediaIngestionRejectedError`,
 * `ArtifactValidationError`, `AnalysisFailedError`, `SsrfBlockedError`, …).
 */
export interface TypedHttpError extends Error {
  statusCode: number;
  code: string;
}

/**
 * True when `err` is a zod validation error. Detected structurally (name +
 * `issues` array) in addition to `instanceof`, so it survives multiple zod
 * module copies in the test/build graph.
 */
export function isZodError(err: unknown): err is ZodError {
  if (err instanceof ZodError) return true;
  return (
    err instanceof Error &&
    err.name === 'ZodError' &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

/** True when `err` carries a usable `statusCode` + `code` we can map directly. */
export function isTypedHttpError(err: unknown): err is TypedHttpError {
  if (!(err instanceof Error)) return false;
  const e = err as Partial<TypedHttpError>;
  return (
    typeof e.statusCode === 'number' &&
    Number.isInteger(e.statusCode) &&
    e.statusCode >= 400 &&
    e.statusCode <= 599 &&
    typeof e.code === 'string' &&
    e.code.length > 0
  );
}

// ── Envelope response helpers ─────────────────────────────────────────────────

/** Send a `{ success:true, data }` response with the given status (default 200). */
export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data } satisfies SuccessEnvelope);
}

/**
 * Send a `{ success:false, error:{ code, message } }` response. The `message` is
 * ALWAYS run through {@link redactSecrets} so a caller-supplied or downstream
 * string can never carry a secret to the client (Req 19.8).
 */
export function fail(res: Response, status: number, code: string, message: string): Response {
  return res
    .status(status)
    .json({ success: false, error: { code, message: redactSecrets(message) } } satisfies ErrorEnvelope);
}

/**
 * Explicit "capability unavailable" envelope (Req 23.4): the request did NOT
 * execute a fabricated success — it is surfaced as an unavailable state with a
 * reason. Uses HTTP 501 by default (Not Implemented).
 */
export function unavailable(
  res: Response,
  reason: string,
  code = 'CAPABILITY_UNAVAILABLE',
  status = 501,
): Response {
  return fail(res, status, code, reason);
}

// ── zod validation → envelope (Req 21.6) ──────────────────────────────────────

/** Render a `ZodError`'s first issue as a `field: message` string for the body. */
export function zodIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

// ── Secret redaction (Req 19.8, 22.4) ─────────────────────────────────────────

export const REDACTED = '[REDACTED]';

/** Object keys whose VALUE is always a secret and must be replaced wholesale. */
const SECRET_KEY_RE =
  /(pass(word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|session|credential|authorization|auth|bearer|signature|x-goog-signature|x-amz-signature)/i;

/** URL query-parameter names that carry a signature/credential and must be scrubbed. */
const SECRET_QUERY_PARAM_RE =
  /^(x-goog-signature|x-goog-credential|x-amz-signature|x-amz-credential|x-amz-security-token|signature|sig|token|access_token|refresh_token|api_?key|key|password|secret|credential|se|sp|sig|sv|st|sr|skoid|sig)$/i;

/**
 * Redact secret-like VALUES embedded in a free-text string:
 *   - `Bearer <token>` / `Basic <token>` authorization values;
 *   - `key=value` pairs where the key looks secret (query strings, logfmt);
 *   - provider key shapes (`sk-…`, `dummy_google_key_…`, `dummy_aws_key_…`, `dummy_github_key_…`, `xoxb-…`, …);
 *   - the query string of any URL that carries a signing/credential parameter
 *     (so a Signed_URL is never surfaced with its signature intact).
 */
function redactString(input: string): string {
  let out = input;

  // 1. Signed / credentialed URLs → drop the offending query params.
  out = out.replace(/https?:\/\/[^\s"'<>()]+/gi, (url) => redactUrl(url));

  // 2. Authorization schemes carrying an inline credential.
  out = out.replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTED}`);

  // 3. `secretKey=value` / `secretKey: value` pairs in logfmt / query text. The
  //    separator is preserved, and an auth-scheme word (`Bearer`/`Basic`) is NOT
  //    treated as the value (rule 2 already redacted the token that follows it),
  //    so `Authorization: Bearer <token>` stays readable as `Authorization: Bearer [REDACTED]`.
  out = out.replace(
    /\b([A-Za-z0-9_-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|credential|authorization|signature)[A-Za-z0-9_-]*)(\s*[:=]\s*)(?!Bearer\b|Basic\b)("?)([^\s"'&,;]+)\3/gi,
    (_m, key: string, sep: string, quote: string) => `${key}${sep}${quote}${REDACTED}${quote}`,
  );

  // 4. Well-known provider key shapes appearing as bare tokens.
  out = out.replace(
    /\b(sk-[A-Za-z0-9]{8,}|rk_[A-Za-z0-9]{8,}|dummy_google_key_[A-Za-z0-9_-]{10,}|dummy_aws_key_[A-Z0-9]{12,}|dummy_github_key_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g,
    REDACTED,
  );

  return out;
}

/** Strip signing/credential query params from a single URL, keeping the path. */
function redactUrl(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const query = url.slice(qIndex + 1);
  let redactedAny = false;
  const parts = query.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    const name = eq === -1 ? pair : pair.slice(0, eq);
    if (SECRET_QUERY_PARAM_RE.test(name)) {
      redactedAny = true;
      return eq === -1 ? name : `${name}=${REDACTED}`;
    }
    return pair;
  });
  // If nothing matched a known signing param but the URL still has a query, keep
  // it as-is (it may be a harmless `?w=100`); when we did redact, rebuild it.
  return redactedAny ? `${base}?${parts.join('&')}` : url;
}

/**
 * Deeply redact secrets from any value so it is safe to surface to a caller or
 * include in a user-facing message. Strings are scrubbed for embedded secrets;
 * object keys that look secret have their value replaced with `[REDACTED]`;
 * arrays and nested objects are redacted recursively. Circular references are
 * handled and depth is bounded.
 */
export function redactSecrets<T>(value: T, _depth = 0, _seen = new WeakSet<object>()): T {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (typeof value !== 'object') return value; // number | boolean | bigint | symbol

  // Bound recursion; represent depth cutoff as the redaction marker.
  if (_depth > 6) return REDACTED as unknown as T;

  const obj = value as unknown as object;
  if (_seen.has(obj)) return value;
  _seen.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, _depth + 1, _seen)) as unknown as T;
  }

  // Preserve Error objects' message (redacted) rather than enumerating them.
  if (value instanceof Error) {
    return redactString(value.message) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redactSecrets(val, _depth + 1, _seen);
    }
  }
  return result as unknown as T;
}

// ── Central error handler ──────────────────────────────────────────────────────

export interface SendErrorOptions {
  /** Logging component tag (e.g. `videoEditor.ProjectRouter`). */
  component: string;
  /** The logical operation being attempted (e.g. `create`, `render`). */
  op?: string;
  /** Extra server-side-only log context (ids). Never echoed to the client. */
  context?: Record<string, unknown>;
  /** Logger override (defaults to the app logger). */
  logger?: Pick<typeof defaultLogger, 'warn' | 'error'>;
  /** Fallback code/message for an unexpected (non-typed) error. */
  fallbackCode?: string;
  fallbackMessage?: string;
}

/**
 * Map any thrown value onto the response envelope, following the Video Editor
 * conventions and NEVER leaking secrets or stack traces (Req 19.8, 21.7, 23.5):
 *
 *   - `ZodError`          → 400 `VALIDATION_ERROR` naming the failed constraint
 *                           (validation ran before persistence, so nothing was
 *                           mutated — Req 21.6);
 *   - a {@link TypedHttpError} → its own `statusCode` + `code`, with a redacted
 *                           message;
 *   - anything else       → a generic 500 whose message is a fixed, safe string;
 *                           the full error + stack is logged server-side only.
 *
 * Always returns a FAILURE envelope — a failed operation is never reported as a
 * success (Req 23.5).
 */
export function sendError(res: Response, err: unknown, opts: SendErrorOptions): Response {
  const log = opts.logger ?? defaultLogger;
  const baseContext = { component: opts.component, op: opts.op, ...opts.context };

  // Client input error → 400, no mutation occurred (validation precedes writes).
  if (isZodError(err)) {
    return fail(res, 400, 'VALIDATION_ERROR', zodIssueMessage(err));
  }

  // Known typed error → map its status + stable code, with a redacted message.
  if (isTypedHttpError(err)) {
    // A 5xx typed error is a server-side fault worth logging with full detail;
    // 4xx typed errors are expected client outcomes and are logged at warn.
    if (err.statusCode >= 500) {
      log.error(`${opts.component} request failed`, err, baseContext);
    } else {
      log.warn(`${opts.component} rejected request: ${err.code}`, baseContext);
    }
    return fail(res, err.statusCode, err.code, err.message);
  }

  // Unexpected error → log full detail server-side ONLY, return a safe generic.
  log.error(`${opts.component} request failed`, err, baseContext);
  return fail(
    res,
    500,
    opts.fallbackCode ?? 'INTERNAL_ERROR',
    opts.fallbackMessage ?? 'The request could not be completed',
  );
}
