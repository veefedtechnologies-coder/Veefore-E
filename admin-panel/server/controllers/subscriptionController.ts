import { Request, Response } from 'express';
import Subscription from '../models/Subscription';
import Coupon from '../models/Coupon';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class SubscriptionController {
  // Get all subscriptions with filtering
  static async getSubscriptions(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        plan,
        region,
        billingCycle
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { planName: { $regex: q, $options: 'i' } },
          { 'billing.billingAddress.city': { $regex: q, $options: 'i' } },
          { 'billing.billingAddress.country': { $regex: q, $options: 'i' } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Plan filter
      if (plan) {
        query.planName = plan;
      }

      // Region filter
      if (region) {
        query['pricing.region'] = region;
      }

      // Billing cycle filter
      if (billingCycle) {
        query['pricing.billingCycle'] = billingCycle;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const subscriptions = await Subscription.find(query)
        .populate('userId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Subscription.countDocuments(query);

      // Get subscription statistics
      const stats = await Subscription.getSubscriptionStats('30d');

      res.json({
        success: true,
        data: {
          subscriptions,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          },
          stats
        }
      });
    } catch (error) {
      console.error('Get subscriptions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get subscription by ID
  static async getSubscriptionById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const subscription = await Subscription.findById(id)
        .populate('userId', 'firstName lastName email subscription')
        .populate('createdBy', 'firstName lastName email')
        .populate('discounts.couponId', 'code name discount');
      
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      res.json({
        success: true,
        data: { subscription }
      });
    } catch (error) {
      console.error('Get subscription by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new subscription
  static async createSubscription(req: AuthRequest, res: Response) {
    try {
      const {
        userId,
        planId,
        planName,
        pricing,
        features,
        billing,
        metadata = {},
        trialDays = 0
      } = req.body;

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user already has an active subscription
      const existingSubscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing'] }
      });

      if (existingSubscription) {
        return res.status(400).json({
          success: false,
          message: 'User already has an active subscription'
        });
      }

      // Calculate period end date
      const now = new Date();
      let periodEnd = new Date(now);
      
      if (pricing.billingCycle === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else if (pricing.billingCycle === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else if (pricing.billingCycle === 'lifetime') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 100); // 100 years
      }

      // Calculate trial end date if applicable
      let trialEndsAt;
      if (trialDays > 0) {
        trialEndsAt = new Date(now);
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
      }

      // Create subscription
      const subscription = new Subscription({
        userId,
        planId,
        planName,
        pricing: {
          ...pricing,
          finalPrice: pricing.basePrice * (pricing.regionMultiplier || 1.0)
        },
        features: {
          ...features,
          credits: {
            ...features.credits,
            remaining: features.credits.included
          }
        },
        billing: {
          ...billing,
          nextBillingDate: periodEnd
        },
        status: trialDays > 0 ? 'trialing' : 'active',
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        usage: {
          creditsUsed: 0,
          apiCalls: 0,
          storageUsed: 0,
          lastResetDate: now,
          nextResetDate: periodEnd
        },
        metadata: {
          source: 'admin',
          ...metadata
        },
        createdBy: req.admin._id
      });

      await subscription.save();

      // Update user's subscription info
      user.subscription = {
        plan: planName,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      };
      await user.save();

      // Log subscription creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'subscription_create',
        resource: 'subscription',
        resourceId: subscription._id.toString(),
        details: {
          userId,
          planName,
          pricing: subscription.pricing,
          trialDays
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: { subscription }
      });
    } catch (error) {
      console.error('Create subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update subscription
  static async updateSubscription(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      // Store old data for audit
      const oldData = {
        planName: subscription.planName,
        status: subscription.status,
        pricing: subscription.pricing
      };

      // Update subscription
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          subscription[key] = updateData[key];
        }
      });

      await subscription.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'subscription_update',
        resource: 'subscription',
        resourceId: subscription._id.toString(),
        details: {
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
        message: 'Subscription updated successfully',
        data: { subscription }
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Cancel subscription
  static async cancelSubscription(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason = 'Admin cancellation', immediate = false } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status === 'canceled') {
        return res.status(400).json({
          success: false,
          message: 'Subscription is already canceled'
        });
      }

      if (immediate) {
        subscription.status = 'canceled';
        subscription.canceledAt = new Date();
        subscription.endedAt = new Date();
      } else {
        subscription.cancelAtPeriodEnd = true;
        subscription.canceledAt = new Date();
      }

      // Add to change history
      subscription.changes.push({
        fromPlan: subscription.planName,
        toPlan: 'canceled',
        reason,
        changedAt: new Date(),
        changedBy: req.admin._id
      });

      await subscription.save();

      // Update user's subscription status
      const user = await User.findById(subscription.userId);
      if (user) {
        user.subscription.status = subscription.status;
        user.subscription.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
        await user.save();
      }

      // Log cancellation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'subscription_cancel',
        resource: 'subscription',
        resourceId: subscription._id.toString(),
        details: {
          reason,
          immediate,
          planName: subscription.planName
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Subscription canceled successfully',
        data: { subscription }
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Reactivate subscription
  static async reactivateSubscription(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason = 'Admin reactivation' } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status !== 'canceled') {
        return res.status(400).json({
          success: false,
          message: 'Subscription is not canceled'
        });
      }

      subscription.status = 'active';
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = undefined;
      subscription.endedAt = undefined;

      // Add to change history
      subscription.changes.push({
        fromPlan: 'canceled',
        toPlan: subscription.planName,
        reason,
        changedAt: new Date(),
        changedBy: req.admin._id
      });

      await subscription.save();

      // Update user's subscription status
      const user = await User.findById(subscription.userId);
      if (user) {
        user.subscription.status = subscription.status;
        user.subscription.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
        await user.save();
      }

      // Log reactivation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'subscription_reactivate',
        resource: 'subscription',
        resourceId: subscription._id.toString(),
        details: {
          reason,
          planName: subscription.planName
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Subscription reactivated successfully',
        data: { subscription }
      });
    } catch (error) {
      console.error('Reactivate subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Apply coupon to subscription
  static async applyCoupon(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { couponCode } = req.body;

      const subscription = await Subscription.findById(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
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

      // Check if coupon is already applied
      const existingDiscount = subscription.discounts.find(
        d => d.couponId.toString() === coupon._id.toString()
      );

      if (existingDiscount) {
        return res.status(400).json({
          success: false,
          message: 'Coupon already applied to this subscription'
        });
      }

      // Check usage limits
      if (coupon.analytics.totalRedemptions >= coupon.limits.maxUses) {
        return res.status(400).json({
          success: false,
          message: 'Coupon usage limit exceeded'
        });
      }

      // Apply discount
      await subscription.applyDiscount(coupon);

      // Update coupon analytics
      coupon.analytics.totalRedemptions += 1;
      coupon.analytics.uniqueUsers += 1;
      await coupon.save();

      // Log coupon application
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'subscription_coupon_apply',
        resource: 'subscription',
        resourceId: subscription._id.toString(),
        details: {
          couponCode,
          couponId: coupon._id,
          discountType: coupon.discount.type,
          discountValue: coupon.discount.value
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Coupon applied successfully',
        data: { subscription }
      });
    } catch (error) {
      console.error('Apply coupon error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get subscription analytics
  static async getSubscriptionAnalytics(req: AuthRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      const stats = await Subscription.getSubscriptionStats(period as string);

      res.json({
        success: true,
        data: {
          ...stats,
          period
        }
      });
    } catch (error) {
      console.error('Get subscription analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get region-based pricing
  static async getRegionPricing(req: AuthRequest, res: Response) {
    try {
      const { planId } = req.params;
      const { region = 'US' } = req.query;

      // This would typically fetch from a pricing configuration
      // For now, we'll return a mock response
      const regionMultipliers = {
        'US': 1.0,
        'EU': 1.1,
        'UK': 1.15,
        'CA': 1.05,
        'AU': 1.2,
        'IN': 0.3,
        'BR': 0.4,
        'MX': 0.5
      };

      const basePrice = 29.99; // Monthly price
      const multiplier = regionMultipliers[region as keyof typeof regionMultipliers] || 1.0;
      const finalPrice = basePrice * multiplier;

      res.json({
        success: true,
        data: {
          planId,
          region,
          basePrice,
          regionMultiplier: multiplier,
          finalPrice,
          currency: 'USD'
        }
      });
    } catch (error) {
      console.error('Get region pricing error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateSubscriptions(req: AuthRequest, res: Response) {
    try {
      const { subscriptionIds, operation, updates } = req.body;

      if (!subscriptionIds || !Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Subscription IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'cancel':
          result = await Subscription.updateMany(
            { _id: { $in: subscriptionIds }, status: { $ne: 'canceled' } },
            {
              $set: {
                status: 'canceled',
                canceledAt: new Date(),
                endedAt: new Date()
              }
            }
          );
          break;
        case 'pause':
          result = await Subscription.updateMany(
            { _id: { $in: subscriptionIds }, status: 'active' },
            { $set: { status: 'paused' } }
          );
          break;
        case 'resume':
          result = await Subscription.updateMany(
            { _id: { $in: subscriptionIds }, status: 'paused' },
            { $set: { status: 'active' } }
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
        action: `subscription_bulk_${operation}`,
        resource: 'subscription',
        resourceId: 'bulk',
        details: {
          subscriptionIds,
          operation,
          updates,
          affectedCount: result.modifiedCount
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: {
          affectedCount: result.modifiedCount,
          totalRequested: subscriptionIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update subscriptions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
