import { Request, Response } from 'express';
import Refund from '../models/Refund';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

export class RefundController {
  // Get all refunds with advanced filtering
  static async getRefunds(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        riskLevel,
        slaStatus,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        processor
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { transactionId: { $regex: q, $options: 'i' } },
          { reason: { $regex: q, $options: 'i' } },
          { 'evidence.notes': { $regex: q, $options: 'i' } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Risk level filter
      if (riskLevel) {
        query['risk.riskLevel'] = riskLevel;
      }

      // SLA status filter
      if (slaStatus) {
        const now = new Date();
        switch (slaStatus) {
          case 'breached':
            query['sla.isSlaBreached'] = true;
            break;
          case 'at_risk':
            query['sla.isSlaBreached'] = false;
            query['sla.resolutionDeadline'] = { $lt: now };
            break;
          case 'on_track':
            query['sla.isSlaBreached'] = false;
            query['sla.resolutionDeadline'] = { $gte: now };
            break;
        }
      }

      // Date range filter
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
          query.createdAt.$gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          query.createdAt.$lte = new Date(dateTo as string);
        }
      }

      // Amount range filter
      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) {
          query.amount.$gte = Number(minAmount);
        }
        if (maxAmount) {
          query.amount.$lte = Number(maxAmount);
        }
      }

      // Processor filter
      if (processor) {
        query['processing.processor'] = processor;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const refunds = await Refund.find(query)
        .populate('userId', 'firstName lastName email')
        .populate('approval.approvedBy', 'firstName lastName email')
        .populate('approval.rejectedBy', 'firstName lastName email')
        .populate('audit.createdBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Refund.countDocuments(query);

      // Get refund statistics
      const stats = await Refund.getRefundStats('30d');

      res.json({
        success: true,
        data: {
          refunds,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          },
          stats
        }
      });
    } catch (error) {
      console.error('Get refunds error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get refund by ID
  static async getRefundById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const refund = await Refund.findById(id)
        .populate('userId', 'firstName lastName email subscription credits')
        .populate('approval.approvedBy', 'firstName lastName email')
        .populate('approval.rejectedBy', 'firstName lastName email')
        .populate('audit.createdBy', 'firstName lastName email')
        .populate('audit.lastModifiedBy', 'firstName lastName email');
      
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: 'Refund not found'
        });
      }

      res.json({
        success: true,
        data: { refund }
      });
    } catch (error) {
      console.error('Get refund by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new refund
  static async createRefund(req: AuthRequest, res: Response) {
    try {
      const {
        userId,
        transactionId,
        originalTransactionId,
        amount,
        currency = 'USD',
        reason,
        type,
        method,
        processor = 'manual',
        evidence = {},
        adminNotes = ''
      } = req.body;

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if refund already exists for this transaction
      const existingRefund = await Refund.findOne({ transactionId });
      if (existingRefund) {
        return res.status(400).json({
          success: false,
          message: 'Refund already exists for this transaction'
        });
      }

      // Create refund
      const refund = new Refund({
        userId,
        transactionId,
        originalTransactionId,
        amount,
        currency,
        reason,
        type,
        method,
        processing: {
          processor,
          netAmount: amount
        },
        evidence: {
          ...evidence,
          adminNotes
        },
        audit: {
          createdBy: req.admin._id,
          lastModifiedBy: req.admin._id
        }
      });

      // Check eligibility
      await refund.checkEligibility();

      // Determine approval requirements based on amount and risk
      if (amount > 1000 || refund.risk.riskLevel === 'high' || refund.risk.riskLevel === 'critical') {
        refund.approval.requiresApproval = true;
        refund.approval.approvalLevel = amount > 5000 ? 3 : 2;
      }

      await refund.save();

      // Log refund creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'refund_create',
        resource: 'refund',
        resourceId: refund._id.toString(),
        details: {
          userId,
          transactionId,
          amount,
          reason,
          eligibility: refund.eligibility.isEligible,
          requiresApproval: refund.approval.requiresApproval
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.status(201).json({
        success: true,
        message: 'Refund created successfully',
        data: { refund }
      });
    } catch (error) {
      console.error('Create refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Approve refund
  static async approveRefund(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { adminNotes = '' } = req.body;

      const refund = await Refund.findById(id);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: 'Refund not found'
        });
      }

      if (refund.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Refund is not pending approval'
        });
      }

      // Check if admin has permission to approve at this level
      if (refund.approval.requiresApproval && req.admin.level > refund.approval.approvalLevel) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permission to approve this refund'
        });
      }

      // Update refund status
      refund.status = 'approved';
      refund.approval.approvedBy = req.admin._id;
      refund.approval.approvedAt = new Date();
      refund.evidence.adminNotes = adminNotes;

      // Add to audit trail
      refund.audit.changes.push({
        field: 'status',
        oldValue: 'pending',
        newValue: 'approved',
        changedBy: req.admin._id,
        changedAt: new Date(),
        reason: 'Refund approved by admin'
      });

      refund.audit.lastModifiedBy = req.admin._id;
      refund.audit.lastModifiedAt = new Date();
      refund.audit.version += 1;

      await refund.save();

      // Log approval
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'refund_approve',
        resource: 'refund',
        resourceId: refund._id.toString(),
        details: {
          refundId: refund._id,
          amount: refund.amount,
          userId: refund.userId,
          adminNotes
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Refund approved successfully',
        data: { refund }
      });
    } catch (error) {
      console.error('Approve refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Reject refund
  static async rejectRefund(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason, adminNotes = '' } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const refund = await Refund.findById(id);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: 'Refund not found'
        });
      }

      if (refund.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Refund is not pending approval'
        });
      }

      // Update refund status
      refund.status = 'rejected';
      refund.approval.rejectedBy = req.admin._id;
      refund.approval.rejectedAt = new Date();
      refund.approval.rejectionReason = reason;
      refund.evidence.adminNotes = adminNotes;

      // Add to audit trail
      refund.audit.changes.push({
        field: 'status',
        oldValue: 'pending',
        newValue: 'rejected',
        changedBy: req.admin._id,
        changedAt: new Date(),
        reason: `Refund rejected: ${reason}`
      });

      refund.audit.lastModifiedBy = req.admin._id;
      refund.audit.lastModifiedAt = new Date();
      refund.audit.version += 1;

      await refund.save();

      // Log rejection
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'refund_reject',
        resource: 'refund',
        resourceId: refund._id.toString(),
        details: {
          refundId: refund._id,
          amount: refund.amount,
          userId: refund.userId,
          reason,
          adminNotes
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Refund rejected successfully',
        data: { refund }
      });
    } catch (error) {
      console.error('Reject refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Process refund (execute the actual refund)
  static async processRefund(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { processorRefundId, processingFee = 0 } = req.body;

      const refund = await Refund.findById(id);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: 'Refund not found'
        });
      }

      if (refund.status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Refund must be approved before processing'
        });
      }

      // Update processing information
      refund.status = 'processing';
      refund.processing.processorRefundId = processorRefundId;
      refund.processing.processingFee = processingFee;
      refund.processing.netAmount = refund.amount - processingFee;
      refund.processing.processedAt = new Date();

      // Add to audit trail
      refund.audit.changes.push({
        field: 'status',
        oldValue: 'approved',
        newValue: 'processing',
        changedBy: req.admin._id,
        changedAt: new Date(),
        reason: 'Refund processing initiated'
      });

      refund.audit.lastModifiedBy = req.admin._id;
      refund.audit.lastModifiedAt = new Date();
      refund.audit.version += 1;

      await refund.save();

      // TODO: Implement actual payment processor integration
      // For now, we'll simulate successful processing
      setTimeout(async () => {
        try {
          refund.status = 'completed';
          refund.audit.changes.push({
            field: 'status',
            oldValue: 'processing',
            newValue: 'completed',
            changedBy: 'system',
            changedAt: new Date(),
            reason: 'Refund processed successfully'
          });
          await refund.save();

          // Apply user impact
          await RefundController.applyUserImpact(refund);
        } catch (error) {
          console.error('Error completing refund:', error);
        }
      }, 5000); // Simulate 5 second processing time

      // Log processing
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'refund_process',
        resource: 'refund',
        resourceId: refund._id.toString(),
        details: {
          refundId: refund._id,
          amount: refund.amount,
          netAmount: refund.processing.netAmount,
          processingFee,
          processorRefundId
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Refund processing initiated',
        data: { refund }
      });
    } catch (error) {
      console.error('Process refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update refund
  static async updateRefund(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const refund = await Refund.findById(id);
      if (!refund) {
        return res.status(404).json({
          success: false,
          message: 'Refund not found'
        });
      }

      // Store old data for audit
      const oldData = {
        reason: refund.reason,
        evidence: refund.evidence,
        risk: refund.risk
      };

      // Update refund
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          refund[key] = updateData[key];
        }
      });

      // Add to audit trail
      refund.audit.changes.push({
        field: 'general_update',
        oldValue: oldData,
        newValue: updateData,
        changedBy: req.admin._id,
        changedAt: new Date(),
        reason: 'Refund updated by admin'
      });

      refund.audit.lastModifiedBy = req.admin._id;
      refund.audit.lastModifiedAt = new Date();
      refund.audit.version += 1;

      await refund.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'refund_update',
        resource: 'refund',
        resourceId: refund._id.toString(),
        details: {
          oldData,
          newData: updateData
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Refund updated successfully',
        data: { refund }
      });
    } catch (error) {
      console.error('Update refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get refund statistics
  static async getRefundStats(req: AuthRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      const stats = await Refund.getRefundStats(period as string);

      res.json({
        success: true,
        data: {
          ...stats,
          period
        }
      });
    } catch (error) {
      console.error('Get refund stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateRefunds(req: AuthRequest, res: Response) {
    try {
      const { refundIds, operation, updates } = req.body;

      if (!refundIds || !Array.isArray(refundIds) || refundIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Refund IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'approve':
          result = await Refund.updateMany(
            { _id: { $in: refundIds }, status: 'pending' },
            {
              $set: {
                status: 'approved',
                'approval.approvedBy': req.admin._id,
                'approval.approvedAt': new Date()
              }
            }
          );
          break;
        case 'reject':
          result = await Refund.updateMany(
            { _id: { $in: refundIds }, status: 'pending' },
            {
              $set: {
                status: 'rejected',
                'approval.rejectedBy': req.admin._id,
                'approval.rejectedAt': new Date(),
                'approval.rejectionReason': updates.reason || 'Bulk rejection'
              }
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
        action: `refund_bulk_${operation}`,
        resource: 'refund',
        resourceId: 'bulk',
        details: {
          refundIds,
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
          totalRequested: refundIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update refunds error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper method to apply user impact after refund
  static async applyUserImpact(refund: any) {
    try {
      const user = await User.findById(refund.userId);
      if (!user) return;

      // Cancel subscription if configured
      if (refund.userImpact.subscriptionCancelled) {
        user.subscription.status = 'canceled';
        user.subscription.cancelAtPeriodEnd = true;
      }

      // Downgrade subscription if configured
      if (refund.userImpact.subscriptionDowngraded) {
        user.subscription.plan = 'free';
        user.subscription.status = 'active';
      }

      // Revoke credits
      if (refund.userImpact.creditsRevoked > 0) {
        user.credits.total = Math.max(0, user.credits.total - refund.userImpact.creditsRevoked);
        user.credits.remaining = Math.max(0, user.credits.remaining - refund.userImpact.creditsRevoked);
      }

      // Remove promotional credits
      if (refund.userImpact.promotionalCreditsRemoved > 0) {
        // Implementation depends on how promotional credits are tracked
      }

      await user.save();

      // Log user impact
      await AuditLog.create({
        adminId: 'system',
        adminEmail: 'system@veefore.com',
        action: 'refund_user_impact',
        resource: 'user',
        resourceId: user._id.toString(),
        details: {
          refundId: refund._id,
          userImpact: refund.userImpact
        },
        ipAddress: 'system',
        userAgent: 'system',
        riskLevel: 'medium',
        isSensitive: true
      });
    } catch (error) {
      console.error('Error applying user impact:', error);
    }
  }
}
