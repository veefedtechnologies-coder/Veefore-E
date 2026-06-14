/**
 * AdminsPage
 *
 * Orchestrator page that composes the three admin-management sub-components:
 *  - {@link AdminList}        – admin/invitation tables, search, statistics
 *  - {@link AdminInvite}      – invite form modal + invitation details modal
 *
 * All data fetching, mutation logic, and UI detail live in the child components.
 * This file is intentionally thin — it owns only the shared UI state that must
 * be coordinated between the list and the modals.
 */
import React, { useState } from 'react'
import { useQuery } from 'react-query'
import { apiClient } from '../../services/api'
import { AdminInvite as AdminInviteType } from './components/admins/types'
import { AdminList } from './components/admins/AdminList'
import { AdminInvite } from './components/admins/AdminInvite'

/**
 * Top-level admin management page.
 *
 * State owned here:
 * - `searchTerm`          – passed to the admins API query and the AdminList
 * - `statusFilter`        – passed to the invitations API query and the AdminList
 * - `showInviteModal`     – controls visibility of the invite form modal
 * - `selectedInvite`      – the invitation currently open in the details modal
 * - `showInviteDetails`   – controls visibility of the invite details modal
 */
export const AdminsPage: React.FC = () => {
  // ---------------------------------------------------------------------------
  // Shared UI state
  // ---------------------------------------------------------------------------

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedInvite, setSelectedInvite] = useState<AdminInviteType | null>(null)
  const [showInviteDetails, setShowInviteDetails] = useState(false)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  /** Fetches the active admin accounts, re-running whenever the search term changes. */
  const { data: adminsData, isLoading: adminsLoading } = useQuery(
    ['admins', searchTerm],
    async () => {
      const response = await apiClient.get('/admin', {
        params: { search: searchTerm },
      })
      return response.data
    },
  )

  /** Fetches admin invitations, filtered by the current status filter. */
  const { data: invitationsData, isLoading: invitationsLoading } = useQuery(
    ['admin-invitations', statusFilter],
    async () => {
      const response = await apiClient.get('/onboarding/invitations', {
        params: { status: statusFilter === 'all' ? undefined : statusFilter },
      })
      return response.data
    },
  )

  const admins = adminsData?.data?.admins ?? []
  const invitations = invitationsData?.data?.invitations ?? []

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Admin accounts + invitations tables with search/filter controls */}
      <AdminList
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        admins={admins}
        adminsLoading={adminsLoading}
        invitations={invitations}
        invitationsLoading={invitationsLoading}
        onInviteClick={() => setShowInviteModal(true)}
        onViewInvite={(invite) => {
          setSelectedInvite(invite)
          setShowInviteDetails(true)
        }}
      />

      {/* Invite form modal + invitation details modal */}
      <AdminInvite
        showInviteModal={showInviteModal}
        onCloseInviteModal={() => setShowInviteModal(false)}
        showInviteDetails={showInviteDetails}
        onCloseInviteDetails={() => {
          setShowInviteDetails(false)
          setSelectedInvite(null)
        }}
        selectedInvite={selectedInvite}
      />
    </div>
  )
}
