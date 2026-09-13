/**
 * Auto Pilot — GATE→ACT loop stage.
 *
 * Composes the per-slot content pipeline the default SENSE→…→LEARN assembly left
 * out (see `loopStages.ts` header): it turns the `planned` Content_Slots the PLAN
 * stage produced into drafted, gated, and (when allowed) scheduled posts, and it
 * schedules slots the user has already approved.
 *
 * Per iteration:
 *
 *   1. **Draft + GATE (planned slots)** — for a bounded batch of `planned` slots
 *      (oldest scheduled first): draft an on-brand caption + hashtags, then route
 *      through {@link GateService}:
 *        • **Copilot** → always emit an Approval_Card (slot → `awaiting-approval`).
 *        • **Autopilot** → auto-execute when guardrails pass, else emit a card.
 *   2. **ACT (auto-executed)** — schedule auto-executable slots for publishing via
 *      {@link ActPublishService} (slot → `scheduled`).
 *   3. **ACT (approved)** — ALWAYS schedule slots whose Approval_Card the user has
 *      approved. This pass runs every iteration regardless of whether there are
 *      any `planned` slots, so approving a card reliably produces a scheduled
 *      post on the next loop tick.
 *
 * Idempotent + bounded + failure-tolerant: each slot is transitioned out of its
 * pre-state once handled, at most {@link MAX_SLOTS_PER_TICK} are processed per
 * pass, and a per-slot error is logged and skipped so the loop keeps running.
 *
 * Satisfies Requirements: 4.1, 4.2, 5.1, 5.2, 8, 12.2
 */

import { logger } from '../../../config/logger'
import { AIServiceManager } from '../../../services/AIServiceManager'
import type { LoopStageStep, LoopContext } from '../services/AutoPilotOrchestrator'
import {
  ApprovalModel,
  ContentSlotModel,
  isSupportedExecutionPlatform,
  type IContentSlot,
  type IMediaPoolItem,
} from '../db/models'
import { approvalRepository, contentSlotRepository, mediaPoolRepository, missionRepository } from '../db/repositories'
import { automationRuleRepository } from '../../../repositories/AutomationRepository'
import { mediaPoolService } from '../services/MediaPoolService'
import { MediaGenerationAdapter } from '../services/MediaGenerationAdapter'
import { automationDecisionService, type AutomationDecision } from '../services/AutomationDecisionService'
import {
  visionGroundingService,
  cachedDescription,
  type MediaGrounding,
} from '../services/VisionGroundingService'
import { pickForSlot, scoreMatch, ACCEPTED_MEDIA_TYPES_BY_FORMAT } from '../services/ContentMatcher'
import { gateService, type GateableItem } from '../services/stages/GateService'
import { ActPublishService } from '../services/stages/ActPublishService'
import { notificationDispatcher } from '../services/NotificationDispatcher'
import { resolveMissionNotifyTarget, type NotifyTarget } from '../services/MissionNotifyTarget'
import { loadWorkspaceAIPreferences } from '../services/MissionAIPreferences'
import type { UserAIPreferences } from '../../../services/AIServiceManager'

const COMPONENT = 'autopilot.gateActStage'

/** Cap on how many slots are processed per pass per iteration (bounds AI spend). */
export const MAX_SLOTS_PER_TICK = 5

/** Slot statuses that already occupy the schedule (for the frequency-cap facts). */
const OCCUPYING_STATUSES = new Set<IContentSlot['status']>([
  'brief-sent',
  'awaiting-approval',
  'ready',
  'scheduled',
  'published',
  'rescheduled',
])

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'your', 'my',
  'toward', 'towards', 'its', 'their', 'into', 'from', 'by', 'at', 'is', 'are',
])

/** Derive a handful of hashtags from a slot theme + mission niche as a fallback. */
function deriveHashtags(theme: string, niche?: string): string[] {
  const words = `${theme} ${niche ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  const seen = new Set<string>()
  const tags: string[] = []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    tags.push(`#${w}`)
    if (tags.length >= 8) break
  }
  return tags
}

/** Ensure every hashtag carries a single leading '#'. */
function normalizeHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => {
      const clean = t.trim().replace(/^#+/, '').replace(/\s+/g, '')
      return clean ? `#${clean}` : ''
    })
    .filter(Boolean)
    .slice(0, 30)
}

/**
 * Draft a caption + hashtags from TEXT only (no vision) — the reliable path when
 * media-grounded captioning is unavailable. Uses the AI to write an on-brand
 * caption and hashtags; falls back to a theme caption + derived hashtags if the
 * AI is unavailable, so a post always has both.
 */
async function draftCaptionFallback(
  mission: {
    brandVoice: string
    niche?: string
    localLanguage?: string
    guardrails: { bannedTopics?: string[] }
  },
  format: string,
  theme: string,
  grounding?: MediaGrounding,
  workspacePreferences?: UserAIPreferences,
): Promise<{ caption: string; hashtags: string[] }> {
  const banned = mission.guardrails.bannedTopics ?? []
  try {
    const prompt = [
      `Write an Instagram ${format} caption for a "${mission.niche ?? 'social media'}" account.`,
      `Topic/theme: ${theme}.`,
      // Ground the caption in what the media actually shows + the user's intent.
      grounding?.description ? `What the media actually shows: ${grounding.description}.` : '',
      grounding?.userIntent ? `The creator's intent for this post: ${grounding.userIntent}.` : '',
      `Brand voice: ${mission.brandVoice}.`,
      `Language: ${mission.localLanguage || 'English'}.`,
      banned.length ? `Never mention: ${banned.join(', ')}.` : '',
      grounding?.description
        ? 'Write specifically about what is shown; do not invent details that are not in the description.'
        : '',
      'Return STRICT JSON: { "caption": string (engaging, <=2200 chars, may use 1-2 emojis), "hashtags": string[] (8-15 relevant tags, WITHOUT the # symbol) }.',
    ]
      .filter(Boolean)
      .join('\n')
    const raw = await AIServiceManager.getInstance().generateJSON(prompt, {
      ...(workspacePreferences ?? {}),
      // Only default the creativity when the workspace hasn't configured its own.
      creativityLevel: workspacePreferences?.creativityLevel ?? 0.7,
    })
    const caption =
      raw && typeof raw.caption === 'string' && raw.caption.trim() ? raw.caption.trim() : theme
    let hashtags = normalizeHashtags(raw?.hashtags)
    if (hashtags.length === 0) hashtags = deriveHashtags(theme, mission.niche)
    return { caption: caption.slice(0, 2200), hashtags }
  } catch {
    return { caption: theme, hashtags: deriveHashtags(theme, mission.niche) }
  }
}

/**
 * Resolve a slot's media URL. Prefers the in-memory available-pool snapshot, but
 * falls back to a direct lookup by id — because a pool item assigned to a slot is
 * often no longer "available" (it's been used), so `listAvailable` would miss it.
 */
async function resolveSlotMedia(
  slot: IContentSlot,
  pool: IMediaPoolItem[],
): Promise<{ mediaUrl: string; mediaType?: 'image' | 'video' } | null> {
  const item = await resolveSlotPoolItem(slot, pool)
  return item?.mediaUrl ? { mediaUrl: item.mediaUrl, mediaType: item.mediaType } : null
}

/**
 * Resolve the full Media_Pool item assigned to a slot. Prefers the in-memory
 * pool snapshot, but falls back to a direct lookup by id — the PLAN stage often
 * assigns a slot's media from the workspace pool, so the assigned item may not
 * be in this tick's mission-scoped pool snapshot. Returns null when the slot has
 * no assigned pool item or it can't be found. Adds any DB-resolved item to the
 * in-memory pool so later steps (grounding, matching) can reuse it.
 */
async function resolveSlotPoolItem(
  slot: IContentSlot,
  pool: IMediaPoolItem[],
): Promise<IMediaPoolItem | null> {
  const id = slot.source?.mediaPoolItemId
  if (!id) return null
  const fromPool = pool.find((p) => String((p as { _id?: unknown })._id) === String(id))
  if (fromPool) return fromPool
  try {
    const item = await mediaPoolRepository.findById(String(id))
    if (item) {
      pool.push(item)
      return item
    }
  } catch {
    /* best-effort */
  }
  return null
}

/** Context for AI-generating media when the user's pool can't cover a slot. */
interface MediaGenContext {
  workspaceId: unknown
  missionId: string
  adapter: MediaGenerationAdapter
}

/** Max eligible pool items to vision-analyze per slot (bounds spend/latency). */
const MAX_ANALYZE_PER_SLOT = 8

/** Assign a resolved pool item to a slot (in-memory + persisted). */
async function assignPoolItem(
  slot: IContentSlot,
  item: IMediaPoolItem,
  usedIds: Set<string>,
): Promise<{ mediaUrl: string; mediaType?: 'image' | 'video' }> {
  const id = (item as { _id: unknown })._id
  usedIds.add(String(id))
  slot.source = { kind: 'pool', mediaPoolItemId: id as IContentSlot['source']['mediaPoolItemId'] }
  try {
    await ContentSlotModel.updateOne(
      { _id: slot._id },
      { $set: { source: { kind: 'pool', mediaPoolItemId: id } } },
    )
  } catch {
    /* best-effort */
  }
  return { mediaUrl: item.mediaUrl, mediaType: item.mediaType }
}

/**
 * Ensure a slot has usable media THAT MATCHES ITS THEME, in priority order:
 *   1. media already assigned to the slot (pool item by id);
 *   2. an available pool item whose vision description genuinely matches the
 *      theme (the user's uploads) — candidates are vision-analyzed so the match
 *      is real, never a blind first-pick;
 *   3. AI-GENERATED media — used both when there's no user media AND when the
 *      only user media is a KNOWN MISMATCH for the theme (e.g. a car selfie on a
 *      "vegan meal prep" post), so the image always matches the caption;
 *   4. as a last resort (AI can't produce the format, e.g. reels), the best
 *      available pool item so the slot is never left empty.
 * Persists the assignment. Returns null only when nothing could be found/made.
 */
async function ensureSlotMedia(
  slot: IContentSlot,
  pool: IMediaPoolItem[],
  usedIds: Set<string>,
  gen?: MediaGenContext,
  niche?: string,
  workspacePreferences?: UserAIPreferences,
): Promise<{ mediaUrl: string; mediaType?: 'image' | 'video' } | null> {
  const workspaceId = gen?.workspaceId
  const canGenerate = !!gen && slot.format !== 'reel' && gen.adapter.canGenerate(slot.format)

  // If PLAN already assigned media, keep it ONLY when it genuinely fits the
  // theme. Vision-analyze it first; a KNOWN mismatch (e.g. a car on a "mobile
  // phone" post) is dropped so a better pool match or AI-generated image can
  // take its place below. We can only replace when we can produce something
  // better (AI generation is available for the format).
  const assigned = await resolveSlotPoolItem(slot, pool)
  if (assigned?.mediaUrl) {
    await visionGroundingService.ensureDescription(
      assigned as unknown as Parameters<typeof visionGroundingService.ensureDescription>[0],
      workspaceId,
      workspacePreferences,
    )
    const desc = cachedDescription(assigned as unknown as { visionAnalysis?: Record<string, unknown> })
    const matches = desc == null || scoreMatch(`${slot.theme} ${niche ?? ''}`, desc) > 0
    if (matches || !canGenerate) {
      usedIds.add(String((assigned as { _id: unknown })._id))
      return { mediaUrl: assigned.mediaUrl, mediaType: assigned.mediaType }
    }
    logger.info('GATE: assigned media does not match theme — replacing', {
      component: COMPONENT,
      slotId: String(slot._id),
      theme: slot.theme,
      assignedDescription: desc ? desc.slice(0, 120) : null,
    })
    // Fall through: pick a better match or AI-generate on-theme media.
  }

  // Vision-analyze the eligible candidates (bounded, cached) so the matcher can
  // actually judge whether the user's media fits the theme instead of guessing.
  const accepted = ACCEPTED_MEDIA_TYPES_BY_FORMAT[slot.format] ?? (['image', 'video'] as const)
  const eligible = pool.filter((p) => {
    const pid = String((p as { _id?: unknown })._id)
    return (
      (p as { available?: boolean }).available !== false &&
      !!p.mediaUrl &&
      accepted.includes(p.mediaType) &&
      !usedIds.has(pid)
    )
  })
  for (const item of eligible.slice(0, MAX_ANALYZE_PER_SLOT)) {
    if (!cachedDescription(item as unknown as { visionAnalysis?: Record<string, unknown> })) {
      await visionGroundingService.ensureDescription(
        item as unknown as Parameters<typeof visionGroundingService.ensureDescription>[0],
        workspaceId,
        workspacePreferences,
      )
    }
  }

  // Pick the best-matching available pool item (by vision↔theme overlap).
  const candidate = pickForSlot(slot.theme, slot.format, pool, { niche, claimedIds: usedIds })
  const candidateDesc = candidate
    ? cachedDescription(candidate as unknown as { visionAnalysis?: Record<string, unknown> })
    : undefined
  // A genuine match: we could NOT analyze it (can't judge → trust the user's
  // upload), OR it shares meaningful tokens with the theme.
  const candidateMatches =
    !!candidate &&
    (candidateDesc == null || scoreMatch(`${slot.theme} ${niche ?? ''}`, candidateDesc) > 0)

  if (candidate?.mediaUrl && candidateMatches) {
    return assignPoolItem(slot, candidate, usedIds)
  }

  // No user media OR the only user media is a KNOWN mismatch for this theme →
  // AI-generate on-theme media so the image matches the caption (R6.3, R8.3).
  // Skip synchronous video generation (reels) to keep loop ticks responsive.
  if (gen && slot.format !== 'reel' && gen.adapter.canGenerate(slot.format)) {
    try {
      const res = await gen.adapter.generateMedia({
        workspaceId: gen.workspaceId,
        missionId: gen.missionId,
        format: slot.format,
        prompt: slot.theme,
      })
      if (res.status === 'generated') {
        const genId = (res.item as { _id?: unknown })._id
        usedIds.add(String(genId))
        // The generated item is in the pool; point the slot at it.
        pool.push(res.item)
        slot.source = { kind: 'pool', mediaPoolItemId: genId as IContentSlot['source']['mediaPoolItemId'] }
        try {
          await ContentSlotModel.updateOne(
            { _id: slot._id },
            { $set: { source: { kind: 'pool', mediaPoolItemId: genId } } },
          )
        } catch {
          /* best-effort */
        }
        return { mediaUrl: res.media.mediaUrl, mediaType: res.media.mediaType }
      }
    } catch {
      /* best-effort — fall through to the pool fallback */
    }
  }

  // Last resort (AI couldn't produce this format, e.g. a reel): use the best
  // available pool item rather than leaving the slot empty.
  if (candidate?.mediaUrl) {
    return assignPoolItem(slot, candidate, usedIds)
  }
  return null
}

/** The subset of the Mission the stage reads. */
interface StageMission {
  _id: unknown
  workspaceId: unknown
  accountId: string
  platform?: string
  operatingMode: 'copilot' | 'autopilot'
  brandVoice: string
  niche?: string
  localLanguage?: string
  guardrails: {
    bannedTopics?: string[]
    postingFrequency: { count: number; per: string; windowMs: number }
    creditBudget?: number
    approvalRequiredActions?: string[]
  }
}

/**
 * Build the GATE→ACT stage step. Stage id is 'GATE'; ACT scheduling is performed
 * inline. `sideEffect` so it's suspended while paused / for non-Instagram.
 */
export function buildGateActStage(): LoopStageStep {
  return {
    stage: 'GATE',
    sideEffect: true,
    async run(ctx: LoopContext) {
      const mission = ctx.mission as unknown as StageMission
      const missionId = ctx.missionId

      // Auto Pilot executes Instagram + Facebook Pages; skip side effects for
      // other (not-yet-supported) platforms.
      if (!isSupportedExecutionPlatform(mission.platform)) return {}

      // Load the workspace's configured AI settings ONCE per tick (model, BYO
      // keys, persona, creativity, content-safety, memory) so every LLM/vision
      // call this stage makes honors the same "AI Models" settings the rest of
      // the app's AI features do, instead of hardcoded defaults.
      const workspaceAIPreferences = await loadWorkspaceAIPreferences(mission.workspaceId)

      // Load the slots this stage acts on: freshly `planned` (to draft + gate)
      // and `awaiting-approval` (to schedule once the user approves).
      let planned: IContentSlot[] = []
      let awaiting: IContentSlot[] = []
      try {
        planned = await contentSlotRepository.findByMissionAndStatus(missionId, 'planned')
      } catch (err) {
        logger.warn('GATE: failed to load planned slots', {
          component: COMPONENT,
          missionId,
          error: (err as Error).message,
        })
      }
      try {
        awaiting = await contentSlotRepository.findByMissionAndStatus(missionId, 'awaiting-approval')
      } catch (err) {
        logger.warn('GATE: failed to load awaiting-approval slots', {
          component: COMPONENT,
          missionId,
          error: (err as Error).message,
        })
      }
      if (planned.length === 0 && awaiting.length === 0) return {}

      // Shared facts + ACT wiring, built once so BOTH passes can use them.
      let existingTimes: Date[] = []
      let pool: IMediaPoolItem[] = []
      try {
        const all = await contentSlotRepository.findByMission(missionId)
        existingTimes = all.filter((s) => OCCUPYING_STATUSES.has(s.status)).map((s) => s.scheduledAt)
      } catch {
        /* best-effort */
      }
      try {
        // Media is per-mission: only this mission's uploaded/generated pool
        // items are eligible, so missions never borrow each other's media.
        pool = await mediaPoolService.listAvailableByMission(mission.workspaceId, missionId)
      } catch {
        /* best-effort — pool may be empty */
      }

      const actMission = {
        _id: mission._id,
        // Persist as a string so the scheduled-posts query (exact workspaceId
        // match on a string) reliably finds the ContentModel ACT writes.
        workspaceId: String(mission.workspaceId),
        accountId: String(mission.accountId),
        platform: mission.platform,
      }
      const actSlotInput = (slot: IContentSlot) => ({
        _id: slot._id,
        scheduledAt: slot.scheduledAt,
        format: slot.format,
        theme: slot.theme,
        caption: slot.caption,
        hashtags: slot.hashtags,
        source: slot.source,
        status: slot.status,
        contentId: slot.contentId,
        fallbackResolution: slot.fallbackResolution,
      })
      const act = new ActPublishService({
        mediaResolver: {
          async resolve(slot) {
            const media = await resolveSlotMedia(slot as unknown as IContentSlot, pool)
            return media ? { mediaUrls: [media.mediaUrl], mediaType: media.mediaType } : null
          },
        },
      })

      let approvalsEmitted = 0
      let scheduled = 0
      let automationsActivated = 0
      // Pool items claimed this tick, so two slots don't grab the same media.
      const claimedMediaIds = new Set<string>()
      // AI media generation, used when the user's pool can't cover a slot.
      const mediaGen: MediaGenContext = {
        workspaceId: mission.workspaceId,
        missionId,
        adapter: new MediaGenerationAdapter(),
      }

      // In autopilot, nothing is gated behind approval — this is how the user
      // finds out what the agent just did on its own. Resolved lazily (at most
      // once per tick) so a copilot mission (which never auto-executes) never
      // pays for the lookup.
      let notifyTarget: NotifyTarget | null | undefined
      const getNotifyTarget = async (): Promise<NotifyTarget | null> => {
        if (notifyTarget === undefined) {
          notifyTarget = await resolveMissionNotifyTarget(mission.workspaceId)
        }
        return notifyTarget
      }
      const notifyAutonomousAction = async (title: string, message: string): Promise<void> => {
        try {
          const target = await getNotifyTarget()
          if (!target) return
          await notificationDispatcher.dispatch({
            userId: target.userId,
            workspaceId: String(mission.workspaceId),
            title,
            message,
            type: 'info',
            sessionContext: target.sessionContext,
            deviceToken: target.deviceToken,
            email: target.email,
          })
        } catch (err) {
          logger.warn('GATE/ACT: autonomous-action notification failed', {
            component: COMPONENT,
            missionId,
            error: (err as Error).message,
          })
        }
      }

      // ── PASS 1: draft + gate freshly PLANNED slots ─────────────────────────
      if (planned.length > 0) {
        const batch = planned.slice(0, MAX_SLOTS_PER_TICK)
        const items: GateableItem[] = []
        const slotByRef = new Map<string, IContentSlot>()
        // Drafted (inactive) engagement automations, keyed by their rule id, so
        // the decisions loop can snapshot them on the card / activate on approve.
        const automationByRef = new Map<string, { decision: AutomationDecision }>()

        for (const slot of batch) {
          const slotId = String(slot._id)
          let caption = slot.caption
          let hashtags = slot.hashtags

          // Attach media FIRST (user's pool best-match, else AI-generate) so the
          // caption + automation can be grounded in what the media actually is.
          await ensureSlotMedia(slot, pool, claimedMediaIds, mediaGen, mission.niche, workspaceAIPreferences)

          // Build the media grounding: vision description (analyzed + cached
          // once) + the user's per-item intent/keyword. Resolve the assigned
          // item robustly (in-memory pool → DB by id) so vision ALWAYS runs on
          // the actual assigned media, even when it isn't in this tick's pool
          // snapshot. Best-effort → {} on any failure (drafts theme-only).
          let grounding: MediaGrounding = {}
          try {
            const assignedItem = await resolveSlotPoolItem(slot, pool)
            if (assignedItem) {
              grounding = await visionGroundingService.buildGrounding(
                assignedItem as unknown as Parameters<typeof visionGroundingService.buildGrounding>[0],
                mission.workspaceId,
                workspaceAIPreferences,
              )
            }
          } catch (err) {
            logger.warn('GATE: failed to build media grounding', {
              component: COMPONENT,
              missionId,
              slotId,
              error: (err as Error).message,
            })
          }

          logger.info('GATE: drafting slot', {
            component: COMPONENT,
            missionId,
            slotId,
            format: slot.format,
            theme: slot.theme,
            hasAssignedMedia: !!slot.source?.mediaPoolItemId,
            visionDescription: grounding.description ? grounding.description.slice(0, 120) : null,
            userIntent: grounding.userIntent ?? null,
            userKeyword: grounding.userKeyword ?? null,
            captionAlreadySet: !!caption,
          })

          if (!caption) {
            const drafted = await draftCaptionFallback(
              mission,
              slot.format,
              slot.theme,
              grounding,
              workspaceAIPreferences,
            )
            caption = drafted.caption
            hashtags = drafted.hashtags
          }
          if (!hashtags || hashtags.length === 0) {
            hashtags = deriveHashtags(slot.theme, mission.niche)
          }
          try {
            await ContentSlotModel.updateOne({ _id: slot._id }, { $set: { caption, hashtags } })
            slot.caption = caption
            slot.hashtags = hashtags
          } catch {
            /* best-effort — routing continues with the in-memory caption */
          }

          items.push({
            itemType: 'content-slot',
            itemRef: slotId,
            action: {
              type: 'publish',
              content: caption,
              at: slot.scheduledAt,
              existingActionTimes: existingTimes,
              approved: false,
            },
            expiresAt: slot.scheduledAt,
            title: 'Auto Pilot: approve a post',
            message: `A ${slot.format} about "${slot.theme}" is ready for your review.`,
          })
          slotByRef.set(slotId, slot)

          // Decide — like a human social manager — whether this post needs an
          // engagement automation (comment/DM auto-reply) to grow the account.
          // A needed automation is drafted INACTIVE and gated alongside the post:
          // in copilot it becomes an Approval_Card; in autopilot it auto-activates
          // when guardrails pass. This is how Auto Pilot "grows like automations".
          try {
            const missionAutoInput = {
              _id: mission._id,
              workspaceId: mission.workspaceId,
              localLanguage: mission.localLanguage,
              platform: mission.platform,
              workspaceAIPreferences,
            }
            const slotAutoInput = { _id: slot._id, format: slot.format, theme: slot.theme }
            const decision = await automationDecisionService.decide(
              missionAutoInput,
              slotAutoInput,
              caption,
              { grounding },
            )
            if (decision.needsAutomation) {
              const draft = automationDecisionService.draftRule(
                missionAutoInput,
                slotAutoInput,
                decision,
              )
              if (draft) {
                // Tag the rule with its mission so the UI can list a mission's
                // Auto Pilot automations (comment/DM/comment-to-DM).
                const created = await automationRuleRepository.create({
                  ...draft,
                  missionId,
                } as never)
                const ruleId = String((created as { _id: unknown })._id)
                automationByRef.set(ruleId, { decision })
                items.push({
                  itemType: 'automation',
                  itemRef: ruleId,
                  action: {
                    type: 'automation',
                    content: decision.commentReply || decision.dmMessage || '',
                    approved: false,
                  },
                  title: 'Auto Pilot: approve an automation',
                  message: `An auto-reply for "${slot.theme}" is ready for your review.`,
                })
              }
            }
          } catch (err) {
            logger.warn('GATE: automation decision/draft failed', {
              component: COMPONENT,
              missionId,
              slotId,
              error: (err as Error).message,
            })
          }
        }

        let routeResult: Awaited<ReturnType<typeof gateService.route>> | null = null
        try {
          routeResult = await gateService.route(
            {
              _id: mission._id,
              workspaceId: mission.workspaceId,
              operatingMode: mission.operatingMode,
              guardrails: mission.guardrails,
              brandVoice: mission.brandVoice,
            },
            items,
          )
        } catch (err) {
          logger.error('GATE: routing failed', err as Error, { component: COMPONENT, missionId })
        }

        for (const routed of routeResult?.routed ?? []) {
          // Engagement automations: activate now (autopilot + guardrails passed)
          // or snapshot the draft onto the approval card (copilot / gated).
          if (routed.item.itemType === 'automation') {
            const ruleId = routed.item.itemRef
            const entry = automationByRef.get(ruleId)
            if (routed.decision === 'auto-execute') {
              try {
                await automationRuleRepository.toggleActive(ruleId, true)
                automationsActivated++
                const kindLabel =
                  entry?.decision.type === 'comment-to-dm'
                    ? 'a comment-to-DM'
                    : entry?.decision.type === 'dm-only'
                      ? 'a DM'
                      : 'a comment-reply'
                await notifyAutonomousAction(
                  'Auto Pilot activated an automation',
                  `I turned on ${kindLabel} automation${
                    entry?.decision.triggerKeyword ? ` (trigger: "${entry.decision.triggerKeyword}")` : ''
                  } for your account.`,
                )
              } catch (err) {
                logger.warn('ACT: failed to activate automation', {
                  component: COMPONENT,
                  missionId,
                  ruleId,
                  error: (err as Error).message,
                })
              }
            } else if (routed.approval && entry) {
              const d = entry.decision
              const snapshot = {
                itemType: 'automation',
                automationType: d.type,
                triggerKeyword: d.triggerKeyword,
                commentReply: d.commentReply,
                dmMessage: d.dmMessage,
                reason: d.reason,
              }
              try {
                await ApprovalModel.updateOne(
                  { _id: (routed.approval as { _id: unknown })._id },
                  { $set: { editedPayload: snapshot } },
                )
              } catch {
                /* best-effort — the card still works without the snapshot */
              }
              approvalsEmitted++
            }
            continue
          }

          const slot = slotByRef.get(routed.item.itemRef)
          if (!slot) continue

          if (routed.decision === 'approval-required') {
            try {
              await contentSlotRepository.updateStatus(String(slot._id), 'awaiting-approval')
            } catch {
              /* best-effort */
            }
            // Snapshot the drafted content on the approval so the chat card shows
            // the caption/hashtags/media (not just a bare item reference).
            if (routed.approval) {
              const media = await resolveSlotMedia(slot, pool)
              const snapshot = {
                caption: slot.caption,
                hashtags: slot.hashtags ?? [],
                format: slot.format,
                theme: slot.theme,
                scheduledAt: slot.scheduledAt?.toISOString?.() ?? undefined,
                mediaUrls: media?.mediaUrl ? [media.mediaUrl] : [],
              }
              try {
                await ApprovalModel.updateOne(
                  { _id: (routed.approval as { _id: unknown })._id },
                  { $set: { editedPayload: snapshot } },
                )
              } catch {
                /* best-effort — the card still works without the snapshot */
              }
            }
            approvalsEmitted++
            continue
          }

          // auto-execute (autopilot + guardrails passed) → schedule for publishing.
          try {
            const res = await act.scheduleSlotForPublishing(actMission, actSlotInput(slot))
            if (res.scheduled) {
              scheduled++
              await notifyAutonomousAction(
                'Auto Pilot scheduled a post',
                `A ${slot.format} about "${slot.theme}" is scheduled for ` +
                  `${slot.scheduledAt?.toLocaleString?.() ?? 'soon'}.`,
              )
            }
          } catch (err) {
            logger.warn('ACT: failed to schedule slot for publishing', {
              component: COMPONENT,
              missionId,
              slotId: String(slot._id),
              error: (err as Error).message,
            })
          }
        }
      }

      // ── PASS 2: schedule slots the user has ALREADY APPROVED (always runs) ──
      // Approving a card marks its Approval `approved` (ApprovalLifecycleService)
      // but leaves scheduling to ACT — this pass picks those up and schedules the
      // post. It runs every iteration, even when there are no `planned` slots.
      for (const slot of awaiting.slice(0, MAX_SLOTS_PER_TICK)) {
        let approval
        try {
          approval = await approvalRepository.findByItem('content-slot', String(slot._id))
        } catch {
          continue
        }
        if (approval?.status !== 'approved') continue
        // Make sure the approved slot has media before it's written to a post.
        await ensureSlotMedia(slot, pool, claimedMediaIds, mediaGen, mission.niche, workspaceAIPreferences)
        try {
          const res = await act.scheduleSlotForPublishing(actMission, actSlotInput(slot))
          if (res.scheduled) {
            scheduled++
            await notifyAutonomousAction(
              'Your approved post is scheduled',
              `A ${slot.format} about "${slot.theme}" is scheduled for ` +
                `${slot.scheduledAt?.toLocaleString?.() ?? 'soon'}.`,
            )
          }
        } catch (err) {
          logger.warn('ACT: failed to schedule approved slot', {
            component: COMPONENT,
            missionId,
            slotId: String(slot._id),
            error: (err as Error).message,
          })
        }
      }

      // ── PASS 2b: activate automations the user has ALREADY APPROVED ────────
      // Mirrors PASS 2 for posts: approving an automation card marks its Approval
      // `approved` but leaves activation to ACT. This pass flips the drafted
      // (inactive) rule live, idempotently, every iteration.
      try {
        const approvedAutos = await ApprovalModel.find({
          missionId: mission._id,
          itemType: 'automation',
          status: 'approved',
        }).limit(MAX_SLOTS_PER_TICK * 4)
        for (const ap of approvedAutos) {
          const ruleId = String((ap as { itemRef?: unknown }).itemRef ?? '')
          if (!ruleId) continue
          try {
            const rule = await automationRuleRepository.findById(ruleId)
            if (rule && rule.isActive !== true) {
              await automationRuleRepository.toggleActive(ruleId, true)
              automationsActivated++
              await notifyAutonomousAction(
                'Your approved automation is live',
                `The engagement automation you approved is now active on your account.`,
              )
            }
          } catch {
            /* best-effort — try the next approved automation */
          }
        }
      } catch {
        /* best-effort — automation activation is not critical to the loop */
      }

      logger.info('GATE/ACT stage complete', {
        component: COMPONENT,
        missionId,
        operatingMode: mission.operatingMode,
        planned: planned.length,
        awaiting: awaiting.length,
        approvalsEmitted,
        scheduled,
        automationsActivated,
      })

      // Persist a summary of what the agent just did into the mission's
      // agentMemory so it can recall past actions across loop ticks and
      // restarts. This is the Auto Pilot's long-term memory.
      if (scheduled > 0 || automationsActivated > 0 || approvalsEmitted > 0) {
        const summaryParts: string[] = []
        if (scheduled > 0) summaryParts.push(`Scheduled ${scheduled} post${scheduled > 1 ? 's' : ''} for publishing.`)
        if (automationsActivated > 0) summaryParts.push(`Activated ${automationsActivated} engagement automation${automationsActivated > 1 ? 's' : ''}.`)
        if (approvalsEmitted > 0) summaryParts.push(`Created ${approvalsEmitted} approval card${approvalsEmitted > 1 ? 's' : ''} for review.`)
        void missionRepository.appendAgentMemory(missionId, {
          role: 'agent',
          content: summaryParts.join(' '),
          at: new Date(),
          type: scheduled > 0 ? 'published' : automationsActivated > 0 ? 'automation' : 'decision',
        }).catch(() => { /* best-effort — memory is non-critical */ })
      }

      return {
        approvalsRaised: approvalsEmitted,
        actionsExecuted: scheduled + automationsActivated,
      }
    },
  }
}
