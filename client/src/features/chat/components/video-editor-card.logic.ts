/**
 * Pure presentation logic for {@link VideoEditorChatCard}.
 *
 * WHY THIS IS A SEPARATE, REACT-FREE MODULE: the card renders the SAME server
 * state on two surfaces — the terse checklist under the preview and the
 * narrative line overlaid on top of it. Those two surfaces used to be derived
 * independently (the checklist from "the first step still pending", the overlay
 * from whatever `status` string happened to arrive last), which is exactly how
 * they came to contradict each other: the overlay said "Trim the clip…" while the
 * checklist still pointed at "Crop the frame".
 *
 * Everything here is a pure function of the streamed payload, so BOTH surfaces
 * read one resolved answer ({@link focusPlan}) and the disagreement is impossible
 * to reintroduce — and it is testable without mounting anything.
 *
 * HONESTY RULES (load-bearing):
 *   - A step the planner or the executor could NOT run is never shown as
 *     current and never shown as done. It leaves the checklist and is named in
 *     the honest footnote instead.
 *   - The narrative line is composed ONLY from server-streamed plan data and the
 *     user's own words. It never invents a step that is not in the plan, and its
 *     "Step N of M" counter is the very index the checklist highlights.
 *   - When the server has not pinned an executing step, the server's own status
 *     text wins and no counter is shown.
 */

/** One entry of the streamed plan checklist (mirrors the server payload). */
export interface PlanStepLike {
  kind: string
  type: string
  status: string
  label: string
  limitation?: string
}

/** A step's presentation state. Three states, never two. */
export type StepState = 'done' | 'pending' | 'unavailable'

/**
 * Classify a streamed plan step into exactly one of three states.
 *
 * The planner's contract (`editing-planner.logic.ts`) is: `executable` =
 * queued/running, `unavailable` = no engine can perform it, `error` = it failed.
 * The driver adds `done` at the moment an operation genuinely produced output.
 * Only `done` is a tick — anything else must never render as success.
 */
export function stepState(step: PlanStepLike): StepState {
  const status = (step.status || '').toLowerCase()
  if (status === 'executable') return 'pending'
  if (status === 'done' || status === 'complete' || status === 'completed') return 'done'
  // 'unavailable', 'error', 'skipped' and anything unrecognised: NOT a tick.
  return 'unavailable'
}

/** Internal plumbing steps the user does not need to see in a checklist. */
export const HIDDEN_STEP_KINDS = new Set(['render'])

/**
 * Below this many visible steps the checklist is not rendered at all (a one-item
 * checklist is noise), so the overlay must not show a "Step N of M" counter
 * either — there would be nothing on screen for it to agree with.
 */
export const MIN_VISIBLE_PLAN_STEPS = 2

/** A checklist row plus the index it occupies in the RAW streamed plan array. */
export interface VisiblePlanStep {
  step: PlanStepLike
  /** Index into the raw `plan` array the server streamed. */
  planIndex: number
}

export interface PartitionedPlan {
  /** The rows the checklist renders, in plan order. */
  steps: VisiblePlanStep[]
  /** Steps no engine could perform — reported in the honest footnote. */
  unavailable: PlanStepLike[]
  /**
   * Raw plan index → visible row index.
   *
   * Duplicate-label steps collapse into ONE row, and every collapsed duplicate
   * maps to the row that kept it, so the server's `activeStepIndex` still lands
   * on the right visible row after filtering. Unavailable and hidden steps have
   * no entry (they are not rendered).
   */
  visibleIndexByPlanIndex: Map<number, number>
}

/**
 * Split the streamed plan into the rows worth showing and the ones that could
 * not be done.
 *
 * Filtering rules (unchanged from the original inline version, plus index
 * bookkeeping):
 *   - `unavailable` steps leave the checklist entirely (they are reported in the
 *     honest footnote instead — never dropped),
 *   - the internal `render` kind is hidden (the finished video is self-evident),
 *   - duplicate labels collapse, so "Reframe the aspect ratio" cannot appear
 *     twice.
 */
export function partitionPlan(plan: PlanStepLike[]): PartitionedPlan {
  const steps: VisiblePlanStep[] = []
  const unavailable: PlanStepLike[] = []
  const visibleIndexByPlanIndex = new Map<number, number>()
  const seenLabels = new Map<string, number>()
  const seenUnavailable = new Set<string>()

  plan.forEach((step, planIndex) => {
    const state = stepState(step)
    if (state === 'unavailable') {
      const key = (step.limitation || step.label || step.kind || '').trim().toLowerCase()
      if (key && seenUnavailable.has(key)) return
      if (key) seenUnavailable.add(key)
      unavailable.push(step)
      return
    }
    if (HIDDEN_STEP_KINDS.has(step.kind)) return
    const label = (step.label || step.kind || '').trim()
    const key = label.toLowerCase()
    if (!label) return
    const kept = seenLabels.get(key)
    if (kept !== undefined) {
      // A collapsed duplicate still needs to resolve to the row that kept it,
      // otherwise pinning the duplicate would leave the checklist with no
      // current row while the overlay claimed one.
      visibleIndexByPlanIndex.set(planIndex, kept)
      return
    }
    seenLabels.set(key, steps.length)
    visibleIndexByPlanIndex.set(planIndex, steps.length)
    steps.push({ step, planIndex })
  })

  return { steps, unavailable, visibleIndexByPlanIndex }
}

/** The ONE resolved answer both surfaces render. */
export interface PlanFocus extends PartitionedPlan {
  /**
   * The visible row index the checklist marks as CURRENT, or -1 for none.
   * The overlay's "Step N of M" counter is `currentIndex + 1` — same number,
   * same array, so they cannot disagree.
   */
  currentIndex: number
  /**
   * True when the SERVER pinned an executing step (`activeStepIndex` resolved to
   * a visible, not-yet-done row). Only then does the overlay narrate a step and
   * show a counter; otherwise the server's own status text is what shows.
   */
  serverPinned: boolean
  /** Whether the checklist is actually rendered (>= MIN_VISIBLE_PLAN_STEPS rows). */
  checklistVisible: boolean
}

/**
 * Resolve the plan into the single focus both surfaces use.
 *
 * `activeStepIndex` is the server's own pointer into the raw plan array. It is
 * mapped through the SAME filtering/dedupe the checklist applies, so the pin
 * still lands on the correct visible row. When it cannot be mapped (the pinned
 * step turned out unavailable, or it is already ticked, or the server did not
 * send one yet) the checklist falls back to its long-standing "first pending
 * row" behaviour, and the overlay drops the counter rather than showing a number
 * that disagrees with what is drawn.
 */
export function focusPlan(
  plan: PlanStepLike[] | undefined,
  activeStepIndex: number | undefined,
  working: boolean,
): PlanFocus {
  const partitioned = partitionPlan(plan ?? [])
  const { steps, visibleIndexByPlanIndex } = partitioned
  const checklistVisible = steps.length >= MIN_VISIBLE_PLAN_STEPS

  if (!working || steps.length === 0) {
    return { ...partitioned, currentIndex: -1, serverPinned: false, checklistVisible }
  }

  const pinned =
    typeof activeStepIndex === 'number' && Number.isFinite(activeStepIndex)
      ? visibleIndexByPlanIndex.get(activeStepIndex)
      : undefined

  if (
    pinned !== undefined &&
    steps[pinned] &&
    stepState(steps[pinned].step) === 'pending'
  ) {
    return { ...partitioned, currentIndex: pinned, serverPinned: true, checklistVisible }
  }

  const firstPending = steps.findIndex(s => stepState(s.step) === 'pending')
  return {
    ...partitioned,
    currentIndex: firstPending,
    serverPinned: false,
    checklistVisible,
  }
}

// ───────────────────────────── narrative overlay ────────────────────────────

/** Aspect ratios we will name out loud. An allow-list, so "0:05" is never read
 *  as a ratio when the user was talking about a timestamp. */
const KNOWN_RATIOS = new Set([
  '9:16',
  '16:9',
  '1:1',
  '4:5',
  '5:4',
  '4:3',
  '3:4',
  '2:3',
  '3:2',
  '21:9',
])

/** Pull an aspect ratio out of the user's own words, or null. */
function ratioFrom(request: string): string | null {
  const m = request.match(/\b(\d{1,2})\s*[:x/]\s*(\d{1,2})\b/i)
  if (m) {
    const ratio = `${m[1]}:${m[2]}`
    if (KNOWN_RATIOS.has(ratio)) return ratio
  }
  if (/\b(vertical|portrait|reels?|tiktok|shorts?|stories)\b/i.test(request)) return '9:16'
  if (/\bsquare\b/i.test(request)) return '1:1'
  if (/\b(widescreen|landscape|horizontal)\b/i.test(request)) return '16:9'
  return null
}

/** Pull a duration ("10s", "2 min", "0:30") out of the user's own words. */
function durationFrom(request: string): string | null {
  const clock = request.match(/\b(\d{1,2}):([0-5]\d)\b/)
  if (clock) return `${clock[1]}:${clock[2]}`
  const m = request.match(/\b(\d{1,3})\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i)
  if (!m) return null
  const unit = m[2].toLowerCase()
  return unit.startsWith('m') && unit !== 'ms' ? `${m[1]} min` : `${m[1]}s`
}

/** Pull a speed factor ("2x", "half speed") out of the user's own words. */
function speedFrom(request: string): string | null {
  const m = request.match(/\b(\d+(?:\.\d+)?)\s*x\b/i)
  if (m) return `${m[1]}x`
  if (/\bhalf\s*speed\b|\bslow\s*(?:it|this)?\s*down\b/i.test(request)) return 'half speed'
  if (/\bdouble\s*speed\b|\bspeed\s*(?:it|this)?\s*up\b/i.test(request)) return 'double speed'
  return null
}

/** Pull a colour-grade look out of the user's own words. */
function lookFrom(request: string): string | null {
  const m = request.match(
    /\b(cinematic|warm|cool|vintage|retro|moody|vibrant|noir|monochrome|film)\b/i,
  )
  if (m) return m[1].toLowerCase()
  if (/\bblack\s*(?:and|&)\s*white\b|\bb\s*&\s*w\b/i.test(request)) return 'black and white'
  return null
}

/**
 * A NARRATIVE verb phrase for a plan step, deliberately different wording from
 * the checklist's terse label, with the user's own words woven in where they read
 * naturally (a ratio, a duration, a look).
 *
 * Returns null for a kind we have no honest phrasing for — the caller then falls
 * back to the server's own status text rather than inventing something.
 */
export function narrativePhraseFor(kind: string, request?: string): string | null {
  const req = (request || '').replace(/\s+/g, ' ').trim()
  switch (kind) {
    case 'aspect':
    case 'resize': {
      const ratio = ratioFrom(req)
      return ratio ? `Reframing your clip to ${ratio}` : 'Reframing your clip'
    }
    case 'crop': {
      const ratio = ratioFrom(req)
      return ratio ? `Cropping the frame to ${ratio}` : 'Cropping the frame'
    }
    case 'trim':
    case 'cut': {
      const duration = durationFrom(req)
      return duration ? `Trimming your clip to ${duration}` : 'Trimming your clip'
    }
    case 'speed': {
      const speed = speedFrom(req)
      return speed ? `Retiming your clip to ${speed}` : 'Retiming your clip'
    }
    case 'fades':
      return 'Easing your clip in and out'
    case 'audio_process':
      return 'Levelling the audio'
    case 'filter':
    case 'color_grade': {
      const look = lookFrom(req)
      return look ? `Grading the colour for a ${look} look` : 'Grading the colour'
    }
    case 'caption':
      return 'Writing captions onto your clip'
    case 'remove_silence':
      return 'Closing the silent gaps'
    case 'auto_cut':
      return 'Cutting your clip to the beat'
    case 'highlight':
      return 'Picking out the strongest moments'
    case 'concat':
      return 'Stitching your clips into one'
    case 'object_removal':
      return 'Painting out what you asked to remove'
    case 'background_replace':
      return 'Replacing the background behind your subject'
    case 'generative_edit':
      return 'Regenerating the part you asked about'
    case 'generate':
    case 'generate_broll':
      return 'Generating new footage for your clip'
    default:
      return null
  }
}

export interface OverlayLineInput {
  /** The server-streamed status line. Authoritative whenever no step is pinned. */
  status?: string
  /** The user's own instruction / subject, woven into the narrative. */
  request?: string
  /** The resolved focus — the SAME object the checklist renders from. */
  focus: PlanFocus
  /** Rotating pipeline copy used before any step is executing. */
  fallback: string
}

/**
 * Build the line overlaid on the preview.
 *
 * It is deliberately NOT the checklist's label: prose about the clip and the edit
 * that was asked for, plus a counter over the VISIBLE steps. It is composed
 * entirely from server-streamed plan data and the user's own words.
 *
 * Resolution order:
 *   1. no step pinned by the server → the server's `status` text, else the
 *      rotating pipeline copy (the long-standing behaviour),
 *   2. a step pinned but no honest phrasing for its kind → the server's `status`
 *      text (never an invented phrase), plus the counter,
 *   3. a step pinned with a phrasing → the narrative sentence, plus the counter.
 *
 * The counter appears only when the checklist is actually on screen, and its
 * number is `focus.currentIndex + 1` — the exact row the checklist highlights.
 */
export function buildOverlayLine({
  status,
  request,
  focus,
  fallback,
}: OverlayLineInput): string {
  const serverStatus = (status || '').trim()
  const current =
    focus.serverPinned && focus.currentIndex >= 0 ? focus.steps[focus.currentIndex] : null

  if (!current) return serverStatus || fallback

  const phrase = narrativePhraseFor(current.step.kind, request) || serverStatus
  if (!phrase) return fallback

  if (!focus.checklistVisible) return phrase
  return `${phrase} \u00b7 Step ${focus.currentIndex + 1} of ${focus.steps.length}`
}

// ─────────────────────────── stream de-duplication ──────────────────────────

/** The transient live card shape merged in `useChatStream`. */
export interface LiveVideoEditorCardLike {
  status?: string
  subject?: string
  phase?: string
  percent?: number
  activeStepIndex?: number
  plan?: PlanStepLike[]
}

/** A compact signature of everything the card actually renders from a plan. */
function planSignature(plan: PlanStepLike[] | undefined): string {
  if (!plan) return ''
  return plan
    .map(s => `${s.kind}|${s.type}|${s.status}|${s.label}|${s.limitation ?? ''}`)
    .join('\n')
}

/**
 * Whether two live-card snapshots are indistinguishable to the renderer.
 *
 * The driver re-emits the CURRENT phase/status/percent whenever it retires a step
 * or reports one as unavailable, and a provider sub-progress note can repeat the
 * previous line verbatim. Those emits carry no new information, so merging them
 * only churns React state. Every field the card reads is compared — including the
 * per-step statuses and the active-step pointer — so a real advance is never
 * dropped.
 */
export function isSameLiveVideoEditorCard(
  a: LiveVideoEditorCardLike,
  b: LiveVideoEditorCardLike,
): boolean {
  return (
    a.status === b.status &&
    a.subject === b.subject &&
    a.phase === b.phase &&
    a.percent === b.percent &&
    a.activeStepIndex === b.activeStepIndex &&
    planSignature(a.plan) === planSignature(b.plan)
  )
}
