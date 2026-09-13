/**
 * AutoPilotChat
 *
 * The VeeGPT-style conversational surface for VeeGPT Auto Pilot. Instead of a
 * plain form + dashboard, Auto Pilot presents itself as an AI "mission bot":
 *
 *   • a chat header with the bot identity, the active mission + live status, and
 *     the lifecycle controls (Activate / Pause / Resume) + New mission;
 *   • a scrolling message feed of bot bubbles — a greeting, the mission setup
 *     (rendered inline as a bot card while there's no mission), a mission
 *     briefing, the live Goal-progress card, pending Approval_Cards, and the
 *     Operating-Loop activity narrated as chat messages (oldest → newest);
 *   • a bottom composer tuned for Auto Pilot: it is NOT a free-form LLM chat,
 *     so it accepts a small set of natural mission commands (activate, pause,
 *     resume, status, new mission) and the bot replies + performs the action.
 *
 * Data comes from react-query (`getMission`, `listApprovals`, `listActivity`)
 * and refreshes live over the workspace Auto Pilot WebSocket channel
 * ({@link useAutoPilotRealtime}) with a polling fallback, mirroring the old
 * MissionControlDashboard's behaviour (R16.4–R16.6).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 16.1, 16.4, 16.5, 16.6
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  AtSign,
  Calendar,
  ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Instagram } from 'lucide-react'
import { GoalProgressWidget } from './GoalProgressWidget'
import { useMissionSetupAI } from './useMissionSetupAI'
import { MissionSetupForm } from './MissionSetupForm'
import { MediaUploadCard } from './MediaUploadCard'
import { ApprovalCard, type ApprovalCardData } from './ApprovalCard'
import { useAutoPilotRealtime } from '../hooks/useAutoPilotRealtime'
import {
  activityLabel,
  currentProgressValue,
  formatMetric,
  formatTimestamp,
  goalProgressPercent,
  outcomeTone,
} from './missionControl'
import {
  activateMission,
  getMission,
  listActivity,
  listApprovals,
  listAutomations,
  listSlots,
  pauseMission,
  resumeMission,
  type ActivityRecord,
  type ContentSlot,
  type Mission,
  type MissionAutomation,
  type MissionDetail,
  type PendingApproval,
} from '../api/autopilotApi'

/** Poll fallback cadence (ms) when the live socket is unavailable. */
const POLL_INTERVAL_MS = 30_000

const queryKeys = {
  mission: (id: string) => ['/api/v1/autopilot/missions', id] as const,
  approvals: (id: string) => ['/api/v1/autopilot/missions', id, 'approvals'] as const,
  activity: (id: string) => ['/api/v1/autopilot/missions', id, 'activity'] as const,
  slots: (id: string) => ['/api/v1/autopilot/missions', id, 'slots'] as const,
  automations: (id: string) => ['/api/v1/autopilot/missions', id, 'automations'] as const,
}

const toneDot: Record<ReturnType<typeof outcomeTone>, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  blocked: 'bg-amber-500',
  neutral: 'bg-gray-400',
}

const STATUS_TONE: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  draft: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

/* -------------------------------------------------------------------------- */
/* Presentational chat primitives                                             */
/* -------------------------------------------------------------------------- */

/** The Auto Pilot bot avatar — a gradient rocket, mirroring the VeeGPT look. */
const BotAvatar: React.FC<{ className?: string }> = ({ className = 'h-7 w-7' }) => (
  <span
    className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm ${className}`}
    aria-hidden="true"
  >
    <Rocket className="h-4 w-4" />
  </span>
)

/** An assistant ("Auto Pilot") message row: avatar + label + bubble content. */
const BotBubble: React.FC<{
  children: React.ReactNode
  status?: string
  /** When true the content spans wide (for cards); otherwise a chat bubble. */
  wide?: boolean
}> = ({ children, status = 'Auto Pilot', wide = false }) => (
  <div className="flex items-start gap-3">
    <BotAvatar />
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        <span className="tracking-tight">{status}</span>
      </div>
      {wide ? (
        <div className="min-w-0">{children}</div>
      ) : (
        <div className="inline-block max-w-2xl whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-gray-800 shadow-sm dark:bg-slate-800 dark:text-gray-100">
          {children}
        </div>
      )}
    </div>
  </div>
)

/** A right-aligned user message bubble. */
const UserBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex justify-end">
    <div className="max-w-md rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
      {children}
    </div>
  </div>
)

/** Auto Pilot welcome hero (shown before the user's first prompt) — mirrors the
 *  VeeGPT welcome screen: centered heading, a centered input bar with an account
 *  picker, and suggestion pills below. Quick prompts + free text both seed the AI. */
const WELCOME_PROMPTS = [
  'Grow my page to 10k followers in 3 months',
  'Get more engagement on my content',
  'Run my account on autopilot within safe guardrails',
  'Plan and post 3 reels a week',
]

const AutoPilotWelcome: React.FC<{
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onPrompt: (text: string) => void
  accounts: AutoPilotAccountOption[]
  selectedAccountId: string | null
  onSelectAccount: (id: string) => void
  disabled?: boolean
}> = ({ value, onChange, onSubmit, onPrompt, accounts, selectedAccountId, onSelectAccount, disabled }) => {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }
  return (
    <div className="flex min-h-[62vh] w-full flex-col items-center justify-center px-2">
      <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
        <Rocket className="h-7 w-7" />
      </span>
      <h1 className="text-center text-[2.25rem] font-semibold leading-tight tracking-tight text-gray-900 dark:text-gray-50">
        Put your growth on{' '}
        <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
          Auto Pilot
        </span>
      </h1>
      <p className="mt-3 max-w-xl text-center text-[15px] text-gray-500 dark:text-gray-400">
        Tell me your goal in your own words. I analyze your account, then plan, create, and schedule
        content to hit your target.
      </p>

      {/* Centered input bar (VeeGPT-style) */}
      <div className="mt-8 w-full max-w-2xl">
        <div className="rounded-[20px] border border-gray-200/80 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all focus-within:border-blue-400/60 focus-within:shadow-[0_4px_24px_rgba(59,130,246,0.12)] dark:border-white/10 dark:bg-slate-800/70">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={disabled}
            placeholder="Describe your mission — e.g. “grow my vegan meal-prep page to 10k followers”"
            className="w-full resize-none border-0 bg-transparent px-5 py-4 text-[16px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 disabled:opacity-60 dark:text-gray-100"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            {/* Account picker — which account to grow */}
            {accounts.length > 0 ? (
              <div className="relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200">
                <AtSign className="h-3.5 w-3.5 text-gray-400" />
                <select
                  value={selectedAccountId ?? ''}
                  onChange={(e) => onSelectAccount(e.target.value)}
                  className="max-w-[160px] cursor-pointer truncate bg-transparent pr-1 text-sm font-medium focus:outline-none"
                  aria-label="Account to grow"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.username ? `@${a.username}` : a.id}
                      {a.platform ? ` · ${a.platform}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs text-gray-400">No connected account</span>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || !value.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white transition-all hover:brightness-110 disabled:opacity-40"
              aria-label="Send"
            >
              {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Suggestion pills below the input */}
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {WELCOME_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              disabled={disabled}
              className="rounded-full border border-gray-200/80 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-blue-300/70 hover:bg-blue-50/50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/60 dark:text-gray-200 dark:hover:bg-slate-700/70"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Map a pending approval into the shape the chat ApprovalCard renders. */
function toApprovalCard(a: PendingApproval): ApprovalCardData {
  return {
    kind: 'approval',
    approvalId: a.id,
    itemType: a.itemType,
    itemRef: a.itemRef ?? undefined,
    ...(a.editedPayload ?? {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Local command exchange (composer)                                          */
/* -------------------------------------------------------------------------- */

type LocalMsg = { id: number; role: 'user' | 'bot'; text: string }

/** localStorage key prefix for the per-mission composer exchange. */
const LOCAL_MSG_STORAGE_PREFIX = 'veefore.autopilot.chat.'

/** Load a mission's persisted composer messages (empty on any failure). */
function loadLocalMsgs(storageKey: string | null): LocalMsg[] {
  if (!storageKey || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is LocalMsg =>
        m &&
        typeof m.id === 'number' &&
        (m.role === 'user' || m.role === 'bot') &&
        typeof m.text === 'string',
    )
  } catch {
    return []
  }
}

/** A selectable social account the mission can target. */
export interface AutoPilotAccountOption {
  id: string
  username?: string
  platform?: string
  profilePictureUrl?: string
}

export interface AutoPilotChatProps {
  /** Setup mode when null; control mode when a mission id is provided. */
  missionId?: string | null
  workspaceId?: string | null
  /** Default connected account (setup mode). */
  accountId?: string | null
  hasConnectedAccount?: boolean
  platform?: string
  /** All connected accounts in the workspace, for the setup account picker. */
  accounts?: AutoPilotAccountOption[]
  /** All of the workspace's missions (for the header switcher). */
  missions?: Mission[]
  selectedMissionId?: string | null
  onSelectMission?: (id: string) => void
  /** Called with the created mission after setup succeeds. */
  onCreated?: (mission: Mission) => void
  /** Start a fresh mission (control mode header + composer command). */
  onNewMission?: () => void
  /** Cancel setup (only when other missions already exist). */
  onCancelSetup?: () => void
}

export const AutoPilotChat: React.FC<AutoPilotChatProps> = ({
  missionId,
  workspaceId,
  accountId,
  hasConnectedAccount = false,
  platform = 'instagram',
  accounts = [],
  missions = [],
  selectedMissionId,
  onSelectMission,
  onCreated,
  onNewMission,
  onCancelSetup,
}) => {
  const isSetup = !missionId
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [command, setCommand] = useState('')
  // Composer command exchange, persisted per mission so it survives mission
  // switches and page reloads (but stays isolated to its own mission).
  const chatStorageKey = missionId ? `${LOCAL_MSG_STORAGE_PREFIX}${missionId}` : null
  const [localMsgs, setLocalMsgs] = useState<LocalMsg[]>(() => loadLocalMsgs(chatStorageKey))
  const localIdRef = useRef(localMsgs.reduce((max, m) => Math.max(max, m.id), 0) + 1)

  // Persist the composer exchange whenever it changes (control mode only).
  useEffect(() => {
    if (!chatStorageKey || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(chatStorageKey, JSON.stringify(localMsgs))
    } catch {
      /* ignore storage quota / unavailable */
    }
  }, [chatStorageKey, localMsgs])

  // Which account the user wants to grow (setup mode). Defaults to the resolved
  // account, else the first connected one.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    accountId ?? accounts[0]?.id ?? null,
  )
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const effectiveAccountId = selectedAccountId ?? accountId ?? null
  const effectivePlatform = selectedAccount?.platform ?? platform

  // AI-driven mission setup (setup mode). The composer sends natural-language
  // prompts; the AI extracts fields (grounded in the selected account's DB
  // analytics) and surfaces a dynamic slide-up form.
  const setup = useMissionSetupAI({
    workspaceId: workspaceId ?? undefined,
    accountId: effectiveAccountId,
    platform: effectivePlatform,
    onCreated,
  })

  /* ---- Control-mode data (mirrors MissionControlDashboard) --------------- */
  const missionQuery = useQuery({
    queryKey: missionId ? queryKeys.mission(missionId) : ['autopilot-mission-none'],
    queryFn: () => getMission(missionId as string),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const approvalsQuery = useQuery({
    queryKey: missionId ? queryKeys.approvals(missionId) : ['autopilot-approvals-none'],
    queryFn: () => listApprovals(missionId as string),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const activityQuery = useQuery({
    queryKey: missionId ? queryKeys.activity(missionId) : ['autopilot-activity-none'],
    queryFn: () => listActivity(missionId as string),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const slotsQuery = useQuery({
    queryKey: missionId ? queryKeys.slots(missionId) : ['autopilot-slots-none'],
    queryFn: () => listSlots(missionId as string),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const automationsQuery = useQuery({
    queryKey: missionId ? queryKeys.automations(missionId) : ['autopilot-automations-none'],
    queryFn: () => listAutomations(missionId as string),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const handleRealtimeMessage = useCallback(() => {
    if (!missionId) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.mission(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.approvals(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.activity(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.slots(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.automations(missionId) })
  }, [queryClient, missionId])

  useAutoPilotRealtime({
    workspaceId,
    enabled: !!missionId && !!workspaceId,
    onMessage: handleRealtimeMessage,
  })

  const mission = missionQuery.data
  const approvals = approvalsQuery.data ?? []
  const slots = slotsQuery.data ?? []
  const automations = automationsQuery.data ?? []
  // Activity comes newest-first from the API; a chat reads oldest → newest.
  const activity = useMemo<ActivityRecord[]>(
    () => [...(activityQuery.data ?? [])].reverse(),
    [activityQuery.data],
  )

  const onMutated = useCallback(
    (m: MissionDetail) => {
      if (!missionId) return
      queryClient.setQueryData(queryKeys.mission(missionId), m)
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(missionId) })
    },
    [queryClient, missionId],
  )

  const activate = useMutation({
    mutationFn: () => activateMission(missionId as string),
    onSuccess: onMutated,
  })
  const pause = useMutation({
    mutationFn: () => pauseMission(missionId as string),
    onSuccess: onMutated,
  })
  const resume = useMutation({
    mutationFn: () => resumeMission(missionId as string),
    onSuccess: onMutated,
  })
  const mutating = activate.isPending || pause.isPending || resume.isPending

  const canActivate = mission?.status === 'draft'
  const canPause = mission?.status === 'active'
  const canResume = mission?.status === 'paused'

  const lifecycleError =
    (activate.error as Error | null)?.message ??
    (pause.error as Error | null)?.message ??
    (resume.error as Error | null)?.message ??
    null

  /* ---- Auto-scroll the feed to the newest content ------------------------ */
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [
    isSetup,
    missionId,
    activity.length,
    approvals.length,
    localMsgs.length,
    setup.messages.length,
    mission?.status,
  ])

  /* ---- Composer command handling ----------------------------------------- */
  const pushLocal = (role: 'user' | 'bot', text: string) =>
    setLocalMsgs((prev) => [...prev, { id: localIdRef.current++, role, text }])

  const runCommand = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    pushLocal('user', text)
    setCommand('')

    const lc = text.toLowerCase()
    const has = (...words: string[]) => words.some((w) => lc.includes(w))

    // New mission is available in both modes.
    if (has('new mission', 'new goal', 'start over', 'create mission')) {
      pushLocal('bot', "Let's set up a fresh mission. Fill in the goal and guardrails above.")
      onNewMission?.()
      return
    }

    if (!mission) {
      pushLocal('bot', 'Set your goal and guardrails in the form above and I’ll get started.')
      return
    }

    if (has('pause', 'stop', 'hold')) {
      if (canPause) {
        pause.mutate()
        pushLocal('bot', 'Pausing the mission — I’ll stop starting new actions within a minute.')
      } else {
        pushLocal('bot', `The mission is ${mission.status}, so there’s nothing running to pause.`)
      }
      return
    }
    if (has('resume', 'continue', 'restart', 'unpause')) {
      if (canResume) {
        resume.mutate()
        pushLocal('bot', 'Resuming — the Operating Loop is picking back up.')
      } else {
        pushLocal('bot', `The mission is ${mission.status}; resume only applies when it’s paused.`)
      }
      return
    }
    if (has('activate', 'launch', 'go live', 'start mission', 'begin')) {
      if (canActivate) {
        activate.mutate()
        pushLocal('bot', 'Activating your mission 🚀 — I’ll start sensing, planning, and drafting content.')
      } else if (canResume) {
        resume.mutate()
        pushLocal('bot', 'The mission was paused — resuming it now.')
      } else {
        pushLocal('bot', `The mission is already ${mission.status}.`)
      }
      return
    }
    if (has('status', 'progress', 'how', 'update', 'doing')) {
      const pct = goalProgressPercent(mission)
      const current = currentProgressValue(mission)
      const metric = formatMetric(mission.goal?.metric).toLowerCase()
      const pending = approvals.length
      pushLocal(
        'bot',
        `You're at ${current.toLocaleString()} ${metric} (${pct}% of goal). Status: ${mission.status}. ` +
          (pending > 0
            ? `${pending} item${pending === 1 ? '' : 's'} waiting on your approval below.`
            : 'Nothing waiting on your approval right now.'),
      )
      return
    }

    // Auto Pilot is not a free-form chat — steer the user to what it can do.
    pushLocal(
      'bot',
      'I run your mission automatically. You can tell me to “activate”, “pause”, “resume”, ask for “status”, or start a “new mission”. To change the goal or guardrails, start a new mission.',
    )
  }

  // Unified composer submit: in setup mode prompts feed the AI interpreter; in
  // control mode they're mission commands.
  const submitComposer = (text: string) => {
    const t = text.trim()
    if (!t) return
    if (isSetup) {
      setup.sendPrompt(t)
      setCommand('')
    } else {
      runCommand(t)
    }
  }

  const onComposerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitComposer(command)
    }
  }

  /* ---- Header ------------------------------------------------------------ */
  const headerTitle = isSetup
    ? 'Auto Pilot'
    : mission?.niche || 'Auto Pilot mission'
  const headerStatus = isSetup ? 'Set up a mission' : mission?.operatingMode

  const suggestions = mission
    ? canActivate
      ? ['Activate mission', 'Status', 'New mission']
      : canPause
        ? ['Pause', 'Status', 'New mission']
        : canResume
          ? ['Resume', 'Status', 'New mission']
          : ['Status', 'New mission']
    : []

  // Quick-reply chips + placeholder + disabled state, per mode.
  const composerChips: { label: string; value: string }[] = isSetup
    ? []
    : suggestions.map((s) => ({ label: s, value: s }))
  const composerPlaceholder = isSetup
    ? 'Describe your mission — e.g. “grow my vegan meal-prep page to 10k followers, 3 posts a week, warm friendly voice”'
    : 'Tell Auto Pilot to activate, pause, resume, or ask for a status update…'
  const composerDisabled = isSetup
    ? !hasConnectedAccount || setup.loading || setup.submitting
    : false
  const onChipClick = (value: string) => (isSetup ? submitComposer(value) : runCommand(value))

  return (
    <div className="flex h-full flex-1 flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="z-20 flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 bg-white/80 dark:bg-slate-900/80">
        <div className="flex min-w-0 items-center gap-2.5">
          <BotAvatar className="h-8 w-8" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">
                {headerTitle}
              </span>
              {!isSetup && mission && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    STATUS_TONE[mission.status] ?? STATUS_TONE.draft
                  }`}
                >
                  {mission.status}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{headerStatus}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {!isSetup && canActivate && (
            <Button size="sm" onClick={() => activate.mutate()} disabled={mutating}>
              <Play className="mr-1.5 h-4 w-4" />
              Activate
            </Button>
          )}
          {!isSetup && canResume && (
            <Button size="sm" onClick={() => resume.mutate()} disabled={mutating}>
              <Play className="mr-1.5 h-4 w-4" />
              Resume
            </Button>
          )}
          {!isSetup && canPause && (
            <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={mutating}>
              <Pause className="mr-1.5 h-4 w-4" />
              Pause
            </Button>
          )}
          {!isSetup && onNewMission && (
            <Button size="sm" variant="ghost" onClick={onNewMission} disabled={mutating}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New mission</span>
            </Button>
          )}
          {isSetup && onCancelSetup && (
            <Button size="sm" variant="ghost" onClick={onCancelSetup}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Mission switcher (control mode, >1 mission) */}
      {!isSetup && missions.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-2 dark:border-white/5">
          {missions.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMission?.(m.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                m.id === selectedMissionId
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'
              }`}
            >
              {m.niche || m.goal.metric}
            </button>
          ))}
        </div>
      )}

      {/* Feed */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-6 overflow-y-auto bg-gradient-to-b from-gray-50/40 to-white px-4 py-6 dark:from-slate-900/40 dark:to-slate-900 sm:px-6"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {isSetup ? (
            !hasConnectedAccount ? (
              <BotBubble status="Auto Pilot">
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5">
                    <Instagram className="h-4 w-4 text-pink-500" />
                    Let’s connect Instagram first.
                  </p>
                  <p>
                    I need a connected Instagram account before I can run a mission. Connect one
                    in Settings, then come back and I’ll set it up with you.
                  </p>
                </div>
              </BotBubble>
            ) : !setup.started ? (
              <AutoPilotWelcome
                value={command}
                onChange={setCommand}
                onSubmit={() => submitComposer(command)}
                onPrompt={(t) => {
                  setCommand('')
                  setup.sendPrompt(t)
                }}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
                disabled={setup.loading || setup.submitting}
              />
            ) : (
              <>
                {setup.messages.map((m) =>
                  m.role === 'user' ? (
                    <UserBubble key={m.id}>{m.text}</UserBubble>
                  ) : (
                    <BotBubble key={m.id} status="Auto Pilot">
                      {m.text}
                    </BotBubble>
                  ),
                )}
                {setup.loading && (
                  <BotBubble status="Auto Pilot • Analyzing">
                    <span className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {selectedAccount?.username
                        ? `Analyzing @${selectedAccount.username}'s data…`
                        : 'Analyzing your account…'}
                    </span>
                  </BotBubble>
                )}
              </>
            )
          ) : missionQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : missionQuery.isError || !mission ? (
            <BotBubble status="Auto Pilot">
              <div className="space-y-3">
                <p>
                  I couldn’t load this mission’s control room — your mission is safe, this is
                  just a display hiccup.
                </p>
                <Button size="sm" onClick={() => missionQuery.refetch()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Try again
                </Button>
              </div>
            </BotBubble>
          ) : (
            <ControlFeed
              mission={mission}
              approvals={approvals}
              activity={activity}
              slots={slots}
              automations={automations}
              missionId={missionId as string}
              lifecycleError={lifecycleError}
            />
          )}

          {/* Composer command exchange, rendered in chat order. */}
          {localMsgs.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id}>{m.text}</UserBubble>
            ) : (
              <BotBubble key={m.id} status="Auto Pilot">
                {m.text}
              </BotBubble>
            ),
          )}
        </div>
      </div>

      {/* Composer — hidden on the setup welcome screen (which has its own
          centered input); shown once the conversation starts and in control mode. */}
      {(!isSetup || setup.started) && (
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {/* Dynamic slide-up form — only the fields the AI still needs. */}
          {isSetup && setup.formFields.length > 0 && (
            <MissionSetupForm
              fields={setup.formFields}
              values={setup.values}
              onApply={setup.applyForm}
              onDismiss={setup.dismissForm}
              submitting={setup.submitting}
            />
          )}

          {/* AI cadence suggestion — copilot asks, autopilot just notifies. */}
          {isSetup && setup.frequencySuggestion && (
            <div className="mb-2 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-900/10">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-100">
                    {setup.frequencySuggestion.mode === 'autopilot' ? (
                      <>
                        To reach your goal I’d aim for about{' '}
                        <strong>{setup.frequencySuggestion.recommendedPerWeek} posts/week</strong> — you set{' '}
                        {setup.frequencySuggestion.currentPerWeek}/week. I’ll stay within your
                        guardrails; raise the cap if you’d like me to post more.
                      </>
                    ) : (
                      <>
                        Hitting this goal usually needs about{' '}
                        <strong>{setup.frequencySuggestion.recommendedPerWeek} posts/week</strong> — you set{' '}
                        {setup.frequencySuggestion.currentPerWeek}/week. Want me to bump it up?
                      </>
                    )}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" onClick={setup.applyFrequencyBoost} disabled={setup.submitting}>
                      {setup.frequencySuggestion.mode === 'autopilot'
                        ? `Raise cap to ${setup.frequencySuggestion.recommendedPerWeek}/week`
                        : `Boost to ${setup.frequencySuggestion.recommendedPerWeek}/week`}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={setup.dismissFrequencySuggestion}
                      disabled={setup.submitting}
                    >
                      Keep {setup.frequencySuggestion.currentPerWeek}/week
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Launch affordance once every required field is collected. */}
          {isSetup && setup.readyToLaunch && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 dark:border-green-500/30 dark:bg-green-900/10">
              <span className="text-sm text-green-800 dark:text-green-300">
                Everything’s set — ready to launch.
              </span>
              <Button size="sm" onClick={setup.launch} disabled={setup.submitting}>
                {setup.submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="mr-1.5 h-4 w-4" />
                )}
                Launch mission
              </Button>
            </div>
          )}

          {composerChips.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {composerChips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onChipClick(c.value)}
                  disabled={composerDisabled}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-gray-50 px-3 py-2 focus-within:border-blue-400 dark:border-white/10 dark:bg-slate-800">
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={onComposerKey}
              rows={1}
              disabled={composerDisabled}
              placeholder={composerPlaceholder}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-60 dark:text-gray-100"
              aria-label="Message Auto Pilot"
            />
            <button
              type="button"
              onClick={() => submitComposer(command)}
              disabled={composerDisabled || !command.trim()}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
              aria-label="Send"
            >
              {isSetup && (setup.loading || setup.submitting) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

/** Status → badge tone for a scheduled/published post. */
const SLOT_STATUS_TONE: Record<string, string> = {
  published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ready: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'awaiting-approval': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

/**
 * A read-only card showing exactly what Auto Pilot scheduled: the media
 * thumbnail, caption, hashtags, format, time, and status. This is how the user
 * sees autonomous posts (autopilot) without an approval step.
 */
const ScheduledPostCard: React.FC<{ slot: ContentSlot }> = ({ slot }) => {
  const media = Array.isArray(slot.mediaUrls) ? slot.mediaUrls : []
  const hashtags = Array.isArray(slot.hashtags) ? slot.hashtags : []
  const isVideo = slot.format === 'reel'
  return (
    <li className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/5 dark:bg-white/5">
      <div className="flex items-start gap-3">
        {media[0] ? (
          isVideo ? (
            <video
              src={media[0]}
              muted
              className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
            />
          ) : (
            <img
              src={media[0]}
              alt=""
              className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
            />
          )
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-400 dark:bg-white/10">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium capitalize text-gray-900 dark:text-gray-100">
              {slot.format || 'Post'}
              {slot.theme ? ` · ${slot.theme}` : ''}
            </span>
            <span
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                SLOT_STATUS_TONE[slot.status] ?? 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
              }`}
            >
              {(slot.status || 'planned').replace(/-/g, ' ')}
            </span>
          </div>
          {slot.caption && (
            <p className="line-clamp-3 whitespace-pre-line text-xs text-gray-700 dark:text-gray-300">
              {slot.caption}
            </p>
          )}
          {hashtags.length > 0 && (
            <p className="mt-1 line-clamp-1 text-[11px] text-blue-600 dark:text-blue-400">
              {hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {slot.scheduledAt
              ? new Date(slot.scheduledAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'Unscheduled'}
          </p>
        </div>
      </div>
    </li>
  )
}

const AUTOMATION_KIND_LABEL: Record<MissionAutomation['kind'], string> = {
  'comment-only': 'Comment reply',
  'dm-only': 'Direct message',
  'comment-to-dm': 'Comment → DM',
}

/** A read-only row for one Auto Pilot engagement automation. */
const AutomationRow: React.FC<{ automation: MissionAutomation }> = ({ automation }) => (
  <li className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm dark:border-white/5 dark:bg-white/5">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="font-medium text-gray-900 dark:text-gray-100">
        {AUTOMATION_KIND_LABEL[automation.kind]}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          automation.isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
        }`}
      >
        {automation.isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
    {automation.keyword && (
      <p className="text-gray-700 dark:text-gray-300">
        <span className="font-medium">Trigger:</span>{' '}
        <code className="rounded bg-gray-100 px-1 dark:bg-white/10">{automation.keyword}</code>
      </p>
    )}
    {automation.commentReply && (
      <p className="text-gray-600 dark:text-gray-400">
        <span className="font-medium">Comment reply:</span> {automation.commentReply}
      </p>
    )}
    {automation.dmMessage && (
      <p className="text-gray-600 dark:text-gray-400">
        <span className="font-medium">DM:</span> {automation.dmMessage}
      </p>
    )}
  </li>
)

/** The control-mode feed: mission briefing + goal + plan + approvals + activity. */
const ControlFeed: React.FC<{
  mission: MissionDetail
  approvals: PendingApproval[]
  activity: ActivityRecord[]
  slots: ContentSlot[]
  automations: MissionAutomation[]
  missionId: string
  lifecycleError: string | null
}> = ({ mission, approvals, activity, slots, automations, missionId, lifecycleError }) => {
  const metric = formatMetric(mission.goal?.metric)
  const freq = mission.guardrails?.postingFrequency
  return (
    <>
      {/* Briefing */}
      <BotBubble status="Auto Pilot">
        <div className="space-y-1.5">
          <p className="font-medium">Here’s the mission I’m running for you.</p>
          <p>
            Goal: reach <strong>{(mission.goal?.targetValue ?? 0).toLocaleString()}</strong>{' '}
            {metric.toLowerCase()}
            {mission.goal?.targetDate
              ? ` by ${new Date(mission.goal.targetDate).toLocaleDateString()}`
              : ''}
            . I’m in <strong className="capitalize">{mission.operatingMode}</strong> mode
            {freq ? `, posting up to ${freq.count}× per ${freq.per}` : ''}.
          </p>
          {mission.status === 'draft' && (
            <p className="text-gray-500 dark:text-gray-400">
              I’m ready — hit <strong>Activate</strong> above (or type “activate”) and I’ll get to work.
            </p>
          )}
        </div>
      </BotBubble>

      {lifecycleError && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{lifecycleError}</span>
        </div>
      )}

      {/* Goal progress card */}
      <BotBubble status="Auto Pilot • Progress" wide>
        <GoalProgressWidget mission={mission} />
      </BotBubble>

      {/* Content plan (Content_Slots the loop's PLAN stage produced) */}
      {slots.length > 0 && (
        <BotBubble status="Auto Pilot • Content plan" wide>
          <div className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Upcoming content ({slots.length})
              </h3>
            </div>
            <ul className="space-y-3">
              {slots.slice(0, 12).map((slot) => (
                <ScheduledPostCard key={slot.id} slot={slot} />
              ))}
            </ul>
          </div>
        </BotBubble>
      )}

      {/* Pending approvals */}
      {approvals.length > 0 && (
        <BotBubble status="Auto Pilot • Needs you" wide>
          <div className="space-y-3">
            <p className="text-[15px] text-gray-800 dark:text-gray-100">
              {approvals.length === 1
                ? 'One thing needs your approval before it goes out:'
                : `${approvals.length} things need your approval before they go out:`}
            </p>
            {approvals.map((a) => (
              <ApprovalCard key={a.id} card={toApprovalCard(a)} />
            ))}
          </div>
        </BotBubble>
      )}

      {/* Engagement automations Auto Pilot set up (comment / DM / comment-to-DM). */}
      {automations.length > 0 && (
        <BotBubble status="Auto Pilot • Automations" wide>
          <div className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Engagement automations ({automations.length})
              </h3>
            </div>
            <ul className="space-y-2.5">
              {automations.map((a) => (
                <AutomationRow key={a.id} automation={a} />
              ))}
            </ul>
          </div>
        </BotBubble>
      )}

      {/* Media step — big upload card with AI/manual arrangement. */}
      <BotBubble status="Auto Pilot">
        <p>
          {mission.contentSourcePreference === 'ai-first'
            ? 'Want to add your own media? I’ll use it first and fill gaps with AI. Each item becomes a post.'
            : 'Let’s stock your media — each item becomes a post. Add as many as you like (up to 30), and choose who sets the order.'}
        </p>
      </BotBubble>
      <BotBubble status="Auto Pilot • Media" wide>
        <MediaUploadCard
          missionId={missionId}
          contentSource={mission.contentSourcePreference}
        />
      </BotBubble>

      {/* Activity narration */}
      <BotBubble status="Auto Pilot • Activity" wide>
        {activity.length === 0 ? (
          <div className="inline-block max-w-2xl rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[15px] text-gray-600 shadow-sm dark:bg-slate-800 dark:text-gray-300">
            No moves yet. Once the mission is active I’ll narrate every decision here as it happens.
          </div>
        ) : (
          <ol className="space-y-2.5">
            {activity.map((record) => (
              <li key={record.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${toneDot[outcomeTone(record.outcome)]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] text-gray-800 dark:text-gray-100">
                    {activityLabel(record)}
                  </p>
                  {record.createdAt && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formatTimestamp(record.createdAt)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </BotBubble>
    </>
  )
}

export default AutoPilotChat
