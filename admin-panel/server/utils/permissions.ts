// VeeFore Admin Panel - Comprehensive Permission System
// Enterprise-level permissions with role-based constraints

export interface Permission {
  id: string
  name: string
  description: string
  category: string
  level: number // 1-5, where 1 is highest (Super Admin)
  dependencies?: string[] // Required permissions
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  autoGranted?: boolean // Auto-granted based on role
}

export interface RolePermissionConstraints {
  role: string
  level: number
  minPermissions: string[] // Required minimum permissions
  maxPermissions: string[] // Maximum allowed permissions
  autoGranted: string[] // Automatically granted permissions
  restricted: string[] // Never allowed permissions
}

// Comprehensive permission definitions
export const PERMISSIONS: Permission[] = [
  // Core System Permissions
  {
    id: 'auth.login',
    name: 'Login Access',
    description: 'Allow admin to log in to the system',
    category: 'Authentication',
    level: 5,
    riskLevel: 'low',
    autoGranted: true
  },
  {
    id: 'auth.logout',
    name: 'Logout Access',
    description: 'Allow admin to log out',
    category: 'Authentication',
    level: 5,
    riskLevel: 'low',
    autoGranted: true
  },
  {
    id: 'auth.2fa.enable',
    name: 'Enable 2FA',
    description: 'Enable two-factor authentication',
    category: 'Authentication',
    level: 4,
    riskLevel: 'medium'
  },
  {
    id: 'auth.2fa.disable',
    name: 'Disable 2FA',
    description: 'Disable two-factor authentication',
    category: 'Authentication',
    level: 3,
    riskLevel: 'high'
  },
  {
    id: 'auth.password.change',
    name: 'Change Password',
    description: 'Change own password',
    category: 'Authentication',
    level: 5,
    riskLevel: 'low',
    autoGranted: true
  },
  {
    id: 'auth.password.reset',
    name: 'Reset Passwords',
    description: 'Reset other admins\' passwords',
    category: 'Authentication',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'auth.sessions.view',
    name: 'View Sessions',
    description: 'View active admin sessions',
    category: 'Authentication',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'auth.sessions.terminate',
    name: 'Terminate Sessions',
    description: 'Terminate admin sessions',
    category: 'Authentication',
    level: 2,
    riskLevel: 'high'
  },

  // User Management Permissions
  {
    id: 'users.read',
    name: 'View Users',
    description: 'View user list and basic information',
    category: 'User Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'users.read.detailed',
    name: 'View Detailed User Data',
    description: 'View detailed user profiles including sensitive data',
    category: 'User Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['users.read']
  },
  {
    id: 'users.create',
    name: 'Create Users',
    description: 'Create new user accounts',
    category: 'User Management',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'users.edit',
    name: 'Edit Users',
    description: 'Edit user information',
    category: 'User Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['users.read']
  },
  {
    id: 'users.delete',
    name: 'Delete Users',
    description: 'Delete user accounts',
    category: 'User Management',
    level: 2,
    riskLevel: 'critical'
  },
  {
    id: 'users.ban',
    name: 'Ban/Unban Users',
    description: 'Ban or unban user accounts',
    category: 'User Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['users.read']
  },
  {
    id: 'users.impersonate',
    name: 'Impersonate Users',
    description: 'Impersonate users for support purposes',
    category: 'User Management',
    level: 2,
    riskLevel: 'critical',
    dependencies: ['users.read']
  },
  {
    id: 'users.export',
    name: 'Export User Data',
    description: 'Export user data',
    category: 'User Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['users.read']
  },
  {
    id: 'users.bulk.operations',
    name: 'Bulk User Operations',
    description: 'Perform bulk operations on users',
    category: 'User Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['users.read']
  },

  // Admin Management Permissions
  {
    id: 'admins.read',
    name: 'View Admins',
    description: 'View admin list',
    category: 'Admin Management',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'admins.read.detailed',
    name: 'View Detailed Admin Data',
    description: 'View detailed admin profiles',
    category: 'Admin Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['admins.read']
  },
  {
    id: 'admins.create',
    name: 'Create Admins',
    description: 'Create new admin accounts',
    category: 'Admin Management',
    level: 1,
    riskLevel: 'critical'
  },
  {
    id: 'admins.edit',
    name: 'Edit Admins',
    description: 'Edit admin information',
    category: 'Admin Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['admins.read']
  },
  {
    id: 'admins.delete',
    name: 'Delete Admins',
    description: 'Delete admin accounts',
    category: 'Admin Management',
    level: 1,
    riskLevel: 'critical'
  },
  {
    id: 'admins.invite',
    name: 'Send Admin Invitations',
    description: 'Send admin invitations',
    category: 'Admin Management',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'admins.invite.approve',
    name: 'Approve Admin Invitations',
    description: 'Approve admin invitations',
    category: 'Admin Management',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'admins.invite.reject',
    name: 'Reject Admin Invitations',
    description: 'Reject admin invitations',
    category: 'Admin Management',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'admins.roles.assign',
    name: 'Assign Admin Roles',
    description: 'Assign roles to admins',
    category: 'Admin Management',
    level: 1,
    riskLevel: 'critical',
    dependencies: ['admins.read']
  },
  {
    id: 'admins.permissions.manage',
    name: 'Manage Admin Permissions',
    description: 'Manage admin permissions',
    category: 'Admin Management',
    level: 1,
    riskLevel: 'critical'
  },

  // Subscription & Billing Permissions
  {
    id: 'subscriptions.read',
    name: 'View Subscriptions',
    description: 'View subscription information',
    category: 'Subscription Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'subscriptions.read.detailed',
    name: 'View Detailed Subscriptions',
    description: 'View detailed subscription data',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['subscriptions.read']
  },
  {
    id: 'subscriptions.create',
    name: 'Create Subscriptions',
    description: 'Create new subscriptions',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'high'
  },
  {
    id: 'subscriptions.edit',
    name: 'Edit Subscriptions',
    description: 'Modify existing subscriptions',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['subscriptions.read']
  },
  {
    id: 'subscriptions.cancel',
    name: 'Cancel Subscriptions',
    description: 'Cancel subscriptions',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['subscriptions.read']
  },
  {
    id: 'subscriptions.upgrade',
    name: 'Upgrade Subscriptions',
    description: 'Upgrade user plans',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['subscriptions.read']
  },
  {
    id: 'subscriptions.downgrade',
    name: 'Downgrade Subscriptions',
    description: 'Downgrade user plans',
    category: 'Subscription Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['subscriptions.read']
  },

  // Billing Operations
  {
    id: 'billing.invoices.view',
    name: 'View Invoices',
    description: 'View invoices',
    category: 'Billing',
    level: 4,
    riskLevel: 'medium'
  },
  {
    id: 'billing.payments.view',
    name: 'View Payments',
    description: 'View payment information',
    category: 'Billing',
    level: 4,
    riskLevel: 'medium'
  },
  {
    id: 'billing.payments.process',
    name: 'Process Payments',
    description: 'Process payments',
    category: 'Billing',
    level: 3,
    riskLevel: 'high'
  },
  {
    id: 'billing.payments.refund',
    name: 'Process Refunds',
    description: 'Process refunds',
    category: 'Billing',
    level: 3,
    riskLevel: 'high'
  },
  {
    id: 'billing.credits.manage',
    name: 'Manage Credits',
    description: 'Manage user credits',
    category: 'Billing',
    level: 3,
    riskLevel: 'high'
  },

  // Refund Management
  {
    id: 'refunds.read',
    name: 'View Refunds',
    description: 'View refund requests',
    category: 'Refund Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'refunds.approve',
    name: 'Approve Refunds',
    description: 'Approve refund requests',
    category: 'Refund Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['refunds.read']
  },
  {
    id: 'refunds.reject',
    name: 'Reject Refunds',
    description: 'Reject refund requests',
    category: 'Refund Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['refunds.read']
  },
  {
    id: 'refunds.process',
    name: 'Process Refunds',
    description: 'Process approved refunds',
    category: 'Refund Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['refunds.read']
  },

  // Support & Communication
  {
    id: 'tickets.read',
    name: 'View Support Tickets',
    description: 'View support tickets',
    category: 'Support',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'tickets.create',
    name: 'Create Support Tickets',
    description: 'Create support tickets',
    category: 'Support',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'tickets.edit',
    name: 'Edit Support Tickets',
    description: 'Edit ticket information',
    category: 'Support',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['tickets.read']
  },
  {
    id: 'tickets.assign',
    name: 'Assign Support Tickets',
    description: 'Assign tickets to team members',
    category: 'Support',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['tickets.read']
  },
  {
    id: 'tickets.resolve',
    name: 'Resolve Support Tickets',
    description: 'Resolve support tickets',
    category: 'Support',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['tickets.read']
  },
  {
    id: 'tickets.close',
    name: 'Close Support Tickets',
    description: 'Close support tickets',
    category: 'Support',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['tickets.read']
  },

  // Analytics & Reporting
  {
    id: 'analytics.dashboard.view',
    name: 'View Analytics Dashboard',
    description: 'View main analytics dashboard',
    category: 'Analytics',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'analytics.users.view',
    name: 'View User Analytics',
    description: 'View user analytics',
    category: 'Analytics',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'analytics.revenue.view',
    name: 'View Revenue Analytics',
    description: 'View revenue analytics',
    category: 'Analytics',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'analytics.export',
    name: 'Export Analytics Data',
    description: 'Export analytics data',
    category: 'Analytics',
    level: 3,
    riskLevel: 'high',
    dependencies: ['analytics.dashboard.view']
  },

  // Content & Social Media
  {
    id: 'content.read',
    name: 'View Content',
    description: 'View user content',
    category: 'Content Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'content.moderate',
    name: 'Moderate Content',
    description: 'Moderate user content',
    category: 'Content Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['content.read']
  },
  {
    id: 'content.remove',
    name: 'Remove Content',
    description: 'Remove user content',
    category: 'Content Management',
    level: 3,
    riskLevel: 'high',
    dependencies: ['content.read']
  },
  {
    id: 'social.accounts.view',
    name: 'View Social Accounts',
    description: 'View connected social accounts',
    category: 'Social Media',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'social.accounts.manage',
    name: 'Manage Social Accounts',
    description: 'Manage social account connections',
    category: 'Social Media',
    level: 3,
    riskLevel: 'medium'
  },

  // AI & Machine Learning
  {
    id: 'ai.content.generate',
    name: 'AI Content Generation',
    description: 'Access AI content generation',
    category: 'AI & ML',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'ai.content.moderate',
    name: 'Moderate AI Content',
    description: 'Moderate AI-generated content',
    category: 'AI & ML',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'ai.models.manage',
    name: 'Manage AI Models',
    description: 'Manage AI model settings',
    category: 'AI & ML',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'ai.usage.view',
    name: 'View AI Usage',
    description: 'View AI usage statistics',
    category: 'AI & ML',
    level: 3,
    riskLevel: 'medium'
  },

  // System Administration
  {
    id: 'system.settings.view',
    name: 'View System Settings',
    description: 'View system settings',
    category: 'System Administration',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'system.settings.edit',
    name: 'Edit System Settings',
    description: 'Edit system settings',
    category: 'System Administration',
    level: 1,
    riskLevel: 'critical'
  },
  {
    id: 'system.maintenance',
    name: 'Maintenance Mode',
    description: 'Access maintenance mode',
    category: 'System Administration',
    level: 1,
    riskLevel: 'critical'
  },
  {
    id: 'security.audit.view',
    name: 'View Audit Logs',
    description: 'View audit logs',
    category: 'Security',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'security.audit.export',
    name: 'Export Audit Logs',
    description: 'Export audit logs',
    category: 'Security',
    level: 2,
    riskLevel: 'high',
    dependencies: ['security.audit.view']
  },

  // Coupon & Discount Management
  {
    id: 'coupons.read',
    name: 'View Coupons',
    description: 'View coupons',
    category: 'Coupon Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'coupons.create',
    name: 'Create Coupons',
    description: 'Create new coupons',
    category: 'Coupon Management',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'coupons.edit',
    name: 'Edit Coupons',
    description: 'Edit existing coupons',
    category: 'Coupon Management',
    level: 3,
    riskLevel: 'medium',
    dependencies: ['coupons.read']
  },
  {
    id: 'coupons.delete',
    name: 'Delete Coupons',
    description: 'Delete coupons',
    category: 'Coupon Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['coupons.read']
  },

  // Team Management
  {
    id: 'teams.read',
    name: 'View Teams',
    description: 'View team structure',
    category: 'Team Management',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'teams.create',
    name: 'Create Teams',
    description: 'Create new teams',
    category: 'Team Management',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'teams.edit',
    name: 'Edit Teams',
    description: 'Edit team information',
    category: 'Team Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['teams.read']
  },
  {
    id: 'teams.members.add',
    name: 'Add Team Members',
    description: 'Add members to teams',
    category: 'Team Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['teams.read']
  },
  {
    id: 'teams.members.remove',
    name: 'Remove Team Members',
    description: 'Remove members from teams',
    category: 'Team Management',
    level: 2,
    riskLevel: 'high',
    dependencies: ['teams.read']
  },

  // Notifications
  {
    id: 'notifications.read',
    name: 'View Notifications',
    description: 'View notifications',
    category: 'Notifications',
    level: 4,
    riskLevel: 'low'
  },
  {
    id: 'notifications.create',
    name: 'Create Notifications',
    description: 'Create notifications',
    category: 'Notifications',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'notifications.send',
    name: 'Send Notifications',
    description: 'Send notifications to users',
    category: 'Notifications',
    level: 3,
    riskLevel: 'high'
  },

  // Webhooks & Integrations
  {
    id: 'webhooks.read',
    name: 'View Webhooks',
    description: 'View webhooks',
    category: 'Webhooks',
    level: 3,
    riskLevel: 'medium'
  },
  {
    id: 'webhooks.create',
    name: 'Create Webhooks',
    description: 'Create new webhooks',
    category: 'Webhooks',
    level: 2,
    riskLevel: 'high'
  },
  {
    id: 'webhooks.edit',
    name: 'Edit Webhooks',
    description: 'Edit webhooks',
    category: 'Webhooks',
    level: 2,
    riskLevel: 'high',
    dependencies: ['webhooks.read']
  },
  {
    id: 'webhooks.delete',
    name: 'Delete Webhooks',
    description: 'Delete webhooks',
    category: 'Webhooks',
    level: 2,
    riskLevel: 'high',
    dependencies: ['webhooks.read']
  }
]

// Role-based permission constraints
export const ROLE_PERMISSION_CONSTRAINTS: RolePermissionConstraints[] = [
  {
    role: 'superadmin',
    level: 1,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read',
      'analytics.dashboard.view', 'admins.read', 'admins.read.detailed'
    ],
    maxPermissions: PERMISSIONS.map(p => p.id), // All permissions
    autoGranted: [
      ...PERMISSIONS.filter(p => p.autoGranted).map(p => p.id),
      'admins.read', 'admins.read.detailed', 'admins.create', 'admins.update', 'admins.delete',
      'admins.permissions.manage', 'admins.credentials.view', 'admins.credentials.reset'
    ],
    restricted: [] // No restrictions for superadmin
  },
  {
    role: 'admin',
    level: 2,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read',
      'analytics.dashboard.view'
    ],
    maxPermissions: PERMISSIONS.filter(p => p.level >= 2).map(p => p.id),
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read',
      'analytics.dashboard.view'
    ],
    restricted: [
      'system.settings.edit', 'system.maintenance',
      'admins.create', 'admins.delete', 'admins.permissions.manage',
      'security.audit.export'
    ]
  },
  {
    role: 'support',
    level: 3,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'tickets.read', 'tickets.respond', 'users.read'
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban',
      'tickets.read', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'subscriptions.read', 'subscriptions.edit',
      'content.read', 'content.moderate',
      'analytics.dashboard.view', 'analytics.users.view',
      'notifications.read', 'notifications.create'
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'tickets.read', 'users.read'
    ],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign',
      'subscriptions.create', 'subscriptions.cancel',
      'billing.payments.process', 'billing.payments.refund',
      'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.revenue.view', 'analytics.export',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
      'coupons.create', 'coupons.edit', 'coupons.delete',
      'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove',
      'webhooks.create', 'webhooks.edit', 'webhooks.delete'
    ]
  },
  {
    role: 'billing',
    level: 3,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'subscriptions.read', 'billing.payments.view', 'refunds.read'
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit',
      'subscriptions.read', 'subscriptions.read.detailed', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade',
      'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage',
      'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.dashboard.view', 'analytics.revenue.view', 'analytics.export',
      'coupons.read', 'coupons.create', 'coupons.edit', 'coupons.delete',
      'notifications.read', 'notifications.create'
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'subscriptions.read', 'billing.payments.view', 'refunds.read'
    ],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage',
      'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'content.read', 'content.moderate', 'content.remove',
      'social.accounts.view', 'social.accounts.manage',
      'ai.content.generate', 'ai.content.moderate', 'ai.models.manage',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
      'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove',
      'webhooks.create', 'webhooks.edit', 'webhooks.delete'
    ]
  },
  {
    role: 'moderator',
    level: 4,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'content.moderate', 'users.read'
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban',
      'content.read', 'content.moderate', 'content.remove',
      'social.accounts.view',
      'ai.content.moderate',
      'analytics.dashboard.view', 'analytics.users.view',
      'notifications.read'
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'content.moderate', 'users.read'
    ],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage',
      'subscriptions.read', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade',
      'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage',
      'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'analytics.revenue.view', 'analytics.export',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
      'coupons.create', 'coupons.edit', 'coupons.delete',
      'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove',
      'webhooks.create', 'webhooks.edit', 'webhooks.delete'
    ]
  },
  {
    role: 'analytics',
    level: 4,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'analytics.dashboard.view', 'reports.generate'
    ],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read',
      'subscriptions.read',
      'analytics.dashboard.view', 'analytics.users.view', 'analytics.revenue.view', 'analytics.export',
      'reports.generate', 'reports.schedule', 'reports.templates.manage', 'reports.export',
      'notifications.read'
    ],
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'analytics.dashboard.view', 'reports.generate'
    ],
    restricted: [
      'users.edit', 'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage',
      'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade',
      'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage',
      'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'content.read', 'content.moderate', 'content.remove',
      'social.accounts.view', 'social.accounts.manage',
      'ai.content.generate', 'ai.content.moderate', 'ai.models.manage',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
      'coupons.create', 'coupons.edit', 'coupons.delete',
      'teams.create', 'teams.edit', 'teams.members.add', 'teams.members.remove',
      'webhooks.create', 'webhooks.edit', 'webhooks.delete'
    ]
  }
]

// Utility functions
export const getPermissionById = (id: string): Permission | undefined => {
  return PERMISSIONS.find(p => p.id === id)
}

export const getPermissionsByCategory = (category: string): Permission[] => {
  return PERMISSIONS.filter(p => p.category === category)
}

export const getPermissionsByLevel = (level: number): Permission[] => {
  return PERMISSIONS.filter(p => p.level === level)
}

export const getRoleConstraints = (role: string): RolePermissionConstraints | undefined => {
  return ROLE_PERMISSION_CONSTRAINTS.find(r => r.role === role)
}

export const validatePermissionAssignment = (
  role: string,
  permissions: string[]
): { valid: boolean; errors: string[] } => {
  const constraints = getRoleConstraints(role)
  if (!constraints) {
    return { valid: false, errors: ['Invalid role'] }
  }

  const errors: string[] = []

  // Check minimum required permissions
  for (const minPerm of constraints.minPermissions) {
    if (!permissions.includes(minPerm)) {
      errors.push(`Missing required permission: ${minPerm}`)
    }
  }

  // Check maximum allowed permissions
  for (const perm of permissions) {
    if (!constraints.maxPermissions.includes(perm)) {
      errors.push(`Permission not allowed for role: ${perm}`)
    }
  }

  // Check restricted permissions
  for (const perm of permissions) {
    if (constraints.restricted.includes(perm)) {
      errors.push(`Permission restricted for role: ${perm}`)
    }
  }

  // Check permission dependencies
  for (const perm of permissions) {
    const permission = getPermissionById(perm)
    if (permission?.dependencies) {
      for (const dep of permission.dependencies) {
        if (!permissions.includes(dep)) {
          errors.push(`Permission ${perm} requires ${dep}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export const getAutoGrantedPermissions = (role: string): string[] => {
  const constraints = getRoleConstraints(role)
  return constraints?.autoGranted || []
}

export const getAvailablePermissions = (role: string): Permission[] => {
  const constraints = getRoleConstraints(role)
  if (!constraints) return []

  return PERMISSIONS.filter(p => 
    constraints.maxPermissions.includes(p.id) && 
    !constraints.restricted.includes(p.id)
  )
}

export const getPermissionCategories = (): string[] => {
  return [...new Set(PERMISSIONS.map(p => p.category))]
}

export const getPermissionsByRiskLevel = (riskLevel: string): Permission[] => {
  return PERMISSIONS.filter(p => p.riskLevel === riskLevel)
}
