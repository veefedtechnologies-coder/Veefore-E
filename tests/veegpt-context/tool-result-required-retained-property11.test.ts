import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  reduceToolResult,
  type ReduceToolResultOptions,
} from '../../server/routes/veegpt-tool-result.logic';

// Feature: veegpt-context-optimization, Property 11: Reduced tool results retain all required information
// Validates: Requirements 12.2, 12.3, 12.4
//
// For any tool payload and its declared required fields (follow-up identifiers,
// reasoning-required, and execution-required fields), `reduceToolResult` output
// retains ALL required information even when the payload remains above the
// configured maximum (`retainedAboveMax`):
//   • every follow-up identifier of a RELEVANT record is retained in
//     `result.identifiers` — even for records paginated out for size (Req 12.2);
//   • reasoning-required and execution-required fields are NEVER dropped from a
//     retained record, regardless of `maxTokens` (Req 12.3 / 12.4);
//   • reasoning-required and execution-required information are treated as
//     EQUALLY essential — neither category is prioritized or dropped in favor of
//     the other (Req 12.4).

// The protected key names used across the whole property. Values on these keys
// must survive projection/pagination unconditionally.
const ID_KEY = 'id';
const REASONING_KEYS = ['why', 'rationale'] as const;
const EXECUTION_KEYS = ['actionToken', 'targetId'] as const;

/** A droppable field name (never protected) — pure filler that inflates tokens. */
const FILLER_KEYS = ['blurb', 'metadata', 'debug', 'raw'] as const;

/** A chunk of filler text big enough that a few records exceed a small budget. */
const fillerArb = fc.string({ minLength: 20, maxLength: 120 });

/** Non-empty distinct values so a dropped field is detectable. */
const valueArb = fc.string({ minLength: 1, maxLength: 24 });

/**
 * Build an array of records with UNIQUE identifiers (assigned by index) so a
 * retained record can be matched back to its original by `id`. Each record
 * carries reasoning-required, execution-required, and droppable filler fields.
 */
const recordsArb = fc
  .array(
    fc.record({
      why: valueArb,
      rationale: valueArb,
      actionToken: valueArb,
      targetId: valueArb,
      blurb: fillerArb,
      metadata: fillerArb,
      debug: fillerArb,
      raw: fillerArb,
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((rows) =>
    rows.map((row, i) => ({ [ID_KEY]: `rec-${i}`, ...row })),
  );

/** A small (often sub-payload) token ceiling to force reduction / retain-above-max. */
const maxTokensArb = fc.integer({ min: 1, max: 15 });

/** Which required-field / protected-key hints the caller declares this run. */
const optionsArb = (relevantEvery?: number): fc.Arbitrary<ReduceToolResultOptions> =>
  fc.record({
    followUpIdentifierKeys: fc.constant<string[]>([ID_KEY]),
    reasoningRequiredKeys: fc.constant<string[]>([...REASONING_KEYS]),
    executionRequiredKeys: fc.constant<string[]>([...EXECUTION_KEYS]),
    paginate: fc.boolean(),
    ...(relevantEvery
      ? {
          isRelevant: fc.constant((_r: unknown, i: number) => i % relevantEvery !== 0),
        }
      : {}),
  }) as fc.Arbitrary<ReduceToolResultOptions>;

/** All keys that must never be dropped from a retained record. */
const PROTECTED = [ID_KEY, ...REASONING_KEYS, ...EXECUTION_KEYS];

type Row = Record<string, unknown>;

/** Assert a retained record kept every protected value from its original. */
function assertRetainedRecord(retained: Row, original: Row): void {
  for (const key of PROTECTED) {
    expect(retained[key]).toBe(original[key]);
  }
}

describe('Property 11: reduced tool results retain all required information (R12.2, R12.3, R12.4)', () => {
  it('retains reasoning- and execution-required fields on every kept record, even above max', () => {
    fc.assert(
      fc.property(recordsArb, maxTokensArb, optionsArb(), (records, maxTokens, options) => {
        const result = reduceToolResult(records, /* requiredFields */ [], maxTokens, options);

        // The reduced payload is still a dataset (array).
        expect(Array.isArray(result.payload)).toBe(true);
        const reduced = result.payload as Row[];

        // Index originals by their unique id for matching.
        const byId = new Map(records.map((r) => [r[ID_KEY], r]));

        // Every RETAINED record keeps all reasoning/execution/identifier fields —
        // regardless of whether we ended up above the configured maximum.
        for (const rec of reduced) {
          const original = byId.get(rec[ID_KEY]) as Row | undefined;
          expect(original).toBeDefined();
          assertRetainedRecord(rec, original as Row);
        }

        // Follow-up identifiers of ALL records are retained (kept + paginated out).
        for (const original of records) {
          expect(result.identifiers).toContain(String(original[ID_KEY]));
        }

        // Correctness > tokens: at least one record always survives.
        expect(reduced.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  it('retains follow-up identifiers of relevant records even when records are filtered out', () => {
    fc.assert(
      fc.property(recordsArb, maxTokensArb, optionsArb(3), (records, maxTokens, options) => {
        const isRelevant = options.isRelevant!;
        const result = reduceToolResult(records, [], maxTokens, options);

        // Identifiers of every RELEVANT record must be present.
        records.forEach((original, i) => {
          if (isRelevant(original, i)) {
            expect(result.identifiers).toContain(String(original[ID_KEY]));
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('treats reasoning-required and execution-required info as equally essential (both retained)', () => {
    fc.assert(
      fc.property(recordsArb, maxTokensArb, (records, maxTokens) => {
        // Declare BOTH categories; neither may be prioritized or dropped for the
        // other, even when the payload stays above the maximum.
        const result = reduceToolResult(records, [], maxTokens, {
          followUpIdentifierKeys: [ID_KEY],
          reasoningRequiredKeys: [...REASONING_KEYS],
          executionRequiredKeys: [...EXECUTION_KEYS],
          paginate: true,
        });

        const reduced = result.payload as Row[];
        const byId = new Map(records.map((r) => [r[ID_KEY], r]));

        for (const rec of reduced) {
          const original = byId.get(rec[ID_KEY]) as Row;
          // Reasoning-required fields survived.
          for (const key of REASONING_KEYS) expect(rec[key]).toBe(original[key]);
          // Execution-required fields survived — equally, in the same record.
          for (const key of EXECUTION_KEYS) expect(rec[key]).toBe(original[key]);
        }

        // When we could not get within budget on required-only data, that is
        // surfaced as retainedAboveMax — and the fields above still survived.
        if (result.retainedAboveMax) {
          expect(result.tokensAfter).toBeGreaterThan(maxTokens);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('retains all required fields on a single over-budget object record', () => {
    fc.assert(
      fc.property(
        fc.record({
          why: valueArb,
          rationale: valueArb,
          actionToken: valueArb,
          targetId: valueArb,
          blurb: fc.string({ minLength: 60, maxLength: 200 }),
          debug: fc.string({ minLength: 60, maxLength: 200 }),
        }),
        maxTokensArb,
        (obj, maxTokens) => {
          const record = { [ID_KEY]: 'single-1', ...obj };
          const result = reduceToolResult(record, [], maxTokens, {
            followUpIdentifierKeys: [ID_KEY],
            reasoningRequiredKeys: [...REASONING_KEYS],
            executionRequiredKeys: [...EXECUTION_KEYS],
          });

          const out = result.payload as Row;
          // Identifier retained.
          expect(result.identifiers).toContain('single-1');
          // Every protected field retained, even if still above the maximum.
          assertRetainedRecord(out, record);
        },
      ),
      { numRuns: 200 },
    );
  });
});
