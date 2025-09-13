import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { 
  UserCheck, 
  Plus, 
  Search, 
  Filter, 
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
  AlertTriangle
} from 'lucide-react'
import { apiClient } from '../../services/api'

interface Admin {
  _id: string
  email: string
  firstName: string
  lastName: string
  role: string
  level: number
  team: string
  permissions: string[]
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
  twoFactorEnabled: boolean
}

interface AdminInvite {
  _id: string
  email: string
  firstName: string
  lastName: string
  role: string
  level: number
  team: string
  permissions: string[]
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'accepted'
  invitedBy: {
    firstName: string
    lastName: string
    email: string
  }
  expiresAt: string
  createdAt: string
  approvedBy?: {
    firstName: string
    lastName: string
    email: string
  }
  approvedAt?: string
  rejectedBy?: {
    firstName: string
    lastName: string
    email: string
  }
  rejectedAt?: string
  rejectionReason?: string
  acceptedAt?: string
}

interface InviteFormData {
  email: string
  firstName: string
  lastName: string
  role: string
  level: number
  team: string
  permissions: string[]
  expirationHours: number
  customMessage: string
}

const ROLES = [
  'superadmin', 'admin', 'support', 'billing', 'moderator', 
  'product', 'marketing', 'developer', 'sales', 'legal', 'aiops'
]

const TEAMS = [
  'executive', 'support', 'billing', 'product', 'marketing', 
  'development', 'sales', 'legal', 'aiops'
]

// Import comprehensive permissions from the backend
const PERMISSIONS = [
  // Authentication & Security
  'auth.login', 'auth.logout', 'auth.2fa.enable', 'auth.2fa.disable',
  'auth.password.change', 'auth.password.reset', 'auth.sessions.view', 'auth.sessions.terminate',
  
  // User Management
  'users.read', 'users.read.detailed', 'users.create', 'users.edit', 'users.delete',
  'users.ban', 'users.verify', 'users.impersonate', 'users.export', 'users.bulk.operations',
  'users.analytics.view', 'users.analytics.export', 'users.activity.view', 'users.sessions.view',
  
  // Admin Management
  'admins.read', 'admins.read.detailed', 'admins.create', 'admins.edit', 'admins.delete',
  'admins.invite', 'admins.invite.approve', 'admins.invite.reject', 'admins.roles.assign',
  'admins.permissions.manage', 'admins.activate',
  
  // Subscription & Billing
  'subscriptions.read', 'subscriptions.read.detailed', 'subscriptions.create', 'subscriptions.edit',
  'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade', 'subscriptions.pause',
  'subscriptions.resume', 'subscriptions.export',
  'billing.invoices.view', 'billing.invoices.create', 'billing.payments.view', 'billing.payments.process',
  'billing.payments.refund', 'billing.credits.manage', 'billing.credits.add', 'billing.credits.deduct',
  'plans.read', 'plans.create', 'plans.edit', 'plans.delete', 'plans.pricing.manage', 'plans.features.manage',
  
  // Refund Management
  'refunds.read', 'refunds.read.detailed', 'refunds.approve', 'refunds.reject', 'refunds.process',
  'refunds.manual.create', 'refunds.export', 'refunds.analytics.view',
  
  // Support & Communication
  'tickets.read', 'tickets.read.assigned', 'tickets.create', 'tickets.edit', 'tickets.assign',
  'tickets.resolve', 'tickets.close', 'tickets.escalate', 'tickets.export',
  'chat.view', 'chat.respond', 'chat.transfer', 'chat.end',
  'notifications.read', 'notifications.create', 'notifications.send', 'notifications.schedule',
  'notifications.templates.manage',
  
  // Content & Social Media
  'content.read', 'content.moderate', 'content.flag', 'content.remove', 'content.analytics.view',
  'social.accounts.view', 'social.accounts.manage', 'social.posts.view', 'social.posts.manage',
  'social.analytics.view',
  
  // AI Content Features
  'ai.content.generate', 'ai.content.moderate', 'ai.models.manage', 'ai.usage.view',
  
  // Analytics & Reporting
  'analytics.dashboard.view', 'analytics.users.view', 'analytics.revenue.view', 'analytics.usage.view',
  'analytics.custom.create', 'analytics.export',
  'reports.generate', 'reports.schedule', 'reports.templates.manage', 'reports.export',
  
  // Coupon & Discount Management
  'coupons.read', 'coupons.create', 'coupons.edit', 'coupons.delete', 'coupons.activate',
  'coupons.analytics.view', 'discounts.manual.apply', 'discounts.bulk.manage', 'discounts.campaigns.manage',
  
  // System Administration
  'system.settings.view', 'system.settings.edit', 'system.configuration', 'system.maintenance',
  'system.backups.manage',
  'security.audit.view', 'security.audit.export', 'security.ip.whitelist', 'security.rate.limits',
  'security.encryption', 'database.read', 'database.backup', 'database.restore', 'database.migrate',
  
  // Webhook & Integration
  'webhooks.read', 'webhooks.create', 'webhooks.edit', 'webhooks.delete', 'webhooks.test',
  'webhooks.logs.view', 'api.keys.manage', 'api.usage.view', 'api.rate.limits',
  
  // Legal & Compliance
  'compliance.gdpr.view', 'compliance.gdpr.export', 'compliance.gdpr.delete', 'compliance.audit.view',
  'legal.documents.view', 'legal.documents.manage', 'legal.requests.view', 'legal.requests.process',
  
  // AI & Machine Learning
  'ai.models.view', 'ai.models.manage', 'ai.training.view', 'ai.training.manage',
  'ai.moderate.content', 'ml.datasets.view', 'ml.datasets.manage', 'ml.predictions.view', 'ml.analytics.view',
  
  // Team Management
  'teams.read', 'teams.create', 'teams.edit', 'teams.delete', 'teams.members.add',
  'teams.members.remove', 'teams.hierarchy.view'
]

// Role-based permission constraints
const ROLE_CONSTRAINTS = {
  superadmin: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view'],
    maxPermissions: PERMISSIONS, // All permissions
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view'],
    restricted: []
  },
  admin: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view'],
    maxPermissions: PERMISSIONS.filter(p => !['system.settings.edit', 'system.maintenance', 'admins.create', 'admins.delete', 'admins.permissions.manage', 'security.audit.export'].includes(p)),
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view'],
    restricted: ['system.settings.edit', 'system.maintenance', 'admins.create', 'admins.delete', 'admins.permissions.manage', 'security.audit.export']
  },
  support: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    maxPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable', 'users.read', 'users.edit', 'users.ban', 'tickets.read', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close', 'subscriptions.read', 'subscriptions.edit', 'content.read', 'content.moderate', 'analytics.dashboard.view', 'analytics.users.view', 'notifications.read', 'notifications.create'],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    restricted: ['users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'subscriptions.create', 'subscriptions.cancel', 'billing.payments.process', 'billing.payments.refund', 'refunds.approve', 'refunds.reject', 'refunds.process', 'analytics.revenue.view', 'analytics.export', 'system.settings.view', 'system.settings.edit', 'system.maintenance', 'security.audit.view', 'security.audit.export', 'coupons.create', 'coupons.edit', 'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete']
  },
  billing: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'subscriptions.read', 'billing.payments.view', 'refunds.read'],
    maxPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable', 'users.read', 'users.edit', 'subscriptions.read', 'subscriptions.read.detailed', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade', 'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage', 'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process', 'analytics.dashboard.view', 'analytics.revenue.view', 'analytics.export', 'coupons.read', 'coupons.create', 'coupons.edit', 'coupons.delete', 'notifications.read', 'notifications.create'],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'subscriptions.read', 'billing.payments.view', 'refunds.read'],
    restricted: ['users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close', 'content.read', 'content.moderate', 'content.remove', 'social.accounts.view', 'social.accounts.manage', 'ai.content.generate', 'ai.content.moderate', 'ai.models.manage', 'system.settings.view', 'system.settings.edit', 'system.maintenance', 'security.audit.view', 'security.audit.export', 'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete']
  },
  moderator: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    maxPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable', 'users.read', 'users.edit', 'users.ban', 'content.read', 'content.moderate', 'content.remove', 'social.accounts.view', 'ai.content.moderate', 'analytics.dashboard.view', 'analytics.users.view', 'notifications.read'],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    restricted: ['users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations', 'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage', 'subscriptions.read', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade', 'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage', 'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close', 'analytics.revenue.view', 'analytics.export', 'system.settings.view', 'system.settings.edit', 'system.maintenance', 'security.audit.view', 'security.audit.export', 'coupons.create', 'coupons.edit', 'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete']
  },
  analytics: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'analytics.dashboard.view', 'reports.generate'],
    maxPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable', 'users.read', 'subscriptions.read', 'analytics.dashboard.view', 'analytics.users.view', 'analytics.revenue.view', 'analytics.export', 'reports.generate', 'reports.schedule', 'reports.templates.manage', 'reports.export', 'notifications.read'],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'analytics.dashboard.view', 'reports.generate'],
    restricted: ['users.edit', 'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations', 'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade', 'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage', 'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close', 'content.read', 'content.moderate', 'content.remove', 'social.accounts.view', 'social.accounts.manage', 'ai.content.generate', 'ai.content.moderate', 'ai.models.manage', 'system.settings.view', 'system.settings.edit', 'system.maintenance', 'security.audit.view', 'security.audit.export', 'coupons.create', 'coupons.edit', 'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete']
  }
}

export const AdminsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedInvite, setSelectedInvite] = useState<AdminInvite | null>(null)
  const [showInviteDetails, setShowInviteDetails] = useState(false)
  const [inviteFormData, setInviteFormData] = useState<InviteFormData>({
    email: '',
    firstName: '',
    lastName: '',
    role: 'admin',
    level: 3,
    team: 'support',
    permissions: [],
    expirationHours: 48,
    customMessage: ''
  })

  const queryClient = useQueryClient()

  // Fetch admins
  const { data: adminsData, isLoading: adminsLoading } = useQuery(
    ['admins', searchTerm],
    async () => {
      const response = await apiClient.get('/admin', {
        params: { search: searchTerm }
      })
      return response.data
    }
  )

  // Fetch invitations
  const { data: invitationsData, isLoading: invitationsLoading } = useQuery(
    ['admin-invitations', statusFilter],
    async () => {
      const response = await apiClient.get('/onboarding/invitations', {
        params: { status: statusFilter === 'all' ? undefined : statusFilter }
      })
      return response.data
    }
  )

  // Send invitation mutation
  const sendInviteMutation = useMutation(
    async (data: InviteFormData) => {
      const response = await apiClient.post('/onboarding/invite', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        setShowInviteModal(false)
        setInviteFormData({
          email: '',
          firstName: '',
          lastName: '',
          role: 'admin',
          level: 3,
          team: 'support',
          permissions: [],
          expirationHours: 48,
          customMessage: ''
        })
      }
    }
  )

  // Approve invitation mutation
  const approveInviteMutation = useMutation(
    async ({ id, approvalMessage }: { id: string; approvalMessage?: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/approve`, {
        approvalMessage
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        setShowInviteDetails(false)
      }
    }
  )

  // Reject invitation mutation
  const rejectInviteMutation = useMutation(
    async ({ id, rejectionReason }: { id: string; rejectionReason: string }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/reject`, {
        rejectionReason
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
        setShowInviteDetails(false)
      }
    }
  )

  // Resend invitation mutation
  const resendInviteMutation = useMutation(
    async ({ id, expirationHours }: { id: string; expirationHours?: number }) => {
      const response = await apiClient.post(`/onboarding/invitations/${id}/resend`, {
        expirationHours
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-invitations'])
      }
    }
  )

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate permissions
    const validation = validatePermissions(inviteFormData.role, inviteFormData.permissions)
    if (!validation.valid) {
      alert(`Permission validation failed:\n${validation.errors.join('\n')}`)
      return
    }
    
    sendInviteMutation.mutate(inviteFormData)
  }

  const handleApproveInvite = () => {
    if (selectedInvite) {
      approveInviteMutation.mutate({ id: selectedInvite._id })
    }
  }

  const handleRejectInvite = () => {
    if (selectedInvite) {
      const reason = prompt('Please provide a reason for rejection:')
      if (reason) {
        rejectInviteMutation.mutate({ id: selectedInvite._id, rejectionReason: reason })
      }
    }
  }

  const handleResendInvite = () => {
    if (selectedInvite) {
      resendInviteMutation.mutate({ id: selectedInvite._id })
    }
  }

  // Permission management functions
  const getAvailablePermissions = (role: string) => {
    const constraints = ROLE_CONSTRAINTS[role as keyof typeof ROLE_CONSTRAINTS]
    if (!constraints) return []
    
    return PERMISSIONS.filter(permission => 
      constraints.maxPermissions.includes(permission) && 
      !constraints.restricted.includes(permission)
    )
  }

  const getAutoGrantedPermissions = (role: string) => {
    const constraints = ROLE_CONSTRAINTS[role as keyof typeof ROLE_CONSTRAINTS]
    return constraints?.autoGranted || []
  }

  const validatePermissions = (role: string, permissions: string[]) => {
    const constraints = ROLE_CONSTRAINTS[role as keyof typeof ROLE_CONSTRAINTS]
    if (!constraints) return { valid: false, errors: ['Invalid role'] }

    const errors: string[] = []

    // Check minimum required permissions
    for (const minPerm of constraints.minPermissions) {
      if (!permissions.includes(minPerm)) {
        errors.push(`Missing required permission: ${minPerm}`)
      }
    }

    // Check restricted permissions
    for (const perm of permissions) {
      if (constraints.restricted.includes(perm)) {
        errors.push(`Permission not allowed for role: ${perm}`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  const handleRoleChange = (newRole: string) => {
    const autoGranted = getAutoGrantedPermissions(newRole)
    setInviteFormData({
      ...inviteFormData,
      role: newRole,
      permissions: autoGranted
    })
  }

  const handlePermissionToggle = (permission: string, checked: boolean) => {
    const constraints = ROLE_CONSTRAINTS[inviteFormData.role as keyof typeof ROLE_CONSTRAINTS]
    if (!constraints) return

    // Check if permission is restricted
    if (constraints.restricted.includes(permission)) {
      return
    }

    // Check if permission is in max allowed
    if (!constraints.maxPermissions.includes(permission)) {
      return
    }

    let newPermissions = [...inviteFormData.permissions]
    
    if (checked) {
      newPermissions.push(permission)
    } else {
      // Check if it's a required permission
      if (constraints.minPermissions.includes(permission)) {
        return
      }
      newPermissions = newPermissions.filter(p => p !== permission)
    }

    setInviteFormData({
      ...inviteFormData,
      permissions: newPermissions
    })
  }

  const getPermissionCategory = (permission: string) => {
    if (permission.startsWith('auth.')) return 'Authentication & Security'
    if (permission.startsWith('users.')) return 'User Management'
    if (permission.startsWith('admins.')) return 'Admin Management'
    if (permission.startsWith('subscriptions.') || permission.startsWith('billing.') || permission.startsWith('plans.')) return 'Subscription & Billing'
    if (permission.startsWith('refunds.')) return 'Refund Management'
    if (permission.startsWith('tickets.') || permission.startsWith('chat.') || permission.startsWith('notifications.')) return 'Support & Communication'
    if (permission.startsWith('content.') || permission.startsWith('social.')) return 'Content & Social Media'
    if (permission.startsWith('ai.') || permission.startsWith('ml.')) return 'AI & Machine Learning'
    if (permission.startsWith('analytics.') || permission.startsWith('reports.')) return 'Analytics & Reporting'
    if (permission.startsWith('coupons.') || permission.startsWith('discounts.')) return 'Coupon & Discount Management'
    if (permission.startsWith('system.') || permission.startsWith('security.') || permission.startsWith('database.')) return 'System Administration'
    if (permission.startsWith('webhooks.') || permission.startsWith('api.')) return 'Webhook & Integration'
    if (permission.startsWith('compliance.') || permission.startsWith('legal.')) return 'Legal & Compliance'
    if (permission.startsWith('teams.')) return 'Team Management'
    return 'Other'
  }

  const getPermissionRiskLevel = (permission: string) => {
    const criticalPermissions = ['users.delete', 'admins.create', 'admins.delete', 'system.settings.edit', 'system.maintenance', 'security.audit.export']
    const highPermissions = ['users.impersonate', 'users.export', 'billing.payments.refund', 'refunds.approve', 'refunds.reject', 'analytics.revenue.view', 'coupons.delete', 'teams.create', 'teams.edit']
    const mediumPermissions = ['users.edit', 'users.ban', 'subscriptions.edit', 'tickets.assign', 'content.moderate', 'notifications.send']
    
    if (criticalPermissions.includes(permission)) return 'critical'
    if (highPermissions.includes(permission)) return 'high'
    if (mediumPermissions.includes(permission)) return 'medium'
    return 'low'
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      approved: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
      accepted: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
      expired: { color: 'bg-gray-100 text-gray-800', icon: AlertTriangle }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'superadmin': return <Crown className="h-4 w-4" />
      case 'admin': return <Shield className="h-4 w-4" />
      default: return <UserCheck className="h-4 w-4" />
    }
  }

  const admins = adminsData?.data?.admins || []
  const invitations = invitationsData?.data?.invitations || []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-600">Manage admin accounts and invitations</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Invite Admin
        </Button>
      </div>

      {/* Stats Cards */}
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

      {/* Filters and search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search admins or invitations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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

      {/* Admins Table */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Accounts</CardTitle>
          <CardDescription>Current admin team members</CardDescription>
        </CardHeader>
        <CardContent>
          {adminsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
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
                          {getRoleIcon(admin.role)}
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
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

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>Manage admin invitations and approvals</CardDescription>
        </CardHeader>
        <CardContent>
          {invitationsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invitee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invited By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
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
                          {getRoleIcon(invite.role)}
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
                        {getStatusBadge(invite.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvite(invite)
                            setShowInviteDetails(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {invite.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedInvite(invite)
                                handleApproveInvite()
                              }}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedInvite(invite)
                                handleRejectInvite()
                              }}
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
                            onClick={() => {
                              setSelectedInvite(invite)
                              handleResendInvite()
                            }}
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

      {/* Invite Admin Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite New Admin"
        size="lg"
      >
        <form onSubmit={handleSendInvite} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <Input
                value={inviteFormData.firstName}
                onChange={(e) => setInviteFormData({ ...inviteFormData, firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <Input
                value={inviteFormData.lastName}
                onChange={(e) => setInviteFormData({ ...inviteFormData, lastName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={inviteFormData.email}
                onChange={(e) => setInviteFormData({ ...inviteFormData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={inviteFormData.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {ROLES.map(role => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team
              </label>
              <select
                value={inviteFormData.team}
                onChange={(e) => setInviteFormData({ ...inviteFormData, team: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {TEAMS.map(team => (
                  <option key={team} value={team}>{team.charAt(0).toUpperCase() + team.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level
              </label>
              <select
                value={inviteFormData.level}
                onChange={(e) => setInviteFormData({ ...inviteFormData, level: parseInt(e.target.value) })}
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
                value={inviteFormData.expirationHours}
                onChange={(e) => setInviteFormData({ ...inviteFormData, expirationHours: parseInt(e.target.value) })}
                min="1"
                max="168"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permissions
            </label>
            <div className="text-xs text-gray-500 mb-2">
              Auto-granted permissions are pre-selected based on the role. Required permissions cannot be removed.
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-md p-4">
              {(() => {
                const availablePermissions = getAvailablePermissions(inviteFormData.role)
                const constraints = ROLE_CONSTRAINTS[inviteFormData.role as keyof typeof ROLE_CONSTRAINTS]
                const groupedPermissions = availablePermissions.reduce((acc, permission) => {
                  const category = getPermissionCategory(permission)
                  if (!acc[category]) acc[category] = []
                  acc[category].push(permission)
                  return acc
                }, {} as Record<string, string[]>)

                return Object.entries(groupedPermissions).map(([category, permissions]) => (
                  <div key={category} className="mb-4">
                    <h4 className="font-medium text-sm text-gray-800 mb-2 border-b border-gray-200 pb-1">
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 gap-1">
                      {permissions.map(permission => {
                        const isRequired = constraints?.minPermissions.includes(permission)
                        const isRestricted = constraints?.restricted.includes(permission)
                        const riskLevel = getPermissionRiskLevel(permission)
                        const isChecked = inviteFormData.permissions.includes(permission)
                        const isDisabled = isRequired || isRestricted

                        return (
                          <label key={permission} className={`flex items-center p-2 rounded ${isDisabled ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={(e) => handlePermissionToggle(permission, e.target.checked)}
                              className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                            <div className="ml-2 flex-1">
                              <div className="flex items-center space-x-2">
                                <span className={`text-sm ${isRequired ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                                  {permission}
                                </span>
                                {isRequired && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                    Required
                                  </span>
                                )}
                                {riskLevel === 'critical' && (
                                  <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                    Critical
                                  </span>
                                )}
                                {riskLevel === 'high' && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                                    High Risk
                                  </span>
                                )}
                                {riskLevel === 'medium' && (
                                  <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                                    Medium Risk
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Selected: {inviteFormData.permissions.length} permissions
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Message (Optional)
            </label>
            <textarea
              value={inviteFormData.customMessage}
              onChange={(e) => setInviteFormData({ ...inviteFormData, customMessage: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add a personal message to the invitation..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)}>
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

      {/* Invite Details Modal */}
      <Modal
        isOpen={showInviteDetails}
        onClose={() => setShowInviteDetails(false)}
        title="Invitation Details"
        size="lg"
      >
        {selectedInvite && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <p className="text-sm text-gray-900">{selectedInvite.firstName} {selectedInvite.lastName}</p>
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
                <div className="mt-1">{getStatusBadge(selectedInvite.status)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Invited By</label>
                <p className="text-sm text-gray-900">
                  {selectedInvite.invitedBy.firstName} {selectedInvite.invitedBy.lastName}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expires</label>
                <p className="text-sm text-gray-900">{new Date(selectedInvite.expiresAt).toLocaleString()}</p>
              </div>
            </div>

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

            {selectedInvite.rejectionReason && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Rejection Reason</label>
                <p className="text-sm text-gray-900">{selectedInvite.rejectionReason}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowInviteDetails(false)}>
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
    </div>
  )
}
