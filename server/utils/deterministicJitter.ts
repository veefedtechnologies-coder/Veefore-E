/**
 * Deterministic Jitter and Load Spreading
 *
 * Pure, stateless utilities that compute a stable per-job first-fire offset so
 * recurring poll jobs do not all fire simultaneously (thundering herd). The
 * offset is derived solely from a stable string hash of `accountId|jobType`,
 * so it is identical across process restarts and across different worker
 * instances without reading any persisted offset state.
 *
 * Cryptographic strength is NOT required — the only goals are determinism and
 * an even spread across the jitter window.
 *
 * Requirements covered:
 * - 7.1: first-fire delay is a pure function of accountId + jobType
 * - 7.2: offset ∈ [0, spreadFraction × baseIntervalMs]
 * - 7.3: stable across restarts / worker instances, no persisted state
 * - 7.6: baseIntervalMs ≤ 0 (missing/zero/negative) ⇒ offset of 0
 */

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
/** FNV-1a 32-bit prime. */
const FNV_PRIME = 0x01000193;
/** 2^32, used to normalize the 32-bit hash into the [0, 1) range. */
const UINT32_RANGE = 0x100000000;

/**
 * Compute a stable, non-cryptographic 32-bit hash of a string using FNV-1a.
 *
 * The result is deterministic for a given input across processes, restarts,
 * and machines (it depends only on the input characters), and is returned as
 * an unsigned 32-bit integer in the range [0, 2^32 - 1].
 *
 * @param input - The string to hash.
 * @returns An unsigned 32-bit integer hash.
 *
 * @example
 * stableHash("account-123|story_insights") // => deterministic uint32
 */
export function stableHash(input: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < input.length; i++) {
    // XOR the low byte of the current char code, then multiply by the prime.
    hash ^= input.charCodeAt(i) & 0xff;
    // Multiply in 32-bit space. `Math.imul` keeps the multiplication within
    // 32-bit integer semantics, matching FNV-1a's defined behavior.
    hash = Math.imul(hash, FNV_PRIME);
  }

  // Coerce to an unsigned 32-bit integer.
  return hash >>> 0;
}

/**
 * Compute the deterministic first-fire jitter offset (in milliseconds) for a
 * recurring poll job.
 *
 * The offset is a pure function of `accountId` and `jobType`: identical inputs
 * always yield an identical offset, with no persisted state, so it is stable
 * across restarts and across worker instances (Req 7.1, 7.3).
 *
 * The returned value lies within `[0, spreadFraction × baseIntervalMs]`
 * (Req 7.2). When `baseIntervalMs` is missing, zero, or negative the offset is
 * `0` (Req 7.6). A non-positive `spreadFraction` likewise yields `0`.
 *
 * Note: `spreadFraction` is expected to already be clamped to its valid range
 * ([0.10, 0.25]) by config validation; this function does not re-clamp it but
 * does guard against non-positive values.
 *
 * @param accountId - The connected account identifier.
 * @param jobType - The recurring job type (e.g. "story_insights", "new_post_detection").
 * @param baseIntervalMs - The job's base polling interval in milliseconds.
 * @param spreadFraction - The jitter spread as a fraction of the base interval.
 * @returns A deterministic offset in milliseconds within [0, spreadFraction × baseIntervalMs].
 *
 * @example
 * computeJitterOffset("acct-1", "views", 3_600_000, 0.25) // => stable value in [0, 900000]
 */
export function computeJitterOffset(
  accountId: string,
  jobType: string,
  baseIntervalMs: number,
  spreadFraction: number
): number {
  // Req 7.6: missing/zero/negative base interval ⇒ no offset.
  if (!Number.isFinite(baseIntervalMs) || baseIntervalMs <= 0) {
    return 0;
  }

  // Guard against a non-positive or non-finite spread fraction ⇒ no offset.
  if (!Number.isFinite(spreadFraction) || spreadFraction <= 0) {
    return 0;
  }

  // The maximum offset is the full jitter window (Req 7.2).
  const maxOffsetMs = spreadFraction * baseIntervalMs;

  // Normalize the stable hash into [0, 1), then scale across the window.
  const hash = stableHash(`${accountId}|${jobType}`);
  const normalized = hash / UINT32_RANGE; // [0, 1)

  const offset = Math.floor(normalized * maxOffsetMs);

  // Defensive clamp so the offset never exceeds the window due to rounding.
  return Math.min(offset, Math.floor(maxOffsetMs));
}
