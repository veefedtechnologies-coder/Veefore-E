import { Request, Response } from 'express';
import Popup from '../models/Popup';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class PopupController {
  // Get all popups with filtering
  static async getPopups(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        type,
        isActive
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { title: { $regex: q, $options: 'i' } },
          { content: { $regex: q, $options: 'i' } }
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

      // Active filter
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const popups = await Popup.find(query)
        .populate('createdBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Popup.countDocuments(query);

      res.json({
        success: true,
        data: {
          popups,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get popups error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get popup by ID
  static async getPopupById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const popup = await Popup.findById(id)
        .populate('createdBy', 'firstName lastName email');
      
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      res.json({
        success: true,
        data: { popup }
      });
    } catch (error) {
      console.error('Get popup by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new popup
  static async createPopup(req: AuthRequest, res: Response) {
    try {
      const {
        title,
        content,
        type = 'modal',
        position = 'center',
        displayRules = {},
        scheduling = {},
        abTest = { enabled: false, variants: [] },
        design = {},
        actions = [],
        advanced = {}
      } = req.body;

      // Create popup
      const popup = new Popup({
        title,
        content,
        type,
        position,
        displayRules: {
          pages: displayRules.pages || [],
          userSegments: displayRules.userSegments || [],
          userRoles: displayRules.userRoles || [],
          devices: displayRules.devices || ['desktop', 'mobile', 'tablet'],
          browsers: displayRules.browsers || [],
          countries: displayRules.countries || [],
          languages: displayRules.languages || []
        },
        scheduling: {
          startDate: scheduling.startDate ? new Date(scheduling.startDate) : undefined,
          endDate: scheduling.endDate ? new Date(scheduling.endDate) : undefined,
          timezone: scheduling.timezone || 'UTC',
          frequency: scheduling.frequency || 'once',
          maxDisplays: scheduling.maxDisplays || 1,
          cooldown: scheduling.cooldown || 24
        },
        abTest,
        design: {
          backgroundColor: design.backgroundColor || '#ffffff',
          textColor: design.textColor || '#000000',
          borderColor: design.borderColor,
          borderRadius: design.borderRadius || 8,
          padding: design.padding || 20,
          fontSize: design.fontSize || 16,
          fontFamily: design.fontFamily || 'Arial, sans-serif',
          customCSS: design.customCSS
        },
        actions,
        advanced: {
          triggerDelay: advanced.triggerDelay || 0,
          exitIntent: advanced.exitIntent || false,
          scrollTrigger: advanced.scrollTrigger || 0,
          timeOnPage: advanced.timeOnPage || 0,
          customTrigger: advanced.customTrigger
        },
        createdBy: req.admin._id,
        status: 'draft',
        isActive: false
      });

      await popup.save();

      // Log popup creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_create',
        resource: 'popup',
        resourceId: popup._id.toString(),
        details: {
          title,
          type,
          position,
          abTestEnabled: abTest.enabled
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.status(201).json({
        success: true,
        message: 'Popup created successfully',
        data: { popup }
      });
    } catch (error) {
      console.error('Create popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update popup
  static async updatePopup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const popup = await Popup.findById(id);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      // Update popup
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          popup[key] = updateData[key];
        }
      });

      await popup.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_update',
        resource: 'popup',
        resourceId: popup._id.toString(),
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
        message: 'Popup updated successfully',
        data: { popup }
      });
    } catch (error) {
      console.error('Update popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Activate popup
  static async activatePopup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const popup = await Popup.findById(id);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      if (popup.status !== 'draft' && popup.status !== 'paused') {
        return res.status(400).json({
          success: false,
          message: 'Popup is not in an activatable state'
        });
      }

      popup.status = 'active';
      popup.isActive = true;
      await popup.save();

      // Log activation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_activate',
        resource: 'popup',
        resourceId: popup._id.toString(),
        details: {
          title: popup.title,
          type: popup.type
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Popup activated successfully',
        data: { popup }
      });
    } catch (error) {
      console.error('Activate popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Pause popup
  static async pausePopup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const popup = await Popup.findById(id);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      if (popup.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Popup is not active'
        });
      }

      popup.status = 'paused';
      popup.isActive = false;
      await popup.save();

      // Log pause
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_pause',
        resource: 'popup',
        resourceId: popup._id.toString(),
        details: {
          title: popup.title,
          type: popup.type
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Popup paused successfully',
        data: { popup }
      });
    } catch (error) {
      console.error('Pause popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Archive popup
  static async archivePopup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const popup = await Popup.findById(id);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      popup.status = 'archived';
      popup.isActive = false;
      await popup.save();

      // Log archive
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_archive',
        resource: 'popup',
        resourceId: popup._id.toString(),
        details: {
          title: popup.title,
          type: popup.type
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Popup archived successfully',
        data: { popup }
      });
    } catch (error) {
      console.error('Archive popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete popup
  static async deletePopup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const popup = await Popup.findById(id);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      if (popup.status === 'active') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete active popups. Please pause or archive first.'
        });
      }

      await Popup.findByIdAndDelete(id);

      // Log deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'popup_delete',
        resource: 'popup',
        resourceId: popup._id.toString(),
        details: {
          title: popup.title,
          type: popup.type,
          status: popup.status
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Popup deleted successfully'
      });
    } catch (error) {
      console.error('Delete popup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get popup analytics
  static async getPopupAnalytics(req: AuthRequest, res: Response) {
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

      const stats = await Popup.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalPopups: { $sum: 1 },
            activePopups: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalImpressions: { $sum: '$analytics.impressions' },
            totalClicks: { $sum: '$analytics.clicks' },
            totalConversions: { $sum: '$analytics.conversions' },
            totalDismissals: { $sum: '$analytics.dismissals' },
            avgClickRate: { $avg: '$analytics.clickRate' },
            avgConversionRate: { $avg: '$analytics.conversionRate' }
          }
        }
      ]);

      const typeBreakdown = await Popup.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgClickRate: { $avg: '$analytics.clickRate' },
            avgConversionRate: { $avg: '$analytics.conversionRate' }
          }
        }
      ]);

      const statusBreakdown = await Popup.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalImpressions: { $sum: '$analytics.impressions' },
            totalClicks: { $sum: '$analytics.clicks' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalPopups: 0,
            activePopups: 0,
            totalImpressions: 0,
            totalClicks: 0,
            totalConversions: 0,
            totalDismissals: 0,
            avgClickRate: 0,
            avgConversionRate: 0
          },
          typeBreakdown,
          statusBreakdown,
          period
        }
      });
    } catch (error) {
      console.error('Get popup analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdatePopups(req: AuthRequest, res: Response) {
    try {
      const { popupIds, operation, updates } = req.body;

      if (!popupIds || !Array.isArray(popupIds) || popupIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Popup IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'activate':
          result = await Popup.updateMany(
            { _id: { $in: popupIds }, status: { $in: ['draft', 'paused'] } },
            { $set: { status: 'active', isActive: true } }
          );
          break;
        case 'pause':
          result = await Popup.updateMany(
            { _id: { $in: popupIds }, status: 'active' },
            { $set: { status: 'paused', isActive: false } }
          );
          break;
        case 'archive':
          result = await Popup.updateMany(
            { _id: { $in: popupIds }, status: { $ne: 'archived' } },
            { $set: { status: 'archived', isActive: false } }
          );
          break;
        case 'delete':
          result = await Popup.deleteMany(
            { _id: { $in: popupIds }, status: { $ne: 'active' } }
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
        action: `popup_bulk_${operation}`,
        resource: 'popup',
        resourceId: 'bulk',
        details: {
          popupIds,
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
          totalRequested: popupIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update popups error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get active popups for frontend
  static async getActivePopups(req: Request, res: Response) {
    try {
      const { page, userSegment, userRole, device, browser, country, language } = req.query;

      const query: any = {
        status: 'active',
        isActive: true,
        $or: [
          { 'scheduling.startDate': { $lte: new Date() } },
          { 'scheduling.startDate': { $exists: false } }
        ],
        $or: [
          { 'scheduling.endDate': { $gte: new Date() } },
          { 'scheduling.endDate': { $exists: false } }
        ]
      };

      // Apply targeting filters
      if (userSegment) {
        query.$or = [
          { 'displayRules.userSegments': { $in: [userSegment] } },
          { 'displayRules.userSegments': { $size: 0 } }
        ];
      }

      if (userRole) {
        query.$or = [
          { 'displayRules.userRoles': { $in: [userRole] } },
          { 'displayRules.userRoles': { $size: 0 } }
        ];
      }

      if (device) {
        query['displayRules.devices'] = { $in: [device] };
      }

      if (browser) {
        query['displayRules.browsers'] = { $in: [browser] };
      }

      if (country) {
        query['displayRules.countries'] = { $in: [country] };
      }

      if (language) {
        query['displayRules.languages'] = { $in: [language] };
      }

      const popups = await Popup.find(query)
        .select('-analytics -createdBy -createdAt -updatedAt')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: { popups }
      });
    } catch (error) {
      console.error('Get active popups error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Track popup interaction
  static async trackPopupInteraction(req: Request, res: Response) {
    try {
      const { popupId, interaction } = req.body;

      const popup = await Popup.findById(popupId);
      if (!popup) {
        return res.status(404).json({
          success: false,
          message: 'Popup not found'
        });
      }

      // Update analytics based on interaction type
      switch (interaction) {
        case 'impression':
          popup.analytics.impressions += 1;
          break;
        case 'click':
          popup.analytics.clicks += 1;
          break;
        case 'conversion':
          popup.analytics.conversions += 1;
          break;
        case 'dismissal':
          popup.analytics.dismissals += 1;
          break;
      }

      // Recalculate rates
      if (popup.analytics.impressions > 0) {
        popup.analytics.clickRate = (popup.analytics.clicks / popup.analytics.impressions) * 100;
        popup.analytics.conversionRate = (popup.analytics.conversions / popup.analytics.impressions) * 100;
      }

      await popup.save();

      res.json({
        success: true,
        message: 'Interaction tracked successfully'
      });
    } catch (error) {
      console.error('Track popup interaction error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
