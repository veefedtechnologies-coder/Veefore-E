/**
 * Auto Pilot — SlotMetricsReader (per-post performance for MEASURE → LEARN).
 *
 * Closes the learning loop. MEASURE gathers each published Content_Slot, but on
 * its own it only records the account-level goal metric — it has no per-post
 * signal, so LEARN has nothing to learn from and THINK never discovers which
 * formats/themes actually work.
 *
 * This reader supplies that signal from GENUINE data: every slot Auto Pilot
 * publishes is linked to a `ContentModel` (via `slot.contentId`), and the app's
 * insights poller writes that post's real metrics (likes, comments, shares,
 * saves, reach, views, engagement, impressions) onto `ContentModel.metrics`.
 * The reader maps those onto the {@link SlotMetrics} shape MEASURE/LEARN expect.
 *
 * It NEVER fabricates: a slot with no `contentId`, a missing content record, or
 * a record with no usable metric fields yields `null` (LEARN then skips that
 * slot). All access is best-effort and behind a `contentStore` port so it is
 * unit-testable without a database.
 *
 * Satisfies Requirements: 3.4 (per-slot performance) → 2.6 (LEARN feedback).
 */

import { logger } from '../../../../config/logger'
import type { IContentSlot } from '../../db/models'
import type { SlotMetrics, SlotPerformanceReader } from './MeasureService'

const COMPONENT = 'autopilot.SlotMetricsReader'

/** The `ContentModel` fields the reader reads. */
interface ContentMetricsDoc {
  metrics?: {
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    engagement?: number
    views?: number
    reach?: number
    impressions?: number
  }
}

/** Read port for the linked content record. Defaults to `ContentModel.findById`. */
export interface ContentMetricsStore {
  findById(contentId: string): Promise<ContentMetricsDoc | null>
}

const defaultContentStore: ContentMetricsStore = {
  async findById(contentId: string): Promise<ContentMetricsDoc | null> {
    const { ContentModel } = await import('../../../../models/Content/Content')
    return (await ContentModel.findById(contentId)
      .select('metrics')
      .lean()
      .exec()) as ContentMetricsDoc | null
  },
}

/** Return the value when it is a finite, non-negative number, else undefined. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * Reads a published slot's real per-post metrics from its linked `ContentModel`.
 *
 * MEASURE's `engagement` for the goal-aligned score is derived from likes +
 * comments + shares + saves when the stored `engagement` field is absent/zero,
 * so a post always contributes a usable engagement signal once any interaction
 * metric is present. Returns `null` when there is genuinely no signal to learn
 * from (no content link, no record, or all-zero/absent metrics).
 */
export class SlotMetricsReader implements SlotPerformanceReader {
  constructor(private readonly contentStore: ContentMetricsStore = defaultContentStore) {}

  async read(slot: IContentSlot): Promise<SlotMetrics | null> {
    const contentId = (slot as { contentId?: unknown }).contentId
    if (contentId == null) return null

    let doc: ContentMetricsDoc | null
    try {
      doc = await this.contentStore.findById(String(contentId))
    } catch (error) {
      logger.warn('MEASURE: failed to read per-post metrics — skipping slot', {
        component: COMPONENT,
        slotId: String((slot as { _id?: unknown })._id ?? ''),
        contentId: String(contentId),
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }

    const m = doc?.metrics
    if (!m) return null

    const likes = finite(m.likes)
    const comments = finite(m.comments)
    const shares = finite(m.shares)
    const saves = finite(m.saves)
    const reach = finite(m.reach)
    const views = finite(m.views ?? m.impressions)
    // Prefer the stored engagement; otherwise compute it from interactions so a
    // post with any signal still contributes to LEARN.
    const storedEngagement = finite(m.engagement)
    const interactionSum =
      (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0)
    const engagement =
      storedEngagement && storedEngagement > 0
        ? storedEngagement
        : interactionSum > 0
          ? interactionSum
          : undefined

    const out: SlotMetrics = {}
    if (reach !== undefined) out.reach = reach
    if (engagement !== undefined) out.engagement = engagement
    if (likes !== undefined) out.likes = likes
    if (comments !== undefined) out.comments = comments
    if (shares !== undefined) out.shares = shares
    if (views !== undefined) out.views = views

    // No usable metric present → nothing to learn from this slot.
    return Object.keys(out).length > 0 ? out : null
  }
}

/** Shared default instance backed by the real `ContentModel`. */
export const slotMetricsReader = new SlotMetricsReader()
