/**
 * Mission setup form model + validation.
 *
 * Pure, framework-free logic backing {@link MissionSetupWizard}. It owns the
 * form's value shape, the client-side validation that mirrors the mission
 * model bounds (so bad input is caught before the round-trip), and the
 * translation of form values into the `POST /api/v1/autopilot/missions`
 * payload (Task 18.1).
 *
 * Client-side bounds mirror the server zod schema + mission model:
 *   • goal.targetValue  1..100,000,000  (R1.2)
 *   • niche             1..100 chars    (R1.1)
 *   • brandVoice        1..2000 chars   (R1.1)
 *   • guardrails.creditBudget 1..1,000,000 (R14.6)
 * plus: target date, when supplied, must be a future date (R1.4).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

export type GoalMetric = 'followers' | 'engagement' | 'reach'
export type OperatingMode = 'copilot' | 'autopilot'
export type ContentSourcePreference = 'user-first' | 'ai-first'
export type PostingPer = 'day' | 'week'

/** Field bounds, exported so the component and tests share one source of truth. */
export const MISSION_BOUNDS = {
  targetValue: { min: 1, max: 100_000_000 },
  niche: { min: 1, max: 100 },
  brandVoice: { min: 1, max: 2000 },
  creditBudget: { min: 1, max: 1_000_000 },
  postingCount: { min: 1, max: 1000 },
} as const

/**
 * The controlled form values. Numeric fields are kept as strings while the user
 * types (empty string = untouched) so partial/invalid input never coerces to a
 * misleading number; validation + payload building parse them.
 */
export interface MissionFormValues {
  goalMetric: GoalMetric
  targetValue: string
  targetDate: string // yyyy-mm-dd (from <input type="date">) or ''
  niche: string
  brandVoice: string
  localLanguage: string
  operatingMode: OperatingMode
  contentSourcePreference: ContentSourcePreference
  bannedTopics: string // comma / newline separated free text
  postingCount: string
  postingPer: PostingPer
  creditBudget: string
}

/** A map of field name → human-readable error. Absent key = field is valid. */
export type MissionFormErrors = Partial<Record<keyof MissionFormValues, string>>

/** Sensible starting values for a fresh mission form. */
export const defaultMissionFormValues: MissionFormValues = {
  goalMetric: 'followers',
  targetValue: '',
  targetDate: '',
  niche: '',
  brandVoice: '',
  localLanguage: '',
  operatingMode: 'copilot',
  contentSourcePreference: 'user-first',
  bannedTopics: '',
  postingCount: '3',
  postingPer: 'week',
  creditBudget: '1000',
}

/** Split the free-text banned-topics field into a trimmed, de-duplicated list. */
export function parseBannedTopics(input: string): string[] {
  const seen = new Set<string>()
  const topics: string[] = []
  for (const raw of input.split(/[,\n]/)) {
    const topic = raw.trim()
    if (topic && !seen.has(topic.toLowerCase())) {
      seen.add(topic.toLowerCase())
      topics.push(topic)
    }
  }
  return topics
}

/** Parse an integer from a form string; returns NaN when blank or non-numeric. */
function parseIntOrNaN(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') return Number.NaN
  // Reject values with stray non-numeric characters (e.g. "12a") that Number
  // would otherwise coerce or partially accept.
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN
  return Number(trimmed)
}

/** Start-of-day for a yyyy-mm-dd string, parsed in local time. Null when invalid. */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Validate the form against the mission-model bounds (R1.2–R1.4). Returns a map
 * of field → message; an empty map means the form is submittable. `now` is
 * injectable so the future-date check (R1.4) is deterministic in tests.
 */
export function validateMissionForm(
  values: MissionFormValues,
  now: Date = new Date(),
): MissionFormErrors {
  const errors: MissionFormErrors = {}

  // Goal target metric — required, numeric, within bounds (R1.2, R1.3).
  const target = Number(values.targetValue.trim())
  if (values.targetValue.trim() === '') {
    errors.targetValue = 'Enter a target value for your goal.'
  } else if (!Number.isFinite(target)) {
    errors.targetValue = 'The target value must be a number.'
  } else if (target < MISSION_BOUNDS.targetValue.min || target > MISSION_BOUNDS.targetValue.max) {
    errors.targetValue = `The target value must be between ${MISSION_BOUNDS.targetValue.min} and ${MISSION_BOUNDS.targetValue.max.toLocaleString()}.`
  }

  // Optional target date — when present it must be a future date (R1.4).
  if (values.targetDate.trim() !== '') {
    const target = parseLocalDate(values.targetDate)
    if (!target) {
      errors.targetDate = 'Enter a valid target date.'
    } else if (target.getTime() <= now.getTime()) {
      errors.targetDate = 'The target date must be a future date.'
    }
  }

  // Niche — 1..100 chars (R1.1).
  const niche = values.niche.trim()
  if (niche.length < MISSION_BOUNDS.niche.min) {
    errors.niche = 'Enter your niche.'
  } else if (niche.length > MISSION_BOUNDS.niche.max) {
    errors.niche = `Keep your niche under ${MISSION_BOUNDS.niche.max} characters.`
  }

  // Brand voice — 1..2000 chars (R1.1).
  const brandVoice = values.brandVoice.trim()
  if (brandVoice.length < MISSION_BOUNDS.brandVoice.min) {
    errors.brandVoice = 'Describe your brand voice.'
  } else if (brandVoice.length > MISSION_BOUNDS.brandVoice.max) {
    errors.brandVoice = `Keep your brand voice under ${MISSION_BOUNDS.brandVoice.max} characters.`
  }

  // Posting frequency count — a positive integer (guardrail bound).
  const postingCount = parseIntOrNaN(values.postingCount)
  if (Number.isNaN(postingCount)) {
    errors.postingCount = 'Enter how many posts per period.'
  } else if (
    postingCount < MISSION_BOUNDS.postingCount.min ||
    postingCount > MISSION_BOUNDS.postingCount.max
  ) {
    errors.postingCount = `Posts per period must be between ${MISSION_BOUNDS.postingCount.min} and ${MISSION_BOUNDS.postingCount.max}.`
  }

  // Credit budget — 1..1,000,000 (R14.6).
  const budget = parseIntOrNaN(values.creditBudget)
  if (Number.isNaN(budget)) {
    errors.creditBudget = 'Enter a credit budget.'
  } else if (budget < MISSION_BOUNDS.creditBudget.min || budget > MISSION_BOUNDS.creditBudget.max) {
    errors.creditBudget = `The credit budget must be between ${MISSION_BOUNDS.creditBudget.min} and ${MISSION_BOUNDS.creditBudget.max.toLocaleString()}.`
  }

  return errors
}

/** Whether an errors map is empty (i.e. the form is valid). */
export function isMissionFormValid(errors: MissionFormErrors): boolean {
  return Object.keys(errors).length === 0
}

/** The wire payload for `POST /api/v1/autopilot/missions`. */
export interface CreateMissionPayload {
  workspaceId: string
  accountId: string
  platform: string
  goal: {
    metric: GoalMetric
    targetValue: number
    targetDate?: string
  }
  niche: string
  brandVoice: string
  localLanguage?: string
  operatingMode: OperatingMode
  contentSourcePreference: ContentSourcePreference
  guardrails: {
    bannedTopics: string[]
    postingFrequency: { count: number; per: PostingPer; windowMs: number }
    creditBudget: number
    approvalRequiredActions: string[]
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * Build the create-mission payload straight from the AI-collected setup values
 * (the conversational/slide-up-form flow), which are already typed + validated
 * server-side. Callers must ensure every required field is present.
 */
export function buildPayloadFromSetupValues(
  v: {
    goalMetric?: GoalMetric
    targetValue?: number
    targetDate?: string
    niche?: string
    brandVoice?: string
    localLanguage?: string
    operatingMode?: OperatingMode
    contentSourcePreference?: ContentSourcePreference
    postingCount?: number
    postingPer?: PostingPer
    creditBudget?: number
    bannedTopics?: string[]
  },
  ctx: { workspaceId: string; accountId: string; platform?: string },
): CreateMissionPayload {
  const per: PostingPer = v.postingPer ?? 'week'
  return {
    workspaceId: ctx.workspaceId,
    accountId: ctx.accountId,
    platform: ctx.platform ?? 'instagram',
    goal: {
      metric: v.goalMetric ?? 'followers',
      targetValue: Number(v.targetValue ?? 0),
      ...(v.targetDate ? { targetDate: v.targetDate } : {}),
    },
    niche: (v.niche ?? '').trim(),
    brandVoice: (v.brandVoice ?? '').trim(),
    ...(v.localLanguage && v.localLanguage.trim() ? { localLanguage: v.localLanguage.trim() } : {}),
    operatingMode: v.operatingMode ?? 'copilot',
    contentSourcePreference: v.contentSourcePreference ?? 'user-first',
    guardrails: {
      bannedTopics: v.bannedTopics ?? [],
      postingFrequency: {
        count: Number(v.postingCount ?? 1),
        per,
        windowMs: per === 'day' ? DAY_MS : WEEK_MS,
      },
      creditBudget: Number(v.creditBudget ?? 1000),
      // Autopilot is fully autonomous — it publishes + runs automations on its
      // own and only NOTIFIES the user; nothing is gated behind approval by
      // default (guardrail violations still surface an approval as a safety net).
      // Copilot presents everything for approval regardless of this list.
      approvalRequiredActions: [],
    },
  }
}

/**
 * Build the create-mission API payload from validated form values. Callers must
 * validate first (this assumes numeric fields parse cleanly). The rolling
 * frequency `windowMs` is derived from the chosen period.
 *
 * In Copilot mode every action is presented for approval anyway; in Autopilot
 * the agent is fully autonomous — it publishes + runs automations itself and
 * only notifies the user — so nothing is gated behind approval by default. A
 * guardrail violation (banned topic, frequency cap, budget) still raises an
 * approval as a safety net.
 */
export function buildCreateMissionPayload(
  values: MissionFormValues,
  ctx: { workspaceId: string; accountId: string; platform?: string },
): CreateMissionPayload {
  const targetDate = values.targetDate.trim()
  const localLanguage = values.localLanguage.trim()

  return {
    workspaceId: ctx.workspaceId,
    accountId: ctx.accountId,
    platform: ctx.platform ?? 'instagram',
    goal: {
      metric: values.goalMetric,
      targetValue: Number(values.targetValue.trim()),
      ...(targetDate ? { targetDate } : {}),
    },
    niche: values.niche.trim(),
    brandVoice: values.brandVoice.trim(),
    ...(localLanguage ? { localLanguage } : {}),
    operatingMode: values.operatingMode,
    contentSourcePreference: values.contentSourcePreference,
    guardrails: {
      bannedTopics: parseBannedTopics(values.bannedTopics),
      postingFrequency: {
        count: parseIntOrNaN(values.postingCount),
        per: values.postingPer,
        windowMs: values.postingPer === 'day' ? DAY_MS : WEEK_MS,
      },
      creditBudget: parseIntOrNaN(values.creditBudget),
      // Autopilot = autonomous (notify only); Copilot gates everything via the
      // approval flow regardless. Nothing is approval-gated by default.
      approvalRequiredActions: [],
    },
  }
}
