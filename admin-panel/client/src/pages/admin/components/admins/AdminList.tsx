/**
 * AdminList component
 *
 * Renders the active admin accounts table and the pending invitations table,
 * along with search/filter controls and status statistics cards.
 * Handles approve, reject, and resend actions for invitations.
 */
import React from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/Card'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import {
  UserCheck,
  Plus,
  Search,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Eye,
  MoreVertical,
  Shield,
  Users,
  Crown,
  AlertTriangle,
} from 'lucide-react'
import { apiClient } from '../../../../services/api'
import { Admin, AdminInvite } from './types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AdminListProps {
  /** Current search term bound to the search input. */
  searchTerm: string
  /** Callback to update the search term in the parent. */
  onSearchChange: (value: string) => void
  /** Current invitation status filter value. */
  statusFilter: string
  /** Callback to update the status filter in the parent. */
  onStatusFilterChange: (value: string) => void
  /** Active admin list returned from the API. */
  admins: Admin[]
  /** Whether admins are loading. */
  adminsLoading: boolean
  /** Invitation list returned from the API. */
  invitations: AdminInvite[]
  /** Whether invitations are loading. */
  invitationsLoading: boolean
  /** Opens the "Invite Admin" modal. */
  onInviteClick: () => void
  /** Opens the invitation detail modal for the given invite. */
  onViewInvite: (invite: AdminInvite) => void
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a coloured badge for an invitation status.
 *
 * @param status - The invitation status string.
 * @returns A styled badge element.
 */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    approved: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
    accepted: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
    expired: { color: 'bg-gray-100 text-gray-800', icon: AlertTriangle },
  }

  const config = statusConfig[status] ?? statusConfig.pending
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3 mr-1" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

/**
 * Returns the appropriate role icon for a given role name.
 *
 * @param role - The admin role string.
 * @returns A Lucide icon element.
 */
const RoleIcon: React.FC<{ role: string }> = ({ role }) => {
  switch (role) {
    case 'superadmin':
      return <Crown className="h-4 w-4" />
    case 'admin':
      return <Shield className="h-4 w-4" />
    default:
      return <UserCheck className="h-4 w-4" />
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AdminList displays the admin accounts table, the invitations table,
 * statistics cards, and the search/filter bar.
 *
 * @param props - See {@link AdminListProps}.
 */
export const AdminList: React.FC<AdminListProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  admins,
  adminsLoading,
  invitations,
  invitationsLoading,
  onInviteClick,
  onViewInvite,
}) => {
  const queryClient = useQueryClient()

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Approves a pending admin invitation by id.
   * Invalidates the invitations query on success.
   */
  const approveInviteMutation = useMutation(
    async ({ id, approvalMessage }: { id: string; approvalMessage?: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/approve`, { approvalMessage })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
      },
    },
  )

  /**
   * Rejects a pending admin invitation by id.
   * Invalidates the invitations query on success.
   */
  const rejectInviteMutation = useMutation(
    async ({ id, rejectionReason }: { id: string; rejectionReason: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/reject`, { rejectionReason })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
      },
    },
  )

  /**
   * Resends an approved admin invitation by id.
   * Invalidates the invitations query on success.
   */
  const resendInviteMutation = useMutation(
    async ({ id, expirationHours }: { id: string; expirationHours?: number }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/resend`, { expirationHours })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
      },
    },
  )

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  /**
   * Approves the given invite directly (no confirmation modal).
   *
   * @param invite - The invitation to approve.
   */
  const handleApprove = (invite: AdminInvite) => {
    approveInviteMutation.mutate({ id: invite._id })
  }

  /**
   * Prompts for a rejection reason then rejects the invite.
   *
   * @param invite - The invitation to reject.
   */
  const handleReject = (invite: AdminInvite) => {
    const reason = prompt('Please provide a reason for rejection:')
    if (reason) {
      rejectInviteMutation.mutate({ id: invite._id, rejectionReason: reason })
    }
  }

  /**
   * Resends the given invite.
   *
   * @param invite - The invitation to resend.
   */
  const handleResend = (invite: AdminInvite) => {
    resendInviteMutation.mutate({ id: invite._id })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-600">Manage admin accounts and invitations</p>
        </div>
        <Button onClick={onInviteClick}>
          <Plus className="h-4 w-4 mr-2" />
          Invite Admin
        </Button>
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Total Admins</p>
                <p className="text-2xl font-bold text-gray-900">{admins.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Pending Invites</p>
                <p className="text-2xl font-bold text-gray-900">
                  {invitations.filter(inv => inv.status === 'pending').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {invitations.filter(inv => inv.status === 'approved').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Rejected</p>
                <p className="text-2xl font-bold text-gray-900">
                  {invitations.filter(inv => inv.status === 'rejected').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and filter bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search admins or invitations..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Admin accounts table */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Accounts</CardTitle>
          <CardDescription>Current admin team members</CardDescription>
        </CardHeader>
        <CardContent>
          {adminsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Admin', 'Role', 'Team', 'Level', 'Status', 'Last Login', 'Actions'].map(col => (
                      <th
                        key={col}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {admins.map((admin: Admin) => (
                    <tr key={admin._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                              <span className="text-sm font-medium text-white">
                                {admin.firstName[0]}{admin.lastName[0]}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {admin.firstName} {admin.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{admin.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <RoleIcon role={admin.role} />
                          <span className="ml-2 text-sm text-gray-900 capitalize">{admin.role}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                        {admin.team}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Level {admin.level}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            admin.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {admin.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Button variant="outline" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invitations table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>Manage admin invitations and approvals</CardDescription>
        </CardHeader>
        <CardContent>
          {invitationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Invitee', 'Role', 'Team', 'Invited By', 'Status', 'Expires', 'Actions'].map(col => (
                      <th
                        key={col}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invitations.map((invite: AdminInvite) => (
                    <tr key={invite._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-gray-400 to-gray-600 flex items-center justify-center">
                              <span className="text-sm font-medium text-white">
                                {invite.firstName[0]}{invite.lastName[0]}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {invite.firstName} {invite.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{invite.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <RoleIcon role={invite.role} />
                          <span className="ml-2 text-sm text-gray-900 capitalize">{invite.role}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                        {invite.team}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {invite.invitedBy.firstName} {invite.invitedBy.lastName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={invite.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewInvite(invite)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {invite.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApprove(invite)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReject(invite)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {invite.status === 'approved' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(invite)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
