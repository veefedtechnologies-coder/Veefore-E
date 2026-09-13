/**
 * Unit tests for the Video_Editor generative metering-integration service
 * (`server/features/video-editor/services/generative-metering.service.ts`).
 *
 * Task 16.3 — verifies the runMetered wiring and pre-execution gating:
 *   - Req 17.2, 17.3: reserve/reconcile happens through the authoritative ledger.
 *   - Req 17.6, 17.9: server-side balance is authoritative and insufficient
 *     credits block the provider call with an upgrade/add-credit path and no
 *     deduction.
 *   - Req 17.7, 17.8: the estimate is presented, confirmation is required, and a
 *     300 s timeout cancels with no provider call and no deduction.
 *   - Req 17.10: a mid-flight abort releases the reservation with no charge.
 *
 * A fake ledger is injected so the orchestration is exercised without Redis,
 * MongoDB, or a real provider (No-Mock rule applies to production code, not to
 * these dependency doubles).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  VideoGenerativeMeteringService,
  type MeteringLedger,
} from '../server/features/video-editor/services/generative-metering.service';
import type { CreditSettlement } from '../server/features/subscription/services/AICreditMeteringService';

/** A controllable fake ledger capturing calls and simulating runMetered. */
function makeLedger(balance: number): MeteringLedger & {
  runMeteredCalls: number;
  lastAdditionalCost?: number;
} {
  const ledger = {
    runMeteredCalls: 0,
    lastAdditionalCost: undefined as number | undefined,
    async ensureCreditAccount() {
      return balance;
    },
    async runMetered<T>(
      _feature: string,
      _usageFeature: string,
      _ctx: unknown,
      operation: (signal?: AbortSignal) => Promise<T>,
      additionalProviderCostInr = 0,
      signal?: AbortSignal,
    ): Promise<{ result: T; settlement: CreditSettlement }> {
      ledger.runMeteredCalls += 1;
      ledger.lastAdditionalCost = additionalProviderCostInr;
      // Mirror the real ledger: aborting rejects (reservation released upstream).
      if (signal?.aborted) {
        const err = new Error('Generation cancelled');
        err.name = 'AbortError';
        throw err;
      }
      const result = await operation(signal);
      return { result, settlement: { charged: 1, remaining: balance - 1 } };
    },
  };
  return ledger as MeteringLedger & { runMeteredCalls: number; lastAdditionalCost?: number };
}

const context = { userId: 'u1', workspaceId: 'w1', idempotencyKey: 've-job-1' };
const cost = { outputSeconds: 5, costPerOutputSecondInr: 2 };

describe('VideoGenerativeMeteringService — runMetered integration + gating (task 16.3)', () => {
  it('meters a confirmed operation through runMetered with the measured cost (Req 17.1, 17.2, 17.3, 17.7)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const operation = vi.fn(async () => 'output');

    const res = await svc.runGenerativeOperation({
      context,
      cost,
      operation,
      confirm: async () => true,
    });

    expect(res.status).toBe('completed');
    if (res.status === 'completed') {
      expect(res.result).toBe('output');
      expect(res.settlement.charged).toBe(1);
    }
    expect(ledger.runMeteredCalls).toBe(1);
    // additionalProviderCostInr === measured outputSeconds × rate (5 × 2).
    expect(ledger.lastAdditionalCost).toBe(10);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('blocks on insufficient credits with an upgrade path and no provider call (Req 17.9, 17.6)', async () => {
    const ledger = makeLedger(1); // below the reservation ceiling
    const svc = new VideoGenerativeMeteringService({ ledger });
    const operation = vi.fn(async () => 'output');

    const res = await svc.runGenerativeOperation({ context, cost, operation, confirm: async () => true });

    expect(res.status).toBe('blocked');
    if (res.status === 'blocked') {
      expect(res.upgradePath.type).toBe('upgrade_or_add_credits');
      expect(res.upgradePath.actions).toContain('add_credits');
    }
    expect(ledger.runMeteredCalls).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it('blocks a zero-cost edit when the balance is zero (Req 17.9)', async () => {
    const ledger = makeLedger(0);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const operation = vi.fn(async () => 'output');

    const res = await svc.runGenerativeOperation({
      context,
      cost: { outputSeconds: 0, costPerOutputSecondInr: 0 },
      operation,
      confirm: async () => true,
      isZeroCostEdit: true,
    });

    expect(res.status).toBe('blocked');
    expect(operation).not.toHaveBeenCalled();
  });

  it('allows an enterprise (Infinity) balance to proceed (Req 17.6)', async () => {
    const ledger = makeLedger(Infinity);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const res = await svc.runGenerativeOperation({ context, cost, operation: async () => 'ok', confirm: async () => true });
    expect(res.status).toBe('completed');
    expect(ledger.runMeteredCalls).toBe(1);
  });

  it('cancels with no provider call when confirmation times out within 300 s (Req 17.8)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger, confirmationTimeoutMs: 10 });
    const operation = vi.fn(async () => 'output');

    const res = await svc.runGenerativeOperation({
      context,
      cost,
      operation,
      // Never resolves — forces the timeout to win.
      confirm: () => new Promise<boolean>(() => {}),
    });

    expect(res.status).toBe('cancelled');
    if (res.status === 'cancelled') expect(res.cause).toBe('confirmation_timeout');
    expect(ledger.runMeteredCalls).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it('cancels with no provider call when the user declines (Req 17.7)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const operation = vi.fn(async () => 'output');

    const res = await svc.runGenerativeOperation({ context, cost, operation, confirm: async () => false });

    expect(res.status).toBe('cancelled');
    if (res.status === 'cancelled') expect(res.cause).toBe('confirmation_declined');
    expect(ledger.runMeteredCalls).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not call the provider when already aborted before execution (Req 17.10)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const operation = vi.fn(async () => 'output');
    const controller = new AbortController();
    controller.abort();

    const res = await svc.runGenerativeOperation({
      context,
      cost,
      operation,
      confirm: async () => true,
      signal: controller.signal,
    });

    expect(res.status).toBe('cancelled');
    if (res.status === 'cancelled') expect(res.cause).toBe('aborted');
    expect(ledger.runMeteredCalls).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it('surfaces a mid-flight abort as a cancellation after the reservation is released (Req 17.10)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const controller = new AbortController();
    // Abort during confirmation so runMetered sees an aborted signal.
    const confirm = async () => {
      controller.abort();
      return true;
    };

    const res = await svc.runGenerativeOperation({
      context,
      cost,
      operation: async () => 'output',
      confirm,
      signal: controller.signal,
    });

    expect(res.status).toBe('cancelled');
    if (res.status === 'cancelled') expect(res.cause).toBe('aborted');
  });

  it('auto-confirms when no confirmation requester is supplied (background flow)', async () => {
    const ledger = makeLedger(1000);
    const svc = new VideoGenerativeMeteringService({ ledger });
    const res = await svc.runGenerativeOperation({ context, cost, operation: async () => 'ok' });
    expect(res.status).toBe('completed');
    expect(ledger.runMeteredCalls).toBe(1);
  });

  it('exposes an estimate derived from the single-source charge math (Req 17.7)', () => {
    const svc = new VideoGenerativeMeteringService({ ledger: makeLedger(1000) });
    const estimate = svc.estimate(cost);
    expect(estimate.feature).toBe('videoGenerativeEdit');
    expect(estimate.providerCostInr).toBe(10);
    expect(estimate.reservationCredits).toBeGreaterThan(0);
    expect(estimate.estimatedCredits).toBeGreaterThan(0);
  });
});
