import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  AdminModel,
  IAdmin,
  AdminSessionModel,
  IAdminSession,
  NotificationModel,
  INotification,
  PopupModel,
  IPopup,
  AppSettingModel,
  IAppSetting,
  AuditLogModel,
  IAuditLog,
  FeedbackMessageModel,
  IFeedbackMessage,
} from '../models/Admin';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export interface AdminPaginationFilterOptions {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'admin' | 'superadmin';
  status?: 'active' | 'inactive';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminPaginatedResult {
  admins: IAdmin[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AdminRepository extends BaseRepository<IAdmin> {
  constructor() {
    super(AdminModel, 'Admin');
  }

  async createWithDefaults(data: Partial<IAdmin>): Promise<IAdmin> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByEmail(email: string): Promise<IAdmin | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findByUsername(username: string): Promise<IAdmin | null> {
    return this.findOne({ username: username.toLowerCase() });
  }

  async findActiveAdmins(options?: PaginationOptions) {
    return this.findMany({ isActive: true }, options);
  }

  async findByRole(role: 'admin' | 'superadmin', options?: PaginationOptions) {
    return this.findMany({ role }, options);
  }

  async findSuperAdmins(): Promise<IAdmin[]> {
    return this.findAll({ role: 'superadmin', isActive: true });
  }

  async updateLastLogin(adminId: string): Promise<IAdmin | null> {
    return this.updateById(adminId, { lastLogin: new Date(), updatedAt: new Date() });
  }

  async deactivateAdmin(adminId: string): Promise<IAdmin | null> {
    return this.updateById(adminId, { isActive: false, updatedAt: new Date() });
  }

  async findWithPaginationAndFilters(options: AdminPaginationFilterOptions): Promise<AdminPaginatedResult> {
    const startTime = Date.now();
    const { 
      page = 1, 
      limit = 20, 
      search, 
      role, 
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    const skip = (page - 1) * limit;

    try {
      const query: any = {};

      if (search) {
        query.$or = [
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ];
      }

      if (role) {
        query.role = role;
      }

      if (status) {
        query.isActive = status === 'active';
      }

      const [admins, total] = await Promise.all([
        this.model
          .find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.model.countDocuments(query).exec(),
      ]);

      const totalPages = Math.ceil(total / limit);
      logger.db.query('findWithPaginationAndFilters', this.entityName, Date.now() - startTime, { total });

      return {
        admins,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.db.error('findWithPaginationAndFilters', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to find admins with pagination and filters', error as Error);
    }
  }
}

export class AdminSessionRepository extends BaseRepository<IAdminSession> {
  constructor() {
    super(AdminSessionModel, 'AdminSession');
  }

  async createWithDefaults(data: Partial<IAdminSession>): Promise<IAdminSession> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }

  async findByToken(token: string): Promise<IAdminSession | null> {
    return this.findOne({ token });
  }

  async findByAdminId(adminId: string, options?: PaginationOptions) {
    return this.findMany({ adminId }, options);
  }

  async findActiveSessionsByAdminId(adminId: string): Promise<IAdminSession[]> {
    return this.findAll({ adminId, expiresAt: { $gt: new Date() } });
  }

  async deleteExpiredSessions(): Promise<number> {
    return this.deleteMany({ expiresAt: { $lte: new Date() } });
  }

  async invalidateAllSessionsForAdmin(adminId: string): Promise<number> {
    return this.deleteMany({ adminId });
  }
}

export class NotificationRepository extends BaseRepository<INotification> {
  constructor() {
    super(NotificationModel, 'Notification');
  }

  async createWithDefaults(data: Partial<INotification>): Promise<INotification> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByUserId(userId: number, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findUnreadByUserId(userId: number): Promise<INotification[]> {
    return this.findAll({ userId, isRead: false });
  }

  async findActiveNotifications(options?: PaginationOptions) {
    const now = new Date();
    return this.findMany({
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } }
      ]
    }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findByPriority(priority: string, options?: PaginationOptions) {
    return this.findMany({ priority }, options);
  }

  async findScheduledNotifications(): Promise<INotification[]> {
    return this.findAll({
      scheduledFor: { $lte: new Date() },
      sentAt: { $exists: false }
    });
  }

  async markAsRead(notificationId: string): Promise<INotification | null> {
    return this.updateById(notificationId, { isRead: true, updatedAt: new Date() });
  }

  async markAllAsReadForUser(userId: number): Promise<number> {
    return this.updateMany({ userId, isRead: false }, { isRead: true, updatedAt: new Date() });
  }

  async markAsSent(notificationId: string): Promise<INotification | null> {
    return this.updateById(notificationId, { sentAt: new Date(), updatedAt: new Date() });
  }

  async deleteExpiredNotifications(): Promise<number> {
    return this.deleteMany({ expiresAt: { $lte: new Date() } });
  }
}

export class PopupRepository extends BaseRepository<IPopup> {
  constructor() {
    super(PopupModel, 'Popup');
  }

  async createWithDefaults(data: Partial<IPopup>): Promise<IPopup> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findActivePopups(options?: PaginationOptions) {
    const now = new Date();
    return this.findMany({
      isActive: true,
      $or: [
        { startDate: { $exists: false } },
        { startDate: { $lte: now } }
      ],
      $and: [
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: { $gt: now } }
          ]
        }
      ]
    }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findByPriority(priority: string, options?: PaginationOptions) {
    return this.findMany({ priority }, options);
  }

  async findByTargetUserType(targetUserType: string, options?: PaginationOptions) {
    return this.findMany({ targetUserType, isActive: true }, options);
  }

  async toggleActive(popupId: string, isActive: boolean): Promise<IPopup | null> {
    return this.updateById(popupId, { isActive, updatedAt: new Date() });
  }

  async findScheduledPopups(): Promise<IPopup[]> {
    const now = new Date();
    return this.findAll({
      isActive: true,
      startDate: { $gt: now }
    });
  }
}

export class AppSettingRepository extends BaseRepository<IAppSetting> {
  constructor() {
    super(AppSettingModel, 'AppSetting');
  }

  async createWithDefaults(data: Partial<IAppSetting>): Promise<IAppSetting> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByKey(key: string): Promise<IAppSetting | null> {
    return this.findOne({ key });
  }

  async findByCategory(category: string): Promise<IAppSetting[]> {
    return this.findAll({ category });
  }

  async findPublicSettings(): Promise<IAppSetting[]> {
    return this.findAll({ isPublic: true });
  }

  async getValue(key: string): Promise<string | null> {
    const setting = await this.findByKey(key);
    return setting?.value || null;
  }

  async setValue(key: string, value: string, updatedBy?: number): Promise<IAppSetting | null> {
    return this.updateOne(
      { key },
      { value, updatedBy, updatedAt: new Date() }
    );
  }

  async upsertSetting(key: string, value: string, options?: { description?: string; category?: string; isPublic?: boolean; updatedBy?: number }): Promise<IAppSetting> {
    const startTime = Date.now();
    try {
      const result = await this.model.findOneAndUpdate(
        { key },
        {
          $set: {
            value,
            description: options?.description,
            category: options?.category,
            isPublic: options?.isPublic,
            updatedBy: options?.updatedBy,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, new: true, runValidators: true }
      ).exec();
      logger.db.query('upsertSetting', this.entityName, Date.now() - startTime, { key });
      return result!;
    } catch (error) {
      logger.db.error('upsertSetting', error, { entityName: this.entityName, key });
      throw new DatabaseError('Failed to upsert app setting', error as Error);
    }
  }
}

export class AuditLogRepository extends BaseRepository<IAuditLog> {
  constructor() {
    super(AuditLogModel, 'AuditLog');
  }

  async createWithDefaults(data: Partial<IAuditLog>): Promise<IAuditLog> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }

  async findByActorId(actorId: string, options?: PaginationOptions) {
    return this.findMany({ actorId }, options);
  }

  async findByActorType(actorType: 'admin' | 'user' | 'system', options?: PaginationOptions) {
    return this.findMany({ actorType }, options);
  }

  async findByAction(action: string, options?: PaginationOptions) {
    return this.findMany({ action }, options);
  }

  async findByResource(resource: string, options?: PaginationOptions) {
    return this.findMany({ resource }, options);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findBySeverity(severity: 'info' | 'warning' | 'critical', options?: PaginationOptions) {
    return this.findMany({ severity }, options);
  }

  async getRecentAuditLogs(limit: number = 100): Promise<IAuditLog[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getRecentAuditLogs', this.entityName, Date.now() - startTime, { count: result.length });
      return result;
    } catch (error) {
      logger.db.error('getRecentAuditLogs', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to get recent audit logs', error as Error);
    }
  }

  async getAuditLogsByDateRange(startDate: Date, endDate: Date, options?: PaginationOptions) {
    return this.findMany({
      createdAt: { $gte: startDate, $lte: endDate }
    }, options);
  }

  async logAction(data: {
    actorType: 'admin' | 'user' | 'system';
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
  }): Promise<IAuditLog> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }
}

export class FeedbackMessageRepository extends BaseRepository<IFeedbackMessage> {
  constructor() {
    super(FeedbackMessageModel, 'FeedbackMessage');
  }

  async createWithDefaults(data: Partial<IFeedbackMessage>): Promise<IFeedbackMessage> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByUserId(userId: number, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findPendingFeedback(options?: PaginationOptions) {
    return this.findMany({ status: 'pending' }, options);
  }

  async findRespondedFeedback(options?: PaginationOptions) {
    return this.findMany({ status: 'responded' }, options);
  }

  async respondToFeedback(feedbackId: string, adminResponse: string, respondedBy: number): Promise<IFeedbackMessage | null> {
    return this.updateById(feedbackId, {
      adminResponse,
      respondedBy,
      respondedAt: new Date(),
      status: 'responded',
      updatedAt: new Date()
    });
  }

  async updateStatus(feedbackId: string, status: string): Promise<IFeedbackMessage | null> {
    return this.updateById(feedbackId, { status, updatedAt: new Date() });
  }
}

export const adminRepository = new AdminRepository();
export const adminSessionRepository = new AdminSessionRepository();
export const notificationRepository = new NotificationRepository();
export const popupRepository = new PopupRepository();
export const appSettingRepository = new AppSettingRepository();
export const auditLogRepository = new AuditLogRepository();
export const feedbackMessageRepository = new FeedbackMessageRepository();
