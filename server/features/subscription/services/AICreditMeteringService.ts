import mongoose, { Schema } from 'mongoose'
import {
  AI_COST_MARGIN_TARGET,
  AUTO_INSIGHT_MONTHLY_CHARGE_CAP,
  CREDIT_COST_BUDGET_INR,
  CREDIT_MODEL,
  type AICreditFeature,
} from '../../../config/plan-config'
import { getRedisClient } from '../../../lib/redis'
import { collectAIUsage, type AIFeature, type AIUsageSample } from '../../../services/aiUsageTracker'
import SubscriptionRepository from '../db/repositories/SubscriptionRepository'
import { AICreditsRepository } from '../db/repositories/AICreditsRepository'
import { getEntitlementService } from './EntitlementService'

interface MeteringContext {
  userId: string
  workspaceId?: string
  idempotencyKey?: string
  automatic?: boolean
  /** Internal: runMetered already reserved the automatic-generation slot. */
  automaticSlotClaimed?: boolean
}

export interface CreditSettlement {
  charged: number
  remaining: number
  skipped?: 'enterprise' | 'monthly_cap' | 'duplicate'
}

interface CreditTransaction {
  userId: string
  workspaceId?: string
  feature: AICreditFeature
  credits: number
  providerCostInr: number
  status: 'pending' | 'settled' | 'failed' | 'skipped' | 'adjusting' | 'refunding' | 'refund_pending' | 'refunded'
  idempotencyKey: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const CreditTransactionSchema = new Schema<CreditTransaction>({
  userId: { type: String, required: true, index: true },
  workspaceId: { type: String, index: true },
  feature: { type: String, required: true, index: true },
  credits: { type: Number, required: true, min: 0 },
  providerCostInr: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'settled', 'failed', 'skipped', 'adjusting', 'refunding', 'refund_pending', 'refunded'], required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true })

const AICreditTransaction =
  (mongoose.models.AICreditTransaction as mongoose.Model<CreditTransaction>) ||
  mongoose.model<CreditTransaction>('AICreditTransaction', CreditTransactionSchema)

interface ModelPrice {
  inputPerMillionInr: number
  outputPerMillionInr: number
}

const MODEL_PRICES: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /gemini.*flash.*lite/i, price: { inputPerMillionInr: 8.4, outputPerMillionInr: 33.6 } },
  { match: /gpt-4o-mini|gpt-4\.1-mini/i, price: { inputPerMillionInr: 12.6, outputPerMillionInr: 50.4 } },
  { match: /gpt-3\.5/i, price: { inputPerMillionInr: 42, outputPerMillionInr: 126 } },
  { match: /gpt-4o|gpt-4\.1/i, price: { inputPerMillionInr: 210, outputPerMillionInr: 840 } },
]

const CONSERVATIVE_FALLBACK_PRICE: ModelPrice = {
  inputPerMillionInr: 210,
  outputPerMillionInr: 840,
}

function roundCredits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function validDate(value: unknown): Date | undefined {
  if (value == null) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Build a standard AbortError from an aborted signal (preserving its reason). */
function makeAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error('Generation cancelled')
  error.name = 'AbortError'
  return error
}

/** A promise that rejects with an AbortError the moment `signal` aborts. */
function abortRejection<T>(signal: AbortSignal): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    if (signal.aborted) {
      reject(makeAbortError(signal))
      return
    }
    signal.addEventListener('abort', () => reject(makeAbortError(signal)), { once: true })
  })
}

function priceForModel(model: string): ModelPrice {
  return MODEL_PRICES.find(({ match }) => match.test(model))?.price ?? CONSERVATIVE_FALLBACK_PRICE
}

export function estimateProviderCostInr(usage: AIUsageSample[]): number {
  return usage.reduce((sum, sample) => {
    const price = priceForModel(sample.model)
    const cached = Math.min(sample.cachedTokens, sample.promptTokens)
    const uncachedPrompt = Math.max(0, sample.promptTokens - cached)
    const inputCost = ((uncachedPrompt + cached * 0.1) / 1_000_000) * price.inputPerMillionInr
    const outputCost = (sample.completionTokens / 1_000_000) * price.outputPerMillionInr
    return sum + inputCost + outputCost
  }, 0)
}

export function computeCreditCharge(
  feature: AICreditFeature,
  usage: AIUsageSample[],
  additionalProviderCostInr = 0,
): { credits: number; providerCostInr: number } {
  const rule = CREDIT_MODEL[feature]
  const providerCostInr = estimateProviderCostInr(usage) + Math.max(0, additionalProviderCostInr)
  if (rule.mode === 'fixed') return { credits: rule.floor, providerCostInr }

  const raw = (providerCostInr * AI_COST_MARGIN_TARGET) / CREDIT_COST_BUDGET_INR
  // Round upward to 0.1 so cost recovery is never weakened by rounding.
  const dynamic = Math.ceil(raw * 10) / 10
  // `ceiling` is the normal pre-call reservation estimate, not permission to
  // undercharge. If measured provider usage exceeds that estimate, recover the
  // profit-safe amount instead of silently clamping below cost.
  return {
    credits: roundCredits(Math.max(rule.floor, dynamic)),
    providerCostInr,
  }
}

export class InsufficientAICreditsError extends Error {
  readonly statusCode = 402
  constructor(readonly required: number, readonly remaining: number) {
    super(`Insufficient AI credits. Required: ${required}, remaining: ${remaining}`)
    this.name = 'InsufficientAICreditsError'
  }
}

export class AutomaticGenerationCapReachedError extends Error {
  readonly statusCode = 429
  constructor(readonly feature: AICreditFeature, readonly workspaceId?: string) {
    super('Automatic AI generation limit reached; serving the last generated result')
    this.name = 'AutomaticGenerationCapReachedError'
  }
}

export class AICreditSettlementPendingError extends Error {
  readonly statusCode = 409
  constructor(readonly idempotencyKey: string) {
    super('AI credit settlement is already in progress')
    this.name = 'AICreditSettlementPendingError'
  }
}

class AICreditMeteringService {
  private readonly redis = getRedisClient()
  private readonly entitlement = getEntitlementService(this.redis, new SubscriptionRepository())

  private async invalidateBalanceCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`sub:me:${userId}`)
    } catch (error) {
      // Cache invalidation must never change whether a debit/refund succeeded.
      console.warn('[AI CREDITS] Balance cache invalidation failed:', error)
    }
  }

  private async recoverPendingRefunds(userId: string): Promise<void> {
    try {
      const pending = await AICreditTransaction.find({ userId, status: 'refund_pending' })
        .select('idempotencyKey')
        .limit(10)
        .lean()
      for (const transaction of pending) {
        await this.refundSettlement(transaction.idempotencyKey).catch((error) => {
          console.error('[AI CREDITS] Pending refund retry failed:', {
            idempotencyKey: transaction.idempotencyKey,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }
    } catch (error) {
      console.error('[AI CREDITS] Unable to inspect pending refunds:', error)
    }
  }

  async ensureCreditAccount(userId: string): Promise<number> {
    const plan = await this.entitlement.getPlan(userId)
    if (plan === 'enterprise') return Infinity
    await this.recoverPendingRefunds(userId)
    const doc = await this.entitlement.ensureCreditAccount(userId)
    return roundCredits(doc?.remainingCredits ?? 0)
  }

  async getPlan(userId: string) {
    return this.entitlement.getPlan(userId)
  }

  async assertCanAfford(userId: string, feature: AICreditFeature): Promise<number> {
    const remaining = await this.ensureCreditAccount(userId)
    const required = CREDIT_MODEL[feature].ceiling
    if (remaining !== Infinity && remaining < required) {
      throw new InsufficientAICreditsError(required, remaining)
    }
    return remaining
  }

  private automaticCapKey(feature: AICreditFeature, workspaceId: string): string {
    const month = new Date().toISOString().slice(0, 7)
    return `sub:ai:auto:${feature}:${workspaceId}:${month}`
  }

  private automaticClaimKey(
    feature: AICreditFeature,
    workspaceId: string,
    idempotencyKey: string,
  ): string {
    return `${this.automaticCapKey(feature, workspaceId)}:claim:${idempotencyKey}`
  }

  /** Reserve a monthly automatic-generation slot before any provider call. */
  private async claimAutomaticSlot(
    feature: AICreditFeature,
    workspaceId: string | undefined,
    idempotencyKey: string,
  ): Promise<{ allowed: boolean; newlyClaimed: boolean }> {
    if (!workspaceId) return { allowed: true, newlyClaimed: false }

    const countKey = this.automaticCapKey(feature, workspaceId)
    const claimKey = this.automaticClaimKey(feature, workspaceId, idempotencyKey)
    const ttlSeconds = 35 * 24 * 60 * 60

    // A retry of the same job reuses its existing claim and never consumes a
    // second slot. The marker lives through the billing month.
    const acquired = await this.redis.set(claimKey, '1', 'EX', ttlSeconds, 'NX')
    if (acquired !== 'OK') return { allowed: true, newlyClaimed: false }

    const count = await this.redis.incr(countKey)
    if (count === 1) await this.redis.expire(countKey, ttlSeconds)
    if (count > AUTO_INSIGHT_MONTHLY_CHARGE_CAP) {
      await Promise.all([this.redis.decr(countKey), this.redis.del(claimKey)])
      return { allowed: false, newlyClaimed: false }
    }
    return { allowed: true, newlyClaimed: true }
  }

  /** Release a newly claimed slot when generation or settlement fails. */
  private async releaseAutomaticSlot(
    feature: AICreditFeature,
    workspaceId: string | undefined,
    idempotencyKey: string,
  ): Promise<void> {
    if (!workspaceId) return
    const claimKey = this.automaticClaimKey(feature, workspaceId, idempotencyKey)
    const removed = await this.redis.del(claimKey)
    if (removed > 0) {
      const countKey = this.automaticCapKey(feature, workspaceId)
      const count = await this.redis.decr(countKey)
      if (count < 0) await this.redis.set(countKey, '0', 'EX', 35 * 24 * 60 * 60)
    }
  }

  private async compensateDebitedTransaction(
    idempotencyKey: string,
    userId: string,
    credits: number,
    debitVersion: number,
    debitAt: Date,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.applyIdempotentRefund(
        userId,
        credits,
        `${idempotencyKey}:full-refund:v${debitVersion}`,
        debitAt,
      )
      await AICreditTransaction.updateOne(
        { idempotencyKey },
        {
          $set: {
            status: 'refunded',
            'metadata.balanceDebited': false,
            'metadata.refundReason': cause instanceof Error ? cause.message : String(cause),
          },
        },
      ).catch((ledgerError) => {
        console.error('[AI CREDITS] Balance refunded but ledger finalization failed:', ledgerError)
      })
      await this.invalidateBalanceCache(userId)
    } catch (refundError) {
      await AICreditTransaction.updateOne(
        { idempotencyKey },
        {
          $set: {
            status: 'refund_pending',
            'metadata.balanceDebited': true,
            'metadata.refundReason': cause instanceof Error ? cause.message : String(cause),
            'metadata.refundError': refundError instanceof Error ? refundError.message : String(refundError),
          },
        },
      ).catch(() => undefined)
      throw new Error(
        `AI action failed and its credit refund is pending: ${refundError instanceof Error ? refundError.message : String(refundError)}`,
      )
    }
  }

  async settleCredits(
    feature: AICreditFeature,
    ctx: MeteringContext,
    usage: AIUsageSample[] = [],
    additionalProviderCostInr = 0,
    creditsOverride?: number,
  ): Promise<CreditSettlement> {
    const idempotencyKey = ctx.idempotencyKey ??
      `${feature}:${ctx.userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    let automaticClaimWasNew = false

    if (ctx.automatic && !ctx.automaticSlotClaimed) {
      const claim = await this.claimAutomaticSlot(feature, ctx.workspaceId, idempotencyKey)
      if (!claim.allowed) {
        return {
          charged: 0,
          remaining: await this.entitlement.remainingCredits(ctx.userId),
          skipped: 'monthly_cap',
        }
      }
      automaticClaimWasNew = claim.newlyClaimed
    }

    let debitedAmount = 0
    let debitVersion = 1
    let debitAt = new Date()
    try {
      const plan = await this.entitlement.getPlan(ctx.userId)
      if (plan === 'enterprise') return { charged: 0, remaining: Infinity, skipped: 'enterprise' }

      await this.ensureCreditAccount(ctx.userId)
      const computed = computeCreditCharge(feature, usage, additionalProviderCostInr)
      const credits = roundCredits(creditsOverride ?? computed.credits)
      const providerCostInr = computed.providerCostInr

      try {
        await AICreditTransaction.create({
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          feature,
          credits,
          providerCostInr,
          status: 'pending',
          idempotencyKey,
          metadata: {
            usageCalls: usage.length,
            automatic: ctx.automatic === true,
            balanceDebited: false,
            debitVersion,
            debitAt,
            reservationDebitKey: `${idempotencyKey}:reservation:v${debitVersion}`,
          },
        })
      } catch (error: any) {
        if (error?.code !== 11000) throw error

        const existing = await AICreditTransaction.findOne({ idempotencyKey }).lean()
        if (existing?.status === 'settled') {
          return {
            charged: existing.credits,
            remaining: await this.entitlement.remainingCredits(ctx.userId),
            skipped: 'duplicate',
          }
        }

        // A known failed deduction can be retried after credits are added. A
        // refunded provider attempt gets a new debit version so a later failure
        // can apply a distinct idempotent refund without being mistaken for the
        // already-applied refund from the earlier attempt.
        if (existing?.status === 'failed' || existing?.status === 'refunded') {
          const previousVersion = Number(existing.metadata?.debitVersion) || 1
          debitVersion = existing.status === 'refunded' ? previousVersion + 1 : previousVersion
          debitAt = new Date()
          const reclaimed = await AICreditTransaction.updateOne(
            { idempotencyKey, status: existing.status },
            {
              $set: {
                status: 'pending',
                credits,
                providerCostInr,
                metadata: {
                  usageCalls: usage.length,
                  automatic: ctx.automatic === true,
                  balanceDebited: false,
                  debitVersion,
                  debitAt,
                  reservationDebitKey: `${idempotencyKey}:reservation:v${debitVersion}`,
                },
              },
            },
          )
          if (reclaimed.modifiedCount !== 1) {
            throw new AICreditSettlementPendingError(idempotencyKey)
          }
        } else {
          throw new AICreditSettlementPendingError(idempotencyKey)
        }
      }

      const reservationDebitKey = `${idempotencyKey}:reservation:v${debitVersion}`
      let result
      try {
        result = await this.entitlement.deductCredits(
          ctx.userId,
          credits,
          reservationDebitKey,
        )
      } catch (debitError) {
        // A network error can make the debit response uncertain even though
        // MongoDB committed it. Move to recoverable compensation and let the
        // idempotent debit/refund keys determine whether money must be restored.
        await AICreditTransaction.updateOne(
          { idempotencyKey, status: 'pending' },
          {
            $set: {
              status: 'refund_pending',
              'metadata.debitUncertain': true,
              'metadata.refundReason': debitError instanceof Error ? debitError.message : String(debitError),
            },
          },
        ).catch(() => undefined)
        try {
          await this.refundSettlement(idempotencyKey)
        } catch (refundError) {
          throw new Error(
            `AI credit reservation response was uncertain; refund recovery is pending. ${refundError instanceof Error ? refundError.message : String(refundError)}`,
          )
        }
        throw debitError
      }
      if (!result.success) {
        await AICreditTransaction.updateOne({ idempotencyKey }, { $set: { status: 'failed' } })
        throw new InsufficientAICreditsError(credits, result.remaining)
      }
      debitedAmount = credits

      const finalized = await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'pending' },
        {
          $set: {
            status: 'settled',
            'metadata.balanceDebited': true,
          },
        },
      )
      if (finalized.modifiedCount !== 1) {
        throw new Error('Unable to finalize AI credit reservation after debit')
      }

      debitedAmount = 0
      await this.invalidateBalanceCache(ctx.userId)
      return { charged: credits, remaining: roundCredits(result.remaining) }
    } catch (error) {
      let finalError = error
      if (debitedAmount > 0) {
        try {
          await this.compensateDebitedTransaction(
            idempotencyKey,
            ctx.userId,
            debitedAmount,
            debitVersion,
            debitAt,
            error,
          )
        } catch (refundError) {
          finalError = refundError
        }
      }
      if (automaticClaimWasNew) {
        await this.releaseAutomaticSlot(feature, ctx.workspaceId, idempotencyKey).catch(() => undefined)
      }
      throw finalError
    }
  }

  private async applyIdempotentRefund(
    userId: string,
    amount: number,
    refundKey: string,
    debitAt?: Date,
  ) {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const refunded = await new AICreditsRepository().refundCredits(
          userId,
          amount,
          refundKey,
          debitAt,
        )
        if (!refunded) throw new Error('AI credit account unavailable during refund')
        return refunded
      } catch (error) {
        lastError = error
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  /** Settle a pre-call ceiling reservation to the measured dynamic charge. */
  private async adjustReservation(
    idempotencyKey: string,
    desiredCredits: number,
    providerCostInr: number,
    usageCalls: number,
  ): Promise<CreditSettlement> {
    const transaction = await AICreditTransaction.findOne({ idempotencyKey }).lean()
    if (!transaction || transaction.status !== 'settled') {
      throw new AICreditSettlementPendingError(idempotencyKey)
    }

    const desired = roundCredits(desiredCredits)
    const difference = roundCredits(transaction.credits - desired)
    let remaining = await this.entitlement.remainingCredits(transaction.userId)

    if (difference > 0) {
      const debitVersion = Number(transaction.metadata?.debitVersion) || 1
      const adjustmentRefundKey = `${idempotencyKey}:measured-adjustment:v${debitVersion}`
      const claimed = await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'settled', credits: transaction.credits },
        {
          $set: {
            status: 'adjusting',
            'metadata.adjustmentCredits': desired,
            'metadata.adjustmentRefund': difference,
            'metadata.adjustmentRefundKey': adjustmentRefundKey,
          },
        },
      )
      if (claimed.modifiedCount !== 1) throw new AICreditSettlementPendingError(idempotencyKey)

      const refunded = await this.applyIdempotentRefund(
        transaction.userId,
        difference,
        adjustmentRefundKey,
        validDate(transaction.metadata?.debitAt) ?? validDate(transaction.createdAt),
      )
      remaining = refunded.remainingCredits

      // Finalization is required because downstream compensation must know
      // whether to refund the measured amount or the original reservation.
      const finalized = await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'adjusting' },
        {
          $set: {
            status: 'settled',
            credits: desired,
            providerCostInr,
            'metadata.usageCalls': usageCalls,
            'metadata.balanceDebited': true,
          },
        },
      )
      if (finalized.modifiedCount !== 1) {
        const current = await AICreditTransaction.findOne({ idempotencyKey }).lean()
        if (current?.status !== 'settled' || current.credits !== desired) {
          throw new AICreditSettlementPendingError(idempotencyKey)
        }
      }
    } else if (difference < 0) {
      // Provider usage unexpectedly exceeded the normal reservation estimate.
      // Record an idempotent overage intent before debiting so any interrupted
      // finalization can still refund the complete retained amount.
      const extra = Math.abs(difference)
      const debitVersion = Number(transaction.metadata?.debitVersion) || 1
      const overageDebitKey = `${idempotencyKey}:overage:v${debitVersion}`
      const claimed = await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'settled', credits: transaction.credits },
        {
          $set: {
            status: 'adjusting',
            'metadata.overageBaseCredits': transaction.credits,
            'metadata.overageCredits': extra,
            'metadata.overageDebitKey': overageDebitKey,
          },
        },
      )
      if (claimed.modifiedCount !== 1) throw new AICreditSettlementPendingError(idempotencyKey)

      const result = await this.entitlement.deductCredits(
        transaction.userId,
        extra,
        overageDebitKey,
      )
      if (!result.success) {
        await AICreditTransaction.updateOne(
          { idempotencyKey, status: 'adjusting' },
          { $set: { status: 'settled' } },
        ).catch(() => undefined)
        throw new InsufficientAICreditsError(extra, result.remaining)
      }
      remaining = result.remaining
      const finalized = await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'adjusting' },
        {
          $set: {
            status: 'settled',
            credits: desired,
            providerCostInr,
            'metadata.usageCalls': usageCalls,
            'metadata.balanceDebited': true,
          },
        },
      )
      if (finalized.modifiedCount !== 1) {
        const current = await AICreditTransaction.findOne({ idempotencyKey }).lean()
        if (current?.status !== 'settled' || current.credits !== desired) {
          throw new AICreditSettlementPendingError(idempotencyKey)
        }
      }
    } else {
      await AICreditTransaction.updateOne(
        { idempotencyKey, status: 'settled' },
        {
          $set: {
            providerCostInr,
            'metadata.usageCalls': usageCalls,
            'metadata.balanceDebited': true,
          },
        },
      ).catch((error) => {
        console.error('[AI CREDITS] Settlement usage update failed:', error)
      })
    }

    await this.invalidateBalanceCache(transaction.userId)
    return { charged: desired, remaining: roundCredits(remaining) }
  }

  /** Refund one settled reservation exactly once when an action fails. */
  async refundSettlement(idempotencyKey: string): Promise<void> {
    const transaction = await AICreditTransaction.findOneAndUpdate(
      { idempotencyKey, status: { $in: ['pending', 'settled', 'adjusting', 'refund_pending', 'refunding'] } },
      { $set: { status: 'refunding' } },
      { new: true },
    ).lean()

    if (!transaction) {
      const existing = await AICreditTransaction.findOne({ idempotencyKey }).lean()
      if (existing?.status === 'refunded') return
      throw new AICreditSettlementPendingError(idempotencyKey)
    }

    try {
      const debitVersion = Number(transaction.metadata?.debitVersion) || 1
      const reservationDebitKey = typeof transaction.metadata?.reservationDebitKey === 'string'
        ? transaction.metadata.reservationDebitKey
        : undefined
      const reservationApplied = !reservationDebitKey ||
        await new AICreditsRepository().hasAppliedDebitKey(transaction.userId, reservationDebitKey)
      let refundAmount = reservationApplied ? transaction.credits : 0
      const adjustmentRefundKey = typeof transaction.metadata?.adjustmentRefundKey === 'string'
        ? transaction.metadata.adjustmentRefundKey
        : undefined
      const adjustmentCredits = Number(transaction.metadata?.adjustmentCredits)
      if (
        refundAmount > 0 &&
        adjustmentRefundKey &&
        Number.isFinite(adjustmentCredits) &&
        adjustmentCredits >= 0 &&
        await new AICreditsRepository().hasAppliedRefundKey(transaction.userId, adjustmentRefundKey)
      ) {
        // The ceiling-to-measured partial refund already committed, even if
        // its transaction finalization was interrupted. Refund only the
        // measured retained amount to avoid over-crediting the account.
        refundAmount = adjustmentCredits
      }

      const overageDebitKey = typeof transaction.metadata?.overageDebitKey === 'string'
        ? transaction.metadata.overageDebitKey
        : undefined
      const overageBaseCredits = Number(transaction.metadata?.overageBaseCredits)
      const overageCredits = Number(transaction.metadata?.overageCredits)
      if (
        refundAmount > 0 &&
        overageDebitKey &&
        Number.isFinite(overageBaseCredits) &&
        Number.isFinite(overageCredits) &&
        overageCredits > 0 &&
        transaction.credits <= overageBaseCredits &&
        await new AICreditsRepository().hasAppliedDebitKey(transaction.userId, overageDebitKey)
      ) {
        // The overage debit committed but its ledger finalization did not.
        refundAmount = roundCredits(refundAmount + overageCredits)
      }

      if (refundAmount > 0) {
        await this.applyIdempotentRefund(
          transaction.userId,
          refundAmount,
          `${idempotencyKey}:full-refund:v${debitVersion}`,
          validDate(transaction.metadata?.debitAt) ?? validDate(transaction.createdAt),
        )
      }
    } catch (error) {
      await AICreditTransaction.updateOne(
        { idempotencyKey },
        {
          $set: {
            status: 'refund_pending',
            'metadata.balanceDebited': true,
            'metadata.refundError': error instanceof Error ? error.message : String(error),
          },
        },
      ).catch(() => undefined)
      throw error
    }

    // The balance refund is authoritative. Ledger/cache finalization must not
    // cause a second refund or make the caller think compensation failed.
    await AICreditTransaction.updateOne(
      { idempotencyKey },
      {
        $set: {
          status: 'refunded',
          'metadata.balanceDebited': false,
        },
        $unset: { 'metadata.refundError': 1 },
      },
    ).catch((error) => {
      console.error('[AI CREDITS] Refund applied but ledger finalization failed:', error)
    })
    await this.invalidateBalanceCache(transaction.userId)

    if (transaction.metadata?.automatic === true && transaction.workspaceId) {
      await this.releaseAutomaticSlot(
        transaction.feature,
        transaction.workspaceId,
        idempotencyKey,
      ).catch((error) => {
        console.error('[AI CREDITS] Refund succeeded but automatic slot release failed:', error)
      })
    }
  }

  async runMetered<T>(
    feature: AICreditFeature,
    usageFeature: AIFeature | string,
    ctx: MeteringContext,
    operation: (signal?: AbortSignal) => Promise<T>,
    additionalProviderCostInr = 0,
    /**
     * When provided, cancelling the signal (e.g. the user clicked Stop) aborts
     * the in-flight generation: the operation is rejected, its reserved credits
     * are refunded in full, and no result is delivered or charged. The signal is
     * also forwarded to `operation` so the underlying provider request can be
     * cancelled where the SDK supports it (stopping token spend).
     */
    signal?: AbortSignal,
  ): Promise<{ result: T; settlement: CreditSettlement }> {
    const effectiveContext: MeteringContext = {
      ...ctx,
      idempotencyKey: ctx.idempotencyKey ??
        `${feature}:${ctx.userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    }

    let automaticClaimWasNew = false
    if (ctx.automatic) {
      const claim = await this.claimAutomaticSlot(
        feature,
        ctx.workspaceId,
        effectiveContext.idempotencyKey!,
      )
      if (!claim.allowed) {
        throw new AutomaticGenerationCapReachedError(feature, ctx.workspaceId)
      }
      automaticClaimWasNew = claim.newlyClaimed
      effectiveContext.automaticSlotClaimed = true
    }

    // Already cancelled before we did anything — never reserve or call the
    // provider (nothing to refund).
    if (signal?.aborted) throw makeAbortError(signal)

    let reservationMade = false
    try {
      // Atomically deduct the normal maximum before any provider call. This
      // closes the concurrent check-then-spend race; failures refund it and
      // successful operations settle down to measured usage.
      const reservation = await this.settleCredits(
        feature,
        effectiveContext,
        [],
        0,
        CREDIT_MODEL[feature].ceiling,
      )
      reservationMade = reservation.charged > 0 && reservation.skipped == null
      if (reservation.skipped === 'duplicate') {
        // A settled idempotency key represents an already-completed financial
        // attempt. Never call the provider again or refund that valid charge.
        throw new AICreditSettlementPendingError(effectiveContext.idempotencyKey!)
      }

      // Forward the signal into the operation (so the provider request itself
      // can abort) AND race it against cancellation so a Stop rejects promptly
      // even if the SDK doesn't honour the signal — the catch below then refunds
      // the reservation and the result is never used.
      const runOperation = (): Promise<T> => {
        if (!signal) return operation()
        return Promise.race([operation(signal), abortRejection<T>(signal)])
      }

      const { result, usage } = await collectAIUsage(
        usageFeature,
        { userId: ctx.userId, workspaceId: ctx.workspaceId },
        runOperation,
      )

      if (reservation.skipped === 'enterprise') {
        return { result, settlement: reservation }
      }

      const measured = computeCreditCharge(feature, usage, additionalProviderCostInr)
      const settlement = await this.adjustReservation(
        effectiveContext.idempotencyKey!,
        measured.credits,
        measured.providerCostInr,
        usage.length,
      )
      return { result, settlement }
    } catch (error) {
      let finalError = error
      if (reservationMade) {
        try {
          await this.refundSettlement(effectiveContext.idempotencyKey!)
        } catch (refundError) {
          finalError = new Error(
            `AI action failed; credit refund is pending. ${refundError instanceof Error ? refundError.message : String(refundError)}`,
          )
        }
      }
      if (automaticClaimWasNew) {
        await this.releaseAutomaticSlot(
          feature,
          ctx.workspaceId,
          effectiveContext.idempotencyKey!,
        ).catch(() => undefined)
      }
      throw finalError
    }
  }
}

export const aiCreditMeteringService = new AICreditMeteringService()
