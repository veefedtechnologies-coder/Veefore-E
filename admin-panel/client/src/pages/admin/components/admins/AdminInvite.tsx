/**
 * AdminInvite component
 *
 * Encapsulates the "Invite New Admin" modal form and the "Invitation Details"
 * modal. Handles:
 *  - Sending new invitations via the API
 *  - Approving / rejecting / resending existing invitations
 *  - Role-based permission auto-assignment and validation
 */
import React, { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { Modal } from '../../../../components/ui/Modal'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { apiClient } from '../../../../services/api'
import { AdminInvite as AdminInviteType, InviteFormData, ROLES, TEAMS, ROLE_CONSTRAINTS } from './types'
import { AdminPermissions } from './AdminPermissions'
import { Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

const DEFAULT_FORM: InviteFormData = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'admin',
  level: 3,
  team: 'support',
  permissions: [],
  expirationHours: 48,
  customMessage: '',
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a coloured status badge for an invitation.
 *
 * @param status - The invitation status string.
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AdminInviteProps {
  /** Whether the "Invite Admin" form modal is open. */
  showInviteModal: boolean
  /** Closes the "Invite Admin" form modal. */
  onCloseInviteModal: () => void
  /** Whether the invitation details modal is open. */
  showInviteDetails: boolean
  /** Closes the invitation details modal. */
  onCloseInviteDetails: () => void
  /** The invitation whose details are displayed (if any). */
  selectedInvite: AdminInviteType | null
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Returns the auto-granted permissions for a given role.
 *
 * @param role - The admin role string.
 * @returns Array of permission strings that are automatically granted.
 */
function getAutoGrantedPermissions(role: string): string[] {
  return ROLE_CONSTRAINTS[role]?.autoGranted ?? []
}

/**
 * Validates that the selected permissions are compatible with the given role's
 * constraints (all required permissions present, no restricted permissions included).
 *
 * @param role - The admin role string.
 * @param permissions - The permissions to validate.
 * @returns Validation result with `valid` flag and `errors` array.
 */
function validatePermissions(
  role: string,
  permissions: string[],
): { valid: boolean; errors: string[] } {
  const constraints = ROLE_CONSTRAINTS[role]
  if (!constraints) return { valid: false, errors: ['Invalid role'] }

  const errors: string[] = []

  for (const minPerm of constraints.minPermissions) {
    if (!permissions.includes(minPerm)) {
      errors.push(`Missing required permission: ${minPerm}`)
    }
  }

  for (const perm of permissions) {
    if (constraints.restricted.includes(perm)) {
      errors.push(`Permission not allowed for role: ${perm}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AdminInvite renders the invite form modal and the invite details modal.
 * It manages its own form state and mutations, keeping the parent page lean.
 *
 * @param props - See {@link AdminInviteProps}.
 */
export const AdminInvite: React.FC<AdminInviteProps> = ({
  showInviteModal,
  onCloseInviteModal,
  showInviteDetails,
  onCloseInviteDetails,
  selectedInvite,
}) => {
  const queryClient = useQueryClient()

  // -------------------------------------------------------------------------
  // Local form state
  // -------------------------------------------------------------------------

  const [formData, setFormData] = useState<InviteFormData>(DEFAULT_FORM)

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Sends a new admin invitation.
   * Resets the form and closes the modal on success.
   */
  const sendInviteMutation = useMutation(
    async (data: InviteFormData) => {
      const response = await apiClient.post('/onboarding/invite', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        onCloseInviteModal()
        setFormData(DEFAULT_FORM)
      },
    },
  )

  /**
   * Approves the currently selected invitation.
   * Closes the details modal on success.
   */
  const approveInviteMutation = useMutation(
    async ({ id, approvalMessage }: { id: string; approvalMessage?: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/approve`, { approvalMessage })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        onCloseInviteDetails()
      },
    },
  )

  /**
   * Rejects the currently selected invitation.
   * Closes the details modal on success.
   */
  const rejectInviteMutation = useMutation(
    async ({ id, rejectionReason }: { id: string; rejectionReason: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/reject`, { rejectionReason })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        onCloseInviteDetails()
      },
    },
  )

  /**
   * Resends an approved invitation.
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
   * Handles form submission — validates permissions, then fires the mutation.
   *
   * @param e - The form submit event.
   */
  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault()
    const validation = validatePermissions(formData.role, formData.permissions)
    if (!validation.valid) {
      alert(`Permission validation failed:\n${validation.errors.join('\n')}`)
      return
    }
    sendInviteMutation.mutate(formData)
  }

  /**
   * Changes the selected role and auto-populates permissions.
   *
   * @param newRole - The newly selected role.
   */
  const handleRoleChange = (newRole: string) => {
    setFormData(prev => ({
      ...prev,
      role: newRole,
      permissions: getAutoGrantedPermissions(newRole),
    }))
  }

  /**
   * Toggles a single permission in the form, respecting role constraints.
   *
   * @param permission - The permission string to toggle.
   * @param checked - Whether the checkbox is now checked.
   */
  const handlePermissionToggle = (permission: string, checked: boolean) => {
    const constraints = ROLE_CONSTRAINTS[formData.role]
    if (!constraints) return
    if (constraints.restricted.includes(permission)) return
    if (!constraints.maxPermissions.includes(permission)) return

    setFormData(prev => {
      let updated = [...prev.permissions]
      if (checked) {
        updated.push(permission)
      } else {
        if (constraints.minPermissions.includes(permission)) return prev
        updated = updated.filter(p => p !== permission)
      }
      return { ...prev, permissions: updated }
    })
  }

  /** Approves the currently selected invite. */
  const handleApproveInvite = () => {
    if (selectedInvite) {
      approveInviteMutation.mutate({ id: selectedInvite._id })
    }
  }

  /** Prompts for a rejection reason and rejects the currently selected invite. */
  const handleRejectInvite = () => {
    if (selectedInvite) {
      const reason = prompt('Please provide a reason for rejection:')
      if (reason) {
        rejectInviteMutation.mutate({ id: selectedInvite._id, rejectionReason: reason })
      }
    }
  }

  /** Resends the currently selected invite. */
  const handleResendInvite = () => {
    if (selectedInvite) {
      resendInviteMutation.mutate({ id: selectedInvite._id })
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Invite Admin form modal                                             */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        isOpen={showInviteModal}
        onClose={onCloseInviteModal}
        title="Invite New Admin"
        size="lg"
      >
        <form onSubmit={handleSendInvite} className="space-y-6">
          {/* Basic info fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <Input
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <Input
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={formData.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {ROLES.map(role => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <select
                value={formData.team}
                onChange={(e) => setFormData(prev => ({ ...prev, team: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {TEAMS.map(team => (
                  <option key={team} value={team}>
                    {team.charAt(0).toUpperCase() + team.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select
                value={formData.level}
                onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {[1, 2, 3, 4, 5].map(level => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiration (Hours)
              </label>
              <Input
                type="number"
                value={formData.expirationHours}
                onChange={(e) => setFormData(prev => ({ ...prev, expirationHours: parseInt(e.target.value) }))}
                min="1"
                max="168"
              />
            </div>
          </div>

          {/* Permissions assignment */}
          <AdminPermissions
            role={formData.role}
            selectedPermissions={formData.permissions}
            onPermissionToggle={handlePermissionToggle}
          />

          {/* Optional custom message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Message (Optional)
            </label>
            <textarea
              value={formData.customMessage}
              onChange={(e) => setFormData(prev => ({ ...prev, customMessage: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add a personal message to the invitation..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onCloseInviteModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sendInviteMutation.isLoading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {sendInviteMutation.isLoading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Invitation details modal                                            */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        isOpen={showInviteDetails}
        onClose={onCloseInviteDetails}
        title="Invitation Details"
        size="lg"
      >
        {selectedInvite && (
          <div className="space-y-6">
            {/* Invite metadata grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <p className="text-sm text-gray-900">
                  {selectedInvite.firstName} {selectedInvite.lastName}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-900">{selectedInvite.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <p className="text-sm text-gray-900 capitalize">{selectedInvite.role}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Team</label>
                <p className="text-sm text-gray-900 capitalize">{selectedInvite.team}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Level</label>
                <p className="text-sm text-gray-900">Level {selectedInvite.level}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">
                  <StatusBadge status={selectedInvite.status} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Invited By</label>
                <p className="text-sm text-gray-900">
                  {selectedInvite.invitedBy.firstName} {selectedInvite.invitedBy.lastName}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expires</label>
                <p className="text-sm text-gray-900">
                  {new Date(selectedInvite.expiresAt).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Assigned permissions */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Permissions</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedInvite.permissions.map(permission => (
                  <span
                    key={permission}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </div>

            {/* Rejection reason (if present) */}
            {selectedInvite.rejectionReason && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Rejection Reason</label>
                <p className="text-sm text-gray-900">{selectedInvite.rejectionReason}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={onCloseInviteDetails}>
                Close
              </Button>
              {selectedInvite.status === 'pending' && (
                <>
                  <Button
                    onClick={handleApproveInvite}
                    disabled={approveInviteMutation.isLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {approveInviteMutation.isLoading ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    onClick={handleRejectInvite}
                    disabled={rejectInviteMutation.isLoading}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {rejectInviteMutation.isLoading ? 'Rejecting...' : 'Reject'}
                  </Button>
                </>
              )}
              {selectedInvite.status === 'approved' && (
                <Button
                  onClick={handleResendInvite}
                  disabled={resendInviteMutation.isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {resendInviteMutation.isLoading ? 'Resending...' : 'Resend'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
