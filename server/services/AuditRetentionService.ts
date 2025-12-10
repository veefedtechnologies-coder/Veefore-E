import { AuditLogModel, IAuditLog } from '../models/Admin/AuditLog';

interface RetentionConfig {
  retentionDays: number;
  archiveCriticalLogs: boolean;
}

interface AuditStats {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsBySeverity: Record<string, number>;
  oldestLog: Date | null;
  newestLog: Date | null;
}

const DEFAULT_RETENTION_DAYS = 90;

export class AuditRetentionService {
  private config: RetentionConfig;

  constructor(config?: Partial<RetentionConfig>) {
    this.config = {
      retentionDays: config?.retentionDays || DEFAULT_RETENTION_DAYS,
      archiveCriticalLogs: config?.archiveCriticalLogs ?? true
    };
  }

  async deleteOldLogs(retentionDays?: number): Promise<{ deletedCount: number; archivedCount: number }> {
    const days = retentionDays || this.config.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let archivedCount = 0;
    
    if (this.config.archiveCriticalLogs) {
      archivedCount = await this.archiveCriticalLogs(cutoffDate);
    }

    const result = await AuditLogModel.deleteMany({
      createdAt: { $lt: cutoffDate },
      severity: { $nin: ['critical'] }
    });

    console.log(`[AUDIT RETENTION] Deleted ${result.deletedCount} logs older than ${days} days`);
    
    return {
      deletedCount: result.deletedCount || 0,
      archivedCount
    };
  }

  async archiveCriticalLogs(beforeDate: Date): Promise<number> {
    const criticalLogs = await AuditLogModel.find({
      createdAt: { $lt: beforeDate },
      severity: 'critical',
      archived: { $ne: true }
    }).lean();

    if (criticalLogs.length === 0) {
      return 0;
    }

    await AuditLogModel.updateMany(
      {
        _id: { $in: criticalLogs.map(log => log._id) }
      },
      {
        $set: { archived: true, archivedAt: new Date() }
      }
    );

    console.log(`[AUDIT RETENTION] Archived ${criticalLogs.length} critical logs`);
    
    return criticalLogs.length;
  }

  async getStatistics(): Promise<AuditStats> {
    const totalLogs = await AuditLogModel.countDocuments();

    const actionAggregation = await AuditLogModel.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } }
    ]);

    const severityAggregation = await AuditLogModel.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);

    const oldestLog = await AuditLogModel.findOne()
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean();

    const newestLog = await AuditLogModel.findOne()
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();

    const logsByAction: Record<string, number> = {};
    for (const item of actionAggregation) {
      logsByAction[item._id] = item.count;
    }

    const logsBySeverity: Record<string, number> = {};
    for (const item of severityAggregation) {
      logsBySeverity[item._id || 'info'] = item.count;
    }

    return {
      totalLogs,
      logsByAction,
      logsBySeverity,
      oldestLog: oldestLog?.createdAt || null,
      newestLog: newestLog?.createdAt || null
    };
  }

  async getLogsOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return AuditLogModel.countDocuments({
      createdAt: { $lt: cutoffDate }
    });
  }

  async cleanupByWorkspace(workspaceId: string, retentionDays?: number): Promise<number> {
    const days = retentionDays || this.config.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await AuditLogModel.deleteMany({
      workspaceId,
      createdAt: { $lt: cutoffDate },
      severity: { $nin: ['critical'] }
    });

    return result.deletedCount || 0;
  }
}

export const auditRetentionService = new AuditRetentionService();
