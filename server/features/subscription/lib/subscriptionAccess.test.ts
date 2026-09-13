/**
 * Tests for the voluntary-cancellation access rules.
 *
 * These encode the product guarantee the billing flow is built on:
 *   cancel -> auto-pay stops -> full access until currentPeriodEnd -> Free
 *   immediately at the cutoff, with NO grace period.
 *
 * The boundary case (exactly at currentPeriodEnd) and the "cancelled then
 * upgraded" case are the two that have caused real incidents, so they are
 * covered explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  isCancellationExpired,
  isCancellationPaidThrough,
  isStaleCancellationFlag,
  shouldFinalizeCancellation,
  type CancellationState,
} from './subscriptionAccess';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const past = (ms: number) => new Date(NOW.getTime() - ms);
const future = (ms: number) => new Date(NOW.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

/** An ordinary, healthy paying subscription mid-period. */
const activePaying: CancellationState = {
  status: 'active',
  cancelAtPeriodEnd: false,
  currentPeriodStart: past(10 * DAY),
  currentPeriodEnd: future(20 * DAY),
  cancellationRequestedAt: null,
};

/** A cancellation requested inside the current period, cutoff still ahead. */
const cancelledPaidThrough: CancellationState = {
  status: 'active',
  cancelAtPeriodEnd: true,
  currentPeriodStart: past(10 * DAY),
  currentPeriodEnd: future(20 * DAY),
  cancellationRequestedAt: past(1 * DAY),
};

/** A cancellation whose paid-through date has already passed. */
const cancelledExpired: CancellationState = {
  status: 'active',
  cancelAtPeriodEnd: true,
  currentPeriodStart: past(40 * DAY),
  currentPeriodEnd: past(5 * DAY),
  cancellationRequestedAt: past(35 * DAY),
};

describe('isCancellationExpired — the hard Free cutoff', () => {
  it('is false for a normal paying subscription', () => {
    expect(isCancellationExpired(activePaying, NOW)).toBe(false);
  });

  it('is false while still inside the paid-through window', () => {
    expect(isCancellationExpired(cancelledPaidThrough, NOW)).toBe(false);
  });

  it('is true once the paid-through date has passed', () => {
    expect(isCancellationExpired(cancelledExpired, NOW)).toBe(true);
  });

  it('is true EXACTLY at currentPeriodEnd (no grace period)', () => {
    // The product rule is explicit: no grace. Access ends at the instant the
    // period ends, not a moment after.
    const atCutoff = { ...cancelledPaidThrough, currentPeriodEnd: NOW };
    expect(isCancellationExpired(atCutoff, NOW)).toBe(true);
  });

  it('is false one millisecond before the cutoff', () => {
    const justBefore = {
      ...cancelledPaidThrough,
      currentPeriodEnd: future(1),
    };
    expect(isCancellationExpired(justBefore, NOW)).toBe(false);
  });

  it('ignores an expired period when no cancellation was requested', () => {
    // A lapsed period on a non-cancelled sub is the renewal/dunning path's
    // concern, not the cancellation cutoff's.
    const lapsed = {
      ...activePaying,
      currentPeriodEnd: past(5 * DAY),
    };
    expect(isCancellationExpired(lapsed, NOW)).toBe(false);
  });

  it('is false when currentPeriodEnd is missing', () => {
    const noEnd = { ...cancelledPaidThrough, currentPeriodEnd: null };
    expect(isCancellationExpired(noEnd, NOW)).toBe(false);
  });

  it('is false for null/undefined subscriptions', () => {
    expect(isCancellationExpired(null, NOW)).toBe(false);
    expect(isCancellationExpired(undefined, NOW)).toBe(false);
  });
});

describe('isCancellationPaidThrough — access retained until the cutoff', () => {
  it('is true for a cancellation with time remaining', () => {
    expect(isCancellationPaidThrough(cancelledPaidThrough, NOW)).toBe(true);
  });

  it('is false once the cutoff has passed', () => {
    expect(isCancellationPaidThrough(cancelledExpired, NOW)).toBe(false);
  });

  it('is false exactly at the cutoff', () => {
    const atCutoff = { ...cancelledPaidThrough, currentPeriodEnd: NOW };
    expect(isCancellationPaidThrough(atCutoff, NOW)).toBe(false);
  });

  it('is false for a non-cancelled subscription', () => {
    expect(isCancellationPaidThrough(activePaying, NOW)).toBe(false);
  });

  it('is mutually exclusive with isCancellationExpired', () => {
    // A cancelled subscription is either still paid-through or expired, never
    // both and never neither (given a concrete currentPeriodEnd).
    for (const sub of [cancelledPaidThrough, cancelledExpired]) {
      const a = isCancellationPaidThrough(sub, NOW);
      const b = isCancellationExpired(sub, NOW);
      expect(a !== b).toBe(true);
    }
  });
});

describe('isStaleCancellationFlag — cancelled-then-upgraded regression', () => {
  it('detects a flag left over from a period that already ended', () => {
    // Real incident: user cancelled Creator, then upgraded to Pro. The upgrade
    // began a new period but the old cancellation flag persisted, so Pro
    // displayed as "cancelled".
    const upgradedAfterCancelling: CancellationState = {
      status: 'active',
      cancelAtPeriodEnd: true,
      cancellationRequestedAt: past(10 * DAY),
      currentPeriodStart: past(2 * DAY), // new period began AFTER the cancel
      currentPeriodEnd: future(28 * DAY),
    };
    expect(isStaleCancellationFlag(upgradedAfterCancelling)).toBe(true);
  });

  it('does NOT touch a genuine cancellation in the current period', () => {
    // The critical false-positive guard: clearing this would silently resume
    // billing for someone who actually cancelled.
    expect(isStaleCancellationFlag(cancelledPaidThrough)).toBe(false);
  });

  it('is false when the cancellation coincides with the period start', () => {
    const boundary: CancellationState = {
      status: 'active',
      cancelAtPeriodEnd: true,
      cancellationRequestedAt: past(5 * DAY),
      currentPeriodStart: past(5 * DAY),
      currentPeriodEnd: future(25 * DAY),
    };
    expect(isStaleCancellationFlag(boundary)).toBe(false);
  });

  it('is false for a non-cancelled subscription', () => {
    expect(isStaleCancellationFlag(activePaying)).toBe(false);
  });

  it('only applies to active subscriptions', () => {
    for (const status of [
      'cancelled',
      'expired',
      'past_due',
      'payment_failed',
    ]) {
      expect(
        isStaleCancellationFlag({
          status,
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: past(10 * DAY),
          currentPeriodStart: past(2 * DAY),
          currentPeriodEnd: future(28 * DAY),
        })
      ).toBe(false);
    }
  });

  it('is false when timestamps are missing (cannot prove staleness)', () => {
    expect(
      isStaleCancellationFlag({
        status: 'active',
        cancelAtPeriodEnd: true,
        cancellationRequestedAt: null,
        currentPeriodStart: past(2 * DAY),
      })
    ).toBe(false);

    expect(
      isStaleCancellationFlag({
        status: 'active',
        cancelAtPeriodEnd: true,
        cancellationRequestedAt: past(10 * DAY),
        currentPeriodStart: null,
      })
    ).toBe(false);
  });
});

describe('shouldFinalizeCancellation — persistence catch-up', () => {
  it('is true for an expired cancellation still marked active', () => {
    expect(shouldFinalizeCancellation(cancelledExpired, NOW)).toBe(true);
  });

  it('is false while still paid through', () => {
    expect(shouldFinalizeCancellation(cancelledPaidThrough, NOW)).toBe(false);
  });

  it('is idempotent — false once already terminal', () => {
    // Prevents the lazy /me self-heal and the cron from rewriting the same
    // record (and re-emitting audit events) on every request.
    for (const status of ['cancelled', 'expired']) {
      expect(
        shouldFinalizeCancellation({ ...cancelledExpired, status }, NOW)
      ).toBe(false);
    }
  });

  it('is true for a past_due subscription whose cancellation cutoff passed', () => {
    expect(
      shouldFinalizeCancellation(
        { ...cancelledExpired, status: 'past_due' },
        NOW
      )
    ).toBe(true);
  });

  it('is false for a normal paying subscription', () => {
    expect(shouldFinalizeCancellation(activePaying, NOW)).toBe(false);
  });

  it('never fires for a user who has not cancelled, even past period end', () => {
    // Guarantees the finalizer cannot downgrade a paying customer whose renewal
    // webhook is briefly delayed past currentPeriodEnd.
    const renewalPending = {
      ...activePaying,
      currentPeriodEnd: past(1 * DAY),
    };
    expect(shouldFinalizeCancellation(renewalPending, NOW)).toBe(false);
  });
});
