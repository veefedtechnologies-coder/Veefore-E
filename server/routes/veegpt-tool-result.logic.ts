/**
 * Pure (DB-free, LLM-free) tool-result reduction for VeeGPT (Requirement 12).
 *
 * When a tool returns a large payload that is about to re-enter the NEXT model
 * request (e.g. a grounded-synthesis pass, or a payload persisted into
 * conversation history), that payload can inflate input tokens on every
 * subsequent turn. `reduceToolResult` shrinks the payload BEFORE it re-enters —
 * but only ever by dropping information that is provably safe to drop.
 *
 * Design contract (design.md §"Tool-Result Optimization", Req 12.1–12.4):
 *   1. REDUCE TO REQUIRED FIELDS (Req 12.1) — project each record down to the
 *      caller-declared `requiredFields` (plus the always-protected identifier /
 *      reasoning / execution keys), dropping every other (duplicated / irrelevant)
 *      field.
 *   2. FILTER IRRELEVANT RECORDS (Req 12.1) — when the caller supplies an
 *      `isRelevant` predicate, records that are not relevant to the current
 *      request are removed.
 *   3. PAGINATE / SUMMARIZE DATASETS (Req 12.1) — if a dataset is still over the
 *      configured `maxTokens` after projection, trailing records are paginated
 *      out to fit, while their follow-up identifiers are still retained.
 *   4. ALWAYS RETAIN FOLLOW-UP IDENTIFIERS (Req 12.2) — the identifiers required
 *      to act on the result later (e.g. a post `id`) are collected for EVERY
 *      relevant record and returned in `identifiers`, even for records that were
 *      paginated out, so a follow-up action never loses its handle.
 *   5. NEVER REMOVE REASONING- OR EXECUTION-REQUIRED INFO (Req 12.3 / 12.4) —
 *      fields the caller marks as reasoning-required or execution-required are
 *      protected and are NEVER projected away. The two are treated as EQUALLY
 *      essential: when both are required, both are retained rather than
 *      prioritizing one over the other. If the payload is still above `maxTokens`
 *      once only protected/required information remains, it is RETAINED AS-IS
 *      (`retainedAboveMax = true`) — correctness wins over the token budget.
 *
 * FAIL-SAFE: the function never throws. Any internal error returns the original
 * payload unchanged (`reduced = false`), because dropping information on error
 * would be the exact regression this refactor forbids.
 *
 * The function is deterministic and pure so it can be unit- and property-tested
 * in isolation without a DB or a model call (Property 11, task 8.7).
 */

import { estimateTokens } from '../services/aiUsageTracker';

/** Options that tell the reducer what is safe to drop and what must be kept. */
export interface ReduceToolResultOptions {
  /**
   * Keys that identify the record for follow-up actions (e.g. `['id']`). These
   * are ALWAYS protected from projection and their values are collected into the
   * result's `identifiers` for every relevant record (Req 12.2).
   */
  followUpIdentifierKeys?: string[];
  /**
   * Keys whose values are required for accurate reasoning about the result.
   * Never projected away (Req 12.3 / 12.4).
   */
  reasoningRequiredKeys?: string[];
  /**
   * Keys whose values are required for a subsequent tool execution on the
   * result. Never projected away and treated as EQUALLY essential to the
   * reasoning-required keys (Req 12.4).
   */
  executionRequiredKeys?: string[];
  /**
   * Predicate deciding whether a dataset record is relevant to the current
   * request. Irrelevant records are filtered out (Req 12.1). When omitted, every
   * record is treated as relevant.
   */
  isRelevant?: (record: unknown, index: number) => boolean;
  /**
   * Whether an over-budget dataset may be paginated (trailing records dropped)
   * after projection. Defaults to `true`. Identifiers of paginated-out records
   * are still retained (Req 12.2).
   */
  paginate?: boolean;
  /** Token estimator. Defaults to the shared `estimateTokens` heuristic. */
  estimate?: (text: string) => number;
}

/** The outcome of a reduction. */
export interface ReduceToolResultResult {
  /** The reduced payload (same kind — array/object/string — as the input). */
  payload: unknown;
  /**
   * Every follow-up identifier retained for the result, including those of
   * records paginated out for size (Req 12.2).
   */
  identifiers: string[];
  /** True when any reduction (projection / filter / pagination) was applied. */
  reduced: boolean;
  /**
   * True when only protected/required information remained and the payload is
   * still above `maxTokens` — it was retained anyway (Req 12.4).
   */
  retainedAboveMax: boolean;
  /** Estimated tokens of the payload before reduction. */
  tokensBefore: number;
  /** Estimated tokens of the payload after reduction. */
  tokensAfter: number;
  /** Number of records paginated out for size. */
  omittedRecordCount: number;
}

/** Serialize a payload to the text form whose tokens we bound. */
function serialize(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload) ?? '';
  } catch {
    return String(payload);
  }
}

/** A plain (non-array, non-null) object — i.e. a record we can project. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Build the de-duplicated set of keys that projection must never drop. */
function protectedKeySet(
  requiredFields: string[],
  opts: ReduceToolResultOptions,
): Set<string> {
  return new Set<string>([
    ...(requiredFields ?? []),
    ...(opts.followUpIdentifierKeys ?? []),
    ...(opts.reasoningRequiredKeys ?? []),
    ...(opts.executionRequiredKeys ?? []),
  ]);
}

/** Project a record down to only the protected keys that carry a value. */
function projectRecord(
  record: Record<string, unknown>,
  keep: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    const v = record[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Collect the follow-up identifier values present on a record. */
function identifiersOf(record: unknown, idKeys: string[]): string[] {
  if (!idKeys.length || !isRecord(record)) return [];
  const ids: string[] = [];
  for (const key of idKeys) {
    const v = record[key];
    if (v !== undefined && v !== null) ids.push(String(v));
  }
  return ids;
}

/**
 * Reduce a tool-result payload so it fits within `maxTokens` when it re-enters
 * the next model request, without ever dropping required information.
 *
 * @param payload        The raw tool result (array of records, single object, or string).
 * @param requiredFields The fields to keep on each record (Req 12.1). Protected from projection.
 * @param maxTokens      The configured token ceiling (`toolResultMaxTokens`).
 * @param options        Identifier / reasoning / execution key hints + relevance filter.
 */
export function reduceToolResult(
  payload: unknown,
  requiredFields: string[] = [],
  maxTokens: number,
  options: ReduceToolResultOptions = {},
): ReduceToolResultResult {
  const estimate = options.estimate ?? estimateTokens;

  // The untouched-payload result, returned whenever reduction is a no-op or any
  // error occurs. `tokensBefore`/`tokensAfter` are filled in once we can safely
  // estimate; if even estimation throws we fall back to 0 rather than propagate.
  const base: ReduceToolResultResult = {
    payload,
    identifiers: [],
    reduced: false,
    retainedAboveMax: false,
    tokensBefore: 0,
    tokensAfter: 0,
    omittedRecordCount: 0,
  };

  try {
    const tokensBefore = estimate(serialize(payload));
    base.tokensBefore = tokensBefore;
    base.tokensAfter = tokensBefore;

    const idKeys = options.followUpIdentifierKeys ?? [];
    const limit = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : Infinity;

    // ── DATASET (array of records) ────────────────────────────────────────
    if (Array.isArray(payload)) {
      // Identifiers of EVERY record are collected up-front so pagination can
      // never lose a follow-up handle (Req 12.2).
      const allIdentifiers = payload.flatMap((r) => identifiersOf(r, idKeys));

      // Already within budget: nothing to do, but still surface identifiers.
      if (tokensBefore <= limit) {
        return { ...base, identifiers: dedupe(allIdentifiers) };
      }

      // (2) FILTER IRRELEVANT RECORDS (Req 12.1).
      let records: unknown[] = payload;
      let filtered = false;
      if (typeof options.isRelevant === 'function') {
        const kept = payload.filter((r, i) => {
          try {
            return options.isRelevant!(r, i);
          } catch {
            return true; // fail open: keep the record
          }
        });
        filtered = kept.length !== payload.length;
        records = kept;
      }

      // Identifiers of the RELEVANT records are what a follow-up may still need.
      const relevantIdentifiers = dedupe(
        records.flatMap((r) => identifiersOf(r, idKeys)),
      );

      // (1) REDUCE TO REQUIRED FIELDS (Req 12.1). Only when we actually know the
      // required fields — projecting to an empty key set would erase everything,
      // which would violate Req 12.4, so we skip projection in that case.
      const keep = protectedKeySet(requiredFields, options);
      let projected = false;
      let working: unknown[] = records;
      if (keep.size > 0) {
        working = records.map((r) => (isRecord(r) ? projectRecord(r, keep) : r));
        projected = serialize(working) !== serialize(records);
      }

      // (3) PAGINATE / SUMMARIZE (Req 12.1). Drop trailing records until within
      // budget, but never below a single record (some data must remain).
      let omitted = 0;
      const paginate = options.paginate !== false;
      if (paginate) {
        while (working.length > 1 && estimate(serialize(working)) > limit) {
          working.pop();
          omitted += 1;
        }
      }

      const tokensAfter = estimate(serialize(working));
      const reduced = filtered || projected || omitted > 0;

      return {
        payload: working,
        // Retain identifiers for ALL relevant records (kept + paginated out).
        identifiers: relevantIdentifiers,
        reduced,
        // (5) If only required info remains and we're still over budget, keep it.
        retainedAboveMax: tokensAfter > limit,
        tokensBefore,
        tokensAfter,
        omittedRecordCount: omitted,
      };
    }

    // ── SINGLE RECORD (object) ────────────────────────────────────────────
    if (isRecord(payload)) {
      const identifiers = dedupe(identifiersOf(payload, idKeys));
      if (tokensBefore <= limit) {
        return { ...base, identifiers };
      }
      // Project to required fields only when we know them; otherwise retain
      // (dropping unknown fields could remove reasoning-required info).
      const keep = protectedKeySet(requiredFields, options);
      if (keep.size === 0) {
        return { ...base, identifiers, retainedAboveMax: true };
      }
      const projectedRecord = projectRecord(payload, keep);
      const tokensAfter = estimate(serialize(projectedRecord));
      const reduced = serialize(projectedRecord) !== serialize(payload);
      return {
        payload: projectedRecord,
        identifiers,
        reduced,
        retainedAboveMax: tokensAfter > limit, // required info kept even if over (Req 12.4)
        tokensBefore,
        tokensAfter,
        omittedRecordCount: 0,
      };
    }

    // ── OPAQUE STRING / SCALAR ────────────────────────────────────────────
    // We cannot structurally identify what is safe to drop from opaque text, so
    // the entire payload is treated as reasoning-required and retained as-is
    // (Req 12.4). Correctness wins over the token budget.
    return { ...base, retainedAboveMax: tokensBefore > limit };
  } catch {
    // FAIL-SAFE: on any error keep the original payload untouched.
    return base;
  }
}

/** Stable de-duplication preserving first-seen order. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
