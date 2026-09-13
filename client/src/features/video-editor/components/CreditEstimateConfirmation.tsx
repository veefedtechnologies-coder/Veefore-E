/**
 * CreditEstimateConfirmation — the credit-estimate confirmation UI
 * (task 23.5, Req 17.7–17.9).
 *
 * Before a generative operation executes, the server streams the SERVER-COMPUTED
 * credit estimate on the conversational turn (an `estimate` event, reduced into
 * {@link ConverseTurnState.creditEstimate}). This component presents that
 * estimate and REQUIRES explicit user confirmation before the operation proceeds
 * (Req 17.7). It never computes or trusts a client-side cost — every figure is
 * the server's (Req 17.6).
 *
 * It also renders the two adjacent terminal outcomes the estimate carries:
 *   - a 300 s confirmation countdown that auto-cancels on expiry with no
 *     provider call and no deduction (Req 17.8); and
 *   - a blocked state (balance can't cover the estimate) that presents an
 *     upgrade/add-credit path instead of a confirm action (Req 17.9).
 *
 * Presentational + self-contained: the confirmation lifecycle lives in the pure
 * reducer; this component only reflects the current status and relays the user's
 * confirm/decline/expiry decisions back through the streaming hook.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Coins, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  confirmationRemainingMs,
  isConfirmationExpired,
  formatCredits,
  formatSeconds,
  type CreditEstimateState,
} from '../utils/creditEstimate';

interface CreditEstimateConfirmationProps {
  estimate: CreditEstimateState;
  /** Confirm the estimate — the generative operation proceeds (Req 17.7). */
  onConfirm: () => void;
  /** Decline the estimate — cancel with no provider call/deduction (Req 17.8). */
  onDecline: () => void;
  /** The 300 s window elapsed — cancel with no provider call (Req 17.8). */
  onExpire: () => void;
  /**
   * Whether credit-consuming actions are permitted (Req 1.5). When false the
   * confirm control is disabled even for an affordable estimate.
   */
  canConsumeCredits?: boolean;
}

/** Human label for an upgrade/add-credit action key. */
function actionLabel(action: string): string {
  switch (action) {
    case 'upgrade_plan':
      return 'Upgrade plan';
    case 'add_credits':
      return 'Add credits';
    default:
      return 'View plans';
  }
}

/** Format a remaining-ms countdown as `m:ss`. */
function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CreditEstimateConfirmation({
  estimate,
  onConfirm,
  onDecline,
  onExpire,
  canConsumeCredits = true,
}: CreditEstimateConfirmationProps) {
  const { status, affordability } = estimate;
  const { estimatedCredits, reservationCredits, outputSeconds } = estimate.estimate;

  // A ticking clock drives the countdown + auto-expiry while pending (Req 17.8).
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    if (status !== 'pending') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status !== 'pending') {
      expiredRef.current = false;
      return;
    }
    if (!expiredRef.current && isConfirmationExpired(estimate, now)) {
      expiredRef.current = true;
      onExpire();
    }
  }, [status, estimate, now, onExpire]);

  // ── Resolved outcomes ──────────────────────────────────────────────────────
  if (status === 'confirmed') {
    return (
      <div
        data-testid="video-editor-estimate-confirmed"
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300"
      >
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
        <span>
          Confirmed — applying your edit for {formatCredits(estimatedCredits)} credits.
        </span>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div
        data-testid="video-editor-estimate-declined"
        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
      >
        Cancelled — no credits were charged.
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div
        role="status"
        data-testid="video-editor-estimate-expired"
        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
      >
        Confirmation timed out — the edit was cancelled and no credits were charged.
      </div>
    );
  }

  // ── Blocked: balance can't cover the estimate (Req 17.9) ────────────────────
  if (status === 'blocked') {
    const actions = affordability.upgradePath?.actions?.length
      ? affordability.upgradePath.actions
      : ['upgrade_plan', 'add_credits'];
    return (
      <div
        role="alert"
        data-testid="video-editor-estimate-blocked"
        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/20"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Not enough credits for this edit
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              {affordability.upgradePath?.message ||
                affordability.reason ||
                `This edit needs ${formatCredits(reservationCredits)} credits${
                  affordability.balanceCredits != null
                    ? `, but your balance is ${formatCredits(affordability.balanceCredits)}`
                    : ''
                }.`}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant={action === 'add_credits' ? 'outline' : 'default'}
                  className="h-8 text-xs"
                  data-testid={`video-editor-estimate-action-${action}`}
                  onClick={() => {
                    window.location.href = '/billing';
                  }}
                >
                  {actionLabel(action)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Pending: present the estimate and require confirmation (Req 17.7) ───────
  const remainingMs = confirmationRemainingMs(estimate, now);
  const confirmDisabled = !canConsumeCredits;

  return (
    <div
      role="group"
      aria-label="Confirm credit estimate"
      data-testid="video-editor-estimate-confirm"
      className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-900/20"
    >
      <div className="flex items-start gap-2.5">
        <Coins
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            This edit will use about{' '}
            <span data-testid="video-editor-estimate-credits" className="tabular-nums">
              {formatCredits(estimatedCredits)} credits
            </span>
          </p>
          <p className="mt-0.5 text-xs text-blue-800/80 dark:text-blue-200/80">
            {reservationCredits > estimatedCredits ? (
              <>
                Up to{' '}
                <span className="tabular-nums">{formatCredits(reservationCredits)} credits</span>{' '}
                are reserved before the edit runs and reconciled to actual usage.
              </>
            ) : (
              <>Credits are reserved before the edit runs and reconciled to actual usage.</>
            )}
            {outputSeconds > 0 && (
              <> Based on {formatSeconds(outputSeconds)}s of generated video.</>
            )}
          </p>
          {affordability.balanceCredits != null && (
            <p className="mt-0.5 text-[11px] text-blue-700/70 dark:text-blue-300/70">
              Balance: {formatCredits(affordability.balanceCredits)} credits
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={onConfirm}
                disabled={confirmDisabled}
                data-testid="video-editor-estimate-confirm-button"
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Confirm &amp; run
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={onDecline}
                data-testid="video-editor-estimate-cancel-button"
              >
                Cancel
              </Button>
            </div>
            {/* 300 s confirmation window (Req 17.8). */}
            <span
              className="text-[11px] tabular-nums text-blue-700/70 dark:text-blue-300/70"
              data-testid="video-editor-estimate-countdown"
              aria-hidden="true"
            >
              {formatCountdown(remainingMs)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreditEstimateConfirmation;
