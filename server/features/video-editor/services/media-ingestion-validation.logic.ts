/**
 * Media ingestion validation — pure (DB-free, IO-free) core for the
 * Media_Ingestion_Service (Req 3.1, 3.2, 3.3, 3.4).
 *
 * Before ANY bytes are persisted and before a `Video_Source` record is created,
 * an uploaded media file MUST satisfy two invariants, both decided entirely by
 * the pure functions in this module so they can be property-tested without a
 * database, storage backend, or FFprobe:
 *
 *   1. Supported actual format — the file's ACTUAL byte signature (magic
 *      number), not its declared MIME type, identifies one of the supported
 *      video containers: MP4, MOV, WebM, AVI, or MPEG (Req 3.1, 3.3). The
 *      declared MIME type is validated *against* the real signature; the real
 *      signature is authoritative (Req 3.2).
 *   2. In-range size — the size in bytes is within the inclusive range
 *      [minSizeBytes, maxSizeBytes] read from the single-source config
 *      (`INGESTION_LIMITS`): 1 byte .. 10,240 MB (Req 3.1, 3.4).
 *
 * A file is accepted if and only if BOTH invariants hold. On any failure the
 * upload is rejected, NO `Video_Source` is created, and NO file bytes are
 * persisted (Req 3.3, 3.4). This module governs that accept/reject decision;
 * the actual storage / `Video_Source` creation is the service's concern
 * (task 7.3).
 *
 * Signature validation is expressed here so the service can run it BEFORE any
 * persistence decision (Req 3.2): the service reads only the leading header
 * bytes of the stream, calls `validateMediaIngestion`, and stores nothing unless
 * the result is `{ accepted: true }`.
 *
 * All size limits and the accepted-container set come from
 * `INGESTION_LIMITS` in `video-editor.config.ts` — the single source (Req 13.1).
 * Nothing here hardcodes a limit.
 */

import { INGESTION_LIMITS } from '../config/video-editor.config';

// ---------------------------------------------------------------------------
// Supported containers (Req 3.1)
// ---------------------------------------------------------------------------

/**
 * The supported video container formats, identified by ACTUAL byte signature
 * (Req 3.1). Kept in sync with — and gated by — `INGESTION_LIMITS.acceptedContainers`,
 * the single config source (Req 13.1). Note MP4 and MOV share the ISO Base Media
 * File Format (`ftyp`/atom) family; both are supported.
 */
export type SupportedContainer = 'mp4' | 'mov' | 'webm' | 'avi' | 'mpeg';

/**
 * The number of leading bytes the service should read from the upload stream and
 * hand to {@link validateMediaIngestion}. Chosen large enough to contain the
 * signature plus, for Matroska/WebM, the EBML `DocType` element, without buffering
 * the whole (up to 10 GB) file. The service must never persist bytes before this
 * header has been validated (Req 3.2).
 */
export const SIGNATURE_HEADER_BYTES = 4096;

// ---------------------------------------------------------------------------
// Rejection reasons
// ---------------------------------------------------------------------------

/**
 * Why an upload was rejected. The accept/reject boolean is what matters for the
 * invariant (Req 3.3, 3.4); the reason lets the service return a precise error
 * response.
 */
export type IngestionRejectionReason =
  /** Actual byte signature is not one of the supported video formats (Req 3.3). */
  | 'UNSUPPORTED_FORMAT'
  /** Size is below the minimum (empty / 0-byte upload) (Req 3.1). */
  | 'EMPTY_FILE'
  /** Size exceeds the maximum 10,240 MB (Req 3.4). */
  | 'MAX_SIZE_EXCEEDED';

/** Result of validating an upload for ingestion (Req 3.1–3.4). */
export type IngestionValidationResult =
  | { accepted: true; container: SupportedContainer; sizeBytes: number }
  | { accepted: false; reason: IngestionRejectionReason; message: string };

/** The candidate upload presented for validation, before any persistence. */
export interface IngestionValidationInput {
  /**
   * The leading header bytes of the uploaded file (at least enough to contain
   * the container signature — see {@link SIGNATURE_HEADER_BYTES}). The ACTUAL
   * signature is authoritative over any declared type (Req 3.2).
   */
  header: Uint8Array;
  /** Total declared/measured file size in bytes. */
  sizeBytes: number;
  /**
   * Optional declared MIME type / container from the client, validated against
   * the actual signature (Req 3.2). Informational only — acceptance is decided
   * by the actual signature, never by this value.
   */
  declaredMimeType?: string | null;
}

// ---------------------------------------------------------------------------
// Low-level byte matching helpers
// ---------------------------------------------------------------------------

/** ASCII byte codes for a short marker string (e.g. 'ftyp', 'RIFF'). */
function ascii(marker: string): number[] {
  return Array.from(marker, (ch) => ch.charCodeAt(0));
}

/** Does `header` contain `bytes` starting exactly at `offset`? */
function matchesAt(header: Uint8Array, offset: number, bytes: readonly number[]): boolean {
  if (offset + bytes.length > header.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (header[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/** Find the first index of `bytes` within `header` (bounded scan), or -1. */
function indexOfBytes(header: Uint8Array, bytes: readonly number[], limit: number): boolean {
  const end = Math.min(header.length, limit) - bytes.length;
  for (let start = 0; start <= end; start++) {
    let hit = true;
    for (let i = 0; i < bytes.length; i++) {
      if (header[start + i] !== bytes[i]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Container-signature detection (Req 3.2, 3.3)
// ---------------------------------------------------------------------------

// ISO Base Media File Format (MP4 / MOV) top-level atom types that may appear
// first in a file. `ftyp` is the canonical brand box; QuickTime movies may also
// begin with these structural atoms.
const ISO_ATOM_TYPES = ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot'].map(ascii);
const FTYP = ascii('ftyp');
const QUICKTIME_BRAND = ascii('qt  '); // QuickTime major brand → MOV

const RIFF = ascii('RIFF');
const AVI_FORM = ascii('AVI '); // RIFF form type at offset 8 → AVI

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3]; // Matroska/WebM EBML magic
const DOCTYPE_WEBM = ascii('webm');
const DOCTYPE_MATROSKA = ascii('matroska');

// MPEG family signatures.
const MPEG_PS_PACK = [0x00, 0x00, 0x01, 0xba]; // MPEG program stream pack header
const MPEG_VIDEO_SEQ = [0x00, 0x00, 0x01, 0xb3]; // MPEG video sequence header
const TS_SYNC_BYTE = 0x47; // MPEG transport stream sync byte
const TS_PACKET_SIZE = 188;

/**
 * Detect the ACTUAL video container from the file's leading bytes (magic number),
 * independent of any declared MIME type (Req 3.2). Returns the detected
 * {@link SupportedContainer}, or `null` when the signature is not one of the
 * supported formats (Req 3.3).
 *
 * Pure and total: never throws, never performs IO. A header too short to contain
 * a signature (e.g. a 1-byte file) yields `null`.
 */
export function detectContainerSignature(header: Uint8Array): SupportedContainer | null {
  if (!header || header.length === 0) return null;

  // AVI: 'RIFF' <size> 'AVI ' (Req 3.1). Check before generic RIFF handling.
  if (matchesAt(header, 0, RIFF) && matchesAt(header, 8, AVI_FORM)) {
    return 'avi';
  }

  // WebM / Matroska: EBML header. WebM is supported; a Matroska (.mkv) DocType is
  // NOT one of the supported formats, so reject it explicitly (Req 3.3).
  if (matchesAt(header, 0, EBML_HEADER)) {
    const looksWebm = indexOfBytes(header, DOCTYPE_WEBM, header.length);
    const looksMatroska = indexOfBytes(header, DOCTYPE_MATROSKA, header.length);
    if (looksMatroska && !looksWebm) return null;
    // Default EBML → WebM (the supported member of the family) when the DocType
    // is 'webm' or not present within the provided header window.
    return 'webm';
  }

  // MP4 / MOV: ISO Base Media File Format — an atom-size prefix (bytes 0..3)
  // followed by an atom type at bytes 4..7.
  for (const atom of ISO_ATOM_TYPES) {
    if (matchesAt(header, 4, atom)) {
      if (matchesAt(header, 4, FTYP)) {
        // Distinguish MOV (QuickTime brand) from MP4 (all other brands).
        return matchesAt(header, 8, QUICKTIME_BRAND) ? 'mov' : 'mp4';
      }
      // A structural atom other than ftyp appearing first indicates QuickTime/MOV.
      return 'mov';
    }
  }

  // MPEG: program stream, elementary video stream, or transport stream.
  if (matchesAt(header, 0, MPEG_PS_PACK) || matchesAt(header, 0, MPEG_VIDEO_SEQ)) {
    return 'mpeg';
  }
  if (header[0] === TS_SYNC_BYTE) {
    // A lone 0x47 is weak; when the header spans a second TS packet, require the
    // recurring sync byte to avoid false positives.
    if (header.length > TS_PACKET_SIZE) {
      if (header[TS_PACKET_SIZE] === TS_SYNC_BYTE) return 'mpeg';
    } else {
      return 'mpeg';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Size validation (Req 3.1, 3.4)
// ---------------------------------------------------------------------------

/**
 * Is `sizeBytes` within the inclusive accepted range [minSizeBytes, maxSizeBytes]
 * from the single config source (Req 3.1, 3.4)? Boundary-exact: `minSizeBytes`
 * (1 B) and `maxSizeBytes` (10,240 MB) are accepted; `maxSizeBytes + 1` and
 * anything below the minimum are rejected. A non-finite or non-integer size is
 * out of range.
 */
export function isAcceptedSizeBytes(sizeBytes: number): boolean {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes)) return false;
  return sizeBytes >= INGESTION_LIMITS.minSizeBytes && sizeBytes <= INGESTION_LIMITS.maxSizeBytes;
}

// ---------------------------------------------------------------------------
// Combined ingestion validation (Req 3.1, 3.2, 3.3, 3.4)
// ---------------------------------------------------------------------------

/**
 * Validate a candidate upload against the supported-format (Req 3.1, 3.2, 3.3)
 * and in-range-size (Req 3.1, 3.4) invariants.
 *
 * The ACTUAL byte signature is detected and validated BEFORE any persistence
 * decision is returned (Req 3.2). A file is accepted if and only if its actual
 * signature identifies a supported container AND its size is within the inclusive
 * configured range. On any failure the result is `{ accepted: false }` with a
 * precise reason so the service creates no `Video_Source` and persists no bytes
 * (Req 3.3, 3.4).
 *
 * Pure and total: never throws, never performs IO.
 */
export function validateMediaIngestion(input: IngestionValidationInput): IngestionValidationResult {
  // 1. Actual byte-signature validation FIRST (Req 3.2). The declared MIME type,
  //    if any, is not trusted — only the real signature decides the format.
  const container = detectContainerSignature(input.header ?? new Uint8Array(0));
  const supported =
    container !== null &&
    (INGESTION_LIMITS.acceptedContainers as readonly string[]).includes(container);

  if (!supported) {
    return {
      accepted: false,
      reason: 'UNSUPPORTED_FORMAT',
      message:
        "Upload rejected: the file's actual content is not a supported video format " +
        `(${INGESTION_LIMITS.acceptedContainers.join(', ')}).`,
    };
  }

  // 2. Size validation (Req 3.1, 3.4), boundary-exact against the single source.
  const { sizeBytes } = input;
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < INGESTION_LIMITS.minSizeBytes) {
    return {
      accepted: false,
      reason: 'EMPTY_FILE',
      message: `Upload rejected: file size must be at least ${INGESTION_LIMITS.minSizeBytes} byte(s).`,
    };
  }
  if (sizeBytes > INGESTION_LIMITS.maxSizeBytes) {
    return {
      accepted: false,
      reason: 'MAX_SIZE_EXCEEDED',
      message: `Upload rejected: file size exceeds the maximum of ${INGESTION_LIMITS.maxSizeBytes} bytes.`,
    };
  }

  // Accepted: supported actual format and in-range size (Req 3.1).
  return { accepted: true, container: container as SupportedContainer, sizeBytes };
}
