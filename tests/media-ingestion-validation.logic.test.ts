/**
 * Property + example tests for the Media_Ingestion_Service pure core (task 7.2).
 *
 * Framework: vitest + fast-check, >=100 runs per property.
 *
 * Property under test (design.md):
 *  - Property 6: Ingestion accepts exactly the supported, in-range media and
 *    persists nothing otherwise
 *      Validates: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * "For any candidate upload, ingestion accepts it (and would create a
 *  Video_Source) if and only if its ACTUAL byte signature matches a supported
 *  container (MP4, MOV, WebM, AVI, MPEG) AND its size is within 1 byte to
 *  10,240 MB inclusive; for every rejected candidate no accept payload is
 *  produced (the service persists no Video_Source / no bytes), and signature
 *  validation always precedes any persistence decision."
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateMediaIngestion,
  detectContainerSignature,
  isAcceptedSizeBytes,
  type SupportedContainer,
} from '../server/features/video-editor/services/media-ingestion-validation.logic';
import { INGESTION_LIMITS } from '../server/features/video-editor/config/video-editor.config';

const RUNS = 200;

const MIN = INGESTION_LIMITS.minSizeBytes; // 1 byte
const MAX = INGESTION_LIMITS.maxSizeBytes; // 10,240 MB

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

function ascii(marker: string): number[] {
  return Array.from(marker, (ch) => ch.charCodeAt(0));
}

function concatBytes(...parts: Array<number[] | Uint8Array>): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p instanceof Uint8Array ? p : Uint8Array.from(p), offset);
    offset += p.length;
  }
  return out;
}

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3];
const MPEG_PS_PACK = [0x00, 0x00, 0x01, 0xba];
const MPEG_VIDEO_SEQ = [0x00, 0x00, 0x01, 0xb3];
const TS_SYNC = 0x47;

// ---------------------------------------------------------------------------
// Smart generators: valid byte signatures for each supported container
// (Req 3.1, 3.2). Each is tagged with the container it must detect as.
// ---------------------------------------------------------------------------

const size4 = fc.uint8Array({ minLength: 4, maxLength: 4 });
const trailer = fc.uint8Array({ maxLength: 24 });

// A 4-byte brand that is NOT the QuickTime brand 'qt  ' (so it detects as MP4).
const nonQtBrand = fc
  .uint8Array({ minLength: 4, maxLength: 4 })
  .filter((b) => !(b[0] === 0x71 && b[1] === 0x74 && b[2] === 0x20 && b[3] === 0x20));

interface TaggedHeader {
  header: Uint8Array;
  expected: SupportedContainer;
}

const mp4Header: fc.Arbitrary<TaggedHeader> = fc
  .tuple(size4, nonQtBrand, trailer)
  .map(([sz, brand, t]) => ({
    header: concatBytes(sz, ascii('ftyp'), brand, t),
    expected: 'mp4' as const,
  }));

const movFtypHeader: fc.Arbitrary<TaggedHeader> = fc
  .tuple(size4, trailer)
  .map(([sz, t]) => ({
    header: concatBytes(sz, ascii('ftyp'), ascii('qt  '), t),
    expected: 'mov' as const,
  }));

const movAtomHeader: fc.Arbitrary<TaggedHeader> = fc
  .tuple(size4, fc.constantFrom('moov', 'mdat', 'free', 'skip', 'wide', 'pnot'), trailer)
  .map(([sz, atom, t]) => ({
    header: concatBytes(sz, ascii(atom), t),
    expected: 'mov' as const,
  }));

const webmHeader: fc.Arbitrary<TaggedHeader> = fc
  .tuple(fc.uint8Array({ maxLength: 8 }), trailer)
  .map(([filler, t]) => ({
    // EBML magic followed by a 'webm' DocType somewhere in the header window.
    header: concatBytes(EBML_HEADER, filler, ascii('webm'), t),
    expected: 'webm' as const,
  }));

const aviHeader: fc.Arbitrary<TaggedHeader> = fc
  .tuple(size4, trailer)
  .map(([sz, t]) => ({
    header: concatBytes(ascii('RIFF'), sz, ascii('AVI '), t),
    expected: 'avi' as const,
  }));

const mpegPsHeader: fc.Arbitrary<TaggedHeader> = trailer.map((t) => ({
  header: concatBytes(MPEG_PS_PACK, t),
  expected: 'mpeg' as const,
}));

const mpegSeqHeader: fc.Arbitrary<TaggedHeader> = trailer.map((t) => ({
  header: concatBytes(MPEG_VIDEO_SEQ, t),
  expected: 'mpeg' as const,
}));

// Transport-stream: 0x47 sync byte, header shorter than one packet (188 B).
const mpegTsHeader: fc.Arbitrary<TaggedHeader> = fc
  .uint8Array({ maxLength: 100 })
  .map((rest) => ({
    header: concatBytes([TS_SYNC], rest),
    expected: 'mpeg' as const,
  }));

const supportedHeader: fc.Arbitrary<TaggedHeader> = fc.oneof(
  mp4Header,
  movFtypHeader,
  movAtomHeader,
  webmHeader,
  aviHeader,
  mpegPsHeader,
  mpegSeqHeader,
  mpegTsHeader,
);

// Arbitrary bytes that are NOT a supported signature (filtered via the detector).
const unsupportedHeader: fc.Arbitrary<Uint8Array> = fc
  .uint8Array({ maxLength: 64 })
  .filter((h) => detectContainerSignature(h) === null);

// Header arbitrary mixing supported (tagged) and unsupported (null-detecting).
const anyHeader: fc.Arbitrary<Uint8Array> = fc.oneof(
  supportedHeader.map((th) => th.header),
  unsupportedHeader,
);

// Size arbitrary emphasising the boundary cases (1 B, 10,240 MB, +1) plus
// below-, in-, and above-range values (Req 3.1, 3.4).
const sizeArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.constant(MIN), // 1 byte — lower boundary (accept)
  fc.constant(MAX), // 10,240 MB — upper boundary (accept)
  fc.constant(MAX + 1), // +1 — upper boundary (reject)
  fc.integer({ min: MIN, max: MAX }),
  fc.integer({ min: -100_000, max: 0 }),
  fc.integer({ min: MAX + 1, max: MAX + 100_000 }),
);

// ---------------------------------------------------------------------------
// Property 6: Ingestion accepts exactly the supported, in-range media and
// persists nothing otherwise
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
// ---------------------------------------------------------------------------

describe('Property 6: Ingestion accepts exactly supported, in-range media (Req 3.1–3.4)', () => {
  it('accepts iff actual signature is supported AND size in [1 B, 10,240 MB]; rejects persist nothing', () => {
    fc.assert(
      fc.property(anyHeader, sizeArb, (header, sizeBytes) => {
        const result = validateMediaIngestion({ header, sizeBytes });

        const container = detectContainerSignature(header);
        const supported =
          container !== null &&
          (INGESTION_LIMITS.acceptedContainers as readonly string[]).includes(container);
        const sizeOk = sizeBytes >= MIN && sizeBytes <= MAX;
        const shouldAccept = supported && sizeOk;

        // Biconditional: accept iff supported signature AND in-range size.
        expect(result.accepted).toBe(shouldAccept);

        if (result.accepted) {
          // Accepted payload reports the actual detected container + size.
          expect(result.container).toBe(container);
          expect(result.sizeBytes).toBe(sizeBytes);
        } else {
          // Rejection carries NO accept payload — the service persists nothing
          // (no Video_Source, no bytes) (Req 3.3, 3.4).
          expect(result).not.toHaveProperty('container');
          expect(result).not.toHaveProperty('sizeBytes');
          expect(result.message.length).toBeGreaterThan(0);

          // Signature validation precedes size (Req 3.2): unsupported format
          // is reported first even when the size is also out of range.
          if (!supported) {
            expect(result.reason).toBe('UNSUPPORTED_FORMAT');
          } else if (sizeBytes < MIN) {
            expect(result.reason).toBe('EMPTY_FILE');
          } else {
            expect(result.reason).toBe('MAX_SIZE_EXCEEDED');
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('detects each supported container from its actual byte signature (Req 3.1, 3.2)', () => {
    fc.assert(
      fc.property(supportedHeader, ({ header, expected }) => {
        expect(detectContainerSignature(header)).toBe(expected);
      }),
      { numRuns: RUNS },
    );
  });

  it('the declared MIME type never overrides the actual signature (Req 3.2)', () => {
    fc.assert(
      fc.property(
        unsupportedHeader,
        fc.integer({ min: MIN, max: MAX }),
        fc.constantFrom('video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'),
        (header, sizeBytes, declaredMimeType) => {
          // A truthful-looking declared type cannot rescue garbage bytes.
          const result = validateMediaIngestion({ header, sizeBytes, declaredMimeType });
          expect(result.accepted).toBe(false);
          if (!result.accepted) {
            expect(result.reason).toBe('UNSUPPORTED_FORMAT');
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Focused boundary examples (1 B, 10,240 MB, +1) — Req 3.1, 3.4
// ---------------------------------------------------------------------------

describe('Size boundary examples (Req 3.1, 3.4)', () => {
  // A concrete, valid MP4 signature to isolate the size decision.
  const mp4Sig = concatBytes([0, 0, 0, 0x18], ascii('ftyp'), ascii('mp42'), new Uint8Array(8));

  it('isAcceptedSizeBytes is boundary-exact', () => {
    expect(isAcceptedSizeBytes(0)).toBe(false);
    expect(isAcceptedSizeBytes(1)).toBe(true); // 1 B lower boundary
    expect(isAcceptedSizeBytes(MAX)).toBe(true); // 10,240 MB upper boundary
    expect(isAcceptedSizeBytes(MAX + 1)).toBe(false); // +1 rejected
    expect(isAcceptedSizeBytes(Number.NaN)).toBe(false);
    expect(isAcceptedSizeBytes(Infinity)).toBe(false);
  });

  it('accepts a supported file at exactly 1 byte', () => {
    const r = validateMediaIngestion({ header: mp4Sig, sizeBytes: 1 });
    expect(r.accepted).toBe(true);
  });

  it('accepts a supported file at exactly 10,240 MB', () => {
    const r = validateMediaIngestion({ header: mp4Sig, sizeBytes: MAX });
    expect(r.accepted).toBe(true);
  });

  it('rejects a supported file at 10,240 MB + 1 with MAX_SIZE_EXCEEDED and no payload', () => {
    const r = validateMediaIngestion({ header: mp4Sig, sizeBytes: MAX + 1 });
    expect(r.accepted).toBe(false);
    if (!r.accepted) {
      expect(r.reason).toBe('MAX_SIZE_EXCEEDED');
    }
    expect(r).not.toHaveProperty('container');
  });

  it('rejects a supported file of 0 bytes with EMPTY_FILE', () => {
    const r = validateMediaIngestion({ header: mp4Sig, sizeBytes: 0 });
    expect(r.accepted).toBe(false);
    if (!r.accepted) {
      expect(r.reason).toBe('EMPTY_FILE');
    }
  });
});
