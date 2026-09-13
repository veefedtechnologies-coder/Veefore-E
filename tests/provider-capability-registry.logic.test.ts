/**
 * Property tests for the Provider_Capability_Registry pure core (task 2.2).
 *
 * Framework: vitest + fast-check, >=100 runs per property.
 *
 * Properties under test (design.md):
 *  - Property 18: Capability records missing any required field are rejected
 *      Validates: Requirements 7.2
 *  - Property 19: Unknown provider/model yields an explicit unsupported result
 *      Validates: Requirements 7.4
 *  - Property 20: Capability versioning is append-only
 *      Validates: Requirements 7.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createRegistryState,
  register,
  lookup,
  versionsOf,
  findMissingRequiredField,
  type VideoModelCapabilities,
  type DurationBounds,
} from '../server/features/video-editor/services/provider-capability-registry.logic';

const RUNS = 200;

// ---------------------------------------------------------------------------
// Smart generators constrained to the capability input space
// ---------------------------------------------------------------------------

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim().length > 0);

const nonEmptyStringArray = fc.array(nonEmptyString, { minLength: 1, maxLength: 5 });

/** Bounds with 0 <= min <= max, as required by the validator. */
const durationBounds: fc.Arbitrary<DurationBounds> = fc
  .tuple(
    fc.double({ min: 0, max: 1000, noNaN: true }),
    fc.double({ min: 0, max: 1000, noNaN: true }),
  )
  .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) }));

/** A fully valid VideoModelCapabilities record. */
const validRecord: fc.Arbitrary<VideoModelCapabilities> = fc.record({
  provider: nonEmptyString,
  model: nonEmptyString,
  version: nonEmptyString,
  supportedOperations: nonEmptyStringArray,
  editableInputSeconds: durationBounds,
  outputSeconds: durationBounds,
  outputResolutions: nonEmptyStringArray,
  inputModalities: nonEmptyStringArray,
  outputModalities: nonEmptyStringArray,
  priorityRank: fc.integer({ min: 0, max: 100 }),
  costPerOutputSecondInr: fc.double({ min: 0, max: 100, noNaN: true }),
  guaranteesPreservation: fc.array(nonEmptyString, { maxLength: 4 }),
});

/** The set of required fields whose absence must trigger rejection (Req 7.2). */
const REQUIRED_FIELDS = [
  'provider',
  'model',
  'version',
  'supportedOperations',
  'editableInputSeconds',
  'outputSeconds',
  'outputResolutions',
  'inputModalities',
  'outputModalities',
] as const;

// ---------------------------------------------------------------------------
// Property 18: Capability records missing any required field are rejected
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------

describe('Property 18: Capability records missing any required field are rejected', () => {
  it('rejects a record missing exactly one required field, names the field, and stores nothing', () => {
    fc.assert(
      fc.property(
        validRecord,
        fc.constantFrom(...REQUIRED_FIELDS),
        (rec, fieldToDrop) => {
          // Remove exactly one required field from an otherwise valid record.
          const broken = { ...rec } as Partial<VideoModelCapabilities>;
          delete broken[fieldToDrop];

          const state = createRegistryState();
          const result = register(state, broken as VideoModelCapabilities);

          // Rejected...
          expect(result.ok).toBe(false);
          if (result.ok) return;
          // ...with an error naming the missing field...
          expect(result.error.code).toBe('MISSING_FIELD');
          expect(result.error.field).toBe(fieldToDrop);
          // ...and stores nothing (original state is untouched; no new state returned).
          expect(state.records).toHaveLength(0);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('stores a record if and only if it contains all required fields', () => {
    fc.assert(
      fc.property(validRecord, (rec) => {
        // A complete record has no missing field and is accepted & stored.
        expect(findMissingRequiredField(rec)).toBeNull();
        const state = createRegistryState();
        const result = register(state, rec);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.records).toHaveLength(1);
        expect(lookup(result.state, rec.provider, rec.model)).toEqual({
          supported: true,
          caps: result.state.records[0],
        });
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Unknown provider/model yields an explicit unsupported result
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------

describe('Property 19: Unknown provider/model yields an explicit unsupported result', () => {
  it('returns { supported: false } for any provider/model with no stored record', () => {
    fc.assert(
      fc.property(
        fc.array(validRecord, { maxLength: 6 }),
        nonEmptyString,
        nonEmptyString,
        (records, queryProvider, queryModel) => {
          // Build a registry from the generated records.
          let state = createRegistryState();
          for (const rec of records) {
            const r = register(state, rec);
            if (r.ok) state = r.state;
          }

          const isKnown = state.records.some(
            (r) => r.provider === queryProvider && r.model === queryModel,
          );
          fc.pre(!isKnown); // only exercise genuinely unknown lookups

          const result = lookup(state, queryProvider, queryModel);
          // Explicit unsupported result, never a default/partial capability.
          expect(result).toEqual({ supported: false });
          expect('caps' in result).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Capability versioning is append-only
// Validates: Requirements 7.5
// ---------------------------------------------------------------------------

describe('Property 20: Capability versioning is append-only', () => {
  it('registering a new version leaves all prior versions retrievable unchanged', () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        nonEmptyString,
        fc.uniqueArray(nonEmptyString, { minLength: 2, maxLength: 6 }),
        validRecord,
        (provider, model, versions, template) => {
          let state = createRegistryState();
          const registeredSnapshots: VideoModelCapabilities[] = [];

          for (const version of versions) {
            const rec: VideoModelCapabilities = { ...template, provider, model, version };
            const r = register(state, rec);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            state = r.state;

            // After appending, every previously registered version is still
            // retrievable and byte-for-byte unchanged (append-only, Req 7.5).
            for (const snap of registeredSnapshots) {
              const found = versionsOf(state, provider, model).find(
                (v) => v.version === snap.version,
              );
              expect(found).toBeDefined();
              expect(found).toEqual(snap);
            }

            const current = versionsOf(state, provider, model).find(
              (v) => v.version === version,
            )!;
            registeredSnapshots.push(current);
          }

          // All versions retained, oldest-first, in registration order.
          const stored = versionsOf(state, provider, model);
          expect(stored.map((v) => v.version)).toEqual(versions);
          // Latest-registered version is the current lookup result.
          const current = lookup(state, provider, model);
          expect(current.supported).toBe(true);
          if (current.supported) {
            expect(current.caps.version).toBe(versions[versions.length - 1]);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('rejects a duplicate (provider, model, version) without mutating stored records', () => {
    fc.assert(
      fc.property(validRecord, (rec) => {
        const first = register(createRegistryState(), rec);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const before = versionsOf(first.state, rec.provider, rec.model);

        const dup = register(first.state, { ...rec });
        expect(dup.ok).toBe(false);
        if (dup.ok) return;
        expect(dup.error.code).toBe('DUPLICATE_VERSION');
        // Prior versions unchanged.
        expect(versionsOf(first.state, rec.provider, rec.model)).toEqual(before);
      }),
      { numRuns: RUNS },
    );
  });
});
