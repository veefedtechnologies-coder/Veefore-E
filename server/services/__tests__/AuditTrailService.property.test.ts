import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Document } from 'mongoose';
import {
  AuditTrailService,
  toUtcSecondPrecision,
  type AuditRecordInput,
  type AuditRecordPersister,
} from '../AuditTrailService';
import { rateLimitConfig } from '../../config/rateLimitConfig';
import type { IAutomationAuditRecord } from '../../models/Automation/AutomationAuditRecord';

/**
 * Property-Based Tests for the AuditTrailService (smart-polling-system).
 *
 * Property 17: Exactly one audit record per action with required fields
 *   For any automated comment-reply or DM-reply action (success or failure),
 *   `AuditTrailService.record` persists exactly one `AutomationAuditRecord`
 *   capturing the matched rule, triggering input, content sent, outcome, the
 *   target account identifier, and a UTC second-precision `occurredAt`.
 *   **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
 */

const ITERATIONS = 200;

type PersistedRecord = Omit<IAutomationAuditRecord, keyof Document | 'createdAt'>;

/**
 * In-memory fake persister that captures every created record in an array.
 * Mirrors the durable Mongoose model's `create` contract without a database,
 * so we can assert exactly how many records a single `record()` call produces.
 */
class FakePersister implements AuditRecordPersister {
  readonly created: PersistedRecord[] = [];

  async create(record: PersistedRecord): Promise<unknown> {
    this.created.push(record);
    return record;
  }
}

// -----------------------------------------------------------------------------
// Arbitraries — a valid action input (success or failure)
// -----------------------------------------------------------------------------

const nonEmptyString = fc.string({ minLength: 1, maxLength: 32 });

const actionTypeArb = fc.constantFrom<'comment_reply' | 'dm_reply'>(
  'comment_reply',
  'dm_reply'
);

// Triggering input — an arbitrary JSON-ish payload (e.g. the comment/DM body).
const triggeringInputArb: fc.Arbitrary<Record<string, any>> = fc.dictionary(
  nonEmptyString,
  fc.oneof(nonEmptyString, fc.integer(), fc.boolean()),
  { maxKeys: 5 }
);

// occurredAt may be supplied (any valid ms-precision Date) or omitted (service uses now()).
const occurredAtArb = fc.option(
  fc.date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2035-01-01T00:00:00.000Z'),
    noInvalidDate: true,
  }),
  { nil: undefined }
);

// A successful action: contentSent present, no failureReason.
const successInputArb: fc.Arbitrary<AuditRecordInput> = fc.record({
  targetAccountId: nonEmptyString,
  ruleId: nonEmptyString,
  ruleName: fc.option(nonEmptyString, { nil: undefined }),
  actionType: actionTypeArb,
  triggeringInput: triggeringInputArb,
  contentSent: nonEmptyString,
  outcome: fc.constant<'success'>('success'),
  occurredAt: occurredAtArb,
}) as fc.Arbitrary<AuditRecordInput>;

// A failed action: failureReason present, contentSent may be absent (fail-before-send).
const failureInputArb: fc.Arbitrary<AuditRecordInput> = fc.record({
  targetAccountId: nonEmptyString,
  ruleId: nonEmptyString,
  ruleName: fc.option(nonEmptyString, { nil: undefined }),
  actionType: actionTypeArb,
  triggeringInput: triggeringInputArb,
  contentSent: fc.option(nonEmptyString, { nil: undefined }),
  outcome: fc.constant<'failure'>('failure'),
  failureReason: nonEmptyString,
  occurredAt: occurredAtArb,
}) as fc.Arbitrary<AuditRecordInput>;

const actionInputArb = fc.oneof(successInputArb, failureInputArb);

// -----------------------------------------------------------------------------
// Property 17
// -----------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 17: Exactly one audit record per action with required fields', () => {
  it('persists exactly one record per successful action with all required fields (Req 11.1, 11.3, 11.4)', async () => {
    await fc.assert(
      fc.asyncProperty(successInputArb, async (input) => {
        const persister = new FakePersister();
        const service = new AuditTrailService(rateLimitConfig, persister);

        await service.record(input);

        // Exactly one record per action (Req 11.1).
        expect(persister.created).toHaveLength(1);

        const record = persister.created[0];

        // Required fields captured (Req 11.1, 11.3, 11.4).
        expect(record.targetAccountId).toBe(input.targetAccountId);
        expect(record.ruleId).toBe(input.ruleId);
        expect(record.actionType).toBe(input.actionType);
        expect(record.triggeringInput).toEqual(input.triggeringInput);
        expect(record.contentSent).toBe(input.contentSent);
        expect(record.outcome).toBe('success');

        // occurredAt present and at UTC second precision — no millis (Req 11.3).
        expect(record.occurredAt).toBeInstanceOf(Date);
        expect(record.occurredAt.getTime() % 1000).toBe(0);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('persists exactly one record per failed action capturing the failure outcome (Req 11.2, 11.3, 11.4)', async () => {
    await fc.assert(
      fc.asyncProperty(failureInputArb, async (input) => {
        const persister = new FakePersister();
        const service = new AuditTrailService(rateLimitConfig, persister);

        await service.record(input);

        // Exactly one record per failed action (Req 11.2).
        expect(persister.created).toHaveLength(1);

        const record = persister.created[0];

        // Matched rule, triggering input, and failure outcome captured (Req 11.2, 11.4).
        expect(record.targetAccountId).toBe(input.targetAccountId);
        expect(record.ruleId).toBe(input.ruleId);
        expect(record.actionType).toBe(input.actionType);
        expect(record.triggeringInput).toEqual(input.triggeringInput);
        expect(record.outcome).toBe('failure');
        expect(record.failureReason).toBe(input.failureReason);

        // Second-precision occurredAt and target account identifier (Req 11.3).
        expect(record.occurredAt).toBeInstanceOf(Date);
        expect(record.occurredAt.getTime() % 1000).toBe(0);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('produces exactly one record per action across success and failure inputs (Req 11.1, 11.2)', async () => {
    await fc.assert(
      fc.asyncProperty(actionInputArb, async (input) => {
        const persister = new FakePersister();
        const service = new AuditTrailService(rateLimitConfig, persister);

        await service.record(input);

        // Regardless of outcome, exactly one record is persisted per call.
        expect(persister.created).toHaveLength(1);

        const record = persister.created[0];
        // The required identifying fields are always present.
        expect(record.targetAccountId).toBe(input.targetAccountId);
        expect(record.ruleId).toBe(input.ruleId);
        expect(['comment_reply', 'dm_reply']).toContain(record.actionType);
        expect(['success', 'failure']).toContain(record.outcome);
        expect(record.occurredAt.getTime() % 1000).toBe(0);

        // When occurredAt was supplied, it matches the second-truncated input.
        if (input.occurredAt) {
          expect(record.occurredAt.getTime()).toBe(
            toUtcSecondPrecision(input.occurredAt).getTime()
          );
        }
      }),
      { numRuns: ITERATIONS }
    );
  });
});
