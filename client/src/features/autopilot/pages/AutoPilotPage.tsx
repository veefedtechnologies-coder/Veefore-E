/**
 * AutoPilotPage
 *
 * Entry page for VeeGPT Auto Pilot, mounted at the `/autopilot` route.
 *
 * Resolves the active workspace + connected Instagram account and renders the
 * MissionSetupWizard when the workspace has no mission yet (or the user picks
 * "New mission"). Once a mission exists it shows the MissionControlDashboard for
 * the selected mission (goal progress, pending approvals, activity log, live
 * updates), with a compact mission switcher when the workspace has more than one
 * mission.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 16.1, 16.4, 16.5
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { AutoPilotChat } from '../components/AutoPilotChat'
import { listMissions, type Mission } from '../api/autopilotApi'

const PLATFORM = 'instagram'

export const AutoPilotPage: React.FC = () => {
  const { currentWorkspaceId } = useCurrentWorkspace()
  const { validAccounts } = useSocialAccounts(currentWorkspaceId || undefined)
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)

  // The connected Instagram account this workspace's missions bind to (R1.5).
  const instagramAccount = useMemo(
    () =>
      validAccounts.find(
        (a: any) => (a?.platform ?? 'instagram').toLowerCase() === PLATFORM,
      ),
    [validAccounts],
  )
  // All connected accounts in the workspace, so the user can pick which one to
  // grow during setup. Defaults to the Instagram account when present.
  const accounts = useMemo(
    () =>
      (validAccounts ?? []).map((a: any) => ({
        id: String(a.id ?? a._id),
        username: a.username,
        platform: (a.platform ?? 'instagram') as string,
        profilePictureUrl: a.profilePictureUrl,
      })),
    [validAccounts],
  )
  const accountId = instagramAccount
    ? String(instagramAccount.id ?? instagramAccount._id)
    : accounts[0]?.id ?? null
  const hasConnectedAccount = accounts.length > 0

  const missionsQuery = useQuery({
    queryKey: ['/api/v1/autopilot/missions', currentWorkspaceId],
    queryFn: () => listMissions(currentWorkspaceId as string),
    enabled: !!currentWorkspaceId,
  })

  const missions = missionsQuery.data ?? []
  const hasMission = missions.length > 0

  // Keep a valid selection: default to the first mission, and recover if the
  // selected mission disappears (e.g. deleted).
  useEffect(() => {
    if (missions.length === 0) {
      if (selectedMissionId !== null) setSelectedMissionId(null)
      return
    }
    if (!selectedMissionId || !missions.some((m) => m.id === selectedMissionId)) {
      setSelectedMissionId(missions[0].id)
    }
  }, [missions, selectedMissionId])

  const handleCreated = (mission: Mission) => {
    setCreating(false)
    setSelectedMissionId(mission.id)
    // Reflect the new mission immediately, then reconcile with the server.
    queryClient.setQueryData<Mission[]>(
      ['/api/v1/autopilot/missions', currentWorkspaceId],
      (prev) => [mission, ...(prev ?? [])],
    )
    queryClient.invalidateQueries({
      queryKey: ['/api/v1/autopilot/missions', currentWorkspaceId],
    })
  }

  const showSetup = creating || !hasMission

  if (missionsQuery.isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-white dark:bg-slate-900 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-white dark:bg-slate-900">
      <AutoPilotChat
        // Remount per mission-context so in-chat state (composer messages, the
        // setup conversation) never leaks between missions or into a new mission.
        key={showSetup ? 'autopilot-setup' : `mission-${selectedMissionId}`}
        missionId={showSetup ? null : selectedMissionId}
        workspaceId={currentWorkspaceId || undefined}
        accountId={accountId}
        hasConnectedAccount={hasConnectedAccount}
        platform={PLATFORM}
        accounts={accounts}
        missions={missions}
        selectedMissionId={selectedMissionId}
        onSelectMission={setSelectedMissionId}
        onCreated={handleCreated}
        onNewMission={() => setCreating(true)}
        onCancelSetup={hasMission ? () => setCreating(false) : undefined}
      />
    </div>
  )
}

export default AutoPilotPage
