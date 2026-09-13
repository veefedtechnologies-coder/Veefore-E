/**
 * VideoEditorChatCard — the in-chat surface for the AI Video Editor
 * (`video_editor` InfoCard kind).
 *
 * This card is PURELY PRESENTATIONAL. It does NOT run its own editor chat, has NO
 * text composer, and never drives a converse loop. The whole interaction is
 * multi-turn through the MAIN VeeGPT composer: each edit request the user types
 * there makes the model call the `video_editor` tool, the SERVER drives the edit
 * (Intent_Router → new Version → Editing_Planner → deterministic execution) and
 * streams stage-derived progress into the chat, and this card just RENDERS that
 * progress and the final result.
 *
 * It renders from two data sources, both shaped the same:
 *   - the transient LIVE card (`liveVideoEditorCard`) updated by streamed
 *     `videoEditorProgress` events (phase/percent/plan/status) WHILE the turn
 *     runs, and
 *   - the final `video_editor` info-card that lands on completion, carrying the
 *     rendered artifact (`resultArtifactId` + `versionId`) to play/download, or
 *     an honest "queued for the render pipeline" status.
 *
 * Follow-up refinements ("make it 9:16", "trim to 10s") are just more messages in
 * the main composer — never typed into this card.
 *
 * HONESTY RULES baked into this file (they are load-bearing, not cosmetic):
 *   - A server-streamed `card.status` wins over generated copy in every terminal
 *     state, and whenever the server has NOT pinned an executing step. While a
 *     step IS pinned, the overlay narrates THAT step — a sentence composed only
 *     from server-streamed plan data plus the user's own words, never invented.
 *   - The overlay line and the checklist resolve from ONE value
 *     (`focusPlan(...).currentIndex` in `video-editor-card.logic.ts`), so the
 *     "Step N of M" counter can never disagree with the highlighted row.
 *   - The rotating stage text describes VEEFORE'S OWN pipeline stages only. It
 *     never invents model-internal steps or timings, and it is switched OFF as
 *     soon as a streamed status/step drives the line.
 *   - A plan step the planner or the executor could NOT run
 *     (`status: 'unavailable'`) is NEVER shown as completed and never left
 *     spinning as the current step. It is lifted out of the checklist and named
 *     in a quiet footnote using the reported `limitation` text, so nothing is
 *     silently swallowed.
 *
 * Blue accent, rounded, dark-mode aware — visually consistent with
 * {@link ImageGenerationCard}, with which it shares the animated surface
 * ({@link GenerativeDotGridSurface}) and the stage-rotation hook.
 */

import React, { useRef, useState } from 'react'
import {
  Clapperboard,
  Check,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  MinusCircle,
} from 'lucide-react'

import { VideoPreview } from '@/features/video-editor/components/VideoPreview'
import { useSignedArtifactUrl } from '@/features/video-editor/hooks/useSignedArtifactUrl'
import type { VideoEditorAttachedSource } from '@/features/video-editor/types'

import { useRotatingStage } from './GenerativeDotGridSurface'
import {
  buildOverlayLine,
  focusPlan,
  stepState,
  MIN_VISIBLE_PLAN_STEPS,
  type PlanFocus,
  type PlanStepLike,
  type VisiblePlanStep,
} from './video-editor-card.logic'

export interface VideoEditorCardData {
  id?: string
  kind: 'video_editor' | string
  /** The Video_Project the attached video was ingested into (server-created). */
  projectId?: string
  /** The ingested/reused Video_Source id (durationMs > 0). */
  sourceId?: string
  /** Active workspace id (used to resolve the signed artifact URL). */
  workspaceId?: string
  /** The edit the user asked for (header hint / subject). */
  instruction?: string
  /** Source duration in ms (for a small header hint). */
  durationMs?: number
  /** Stage-derived phase: preparing | classifying | versioning | planning |
   *  rendering | complete | queued | clarification | error. */
  phase?: string
  /** Transient live status text while a turn runs. */
  status?: string
  /**
   * Integer progress percentage (0..100), stage-derived.
   *
   * INTENTIONALLY NOT DISPLAYED. The server still streams it and other code may
   * read it, so it stays on the contract, but this card renders no progress bar
   * and no percentage text — the live stage line carries the state instead.
   */
  percent?: number
  /** Planned steps, emitted once planning completes. `limitation` is set only for
   *  a step the planner marked `unavailable`. */
  plan?: Array<{
    kind: string
    type: string
    status: string
    label: string
    limitation?: string
  }>
  /**
   * Index into the SAME `plan` array of the step the server is working on.
   *
   * ONE SOURCE OF TRUTH: both the checklist's current-row highlight and the
   * overlay's "Step N of M" counter resolve from this, so the two surfaces cannot
   * contradict each other. Absent means nothing is executing yet (or the turn is
   * over), in which case the server's status text drives the line and no counter
   * is shown.
   */
  activeStepIndex?: number
  /** Short subject of the request (for the preparing card's text). */
  subject?: string
  /** The rendered output artifact id — present only on a completed edit. */
  resultArtifactId?: string
  /** The immutable version the edit produced. */
  versionId?: string
  /** The deterministic operation kind that was rendered (trim/aspect/…). */
  resultKind?: string
}

/**
 * Fully borderless, softly elevated surface — same language as
 * {@link ImageGenerationCard}. NO ring/border anywhere: a 1px hairline over the
 * chat background read as a cold blue outline, so the shell relies on the
 * background fill plus `shadow-sm` alone.
 */
const cardShell =
  'w-full max-w-2xl rounded-2xl bg-gray-100 dark:bg-slate-800/60 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out'

const cardTitle =
  'text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 flex items-center gap-1.5'

/**
 * Quiet toolbar metadata pill (duration, applied edit kind, version). Filled, no
 * ring — the card must show no crisp 1px outline anywhere.
 */
const Chip: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'success' }> = ({
  children,
  tone = 'neutral',
}) => (
  <span
    className={
      tone === 'success'
        ? 'inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300'
        : 'inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400'
    }
  >
    {children}
  </span>
)

/** Format a duration in ms as a compact m:ss label (e.g. "1:07"). */
function formatDuration(ms?: number): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Humanise a deterministic operation kind (`aspect_ratio` → `Aspect ratio`). */
function formatEditKind(kind?: string): string | null {
  const k = (kind || '').trim()
  if (!k) return null
  const words = k.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Whether the card is still working (any non-terminal phase).
 *
 * `transcribing` MUST be in this list: it is a real streamed phase (the caption
 * burn-in's speech-to-text pre-pass). Omitting it made a captioned edit flip the
 * card to "idle" mid-turn, which swapped the preview to the static surface and
 * so unmounted/remounted the live dot in the middle of a run.
 */
function isWorking(phase?: string): boolean {
  return (
    !phase ||
    phase === 'preparing' ||
    phase === 'classifying' ||
    phase === 'versioning' ||
    phase === 'planning' ||
    phase === 'transcribing' ||
    phase === 'rendering'
  )
}

/** A default, human-friendly status line for a phase when none is streamed. */
function statusForPhase(phase?: string, subject?: string): string {
  const s = (subject || '').trim()
  switch (phase) {
    case 'classifying':
      return 'Understanding your edit…'
    case 'versioning':
      return 'Creating a new version…'
    case 'planning':
      return 'Planning the edit…'
    case 'transcribing':
      return 'Transcribing the audio…'
    case 'rendering':
      return 'Rendering your video…'
    case 'complete':
      return 'Your edited video is ready.'
    case 'queued':
      return 'Queued for the render pipeline…'
    case 'error':
      return 'That edit couldn’t be completed.'
    default:
      return s ? `Preparing your video to ${s}…` : 'Preparing your video for editing…'
  }
}

/**
 * Build the rotating pipeline-stage messages for a video edit.
 *
 * These map onto OUR pipeline — prepare the clip, classify the intent, create a
 * version, plan the operations, render, encode — and weave in what the user asked
 * for so the card reads like it understood the request. They describe nothing
 * about a model's internals, which is a hard rule in this codebase.
 */
function buildVideoStages(subject?: string): string[] {
  const s = (subject || '').trim()
  const goal = s ? ` to ${s}` : ''
  return [
    `Preparing your clip${goal}`,
    s ? `Understanding “${s}”` : 'Understanding your edit',
    'Creating a new version of your video',
    'Planning the edit steps',
    `Rendering your video${goal}`,
    'Encoding the final file',
    'Almost there',
  ]
}

type PlanStep = PlanStepLike

/**
 * The plan as a quiet inline checklist (NOT a wizard stepper).
 *
 * Deliberately calm: 10px markers, a hairline muted connector, tight vertical
 * rhythm, and the same text weight in every state — state is carried by the
 * marker plus a screen-reader-only word, never by colour or weight alone.
 *
 * Renders nothing at 0 or 1 visible step: a one-item checklist is noise, and the
 * status line overlaid on the preview already says what is happening.
 *
 * The CURRENT row comes from {@link PlanFocus.currentIndex} — the very same
 * resolved value the overlay's "Step N of M" counter uses, so the two surfaces
 * cannot point at different steps.
 */
function PlanSteps({
  steps,
  currentIndex,
  working,
}: {
  steps: VisiblePlanStep[]
  currentIndex: number
  working: boolean
}) {
  if (steps.length < MIN_VISIBLE_PLAN_STEPS) return null

  return (
    <ol className="flex flex-col gap-1.5" data-testid="video-editor-plan">
      {steps.map(({ step, planIndex }, i) => {
        const state = stepState(step)
        const done = state === 'done'
        const current = working && !done && i === currentIndex
        const isLast = i === steps.length - 1
        return (
          // Keyed on the step's PLAN index, not its row position: when a step
          // leaves the checklist (reported unavailable mid-turn) the surviving
          // rows keep their identity instead of remounting and restarting the
          // current-step pulse animation.
          <li key={`${step.kind}-${planIndex}`} className="relative flex items-center gap-2.5">
            {/* Muted hairline connector between markers. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[4.5px] top-[15px] h-[9px] w-px bg-gray-200 dark:bg-white/[0.08]"
              />
            )}

            <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              {done ? (
                <Check className="h-2.5 w-2.5 text-emerald-500" aria-hidden="true" />
              ) : current ? (
                <>
                  <span
                    aria-hidden="true"
                    className="veegpt-vid-step-pulse absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-500/30"
                  />
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"
                  />
                </>
              ) : (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-white/20"
                />
              )}
            </span>

            <span
              className={`min-w-0 truncate text-[13px] ${
                done
                  ? 'text-gray-500 dark:text-gray-400'
                  : current
                    ? 'text-gray-700 dark:text-gray-200'
                    : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {step.label}
              <span className="sr-only">
                {done ? ' — done' : current ? ' — in progress' : ' — not started'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The honest footnote for steps no engine could perform.
 *
 * Non-negotiable in this repo: an unavailable step is never silently swallowed
 * and never dressed up as success. It reads as a quiet secondary aside — muted
 * text, a neutral minus marker (NOT a green check, NOT a red alarm) — naming the
 * planner's own `limitation` when it streamed one, and the humanised label
 * otherwise.
 */
function UnavailableNote({ steps }: { steps: PlanStep[] }) {
  if (!steps.length) return null
  const reasons = steps.map(s => (s.limitation || '').trim() || s.label || s.kind).filter(Boolean)
  if (!reasons.length) return null

  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-gray-400 dark:text-gray-500">
      <MinusCircle className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">Skipped — {reasons.join('; ')}</span>
    </p>
  )
}

/** Best-effort blob download so the signed URL is never mutated or exposed. */
async function downloadVideo(url: string, name: string): Promise<void> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
  } catch {
    /* ignore — download is best-effort */
  }
}

export const VideoEditorChatCard: React.FC<{ card: VideoEditorCardData }> = ({ card }) => {
  const workspaceId = card.workspaceId ?? null
  const durationLabel = formatDuration(card.durationMs)
  const editKindLabel = formatEditKind(card.resultKind)
  const working = isWorking(card.phase)
  const errored = card.phase === 'error'

  // ONE resolved answer for both surfaces: which visible row is current, and
  // whether the SERVER pinned it (only then does the overlay show a counter).
  const focus: PlanFocus = React.useMemo(
    () => focusPlan(card.plan, card.activeStepIndex, working && !errored),
    [card.plan, card.activeStepIndex, working, errored],
  )

  // Rotating pipeline copy, used only before any step is executing. The rotation
  // is DISABLED whenever a streamed status is driving the line: its 1900 ms timer
  // used to keep re-rendering the card for a value that was then discarded.
  const stagesRef = useRef<string[]>([])
  stagesRef.current = buildVideoStages(card.subject || card.instruction)
  const rotationActive = working && !errored && !card.status && !focus.serverPinned
  const rotatingStage = useRotatingStage(rotationActive, stagesRef.current)

  const request = card.instruction || card.subject
  const statusText = working && !errored
    ? // Working: the narrative line (server-pinned step + counter) or, when
      // nothing is executing yet, the server's status / the rotating copy.
      buildOverlayLine({
        status: card.status,
        request,
        focus,
        fallback: rotatingStage,
      })
    : // Terminal states: a streamed status always wins outright.
      card.status || statusForPhase(card.phase, card.subject || card.instruction)

  const attachedSource: VideoEditorAttachedSource | null = card.sourceId
    ? { id: card.sourceId }
    : null
  const artifactId = card.resultArtifactId ?? null

  const planSteps = focus.steps
  const unavailableSteps = focus.unavailable

  // Same query key as the preview, so this shares the cached signed URL rather
  // than issuing a second request. Used only to enable the Download action.
  const { url: artifactUrl } = useSignedArtifactUrl(workspaceId, artifactId)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!artifactUrl || downloading) return
    setDownloading(true)
    try {
      await downloadVideo(artifactUrl, `veefore-edit-${(card.versionId || 'video').slice(-8)}.mp4`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={cardShell} data-testid="video-editor-chat-card">
      {/* Toolbar: label on the left, quiet metadata chips on the right. */}
      <div className="mb-3 flex items-center gap-2">
        <span className={cardTitle}>
          <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Video editor
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {durationLabel && <Chip>{durationLabel}</Chip>}
          {editKindLabel && <Chip>{editKindLabel}</Chip>}
        </span>
      </div>

      {/* `video-editor-progress` now marks the working column as a whole — the
          status row it used to sit on has been deleted. */}
      <div
        className="flex flex-col gap-3"
        {...(working && !errored ? { 'data-testid': 'video-editor-progress' } : {})}
      >
        {/* Source / rendered-result preview. When a rendered artifact exists the
            preview plays it via a short-lived signed URL; otherwise it shows the
            animated (working) or static (idle) generative surface. */}
        <VideoPreview
          workspaceId={workspaceId}
          artifactId={artifactId}
          attachedSource={attachedSource}
          working={working && !errored}
          stageText={statusText}
        />

        {/* The live status text is rendered ONCE — overlaid top-left on the
            preview surface above (with the live dot and the polite live region).
            The duplicate status row that used to sit here, and the progress bar
            with it, are gone by design. */}

        {/* The planned steps (once known), then the honest note about anything
            that could not be done. */}
        <PlanSteps
          steps={planSteps}
          currentIndex={focus.currentIndex}
          working={working && !errored}
        />
        <UnavailableNote steps={unavailableSteps} />

        {/* Completed deliverable: success chip, what was applied, and actions. */}
        {card.phase === 'complete' && artifactId && (
          <div
            className="flex flex-col gap-2 rounded-xl bg-emerald-500/[0.06] p-3"
            data-testid="video-editor-result"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="success">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Ready
              </Chip>
              {editKindLabel && <Chip>{editKindLabel}</Chip>}
              {card.versionId && <Chip>Version {card.versionId.slice(-6)}</Chip>}
            </div>
            <div className="flex items-center gap-3">
              <p className="min-w-0 text-sm text-gray-600 dark:text-gray-300">
                Your edited video is ready — play it above or download it.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!artifactUrl || downloading}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-blue-600 disabled:opacity-50 dark:bg-white/5 dark:text-gray-200 dark:hover:text-blue-400"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {downloading ? 'Saving…' : 'Download'}
              </button>
            </div>
          </div>
        )}

        {/* Honest "queued for the async pipeline" state (generative/caption edits). */}
        {card.phase === 'queued' && (
          <div
            className="flex items-start gap-2 rounded-xl bg-amber-500/[0.08] p-3 text-sm text-amber-700 dark:text-amber-300"
            data-testid="video-editor-queued"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{statusText}</span>
          </div>
        )}

        {/* Failure. We surface the streamed reason when there is one and never
            invent one when there is not. */}
        {errored && (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/[0.07] p-3 text-sm text-red-600 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{statusText}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoEditorChatCard
