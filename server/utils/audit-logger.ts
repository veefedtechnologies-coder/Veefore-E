import { AuditLogModel, ActorType, IAuditLog } from '../models/Admin/AuditLog';
import { Request } from 'express';

export interface AuditLogParams {
  actorType: ActorType;
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
}

export const AuditActions = {
  CONTENT: {
    CREATE: 'content.create',
    UPDATE: 'content.update',
    DELETE: 'content.delete',
    SCHEDULE: 'content.schedule',
    RESCHEDULE: 'content.reschedule',
    PUBLISH: 'content.publish',
    DRAFT: 'content.draft'
  },
  WORKSPACE: {
    CREATE: 'workspace.create',
    UPDATE: 'workspace.update',
    DELETE: 'workspace.delete',
    INVITE_MEMBER: 'workspace.invite_member',
    REMOVE_MEMBER: 'workspace.remove_member',
    CHANGE_ROLE: 'workspace.change_role'
  },
  SOCIAL_ACCOUNT: {
    CONNECT: 'social_account.connect',
    DISCONNECT: 'social_account.disconnect',
    REFRESH: 'social_account.refresh'
  },
  USER: {
    LOGIN: 'user.login',
    LOGOUT: 'user.logout',
    PASSWORD_CHANGE: 'user.password_change',
    PROFILE_UPDATE: 'user.profile_update',
    SETTINGS_UPDATE: 'user.settings_update'
  },
  AI: {
    GENERATE_CONTENT: 'ai.generate_content',
    GENERATE_IMAGE: 'ai.generate_image',
    GENERATE_VIDEO: 'ai.generate_video',
    ANALYSIS: 'ai.analysis'
  },
  BILLING: {
    SUBSCRIPTION_CHANGE: 'billing.subscription_change',
    PAYMENT: 'billing.payment',
    CREDIT_PURCHASE: 'billing.credit_purchase'
  },
  ADMIN: {
    OPERATION: 'admin.operation',
    USER_MODIFY: 'admin.user_modify',
    SYSTEM_CONFIG: 'admin.system_config'
  }
} as const;

export const AuditResources = {
  CONTENT: 'content',
  WORKSPACE: 'workspace',
  SOCIAL_ACCOUNT: 'social_account',
  USER: 'user',
  SETTINGS: 'settings',
  BILLING: 'billing',
  AI_CREDITS: 'ai_credits',
  SYSTEM: 'system'
} as const;

export async function logUserAction(
  userId: string,
  action: string,
  metadata?: Record<string, any>,
  options?: {
    workspaceId?: string;
    resourceId?: string;
    resource?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<IAuditLog | null> {
  try {
    const logEntry = await AuditLogModel.create({
      actorType: 'user',
      actorId: userId,
      action,
      resource: options?.resource || deriveResourceFromAction(action),
      resourceId: options?.resourceId,
      workspaceId: options?.workspaceId,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      metadata,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      severity: options?.severity || 'info'
    });
    
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT LOG] Failed to create audit log entry:', error);
    return null;
  }
}

export async function logAdminAction(
  adminId: string,
  action: string,
  metadata?: Record<string, any>,
  options?: {
    resourceId?: string;
    resource?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<IAuditLog | null> {
  try {
    const logEntry = await AuditLogModel.create({
      actorType: 'admin',
      actorId: adminId,
      adminId: parseInt(adminId) || undefined,
      action,
      resource: options?.resource || deriveResourceFromAction(action),
      resourceId: options?.resourceId,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      metadata,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      severity: options?.severity || 'info'
    });
    
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT LOG] Failed to create admin audit log entry:', error);
    return null;
  }
}

export async function logSystemAction(
  action: string,
  metadata?: Record<string, any>,
  options?: {
    resourceId?: string;
    resource?: string;
    oldValues?: any;
    newValues?: any;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<IAuditLog | null> {
  try {
    const logEntry = await AuditLogModel.create({
      actorType: 'system',
      actorId: 'system',
      action,
      resource: options?.resource || deriveResourceFromAction(action),
      resourceId: options?.resourceId,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      metadata,
      severity: options?.severity || 'info'
    });
    
    return logEntry;
  } catch (error) {
    console.error('❌ [AUDIT LOG] Failed to create system audit log entry:', error);
    return null;
  }
}

export async function logActionFromRequest(
  req: Request,
  action: string,
  metadata?: Record<string, any>,
  options?: {
    resourceId?: string;
    resource?: string;
    workspaceId?: string;
    oldValues?: any;
    newValues?: any;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<IAuditLog | null> {
  const user = (req as any).user;
  const userId = user?.id || user?.uid || 'unknown';
  
  return logUserAction(userId, action, metadata, {
    ...options,
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent']
  });
}

export async function getAuditLogsForUser(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
  }
): Promise<IAuditLog[]> {
  const query: any = { actorId: userId };
  
  if (options?.startDate || options?.endDate) {
    query.createdAt = {};
    if (options?.startDate) query.createdAt.$gte = options.startDate;
    if (options?.endDate) query.createdAt.$lte = options.endDate;
  }
  
  if (options?.actions?.length) {
    query.action = { $in: options.actions };
  }
  
  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip(options?.offset || 0)
    .limit(options?.limit || 50)
    .lean()
    .exec();
}

export async function getAuditLogsForWorkspace(
  workspaceId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
  }
): Promise<IAuditLog[]> {
  const query: any = { workspaceId };
  
  if (options?.startDate || options?.endDate) {
    query.createdAt = {};
    if (options?.startDate) query.createdAt.$gte = options.startDate;
    if (options?.endDate) query.createdAt.$lte = options.endDate;
  }
  
  if (options?.actions?.length) {
    query.action = { $in: options.actions };
  }
  
  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip(options?.offset || 0)
    .limit(options?.limit || 50)
    .lean()
    .exec();
}

export async function getSecurityAuditLogs(
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    severity?: 'warning' | 'critical';
  }
): Promise<IAuditLog[]> {
  const query: any = {};
  
  if (options?.severity) {
    query.severity = options.severity;
  } else {
    query.severity = { $in: ['warning', 'critical'] };
  }
  
  if (options?.startDate || options?.endDate) {
    query.createdAt = {};
    if (options?.startDate) query.createdAt.$gte = options.startDate;
    if (options?.endDate) query.createdAt.$lte = options.endDate;
  }
  
  return AuditLogModel.find(query)
    .sort({ createdAt: -1 })
    .skip(options?.offset || 0)
    .limit(options?.limit || 100)
    .lean()
    .exec();
}

function deriveResourceFromAction(action: string): string {
  const [resource] = action.split('.');
  return resource || 'unknown';
}
