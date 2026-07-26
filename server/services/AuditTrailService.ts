/**
 * AuditTrailService — Persists the Audit Trail for Automated Actions
 *
 * Records exactly one {@link IAutomationAuditRecord} per automated action,
 * whether it succeeded or failed, capturing the matched rule, the triggering
 * input, the content that was sent, the outcome, a UTC second-precision
 * timestamp, and the target account (Req 11.1, 11.2, 11.3, 11.4).
 *
 * Persistence is retried up to `config.smartPolling.audit.persistenceMaxRetries`
 * on failure. If every attempt fails, the service surfaces an error (throws)
 * rather than silently discarding the record (Req 11.5).
 *
 * Requirements covered: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import type { Document } from 'mongoose';
import { logger } from '../config/logger';
import { rateLimitConfig } from '../config/rateLimitConfig';
import type { RateLimitConfig } from '../config/rateLimitConfig';
import {
  AutomationAuditRecordModel,
  type IAutomationAuditRecord,
} from '../models/Automation/AutomationAuditRecord';

/**
 * The caller-supplied fields of an audit record. `occurredAt` is computed by
 * the service at UTC second precision (Req 11.3) and `createdAt` is set by the
 * model default, so neither is part of the input.
 */
export type AuditRecordInput = Omit<
  IAutomationAuditRecord,
  keyof Document | 'createdAt' | 'occurredAt'
> & {
  /**
   * Optional explicit occurrence time. When omitted, the current time is used.
   * Either way it is normalized to UTC second precision before persistence.
   */
  occurredAt?: Date;
};

/**
 * Minimal persistence surface used by the service. The default binding is the
 * Mongoose `AutomationAuditRecordModel`; injecting a custom persister keeps the
 * service trivially unit/property testable without a live database.
 */
export interface AuditRecordPersister {
  create(record: Omit<IAutomationAuditRecord, keyof Document | 'createdAt'>): Promise<unknown>;
}

/**
 * Truncate a timestamp to whole-second precision in UTC (Req 11.3).
 * Millisecond components are dropped so every persisted `occurredAt` is exactly
 * second-aligned regardless of when the action fired.
 *
 * If `date` is not a valid Date (e.g. `new Date(NaN)`), the current time is used
 * as a fallback so the persisted `occurredAt` is always a valid second-precision
 * UTC timestamp (Req 11.3).
 */
export function toUtcSecondPrecision(date: Date): Date {
  const source = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(Math.floor(source.getTime() / 1000) * 1000);
}

export class AuditTrailService {
  private readonly maxRetries: number;
  private readonly persister: AuditRecordPersister;

  /**
   * @param config    Resolved rate-limit config; supplies the persistence retry
   *                  count (`smartPolling.audit.persistenceMaxRetries`).
   *                  Defaults to the singleton `rateLimitConfig`.
   * @param persister Durable record store. Defaults to the Mongoose model.
   */
  constructor(
    config: RateLimitConfig = rateLimitConfig,
    persister: AuditRecordPersister = AutomationAuditRecordModel
  ) {
    this.maxRetries = config.smartPolling.audit.persistenceMaxRetries;
    this.persister = persister;
  }

  /**
   * Persist exactly one audit record for an automated action (Req 11.1, 11.2,
   * 11.4). The record carries a UTC second-precision `occurredAt` and the
   * target account identifier (Req 11.3).
   *
   * On a persistence failure the write is retried up to
   * `persistenceMaxRetries` additional times. If all attempts fail, the last
   * error is thrown so the caller can surface it — the record is never silently
   * discarded (Req 11.5).
   *
   * The single write happens inside the retry loop, so a successful attempt
   * produces exactly one record and a fully-failed call produces none (rather
   * than a partial/duplicate trail).
   */
  async record(input: AuditRecordInput): Promise<void> {
    // An invalid supplied occurredAt (e.g. new Date(NaN)) is treated the same as
    // omitted — the current time is used — so occurredAt is always valid (Req 11.3).
    const suppliedOccurredAt =
      input.occurredAt && !Number.isNaN(input.occurredAt.getTime())
        ? input.occurredAt
        : new Date();
    const occurredAt = toUtcSecondPrecision(suppliedOccurredAt);

    const document = {
      targetAccountId: input.targetAccountId,
      ruleId: input.ruleId,
      ruleName: input.ruleName,
      actionType: input.actionType,
      triggeringInput: input.triggeringInput,
      contentSent: input.contentSent,
      outcome: input.outcome,
      failureReason: input.failureReason,
      occurredAt,
    } as Omit<IAutomationAuditRecord, keyof Document | 'createdAt'>;

    // Total attempts = 1 initial + maxRetries retries (Req 11.5).
    const totalAttempts = this.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        await this.persister.create(document);
        return;
      } catch (error) {
        lastError = error;
        logger.warn('[AuditTrailService] audit record persistence attempt failed', {
          component: 'AuditTrailService',
          attempt,
          totalAttempts,
          targetAccountId: input.targetAccountId,
          ruleId: input.ruleId,
          actionType: input.actionType,
          outcome: input.outcome,
        });
      }
    }

    // Every attempt failed — surface the error rather than discard (Req 11.5).
    logger.error(
      '[AuditTrailService] failed to persist audit record after all retries',
      lastError,
      {
        component: 'AuditTrailService',
        totalAttempts,
        targetAccountId: input.targetAccountId,
        ruleId: input.ruleId,
        actionType: input.actionType,
        outcome: input.outcome,
      }
    );

    throw new Error(
      `AuditTrailService: failed to persist audit record after ${totalAttempts} attempt(s) ` +
        `for account ${input.targetAccountId}, rule ${input.ruleId} (${input.actionType}/${input.outcome})`
    );
  }
}

export default AuditTrailService;
