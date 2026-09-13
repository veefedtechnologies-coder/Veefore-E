/**
 * SSRF guard — pure (DB-free, IO-free) core for guarding every external or
 * provider-supplied media fetch (Req 19.6, 19.7).
 *
 * When the Video_Editor is about to fetch an external or provider-supplied media
 * URL (e.g. a provider's rendered output, a remote source asset), it MUST decide,
 * BEFORE issuing any outbound request, whether the destination is safe:
 *
 *   1. Allowlist (Req 19.6) — the destination host MUST appear on the configured
 *      allowlist. Nothing off the allowlist is ever fetched.
 *   2. No internal targets (Req 19.7) — the host's RESOLVED addresses MUST NOT
 *      include any private, loopback, link-local, or otherwise internal/reserved
 *      address. This defends against DNS-rebinding, where an allowlisted host name
 *      resolves to an internal IP.
 *
 * A fetch is allowed if and only if BOTH hold. On any failure the guard returns
 * `{ allowed: false }` with a precise reason, and the caller MUST NOT issue the
 * outbound request (Req 19.7).
 *
 * Separation of concerns: this module is the pure ALLOW/DENY decision. It takes
 * the destination URL, the ALREADY-resolved IP addresses for its host, and the
 * allowlist config as inputs. The actual DNS resolution and the outbound fetch
 * (and re-pinning the connection to the verified IP) are performed by the wiring
 * layer (task 18.3). Passing resolved IPs in keeps this core deterministic and
 * property-testable without performing network IO.
 *
 * The allowlist is supplied as a parameter/config input rather than hardcoded, so
 * the wiring layer owns where it comes from (task 18.3).
 *
 * Pure and total: every exported function is deterministic, never throws, and
 * performs no IO.
 */

// ---------------------------------------------------------------------------
// Configuration input (Req 19.6)
// ---------------------------------------------------------------------------

/**
 * The SSRF allowlist config. Supplied by the wiring layer (task 18.3); this pure
 * core never hardcodes hosts.
 *
 * An entry matches a destination host case-insensitively as follows:
 *   - A plain host (`"cdn.example.com"`) matches that exact host only.
 *   - A leading-dot host (`".example.com"`) matches that domain AND any subdomain
 *     of it (`"a.example.com"`, `"example.com"`), never a mere suffix like
 *     `"notexample.com"`.
 */
export interface SsrfAllowlistConfig {
  /** Allowed destination hosts (see {@link SsrfAllowlistConfig} for match rules). */
  readonly hosts: readonly string[];
  /**
   * URL schemes permitted for outbound fetches. Defaults to `['http', 'https']`
   * when omitted. Anything else (e.g. `file:`, `gopher:`, `ftp:`) is rejected.
   */
  readonly allowedSchemes?: readonly string[];
}

/** The destination the guard is asked to evaluate, before any outbound request. */
export interface SsrfGuardInput {
  /** The external/provider-supplied media URL to fetch. */
  url: string;
  /**
   * The IP addresses the URL's host has ALREADY resolved to (IPv4 and/or IPv6),
   * as produced by the wiring layer's DNS resolution (task 18.3). The guard
   * verifies every one of these is non-internal (Req 19.7). An empty list is a
   * rejection — nothing verifiable to fetch.
   */
  resolvedIps: readonly string[];
  /** The configured allowlist (Req 19.6). */
  allowlist: SsrfAllowlistConfig;
}

// ---------------------------------------------------------------------------
// Decision result
// ---------------------------------------------------------------------------

/** Why a fetch was rejected. The `allowed` boolean is what governs the invariant. */
export type SsrfRejectionReason =
  /** The URL could not be parsed. */
  | 'INVALID_URL'
  /** The URL scheme is not one of the permitted schemes. */
  | 'UNSUPPORTED_SCHEME'
  /** The host is not on the configured allowlist (Req 19.6, 19.7). */
  | 'NOT_ALLOWLISTED'
  /** No resolved addresses were supplied — nothing verifiable to fetch. */
  | 'NO_RESOLVED_ADDRESSES'
  /** A resolved address could not be parsed as a valid IP. */
  | 'UNPARSEABLE_ADDRESS'
  /** A resolved address is private/loopback/link-local/internal (Req 19.7). */
  | 'INTERNAL_ADDRESS';

/** Result of evaluating a candidate outbound fetch (Req 19.6, 19.7). */
export type SsrfDecision =
  | { allowed: true; host: string; scheme: string; resolvedIps: string[] }
  | { allowed: false; reason: SsrfRejectionReason; message: string };

/** The default set of permitted URL schemes when the config omits `allowedSchemes`. */
export const DEFAULT_ALLOWED_SCHEMES: readonly string[] = ['http', 'https'];

// ---------------------------------------------------------------------------
// Host allowlist matching (Req 19.6)
// ---------------------------------------------------------------------------

/** Normalize a host for comparison: lowercase and strip one trailing dot (FQDN root). */
function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

/**
 * Is `host` permitted by the allowlist (Req 19.6)? Matches an exact entry, or a
 * leading-dot entry (`".example.com"`) that matches the domain itself and any of
 * its subdomains. Case-insensitive. Empty/whitespace hosts never match.
 */
export function isHostAllowlisted(host: string, allowlist: SsrfAllowlistConfig): boolean {
  const target = normalizeHost(host ?? '');
  if (target.length === 0) return false;

  for (const raw of allowlist?.hosts ?? []) {
    if (typeof raw !== 'string') continue;
    const entry = normalizeHost(raw);
    if (entry.length === 0) continue;

    if (entry.startsWith('.')) {
      // ".example.com" → match "example.com" and any subdomain "*.example.com".
      const domain = entry.slice(1);
      if (domain.length === 0) continue;
      if (target === domain || target.endsWith('.' + domain)) return true;
    } else if (target === entry) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// IP address parsing (pure)
// ---------------------------------------------------------------------------

/**
 * Parse a dotted-quad IPv4 string into its four octets, or `null` if it is not a
 * strict, canonical IPv4 literal. Rejects out-of-range octets, empty parts, and
 * non-numeric characters.
 */
export function parseIPv4(value: string): [number, number, number, number] | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    // Strict decimal: at least one digit, digits only, no leading '+'/'-'/space.
    if (part.length === 0 || part.length > 3 || !/^[0-9]+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    octets.push(n);
  }
  return [octets[0], octets[1], octets[2], octets[3]];
}

/**
 * Parse an IPv6 string into its eight 16-bit groups, or `null` if invalid.
 * Handles `::` zero-compression and a trailing embedded IPv4 (e.g.
 * `::ffff:192.168.0.1`). Zone ids (`%eth0`) are stripped before parsing.
 */
export function parseIPv6(value: string): number[] | null {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (s.length === 0) return null;

  // Strip an IPv6 zone id if present (e.g. "fe80::1%eth0").
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);

  // Split into the head (before "::") and tail (after "::") halves.
  const doubleColon = s.indexOf('::');
  let headPart: string;
  let tailPart: string | null;
  if (doubleColon === -1) {
    headPart = s;
    tailPart = null;
  } else {
    // Only one "::" allowed.
    if (s.indexOf('::', doubleColon + 1) !== -1) return null;
    headPart = s.slice(0, doubleColon);
    tailPart = s.slice(doubleColon + 2);
  }

  const parseGroups = (segment: string): number[] | null => {
    if (segment.length === 0) return [];
    const raw = segment.split(':');
    const groups: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const token = raw[i];
      // A trailing embedded IPv4 (only valid as the last token).
      if (token.includes('.')) {
        if (i !== raw.length - 1) return null;
        const v4 = parseIPv4(token);
        if (!v4) return null;
        groups.push((v4[0] << 8) | v4[1]);
        groups.push((v4[2] << 8) | v4[3]);
        continue;
      }
      if (token.length === 0 || token.length > 4 || !/^[0-9a-fA-F]+$/.test(token)) return null;
      groups.push(parseInt(token, 16));
    }
    return groups;
  };

  const head = parseGroups(headPart);
  if (head === null) return null;

  if (tailPart === null) {
    // No compression: must be exactly 8 groups.
    return head.length === 8 ? head : null;
  }

  const tail = parseGroups(tailPart);
  if (tail === null) return null;

  const missing = 8 - (head.length + tail.length);
  // Compression must stand in for at least one omitted group.
  if (missing < 1) return null;

  const groups = [...head, ...new Array(missing).fill(0), ...tail];
  return groups.length === 8 ? groups : null;
}

// ---------------------------------------------------------------------------
// Internal / private / loopback / link-local classification (Req 19.7)
// ---------------------------------------------------------------------------

/**
 * Is an IPv4 address (given as octets) private, loopback, link-local, or otherwise
 * internal/reserved and therefore forbidden as an SSRF destination (Req 19.7)?
 *
 * Covers: `0.0.0.0/8` (this host), `10/8`, `172.16/12`, `192.168/16` (private),
 * `127/8` (loopback), `169.254/16` (link-local), `100.64/10` (carrier-grade NAT),
 * `192.0.0/24` (IETF protocol assignments), and everything `>= 224.0.0.0`
 * (multicast, reserved, and the `255.255.255.255` broadcast).
 */
export function isForbiddenIPv4(octets: readonly [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 — "this host on this network"
  if (a === 10) return true; // 10.0.0.0/8 — private
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT (internal)
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 — IETF protocol
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

/**
 * Is an IPv6 address (given as eight 16-bit groups) loopback, unspecified,
 * link-local, unique-local, multicast, or an embedded IPv4 that is itself
 * forbidden — and therefore a forbidden SSRF destination (Req 19.7)?
 *
 * Covers: `::` (unspecified), `::1` (loopback), `fe80::/10` (link-local),
 * `fc00::/7` (unique local), `ff00::/8` (multicast), IPv4-mapped `::ffff:0:0/96`,
 * IPv4-compatible `::/96` (deprecated), and NAT64 `64:ff9b::/96` — the embedded
 * IPv4 of each is re-checked against {@link isForbiddenIPv4}.
 */
export function isForbiddenIPv6(groups: readonly number[]): boolean {
  if (groups.length !== 8) return true; // malformed → treat as unsafe

  const allZeroExceptLast = groups.slice(0, 7).every((g) => g === 0);
  if (allZeroExceptLast && groups[7] === 0) return true; // :: unspecified
  if (allZeroExceptLast && groups[7] === 1) return true; // ::1 loopback

  const g0 = groups[0];
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  const embeddedIPv4 = (): [number, number, number, number] => [
    (groups[6] >> 8) & 0xff,
    groups[6] & 0xff,
    (groups[7] >> 8) & 0xff,
    groups[7] & 0xff,
  ];

  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d (first 5 groups zero).
  const first5Zero = groups.slice(0, 5).every((g) => g === 0);
  if (first5Zero && (groups[5] === 0xffff || groups[5] === 0)) {
    return isForbiddenIPv4(embeddedIPv4());
  }
  // NAT64 well-known prefix 64:ff9b::/96 maps to an IPv4 destination.
  if (
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    return isForbiddenIPv4(embeddedIPv4());
  }

  return false;
}

/**
 * Classify a single resolved IP string. Returns `'ok'` when it is a valid,
 * routable public address; `'forbidden'` when it is private/loopback/link-local/
 * internal (Req 19.7); `'unparseable'` when it is not a valid IP at all (which
 * the guard also treats as a rejection, since it cannot be verified safe).
 */
export function classifyResolvedIp(ip: string): 'ok' | 'forbidden' | 'unparseable' {
  const v4 = parseIPv4(ip);
  if (v4) return isForbiddenIPv4(v4) ? 'forbidden' : 'ok';
  const v6 = parseIPv6(ip);
  if (v6) return isForbiddenIPv6(v6) ? 'forbidden' : 'ok';
  return 'unparseable';
}

// ---------------------------------------------------------------------------
// URL parsing (pure)
// ---------------------------------------------------------------------------

interface ParsedDestination {
  scheme: string;
  host: string;
}

/**
 * Parse the destination URL into its scheme and host, or `null` when the URL is
 * malformed. Uses the WHATWG `URL` parser (deterministic, no IO). The scheme is
 * returned without its trailing colon; the host is the bare hostname (no port,
 * IPv6 brackets stripped).
 */
function parseDestination(url: string): ParsedDestination | null {
  if (typeof url !== 'string' || url.trim().length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  // `hostname` already omits the port and strips IPv6 brackets.
  let host = parsed.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.length === 0) return null;
  return { scheme, host };
}

// ---------------------------------------------------------------------------
// The guard decision (Req 19.6, 19.7)
// ---------------------------------------------------------------------------

/**
 * Decide whether an outbound fetch to `input.url` is permitted (Req 19.6, 19.7).
 *
 * A fetch is allowed if and only if ALL of the following hold:
 *   - the URL parses and its scheme is permitted;
 *   - the host is on the configured allowlist (Req 19.6);
 *   - at least one address was resolved, every resolved address parses as a valid
 *     IP, and NONE of them is private/loopback/link-local/internal (Req 19.7).
 *
 * On any failure the result is `{ allowed: false }` with a precise reason and the
 * caller MUST NOT issue the request. Pure and total: never throws, never does IO.
 */
export function evaluateSsrfFetch(input: SsrfGuardInput): SsrfDecision {
  const allowedSchemes = input?.allowlist?.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES;

  // 1. Parse the URL.
  const dest = parseDestination(input?.url);
  if (!dest) {
    return {
      allowed: false,
      reason: 'INVALID_URL',
      message: 'Fetch rejected: the destination URL could not be parsed.',
    };
  }

  // 2. Scheme must be permitted.
  if (!allowedSchemes.map((s) => s.toLowerCase()).includes(dest.scheme)) {
    return {
      allowed: false,
      reason: 'UNSUPPORTED_SCHEME',
      message: `Fetch rejected: scheme "${dest.scheme}" is not permitted (allowed: ${allowedSchemes.join(', ')}).`,
    };
  }

  // 3. Host must be on the allowlist (Req 19.6).
  if (!isHostAllowlisted(dest.host, input.allowlist)) {
    return {
      allowed: false,
      reason: 'NOT_ALLOWLISTED',
      message: `Fetch rejected: host "${dest.host}" is not on the configured allowlist.`,
    };
  }

  // 4. There must be at least one resolved address to verify (Req 19.7).
  const resolved = input.resolvedIps ?? [];
  if (resolved.length === 0) {
    return {
      allowed: false,
      reason: 'NO_RESOLVED_ADDRESSES',
      message: `Fetch rejected: host "${dest.host}" produced no resolved addresses to verify.`,
    };
  }

  // 5. Every resolved address must parse and be a non-internal destination
  //    (Req 19.7). A single internal or unparseable address rejects the fetch —
  //    this defends against DNS-rebinding to an internal IP.
  for (const ip of resolved) {
    const classification = classifyResolvedIp(ip);
    if (classification === 'unparseable') {
      return {
        allowed: false,
        reason: 'UNPARSEABLE_ADDRESS',
        message: `Fetch rejected: resolved address "${ip}" is not a valid IP.`,
      };
    }
    if (classification === 'forbidden') {
      return {
        allowed: false,
        reason: 'INTERNAL_ADDRESS',
        message: `Fetch rejected: host "${dest.host}" resolves to a private, loopback, link-local, or internal address (${ip}).`,
      };
    }
  }

  // Allowed: on the allowlist and every resolved address is public (Req 19.6, 19.7).
  return {
    allowed: true,
    host: dest.host,
    scheme: dest.scheme,
    resolvedIps: [...resolved],
  };
}
