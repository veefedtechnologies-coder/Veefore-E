/**
 * Pure decision helpers for voluntary-cancellation access control.
 *
 * The rules these encode were previously duplicated as inline boolean
 * expressions in EntitlementService.getPlan / .getEffectiveLimits,
 * subscription.controller.getSubscriptionMe and the cron finalizer. Four copies
 * of a money-affecting predicate is a drift hazard — if one copy is edited the
 * others silently disagree about whether a user still has paid access.
 *
 * Product rules (no grace period):
 *  - Cancelling sets `cancelAtPeriodEnd = true` and stops the Razorpay mandate.
 *  - Access is retained in full until `currentPeriodEnd`.
 *  - At `currentPeriodEnd` the user drops to Free immediately.
 *
 * All functions are pure and side-effect free so they can be exhaustively
 * tested without a database.
 */

/** The minimal shape these predicates need from a subscription document. */
export interface CancellationState {
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancellationRequestedAt?: Date | null;
}

/** Statuses that are already final — no further lifecycle work applies. */
const TERMINAL_STATUSES = new Set(['cancelled', 'expired']);

/**
 * True when a cancellation has been scheduled AND the paid-through date has
 * passed. The user must be treated as Free from this instant, with no grace.
 */
export function isCancellationExpired(
  subscription: CancellationState | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription?.cancelAtPeriodEnd) return false;
  const end = subscription.currentPeriodEnd;
  if (end == null) return false;
  return end <= now;
}

/**
 * True when a cancellation is scheduled but the user is still inside the period
 * they already paid for — they keep FULL plan access until the cutoff.
 */
export function isCancellationPaidThrough<T extends CancellationState>(
  subscription: T | null | undefined,
  now: Date = new Date()
): subscription is T & { currentPeriodEnd: Date } {
  if (!subscription?.cancelAtPeriodEnd) return false;
  const end = subscription.currentPeriodEnd;
  if (end == null) return false;
  return end > now;
}

/**
 * True when an ACTIVE subscription carries a `cancelAtPeriodEnd` flag that
 * provably belongs to a previous billing period.
 *
 * This happens when a user cancels one plan and then upgrades: the upgrade
 * starts a fresh period, but the old cancellation flag was left behind, making a
 * live paying subscription report itself as "cancelled" (and risking a wrongful
 * downgrade by the expiry cron). A cancellation requested strictly BEFORE the
 * current period began cannot apply to the current period.
 */
export function isStaleCancellationFlag<T extends CancellationState>(
  subscription: T | null | undefined
): subscription is T {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  if (!subscription.cancelAtPeriodEnd) return false;

  const requestedAt = subscription.cancellationRequestedAt;
  const periodStart = subscription.currentPeriodStart;
  if (requestedAt == null || periodStart == null) return false;

  return requestedAt < periodStart;
}

/**
 * True when an expired cancellation still needs to be written down to its
 * terminal state (`status: 'cancelled'`, `plan: 'free'`).
 *
 * Access is already correctly denied by `isCancellationExpired` regardless; this
 * only drives the persistence catch-up performed by the daily cron and the lazy
 * self-heal on `/me`. Idempotent: once the status is terminal it returns false.
 */
export function shouldFinalizeCancellation<T extends CancellationState>(
  subscription: T | null | undefined,
  now: Date = new Date()
): subscription is T {
  if (!isCancellationExpired(subscription, now)) return false;
  const status = subscription?.status ?? '';
  return !TERMINAL_STATUSES.has(status);
}
