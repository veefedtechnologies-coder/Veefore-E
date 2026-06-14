/**
 * AdminPermissions component
 *
 * Renders the permission assignment interface used inside the "Invite Admin"
 * modal. Displays permissions grouped by category with risk-level badges and
 * enforces role-based permission constraints (required / restricted).
 */
import React, { useMemo } from 'react'
import { PERMISSIONS, ROLE_CONSTRAINTS } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Risk level categories for individual permissions. */
type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AdminPermissionsProps {
  /** The currently selected role, used to determine which permissions are available. */
  role: string
  /** The list of currently selected permissions. */
  selectedPermissions: string[]
  /** Callback fired when a permission is toggled. */
  onPermissionToggle: (permission: string, checked: boolean) => void
}

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Groups a list of permissions by their human-readable category name.
 *
 * @param permissions - The permissions to group.
 * @returns An object mapping category label to permission strings.
 */
export function groupPermissionsByCategory(permissions: string[]): Record<string, string[]> {
  return permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const category = getPermissionCategory(permission)
    if (!acc[category]) acc[category] = []
    acc[category].push(permission)
    return acc
  }, {})
}

/**
 * Derives the human-readable category label for a permission string.
 *
 * @param permission - A dot-namespaced permission string (e.g. `users.read`).
 * @returns The category label.
 */
export function getPermissionCategory(permission: string): string {
  if (permission.startsWith('auth.')) return 'Authentication & Security'
  if (permission.startsWith('users.')) return 'User Management'
  if (permission.startsWith('admins.')) return 'Admin Management'
  if (
    permission.startsWith('subscriptions.') ||
    permission.startsWith('billing.') ||
    permission.startsWith('plans.')
  ) return 'Subscription & Billing'
  if (permission.startsWith('refunds.')) return 'Refund Management'
  if (
    permission.startsWith('tickets.') ||
    permission.startsWith('chat.') ||
    permission.startsWith('notifications.')
  ) return 'Support & Communication'
  if (permission.startsWith('content.') || permission.startsWith('social.')) return 'Content & Social Media'
  if (permission.startsWith('ai.') || permission.startsWith('ml.')) return 'AI & Machine Learning'
  if (permission.startsWith('analytics.') || permission.startsWith('reports.')) return 'Analytics & Reporting'
  if (permission.startsWith('coupons.') || permission.startsWith('discounts.')) return 'Coupon & Discount Management'
  if (
    permission.startsWith('system.') ||
    permission.startsWith('security.') ||
    permission.startsWith('database.')
  ) return 'System Administration'
  if (permission.startsWith('webhooks.') || permission.startsWith('api.')) return 'Webhook & Integration'
  if (permission.startsWith('compliance.') || permission.startsWith('legal.')) return 'Legal & Compliance'
  if (permission.startsWith('teams.')) return 'Team Management'
  return 'Other'
}

/**
 * Determines the risk level for a permission.
 *
 * @param permission - A dot-namespaced permission string.
 * @returns The risk level for the permission.
 */
export function getPermissionRiskLevel(permission: string): RiskLevel {
  const critical = [
    'users.delete', 'admins.create', 'admins.delete',
    'system.settings.edit', 'system.maintenance', 'security.audit.export',
  ]
  const high = [
    'users.impersonate', 'users.export', 'billing.payments.refund', 'refunds.approve',
    'refunds.reject', 'analytics.revenue.view', 'coupons.delete', 'teams.create', 'teams.edit',
  ]
  const medium = [
    'users.edit', 'users.ban', 'subscriptions.edit', 'tickets.assign',
    'content.moderate', 'notifications.send',
  ]

  if (critical.includes(permission)) return 'critical'
  if (high.includes(permission)) return 'high'
  if (medium.includes(permission)) return 'medium'
  return 'low'
}

/**
 * Returns the set of permissions that are available (i.e. within maxPermissions
 * and not restricted) for a given role.
 *
 * @param role - The admin role.
 * @returns Array of available permission strings.
 */
export function getAvailablePermissions(role: string): string[] {
  const constraints = ROLE_CONSTRAINTS[role]
  if (!constraints) return []
  return PERMISSIONS.filter(
    p => constraints.maxPermissions.includes(p) && !constraints.restricted.includes(p),
  )
}

// ---------------------------------------------------------------------------
// Risk badge sub-component
// ---------------------------------------------------------------------------

const RISK_BADGE_CONFIG: Record<Exclude<RiskLevel, 'low'>, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
  high: { label: 'High Risk', className: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Medium Risk', className: 'bg-yellow-100 text-yellow-800' },
}

/**
 * Renders a small coloured badge for a permission's risk level (hidden for
 * `low` risk to reduce visual noise).
 *
 * @param riskLevel - The risk level to display.
 */
const RiskBadge: React.FC<{ riskLevel: RiskLevel }> = ({ riskLevel }) => {
  const config = RISK_BADGE_CONFIG[riskLevel as keyof typeof RISK_BADGE_CONFIG]
  if (!config) return null

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${config.className}`}>
      {config.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AdminPermissions renders the grouped, scrollable permission checklist used
 * when inviting a new admin. Role constraints are enforced: required permissions
 * are pre-checked and disabled; restricted permissions are excluded entirely.
 *
 * @param props - See {@link AdminPermissionsProps}.
 */
export const AdminPermissions: React.FC<AdminPermissionsProps> = ({
  role,
  selectedPermissions,
  onPermissionToggle,
}) => {
  const constraints = ROLE_CONSTRAINTS[role]

  /** Permissions available for the selected role, grouped by category. */
  const groupedPermissions = useMemo(() => {
    const available = getAvailablePermissions(role)
    return groupPermissionsByCategory(available)
  }, [role])

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Permissions
      </label>
      <p className="text-xs text-gray-500 mb-2">
        Auto-granted permissions are pre-selected based on the role. Required permissions cannot be removed.
      </p>

      {/* Scrollable permission list */}
      <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-md p-4">
        {Object.entries(groupedPermissions).map(([category, permissions]) => (
          <div key={category} className="mb-4">
            <h4 className="font-medium text-sm text-gray-800 mb-2 border-b border-gray-200 pb-1">
              {category}
            </h4>
            <div className="grid grid-cols-1 gap-1">
              {permissions.map(permission => {
                const isRequired = constraints?.minPermissions.includes(permission) ?? false
                const isRestricted = constraints?.restricted.includes(permission) ?? false
                const riskLevel = getPermissionRiskLevel(permission)
                const isChecked = selectedPermissions.includes(permission)
                const isDisabled = isRequired || isRestricted

                return (
                  <label
                    key={permission}
                    className={`flex items-center p-2 rounded ${isDisabled ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(e) => onPermissionToggle(permission, e.target.checked)}
                      className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />
                    <div className="ml-2 flex-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-sm ${
                            isRequired ? 'font-medium text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {permission}
                        </span>
                        {isRequired && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                            Required
                          </span>
                        )}
                        <RiskBadge riskLevel={riskLevel} />
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Selected: {selectedPermissions.length} permissions
      </p>
    </div>
  )
}
