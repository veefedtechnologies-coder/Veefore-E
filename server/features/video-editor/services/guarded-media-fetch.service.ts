/**
 * Guarded_Media_Fetch — the IO wiring layer over the pure `ssrf-guard.logic`
 * core (task 18.3, Req 19.6, 19.7).
 *
 * This is the ONLY place the Video Editor issues an outbound request for an
 * external or provider-supplied media URL. Every such fetch MUST go through
 * {@link guardedMediaFetch} so the SSRF invariant is enforced uniformly:
 *
 *   1. Resolve the destination host's IP addresses via DNS (`dns.lookup`, all
 *      records).
 *   2. Hand the URL, the resolved IPs, and the configured allowlist to the pure
 *      `evaluateSsrfFetch` decision core (Req 19.6, 19.7).
 *   3. Issue the outbound request ONLY when the core returns `allowed: true`.
 *      When it returns `allowed: false` we throw {@link SsrfBlockedError} and no
 *      socket is ever opened to the destination.
 *   4. RE-PIN the connection to a verified IP (task 18.3): the outbound socket
 *      connects to the exact address the guard verified, via a custom `lookup`
 *      that returns only the verified IPs. This closes the DNS-rebinding window
 *      between our resolution and the connection's own resolution — the host
 *      cannot re-resolve to an internal address after passing the guard.
 *
 * Redirects are NOT followed transparently: a 3xx `Location` is a brand-new
 * external URL, so it is re-evaluated through the full guard (allowlist + IP
 * classification) before any further request, up to a bounded hop count.
 *
 * The allowlist comes from config/env ({@link getVideoEditorMediaAllowlist}) —
 * the pure core never hardcodes hosts, and neither does this wiring layer.
 */

import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import { logger as defaultLogger } from '../../../config/logger';
import { INGESTION_LIMITS } from '../config/video-editor.config';
import {
  evaluateSsrfFetch,
  type SsrfAllowlistConfig,
  type SsrfDecision,
  type SsrfRejectionReason,
} from './ssrf-guard.logic';
import type { VideoOutput } from './providers/video-ai-provider';

// ---------------------------------------------------------------------------
// Allowlist configuration (from config/env, Req 19.6)
// ---------------------------------------------------------------------------

/**
 * Environment variable holding the comma/whitespace-separated list of allowed
 * destination hosts for external/provider media fetches. Entries follow the
 * match rules of {@link SsrfAllowlistConfig}: a plain host matches exactly, a
 * leading-dot host (`.example.com`) matches the domain and any subdomain.
 */
export const MEDIA_ALLOWLIST_ENV = 'VIDEO_EDITOR_MEDIA_ALLOWLIST';

/**
 * Environment variable holding the comma/whitespace-separated list of permitted
 * URL schemes. Defaults to `https` only when unset (media fetches should be
 * encrypted); set to `https,http` to also permit plaintext.
 */
export const MEDIA_ALLOWED_SCHEMES_ENV = 'VIDEO_EDITOR_MEDIA_ALLOWED_SCHEMES';

/** Split a comma/whitespace-separated env value into a clean, de-duplicated list. */
function splitList(value: string | undefined | null): string[] {
  if (typeof value !== 'string') return [];
  const seen = new Set<string>();
  for (const raw of value.split(/[,\s]+/)) {
    const entry = raw.trim();
    if (entry.length > 0) seen.add(entry);
  }
  return [...seen];
}

/**
 * Build the SSRF allowlist config for external/provider media fetches from the
 * environment (Req 19.6). Hosts come from {@link MEDIA_ALLOWLIST_ENV}; permitted
 * schemes come from {@link MEDIA_ALLOWED_SCHEMES_ENV} (default `https`). An empty
 * host list means NOTHING is fetchable — the guard fails closed, which is the
 * safe default when no allowlist is configured.
 */
export function getVideoEditorMediaAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): SsrfAllowlistConfig {
  const hosts = splitList(env[MEDIA_ALLOWLIST_ENV]);
  const schemes = splitList(env[MEDIA_ALLOWED_SCHEMES_ENV]);
  return {
    hosts,
    allowedSchemes: schemes.length > 0 ? schemes : ['https'],
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the SSRF guard rejects an outbound media fetch (Req 19.7). No
 * outbound request is issued. `reason` is the pure-core rejection reason; the
 * user-facing `message` never leaks internal addresses beyond what the pure core
 * already includes, and callers should log only the blocked host (design §Error
 * handling).
 */
export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_FETCH_BLOCKED';
  readonly statusCode = 502;
  readonly reason: SsrfRejectionReason;

  constructor(reason: SsrfRejectionReason, message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
    this.reason = reason;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** Thrown when a guarded fetch fails for a non-SSRF reason (network, size, status). */
export class GuardedFetchError extends Error {
  readonly code: 'FETCH_FAILED' | 'RESPONSE_TOO_LARGE' | 'BAD_STATUS' | 'TOO_MANY_REDIRECTS';
  readonly statusCode: number;

  constructor(
    code: GuardedFetchError['code'],
    message: string,
    statusCode = 502,
  ) {
    super(message);
    this.name = 'GuardedFetchError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Options / result
// ---------------------------------------------------------------------------

/** Options for a guarded outbound media fetch. */
export interface GuardedFetchOptions {
  /** Allowlist to enforce (defaults to the env-derived allowlist, Req 19.6). */
  allowlist?: SsrfAllowlistConfig;
  /** Maximum response size in bytes (defaults to the ingestion max size). */
  maxBytes?: number;
  /** Per-request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
  /** Abort signal to cancel an in-flight fetch. */
  signal?: AbortSignal;
  /** Maximum number of redirects to follow, each re-guarded (default 3). */
  maxRedirects?: number;
  /** Logger override (defaults to the app logger). */
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /**
   * DNS resolver override for tests. Given a host, returns its resolved IP
   * strings. Defaults to `dns.promises.lookup(host, { all: true })`.
   */
  resolveHost?: (host: string) => Promise<string[]>;
}

/** The bytes and metadata produced by a successful guarded fetch. */
export interface GuardedFetchResult {
  /** The downloaded bytes. */
  buffer: Buffer;
  /** The response `Content-Type`, or a generic default when absent. */
  contentType: string;
  /** The number of bytes downloaded. */
  size: number;
  /** The final URL fetched (after any re-guarded redirects). */
  finalUrl: string;
}

// ---------------------------------------------------------------------------
// DNS resolution
// ---------------------------------------------------------------------------

/** Resolve every IP (IPv4 + IPv6) a host maps to, for the guard to classify. */
async function defaultResolveHost(host: string): Promise<string[]> {
  const records = await dns.promises.lookup(host, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

// ---------------------------------------------------------------------------
// The guarded fetch (Req 19.6, 19.7 — task 18.3)
// ---------------------------------------------------------------------------

/**
 * Fetch an external/provider-supplied media URL, enforcing the SSRF guard
 * BEFORE any outbound request (Req 19.6, 19.7). Resolves the host, evaluates the
 * pure guard, and — only when allowed — issues the request re-pinned to a
 * verified IP. On rejection this throws {@link SsrfBlockedError} and opens no
 * socket to the destination.
 */
export async function guardedMediaFetch(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<GuardedFetchResult> {
  const log = options.logger ?? defaultLogger;
  const allowlist = options.allowlist ?? getVideoEditorMediaAllowlist();
  const maxBytes = options.maxBytes ?? INGESTION_LIMITS.maxSizeBytes;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const maxRedirects = options.maxRedirects ?? 3;

  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    // 1. Resolve the destination host to IPs (Req 19.7 input). A resolution
    //    failure yields an empty list, which the guard rejects fail-closed.
    let resolvedIps: string[] = [];
    let hostForLog = '';
    try {
      const parsed = new URL(currentUrl);
      hostForLog = parsed.hostname.replace(/^\[|\]$/g, '');
      if (hostForLog.length > 0) {
        resolvedIps = await resolveHost(hostForLog);
      }
    } catch {
      // Leave resolvedIps empty; the guard rejects an unparseable/unresolvable URL.
      resolvedIps = [];
    }

    // 2. Pure allow/deny decision (Req 19.6, 19.7). NO request has been issued yet.
    const decision: SsrfDecision = evaluateSsrfFetch({ url: currentUrl, resolvedIps, allowlist });
    if (!decision.allowed) {
      // Log only the blocked host + reason, never full internal detail (design §Error handling).
      log.warn?.(
        '[VideoEditor][GuardedFetch] Blocked outbound media fetch (SSRF guard)',
        { host: hostForLog, reason: decision.reason },
      );
      throw new SsrfBlockedError(decision.reason, decision.message);
    }

    // 3. Issue the request, RE-PINNED to a guard-verified IP (task 18.3).
    const response = await requestPinned(currentUrl, decision.resolvedIps, {
      timeoutMs,
      maxBytes,
      signal: options.signal,
    });

    // 4. A redirect is a NEW external URL — re-guard it, do not follow blindly.
    if (response.redirectLocation) {
      if (hop >= maxRedirects) {
        throw new GuardedFetchError(
          'TOO_MANY_REDIRECTS',
          `Guarded fetch exceeded the maximum of ${maxRedirects} redirects.`,
        );
      }
      currentUrl = new URL(response.redirectLocation, currentUrl).toString();
      continue;
    }

    return {
      buffer: response.buffer,
      contentType: response.contentType,
      size: response.buffer.length,
      finalUrl: currentUrl,
    };
  }

  // Unreachable: the loop either returns, redirects, or throws.
  throw new GuardedFetchError('TOO_MANY_REDIRECTS', 'Guarded fetch redirect loop exhausted.');
}

// ---------------------------------------------------------------------------
// Low-level request with IP re-pinning
// ---------------------------------------------------------------------------

interface PinnedResponse {
  buffer: Buffer;
  contentType: string;
  /** Present when the response is a 3xx redirect that must be re-guarded. */
  redirectLocation?: string;
}

/**
 * Build a `lookup`-compatible function that resolves the host ONLY to the IPs
 * the SSRF guard already verified (task 18.3). This pins the outbound socket to
 * a verified address and prevents the connection from re-resolving DNS to a
 * different (possibly internal) address.
 */
function pinnedLookup(verifiedIps: readonly string[]): NonNullable<http.RequestOptions['lookup']> {
  const entries = verifiedIps.map((address) => ({
    address,
    family: address.includes(':') ? 6 : 4,
  }));
  return ((hostname: string, opts: any, callback: any) => {
    const cb = typeof opts === 'function' ? opts : callback;
    const wantsAll = typeof opts === 'object' && opts !== null && opts.all === true;
    if (entries.length === 0) {
      cb(new Error('No verified IP available for pinned lookup'));
      return;
    }
    if (wantsAll) {
      cb(null, entries);
    } else {
      cb(null, entries[0].address, entries[0].family);
    }
  }) as NonNullable<http.RequestOptions['lookup']>;
}

/** Issue a single request pinned to `verifiedIps`, buffering the body with a size cap. */
function requestPinned(
  url: string,
  verifiedIps: readonly string[],
  opts: { timeoutMs: number; maxBytes: number; signal?: AbortSignal },
): Promise<PinnedResponse> {
  return new Promise<PinnedResponse>((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new GuardedFetchError('FETCH_FAILED', 'Guarded fetch received an unparseable URL.'));
      return;
    }

    const transport = parsed.protocol === 'http:' ? http : https;
    const requestOptions: https.RequestOptions = {
      method: 'GET',
      // Re-pin the socket to a guard-verified IP (task 18.3, DNS-rebinding defense).
      lookup: pinnedLookup(verifiedIps),
      signal: opts.signal,
    };

    const req = transport.request(url, requestOptions, (res) => {
      const status = res.statusCode ?? 0;

      // Redirect: surface the Location so the caller re-guards it.
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume(); // drain
        resolve({ buffer: Buffer.alloc(0), contentType: '', redirectLocation: res.headers.location });
        return;
      }

      if (status < 200 || status >= 300) {
        res.resume();
        reject(
          new GuardedFetchError('BAD_STATUS', `Guarded fetch got HTTP ${status}.`, 502),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > opts.maxBytes) {
          req.destroy();
          reject(
            new GuardedFetchError(
              'RESPONSE_TOO_LARGE',
              `Guarded fetch exceeded the maximum response size of ${opts.maxBytes} bytes.`,
              413,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: (res.headers['content-type'] as string) || 'application/octet-stream',
        });
      });
      res.on('error', (err) =>
        reject(new GuardedFetchError('FETCH_FAILED', `Guarded fetch response error: ${err.message}`)),
      );
    });

    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new GuardedFetchError('FETCH_FAILED', `Guarded fetch timed out after ${opts.timeoutMs} ms.`));
    });
    req.on('error', (err) => {
      if (err instanceof GuardedFetchError) reject(err);
      else reject(new GuardedFetchError('FETCH_FAILED', `Guarded fetch failed: ${err.message}`));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Provider-output materialization (provider transport fetch path, Req 19.6/19.7)
// ---------------------------------------------------------------------------

/** Bytes materialized from a provider {@link VideoOutput}. */
export interface MaterializedVideoOutput {
  buffer: Buffer;
  mimeType: string;
  outputSeconds: number;
}

/**
 * Materialize a generative provider's {@link VideoOutput} to bytes for storage.
 *
 * Providers may return the produced video either inline (base64) or BY REFERENCE
 * (a `uri`). The inline case needs no outbound request. The by-reference case is
 * an external/provider-supplied media fetch and MUST go through the SSRF guard
 * (Req 19.6, 19.7) — so this routes it through {@link guardedMediaFetch}. This is
 * the single guarded entry point the Generative_Editor (task 17.6) uses to pull
 * provider output that is returned by reference.
 */
export async function materializeVideoOutput(
  output: VideoOutput,
  options: GuardedFetchOptions = {},
): Promise<MaterializedVideoOutput> {
  if (output?.videoBase64) {
    return {
      buffer: Buffer.from(output.videoBase64, 'base64'),
      mimeType: output.mimeType,
      outputSeconds: output.outputSeconds,
    };
  }
  if (output?.uri) {
    const fetched = await guardedMediaFetch(output.uri, options);
    return {
      buffer: fetched.buffer,
      mimeType: output.mimeType || fetched.contentType,
      outputSeconds: output.outputSeconds,
    };
  }
  throw new GuardedFetchError(
    'FETCH_FAILED',
    'Provider output has neither inline bytes nor a URI to materialize.',
    422,
  );
}
