import { Request, Response } from 'express';
import Notification from '../models/Notification';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class NotificationController {
  // Get all notifications with filtering
  static async getNotifications(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        type,
        priority,
        channel
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { title: { $regex: q, $options: 'i' } },
          { message: { $regex: q, $options: 'i' } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Type filter
      if (type) {
        query.type = type;
      }

      // Priority filter
      if (priority) {
        query.priority = priority;
      }

      // Channel filter
      if (channel) {
        query.channels = channel;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const notifications = await Notification.find(query)
        .populate('createdBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Notification.countDocuments(query);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get notification by ID
  static async getNotificationById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const notification = await Notification.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('targetUsers', 'firstName lastName email');
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.json({
        success: true,
        data: { notification }
      });
    } catch (error) {
      console.error('Get notification by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new notification
  static async createNotification(req: AuthRequest, res: Response) {
    try {
      const {
        title,
        message,
        type = 'info',
        priority = 'medium',
        targetUsers = [],
        targetRoles = [],
        targetTeams = [],
        targetSegments = [],
        channels = ['in_app'],
        scheduledFor,
        expiresAt,
        richContent,
        abTest
      } = req.body;

      // Validate targeting
      if (targetUsers.length === 0 && targetRoles.length === 0 && targetTeams.length === 0 && targetSegments.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one targeting option must be specified'
        });
      }

      // Create notification
      const notification = new Notification({
        title,
        message,
        type,
        priority,
        targetUsers,
        targetRoles,
        targetTeams,
        targetSegments,
        channels,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        richContent,
        abTest,
        createdBy: req.admin._id,
        status: scheduledFor ? 'scheduled' : 'draft'
      });

      await notification.save();

      // Log notification creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'notification_create',
        resource: 'notification',
        resourceId: notification._id.toString(),
        details: {
          title,
          type,
          priority,
          channels,
          targetCount: targetUsers.length + targetRoles.length + targetTeams.length + targetSegments.length
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.status(201).json({
        success: true,
        message: 'Notification created successfully',
        data: { notification }
      });
    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update notification
  static async updateNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      // Don't allow updating sent notifications
      if (notification.status === 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update sent notifications'
        });
      }

      // Update notification
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          notification[key] = updateData[key];
        }
      });

      await notification.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'notification_update',
        resource: 'notification',
        resourceId: notification._id.toString(),
        details: {
          updatedFields: Object.keys(updateData)
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Notification updated successfully',
        data: { notification }
      });
    } catch (error) {
      console.error('Update notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Send notification
  static async sendNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      if (notification.status !== 'draft' && notification.status !== 'scheduled') {
        return res.status(400).json({
          success: false,
          message: 'Notification is not in a sendable state'
        });
      }

      // Update status to sending
      notification.status = 'sending';
      await notification.save();

      // TODO: Implement actual sending logic
      // This would integrate with email services, push notification services, etc.
      
      // Simulate sending process
      setTimeout(async () => {
        try {
          notification.status = 'sent';
          notification.sentAt = new Date();
          notification.deliveredCount = notification.targetUsers.length;
          await notification.save();

          // Log sending
          await AuditLog.create({
            adminId: req.admin._id,
            adminEmail: req.admin.email,
            action: 'notification_send',
            resource: 'notification',
            resourceId: notification._id.toString(),
            details: {
              title: notification.title,
              channels: notification.channels,
              deliveredCount: notification.deliveredCount
            },
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            riskLevel: 'medium',
            isSensitive: false
          });
        } catch (error) {
          console.error('Error completing notification send:', error);
        }
      }, 2000); // Simulate 2 second sending time

      res.json({
        success: true,
        message: 'Notification sending initiated',
        data: { notification }
      });
    } catch (error) {
      console.error('Send notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Cancel notification
  static async cancelNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      if (notification.status === 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel sent notifications'
        });
      }

      notification.status = 'cancelled';
      await notification.save();

      // Log cancellation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'notification_cancel',
        resource: 'notification',
        resourceId: notification._id.toString(),
        details: {
          title: notification.title,
          previousStatus: 'scheduled'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Notification cancelled successfully',
        data: { notification }
      });
    } catch (error) {
      console.error('Cancel notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete notification
  static async deleteNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      if (notification.status === 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete sent notifications'
        });
      }

      await Notification.findByIdAndDelete(id);

      // Log deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'notification_delete',
        resource: 'notification',
        resourceId: notification._id.toString(),
        details: {
          title: notification.title,
          status: notification.status
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get notification analytics
  static async getNotificationAnalytics(req: AuthRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      let dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7d':
          dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
          break;
        case '30d':
          dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
          break;
        case '90d':
          dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
          break;
        case '1y':
          dateFilter = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
          break;
      }

      const stats = await Notification.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            sentNotifications: {
              $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
            },
            totalDelivered: { $sum: '$deliveredCount' },
            totalRead: { $sum: '$readCount' },
            totalClicks: { $sum: '$clickCount' },
            avgDeliveryRate: { $avg: '$analytics.deliveryRate' },
            avgOpenRate: { $avg: '$analytics.openRate' },
            avgClickRate: { $avg: '$analytics.clickRate' },
            avgConversionRate: { $avg: '$analytics.conversionRate' }
          }
        }
      ]);

      const typeBreakdown = await Notification.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgDeliveryRate: { $avg: '$analytics.deliveryRate' },
            avgOpenRate: { $avg: '$analytics.openRate' }
          }
        }
      ]);

      const channelBreakdown = await Notification.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $unwind: '$channels'
        },
        {
          $group: {
            _id: '$channels',
            count: { $sum: 1 },
            avgDeliveryRate: { $avg: '$analytics.deliveryRate' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalNotifications: 0,
            sentNotifications: 0,
            totalDelivered: 0,
            totalRead: 0,
            totalClicks: 0,
            avgDeliveryRate: 0,
            avgOpenRate: 0,
            avgClickRate: 0,
            avgConversionRate: 0
          },
          typeBreakdown,
          channelBreakdown,
          period
        }
      });
    } catch (error) {
      console.error('Get notification analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateNotifications(req: AuthRequest, res: Response) {
    try {
      const { notificationIds, operation, updates } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Notification IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'send':
          result = await Notification.updateMany(
            { _id: { $in: notificationIds }, status: { $in: ['draft', 'scheduled'] } },
            { $set: { status: 'sending' } }
          );
          break;
        case 'cancel':
          result = await Notification.updateMany(
            { _id: { $in: notificationIds }, status: { $in: ['draft', 'scheduled', 'sending'] } },
            { $set: { status: 'cancelled' } }
          );
          break;
        case 'delete':
          result = await Notification.deleteMany(
            { _id: { $in: notificationIds }, status: { $ne: 'sent' } }
          );
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid operation'
          });
      }

      // Log bulk operation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: `notification_bulk_${operation}`,
        resource: 'notification',
        resourceId: 'bulk',
        details: {
          notificationIds,
          operation,
          updates,
          affectedCount: result.modifiedCount || result.deletedCount
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: {
          affectedCount: result.modifiedCount || result.deletedCount,
          totalRequested: notificationIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
