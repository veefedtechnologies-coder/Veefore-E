/**
 * Mission setup interpreter.
 *
 * Powers the AI-driven Auto Pilot setup: instead of a fixed form or a scripted
 * question list, the user describes their mission in natural language and an AI
 * model extracts whatever mission settings it can. This service:
 *
 *   1. asks {@link AIServiceManager.generateJSON} to extract structured mission
 *      fields from the user's latest message (given what's already known) and to
 *      write a short, friendly reply plus which optional fields would improve
 *      THIS mission;
 *   2. merges + validates the extracted values against the mission-model bounds
 *      (bad/implausible values are dropped, never trusted blindly);
 *   3. deterministically computes which REQUIRED fields are still missing — so
 *      completeness never depends on the model — and builds the dynamic
 *      slide-up form spec the client renders (missing required + AI-recommended
 *      optional fields the user hasn't set yet).
 *
 * The result tells the client what to say, what it now knows, what form fields
 * to surface, and whether the mission is ready to launch.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { AIServiceManager } from '../../../services/AIServiceManager'
import { socialAccountRepository } from '../../../repositories/SocialAccountRepository'
import { logger } from '../../../config/logger'
import { loadWorkspaceAIPreferences } from './MissionAIPreferences'

const COMPONENT = 'autopilot.MissionSetupInterpreter'

export type GoalMetric = 'followers' | 'engagement' | 'reach'
export type OperatingMode = 'copilot' | 'autopilot'
export type ContentSourcePreference = 'user-first' | 'ai-first'
export type PostingPer = 'day' | 'week'

/** The accumulated mission settings collected across the conversation. */
export interface SetupValues {
  goalMetric?: GoalMetric
  targetValue?: number
  targetDate?: string // yyyy-mm-dd
  niche?: string
  brandVoice?: string
  localLanguage?: string
  operatingMode?: OperatingMode
  contentSourcePreference?: ContentSourcePreference
  postingCount?: number
  postingPer?: PostingPer
  creditBudget?: number
  bannedTopics?: string[]
}

/** Required fields — the mission cannot launch until all are present. */
export const REQUIRED_FIELDS: (keyof SetupValues)[] = [
  'goalMetric',
  'targetValue',
  'niche',
  'brandVoice',
  'operatingMode',
  'contentSourcePreference',
  'postingCount',
  'postingPer',
  'creditBudget',
]

/** Optional fields — never block launch, but can improve the mission. */
export const OPTIONAL_FIELDS: (keyof SetupValues)[] = ['targetDate', 'localLanguage', 'bannedTopics']

/** A dynamic form-field spec the client renders in the slide-up form. */
export interface FieldSpec {
  key: keyof SetupValues
  label: string
  type: 'select' | 'number' | 'text' | 'textarea' | 'date' | 'tags'
  required: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
  help?: string
}

/** Static specs for every field the form can render. */
export const FIELD_SPECS: Record<keyof SetupValues, FieldSpec> = {
  goalMetric: {
    key: 'goalMetric',
    label: 'Goal metric',
    type: 'select',
    required: true,
    options: [
      { label: 'Followers', value: 'followers' },
      { label: 'Engagement', value: 'engagement' },
      { label: 'Reach', value: 'reach' },
    ],
    help: 'What Auto Pilot optimizes for.',
  },
  targetValue: {
    key: 'targetValue',
    label: 'Target value',
    type: 'number',
    required: true,
    placeholder: 'e.g. 10000',
  },
  targetDate: {
    key: 'targetDate',
    label: 'Target date',
    type: 'date',
    required: false,
    help: 'Optional deadline.',
  },
  niche: {
    key: 'niche',
    label: 'Niche',
    type: 'text',
    required: true,
    placeholder: 'e.g. vegan meal prep for busy parents',
  },
  brandVoice: {
    key: 'brandVoice',
    label: 'Brand voice',
    type: 'textarea',
    required: true,
    placeholder: 'Warm, upbeat, practical — like a friendly coach.',
  },
  localLanguage: {
    key: 'localLanguage',
    label: 'Language',
    type: 'text',
    required: false,
    placeholder: 'Defaults to English',
  },
  operatingMode: {
    key: 'operatingMode',
    label: 'Operating mode',
    type: 'select',
    required: true,
    options: [
      { label: 'Copilot — approve everything', value: 'copilot' },
      { label: 'Autopilot — run within guardrails', value: 'autopilot' },
    ],
  },
  contentSourcePreference: {
    key: 'contentSourcePreference',
    label: 'Content source',
    type: 'select',
    required: true,
    options: [
      { label: 'My media first, AI as backup', value: 'user-first' },
      { label: 'AI-generated first', value: 'ai-first' },
    ],
  },
  postingCount: {
    key: 'postingCount',
    label: 'Posts per period',
    type: 'number',
    required: true,
    placeholder: 'e.g. 3',
  },
  postingPer: {
    key: 'postingPer',
    label: 'Per',
    type: 'select',
    required: true,
    options: [
      { label: 'Day', value: 'day' },
      { label: 'Week', value: 'week' },
    ],
  },
  creditBudget: {
    key: 'creditBudget',
    label: 'Credit budget',
    type: 'number',
    required: true,
    placeholder: 'e.g. 1000',
  },
  bannedTopics: {
    key: 'bannedTopics',
    label: 'Banned topics',
    type: 'tags',
    required: false,
    placeholder: 'politics, competitor names',
    help: 'Topics Auto Pilot must never post about.',
  },
}

/**
 * A compact, DB-sourced snapshot of the account's analytics — read from our
 * own database (the `socialaccounts` collection populated by the sync/polling
 * pipeline), NOT from a live Meta API call. Fed to the AI so setup and advice
 * are grounded in the account's real numbers.
 */
export interface AccountContext {
  username?: string
  platform?: string
  followers?: number
  following?: number
  posts?: number
  avgLikes?: number
  avgComments?: number
  avgReach?: number
  engagementRate?: number
  avgEngagement?: number
  accountReach?: number
  isBusiness?: boolean
  isVerified?: boolean
  biography?: string
  /** Top few best posting times, e.g. ["Mon 9 AM", "Wed 6 PM"]. */
  bestTimes?: string[]
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24
  const period = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${period}`
}

/** Top-N "DOW_HOUR" keys from the weekly heatmap, formatted for humans. */
function topBestTimes(weekly: unknown, n = 3): string[] {
  const entries: [string, number][] = []
  try {
    if (weekly instanceof Map) {
      for (const [k, v] of weekly.entries()) entries.push([String(k), Number(v)])
    } else if (weekly && typeof weekly === 'object') {
      for (const [k, v] of Object.entries(weekly as Record<string, unknown>))
        entries.push([k, Number(v)])
    }
  } catch {
    return []
  }
  return entries
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => {
      const [dow, hour] = k.split('_').map((x) => Number(x))
      if (!Number.isFinite(dow) || !Number.isFinite(hour)) return k
      return `${DOW[((dow % 7) + 7) % 7]} ${formatHour(hour)}`
    })
}

export interface AccountContextDeps {
  getAccountById?: (accountId: string) => Promise<unknown>
}

/**
 * Resolve the account doc from our DB, tolerating either the Mongo `_id`
 * (what the client usually sends as `id`) OR the platform `accountId` field.
 */
async function resolveAccountDoc(accountId: string): Promise<Record<string, any> | null> {
  // 1) Mongo _id lookup.
  try {
    const byId = await socialAccountRepository.findById(accountId)
    if (byId) return byId as unknown as Record<string, any>
  } catch {
    /* invalid ObjectId etc. — fall through */
  }
  // 2) Platform accountId lookup (e.g. IG business id / FB page id).
  try {
    const byAccountId = await socialAccountRepository.findByAccountId(accountId)
    if (byAccountId) return byAccountId as unknown as Record<string, any>
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Read the connected account's analytics from our DATABASE (never Meta) and
 * shape a compact context. Returns null when no account id / not found.
 */
export async function buildAccountContext(
  accountId: string | undefined,
  deps: AccountContextDeps = {},
): Promise<AccountContext | null> {
  if (!accountId) return null
  try {
    const a = deps.getAccountById
      ? ((await deps.getAccountById(accountId)) as Record<string, any> | null)
      : await resolveAccountDoc(accountId)
    if (!a) {
      logger.warn('Auto Pilot setup: account not found in DB for context', {
        component: COMPONENT,
        accountId,
      })
      return null
    }
    return {
      username: a.username,
      platform: a.platform,
      followers: a.followersCount,
      following: a.followingCount,
      posts: a.mediaCount,
      avgLikes: a.avgLikes,
      avgComments: a.avgComments,
      avgReach: a.avgReach,
      engagementRate: a.engagementRate,
      avgEngagement: a.avgEngagement,
      accountReach: a.accountReach,
      isBusiness: a.isBusinessAccount,
      isVerified: a.isVerified,
      biography: typeof a.biography === 'string' ? a.biography.slice(0, 300) : undefined,
      bestTimes: topBestTimes(a.audienceActiveTimeWeekly),
    }
  } catch (err) {
    logger.warn('Auto Pilot setup: failed to load account context from DB', {
      component: COMPONENT,
      accountId,
      error: (err as Error).message,
    })
    return null
  }
}

export interface InterpretInput {
  message: string
  currentValues?: SetupValues
  /** Connected account whose DB analytics ground the interpretation. */
  accountId?: string
  /** Workspace whose configured AI settings (model, BYO keys, persona) apply. */
  workspaceId?: string
}

export interface InterpretResult {
  reply: string
  values: SetupValues
  missingRequired: (keyof SetupValues)[]
  formFields: FieldSpec[]
  readyToLaunch: boolean
  /** DB-sourced analytics the AI used (echoed for the client, may be null). */
  accountContext: AccountContext | null
}

/** Bounds mirror the mission model + create-mission zod schema. */
const BOUNDS = {
  targetValue: { min: 1, max: 100_000_000 },
  niche: { min: 1, max: 100 },
  brandVoice: { min: 1, max: 2000 },
  postingCount: { min: 1, max: 1000 },
  creditBudget: { min: 1, max: 1_000_000 },
}

function coerceInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s]/g, ''))
    if (Number.isFinite(n)) return Math.round(n)
  }
  return undefined
}

function inRange(n: number, b: { min: number; max: number }): boolean {
  return n >= b.min && n <= b.max
}

function isFutureDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now()
}

/**
 * Merge the AI-extracted values over what's known, validating each field
 * against the mission bounds. Invalid values are ignored so the model can never
 * push an out-of-range mission through.
 */
export function mergeAndValidate(current: SetupValues, extracted: Record<string, unknown>): SetupValues {
  const out: SetupValues = { ...current }

  const metric = extracted.goalMetric
  if (metric === 'followers' || metric === 'engagement' || metric === 'reach') out.goalMetric = metric

  const tv = coerceInt(extracted.targetValue)
  if (tv !== undefined && inRange(tv, BOUNDS.targetValue)) out.targetValue = tv

  if (typeof extracted.targetDate === 'string' && isFutureDate(extracted.targetDate))
    out.targetDate = extracted.targetDate

  if (typeof extracted.niche === 'string') {
    const s = extracted.niche.trim()
    if (s.length >= BOUNDS.niche.min && s.length <= BOUNDS.niche.max) out.niche = s
  }

  if (typeof extracted.brandVoice === 'string') {
    const s = extracted.brandVoice.trim()
    if (s.length >= BOUNDS.brandVoice.min && s.length <= BOUNDS.brandVoice.max) out.brandVoice = s
  }

  if (typeof extracted.localLanguage === 'string' && extracted.localLanguage.trim())
    out.localLanguage = extracted.localLanguage.trim()

  const mode = extracted.operatingMode
  if (mode === 'copilot' || mode === 'autopilot') out.operatingMode = mode

  const src = extracted.contentSourcePreference
  if (src === 'user-first' || src === 'ai-first') out.contentSourcePreference = src

  const pc = coerceInt(extracted.postingCount)
  if (pc !== undefined && inRange(pc, BOUNDS.postingCount)) out.postingCount = pc

  const per = extracted.postingPer
  if (per === 'day' || per === 'week') out.postingPer = per

  const cb = coerceInt(extracted.creditBudget)
  if (cb !== undefined && inRange(cb, BOUNDS.creditBudget)) out.creditBudget = cb

  if (Array.isArray(extracted.bannedTopics)) {
    const topics = extracted.bannedTopics
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean)
    if (topics.length) out.bannedTopics = topics
  }

  return out
}

/** Which required fields are still absent from the collected values. */
export function computeMissingRequired(values: SetupValues): (keyof SetupValues)[] {
  return REQUIRED_FIELDS.filter((k) => {
    const v = values[k]
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  })
}

/**
 * Build the dynamic slide-up form spec: every missing REQUIRED field plus any
 * AI-recommended OPTIONAL field the user hasn't set yet.
 */
export function buildFormFields(
  values: SetupValues,
  missingRequired: (keyof SetupValues)[],
  recommendedOptional: string[],
): FieldSpec[] {
  const keys = new Set<keyof SetupValues>(missingRequired)
  for (const raw of recommendedOptional) {
    const key = raw as keyof SetupValues
    if (
      OPTIONAL_FIELDS.includes(key) &&
      (values[key] === undefined || values[key] === null || (Array.isArray(values[key]) && (values[key] as unknown[]).length === 0))
    ) {
      keys.add(key)
    }
  }
  // Preserve a sensible order: required (in canonical order) then optional.
  const ordered: (keyof SetupValues)[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].filter((k) =>
    keys.has(k),
  )
  return ordered.map((k) => FIELD_SPECS[k])
}

function buildPrompt(message: string, current: SetupValues, account: AccountContext | null): string {
  return [
    "You are VeeFore Auto Pilot's setup assistant. The user is configuring an autonomous Instagram growth mission. Extract mission settings from the conversation. Only set a field when the user clearly stated or strongly implied it; leave everything else out. Be warm and concise — never list every field back.",
    '',
    account
      ? `The user's connected account analytics (from OUR DATABASE, not a live API): ${JSON.stringify(account)}. Use these real numbers to tailor your reply and to choose which optional fields would genuinely help THIS account.`
      : 'No account analytics are available yet.',
    '',
    `Known so far (JSON): ${JSON.stringify(current ?? {})}`,
    `User's latest message: """${message}"""`,
    '',
    'Field meanings:',
    '- goalMetric: one of followers | engagement | reach',
    '- targetValue: integer 1..100000000 (the numeric goal)',
    '- targetDate: a future date as YYYY-MM-DD (optional deadline)',
    '- niche: short text (their topic/brand, ≤100 chars)',
    '- brandVoice: short text describing tone (≤2000 chars)',
    '- localLanguage: language name (optional; default English)',
    '- operatingMode: copilot (user approves everything) | autopilot (runs within guardrails)',
    '- contentSourcePreference: user-first (their own media first) | ai-first',
    '- postingCount: integer posts per period 1..1000',
    '- postingPer: day | week',
    '- creditBudget: integer AI credit budget 1..1000000',
    '- bannedTopics: array of short strings (optional)',
    '',
    'Respond with STRICT JSON only, shaped exactly as:',
    '{',
    '  "reply": "one or two friendly sentences acknowledging what you understood; if required details are still missing, say you\'ll pop up a quick form to finish — do NOT enumerate fields",',
    '  "extracted": { /* only fields you could determine, correctly typed */ },',
    '  "recommendedOptional": [ /* zero or more of: "targetDate","localLanguage","bannedTopics" that would improve THIS mission and are not set yet */ ]',
    '}',
  ].join('\n')
}

export interface InterpretDeps {
  ai?: Pick<AIServiceManager, 'generateJSON'>
  getAccountById?: (accountId: string) => Promise<unknown>
}

/**
 * Interpret one setup message: extract + validate mission fields, compute the
 * missing required set, and build the dynamic form spec + reply — all grounded
 * in the account's DB analytics when an account id is provided.
 */
export async function interpretMissionSetup(
  input: InterpretInput,
  deps: InterpretDeps = {},
): Promise<InterpretResult> {
  const current = input.currentValues ?? {}
  const ai = deps.ai ?? AIServiceManager.getInstance()

  const accountContext = await buildAccountContext(input.accountId, {
    getAccountById: deps.getAccountById,
  })

  let extracted: Record<string, unknown> = {}
  let recommendedOptional: string[] = []
  let reply = ''

  try {
    // Honor the workspace's configured AI model / BYO keys / persona (same
    // settings the rest of the app's AI features read), overlaying the fields
    // this call needs on top so extraction stays deterministic.
    const basePreferences = input.workspaceId
      ? await loadWorkspaceAIPreferences(input.workspaceId)
      : {}
    const raw = await ai.generateJSON(buildPrompt(input.message, current, accountContext), {
      ...basePreferences,
      aiModel: basePreferences.aiModel ?? 'veegpt-hybrid',
      creativityLevel: 0.3,
    })
    if (raw && typeof raw === 'object') {
      if (raw.extracted && typeof raw.extracted === 'object') extracted = raw.extracted as Record<string, unknown>
      if (Array.isArray(raw.recommendedOptional))
        recommendedOptional = raw.recommendedOptional.filter((x: unknown): x is string => typeof x === 'string')
      if (typeof raw.reply === 'string') reply = raw.reply.trim()
    }
  } catch (err) {
    logger.warn('Auto Pilot setup interpret: AI extraction failed, falling back to form', {
      component: COMPONENT,
      error: (err as Error).message,
    })
  }

  const values = mergeAndValidate(current, extracted)
  const missingRequired = computeMissingRequired(values)
  const formFields = buildFormFields(values, missingRequired, recommendedOptional)
  const readyToLaunch = missingRequired.length === 0

  if (!reply) {
    reply = readyToLaunch
      ? 'Got it — I have everything I need. Review the summary and launch when you’re ready 🚀'
      : "Great — I’ve captured what I can. Fill in the quick form below to finish setting up your mission."
  }

  return { reply, values, missingRequired, formFields, readyToLaunch, accountContext }
}

/* -------------------------------------------------------------------------- */
/* Plan advisor — data-grounded review after the form is complete             */
/* -------------------------------------------------------------------------- */

export interface CadenceAdvice {
  recommendedPerWeek: number
  currentPerWeek: number
  mode: 'copilot' | 'autopilot'
  rationale: string
}

export interface PlanAdvice {
  /** Cadence recommendation, or null when the chosen rate is already enough. */
  cadence: CadenceAdvice | null
  /** Short, account-specific tips to improve the odds of hitting the goal. */
  tips: string[]
}

export interface AdviseInput {
  values: SetupValues
  accountId?: string
  /** Workspace whose configured AI settings (model, BYO keys, persona) apply. */
  workspaceId?: string
}

/** Chosen cadence normalized to posts/week. */
function currentPerWeek(v: SetupValues): number | null {
  if (!v.postingCount || !v.postingPer) return null
  return v.postingPer === 'day' ? v.postingCount * 7 : v.postingCount
}

/** First strictly-positive finite number, else the fallback. */
function firstPositive(...values: Array<number | undefined | null>): number {
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return values[values.length - 1] as number
}

/** Clamp n into [lo, hi]. */
function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Sane bounds on any recommended posting cadence (posts/week). */
const MIN_CADENCE = 2
const MAX_CADENCE = 14

/**
 * A transparent, data-grounded cadence model — the "thinking" a social manager
 * does before recommending a posting rate. It derives the recommendation from
 * the REAL gap between where the account is and the goal, the time available,
 * and the account's own reach/engagement per post — so the number genuinely
 * varies with the inputs instead of snapping to a fixed 5/7.
 */
export interface CadenceModel {
  /** Current value of the goal metric (followers/reach/engagement) from analytics. */
  currentValue: number
  /** Target value the user set. */
  targetValue: number
  /** Weeks until the deadline (default 12 when no date set). */
  weeks: number
  /** How much of the goal metric must be gained. */
  requiredGain: number
  /** Required gain per week to hit the goal on time. */
  requiredPerWeekGain: number
  /** Expected gain in the goal metric from a single post (grounded in real reach/engagement). */
  expectedGainPerPost: number
  /** Unclamped posts/week the math implies. */
  rawPerWeek: number
  /** Recommended posts/week, clamped to a sane band. */
  recommendedPerWeek: number
  /** How achievable the goal is at a sane cadence. */
  feasibility: 'comfortable' | 'ambitious' | 'unrealistic'
}

/**
 * Compute the cadence recommendation from the account's real numbers + the goal.
 *
 * followers goal → new followers per post ≈ reach-per-post × a conservative
 *   conversion (~3%); reach goal → reach per post; engagement goal → the
 *   account's real per-post engagement. recommendedPerWeek = required weekly gain
 *   ÷ expected gain per post, bounded to [2,14]. When the required rate exceeds
 *   what a sane cadence can deliver the goal is flagged `unrealistic` (so we can
 *   say so honestly rather than pretend 7/week fixes it).
 */
export function computeCadenceModel(v: SetupValues, account: AccountContext | null): CadenceModel {
  const metric: GoalMetric = v.goalMetric ?? 'followers'
  const target = Math.max(0, v.targetValue ?? 0)

  // Current value of the goal metric, from the account's real analytics.
  const currentValue =
    metric === 'followers'
      ? firstPositive(account?.followers, 0)
      : metric === 'reach'
        ? firstPositive(account?.accountReach, account?.avgReach, 0)
        : firstPositive(account?.engagementRate, account?.avgEngagement, 0)

  // Weeks until the deadline (bounded); default to a 12-week horizon.
  let weeks = 12
  if (v.targetDate) {
    const w = (new Date(v.targetDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    if (Number.isFinite(w)) weeks = clampNum(w, 1, 104)
  }

  const requiredGain = Math.max(0, target - currentValue)
  const requiredPerWeekGain = requiredGain / weeks

  // Expected gain in the goal metric from ONE post, grounded in real reach.
  const reachPerPost = firstPositive(account?.avgReach, account?.accountReach, account?.followers, 10)
  const expectedGainPerPost =
    metric === 'followers'
      ? Math.max(0.5, reachPerPost * 0.03) // ~3% of reached viewers follow
      : metric === 'reach'
        ? Math.max(1, reachPerPost)
        : Math.max(
            1,
            firstPositive(
              account?.avgEngagement,
              (account?.avgLikes ?? 0) + (account?.avgComments ?? 0),
              5,
            ),
          )

  // Posts/week the math implies. When there's no gap (already at/over goal) a
  // light maintenance cadence keeps momentum.
  const rawPerWeek = requiredPerWeekGain > 0 ? requiredPerWeekGain / expectedGainPerPost : 3
  const recommendedPerWeek = clampNum(Math.ceil(rawPerWeek), MIN_CADENCE, MAX_CADENCE)
  const feasibility: CadenceModel['feasibility'] =
    rawPerWeek <= 7 ? 'comfortable' : rawPerWeek <= MAX_CADENCE ? 'ambitious' : 'unrealistic'

  return {
    currentValue,
    targetValue: target,
    weeks: Math.round(weeks),
    requiredGain,
    requiredPerWeekGain,
    expectedGainPerPost,
    rawPerWeek,
    recommendedPerWeek,
    feasibility,
  }
}

/**
 * Review a completed plan against the account's DB analytics and the goal, and
 * return a data-grounded cadence recommendation + tips. Uses the AI to phrase
 * the rationale/tips and, when possible, to recommend a cadence; falls back to
 * the heuristic if the AI is unavailable.
 */
export async function adviseMissionPlan(
  input: AdviseInput,
  deps: InterpretDeps = {},
): Promise<PlanAdvice> {
  const v = input.values
  const ai = deps.ai ?? AIServiceManager.getInstance()
  const account = await buildAccountContext(input.accountId, {
    getAccountById: deps.getAccountById,
  })

  const cur = currentPerWeek(v)
  const mode: 'copilot' | 'autopilot' = v.operatingMode ?? 'copilot'

  // The data-grounded model is the source of truth for the NUMBER, so the
  // recommendation genuinely reflects the gap, deadline, and real reach/
  // engagement — not a fixed 5/7. The AI only phrases the rationale + tips, and
  // may nudge the number modestly within a band around the model's value.
  const model = computeCadenceModel(v, account)
  let recommendedPerWeek = model.recommendedPerWeek
  let rationale = ''
  let tips: string[] = []

  try {
    const prompt = [
      'You are VeeFore Auto Pilot, reviewing a growth plan before launch. Be concise, specific, and honest.',
      account
        ? `Account analytics (from OUR DATABASE, not a live API): ${JSON.stringify(account)}.`
        : 'No account analytics available.',
      `Mission plan: ${JSON.stringify({
        goalMetric: v.goalMetric,
        targetValue: v.targetValue,
        targetDate: v.targetDate ?? null,
        niche: v.niche,
        operatingMode: v.operatingMode,
        contentSource: v.contentSourcePreference,
        postsPerWeek: cur,
      })}.`,
      // Give the model the concrete math so it reasons over real numbers, not vibes.
      `Cadence analysis we computed from the data: ${JSON.stringify({
        currentValueOfGoalMetric: Math.round(model.currentValue),
        target: model.targetValue,
        weeksUntilDeadline: model.weeks,
        requiredGain: Math.round(model.requiredGain),
        requiredGainPerWeek: Math.round(model.requiredPerWeekGain),
        expectedGainPerPost: Math.round(model.expectedGainPerPost * 100) / 100,
        impliedPostsPerWeek: Math.round(model.rawPerWeek * 10) / 10,
        modelRecommendedPerWeek: model.recommendedPerWeek,
        feasibility: model.feasibility,
        currentPlannedPerWeek: cur,
      })}.`,
      'Rules:',
      `- Base "recommendedPerWeek" on our computed analysis; keep it within ${MIN_CADENCE}..${MAX_CADENCE} and within ±2 of modelRecommendedPerWeek.`,
      '- If the current planned cadence already meets or exceeds what is needed, recommend keeping it (recommendedPerWeek <= currentPlannedPerWeek).',
      '- If feasibility is "unrealistic", say so plainly in the rationale and still give the best sane cadence.',
      '- The rationale MUST cite at least one real number (e.g., required gain/week, reach per post, or weeks left).',
      'Respond with STRICT JSON:',
      '{',
      '  "recommendedPerWeek": integer,',
      '  "rationale": "one short sentence citing the real numbers",',
      '  "tips": ["up to 3 short, specific, account-aware tips grounded in the analytics"]',
      '}',
    ].join('\n')
    const basePreferences = input.workspaceId
      ? await loadWorkspaceAIPreferences(input.workspaceId)
      : {}
    const raw = await ai.generateJSON(prompt, {
      ...basePreferences,
      aiModel: basePreferences.aiModel ?? 'veegpt-hybrid',
      creativityLevel: 0.4,
    })
    if (raw && typeof raw === 'object') {
      const rec = coerceInt(raw.recommendedPerWeek)
      // Keep the AI honest: only accept a number near the data model, bounded.
      if (rec !== undefined) {
        const bounded = clampNum(
          rec,
          Math.max(MIN_CADENCE, model.recommendedPerWeek - 2),
          Math.min(MAX_CADENCE, model.recommendedPerWeek + 2),
        )
        recommendedPerWeek = bounded
      }
      if (typeof raw.rationale === 'string') rationale = raw.rationale.trim()
      if (Array.isArray(raw.tips))
        tips = raw.tips.filter((t: unknown): t is string => typeof t === 'string').slice(0, 3)
    }
  } catch (err) {
    logger.warn('Auto Pilot plan advise: AI failed, using data-model cadence', {
      component: COMPONENT,
      error: (err as Error).message,
    })
  }

  // Only surface a cadence nudge when more posting is genuinely needed; when the
  // chosen rate already meets the requirement, keep the user's cadence (no nudge).
  const cadence: CadenceAdvice | null =
    cur != null && recommendedPerWeek > cur
      ? {
          recommendedPerWeek,
          currentPerWeek: cur,
          mode,
          rationale: rationale || buildCadenceRationale(model, cur),
        }
      : null

  return { cadence, tips }
}

/** Deterministic data-grounded rationale used when the AI is unavailable. */
function buildCadenceRationale(model: CadenceModel, currentPerWeek: number): string {
  if (model.feasibility === 'unrealistic') {
    return (
      `Hitting ${model.targetValue.toLocaleString()} in ${model.weeks} weeks needs about ` +
      `${Math.round(model.requiredPerWeekGain).toLocaleString()}/week — very ambitious at your current reach, so ` +
      `${model.recommendedPerWeek} posts/week is the realistic maximum to push toward it.`
    )
  }
  return (
    `You need ~${Math.round(model.requiredPerWeekGain).toLocaleString()} more/week and each post yields about ` +
    `${Math.round(model.expectedGainPerPost * 100) / 100} on average, so ~` +
    `${model.recommendedPerWeek} posts/week (up from ${currentPerWeek}) gives you the best shot.`
  )
}
