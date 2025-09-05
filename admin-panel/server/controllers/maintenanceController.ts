import { Request, Response } from 'express';
import MaintenanceMode from '../models/MaintenanceMode';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class MaintenanceController {
  // Get current maintenance status
  static async getMaintenanceStatus(req: Request, res: Response) {
    try {
      const maintenance = await MaintenanceMode.getCurrentMaintenance();
      
      res.json({
        success: true,
        data: {
          isActive: !!maintenance,
          maintenance: maintenance || null
        }
      });
    } catch (error) {
      console.error('Get maintenance status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get all maintenance records
  static async getMaintenanceRecords(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        type,
        priority,
        status
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { title: { $regex: q, $options: 'i' } },
          { message: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } }
        ];
      }

      // Type filter
      if (type) {
        query.type = type;
      }

      // Priority filter
      if (priority) {
        query.priority = priority;
      }

      // Status filter
      if (status) {
        if (status === 'active') {
          query.isActive = true;
        } else if (status === 'upcoming') {
          query.isActive = false;
          query.scheduledStart = { $gt: new Date() };
        } else if (status === 'completed') {
          query.isActive = false;
          query.scheduledEnd = { $lt: new Date() };
        }
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const maintenanceRecords = await MaintenanceMode.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await MaintenanceMode.countDocuments(query);

      res.json({
        success: true,
        data: {
          maintenanceRecords,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get maintenance records error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get maintenance by ID
  static async getMaintenanceById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const maintenance = await MaintenanceMode.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email');
      
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      res.json({
        success: true,
        data: { maintenance }
      });
    } catch (error) {
      console.error('Get maintenance by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create maintenance record
  static async createMaintenance(req: AuthRequest, res: Response) {
    try {
      const {
        title,
        message,
        description,
        scheduledStart,
        scheduledEnd,
        estimatedDuration,
        timezone,
        type,
        priority,
        affectedServices,
        userExperience,
        notifications,
        accessControl,
        rollback,
        monitoring,
        communication
      } = req.body;

      // Check for overlapping maintenance
      const overlapping = await MaintenanceMode.findOne({
        $or: [
          {
            scheduledStart: { $lte: new Date(scheduledEnd) },
            scheduledEnd: { $gte: new Date(scheduledStart) }
          }
        ],
        isActive: { $ne: false }
      });

      if (overlapping) {
        return res.status(400).json({
          success: false,
          message: 'Overlapping maintenance window detected'
        });
      }

      // Create maintenance record
      const maintenance = new MaintenanceMode({
        title,
        message,
        description,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        estimatedDuration,
        timezone,
        type,
        priority,
        affectedServices: affectedServices || [],
        userExperience: {
          showMaintenancePage: true,
          allowReadOnlyAccess: false,
          showProgress: true,
          ...userExperience
        },
        notifications: {
          emailUsers: true,
          emailAdmins: true,
          inAppNotification: true,
          socialMedia: false,
          statusPage: true,
          notifyBefore: 60,
          ...notifications
        },
        accessControl: {
          allowAdminAccess: true,
          allowSpecificUsers: [],
          allowSpecificIPs: [],
          allowSpecificRoles: [],
          ...accessControl
        },
        rollback: {
          canRollback: false,
          rollbackSteps: [],
          rollbackTriggered: false,
          ...rollback
        },
        monitoring: {
          monitorSystemHealth: true,
          alertThresholds: {
            cpu: 80,
            memory: 85,
            disk: 90,
            responseTime: 5000
          },
          alerts: [],
          ...monitoring
        },
        communication: {
          supportChannels: [],
          socialMediaPosts: [],
          ...communication
        },
        createdBy: req.admin._id,
        lastModifiedBy: req.admin._id
      });

      await maintenance.save();

      // Log maintenance creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_create',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          type: maintenance.type,
          priority: maintenance.priority,
          scheduledStart: maintenance.scheduledStart,
          scheduledEnd: maintenance.scheduledEnd
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.status(201).json({
        success: true,
        message: 'Maintenance record created successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Create maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update maintenance record
  static async updateMaintenance(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      // Store old data for audit
      const oldData = {
        title: maintenance.title,
        scheduledStart: maintenance.scheduledStart,
        scheduledEnd: maintenance.scheduledEnd,
        isActive: maintenance.isActive
      };

      // Update maintenance
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          maintenance[key] = updateData[key];
        }
      });

      maintenance.lastModifiedBy = req.admin._id;
      await maintenance.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_update',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          oldData,
          newData: updateData
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Maintenance record updated successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Update maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Start maintenance
  static async startMaintenance(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      if (maintenance.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Maintenance is already active'
        });
      }

      // Check if it's time to start
      const now = new Date();
      if (now < maintenance.scheduledStart) {
        return res.status(400).json({
          success: false,
          message: 'Maintenance cannot start before scheduled time'
        });
      }

      // Start maintenance
      await maintenance.startMaintenance();

      // Log maintenance start
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_start',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          type: maintenance.type,
          priority: maintenance.priority
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'critical',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Maintenance started successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Start maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // End maintenance
  static async endMaintenance(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      if (!maintenance.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Maintenance is not active'
        });
      }

      // End maintenance
      await maintenance.endMaintenance();

      // Log maintenance end
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_end',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          duration: maintenance.duration,
          progressPercentage: maintenance.progressPercentage
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Maintenance ended successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('End maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update progress
  static async updateProgress(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { step, completedSteps, note } = req.body;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      // Update progress
      await maintenance.updateProgress(step, completedSteps);

      // Add progress note if provided
      if (note) {
        await maintenance.addProgressNote(note, req.admin._id);
      }

      // Log progress update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_progress_update',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          step,
          completedSteps,
          progressPercentage: maintenance.progressPercentage
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Progress updated successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Update progress error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Trigger rollback
  static async triggerRollback(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      if (!maintenance.rollback.canRollback) {
        return res.status(400).json({
          success: false,
          message: 'Rollback is not enabled for this maintenance'
        });
      }

      // Trigger rollback
      await maintenance.triggerRollback(reason, req.admin._id);

      // Log rollback
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_rollback',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          reason
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'critical',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Rollback triggered successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Trigger rollback error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Add alert
  static async addAlert(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { type, message } = req.body;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      // Add alert
      await maintenance.addAlert(type, message);

      res.json({
        success: true,
        message: 'Alert added successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Add alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Resolve alert
  static async resolveAlert(req: AuthRequest, res: Response) {
    try {
      const { id, alertIndex } = req.params;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      // Resolve alert
      await maintenance.resolveAlert(Number(alertIndex));

      res.json({
        success: true,
        message: 'Alert resolved successfully',
        data: { maintenance }
      });
    } catch (error) {
      console.error('Resolve alert error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get upcoming maintenance
  static async getUpcomingMaintenance(req: Request, res: Response) {
    try {
      const upcoming = await MaintenanceMode.getUpcomingMaintenance();

      res.json({
        success: true,
        data: { upcoming }
      });
    } catch (error) {
      console.error('Get upcoming maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get maintenance history
  static async getMaintenanceHistory(req: AuthRequest, res: Response) {
    try {
      const { limit = 10 } = req.query;

      const history = await MaintenanceMode.getMaintenanceHistory(Number(limit));

      res.json({
        success: true,
        data: { history }
      });
    } catch (error) {
      console.error('Get maintenance history error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete maintenance record
  static async deleteMaintenance(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const maintenance = await MaintenanceMode.findById(id);
      if (!maintenance) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance record not found'
        });
      }

      if (maintenance.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete active maintenance'
        });
      }

      await MaintenanceMode.findByIdAndDelete(id);

      // Log deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'maintenance_delete',
        resource: 'maintenance_mode',
        resourceId: maintenance._id.toString(),
        details: {
          title: maintenance.title,
          type: maintenance.type
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Maintenance record deleted successfully'
      });
    } catch (error) {
      console.error('Delete maintenance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
