/**
 * PremiumSubscriptionModalHost
 *
 * A single, app-wide host that surfaces beautiful, graphical modals after a
 * *completed* subscription lifecycle event — a genuine purchase/activation, a
 * completed plan change, or a webhook-confirmed AI credit-pack purchase.
 *
 * How "show once, never on renewals" is guaranteed
 * -------------------------------------------------
 * All eligibility lives on the SERVER, not in the browser:
 *   - The webhook/service writers attach a `modalType` ONLY to completed,
 *     one-off events (`subscription.activated`, `subscription.downgraded`
 *     immediate, `addon.credit_pack_purchased`). Recurring renewals
 *     (`subscription.charged`), `subscription.created`, upgrade-initiated, and
 *     scheduled-downgrade intents never receive a `modalType`.
 *   - This host calls `POST /api/v2/subscription/events/claim-next`, which
 *     LEASES the oldest eligible event (stamps `modalClaimedAt`) and returns
 *     it. The event is only PERMANENTLY consumed once this host confirms it was
 *     shown by calling `POST .../events/:id/ack` (stamps `modalAckedAt`).
 *   - If this host crashes / times out / hard-reloads before acknowledging, the
 *     server lease expires and the event is offered again on the next visit —
 *     so an event is never silently burned by a claim that never rendered.
 *   - While a modal stays open, the host heartbeats the lease (ack `renew`) so
 *     another visible tab can never steal and re-show the same event.
 *   - Every genuine repurchase (including after a cancellation and a long gap)
 *     is a brand-new event document with its own id, so it surfaces again.
 *
 * Because only *future* events are ever written with a `modalType`, deploying
 * this never floods existing users with modals for historical activity.
 *
 * The host claims one event at a time and drains the queue as each modal is
 * dismissed, so a user returning after several events sees them in order.
 */

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { SUBSCRIPTION_QUERY_KEY } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  Coins,
  Crown,
  Rocket,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror the server's claim-next response)
// ---------------------------------------------------------------------------

type ModalType = 'premium_welcome' | 'plan_change_success' | 'credit_purchase_success';

interface ClaimedModalEvent {
  id: string;
  modalType: ModalType;
  previousPlan: string | null;
  newPlan: string | null;
  credits: number | null;
  quantity: number | null;
  addonType: string | null;
  timestamp: string;
}

interface ClaimResponse {
  event: ClaimedModalEvent | null;
}

// ---------------------------------------------------------------------------
// Lightweight event bus — lets a checkout flow nudge the host to poll harder
// right after Razorpay reports success, because the confirming webhook is
// asynchronous and may land a few seconds later.
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Ask the global modal host to start polling for a freshly-confirmed event.
 * Safe to call from anywhere (billing/credits pages) after a checkout success
 * callback — it never shows anything itself; the webhook remains authoritative.
 */
export function nudgePremiumModalPoll(): void {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      /* no-op */
    }
  });
}

function subscribeToPollNudges(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Plan visual config
// ---------------------------------------------------------------------------

interface PlanVisual {
  name: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Gradient used for the header banner + icon halo. */
  gradient: string;
  /** Solid accent used for the primary button. */
  button: string;
  /** Two or three "what you just unlocked" highlights. */
  perks: Array<{ icon: React.ComponentType<{ className?: string }>; label: string }>;
}

const PLAN_VISUALS: Record<string, PlanVisual> = {
  creator: {
    name: 'Creator',
    tagline: 'Your creative studio just leveled up.',
    icon: Rocket,
    gradient: 'from-sky-500 via-blue-500 to-indigo-500',
    button: 'bg-blue-600 hover:bg-blue-700',
    perks: [
      { icon: Sparkles, label: '500 AI credits with full VeeGPT' },
      { icon: Users, label: '2 workspaces and 15 social profiles' },
      { icon: Workflow, label: '5 workflows and automated engagement' },
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'Data-driven growth is now switched on.',
    icon: Sparkles,
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    button: 'bg-violet-600 hover:bg-violet-700',
    perks: [
      { icon: Zap, label: '2,000 AI credits and advanced VeeGPT' },
      { icon: BarChart3, label: 'Custom dashboards and advanced reports' },
      { icon: Workflow, label: 'Unlimited workflows and smart journeys' },
    ],
  },
  business: {
    name: 'Business',
    tagline: 'Enterprise-grade control for your whole team.',
    icon: Building2,
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    button: 'bg-amber-600 hover:bg-amber-700',
    perks: [
      { icon: Zap, label: '5,000 AI credits every month' },
      { icon: Users, label: '20 workspaces and 20 team members' },
      { icon: BarChart3, label: 'White-label and client reporting' },
    ],
  },
};

const FALLBACK_VISUAL: PlanVisual = {
  name: 'Premium',
  tagline: 'Your new plan is ready to go.',
  icon: Crown,
  gradient: 'from-blue-500 via-indigo-500 to-violet-500',
  button: 'bg-blue-600 hover:bg-blue-700',
  perks: [
    { icon: Sparkles, label: 'More AI credits and capacity' },
    { icon: Workflow, label: 'Advanced automation and analytics' },
  ],
};

function visualFor(plan: string | null): PlanVisual {
  if (plan && PLAN_VISUALS[plan]) return PLAN_VISUALS[plan];
  return FALLBACK_VISUAL;
}

// ---------------------------------------------------------------------------
// Decorative confetti-ish sparkle field (pure CSS, respects reduced motion)
// ---------------------------------------------------------------------------

function SparkleField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
    >
      <div className="absolute -left-6 top-6 h-24 w-24 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute right-4 top-2 h-16 w-16 rounded-full bg-white/20 blur-xl" />
      <div className="absolute bottom-0 left-1/3 h-20 w-20 rounded-full bg-white/15 blur-2xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal body renderers
// ---------------------------------------------------------------------------

function PremiumWelcomeBody({
  event,
  onPrimary,
  onClose,
}: {
  event: ClaimedModalEvent;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const visual = visualFor(event.newPlan);
  const Icon = visual.icon;

  return (
    <>
      <div
        className={cn(
          'relative overflow-hidden bg-gradient-to-br px-8 pb-10 pt-12 text-center text-white',
          visual.gradient
        )}
      >
        <SparkleField />
        <div className="relative">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/15 shadow-lg ring-1 ring-white/30 backdrop-blur">
            <Icon className="h-10 w-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-white/80">
            Welcome to {visual.name}
          </p>
          <DialogTitle className="mt-2 text-3xl font-extrabold tracking-tight">
            You&apos;re all set 🎉
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/90">
            {visual.tagline}
          </DialogDescription>
        </div>
      </div>

      <div className="space-y-4 px-8 py-7">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Here&apos;s what you just unlocked
        </p>
        <ul className="space-y-3">
          {visual.perks.map(perk => {
            const PerkIcon = perk.icon;
            return (
              <li key={perk.label} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <PerkIcon className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-200">{perk.label}</span>
                <Check className="ml-auto h-4 w-4 text-emerald-500" />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onPrimary}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition',
              visual.button
            )}
          >
            Start creating
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Explore later
          </button>
        </div>
      </div>
    </>
  );
}

function PlanChangeBody({ event, onClose }: { event: ClaimedModalEvent; onClose: () => void }) {
  const visual = visualFor(event.newPlan);
  const Icon = visual.icon;

  return (
    <>
      <div
        className={cn(
          'relative overflow-hidden bg-gradient-to-br px-8 pb-10 pt-12 text-center text-white',
          visual.gradient
        )}
      >
        <SparkleField />
        <div className="relative">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/15 shadow-lg ring-1 ring-white/30 backdrop-blur">
            <Icon className="h-10 w-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-white/80">
            Plan updated
          </p>
          <DialogTitle className="mt-2 text-3xl font-extrabold tracking-tight">
            You&apos;re now on {visual.name}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/90">
            Your plan change is active and your limits have been updated.
          </DialogDescription>
        </div>
      </div>

      <div className="space-y-4 px-8 py-7">
        {event.previousPlan && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-50 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="capitalize">{event.previousPlan}</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="capitalize text-slate-900 dark:text-white">{visual.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition',
            visual.button
          )}
        >
          Got it
        </button>
      </div>
    </>
  );
}

function CreditSuccessBody({
  event,
  onPrimary,
  onClose,
}: {
  event: ClaimedModalEvent;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const credits = event.credits ?? 0;

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-8 pb-10 pt-12 text-center text-white">
        <SparkleField />
        <div className="relative">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/15 shadow-lg ring-1 ring-white/30 backdrop-blur">
            <Coins className="h-10 w-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-white/80">
            Payment confirmed
          </p>
          <DialogTitle className="mt-2 text-3xl font-extrabold tracking-tight">
            {credits > 0 ? `${credits.toLocaleString('en-IN')} credits added` : 'Credits added'}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/90">
            Your AI credits are in your balance and ready to use right now.
          </DialogDescription>
        </div>
      </div>

      <div className="space-y-4 px-8 py-7">
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <Bot className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Spend them on VeeGPT, captions, images, videos, and every other AI feature.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onPrimary}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            Open VeeGPT
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

// sessionStorage key holding a claimed-but-not-yet-dismissed event. Claiming is
// atomic and irreversible on the server, so if the host remounts (e.g. during
// the volatile app boot right after a Razorpay redirect) we'd otherwise "burn"
// the claim without ever showing the modal. Persisting the pending event lets
// it survive remounts and full reloads until the user actually dismisses it.
const PENDING_KEY = 'vf_pending_premium_modal';

function readPending(): ClaimedModalEvent | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as ClaimedModalEvent) : null;
  } catch {
    return null;
  }
}

function writePending(event: ClaimedModalEvent | null): void {
  try {
    if (event) sessionStorage.setItem(PENDING_KEY, JSON.stringify(event));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function PremiumSubscriptionModalHost() {
  // Restore any claimed-but-unshown event synchronously so a remount right
  // after checkout doesn't lose it.
  const [active, setActive] = React.useState<ClaimedModalEvent | null>(() => readPending());
  const queryClient = useQueryClient();
  // Guards against overlapping claims and re-entrancy across renders.
  const inFlightRef = React.useRef(false);
  // Mirror `active` in a ref so claimNext can read it without being recreated
  // (which would restart the poll intervals on every open/close).
  const activeRef = React.useRef<ClaimedModalEvent | null>(active);
  activeRef.current = active;
  // Short burst of extra polls triggered right after a checkout success.
  const burstRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Acknowledge (permanently consume) or heartbeat (renew) a leased event.
  // Best-effort with a short timeout: a missed ack simply lets the server lease
  // expire, which re-offers the event — never a hard failure for the user.
  const ackEvent = React.useCallback(async (id: string, renew: boolean) => {
    try {
      await Promise.race([
        apiRequest(`/api/v2/subscription/events/${id}/ack`, {
          method: 'POST',
          body: JSON.stringify({ renew }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
      ]);
    } catch {
      /* silent — lease expiry is the backstop */
    }
  }, []);

  const claimNext = React.useCallback(async () => {
    if (inFlightRef.current) return;
    // Hidden/background tabs must never consume a one-time account event before
    // the tab the user is actively viewing. They check immediately when they
    // become visible (see visibilitychange listener below).
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    // Only one modal on screen at a time; the queue drains on close.
    if (activeRef.current) return;
    inFlightRef.current = true;
    try {
      // Call the endpoint directly with a hard timeout so a hung request can
      // never leave the host stuck without settling.
      const res = (await Promise.race([
        apiRequest('/api/v2/subscription/events/claim-next', {
          method: 'POST',
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
      ])) as ClaimResponse;
      if (res?.event) {
        // Persist BEFORE showing so a remount can recover it.
        writePending(res.event);
        setActive(res.event);
        // A completed event usually means limits/credits just changed.
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
        // We found one — stop any success burst so we don't spam the endpoint.
        if (burstRef.current) {
          clearInterval(burstRef.current);
          burstRef.current = null;
        }
      }
    } catch {
      /* silent — this is a background enhancement, never blocks the app */
    } finally {
      inFlightRef.current = false;
    }
  }, [queryClient]);

  // Initial + steady background poll. Kept infrequent because completed events
  // are rare; the burst below covers the moments right after a checkout.
  React.useEffect(() => {
    void claimNext();
    const interval = setInterval(() => void claimNext(), 20_000);
    return () => clearInterval(interval);
  }, [claimNext]);

  // A hidden tab deliberately skips claims. Retry as soon as it becomes the
  // foreground tab so the user does not have to wait for the steady interval.
  // This is independent of the interval and checkout burst, so neither polling
  // mechanism is restarted or duplicated when visibility changes.
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void claimNext();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [claimNext]);

  // React to checkout-success nudges with a short, faster burst so the modal
  // appears within a few seconds of the confirming webhook landing.
  React.useEffect(() => {
    return subscribeToPollNudges(() => {
      if (burstRef.current) return;
      const startedAt = Date.now();
      void claimNext();
      burstRef.current = setInterval(() => {
        if (Date.now() - startedAt > 45_000) {
          if (burstRef.current) {
            clearInterval(burstRef.current);
            burstRef.current = null;
          }
          return;
        }
        void claimNext();
      }, 3_000);
    });
  }, [claimNext]);

  React.useEffect(() => {
    return () => {
      if (burstRef.current) clearInterval(burstRef.current);
    };
  }, []);

  // Heartbeat the lease while a modal is on screen so a long-open modal is never
  // re-claimed by another visible tab. Renews well within the server lease
  // window (3 min); the effect stops automatically when the modal closes.
  React.useEffect(() => {
    if (!active) return;
    const id = active.id;
    const interval = setInterval(() => void ackEvent(id, true), 90_000);
    return () => clearInterval(interval);
  }, [active, ackEvent]);

  const handleClose = React.useCallback(() => {
    const closing = activeRef.current;
    // Only now is the modal considered "seen" — clear the persisted copy.
    writePending(null);
    setActive(null);
    // Permanently acknowledge the leased event so it is never offered again.
    // This is the second half of the lease-and-ack protocol; until it lands the
    // event is only leased, so a crash before this point recovers the event.
    if (closing) {
      void ackEvent(closing.id, false);
    }
    // Drain any further queued events shortly after this one closes.
    setTimeout(() => void claimNext(), 350);
  }, [claimNext]);

  const navigate = React.useCallback(
    (path: string) => {
      handleClose();
      window.location.assign(path);
    },
    [handleClose]
  );

  return (
    <PremiumSubscriptionModalView event={active} onClose={handleClose} onNavigate={navigate} />
  );
}

// ---------------------------------------------------------------------------
// Presentational view — pure UI, no data fetching. Exported so the dev modal
// preview can render every variant with mock data (identical visuals).
// ---------------------------------------------------------------------------

export function PremiumSubscriptionModalView({
  event,
  onClose,
  onNavigate,
}: {
  event: ClaimedModalEvent | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  if (!event) return null;

  return (
    <Dialog
      open={Boolean(event)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="overflow-hidden gap-0 border-0 p-0 sm:max-w-md sm:rounded-2xl"
        // This modal opens programmatically (right after checkout / on boot),
        // so we block Radix's automatic dismissal on outside-click / escape /
        // focus churn — those were closing it the instant it opened and
        // "burning" the one-time event. It closes only via its own buttons.
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onFocusOutside={e => e.preventDefault()}
      >
        {event.modalType === 'premium_welcome' && (
          <PremiumWelcomeBody
            event={event}
            onPrimary={() => onNavigate('/veegpt')}
            onClose={onClose}
          />
        )}
        {event.modalType === 'plan_change_success' && (
          <PlanChangeBody event={event} onClose={onClose} />
        )}
        {event.modalType === 'credit_purchase_success' && (
          <CreditSuccessBody
            event={event}
            onPrimary={() => onNavigate('/veegpt')}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { ClaimedModalEvent };

export default PremiumSubscriptionModalHost;
