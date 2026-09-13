/**
 * MissionControlDashboard
 *
 * The live control surface for a single Auto Pilot mission (R16.4). It shows:
 *   • the Goal progress widget (current value vs the target metric),
 *   • pending Approval_Cards (count + contents),
 *   • the Operating-Loop activity log,
 * plus the mission lifecycle controls (activate / pause / resume).
 *
 * Data comes from react-query (`getMission`, `listApprovals`, `listActivity`)
 * and is refreshed **live** over the workspace-scoped Auto Pilot WebSocket
 * channel: {@link useAutoPilotRealtime} invalidates the mission/approvals/
 * activity queries on every `autopilot_message` broadcast, so MEASURE progress
 * and new Approval_Cards appear within seconds (R16.5). A light polling fallback
 * keeps the view fresh even when the socket cannot connect.
 *
 * If a query fails to load, the view surfaces an error indication and offers a
 * retry; the mission state itself is untouched (R16.6).
 *
 * Requirements: 16.4, 16.5, 16.6
 */

import React, { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Pause, Play, Plus, RefreshCw, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  activateMission,
  getMission,
  listActivity,
  listApprovals,
  pauseMission,
  resumeMission,
  type MissionDetail,
} from '../api/autopilotApi'
import { useAutoPilotRealtime } from '../hooks/useAutoPilotRealtime'
import { GoalProgressWidget } from './GoalProgressWidget'
import { PendingApprovalsWidget } from './PendingApprovalsWidget'
import { ActivityLog } from './ActivityLog'
import { MediaPoolPanel } from './MediaPoolPanel'

/** Poll fallback cadence (ms) when the live socket is unavailable. */
const POLL_INTERVAL_MS = 30_000

export interface MissionControlDashboardProps {
  /** The mission to control. */
  missionId: string
  /** Workspace the mission (and its live channel) is scoped to. */
  workspaceId?: string | null
  /** Start a new mission from the dashboard header. */
  onNewMission?: () => void
}

const queryKeys = {
  mission: (id: string) => ['/api/v1/autopilot/missions', id] as const,
  approvals: (id: string) => ['/api/v1/autopilot/missions', id, 'approvals'] as const,
  activity: (id: string) => ['/api/v1/autopilot/missions', id, 'activity'] as const,
}

export const MissionControlDashboard: React.FC<MissionControlDashboardProps> = ({
  missionId,
  workspaceId,
  onNewMission,
}) => {
  const queryClient = useQueryClient()

  const missionQuery = useQuery({
    queryKey: queryKeys.mission(missionId),
    queryFn: () => getMission(missionId),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const approvalsQuery = useQuery({
    queryKey: queryKeys.approvals(missionId),
    queryFn: () => listApprovals(missionId),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const activityQuery = useQuery({
    queryKey: queryKeys.activity(missionId),
    queryFn: () => listActivity(missionId),
    enabled: !!missionId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  // R16.5 — live updates: invalidate the mission-scoped queries whenever the
  // workspace channel broadcasts an Auto Pilot message (narration / card /
  // progress), so the widgets reflect the change within seconds.
  const handleRealtimeMessage = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.mission(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.approvals(missionId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.activity(missionId) })
  }, [queryClient, missionId])

  useAutoPilotRealtime({
    workspaceId,
    enabled: !!missionId && !!workspaceId,
    onMessage: handleRealtimeMessage,
  })

  const onMutated = useCallback(
    (mission: MissionDetail) => {
      queryClient.setQueryData(queryKeys.mission(missionId), mission)
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(missionId) })
    },
    [queryClient, missionId],
  )

  const activate = useMutation({
    mutationFn: () => activateMission(missionId),
    onSuccess: onMutated,
  })
  const pause = useMutation({
    mutationFn: () => pauseMission(missionId),
    onSuccess: onMutated,
  })
  const resume = useMutation({
    mutationFn: () => resumeMission(missionId),
    onSuccess: onMutated,
  })

  const mutating = activate.isPending || pause.isPending || resume.isPending
  const lifecycleError =
    (activate.error as Error | null)?.message ??
    (pause.error as Error | null)?.message ??
    (resume.error as Error | null)?.message ??
    null

  // R16.6 — the mission is the primary object; if it fails to load, surface an
  // error + retry without discarding anything.
  if (missionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (missionQuery.isError || !missionQuery.data) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Couldn't load Mission Control
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your mission is safe. This is just a display hiccup — try again.
        </p>
        <Button className="mt-5" onClick={() => missionQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  const mission = missionQuery.data
  const approvals = approvalsQuery.data ?? []
  const activity = activityQuery.data ?? []

  const canActivate = mission.status === 'draft' || mission.status === 'paused'
  const canPause = mission.status === 'active'
  const canResume = mission.status === 'paused'

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Header + lifecycle controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20">
            <Rocket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 capitalize">
              {mission.niche || 'Auto Pilot mission'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="uppercase tracking-wide">{mission.status}</span>
              {' · '}
              {mission.operatingMode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canActivate && (
            <Button onClick={() => activate.mutate()} disabled={mutating}>
              <Play className="h-4 w-4 mr-2" />
              {canResume ? 'Resume' : 'Activate'}
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => pause.mutate()} disabled={mutating}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {onNewMission && (
            <Button variant="ghost" onClick={onNewMission} disabled={mutating}>
              <Plus className="h-4 w-4 mr-2" />
              New mission
            </Button>
          )}
        </div>
      </div>

      {lifecycleError && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-6"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{lifecycleError}</span>
        </div>
      )}

      {/* Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <GoalProgressWidget mission={mission} />
        <PendingApprovalsWidget approvals={approvals} />
      </div>

      <div className="mb-5">
        <MediaPoolPanel missionId={missionId} />
      </div>

      <ActivityLog records={activity} />
    </div>
  )
}

export default MissionControlDashboard
