/**
 * Mission Control — pure view helpers.
 *
 * Small, side-effect-free functions the MissionControlDashboard and its widgets
 * use to shape mission data for display: current progress value, percent toward
 * the goal, and human-readable labels for activity records and approvals. Kept
 * separate from the React components so the logic is unit-testable in isolation.
 *
 * Requirements: 16.4, 16.5
 */

import type {
  ActivityRecord,
  MissionDetail,
  PendingApproval,
  ProgressPoint,
} from '../api/autopilotApi'

/**
 * The latest recorded progress value for a mission (MEASURE history), falling
 * back to the goal's start value, then 0. The history is appended over time so
 * the last point is the most recent measurement (R16.4).
 */
export function currentProgressValue(mission: Pick<MissionDetail, 'goal' | 'progress'>): number {
  const history: ProgressPoint[] = mission.progress ?? []
  if (history.length > 0) {
    const last = history[history.length - 1]
    if (typeof last?.value === 'number' && Number.isFinite(last.value)) return last.value
  }
  const start = mission.goal?.startValue
  return typeof start === 'number' && Number.isFinite(start) ? start : 0
}

/**
 * Percent complete toward the goal's target metric, clamped to [0, 100]. When
 * the target is missing or non-positive the percent is 0 (nothing to measure
 * against). A start value shifts the baseline so progress reflects gains since
 * the mission began rather than absolute value.
 */
export function goalProgressPercent(
  mission: Pick<MissionDetail, 'goal' | 'progress'>,
): number {
  const target = mission.goal?.targetValue
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return 0

  const start = typeof mission.goal?.startValue === 'number' ? mission.goal.startValue : 0
  const current = currentProgressValue(mission)

  const denominator = target - start
  if (denominator <= 0) {
    // Target already at/below the baseline — treat any current ≥ target as done.
    return current >= target ? 100 : 0
  }

  const ratio = (current - start) / denominator
  const percent = Math.round(ratio * 100)
  return Math.min(100, Math.max(0, percent))
}

/** Format a metric name for display (e.g. `followers` → `Followers`). */
export function formatMetric(metric: string | undefined | null): string {
  if (!metric) return 'Goal'
  return metric.charAt(0).toUpperCase() + metric.slice(1)
}

/** Human-readable label for an activity record's stage + action. */
export function activityLabel(record: Pick<ActivityRecord, 'stage' | 'action'>): string {
  const action = (record.action ?? '').replace(/[._-]+/g, ' ').trim()
  const stage = record.stage ?? ''
  if (!action) return stage || 'Activity'
  return stage ? `${stage} · ${action}` : action
}

/** Tone for an activity outcome, used to pick a colour in the UI. */
export function outcomeTone(
  outcome: string | undefined,
): 'success' | 'failure' | 'blocked' | 'neutral' {
  switch (outcome) {
    case 'success':
      return 'success'
    case 'failure':
      return 'failure'
    case 'blocked':
    case 'deferred':
      return 'blocked'
    default:
      return 'neutral'
  }
}

/** Short, human label for an approval's item type. */
export function approvalItemLabel(approval: Pick<PendingApproval, 'itemType'>): string {
  switch (approval.itemType) {
    case 'content-slot':
      return 'Post'
    case 'caption':
      return 'Caption'
    case 'automation':
      return 'Engagement automation'
    case 'plan':
      return 'Content plan'
    case 'budget':
      return 'Budget'
    default:
      return 'Item'
  }
}

/** Format an ISO timestamp for compact display; empty string when absent. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
