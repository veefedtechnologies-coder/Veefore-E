/**
 * PaymentGraceModalHost
 *
 * A STATE-DRIVEN modal (deliberately not claim-once, unlike
 * PremiumSubscriptionModalHost) that warns a user whose recurring charge has
 * failed and is now in the renewal-failure grace period.
 *
 * Behaviour
 * ---------
 *   - Shows whenever the server reports an active `paymentIssue` on
 *     `/api/v2/subscription/me` (status `past_due` / `payment_failed` while
 *     still inside the grace window — paid access is retained until then).
 *   - Reappears on every session and every new retry: dismissal is only
 *     remembered per browser session AND per retry count, so each fresh failed
 *     charge (which bumps `retryCount`) re-surfaces the warning even within the
 *     same session. Once the payment succeeds the server clears `paymentIssue`
 *     and the modal stops appearing entirely.
 *   - Primary action fetches Razorpay's hosted subscription page and sends the
 *     user there to update their card / re-authorize the mandate.
 *   - Secondary action ("Remind me later") dismisses for this session only.
 *
 * It intentionally does NOT block the app — access is still active during the
 * grace period, so this is an urgent nudge rather than a hard gate.
 */

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import useSubscription from '@/hooks/useSubscription';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle, CreditCard, Clock3, Loader2, LifeBuoy } from 'lucide-react';

const SUPPORT_EMAIL = 'support@veefore.com';

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function formatDate(iso: string | null): string {
  if (!iso) return 'soon';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function PaymentGraceModalHost() {
  const { plan, paymentIssue } = useSubscription();
  const [dismissed, setDismissed] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  // A stable key for THIS failure state. Includes retryCount so a subsequent
  // failed charge re-shows the modal even after an in-session dismissal.
  const sessionKey = paymentIssue
    ? `vf_pay_grace_dismissed:${paymentIssue.status}:${paymentIssue.retryCount}:${paymentIssue.graceEndsAt ?? ''}`
    : null;

  // Re-evaluate dismissal whenever the failure state changes.
  React.useEffect(() => {
    if (!sessionKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(sessionKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [sessionKey]);

  const updateLinkMutation = useMutation<{ shortUrl?: string }>({
    mutationFn: () =>
      apiRequest('/api/v2/subscription/payment-update-link', {
        method: 'POST',
      }),
    onSuccess: data => {
      if (data?.shortUrl) {
        window.location.assign(data.shortUrl);
      } else {
        setLinkError('We could not open the payment page. Please try again in a moment.');
      }
    },
    onError: () => {
      setLinkError('We could not open the payment page. Please try again in a moment.');
    },
  });

  const dismiss = () => {
    if (sessionKey) {
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        /* ignore */
      }
    }
    setDismissed(true);
  };

  const open = Boolean(paymentIssue) && !dismissed;
  if (!open || !paymentIssue) return null;

  const planName = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'plan';

  return (
    <PaymentGraceModalView
      open={open}
      planName={planName}
      graceEndsAt={paymentIssue.graceEndsAt}
      updating={updateLinkMutation.isPending}
      error={linkError}
      onUpdate={() => {
        setLinkError(null);
        updateLinkMutation.mutate();
      }}
      onDismiss={dismiss}
    />
  );
}

// ---------------------------------------------------------------------------
// Presentational view — pure UI, no data fetching. Exported so the dev modal
// preview can render it with mock data (identical visuals).
// ---------------------------------------------------------------------------

export function PaymentGraceModalView({
  open,
  planName,
  graceEndsAt,
  updating,
  error,
  onUpdate,
  onDismiss,
}: {
  open: boolean;
  planName: string;
  graceEndsAt: string | null;
  updating: boolean;
  error: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const days = daysUntil(graceEndsAt);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden border-0 p-0 sm:max-w-md sm:rounded-2xl"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onFocusOutside={e => e.preventDefault()}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-red-600 to-orange-600 px-8 pb-9 pt-11 text-center text-white">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <DialogTitle className="mt-5 text-2xl font-extrabold tracking-tight">
              Your payment didn&apos;t go through
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/90">
              We couldn&apos;t process the latest charge for your {planName} plan. Your access is
              still active — please update your payment method to avoid interruption.
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-4 px-8 py-6">
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
            <Clock3 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {days != null && days > 0 ? (
                <>
                  You have{' '}
                  <strong>
                    {days} {days === 1 ? 'day' : 'days'}
                  </strong>{' '}
                  left (until {formatDate(graceEndsAt)}) before your account moves to Free.
                </>
              ) : (
                <>
                  Your grace period ends {formatDate(graceEndsAt)}. Update your payment method now
                  to keep your plan.
                </>
              )}
            </p>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onUpdate}
              disabled={updating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {updating ? 'Opening secure page…' : 'Update payment method'}
            </button>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                'Help with my Veefore payment'
              )}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LifeBuoy className="h-4 w-4" />
              Contact support
            </a>

            <button
              type="button"
              onClick={onDismiss}
              className="mt-0.5 w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Remind me later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentGraceModalHost;
