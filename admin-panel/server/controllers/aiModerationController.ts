import { Request, Response } from 'express';
import AICompliance from '../models/AICompliance';
import { AuthRequest } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

export class AIModerationController {
  // Get all AI compliance records with filtering
  static async getComplianceRecords(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        contentType,
        action,
        reviewStatus,
        riskLevel,
        startDate,
        endDate,
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
          { content: { $regex: search, $options: 'i' } },
          { prompt: { $regex: search, $options: 'i' } },
          { response: { $regex: search, $options: 'i' } },
          { actionReason: { $regex: search, $options: 'i' } }
        ];
      }

      if (contentType) {
        filter.contentType = contentType;
      }

      if (action) {
        filter.action = action;
      }

      if (reviewStatus) {
        filter.reviewStatus = reviewStatus;
      }

      if (riskLevel) {
        filter.riskLevel = riskLevel;
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate as string);
        }
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      const records = await AICompliance.find(filter)
        .populate('actionTakenBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

      const total = await AICompliance.countDocuments(filter);

      res.json({
        success: true,
        data: {
          records,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching AI compliance records:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch AI compliance records'
      });
    }
  }

  // Get AI compliance statistics
  static async getComplianceStats(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) {
          dateFilter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          dateFilter.createdAt.$lte = new Date(endDate as string);
        }
      }

      const [
        totalRecords,
        actionStats,
        reviewStats,
        riskStats,
        contentTypeStats,
        moderationStats
      ] = await Promise.all([
        AICompliance.countDocuments(dateFilter),
        
        // Action statistics
        AICompliance.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$action', count: { $sum: 1 } } }
        ]),
        
        // Review status statistics
        AICompliance.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$reviewStatus', count: { $sum: 1 } } }
        ]),
        
        // Risk level statistics
        AICompliance.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
        ]),
        
        // Content type statistics
        AICompliance.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$contentType', count: { $sum: 1 } } }
        ]),
        
        // Moderation level statistics
        AICompliance.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              toxicityHigh: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.toxicity.level', 'high'] },
                    1,
                    0
                  ]
                }
              },
              toxicityCritical: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.toxicity.level', 'critical'] },
                    1,
                    0
                  ]
                }
              },
              biasHigh: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.bias.level', 'high'] },
                    1,
                    0
                  ]
                }
              },
              biasCritical: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.bias.level', 'critical'] },
                    1,
                    0
                  ]
                }
              },
              safetyHigh: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.safety.level', 'high'] },
                    1,
                    0
                  ]
                }
              },
              safetyCritical: {
                $sum: {
                  $cond: [
                    { $eq: ['$moderationResults.safety.level', 'critical'] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ])
      ]);

      res.json({
        success: true,
        data: {
          totalRecords,
          actionStats: actionStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          reviewStats: reviewStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          riskStats: riskStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          contentTypeStats: contentTypeStats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          moderationStats: moderationStats[0] || {}
        }
      });
    } catch (error) {
      console.error('Error fetching AI compliance statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch AI compliance statistics'
      });
    }
  }

  // Get compliance record by ID
  static async getComplianceRecordById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const record = await AICompliance.findById(id)
        .populate('actionTakenBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .populate('auditTrail.performedBy', 'firstName lastName email');

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'AI compliance record not found'
        });
      }

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      console.error('Error fetching AI compliance record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch AI compliance record'
      });
    }
  }

  // Update compliance record action
  static async updateComplianceAction(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { action, actionReason, reviewNotes } = req.body;

      const record = await AICompliance.findById(id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'AI compliance record not found'
        });
      }

      // Update record
      record.action = action;
      record.actionReason = actionReason;
      record.actionTakenBy = req.admin!._id;
      record.actionTakenAt = new Date();
      record.reviewStatus = action === 'approved' ? 'approved' : 'in_review';
      
      if (reviewNotes) {
        record.reviewNotes = reviewNotes;
        record.reviewedBy = req.admin!._id;
        record.reviewedAt = new Date();
      }

      // Add to audit trail
      record.auditTrail.push({
        action: `Action updated to: ${action}`,
        performedBy: req.admin!._id,
        performedAt: new Date(),
        details: { action, actionReason, reviewNotes },
        reason: actionReason
      });

      await record.save();

      res.json({
        success: true,
        message: 'AI compliance action updated successfully',
        data: record
      });
    } catch (error) {
      console.error('Error updating AI compliance action:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update AI compliance action'
      });
    }
  }

  // Review compliance record
  static async reviewComplianceRecord(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reviewStatus, reviewNotes, riskLevel, mitigationActions } = req.body;

      const record = await AICompliance.findById(id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'AI compliance record not found'
        });
      }

      // Update review
      record.reviewStatus = reviewStatus;
      record.reviewedBy = req.admin!._id;
      record.reviewedAt = new Date();
      record.reviewNotes = reviewNotes;

      if (riskLevel) {
        record.riskLevel = riskLevel;
      }

      if (mitigationActions) {
        record.mitigationActions = mitigationActions;
      }

      // Add to audit trail
      record.auditTrail.push({
        action: `Review status updated to: ${reviewStatus}`,
        performedBy: req.admin!._id,
        performedAt: new Date(),
        details: { reviewStatus, reviewNotes, riskLevel, mitigationActions },
        reason: reviewNotes
      });

      await record.save();

      res.json({
        success: true,
        message: 'AI compliance record reviewed successfully',
        data: record
      });
    } catch (error) {
      console.error('Error reviewing AI compliance record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to review AI compliance record'
      });
    }
  }

  // Bulk update compliance records
  static async bulkUpdateCompliance(req: AuthRequest, res: Response) {
    try {
      const { recordIds, action, actionReason, reviewStatus, reviewNotes } = req.body;

      if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Record IDs are required'
        });
      }

      const updateData: any = {
        actionTakenBy: req.admin!._id,
        actionTakenAt: new Date()
      };

      if (action) {
        updateData.action = action;
      }

      if (actionReason) {
        updateData.actionReason = actionReason;
      }

      if (reviewStatus) {
        updateData.reviewStatus = reviewStatus;
        updateData.reviewedBy = req.admin!._id;
        updateData.reviewedAt = new Date();
      }

      if (reviewNotes) {
        updateData.reviewNotes = reviewNotes;
      }

      const result = await AICompliance.updateMany(
        { _id: { $in: recordIds } },
        {
          $set: updateData,
          $push: {
            auditTrail: {
              action: `Bulk update: ${action || reviewStatus}`,
              performedBy: req.admin!._id,
              performedAt: new Date(),
              details: { action, actionReason, reviewStatus, reviewNotes },
              reason: actionReason || reviewNotes
            }
          }
        }
      );

      res.json({
        success: true,
        message: `Successfully updated ${result.modifiedCount} AI compliance records`,
        data: { modifiedCount: result.modifiedCount }
      });
    } catch (error) {
      console.error('Error bulk updating AI compliance records:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk update AI compliance records'
      });
    }
  }

  // Get compliance trends
  static async getComplianceTrends(req: AuthRequest, res: Response) {
    try {
      const { period = '7d', startDate, endDate } = req.query;

      let dateFilter: any = {};
      
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      } else {
        // Default to last 7 days
        const days = parseInt(period.toString().replace('d', ''));
        const start = new Date();
        start.setDate(start.getDate() - days);
        dateFilter = { createdAt: { $gte: start } };
      }

      const trends = await AICompliance.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              action: '$action',
              riskLevel: '$riskLevel'
            },
            count: { $sum: 1 },
            avgToxicityScore: { $avg: '$moderationResults.toxicity.score' },
            avgBiasScore: { $avg: '$moderationResults.bias.score' },
            avgSafetyScore: { $avg: '$moderationResults.safety.score' }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]);

      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error('Error fetching AI compliance trends:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch AI compliance trends'
      });
    }
  }

  // Export compliance data
  static async exportComplianceData(req: AuthRequest, res: Response) {
    try {
      const { format = 'json', startDate, endDate } = req.query;

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) {
          dateFilter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          dateFilter.createdAt.$lte = new Date(endDate as string);
        }
      }

      const records = await AICompliance.find(dateFilter)
        .populate('actionTakenBy', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName email')
        .sort({ createdAt: -1 });

      if (format === 'csv') {
        // Convert to CSV format
        const csvData = records.map(record => ({
          id: record._id,
          userId: record.userId,
          contentType: record.contentType,
          action: record.action,
          reviewStatus: record.reviewStatus,
          riskLevel: record.riskLevel,
          toxicityScore: record.moderationResults.toxicity.score,
          biasScore: record.moderationResults.bias.score,
          safetyScore: record.moderationResults.safety.score,
          createdAt: record.createdAt
        }));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=ai_compliance_export.csv');
        res.json({ success: true, data: csvData });
      } else {
        res.json({
          success: true,
          data: records
        });
      }
    } catch (error) {
      console.error('Error exporting AI compliance data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export AI compliance data'
      });
    }
  }
}
