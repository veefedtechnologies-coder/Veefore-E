/**
 * Shared TypeScript interfaces and constants for the admin management feature.
 * Used by AdminList, AdminPermissions, and AdminInvite components.
 */

/** Represents an active admin user in the system. */
export interface Admin {
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

/** Represents an admin invitation with its full lifecycle metadata. */
export interface AdminInvite {
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

/** Form data shape for sending a new admin invitation. */
export interface InviteFormData {
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

/** Available admin roles in the system. */
export const ROLES = [
  'superadmin', 'admin', 'support', 'billing', 'moderator',
  'product', 'marketing', 'developer', 'sales', 'legal', 'aiops',
] as const

/** Available teams in the system. */
export const TEAMS = [
  'executive', 'support', 'billing', 'product', 'marketing',
  'development', 'sales', 'legal', 'aiops',
] as const

/** Comprehensive list of all available permissions in the system. */
export const PERMISSIONS = [
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
  'teams.members.remove', 'teams.hierarchy.view',
]

/**
 * Per-role permission constraints.
 * Defines which permissions are auto-granted, required, and restricted for each role.
 */
export const ROLE_CONSTRAINTS: Record<
  string,
  {
    minPermissions: string[]
    maxPermissions: string[]
    autoGranted: string[]
    restricted: string[]
  }
> = {
  superadmin: {
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'users.read',
      'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    maxPermissions: PERMISSIONS,
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change', 'users.read',
      'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    restricted: [],
  },
  admin: {
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'users.read',
      'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    maxPermissions: PERMISSIONS.filter(
      p => !['system.settings.edit', 'system.maintenance', 'admins.create', 'admins.delete', 'admins.permissions.manage', 'security.audit.export'].includes(p),
    ),
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change', 'users.read',
      'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    restricted: [
      'system.settings.edit', 'system.maintenance', 'admins.create',
      'admins.delete', 'admins.permissions.manage', 'security.audit.export',
    ],
  },
  support: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban', 'tickets.read', 'tickets.create',
      'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'subscriptions.read', 'subscriptions.edit', 'content.read', 'content.moderate',
      'analytics.dashboard.view', 'analytics.users.view', 'notifications.read', 'notifications.create',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign',
      'subscriptions.create', 'subscriptions.cancel', 'billing.payments.process',
      'billing.payments.refund', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.revenue.view', 'analytics.export', 'system.settings.view', 'system.settings.edit',
      'system.maintenance', 'security.audit.view', 'security.audit.export', 'coupons.create',
      'coupons.edit', 'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add',
      'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete',
    ],
  },
  billing: {
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'subscriptions.read', 'billing.payments.view', 'refunds.read',
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'subscriptions.read', 'subscriptions.read.detailed',
      'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade',
      'subscriptions.downgrade', 'billing.invoices.view', 'billing.payments.view',
      'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage',
      'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.dashboard.view', 'analytics.revenue.view', 'analytics.export',
      'coupons.read', 'coupons.create', 'coupons.edit', 'coupons.delete',
      'notifications.read', 'notifications.create',
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'subscriptions.read', 'billing.payments.view', 'refunds.read',
    ],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage',
      'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'content.read', 'content.moderate', 'content.remove', 'social.accounts.view',
      'social.accounts.manage', 'ai.content.generate', 'ai.content.moderate', 'ai.models.manage',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export', 'teams.create', 'teams.edit',
      'teams.members.add', 'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete',
    ],
  },
  moderator: {
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban', 'content.read', 'content.moderate',
      'content.remove', 'social.accounts.view', 'ai.content.moderate',
      'analytics.dashboard.view', 'analytics.users.view', 'notifications.read',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign',
      'admins.permissions.manage', 'subscriptions.read', 'subscriptions.create', 'subscriptions.edit',
      'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade',
      'billing.invoices.view', 'billing.payments.view', 'billing.payments.process',
      'billing.payments.refund', 'billing.credits.manage', 'refunds.read', 'refunds.approve',
      'refunds.reject', 'refunds.process', 'tickets.create', 'tickets.edit', 'tickets.assign',
      'tickets.resolve', 'tickets.close', 'analytics.revenue.view', 'analytics.export',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export', 'coupons.create', 'coupons.edit',
      'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add',
      'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete',
    ],
  },
  analytics: {
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'analytics.dashboard.view', 'reports.generate',
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'subscriptions.read', 'analytics.dashboard.view', 'analytics.users.view',
      'analytics.revenue.view', 'analytics.export', 'reports.generate', 'reports.schedule',
      'reports.templates.manage', 'reports.export', 'notifications.read',
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'analytics.dashboard.view', 'reports.generate',
    ],
    restricted: [
      'users.edit', 'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign',
      'admins.permissions.manage', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel',
      'subscriptions.upgrade', 'subscriptions.downgrade', 'billing.invoices.view',
      'billing.payments.view', 'billing.payments.process', 'billing.payments.refund',
      'billing.credits.manage', 'refunds.read', 'refunds.approve', 'refunds.reject',
      'refunds.process', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve',
      'tickets.close', 'content.read', 'content.moderate', 'content.remove',
      'social.accounts.view', 'social.accounts.manage', 'ai.content.generate',
      'ai.content.moderate', 'ai.models.manage', 'system.settings.view', 'system.settings.edit',
      'system.maintenance', 'security.audit.view', 'security.audit.export', 'coupons.create',
      'coupons.edit', 'coupons.delete', 'teams.create', 'teams.edit', 'teams.members.add',
      'teams.members.remove', 'webhooks.create', 'webhooks.edit', 'webhooks.delete',
    ],
  },
}
