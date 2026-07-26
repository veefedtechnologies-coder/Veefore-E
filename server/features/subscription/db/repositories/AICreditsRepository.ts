/**
 * AICreditsRepository
 *
 * Data-access layer for the AICredits collection. All MongoDB operations
 * related to AI credit balances are funnelled through this repository —
 * no other module should query AICreditsModel directly.
 *
 * Key design choices:
 *  - All mutations use atomic MongoDB operators ($inc, $set, findOneAndUpdate)
 *    to prevent race conditions when multiple requests hit the same user
 *    simultaneously (Requirement 9.2 / 15.2).
 *  - deductCredits implements an optimistic-concurrency retry loop with
 *    exponential back-off to handle high-throughput scenarios gracefully.
 *  - The repository is a plain class (no DI framework) that can be
 *    instantiated as a singleton by the service layer.
 */

import AICreditsModel, { type IAICredits } from '../models/AICreditsModel'

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Result shape returned by `deductCredits`.
 *
 * On success  → `{ success: true, remaining: <number> }`
 * On failure  → `{ success: false, reason: 'insufficient_credits', remaining: <number> }`
 * Concurrency → throws `Error('CONCURRENCY_CONFLICT')` after all retries
 */
export interface DeductResult {
  success: boolean
  reason?: string
  remaining: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Promise-based sleep — used for exponential back-off between retry attempts. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AICreditsRepository {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Fetch the AICredits document for a user, or `null` if none exists yet.
   *
   * @param userId - The user whose credits document should be retrieved.
   */
  async findByUserId(userId: string): Promise<IAICredits | null> {
    return AICreditsModel.findOne({ userId }).lean<IAICredits>()
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async ensureForUser(
    userId: string,
    monthlyCredits: number,
    nextResetAt: Date
  ): Promise<IAICredits> {
    const now = new Date()
    const doc = await AICreditsModel.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          monthlyCredits,
          remainingCredits: monthlyCredits,
          purchasedCredits: 0,
          rolloverCredits: 0,
          usedThisCycle: 0,
          appliedDebitKeys: [],
          appliedRefundKeys: [],
          lastResetAt: now,
          nextResetAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    return doc as IAICredits
  }

  /**
   * Create or fully reset the credits document for a user.
   *
   * Used when a subscription is first activated or when a plan change
   * re-allocates a different monthly credit amount. Sets:
   *  - `monthlyCredits` to the supplied value
   *  - `remainingCredits` to the supplied value (purchased / rollover remain 0
   *    for a brand-new document; existing purchased credits are preserved on
   *    an update via $setOnInsert for purchasedCredits)
   *  - `rolloverCredits` = 0
   *  - `usedThisCycle`   = 0
   *  - `lastResetAt`     = now
   *  - `nextResetAt`     = supplied date
   *
   * Returns the updated (or newly created) document.
   *
   * @param userId         - Target user.
   * @param monthlyCredits - Base plan credit allocation.
   * @param nextResetAt    - Timestamp of the next billing-cycle reset.
   */
  async upsertForUser(
    userId: string,
    monthlyCredits: number,
    nextResetAt: Date
  ): Promise<IAICredits> {
    const now = new Date()

    const doc = await AICreditsModel.findOneAndUpdate(
      { userId },
      [
        {
          $set: {
            userId,
            monthlyCredits,
            // Preserve existing purchasedCredits — add to monthly for remaining
            remainingCredits: {
              $add: [monthlyCredits, { $ifNull: ['$purchasedCredits', 0] }],
            },
            rolloverCredits: 0,
            usedThisCycle: 0,
            lastResetAt: now,
            nextResetAt,
          },
        },
      ],
      {
        upsert: true,
        new: true,
        // Ensure purchasedCredits defaults to 0 on insert
        setDefaultsOnInsert: true,
      }
    )

    // findOneAndUpdate with upsert + aggregation pipeline always returns the doc
    return doc as IAICredits
  }

  /**
   * Perform a monthly reset on an existing credits document.
   *
   * Behaviour (matches Requirement 9.2 / design spec):
   *  - `monthlyCredits`   ← supplied value
   *  - `rolloverCredits`  ← 0  (rollover is a future feature)
   *  - `usedThisCycle`    ← 0
   *  - `remainingCredits` ← monthlyCredits + existing purchasedCredits
   *  - `lastResetAt`      ← now
   *  - `nextResetAt`      ← supplied date
   *
   * Returns `null` when no document exists for the user (should not normally
   * happen if the subscription lifecycle is followed correctly).
   *
   * @param userId         - Target user.
   * @param monthlyCredits - New plan credit allocation for the upcoming cycle.
   * @param nextResetAt    - Timestamp of the next billing-cycle reset.
   */
  async resetMonthly(
    userId: string,
    monthlyCredits: number,
    nextResetAt: Date,
    dueBefore?: Date
  ): Promise<IAICredits | null> {
    const now = new Date()
    const filter: Record<string, unknown> = { userId }
    // Lazy resets use a compare-and-set condition so two concurrent reads
    // cannot both replenish the same cycle. Billing lifecycle resets omit this
    // argument and remain explicit/unconditional.
    if (dueBefore) filter.nextResetAt = { $lte: dueBefore }

    return AICreditsModel.findOneAndUpdate(
      filter,
      [
        {
          $set: {
            monthlyCredits,
            rolloverCredits: 0,
            usedThisCycle: 0,
            // Recalculate: monthly fresh allocation + any unconsumed purchased credits
            remainingCredits: {
              $add: [monthlyCredits, { $ifNull: ['$purchasedCredits', 0] }],
            },
            lastResetAt: now,
            nextResetAt,
          },
        },
      ],
      { new: true }
    ).lean<IAICredits>()
  }

  /**
   * Atomically deduct `amount` credits from a user's balance, consuming
   * `monthlyCredits` first and only drawing from `purchasedCredits` once
   * monthlyCredits are exhausted (Requirement 9.5).
   *
   * Uses a single `findOneAndUpdate` with an aggregation-pipeline update so
   * the deduction across all three fields (`monthlyCredits`, `purchasedCredits`,
   * `remainingCredits`) is computed and applied atomically inside MongoDB —
   * no application-level read-then-write race is possible.
   *
   * Deduction order:
   *   1. If `monthlyCredits >= amount`  → deduct entirely from monthlyCredits.
   *   2. If `monthlyCredits < amount`   → zero out monthlyCredits, deduct the
   *      remainder from purchasedCredits.
   *   `remainingCredits` always decrements by exactly `amount`.
   *
   * If the update returns `null` it could mean either:
   *   a) The user genuinely has insufficient credits → return failure.
   *   b) A concurrent request just deducted credits between our check and
   *      write → retry with exponential back-off.
   *
   * The two cases are disambiguated by reading the current document after
   * a null result:
   *   - `remainingCredits < amount`  → case (a), return insufficient_credits
   *   - `remainingCredits >= amount` → case (b), retry
   *
   * Back-off schedule (default maxRetries = 3):
   *   attempt 0 → wait 50 ms
   *   attempt 1 → wait 100 ms
   *   attempt 2 → wait 200 ms
   *   (then throw CONCURRENCY_CONFLICT)
   *
   * @param userId      - Target user.
   * @param amount      - Number of credits to deduct (must be > 0).
   * @param maxRetries  - Maximum retry attempts before giving up (default 3).
   *
   * @returns DeductResult
   * @throws  Error('CONCURRENCY_CONFLICT') when all retries are exhausted.
   */
  async deductCredits(
    userId: string,
    amount: number,
    maxRetries = 3,
    debitKey?: string,
  ): Promise<DeductResult> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Atomic conditional update: only succeeds when remaining >= amount and
      // an idempotent reservation key has not already been applied.
      const filter: Record<string, unknown> = { userId, remainingCredits: { $gte: amount } }
      if (debitKey) filter.appliedDebitKeys = { $ne: debitKey }
      // Aggregation pipeline update computes the monthly-first split inside
      // MongoDB so both credit-type fields and remainingCredits are updated
      // atomically in a single round-trip.
      const updated = await AICreditsModel.findOneAndUpdate(
        filter,
        [
          {
            $set: {
              // monthlyCredits is the plan allocation shown to the user; keep
              // it stable throughout the cycle. usedThisCycle determines how
              // much monthly allocation remains.
              monthlyCredits: '$monthlyCredits',
              // Consume rollover credits after monthly allocation and before
              // purchased packs. Rollover is currently disabled but keeping
              // this field accurate preserves the balance invariant.
              rolloverCredits: {
                $max: [
                  0,
                  {
                    $subtract: [
                      '$rolloverCredits',
                      {
                        $max: [
                          0,
                          {
                            $subtract: [
                              amount,
                              { $max: [0, { $subtract: ['$monthlyCredits', '$usedThisCycle'] }] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              // Consume purchased credits only after the monthly allocation
              // and rollover balance have been exhausted.
              purchasedCredits: {
                $max: [
                  0,
                  {
                    $subtract: [
                      '$purchasedCredits',
                      {
                        $max: [
                          0,
                          {
                            $subtract: [
                              {
                                $max: [
                                  0,
                                  {
                                    $subtract: [
                                      amount,
                                      { $max: [0, { $subtract: ['$monthlyCredits', '$usedThisCycle'] }] },
                                    ],
                                  },
                                ],
                              },
                              '$rolloverCredits',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              remainingCredits: { $round: [{ $subtract: ['$remainingCredits', amount] }, 2] },
              usedThisCycle: { $round: [{ $add: ['$usedThisCycle', amount] }, 2] },
              appliedDebitKeys: debitKey
                ? { $concatArrays: [{ $ifNull: ['$appliedDebitKeys', []] }, [debitKey]] }
                : { $ifNull: ['$appliedDebitKeys', []] },
            },
          },
        ],
        { new: true }
      ).lean<IAICredits>()

      if (updated !== null) {
        // Deduction succeeded
        return { success: true, remaining: updated.remainingCredits }
      }

      // Update returned null — determine why
      const current = await AICreditsModel.findOne({ userId })
        .select('remainingCredits appliedDebitKeys')
        .lean<Pick<IAICredits, 'remainingCredits' | 'appliedDebitKeys'>>()

      const currentRemaining = current?.remainingCredits ?? 0

      if (debitKey && current?.appliedDebitKeys?.includes(debitKey)) {
        // Retry after an uncertain database response: the debit committed on
        // the prior attempt, so report its current balance without charging it
        // a second time.
        return { success: true, remaining: currentRemaining }
      }

      if (currentRemaining < amount) {
        // Case (a): genuinely insufficient credits — no point retrying
        return {
          success: false,
          reason: 'insufficient_credits',
          remaining: currentRemaining,
        }
      }

      // Case (b): concurrency conflict — back off and retry
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 50) // 50 → 100 → 200 ms
      }
    }

    // All retries exhausted; caller should return HTTP 409
    throw new Error('CONCURRENCY_CONFLICT')
  }

  /**
   * Compute the "remaining" credit balance from the individual credit-type
   * fields of a document.
   *
   * This is the canonical formula for deriving how many credits a user has
   * available. It can be used to validate or re-sync `remainingCredits` and
   * for unit-testing the split without touching the database.
   *
   * Formula: max(0, monthlyCredits - usedThisCycle)
   *          + purchasedCredits + rolloverCredits
   *
   * `monthlyCredits` is the original cycle allocation, while
   * `usedThisCycle` is cumulative spend. Purchased and rollover fields already
   * hold only their unconsumed balances.
   *
   * @param doc - A fully hydrated IAICredits document (or plain object).
   * @returns   The canonical available balance derived from its components.
   */
  computeRemainingFromDoc(doc: IAICredits): number {
    return Math.max(0, doc.monthlyCredits - doc.usedThisCycle)
      + doc.purchasedCredits
      + doc.rolloverCredits
  }

  /**
   * Atomically reconcile an existing account to a changed monthly allocation.
   * Legacy monthly usage is preserved without consuming purchased/rollover
   * balances, and all values are calculated from the document MongoDB actually
   * updates rather than a stale application read.
   */
  async reconcileMonthlyAllocation(
    userId: string,
    monthlyCredits: number
  ): Promise<IAICredits | null> {
    return AICreditsModel.findOneAndUpdate(
      { userId, monthlyCredits: { $ne: monthlyCredits } },
      [
        {
          $set: {
            monthlyCredits,
            remainingCredits: {
              $round: [
                {
                  $add: [
                    {
                      $max: [
                        0,
                        {
                          $subtract: [
                            monthlyCredits,
                            { $min: ['$usedThisCycle', '$monthlyCredits'] },
                          ],
                        },
                      ],
                    },
                    { $ifNull: ['$purchasedCredits', 0] },
                    { $ifNull: ['$rolloverCredits', 0] },
                  ],
                },
                2,
              ],
            },
          },
        },
      ],
      { new: true }
    ).lean<IAICredits>()
  }

  /**
   * Refund a previously deducted amount. Used only for pre-reserved external
   * side-effects (AI automation sends) that ultimately fail. The update is
   * atomic and reverses purchased usage once cycle spend is above the monthly
   * allocation. Rollover is currently disabled by plan policy.
   */
  async refundCredits(
    userId: string,
    amount: number,
    refundKey?: string,
    debitAt?: Date,
  ): Promise<IAICredits | null> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Credit refund amount must be a positive finite number')
    }
    const normalizedAmount = Math.round((amount + Number.EPSILON) * 100) / 100
    const filter: Record<string, unknown> = { userId }
    if (refundKey) filter.appliedRefundKeys = { $ne: refundKey }

    const updated = await AICreditsModel.findOneAndUpdate(
      filter,
      [
        {
          $set: {
            purchasedCredits: {
              $round: [
                {
                  $cond: [
                    debitAt ? { $gt: ['$lastResetAt', debitAt] } : false,
                    // The debit belongs to an earlier cycle. Preserve the
                    // recovered value as purchased credit without changing the
                    // current cycle's usage counter.
                    { $add: [{ $ifNull: ['$purchasedCredits', 0] }, normalizedAmount] },
                    {
                      $add: [
                        { $ifNull: ['$purchasedCredits', 0] },
                        // Restore purchased credits consumed by this debit in
                        // the current cycle.
                        {
                          $subtract: [
                            { $max: [0, { $subtract: ['$usedThisCycle', '$monthlyCredits'] }] },
                            {
                              $max: [
                                0,
                                {
                                  $subtract: [
                                    {
                                      $subtract: [
                                        '$usedThisCycle',
                                        { $min: [normalizedAmount, '$usedThisCycle'] },
                                      ],
                                    },
                                    '$monthlyCredits',
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        // Defensive carry for legacy accounts whose usage was
                        // reset without a usable debit timestamp.
                        { $max: [0, { $subtract: [normalizedAmount, '$usedThisCycle'] }] },
                      ],
                    },
                  ],
                },
                2,
              ],
            },
            remainingCredits: { $round: [{ $add: ['$remainingCredits', normalizedAmount] }, 2] },
            usedThisCycle: {
              $round: [
                {
                  $cond: [
                    debitAt ? { $gt: ['$lastResetAt', debitAt] } : false,
                    '$usedThisCycle',
                    { $max: [0, { $subtract: ['$usedThisCycle', normalizedAmount] }] },
                  ],
                },
                2,
              ],
            },
            appliedRefundKeys: refundKey
              ? { $concatArrays: [{ $ifNull: ['$appliedRefundKeys', []] }, [refundKey]] }
              : { $ifNull: ['$appliedRefundKeys', []] },
          },
        },
      ],
      { new: true }
    ).lean<IAICredits>()

    if (updated || !refundKey) return updated
    // A retry after an uncertain network response must not apply the refund
    // twice. If the key is already present, return the current account as a
    // successful idempotent replay.
    return AICreditsModel.findOne({ userId, appliedRefundKeys: refundKey }).lean<IAICredits>()
  }

  async hasAppliedDebitKey(userId: string, debitKey: string): Promise<boolean> {
    return Boolean(await AICreditsModel.exists({ userId, appliedDebitKeys: debitKey }))
  }

  async hasAppliedRefundKey(userId: string, refundKey: string): Promise<boolean> {
    return Boolean(await AICreditsModel.exists({ userId, appliedRefundKeys: refundKey }))
  }

  /**
   * Atomically add purchased credits (from a one-time add-on pack) to a user's
   * balance. Both `purchasedCredits` and `remainingCredits` are incremented
   * together in a single atomic operation so the two fields never diverge.
   *
   * Returns `null` when no document exists for the user.
   *
   * @param userId - Target user.
   * @param amount - Number of credits to add (must be > 0).
   */
  async addPurchasedCredits(
    userId: string,
    amount: number
  ): Promise<IAICredits | null> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Purchased credit amount must be a positive finite number')
    }
    const normalizedAmount = Math.round((amount + Number.EPSILON) * 100) / 100
    return AICreditsModel.findOneAndUpdate(
      { userId },
      {
        $inc: {
          purchasedCredits: normalizedAmount,
          remainingCredits: normalizedAmount,
        },
      },
      { new: true }
    ).lean<IAICredits>()
  }
}
