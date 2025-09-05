import { Request, Response } from 'express';
import Coupon from '../models/Coupon';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class CouponController {
  // Get all coupons with filtering
  static async getCoupons(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        type,
        campaign
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { code: { $regex: q, $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Type filter
      if (type) {
        query['discount.type'] = type;
      }

      // Campaign filter
      if (campaign) {
        query['campaign.name'] = { $regex: campaign, $options: 'i' };
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const coupons = await Coupon.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Coupon.countDocuments(query);

      res.json({
        success: true,
        data: {
          coupons,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get coupons error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get coupon by ID
  static async getCouponById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const coupon = await Coupon.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email');
      
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      res.json({
        success: true,
        data: { coupon }
      });
    } catch (error) {
      console.error('Get coupon by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new coupon
  static async createCoupon(req: AuthRequest, res: Response) {
    try {
      const {
        code,
        name,
        description,
        discount,
        target,
        scope,
        limits,
        validity,
        stacking,
        campaign,
        alerts,
        automation,
        isPublic = true
      } = req.body;

      // Check if coupon code already exists
      const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }

      // Create coupon
      const coupon = new Coupon({
        code: code.toUpperCase(),
        name,
        description,
        discount,
        target,
        scope,
        limits,
        validity: {
          ...validity,
          startDate: new Date(validity.startDate),
          endDate: new Date(validity.endDate)
        },
        stacking,
        campaign,
        alerts,
        automation,
        isPublic,
        createdBy: req.admin._id,
        lastModifiedBy: req.admin._id
      });

      await coupon.save();

      // Log coupon creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_create',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          code: coupon.code,
          name: coupon.name,
          discountType: coupon.discount.type,
          discountValue: coupon.discount.value,
          isPublic: coupon.isPublic
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Create coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update coupon
  static async updateCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Don't allow updating sent coupons
      if (coupon.status === 'expired' && updateData.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update expired coupons'
        });
      }

      // Store old data for audit
      const oldData = {
        code: coupon.code,
        name: coupon.name,
        discount: coupon.discount,
        status: coupon.status
      };

      // Update coupon
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          coupon[key] = updateData[key];
        }
      });

      coupon.lastModifiedBy = req.admin._id;
      await coupon.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_update',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          oldData,
          newData: updateData
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon updated successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Update coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Activate coupon
  static async activateCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      if (coupon.status === 'active') {
        return res.status(400).json({
          success: false,
          message: 'Coupon is already active'
        });
      }

      coupon.status = 'active';
      coupon.lastModifiedBy = req.admin._id;
      await coupon.save();

      // Log activation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_activate',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          code: coupon.code,
          previousStatus: 'draft'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon activated successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Activate coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Pause coupon
  static async pauseCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      if (coupon.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not active'
        });
      }

      coupon.status = 'paused';
      coupon.lastModifiedBy = req.admin._id;
      await coupon.save();

      // Log pause
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_pause',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          code: coupon.code
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon paused successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Pause coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Archive coupon
  static async archiveCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      coupon.status = 'archived';
      coupon.lastModifiedBy = req.admin._id;
      await coupon.save();

      // Log archive
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_archive',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          code: coupon.code
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon archived successfully',
        data: { coupon }
      });
    } catch (error) {
      console.error('Archive coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete coupon
  static async deleteCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      if (coupon.analytics.totalRedemptions > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete coupon with redemptions. Archive instead.'
        });
      }

      await Coupon.findByIdAndDelete(id);

      // Log deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'coupon_delete',
        resource: 'coupon',
        resourceId: coupon._id.toString(),
        details: {
          code: coupon.code,
          name: coupon.name
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon deleted successfully'
      });
    } catch (error) {
      console.error('Delete coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get coupon analytics
  static async getCouponAnalytics(req: AuthRequest, res: Response) {
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

      const stats = await Coupon.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalCoupons: { $sum: 1 },
            activeCoupons: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalRedemptions: { $sum: '$analytics.totalRedemptions' },
            totalRevenue: { $sum: '$analytics.revenueGenerated' },
            avgConversionRate: { $avg: '$analytics.conversionRate' },
            avgOrderValue: { $avg: '$analytics.avgOrderValue' }
          }
        }
      ]);

      const typeBreakdown = await Coupon.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$discount.type',
            count: { $sum: 1 },
            totalRedemptions: { $sum: '$analytics.totalRedemptions' },
            avgConversionRate: { $avg: '$analytics.conversionRate' }
          }
        }
      ]);

      const campaignBreakdown = await Coupon.aggregate([
        {
          $match: {
            createdAt: dateFilter,
            'campaign.name': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$campaign.name',
            count: { $sum: 1 },
            totalRedemptions: { $sum: '$analytics.totalRedemptions' },
            totalRevenue: { $sum: '$analytics.revenueGenerated' }
          }
        },
        {
          $sort: { totalRevenue: -1 }
        }
      ]);

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalCoupons: 0,
            activeCoupons: 0,
            totalRedemptions: 0,
            totalRevenue: 0,
            avgConversionRate: 0,
            avgOrderValue: 0
          },
          typeBreakdown,
          campaignBreakdown,
          period
        }
      });
    } catch (error) {
      console.error('Get coupon analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Generate QR code for coupon
  static async generateQRCode(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { format = 'png' } = req.query;

      const coupon = await Coupon.findById(id);
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Generate QR code URL (this would integrate with a QR code service)
      const qrUrl = `${process.env.FRONTEND_URL}/redeem?code=${coupon.code}`;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`;

      // Update coupon with QR code info
      coupon.qrCode = {
        url: qrUrl,
        imageUrl: qrImageUrl,
        format: format as 'png' | 'svg' | 'pdf'
      };
      await coupon.save();

      res.json({
        success: true,
        message: 'QR code generated successfully',
        data: {
          qrCode: coupon.qrCode
        }
      });
    } catch (error) {
      console.error('Generate QR code error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Test coupon validity
  static async testCoupon(req: AuthRequest, res: Response) {
    try {
      const { code, userId, orderValue, region } = req.body;

      const coupon = await Coupon.findOne({ 
        code: code.toUpperCase(),
        status: 'active',
        isPublic: true,
        'validity.startDate': { $lte: new Date() },
        'validity.endDate': { $gte: new Date() }
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired coupon'
        });
      }

      // Check usage limits
      if (coupon.analytics.totalRedemptions >= coupon.limits.maxUses) {
        return res.status(400).json({
          success: false,
          message: 'Coupon usage limit exceeded'
        });
      }

      // Check order value limits
      if (coupon.limits.minOrderValue && orderValue < coupon.limits.minOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Minimum order value of ${coupon.limits.minOrderValue} required`
        });
      }

      if (coupon.limits.maxOrderValue && orderValue > coupon.limits.maxOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Maximum order value of ${coupon.limits.maxOrderValue} exceeded`
        });
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (coupon.discount.type === 'percentage') {
        discountAmount = (orderValue * coupon.discount.value) / 100;
        if (coupon.discount.maxDiscount) {
          discountAmount = Math.min(discountAmount, coupon.discount.maxDiscount);
        }
      } else if (coupon.discount.type === 'fixed') {
        discountAmount = coupon.discount.value;
      }

      res.json({
        success: true,
        message: 'Coupon is valid',
        data: {
          coupon: {
            id: coupon._id,
            code: coupon.code,
            name: coupon.name,
            discountType: coupon.discount.type,
            discountValue: coupon.discount.value,
            discountAmount,
            finalAmount: orderValue - discountAmount
          }
        }
      });
    } catch (error) {
      console.error('Test coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateCoupons(req: AuthRequest, res: Response) {
    try {
      const { couponIds, operation, updates } = req.body;

      if (!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Coupon IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'activate':
          result = await Coupon.updateMany(
            { _id: { $in: couponIds }, status: 'draft' },
            { 
              $set: { 
                status: 'active',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        case 'pause':
          result = await Coupon.updateMany(
            { _id: { $in: couponIds }, status: 'active' },
            { 
              $set: { 
                status: 'paused',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        case 'archive':
          result = await Coupon.updateMany(
            { _id: { $in: couponIds }, status: { $ne: 'archived' } },
            { 
              $set: { 
                status: 'archived',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        case 'delete':
          result = await Coupon.deleteMany(
            { 
              _id: { $in: couponIds }, 
              'analytics.totalRedemptions': 0 
            }
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
        action: `coupon_bulk_${operation}`,
        resource: 'coupon',
        resourceId: 'bulk',
        details: {
          couponIds,
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
          totalRequested: couponIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update coupons error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
