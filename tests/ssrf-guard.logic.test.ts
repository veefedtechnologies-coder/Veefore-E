import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  evaluateSsrfFetch,
  isHostAllowlisted,
  parseIPv4,
  parseIPv6,
  isForbiddenIPv4,
  isForbiddenIPv6,
  classifyResolvedIp,
  DEFAULT_ALLOWED_SCHEMES,
  type SsrfAllowlistConfig,
} from '../server/features/video-editor/services/ssrf-guard.logic';

// ---------------------------------------------------------------------------
// Shared allowlist config used across the property/unit tests.
// - "cdn.example.com" is an exact-match host.
// - ".assets.example.org" matches the domain and any subdomain.
// ---------------------------------------------------------------------------
const ALLOWLIST: SsrfAllowlistConfig = {
  hosts: ['cdn.example.com', '.assets.example.org'],
  allowedSchemes: ['http', 'https'],
};

// ---------------------------------------------------------------------------
// Independent oracle for IPv4 forbidden classification (Req 19.7). Mirrors the
// documented forbidden ranges so we can label generated inputs and compute the
// expected decision without calling the module under test.
// ---------------------------------------------------------------------------
function oracleForbiddenIPv4(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a >= 224) return true; // multicast/reserved/broadcast
  return false;
}

// ---------------------------------------------------------------------------
// Labeled IP pools: each carries whether it is a public (routable) address or
// an internal/unparseable one, so the expected decision is known by construction.
// ---------------------------------------------------------------------------
type IpSample = { ip: string; kind: 'public' | 'internal' | 'bad' };

const PUBLIC_IPS: IpSample[] = [
  { ip: '8.8.8.8', kind: 'public' },
  { ip: '1.1.1.1', kind: 'public' },
  { ip: '93.184.216.34', kind: 'public' },
  { ip: '151.101.1.140', kind: 'public' },
  { ip: '172.15.0.1', kind: 'public' }, // just below the 172.16/12 private block
  { ip: '172.32.0.1', kind: 'public' }, // just above the 172.16/12 private block
  { ip: '2001:4860:4860::8888', kind: 'public' },
  { ip: '2606:4700:4700::1111', kind: 'public' },
  { ip: '2a00:1450:4001::200e', kind: 'public' },
];

const INTERNAL_IPS: IpSample[] = [
  { ip: '10.0.0.1', kind: 'internal' },
  { ip: '10.255.255.255', kind: 'internal' },
  { ip: '172.16.0.1', kind: 'internal' },
  { ip: '172.31.255.255', kind: 'internal' },
  { ip: '192.168.1.1', kind: 'internal' },
  { ip: '127.0.0.1', kind: 'internal' },
  { ip: '169.254.10.20', kind: 'internal' },
  { ip: '0.0.0.0', kind: 'internal' },
  { ip: '100.64.0.1', kind: 'internal' },
  { ip: '192.0.0.1', kind: 'internal' },
  { ip: '224.0.0.1', kind: 'internal' },
  { ip: '255.255.255.255', kind: 'internal' },
  { ip: '::1', kind: 'internal' },
  { ip: '::', kind: 'internal' },
  { ip: 'fe80::1', kind: 'internal' },
  { ip: 'fc00::1', kind: 'internal' },
  { ip: 'fd12:3456::1', kind: 'internal' },
  { ip: 'ff02::1', kind: 'internal' },
  { ip: '::ffff:127.0.0.1', kind: 'internal' }, // IPv4-mapped loopback
  { ip: '::ffff:10.0.0.1', kind: 'internal' }, // IPv4-mapped private
  { ip: '64:ff9b::7f00:1', kind: 'internal' }, // NAT64 of 127.0.0.1
];

const BAD_IPS: IpSample[] = [
  { ip: 'not-an-ip', kind: 'bad' },
  { ip: '999.1.1.1', kind: 'bad' },
  { ip: '256.256.256.256', kind: 'bad' },
  { ip: '12.34', kind: 'bad' },
  { ip: '::gg::', kind: 'bad' },
  { ip: '', kind: 'bad' },
];

// ---------------------------------------------------------------------------
// Labeled host pool: whether each host is on ALLOWLIST (Req 19.6).
// ---------------------------------------------------------------------------
type HostSample = { host: string; allowlisted: boolean };

const HOSTS: HostSample[] = [
  { host: 'cdn.example.com', allowlisted: true },
  { host: 'CDN.Example.com', allowlisted: true }, // case-insensitive
  { host: 'cdn.example.com.', allowlisted: true }, // trailing FQDN dot
  { host: 'assets.example.org', allowlisted: true }, // leading-dot domain itself
  { host: 'sub.assets.example.org', allowlisted: true }, // subdomain
  { host: 'a.b.assets.example.org', allowlisted: true }, // deep subdomain
  { host: 'evil.com', allowlisted: false },
  { host: 'cdn.example.com.evil.com', allowlisted: false }, // suffix trick
  { host: 'notassets.example.org', allowlisted: false }, // bare-suffix trick
  { host: 'example.com', allowlisted: false },
  { host: 'assets.example.org.evil.net', allowlisted: false },
  { host: 'localhost', allowlisted: false },
];

// ---------------------------------------------------------------------------
// Labeled scheme pool: whether the scheme is permitted.
// ---------------------------------------------------------------------------
type SchemeSample = { scheme: string; permitted: boolean };

const SCHEMES: SchemeSample[] = [
  { scheme: 'http', permitted: true },
  { scheme: 'https', permitted: true },
  { scheme: 'ftp', permitted: false },
  { scheme: 'file', permitted: false },
  { scheme: 'gopher', permitted: false },
  { scheme: 'data', permitted: false },
];

// ---------------------------------------------------------------------------
// Property 47: SSRF guard blocks non-allowlisted and internal destinations.
// Validates: Requirements 19.6, 19.7
//
// A fetch is allowed IF AND ONLY IF:
//   - the scheme is permitted, AND
//   - the host is on the configured allowlist (Req 19.6), AND
//   - at least one address resolved and EVERY resolved address is a valid,
//     public/non-internal IP (Req 19.7).
// Any other case is rejected with `allowed: false` (no outbound request issued).
// ---------------------------------------------------------------------------
describe('Property 47: SSRF guard blocks non-allowlisted and internal destinations', () => {
  const schemeArb = fc.constantFrom(...SCHEMES);
  const hostArb = fc.constantFrom(...HOSTS);
  const ipArb = fc.constantFrom(...PUBLIC_IPS, ...INTERNAL_IPS, ...BAD_IPS);
  const ipListArb = fc.array(ipArb, { minLength: 0, maxLength: 5 });

  it('allows a fetch iff scheme+host+all-resolved-IPs are safe; rejects everything else with no request', () => {
    fc.assert(
      fc.property(schemeArb, hostArb, ipListArb, (scheme, host, ips) => {
        const url = `${scheme.scheme}://${host.host}/media/asset.mp4`;
        const decision = evaluateSsrfFetch({
          url,
          resolvedIps: ips.map((i) => i.ip),
          allowlist: ALLOWLIST,
        });

        // Expected outcome computed independently from the labeled building blocks.
        const allIpsPublic = ips.length > 0 && ips.every((i) => i.kind === 'public');
        const expectedAllowed = scheme.permitted && host.allowlisted && allIpsPublic;

        expect(decision.allowed).toBe(expectedAllowed);

        if (decision.allowed) {
          // When allowed, the guard must echo the exact resolved IPs it verified.
          expect(decision.resolvedIps).toEqual(ips.map((i) => i.ip));
        } else {
          // When rejected there is always a precise reason (the signal to the
          // caller that NO outbound request may be issued).
          expect(decision.reason).toBeTruthy();
          expect(typeof decision.message).toBe('string');
        }
      }),
      { numRuns: 500 },
    );
  });

  it('never allows a fetch when any resolved IP is internal/private, regardless of allowlist match', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HOSTS.filter((h) => h.allowlisted)),
        fc.array(fc.constantFrom(...PUBLIC_IPS), { minLength: 0, maxLength: 3 }),
        fc.constantFrom(...INTERNAL_IPS),
        fc.array(fc.constantFrom(...PUBLIC_IPS), { minLength: 0, maxLength: 3 }),
        (host, before, internal, after) => {
          const ips = [...before, internal, ...after].map((i) => i.ip);
          const decision = evaluateSsrfFetch({
            url: `https://${host.host}/x`,
            resolvedIps: ips,
            allowlist: ALLOWLIST,
          });
          expect(decision.allowed).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never allows a fetch to a non-allowlisted host, even when all IPs are public', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HOSTS.filter((h) => !h.allowlisted)),
        fc.array(fc.constantFrom(...PUBLIC_IPS), { minLength: 1, maxLength: 4 }),
        (host, ips) => {
          const decision = evaluateSsrfFetch({
            url: `https://${host.host}/x`,
            resolvedIps: ips.map((i) => i.ip),
            allowlist: ALLOWLIST,
          });
          expect(decision.allowed).toBe(false);
          if (!decision.allowed) expect(decision.reason).toBe('NOT_ALLOWLISTED');
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Supporting property: IPv4 classification matches the independent oracle.
// This exercises parseIPv4 + isForbiddenIPv4 across the full octet space,
// backing the Req 19.7 "internal address" guarantee.
// ---------------------------------------------------------------------------
describe('Property 47 (support): IPv4 classification matches the forbidden-range oracle', () => {
  it('classifyResolvedIp agrees with the oracle for arbitrary dotted-quad IPv4', () => {
    const octet = fc.integer({ min: 0, max: 255 });
    fc.assert(
      fc.property(octet, octet, octet, octet, (a, b, c, d) => {
        const ip = `${a}.${b}.${c}.${d}`;
        const expectedForbidden = oracleForbiddenIPv4(a, b, c);
        expect(parseIPv4(ip)).toEqual([a, b, c, d]);
        expect(isForbiddenIPv4([a, b, c, d])).toBe(expectedForbidden);
        expect(classifyResolvedIp(ip)).toBe(expectedForbidden ? 'forbidden' : 'ok');
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Focused unit tests for concrete examples and edge cases.
// ---------------------------------------------------------------------------
describe('SSRF guard — unit examples', () => {
  it('allows an allowlisted host resolving only to public IPs', () => {
    const decision = evaluateSsrfFetch({
      url: 'https://cdn.example.com/video.mp4',
      resolvedIps: ['8.8.8.8', '2001:4860:4860::8888'],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(true);
  });

  it('rejects an empty resolved-IP list', () => {
    const decision = evaluateSsrfFetch({
      url: 'https://cdn.example.com/video.mp4',
      resolvedIps: [],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('NO_RESOLVED_ADDRESSES');
  });

  it('rejects a DNS-rebinding case: allowlisted host resolving to loopback', () => {
    const decision = evaluateSsrfFetch({
      url: 'https://cdn.example.com/video.mp4',
      resolvedIps: ['127.0.0.1'],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('INTERNAL_ADDRESS');
  });

  it('rejects an unsupported scheme', () => {
    const decision = evaluateSsrfFetch({
      url: 'file://cdn.example.com/etc/passwd',
      resolvedIps: ['8.8.8.8'],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('UNSUPPORTED_SCHEME');
  });

  it('rejects an unparseable resolved address', () => {
    const decision = evaluateSsrfFetch({
      url: 'https://cdn.example.com/x',
      resolvedIps: ['not-an-ip'],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('UNPARSEABLE_ADDRESS');
  });

  it('rejects an invalid URL', () => {
    const decision = evaluateSsrfFetch({
      url: 'http://',
      resolvedIps: ['8.8.8.8'],
      allowlist: ALLOWLIST,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('INVALID_URL');
  });

  it('applies default schemes (http/https) when config omits allowedSchemes', () => {
    expect(DEFAULT_ALLOWED_SCHEMES).toEqual(['http', 'https']);
    const decision = evaluateSsrfFetch({
      url: 'https://cdn.example.com/x',
      resolvedIps: ['8.8.8.8'],
      allowlist: { hosts: ['cdn.example.com'] },
    });
    expect(decision.allowed).toBe(true);
  });

  it('host matching honors exact vs leading-dot rules', () => {
    expect(isHostAllowlisted('cdn.example.com', ALLOWLIST)).toBe(true);
    expect(isHostAllowlisted('sub.assets.example.org', ALLOWLIST)).toBe(true);
    expect(isHostAllowlisted('cdn.example.com.evil.com', ALLOWLIST)).toBe(false);
    expect(isHostAllowlisted('notassets.example.org', ALLOWLIST)).toBe(false);
  });

  it('parses and classifies IPv6 forms correctly', () => {
    expect(parseIPv6('::1')).toHaveLength(8);
    expect(isForbiddenIPv6(parseIPv6('::1')!)).toBe(true);
    expect(isForbiddenIPv6(parseIPv6('2001:4860:4860::8888')!)).toBe(false);
    expect(classifyResolvedIp('::ffff:10.0.0.1')).toBe('forbidden');
  });
});
