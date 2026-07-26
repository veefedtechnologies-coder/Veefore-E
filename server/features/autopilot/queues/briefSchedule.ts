/**
 * Auto Pilot — Content-Brief scheduling math (pure, no I/O).
 *
 * The `autopilot-brief` queue schedules two kinds of delayed jobs for a
 * Content_Brief (design "Queues" · R7):
 *
 *   1. the **brief send**, at `publishTime − leadTime` (R7.3), and
 *   2. up to **three escalating reminders**, fired when the *remaining* Lead_Time
 *      reaches 50 %, 25 %, and 10 % of the total Lead_Time (R7.5).
 *
 * This module isolates the timing arithmetic behind two pure functions so the
 * "≤3 reminders, fired at the correct fractions" invariant (Property 12) can be
 * property-tested with fast-check without a queue, Redis, or a clock. The queue
 * manager consumes the result to enqueue BullMQ delayed jobs.
 *
 * ── The reminder model ──────────────────────────────────────────────────────
 * Let the total Lead_Time be `L = publishAt − sendAt` (equal to the brief's
 * `leadTimeMs`). At any instant `t`, the *remaining* Lead_Time is `publishAt − t`.
 * A reminder for fraction `f ∈ (0,1)` fires at the instant the remaining Lead_Time
 * equals `f · L`:
 *
 *     remaining(t) = f · L   ⟺   publishAt − t = f · L   ⟺   t = publishAt − f·L
 *
 * With the default fractions `[0.5, 0.25, 0.1]` (largest first), the reminders
 * fire progressively closer to the publish time and always land strictly between
 * the send time and the publish time.
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (Property 12)
 */

/** R7.5 default escalating reminder fractions of the *remaining* Lead_Time. */
export const DEFAULT_REMINDER_FRACTIONS: readonly number[] = [0.5, 0.25, 0.1]

/** R7.5 hard cap: no more than 3 reminders may ever be scheduled for a brief. */
export const MAX_REMINDERS = 3

/** Inputs for {@link computeReminderSchedule}. All times are epoch milliseconds. */
export interface ReminderScheduleInput {
  /** When the brief send fires — `publishAt − leadTime` (R7.3). */
  sendAtMs: number
  /** The Content_Slot's scheduled publish time. */
  publishAtMs: number
  /** "Now" for delay computation. Defaults to `Date.now()`; injectable for tests. */
  now?: number
  /**
   * Remaining-Lead_Time fractions at which reminders fire. Defaults to
   * {@link DEFAULT_REMINDER_FRACTIONS}. Values are sanitised to the open interval
   * `(0, 1)`, de-duplicated, sorted largest-first (earliest reminder first), and
   * capped at {@link MAX_REMINDERS} so the ≤3 bound (R7.5) always holds.
   */
  fractions?: readonly number[]
}

/** One scheduled reminder produced by {@link computeReminderSchedule}. */
export interface ScheduledReminder {
  /** 1-based reminder number (1 = earliest / 50 %). */
  index: number
  /** The remaining-Lead_Time fraction this reminder fires at. */
  fraction: number
  /** Absolute time (epoch ms) the reminder fires: `publishAt − fraction·L`. */
  fireAtMs: number
  /** Delay from `now` (ms, never negative) to hand BullMQ as the job `delay`. */
  delayMs: number
}

/**
 * Compute the bounded, correctly-spaced reminder schedule for a Content_Brief
 * (R7.5 / Property 12).
 *
 * Returns at most {@link MAX_REMINDERS} reminders, each firing at the instant the
 * remaining Lead_Time reaches its fraction of the total Lead_Time
 * `L = publishAt − sendAt`, ordered earliest-first. Returns `[]` when the
 * Lead_Time is non-positive (nothing sensible to remind about).
 */
export function computeReminderSchedule(input: ReminderScheduleInput): ScheduledReminder[] {
  const { sendAtMs, publishAtMs } = input
  const now = input.now ?? Date.now()
  const leadMs = publishAtMs - sendAtMs

  // A non-positive Lead_Time means the send is at/after publish — no reminders.
  if (!Number.isFinite(leadMs) || leadMs <= 0) return []

  const fractions = normaliseFractions(input.fractions ?? DEFAULT_REMINDER_FRACTIONS)

  return (
    fractions
      .map((fraction) => ({ fraction, fireAtMs: publishAtMs - fraction * leadMs }))
      // Keep only reminders that land strictly inside the (send, publish) window.
      // A vanishingly small fraction against a tiny Lead_Time can underflow so the
      // fire time rounds onto the send or publish boundary — such a reminder is
      // meaningless, so drop it to keep the "strictly before publish" invariant.
      .filter(({ fireAtMs }) => fireAtMs > sendAtMs && fireAtMs < publishAtMs)
      .map(({ fraction, fireAtMs }, i) => ({
        index: i + 1,
        fraction,
        fireAtMs,
        delayMs: Math.max(0, Math.round(fireAtMs - now)),
      }))
  )
}

/**
 * Compute the BullMQ `delay` (ms, never negative) for the brief *send* job so it
 * fires no later than `publishTime − leadTime` (R7.3). A send time already in the
 * past yields `0` — the send fires immediately.
 */
export function computeSendDelayMs(sendAtMs: number, now: number = Date.now()): number {
  return Math.max(0, Math.round(sendAtMs - now))
}

/**
 * Sanitise raw reminder fractions into the schedulable set: keep only values in
 * the open interval `(0, 1)`, de-duplicate, sort largest-first (so reminders fire
 * earliest-first), and cap at {@link MAX_REMINDERS} (R7.5).
 */
function normaliseFractions(raw: readonly number[]): number[] {
  return Array.from(new Set(raw))
    .filter((f) => Number.isFinite(f) && f > 0 && f < 1)
    .sort((a, b) => b - a)
    .slice(0, MAX_REMINDERS)
}
