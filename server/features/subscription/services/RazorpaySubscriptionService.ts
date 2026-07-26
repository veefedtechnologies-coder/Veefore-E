/**
 * RazorpaySubscriptionService
 *
 * Thin wrapper around the official `razorpay` Node SDK, scoped to exactly
 * what the subscription-billing-entitlement feature needs: customers, plans,
 * subscriptions (recurring mandates), and refunds.
 *
 * Replaces the previous Cashfree-based CashfreeService entirely. Razorpay's
 * Subscriptions API charges the FULL plan amount as the authentication
 * transaction itself (not a token amount) — so unlike the Cashfree flow,
 * there is no need for a separate Orders-API-then-Subscriptions-API hybrid.
 * One `subscriptions.create()` call handles both "charge the customer now"
 * and "register the mandate for future renewals".
 *
 * Docs: https://razorpay.com/docs/api/payments/subscriptions/
 */

import Razorpay from 'razorpay';
import logger from '../../../config/logger';

// ---------------------------------------------------------------------------
// Env validation — fail fast at startup, matching the previous CashfreeService pattern
// ---------------------------------------------------------------------------

function getRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId) {
    throw new Error('Missing required environment variable: RAZORPAY_KEY_ID');
  }
  if (!keySecret) {
    throw new Error('Missing required environment variable: RAZORPAY_KEY_SECRET');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface RazorpayCustomerResult {
  customerId: string;
  email: string;
  contact: string;
}

export interface CreateSubscriptionParams {
  /** Razorpay customer_id — must already exist (see createCustomer). */
  customerId: string;
  /** Razorpay plan_id — see getOrCreatePlan(). */
  planId: string;
  /** Total number of billing cycles to charge. Use a large number for "until cancelled" (e.g. 120 cycles ≈ 10 years monthly). */
  totalCount: number;
  /** Notes/metadata stored on the Razorpay subscription for audit/reference. */
  notes?: Record<string, string>;
}

export interface RazorpaySubscriptionResult {
  subscriptionId: string;
  status: string;
  shortUrl: string | null;
}

export interface CreatePlanParams {
  /** Internal Veefore plan id, e.g. 'creator', 'pro'. */
  planType: string;
  billingCycle: 'monthly' | 'yearly';
  /** Amount in whole rupees (e.g. 799 for ₹799/month). */
  amountRupees: number;
}

export interface RazorpayRefundResult {
  refundId: string;
  status: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// RazorpaySubscriptionService
// ---------------------------------------------------------------------------

export class RazorpaySubscriptionService {
  private readonly client: Razorpay;

  constructor() {
    this.client = getRazorpayClient();
  }

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------

  /**
   * Create a Razorpay customer.
   *
   * Razorpay's `customers.create` is documented to accept `fail_existing: '0'`
   * to return the existing customer instead of erroring when one already
   * exists for the same email+contact combo — but in practice this flag is
   * unreliable (Razorpay still returns `BAD_REQUEST_ERROR: "Customer already
   * exists for the merchant"` in some accounts/API versions regardless of the
   * flag). To be robust against that, we still pass `fail_existing: '0'`
   * (as a string — the API rejects a numeric 0 in some SDK/API version
   * combinations), but ALSO catch the "already exists" error specifically
   * and fall back to searching existing customers by exact email match,
   * since the Node SDK's `customers.all()` does not support server-side
   * email filtering.
   */
  async createCustomer(
    userId: string,
    email: string,
    phone: string,
    name?: string,
  ): Promise<RazorpayCustomerResult> {
    try {
      const customer = await this.client.customers.create({
        name: name || email.split('@')[0] || 'Veefore User',
        email,
        contact: phone.replace(/\D/g, '').slice(-10) || '9999999999',
        fail_existing: '0', // if a customer with same email/contact exists, return it instead of erroring
        notes: { veefore_user_id: userId },
      } as any);

      return {
        customerId: customer.id,
        email: customer.email ?? email,
        contact: customer.contact != null ? String(customer.contact) : phone,
      };
    } catch (err) {
      const description =
        (err as { error?: { description?: string } })?.error?.description ?? '';
      const isAlreadyExists = /already exists/i.test(description);

      if (isAlreadyExists) {
        logger.warn(
          'Razorpay reported customer already exists despite fail_existing flag — looking up existing customer by email',
          { module: 'subscription', userId, email },
        );

        const existing = await this.findCustomerByEmail(email);
        if (existing) {
          return existing;
        }

        logger.error(
          'Razorpay customer lookup by email found no match after "already exists" error',
          new Error(description || 'Customer lookup failed'),
          { module: 'subscription', userId, email },
        );
      }

      logger.error(
        'Razorpay createCustomer failed',
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', userId, email },
      );
      throw err;
    }
  }

  /**
   * Fallback lookup used when `createCustomer` hits an "already exists"
   * error. Razorpay's Node SDK `customers.all()` only supports pagination
   * params (count/skip), not server-side filtering by email, so we page
   * through results and filter client-side for an exact email match.
   * Stops after the first page that contains no match if the account has
   * relatively few customers (typical for this feature's usage); pages up
   * to 5 times (500 customers) as a safety bound.
   */
  private async findCustomerByEmail(email: string): Promise<RazorpayCustomerResult | null> {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.client.customers.all({ count: PAGE_SIZE, skip: page * PAGE_SIZE } as any);
      const items = (result as unknown as { items?: Array<Record<string, unknown>> }).items ?? [];

      const match = items.find(
        (c) => typeof c.email === 'string' && c.email.toLowerCase() === email.toLowerCase(),
      );

      if (match) {
        return {
          customerId: String(match.id),
          email: String(match.email ?? email),
          contact: match.contact != null ? String(match.contact) : '',
        };
      }

      if (items.length < PAGE_SIZE) {
        // Last page reached, no more customers to check.
        break;
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  /**
   * Create a Razorpay Plan for the given internal plan + billing cycle +
   * amount. Razorpay plans are immutable price points — one plan per
   * (planType, billingCycle, amount) combination. Callers should cache the
   * resulting plan_id (e.g. in PLAN_CONFIG or a lookup table) rather than
   * calling this on every subscription creation, since Razorpay does not
   * dedupe plans automatically.
   */
  async createPlan(params: CreatePlanParams): Promise<string> {
    try {
      const period = params.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      const plan = await this.client.plans.create({
        period,
        interval: 1,
        item: {
          name: `Veefore ${params.planType} (${params.billingCycle})`,
          amount: Math.round(params.amountRupees * 100), // paise
          currency: 'INR',
        },
        notes: {
          veefore_plan_type: params.planType,
          veefore_billing_cycle: params.billingCycle,
        },
      } as any);

      return String(plan.id);
    } catch (err) {
      logger.error(
        'Razorpay createPlan failed',
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', params: JSON.stringify(params) },
      );
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  /**
   * Create a Razorpay subscription. The customer will be redirected to
   * Razorpay Checkout (via the returned short_url, or via the Razorpay JS
   * Checkout SDK using the subscription_id directly) to complete the
   * authentication transaction.
   *
   * IMPORTANT — unlike Cashfree, Razorpay's authentication transaction
   * charges the FULL plan amount by default (not a token ₹1). This means
   * the subscription only reaches 'active' status once real money has been
   * collected — see webhook handling in webhook.controller.ts, which grants
   * plan access on the `subscription.charged` / `payment.captured` webhook,
   * never on subscription creation alone.
   */
  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<RazorpaySubscriptionResult> {
    try {
      const subscription = await this.client.subscriptions.create({
        plan_id: params.planId,
        customer_notify: 1,
        total_count: params.totalCount,
        notes: params.notes ?? {},
      } as any);

      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        shortUrl: subscription.short_url ?? null,
      };
    } catch (err) {
      logger.error(
        'Razorpay createSubscription failed',
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', params: JSON.stringify(params) },
      );
      throw err;
    }
  }

  /** Fetch a subscription's current state directly from Razorpay (used by reconciliation). */
  async getSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
    return this.client.subscriptions.fetch(subscriptionId) as unknown as Record<string, unknown>;
  }

  /**
   * Cancel a subscription.
   * @param cancelAtCycleEnd - If true, subscription remains active until the
   *   current paid period ends (matches our "cancel = disable auto-renew,
   *   keep access until period end" product requirement). If false,
   *   cancels immediately.
   */
  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd: boolean): Promise<void> {
    try {
      await this.client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
    } catch (err) {
      logger.error(
        'Razorpay cancelSubscription failed',
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', subscriptionId, cancelAtCycleEnd },
      );
      throw err;
    }
  }

  /** Pause an active subscription (no charges occur while paused). */
  async pauseSubscription(subscriptionId: string): Promise<void> {
    await this.client.subscriptions.pause(subscriptionId, { pause_at: 'now' } as any);
  }

  /** Resume a paused subscription. */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.client.subscriptions.resume(subscriptionId, { resume_at: 'now' } as any);
  }

  // -------------------------------------------------------------------------
  // Refunds
  // -------------------------------------------------------------------------

  /**
   * Refund a captured payment (partial or full). Razorpay refunds are keyed
   * by payment_id, not subscription_id — this works identically for both
   * one-time order payments and subscription charge payments.
   *
   * @param paymentId    - The Razorpay payment_id being refunded.
   * @param amountRupees - Amount to refund, in whole rupees. Omit for a full refund.
   * @param notes        - Optional metadata for the refund record.
   */
  async createRefund(
    paymentId: string,
    amountRupees?: number,
    notes?: Record<string, string>,
  ): Promise<RazorpayRefundResult> {
    try {
      const payload: Record<string, unknown> = { notes: notes ?? {} };
      if (amountRupees !== undefined) {
        payload.amount = Math.round(amountRupees * 100); // paise
      }

      const refund = await this.client.payments.refund(paymentId, payload);

      return {
        refundId: refund.id,
        status: refund.status ?? 'processed',
        amount: (refund.amount ?? 0) / 100,
      };
    } catch (err) {
      logger.error(
        'Razorpay createRefund failed',
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', paymentId, amountRupees },
      );
      throw err;
    }
  }

  /** Fetch a payment's current state directly from Razorpay. */
  async getPayment(paymentId: string): Promise<Record<string, unknown>> {
    return this.client.payments.fetch(paymentId) as unknown as Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const razorpaySubscriptionService = new RazorpaySubscriptionService();
