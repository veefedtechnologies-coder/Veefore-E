/**
 * Admin Permission Definitions
 *
 * Extracted from the monolithic `admin-panel/server/utils/permissions.ts`
 * (Task 18.1). This module is the single source of truth for:
 *  - Permission metadata (id, category, level, risk, dependencies)
 *  - Role definitions and the role hierarchy
 *  - Role-based permission constraints
 *
 * It contains NO business logic. Role-checking logic lives in
 * `../services/permission.service.ts` (Task 18.2) and Express middleware
 * lives in `../middleware/requirePermission.ts` (Task 18.3).
 *
 * Both an enum-based API (`PermissionId`, `PermissionCategory`, `AdminRole`)
 * and a string-friendly API (`PERMISSION_IDS`, `getPermissionById`,
 * `getRoleConstraints`) are exported so all consumers share one definition.
 *
 * _Requirements: 4.3, 19.3_
 */

/**
 * Risk classification for a permission. Used to drive audit logging and
 * approval flows for sensitive operations.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Backwards-compatible alias for {@link RiskLevel}. */
export type PermissionRiskLevel = RiskLevel;

/**
 * Privilege level for a permission or role. 1 is the most privileged
 * (Super Admin) and 5 is the least privileged.
 */
export type PrivilegeLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Logical grouping for permissions, used for UI grouping and reporting.
 */
export enum PermissionCategory {
  Authentication = 'Authentication',
  UserManagement = 'User Management',
  AdminManagement = 'Admin Management',
  SubscriptionManagement = 'Subscription Management',
  Billing = 'Billing',
  RefundManagement = 'Refund Management',
  Support = 'Support',
  Analytics = 'Analytics',
  ContentManagement = 'Content Management',
  SocialMedia = 'Social Media',
  AIML = 'AI & ML',
  SystemAdministration = 'System Administration',
  Security = 'Security',
  CouponManagement = 'Coupon Management',
  TeamManagement = 'Team Management',
  Notifications = 'Notifications',
  Webhooks = 'Webhooks',
}

/**
 * Canonical identifiers for every permission in the catalogue. Enum values
 * are the dotted permission ids (e.g. `users.read`).
 */
export enum PermissionId {
  // Authentication
  AuthLogin = 'auth.login',
  AuthLogout = 'auth.logout',
  Auth2faEnable = 'auth.2fa.enable',
  Auth2faDisable = 'auth.2fa.disable',
  AuthPasswordChange = 'auth.password.change',
  AuthPasswordReset = 'auth.password.reset',
  AuthSessionsView = 'auth.sessions.view',
  AuthSessionsTerminate = 'auth.sessions.terminate',

  // User Management
  UsersRead = 'users.read',
  UsersReadDetailed = 'users.read.detailed',
  UsersCreate = 'users.create',
  UsersEdit = 'users.edit',
  UsersDelete = 'users.delete',
  UsersBan = 'users.ban',
  UsersImpersonate = 'users.impersonate',
  UsersExport = 'users.export',
  UsersBulkOperations = 'users.bulk.operations',

  // Admin Management
  AdminsRead = 'admins.read',
  AdminsReadDetailed = 'admins.read.detailed',
  AdminsCreate = 'admins.create',
  AdminsEdit = 'admins.edit',
  AdminsDelete = 'admins.delete',
  AdminsInvite = 'admins.invite',
  AdminsInviteApprove = 'admins.invite.approve',
  AdminsInviteReject = 'admins.invite.reject',
  AdminsRolesAssign = 'admins.roles.assign',
  AdminsPermissionsManage = 'admins.permissions.manage',

  // Subscription Management
  SubscriptionsRead = 'subscriptions.read',
  SubscriptionsReadDetailed = 'subscriptions.read.detailed',
  SubscriptionsCreate = 'subscriptions.create',
  SubscriptionsEdit = 'subscriptions.edit',
  SubscriptionsCancel = 'subscriptions.cancel',
  SubscriptionsUpgrade = 'subscriptions.upgrade',
  SubscriptionsDowngrade = 'subscriptions.downgrade',

  // Billing
  BillingInvoicesView = 'billing.invoices.view',
  BillingPaymentsView = 'billing.payments.view',
  BillingPaymentsProcess = 'billing.payments.process',
  BillingPaymentsRefund = 'billing.payments.refund',
  BillingCreditsManage = 'billing.credits.manage',

  // Refund Management
  RefundsRead = 'refunds.read',
  RefundsApprove = 'refunds.approve',
  RefundsReject = 'refunds.reject',
  RefundsProcess = 'refunds.process',

  // Support
  TicketsRead = 'tickets.read',
  TicketsCreate = 'tickets.create',
  TicketsEdit = 'tickets.edit',
  TicketsAssign = 'tickets.assign',
  TicketsResolve = 'tickets.resolve',
  TicketsClose = 'tickets.close',

  // Analytics
  AnalyticsDashboardView = 'analytics.dashboard.view',
  AnalyticsUsersView = 'analytics.users.view',
  AnalyticsRevenueView = 'analytics.revenue.view',
  AnalyticsExport = 'analytics.export',

  // Content Management
  ContentRead = 'content.read',
  ContentModerate = 'content.moderate',
  ContentRemove = 'content.remove',

  // Social Media
  SocialAccountsView = 'social.accounts.view',
  SocialAccountsManage = 'social.accounts.manage',

  // AI & ML
  AiContentGenerate = 'ai.content.generate',
  AiContentModerate = 'ai.content.moderate',
  AiModelsManage = 'ai.models.manage',
  AiUsageView = 'ai.usage.view',

  // System Administration
  SystemSettingsView = 'system.settings.view',
  SystemSettingsEdit = 'system.settings.edit',
  SystemMaintenance = 'system.maintenance',

  // Security
  SecurityAuditView = 'security.audit.view',
  SecurityAuditExport = 'security.audit.export',

  // Coupon Management
  CouponsRead = 'coupons.read',
  CouponsCreate = 'coupons.create',
  CouponsEdit = 'coupons.edit',
  CouponsDelete = 'coupons.delete',

  // Team Management
  TeamsRead = 'teams.read',
  TeamsCreate = 'teams.create',
  TeamsEdit = 'teams.edit',
  TeamsMembersAdd = 'teams.members.add',
  TeamsMembersRemove = 'teams.members.remove',

  // Notifications
  NotificationsRead = 'notifications.read',
  NotificationsCreate = 'notifications.create',
  NotificationsSend = 'notifications.send',

  // Webhooks
  WebhooksRead = 'webhooks.read',
  WebhooksCreate = 'webhooks.create',
  WebhooksEdit = 'webhooks.edit',
  WebhooksDelete = 'webhooks.delete',
}

/**
 * A single permission definition.
 */
export interface Permission {
  /** Unique permission identifier, e.g. `users.read`. */
  id: PermissionId;
  /** Human-readable name. */
  name: string;
  /** Description of what the permission grants. */
  description: string;
  /** Logical grouping for UI/reporting. */
  category: PermissionCategory;
  /** Privilege level 1-5 where 1 is the most privileged (Super Admin). */
  level: PrivilegeLevel;
  /** Permissions that must also be granted for this permission to be valid. */
  dependencies?: PermissionId[];
  /** Risk classification. */
  riskLevel: RiskLevel;
  /** Whether the permission is granted automatically based on role. */
  autoGranted?: boolean;
}

/**
 * Known admin roles. Ordered conceptually from most to least privileged.
 */
export enum AdminRole {
  SuperAdmin = 'superadmin',
  Admin = 'admin',
  Support = 'support',
  Billing = 'billing',
  Moderator = 'moderator',
  Analytics = 'analytics',
}

/**
 * Constraints applied to a role describing the minimum, maximum, auto-granted
 * and restricted permissions for that role.
 */
export interface RolePermissionConstraints {
  /** Role identifier. */
  role: AdminRole;
  /** Privilege level for the role (1 = highest). */
  level: PrivilegeLevel;
  /** Permissions every member of the role must have. */
  minPermissions: string[];
  /** The complete set of permissions the role may be granted. */
  maxPermissions: string[];
  /** Permissions granted automatically to the role. */
  autoGranted: string[];
  /** Permissions the role may never hold. */
  restricted: string[];
}

/**
 * Role hierarchy expressed as privilege levels. A LOWER number means a MORE
 * privileged role. A role implicitly satisfies any role requirement whose
 * level is greater than or equal to its own (i.e. a superadmin satisfies an
 * `admin` requirement, but not vice-versa).
 */
export const ROLE_HIERARCHY: Record<AdminRole, PrivilegeLevel> = {
  [AdminRole.SuperAdmin]: 1,
  [AdminRole.Admin]: 2,
  [AdminRole.Support]: 3,
  [AdminRole.Billing]: 3,
  [AdminRole.Moderator]: 4,
  [AdminRole.Analytics]: 4,
};

/**
 * Comprehensive permission catalog.
 */
export const PERMISSIONS: Permission[] = [
  // Authentication
  { id: PermissionId.AuthLogin, name: 'Login Access', description: 'Allow admin to log in to the system', category: PermissionCategory.Authentication, level: 5, riskLevel: 'low', autoGranted: true },
  { id: PermissionId.AuthLogout, name: 'Logout Access', description: 'Allow admin to log out', category: PermissionCategory.Authentication, level: 5, riskLevel: 'low', autoGranted: true },
  { id: PermissionId.Auth2faEnable, name: 'Enable 2FA', description: 'Enable two-factor authentication', category: PermissionCategory.Authentication, level: 4, riskLevel: 'medium' },
  { id: PermissionId.Auth2faDisable, name: 'Disable 2FA', description: 'Disable two-factor authentication', category: PermissionCategory.Authentication, level: 3, riskLevel: 'high' },
  { id: PermissionId.AuthPasswordChange, name: 'Change Password', description: 'Change own password', category: PermissionCategory.Authentication, level: 5, riskLevel: 'low', autoGranted: true },
  { id: PermissionId.AuthPasswordReset, name: 'Reset Passwords', description: "Reset other admins' passwords", category: PermissionCategory.Authentication, level: 2, riskLevel: 'high' },
  { id: PermissionId.AuthSessionsView, name: 'View Sessions', description: 'View active admin sessions', category: PermissionCategory.Authentication, level: 3, riskLevel: 'medium' },
  { id: PermissionId.AuthSessionsTerminate, name: 'Terminate Sessions', description: 'Terminate admin sessions', category: PermissionCategory.Authentication, level: 2, riskLevel: 'high' },

  // User Management
  { id: PermissionId.UsersRead, name: 'View Users', description: 'View user list and basic information', category: PermissionCategory.UserManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.UsersReadDetailed, name: 'View Detailed User Data', description: 'View detailed user profiles including sensitive data', category: PermissionCategory.UserManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.UsersRead] },
  { id: PermissionId.UsersCreate, name: 'Create Users', description: 'Create new user accounts', category: PermissionCategory.UserManagement, level: 3, riskLevel: 'medium' },
  { id: PermissionId.UsersEdit, name: 'Edit Users', description: 'Edit user information', category: PermissionCategory.UserManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.UsersRead] },
  { id: PermissionId.UsersDelete, name: 'Delete Users', description: 'Delete user accounts', category: PermissionCategory.UserManagement, level: 2, riskLevel: 'critical' },
  { id: PermissionId.UsersBan, name: 'Ban/Unban Users', description: 'Ban or unban user accounts', category: PermissionCategory.UserManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.UsersRead] },
  { id: PermissionId.UsersImpersonate, name: 'Impersonate Users', description: 'Impersonate users for support purposes', category: PermissionCategory.UserManagement, level: 2, riskLevel: 'critical', dependencies: [PermissionId.UsersRead] },
  { id: PermissionId.UsersExport, name: 'Export User Data', description: 'Export user data', category: PermissionCategory.UserManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.UsersRead] },
  { id: PermissionId.UsersBulkOperations, name: 'Bulk User Operations', description: 'Perform bulk operations on users', category: PermissionCategory.UserManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.UsersRead] },

  // Admin Management
  { id: PermissionId.AdminsRead, name: 'View Admins', description: 'View admin list', category: PermissionCategory.AdminManagement, level: 3, riskLevel: 'medium' },
  { id: PermissionId.AdminsReadDetailed, name: 'View Detailed Admin Data', description: 'View detailed admin profiles', category: PermissionCategory.AdminManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.AdminsRead] },
  { id: PermissionId.AdminsCreate, name: 'Create Admins', description: 'Create new admin accounts', category: PermissionCategory.AdminManagement, level: 1, riskLevel: 'critical' },
  { id: PermissionId.AdminsEdit, name: 'Edit Admins', description: 'Edit admin information', category: PermissionCategory.AdminManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.AdminsRead] },
  { id: PermissionId.AdminsDelete, name: 'Delete Admins', description: 'Delete admin accounts', category: PermissionCategory.AdminManagement, level: 1, riskLevel: 'critical' },
  { id: PermissionId.AdminsInvite, name: 'Send Admin Invitations', description: 'Send admin invitations', category: PermissionCategory.AdminManagement, level: 2, riskLevel: 'high' },
  { id: PermissionId.AdminsInviteApprove, name: 'Approve Admin Invitations', description: 'Approve admin invitations', category: PermissionCategory.AdminManagement, level: 2, riskLevel: 'high' },
  { id: PermissionId.AdminsInviteReject, name: 'Reject Admin Invitations', description: 'Reject admin invitations', category: PermissionCategory.AdminManagement, level: 2, riskLevel: 'high' },
  { id: PermissionId.AdminsRolesAssign, name: 'Assign Admin Roles', description: 'Assign roles to admins', category: PermissionCategory.AdminManagement, level: 1, riskLevel: 'critical', dependencies: [PermissionId.AdminsRead] },
  { id: PermissionId.AdminsPermissionsManage, name: 'Manage Admin Permissions', description: 'Manage admin permissions', category: PermissionCategory.AdminManagement, level: 1, riskLevel: 'critical' },

  // Subscription Management
  { id: PermissionId.SubscriptionsRead, name: 'View Subscriptions', description: 'View subscription information', category: PermissionCategory.SubscriptionManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.SubscriptionsReadDetailed, name: 'View Detailed Subscriptions', description: 'View detailed subscription data', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.SubscriptionsRead] },
  { id: PermissionId.SubscriptionsCreate, name: 'Create Subscriptions', description: 'Create new subscriptions', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'high' },
  { id: PermissionId.SubscriptionsEdit, name: 'Edit Subscriptions', description: 'Modify existing subscriptions', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.SubscriptionsRead] },
  { id: PermissionId.SubscriptionsCancel, name: 'Cancel Subscriptions', description: 'Cancel subscriptions', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.SubscriptionsRead] },
  { id: PermissionId.SubscriptionsUpgrade, name: 'Upgrade Subscriptions', description: 'Upgrade user plans', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.SubscriptionsRead] },
  { id: PermissionId.SubscriptionsDowngrade, name: 'Downgrade Subscriptions', description: 'Downgrade user plans', category: PermissionCategory.SubscriptionManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.SubscriptionsRead] },

  // Billing
  { id: PermissionId.BillingInvoicesView, name: 'View Invoices', description: 'View invoices', category: PermissionCategory.Billing, level: 4, riskLevel: 'medium' },
  { id: PermissionId.BillingPaymentsView, name: 'View Payments', description: 'View payment information', category: PermissionCategory.Billing, level: 4, riskLevel: 'medium' },
  { id: PermissionId.BillingPaymentsProcess, name: 'Process Payments', description: 'Process payments', category: PermissionCategory.Billing, level: 3, riskLevel: 'high' },
  { id: PermissionId.BillingPaymentsRefund, name: 'Process Refunds', description: 'Process refunds', category: PermissionCategory.Billing, level: 3, riskLevel: 'high' },
  { id: PermissionId.BillingCreditsManage, name: 'Manage Credits', description: 'Manage user credits', category: PermissionCategory.Billing, level: 3, riskLevel: 'high' },

  // Refund Management
  { id: PermissionId.RefundsRead, name: 'View Refunds', description: 'View refund requests', category: PermissionCategory.RefundManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.RefundsApprove, name: 'Approve Refunds', description: 'Approve refund requests', category: PermissionCategory.RefundManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.RefundsRead] },
  { id: PermissionId.RefundsReject, name: 'Reject Refunds', description: 'Reject refund requests', category: PermissionCategory.RefundManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.RefundsRead] },
  { id: PermissionId.RefundsProcess, name: 'Process Refunds', description: 'Process approved refunds', category: PermissionCategory.RefundManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.RefundsRead] },

  // Support
  { id: PermissionId.TicketsRead, name: 'View Support Tickets', description: 'View support tickets', category: PermissionCategory.Support, level: 4, riskLevel: 'low' },
  { id: PermissionId.TicketsCreate, name: 'Create Support Tickets', description: 'Create support tickets', category: PermissionCategory.Support, level: 4, riskLevel: 'low' },
  { id: PermissionId.TicketsEdit, name: 'Edit Support Tickets', description: 'Edit ticket information', category: PermissionCategory.Support, level: 3, riskLevel: 'medium', dependencies: [PermissionId.TicketsRead] },
  { id: PermissionId.TicketsAssign, name: 'Assign Support Tickets', description: 'Assign tickets to team members', category: PermissionCategory.Support, level: 3, riskLevel: 'medium', dependencies: [PermissionId.TicketsRead] },
  { id: PermissionId.TicketsResolve, name: 'Resolve Support Tickets', description: 'Resolve support tickets', category: PermissionCategory.Support, level: 3, riskLevel: 'medium', dependencies: [PermissionId.TicketsRead] },
  { id: PermissionId.TicketsClose, name: 'Close Support Tickets', description: 'Close support tickets', category: PermissionCategory.Support, level: 3, riskLevel: 'medium', dependencies: [PermissionId.TicketsRead] },

  // Analytics
  { id: PermissionId.AnalyticsDashboardView, name: 'View Analytics Dashboard', description: 'View main analytics dashboard', category: PermissionCategory.Analytics, level: 4, riskLevel: 'low' },
  { id: PermissionId.AnalyticsUsersView, name: 'View User Analytics', description: 'View user analytics', category: PermissionCategory.Analytics, level: 3, riskLevel: 'medium' },
  { id: PermissionId.AnalyticsRevenueView, name: 'View Revenue Analytics', description: 'View revenue analytics', category: PermissionCategory.Analytics, level: 2, riskLevel: 'high' },
  { id: PermissionId.AnalyticsExport, name: 'Export Analytics Data', description: 'Export analytics data', category: PermissionCategory.Analytics, level: 3, riskLevel: 'high', dependencies: [PermissionId.AnalyticsDashboardView] },

  // Content & Social
  { id: PermissionId.ContentRead, name: 'View Content', description: 'View user content', category: PermissionCategory.ContentManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.ContentModerate, name: 'Moderate Content', description: 'Moderate user content', category: PermissionCategory.ContentManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.ContentRead] },
  { id: PermissionId.ContentRemove, name: 'Remove Content', description: 'Remove user content', category: PermissionCategory.ContentManagement, level: 3, riskLevel: 'high', dependencies: [PermissionId.ContentRead] },
  { id: PermissionId.SocialAccountsView, name: 'View Social Accounts', description: 'View connected social accounts', category: PermissionCategory.SocialMedia, level: 4, riskLevel: 'low' },
  { id: PermissionId.SocialAccountsManage, name: 'Manage Social Accounts', description: 'Manage social account connections', category: PermissionCategory.SocialMedia, level: 3, riskLevel: 'medium' },

  // AI & ML
  { id: PermissionId.AiContentGenerate, name: 'AI Content Generation', description: 'Access AI content generation', category: PermissionCategory.AIML, level: 4, riskLevel: 'low' },
  { id: PermissionId.AiContentModerate, name: 'Moderate AI Content', description: 'Moderate AI-generated content', category: PermissionCategory.AIML, level: 3, riskLevel: 'medium' },
  { id: PermissionId.AiModelsManage, name: 'Manage AI Models', description: 'Manage AI model settings', category: PermissionCategory.AIML, level: 2, riskLevel: 'high' },
  { id: PermissionId.AiUsageView, name: 'View AI Usage', description: 'View AI usage statistics', category: PermissionCategory.AIML, level: 3, riskLevel: 'medium' },

  // System Administration & Security
  { id: PermissionId.SystemSettingsView, name: 'View System Settings', description: 'View system settings', category: PermissionCategory.SystemAdministration, level: 2, riskLevel: 'high' },
  { id: PermissionId.SystemSettingsEdit, name: 'Edit System Settings', description: 'Edit system settings', category: PermissionCategory.SystemAdministration, level: 1, riskLevel: 'critical' },
  { id: PermissionId.SystemMaintenance, name: 'Maintenance Mode', description: 'Access maintenance mode', category: PermissionCategory.SystemAdministration, level: 1, riskLevel: 'critical' },
  { id: PermissionId.SecurityAuditView, name: 'View Audit Logs', description: 'View audit logs', category: PermissionCategory.Security, level: 2, riskLevel: 'high' },
  { id: PermissionId.SecurityAuditExport, name: 'Export Audit Logs', description: 'Export audit logs', category: PermissionCategory.Security, level: 2, riskLevel: 'high', dependencies: [PermissionId.SecurityAuditView] },

  // Coupon Management
  { id: PermissionId.CouponsRead, name: 'View Coupons', description: 'View coupons', category: PermissionCategory.CouponManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.CouponsCreate, name: 'Create Coupons', description: 'Create new coupons', category: PermissionCategory.CouponManagement, level: 3, riskLevel: 'medium' },
  { id: PermissionId.CouponsEdit, name: 'Edit Coupons', description: 'Edit existing coupons', category: PermissionCategory.CouponManagement, level: 3, riskLevel: 'medium', dependencies: [PermissionId.CouponsRead] },
  { id: PermissionId.CouponsDelete, name: 'Delete Coupons', description: 'Delete coupons', category: PermissionCategory.CouponManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.CouponsRead] },

  // Team Management
  { id: PermissionId.TeamsRead, name: 'View Teams', description: 'View team structure', category: PermissionCategory.TeamManagement, level: 4, riskLevel: 'low' },
  { id: PermissionId.TeamsCreate, name: 'Create Teams', description: 'Create new teams', category: PermissionCategory.TeamManagement, level: 2, riskLevel: 'high' },
  { id: PermissionId.TeamsEdit, name: 'Edit Teams', description: 'Edit team information', category: PermissionCategory.TeamManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.TeamsRead] },
  { id: PermissionId.TeamsMembersAdd, name: 'Add Team Members', description: 'Add members to teams', category: PermissionCategory.TeamManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.TeamsRead] },
  { id: PermissionId.TeamsMembersRemove, name: 'Remove Team Members', description: 'Remove members from teams', category: PermissionCategory.TeamManagement, level: 2, riskLevel: 'high', dependencies: [PermissionId.TeamsRead] },

  // Notifications
  { id: PermissionId.NotificationsRead, name: 'View Notifications', description: 'View notifications', category: PermissionCategory.Notifications, level: 4, riskLevel: 'low' },
  { id: PermissionId.NotificationsCreate, name: 'Create Notifications', description: 'Create notifications', category: PermissionCategory.Notifications, level: 3, riskLevel: 'medium' },
  { id: PermissionId.NotificationsSend, name: 'Send Notifications', description: 'Send notifications to users', category: PermissionCategory.Notifications, level: 3, riskLevel: 'high' },

  // Webhooks
  { id: PermissionId.WebhooksRead, name: 'View Webhooks', description: 'View webhooks', category: PermissionCategory.Webhooks, level: 3, riskLevel: 'medium' },
  { id: PermissionId.WebhooksCreate, name: 'Create Webhooks', description: 'Create new webhooks', category: PermissionCategory.Webhooks, level: 2, riskLevel: 'high' },
  { id: PermissionId.WebhooksEdit, name: 'Edit Webhooks', description: 'Edit webhooks', category: PermissionCategory.Webhooks, level: 2, riskLevel: 'high', dependencies: [PermissionId.WebhooksRead] },
  { id: PermissionId.WebhooksDelete, name: 'Delete Webhooks', description: 'Delete webhooks', category: PermissionCategory.Webhooks, level: 2, riskLevel: 'high', dependencies: [PermissionId.WebhooksRead] },
];

/**
 * Ordered list of every permission id in the catalogue.
 */
export const ALL_PERMISSION_IDS: string[] = PERMISSIONS.map((p) => p.id);

/**
 * Set of all valid permission ids for fast membership checks.
 */
export const PERMISSION_IDS: ReadonlySet<string> = new Set(ALL_PERMISSION_IDS);

/**
 * Lookup a permission definition by id.
 */
export const getPermissionById = (id: string): Permission | undefined =>
  PERMISSIONS.find((p) => p.id === id);

/**
 * Role-based permission constraints. Defines what each role may and may not do.
 */
export const ROLE_PERMISSION_CONSTRAINTS: RolePermissionConstraints[] = [
  {
    role: AdminRole.SuperAdmin,
    level: 1,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read',
      'analytics.dashboard.view', 'admins.read', 'admins.read.detailed',
    ],
    maxPermissions: PERMISSIONS.map((p) => p.id),
    autoGranted: [
      ...PERMISSIONS.filter((p) => p.autoGranted).map((p) => p.id),
      'admins.read', 'admins.read.detailed', 'admins.create', 'admins.edit', 'admins.delete',
      'admins.permissions.manage',
    ],
    restricted: [],
  },
  {
    role: AdminRole.Admin,
    level: 2,
    minPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    maxPermissions: PERMISSIONS.filter((p) => p.level >= 2).map((p) => p.id),
    autoGranted: [
      'auth.login', 'auth.logout', 'auth.password.change',
      'users.read', 'subscriptions.read', 'tickets.read', 'analytics.dashboard.view',
    ],
    restricted: [
      'system.settings.edit', 'system.maintenance',
      'admins.create', 'admins.delete', 'admins.permissions.manage', 'security.audit.export',
    ],
  },
  {
    role: AdminRole.Support,
    level: 3,
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban',
      'tickets.read', 'tickets.create', 'tickets.edit', 'tickets.assign', 'tickets.resolve', 'tickets.close',
      'subscriptions.read', 'subscriptions.edit',
      'content.read', 'content.moderate',
      'analytics.dashboard.view', 'analytics.users.view',
      'notifications.read', 'notifications.create',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'tickets.read', 'users.read'],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign',
      'subscriptions.create', 'subscriptions.cancel',
      'billing.payments.process', 'billing.payments.refund',
      'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.revenue.view', 'analytics.export',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
    ],
  },
  {
    role: AdminRole.Billing,
    level: 3,
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'subscriptions.read', 'billing.payments.view', 'refunds.read'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit',
      'subscriptions.read', 'subscriptions.read.detailed', 'subscriptions.create', 'subscriptions.edit', 'subscriptions.cancel', 'subscriptions.upgrade', 'subscriptions.downgrade',
      'billing.invoices.view', 'billing.payments.view', 'billing.payments.process', 'billing.payments.refund', 'billing.credits.manage',
      'refunds.read', 'refunds.approve', 'refunds.reject', 'refunds.process',
      'analytics.dashboard.view', 'analytics.revenue.view', 'analytics.export',
      'coupons.read', 'coupons.create', 'coupons.edit', 'coupons.delete',
      'notifications.read', 'notifications.create',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'subscriptions.read', 'billing.payments.view', 'refunds.read'],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.create', 'admins.delete', 'admins.invite', 'admins.roles.assign', 'admins.permissions.manage',
      'content.read', 'content.moderate', 'content.remove',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
    ],
  },
  {
    role: AdminRole.Moderator,
    level: 4,
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'users.edit', 'users.ban',
      'content.read', 'content.moderate', 'content.remove',
      'social.accounts.view', 'ai.content.moderate',
      'analytics.dashboard.view', 'analytics.users.view', 'notifications.read',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'content.moderate', 'users.read'],
    restricted: [
      'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.permissions.manage',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
    ],
  },
  {
    role: AdminRole.Analytics,
    level: 4,
    minPermissions: ['auth.login', 'auth.logout', 'auth.password.change', 'analytics.dashboard.view'],
    maxPermissions: [
      'auth.login', 'auth.logout', 'auth.password.change', 'auth.2fa.enable',
      'users.read', 'subscriptions.read',
      'analytics.dashboard.view', 'analytics.users.view', 'analytics.revenue.view', 'analytics.export',
      'notifications.read',
    ],
    autoGranted: ['auth.login', 'auth.logout', 'auth.password.change', 'analytics.dashboard.view'],
    restricted: [
      'users.edit', 'users.delete', 'users.impersonate', 'users.export', 'users.bulk.operations',
      'admins.read', 'admins.create', 'admins.delete', 'admins.permissions.manage',
      'content.read', 'content.moderate', 'content.remove',
      'system.settings.view', 'system.settings.edit', 'system.maintenance',
      'security.audit.view', 'security.audit.export',
    ],
  },
];

/**
 * Lookup the constraints for a given role.
 */
export const getRoleConstraints = (role: string): RolePermissionConstraints | undefined =>
  ROLE_PERMISSION_CONSTRAINTS.find((r) => r.role === role);
