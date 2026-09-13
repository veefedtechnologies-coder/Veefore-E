/**
 * ModalPreviewPage — DEV-ONLY visual harness for every subscription/payment
 * modal. Mounted at /dev/modals. It renders the exact same presentational
 * components the real hosts use (imported, not duplicated), driven by local
 * state and mock data so you can review each variant without triggering real
 * webhooks or payments.
 *
 * This page is gated to non-production builds in AuthenticatedApp's route.
 */

import React, { useState } from 'react';
import {
  PremiumSubscriptionModalView,
  type ClaimedModalEvent,
} from '@/components/subscription/PremiumSubscriptionModalHost';
import { PaymentGraceModalView } from '@/components/subscription/PaymentGraceModalHost';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type PremiumVariant = ClaimedModalEvent | null;

const IN_3_DAYS = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

// Reusable trigger button
function TriggerButton({
  label,
  description,
  onClick,
  accent,
}: {
  label: string;
  description: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <span
        className={cn(
          'mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white',
          accent
        )}
      >
        {label}
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-300">{description}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-300">
        Preview <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export default function ModalPreviewPage() {
  const [premium, setPremium] = useState<PremiumVariant>(null);
  const [graceOpen, setGraceOpen] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<string | null>(null);

  const showPremium = (event: ClaimedModalEvent) => setPremium(event);

  const baseEvent = {
    id: 'preview',
    previousPlan: null,
    newPlan: null,
    credits: null,
    quantity: null,
    addonType: null,
    timestamp: new Date().toISOString(),
  } as const;

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-6 dark:bg-slate-950 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Dev tools</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
          Subscription modal preview
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Trigger every subscription and payment modal here to review its visuals. These render the
          same components used in production, with mock data. Not available in production builds.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Premium welcome (by plan)
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <TriggerButton
              label="Creator"
              accent="bg-blue-600"
              description="Welcome experience shown after a Creator plan activation."
              onClick={() =>
                showPremium({ ...baseEvent, modalType: 'premium_welcome', newPlan: 'creator' })
              }
            />
            <TriggerButton
              label="Pro"
              accent="bg-violet-600"
              description="Welcome experience shown after a Pro plan activation."
              onClick={() =>
                showPremium({ ...baseEvent, modalType: 'premium_welcome', newPlan: 'pro' })
              }
            />
            <TriggerButton
              label="Business"
              accent="bg-amber-600"
              description="Welcome experience shown after a Business plan activation."
              onClick={() =>
                showPremium({ ...baseEvent, modalType: 'premium_welcome', newPlan: 'business' })
              }
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Plan change & credits
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <TriggerButton
              label="Plan change"
              accent="bg-indigo-600"
              description="Confirmation shown after a completed plan change (e.g. Pro → Creator)."
              onClick={() =>
                showPremium({
                  ...baseEvent,
                  modalType: 'plan_change_success',
                  previousPlan: 'pro',
                  newPlan: 'creator',
                })
              }
            />
            <TriggerButton
              label="Credits"
              accent="bg-emerald-600"
              description="Success shown after a webhook-confirmed AI credit pack purchase."
              onClick={() =>
                showPremium({
                  ...baseEvent,
                  modalType: 'credit_purchase_success',
                  credits: 2000,
                  quantity: 1,
                  addonType: 'ai_credits_2000',
                })
              }
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Payment & downgrade
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <TriggerButton
              label="Grace period"
              accent="bg-rose-600"
              description="Payment-failed warning shown during the 3-day renewal grace period."
              onClick={() => setGraceOpen(true)}
            />
            <TriggerButton
              label="Downgrade → lower"
              accent="bg-slate-700"
              description="Confirmation before downgrading to a lower paid tier."
              onClick={() => setDowngradeTarget('creator')}
            />
            <TriggerButton
              label="Downgrade → Free"
              accent="bg-slate-700"
              description="Confirmation before downgrading to the Free plan."
              onClick={() => setDowngradeTarget('free')}
            />
          </div>
        </section>
      </div>

      {/* Premium modal (welcome / plan change / credits) */}
      <PremiumSubscriptionModalView
        event={premium}
        onClose={() => setPremium(null)}
        onNavigate={() => setPremium(null)}
      />

      {/* Grace-period payment-failed modal */}
      <PaymentGraceModalView
        open={graceOpen}
        planName="Pro"
        graceEndsAt={IN_3_DAYS}
        updating={false}
        error={null}
        onUpdate={() => setGraceOpen(false)}
        onDismiss={() => setGraceOpen(false)}
      />

      {/* Downgrade confirmation (mirrors BillingPage) */}
      <Dialog
        open={Boolean(downgradeTarget)}
        onOpenChange={open => {
          if (!open) setDowngradeTarget(null);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden border-0 p-0 sm:max-w-md sm:rounded-2xl">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 pb-9 pt-11 text-center text-white">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="relative">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <AlertCircle className="h-8 w-8 text-amber-300" />
              </div>
              <DialogTitle className="mt-5 text-2xl font-extrabold tracking-tight">
                {downgradeTarget === 'free'
                  ? 'Downgrade to Free?'
                  : `Switch to ${titleCase(downgradeTarget ?? '')}?`}
              </DialogTitle>
              <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">
                {downgradeTarget === 'free'
                  ? 'You’ll move to the Free plan and lose access to your paid limits, workflows, and AI capacity.'
                  : `You’ll move from Pro down to ${titleCase(downgradeTarget ?? '')}. Some limits and features will be reduced to match the lower plan.`}
              </DialogDescription>
            </div>
          </div>
          <div className="space-y-4 px-8 py-6">
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-50 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <span>Pro</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
              <span className="text-slate-900 dark:text-white">
                {titleCase(downgradeTarget ?? '')}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => setDowngradeTarget(null)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Confirm downgrade
              </button>
              <button
                type="button"
                onClick={() => setDowngradeTarget(null)}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Pro
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
