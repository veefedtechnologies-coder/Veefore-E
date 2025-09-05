import { Request, Response } from 'express';
import MaintenanceBanner from '../models/MaintenanceBanner';
import { AuthRequest } from '../middleware/auth';

export class MaintenanceBannerController {
  // Get all maintenance banners
  static async getBanners(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        type,
        priority,
        isActive,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build filter query
      const filter: any = {};

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { message: { $regex: search, $options: 'i' } }
        ];
      }

      if (type) {
        filter.type = type;
      }

      if (priority) {
        filter.priority = priority;
      }

      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      const banners = await MaintenanceBanner.find(filter)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

      const total = await MaintenanceBanner.countDocuments(filter);

      res.json({
        success: true,
        data: {
          banners,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching maintenance banners:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch maintenance banners'
      });
    }
  }

  // Get active banners for display
  static async getActiveBanners(req: AuthRequest, res: Response) {
    try {
      const { userId, roles } = req.query;
      const now = new Date();

      // Build filter for active banners
      const filter: any = {
        isActive: true,
        $or: [
          { startDate: { $exists: false } },
          { startDate: { $lte: now } }
        ],
        $or: [
          { endDate: { $exists: false } },
          { endDate: { $gte: now } }
        ]
      };

      // Filter by target audience
      if (roles) {
        const roleArray = Array.isArray(roles) ? roles : [roles];
        filter.$or = [
          { 'targetAudience.type': 'all' },
          { 
            'targetAudience.type': 'specific_roles',
            'targetAudience.roles': { $in: roleArray }
          }
        ];

        if (userId) {
          filter.$or.push({
            'targetAudience.type': 'specific_users',
            'targetAudience.userIds': userId
          });
        }
      }

      const banners = await MaintenanceBanner.find(filter)
        .sort({ priority: 1, createdAt: -1 });

      // Update view statistics
      for (const banner of banners) {
        banner.stats.views += 1;
        banner.stats.lastViewedAt = new Date();
        await banner.save();
      }

      res.json({
        success: true,
        data: banners
      });
    } catch (error) {
      console.error('Error fetching active banners:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active banners'
      });
    }
  }

  // Get banner by ID
  static async getBannerById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const banner = await MaintenanceBanner.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email');

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      res.json({
        success: true,
        data: banner
      });
    } catch (error) {
      console.error('Error fetching maintenance banner:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch maintenance banner'
      });
    }
  }

  // Create maintenance banner
  static async createBanner(req: AuthRequest, res: Response) {
    try {
      const bannerData = {
        ...req.body,
        createdBy: req.admin!._id,
        updatedBy: req.admin!._id
      };

      const banner = new MaintenanceBanner(bannerData);
      await banner.save();

      res.status(201).json({
        success: true,
        message: 'Maintenance banner created successfully',
        data: banner
      });
    } catch (error) {
      console.error('Error creating maintenance banner:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create maintenance banner'
      });
    }
  }

  // Update maintenance banner
  static async updateBanner(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updatedBy: req.admin!._id
      };

      const banner = await MaintenanceBanner.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      res.json({
        success: true,
        message: 'Maintenance banner updated successfully',
        data: banner
      });
    } catch (error) {
      console.error('Error updating maintenance banner:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update maintenance banner'
      });
    }
  }

  // Delete maintenance banner
  static async deleteBanner(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const banner = await MaintenanceBanner.findByIdAndDelete(id);

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      res.json({
        success: true,
        message: 'Maintenance banner deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting maintenance banner:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete maintenance banner'
      });
    }
  }

  // Toggle banner status
  static async toggleBannerStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const banner = await MaintenanceBanner.findByIdAndUpdate(
        id,
        { 
          isActive,
          updatedBy: req.admin!._id
        },
        { new: true }
      );

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      res.json({
        success: true,
        message: `Banner ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: banner
      });
    } catch (error) {
      console.error('Error toggling banner status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle banner status'
      });
    }
  }

  // Record banner interaction
  static async recordInteraction(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { action } = req.body; // 'dismiss', 'click', etc.

      const banner = await MaintenanceBanner.findById(id);
      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      // Update statistics based on action
      switch (action) {
        case 'dismiss':
          banner.stats.dismissals += 1;
          break;
        case 'click':
          banner.stats.clicks += 1;
          break;
      }

      await banner.save();

      res.json({
        success: true,
        message: 'Interaction recorded successfully'
      });
    } catch (error) {
      console.error('Error recording banner interaction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to record interaction'
      });
    }
  }

  // Get banner statistics
  static async getBannerStats(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const banner = await MaintenanceBanner.findById(id);
      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Maintenance banner not found'
        });
      }

      const stats = {
        views: banner.stats.views,
        dismissals: banner.stats.dismissals,
        clicks: banner.stats.clicks,
        lastViewedAt: banner.stats.lastViewedAt,
        dismissalRate: banner.stats.views > 0 ? (banner.stats.dismissals / banner.stats.views) * 100 : 0,
        clickRate: banner.stats.views > 0 ? (banner.stats.clicks / banner.stats.views) * 100 : 0
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching banner stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch banner statistics'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateBanners(req: AuthRequest, res: Response) {
    try {
      const { bannerIds, action, data } = req.body;

      if (!bannerIds || !Array.isArray(bannerIds) || bannerIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Banner IDs are required'
        });
      }

      let updateData: any = {
        updatedBy: req.admin!._id
      };

      switch (action) {
        case 'activate':
          updateData.isActive = true;
          break;
        case 'deactivate':
          updateData.isActive = false;
          break;
        case 'delete':
          await MaintenanceBanner.deleteMany({ _id: { $in: bannerIds } });
          return res.json({
            success: true,
            message: `${bannerIds.length} banners deleted successfully`
          });
        case 'update':
          updateData = { ...updateData, ...data };
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid action'
          });
      }

      const result = await MaintenanceBanner.updateMany(
        { _id: { $in: bannerIds } },
        updateData
      );

      res.json({
        success: true,
        message: `${result.modifiedCount} banners updated successfully`
      });
    } catch (error) {
      console.error('Error bulk updating banners:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk update banners'
      });
    }
  }
}
