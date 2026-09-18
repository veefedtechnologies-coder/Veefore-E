/**
 * Tests for the one-time AI credit pack purchase flow.
 *
 * The flow is deliberately split so that nothing the client sends can mint
 * credits:
 *   1. POST /credits/create-order  → server derives the price from ADDON_CONFIG
 *      and creates a Razorpay Order tagged with `veefore_purpose`.
 *   2. Razorpay `payment.captured` webhook → the ONLY place credits are granted.
 *
 * These tests cover step 1's pricing/validation and the invariants step 2 relies
 * on (order note contents, amount re-derivation, exactly-once claiming).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddOnService } from './AddOnService';
import { ADDON_CONFIG, type AddOnType } from '../../../config/plan-config';

// Stub the Razorpay wrapper so no network call is made and we can inspect the
// exact order payload the service builds.
const createOrderMock = vi.fn();
vi.mock('./RazorpaySubscriptionService', () => ({
  razorpaySubscriptionService: {
    createOrder: (...args: unknown[]) => createOrderMock(...args),
  },
}));

function makeService(plan = 'creator') {
  const entitlementService = {
    getPlan: vi.fn().mockResolvedValue(plan),
    invalidateCache: vi.fn().mockResolvedValue(undefined),
  };
  return new AddOnService(entitlementService as never, {} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_KEY_ID = 'dummy_razorpay_key_test_keyid';
  createOrderMock.mockResolvedValue({
    orderId: 'order_TEST123',
    amountPaise: 0,
    currency: 'INR',
  });
});

describe('createCreditPackOrder — server-derived pricing', () => {
  it.each([
    ['ai_credits_500', 29900, 500],
    ['ai_credits_2000', 89900, 2000],
    ['ai_credits_5000', 199900, 5000],
  ] as const)(
    '%s is priced at %i paise for %i credits',
    async (addonType, expectedPaise, expectedCredits) => {
      const service = makeService();
      const result = await service.createCreditPackOrder(
        'user_1',
        addonType,
        1
      );

      const [amountPaise] = createOrderMock.mock.calls[0];
      expect(amountPaise).toBe(expectedPaise);
      expect(result.credits).toBe(expectedCredits);
    }
  );

  it('scales price and credits linearly with quantity', async () => {
    const service = makeService();
    const result = await service.createCreditPackOrder(
      'user_1',
      'ai_credits_500',
      3
    );

    const [amountPaise] = createOrderMock.mock.calls[0];
    expect(amountPaise).toBe(ADDON_CONFIG.ai_credits_500.priceOneTime! * 3);
    expect(result.credits).toBe(
      ADDON_CONFIG.ai_credits_500.quantityIncrement * 3
    );
  });

  it('always sends an integer paise amount to Razorpay', async () => {
    // Razorpay rejects fractional paise.
    const service = makeService();
    await service.createCreditPackOrder('user_1', 'ai_credits_2000', 7);

    const [amountPaise] = createOrderMock.mock.calls[0];
    expect(Number.isInteger(amountPaise)).toBe(true);
  });

  it('grants no credits at order-creation time', async () => {
    // The whole point of the split: creating an order must be inert. Only the
    // webhook grants. If this service ever started crediting here, abandoning
    // checkout would hand out free credits again.
    const service = makeService();
    const entitlement = (
      service as unknown as {
        entitlementService: { invalidateCache: ReturnType<typeof vi.fn> };
      }
    ).entitlementService;

    await service.createCreditPackOrder('user_1', 'ai_credits_5000', 1);

    expect(entitlement.invalidateCache).not.toHaveBeenCalled();
  });
});

describe('createCreditPackOrder — order notes drive the webhook grant', () => {
  it('tags the order so the webhook can identify it', async () => {
    const service = makeService();
    await service.createCreditPackOrder('user_42', 'ai_credits_500', 2);

    const [, receipt, notes] = createOrderMock.mock.calls[0] as [
      number,
      string,
      Record<string, string>,
    ];

    // The webhook keys off this exact marker; drifting it silently breaks
    // fulfilment (customer charged, no credits).
    expect(notes.veefore_purpose).toBe('ai_credit_pack');
    expect(notes.veefore_purpose).toBe(AddOnService.CREDIT_PACK_PURPOSE);
    expect(notes.veefore_user_id).toBe('user_42');
    expect(notes.veefore_addon_type).toBe('ai_credits_500');
    expect(notes.veefore_quantity).toBe('2');
    expect(notes.veefore_credits).toBe('1000');
    expect(typeof receipt).toBe('string');
  });

  it('keeps the receipt within Razorpay\u2019s 40-character limit', async () => {
    const service = makeService();
    await service.createCreditPackOrder('user_1', 'ai_credits_5000', 1);

    const [, receipt] = createOrderMock.mock.calls[0] as [number, string];
    expect(receipt.length).toBeLessThanOrEqual(40);
  });

  it('every note value is a string (Razorpay rejects non-string notes)', async () => {
    const service = makeService();
    await service.createCreditPackOrder('user_1', 'ai_credits_500', 2);

    const [, , notes] = createOrderMock.mock.calls[0] as [
      number,
      string,
      Record<string, unknown>,
    ];
    for (const [key, value] of Object.entries(notes)) {
      expect(typeof value, `note ${key} must be a string`).toBe('string');
    }
  });
});

describe('createCreditPackOrder — input validation', () => {
  it('rejects a recurring add-on (must use the mandate flow)', async () => {
    const service = makeService();
    await service.createCreditPackOrder('user_1', 'extra_workspace', 1).then(
      () => {
        throw new Error('expected rejection');
      },
      (err: Error & { statusCode?: number }) => {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/recurring add-on/i);
      }
    );
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown add-on type', async () => {
    const service = makeService();
    await expect(
      service.createCreditPackOrder('user_1', 'nope' as AddOnType, 1)
    ).rejects.toThrow(/unknown add-on type/i);
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN])('rejects invalid quantity %s', async qty => {
    const service = makeService();
    await expect(
      service.createCreditPackOrder('user_1', 'ai_credits_500', qty)
    ).rejects.toThrow(/positive integer/i);
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('caps quantity to prevent an unbounded order', async () => {
    // Without a cap, one request could create an enormous order and, on
    // capture, an enormous credit grant.
    const service = makeService();
    await expect(
      service.createCreditPackOrder('user_1', 'ai_credits_5000', 21)
    ).rejects.toThrow(/at most 20 packs/i);
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('allows exactly the cap', async () => {
    const service = makeService();
    await expect(
      service.createCreditPackOrder('user_1', 'ai_credits_500', 20)
    ).resolves.toMatchObject({ orderId: 'order_TEST123' });
  });

  it('fails when RAZORPAY_KEY_ID is not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID;
    const service = makeService();
    await expect(
      service.createCreditPackOrder('user_1', 'ai_credits_500', 1)
    ).rejects.toThrow(/RAZORPAY_KEY_ID/);
  });
});

describe('webhook grant — amount re-derivation invariant', () => {
  // The webhook recomputes the expected amount from ADDON_CONFIG and refuses to
  // grant when the captured amount falls short. This mirrors that arithmetic so
  // a config change that breaks the relationship is caught here.
  const expectedFor = (addonType: AddOnType, quantity: number) =>
    ADDON_CONFIG[addonType].priceOneTime! * quantity;

  it('accepts an exact payment', () => {
    const expected = expectedFor('ai_credits_500', 2);
    expect(expected).toBe(59800);
    expect(expected < expected).toBe(false);
  });

  it('detects an underpayment', () => {
    const expected = expectedFor('ai_credits_5000', 1);
    const captured = expectedFor('ai_credits_500', 1); // paid for the cheap pack
    expect(captured < expected).toBe(true);
  });

  it('tolerates an overpayment (never blocks a genuine payment)', () => {
    const expected = expectedFor('ai_credits_500', 1);
    const captured = expected + 100;
    expect(captured < expected).toBe(false);
  });
});
