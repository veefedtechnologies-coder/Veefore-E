/**
 * Subscription Feature — Public Module Entry Point
 *
 * Two responsibilities:
 * 1. Re-exports public service classes, factory functions, models, and types
 *    so callers import from this one path rather than deep-linking into the
 *    feature internals.
 * 2. Exposes `initializeSubscriptionCronJobs()` which must be called once
 *    during server startup to register the five repeatable BullMQ cron jobs
 *    on `subscriptionCronQueue`.
 *
 * Satisfies Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 18.1, 18.8
 */

import logger from '../../config/logger'
import { subscriptionCronQueue, type CronJobType } from '../../queues/subscriptionCronQueue'

// ---------------------------------------------------------------------------
// Re-exports — Services
// ---------------------------------------------------------------------------

export { EntitlementService, getEntitlementService } from './services/EntitlementService'
export { SubscriptionService, getSubscriptionService } from './services/SubscriptionService'
export { AddOnService, getAddOnService } from './services/AddOnService'
export {
  aiCreditMeteringService,
  computeCreditCharge,
  estimateProviderCostInr,
  InsufficientAICreditsError,
} from './services/AICreditMeteringService'

// ---------------------------------------------------------------------------
// Re-exports — Plan Config types and helpers
// ---------------------------------------------------------------------------

export type {
  PlanId,
  BillingCycle,
  VeeGPTTier,
  PlanLimits,
  PlanFeatures,
  PlanPricing,
  PlanConfig,
  AddOnDefinition,
  AddOnType,
  CreditCostMap,
  AICreditFeature,
  DynamicCreditRule,
} from '../../config/plan-config'

export {
  PLAN_CONFIG,
  ADDON_CONFIG,
  CREDIT_COSTS,
  CREDIT_MODEL,
  CREDIT_COST_BUDGET_INR,
  AI_COST_MARGIN_TARGET,
  AUTO_INSIGHT_MONTHLY_CHARGE_CAP,
  getPlanConfig,
  getPlanOrder,
  isValidPlan,
} from '../../config/plan-config'

// ---------------------------------------------------------------------------
// Re-exports — Models
// ---------------------------------------------------------------------------

export { default as SubscriptionModel } from './db/models/SubscriptionModel'
export type { ISubscription, SubscriptionStatus } from './db/models/SubscriptionModel'

export { default as AICreditsModel } from './db/models/AICreditsModel'
export type { IAICredits } from './db/models/AICreditsModel'

// ---------------------------------------------------------------------------
// Cron schedule definitions
// ---------------------------------------------------------------------------

interface CronSchedule {
  jobType: CronJobType
  cron: string
  description: string
}

const CRON_SCHEDULES: CronSchedule[] = [
  {
    jobType: 'daily_expiry_check',
    cron: '0 2 * * *',
    description: '2am daily — mark active subscriptions past currentPeriodEnd as expired',
  },
  {
    jobType: 'grace_period_check',
    cron: '0 3 * * *',
    description: '3am daily — downgrade payment_failed users past grace period to free plan',
  },
  {
    jobType: 'reconciliation',
    cron: '0 4 * * *',
    description: '4am daily — reconcile local subscription state against Cashfree API',
  },
  {
    jobType: 'monthly_quota_reset',
    cron: '0 1 * * *',
    description: '1am daily — reset AI credit counters on billing anniversaries',
  },
  {
    jobType: 'pre_renewal_notifications',
    cron: '0 9 * * *',
    description: '9am daily — email users whose nextBillingDate is 3 days away',
  },
]

// ---------------------------------------------------------------------------
// Initializer
// ---------------------------------------------------------------------------

/**
 * Register all five subscription lifecycle cron jobs as BullMQ repeatable jobs.
 *
 * Safe to call multiple times — BullMQ upserts repeatable jobs by jobId so
 * calling this on every server restart does not accumulate duplicate schedules.
 *
 * No-ops gracefully when `subscriptionCronQueue` is null (Redis unavailable).
 */
export async function initializeSubscriptionCronJobs(): Promise<void> {
  if (!subscriptionCronQueue) {
    logger.warn(
      '[subscription] Redis unavailable — subscription cron jobs NOT scheduled',
      { module: 'subscription', action: 'cron_init' }
    )
    return
  }

  const results: Array<{ jobType: CronJobType; success: boolean; error?: string }> = []

  for (const schedule of CRON_SCHEDULES) {
    try {
      await subscriptionCronQueue.add(
        schedule.jobType,
        {
          type: schedule.jobType,
          triggeredAt: new Date().toISOString(),
        },
        {
          repeat: { pattern: schedule.cron },
          jobId: `cron-${schedule.jobType}`,
        }
      )
      results.push({ jobType: schedule.jobType, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ jobType: schedule.jobType, success: false, error: message })
      logger.error(
        `[subscription] Failed to register cron job: ${schedule.jobType}`,
        err,
        { module: 'subscription', action: 'cron_register', jobType: schedule.jobType, error: message }
      )
    }
  }

  const succeeded = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (failed.length === 0) {
    logger.info(
      `[subscription] All ${succeeded.length} subscription cron jobs registered successfully`,
      { module: 'subscription', action: 'cron_init', count: succeeded.length }
    )
  } else {
    logger.warn(
      `[subscription] Cron init completed with ${failed.length} failure(s) — ${succeeded.length}/${results.length} jobs registered`,
      {
        module: 'subscription',
        action: 'cron_init',
        succeeded: succeeded.map((r) => r.jobType),
        failed: failed.map((r) => ({ jobType: r.jobType, error: r.error })),
      }
    )
  }
}
