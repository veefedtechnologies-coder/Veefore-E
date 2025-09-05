import mongoose, { Document, Schema } from 'mongoose';

export interface IRefund extends Document {
  _id: string;
  userId: string;
  transactionId: string;
  originalTransactionId: string;
  amount: number;
  currency: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  type: 'full' | 'partial';
  method: 'original_payment' | 'wallet' | 'bank_transfer' | 'credit';
  
  // Eligibility and validation
  eligibility: {
    isEligible: boolean;
    eligibilityScore: number; // 0-100
    criteria: {
      withinRefundWindow: boolean;
      usageThreshold: boolean;
      riskStatus: boolean;
      subscriptionStatus: boolean;
      previousRefunds: boolean;
    };
    reasons: string[];
  };
  
  // Approval workflow
  approval: {
    requiresApproval: boolean;
    approvalLevel: number; // 1-5
    approvedBy?: string;
    approvedAt?: Date;
    rejectionReason?: string;
    rejectedBy?: string;
    rejectedAt?: Date;
    escalationLevel?: number;
    escalatedTo?: string;
    escalatedAt?: Date;
  };
  
  // Refund processing
  processing: {
    processor: 'stripe' | 'razorpay' | 'paypal' | 'manual';
    processorRefundId?: string;
    processorResponse?: any;
    processingFee?: number;
    netAmount: number;
    processedAt?: Date;
    failureReason?: string;
    retryCount: number;
    maxRetries: number;
  };
  
  // User impact
  userImpact: {
    subscriptionCancelled: boolean;
    subscriptionDowngraded: boolean;
    creditsRevoked: number;
    featuresRevoked: string[];
    promotionalCreditsRemoved: number;
    accessLevelChanged: string;
  };
  
  // Evidence and documentation
  evidence: {
    screenshots: string[];
    documents: string[];
    notes: string;
    adminNotes: string;
    userCommunication: Array<{
      type: 'email' | 'ticket' | 'chat';
      content: string;
      timestamp: Date;
      adminId?: string;
    }>;
  };
  
  // SLA and escalation
  sla: {
    responseTime: number; // hours
    resolutionTime: number; // hours
    responseDeadline: Date;
    resolutionDeadline: Date;
    isSlaBreached: boolean;
    escalationTriggers: string[];
  };
  
  // Audit and compliance
  audit: {
    createdBy: string;
    lastModifiedBy: string;
    lastModifiedAt: Date;
    version: number;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changedBy: string;
      changedAt: Date;
      reason: string;
    }>;
  };
  
  // Risk assessment
  risk: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    fraudScore: number; // 0-100
    suspiciousActivity: boolean;
    flaggedBy: 'system' | 'admin' | 'ai';
    investigationRequired: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  originalTransactionId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  type: {
    type: String,
    enum: ['full', 'partial'],
    required: true
  },
  method: {
    type: String,
    enum: ['original_payment', 'wallet', 'bank_transfer', 'credit'],
    required: true
  },
  
  // Eligibility and validation
  eligibility: {
    isEligible: {
      type: Boolean,
      default: false
    },
    eligibilityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    criteria: {
      withinRefundWindow: {
        type: Boolean,
        default: false
      },
      usageThreshold: {
        type: Boolean,
        default: false
      },
      riskStatus: {
        type: Boolean,
        default: false
      },
      subscriptionStatus: {
        type: Boolean,
        default: false
      },
      previousRefunds: {
        type: Boolean,
        default: false
      }
    },
    reasons: [{
      type: String
    }]
  },
  
  // Approval workflow
  approval: {
    requiresApproval: {
      type: Boolean,
      default: true
    },
    approvalLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    },
    approvedBy: {
      type: String,
      ref: 'Admin'
    },
    approvedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      maxlength: 500
    },
    rejectedBy: {
      type: String,
      ref: 'Admin'
    },
    rejectedAt: {
      type: Date
    },
    escalationLevel: {
      type: Number,
      min: 1,
      max: 5
    },
    escalatedTo: {
      type: String,
      ref: 'Admin'
    },
    escalatedAt: {
      type: Date
    }
  },
  
  // Refund processing
  processing: {
    processor: {
      type: String,
      enum: ['stripe', 'razorpay', 'paypal', 'manual'],
      required: true
    },
    processorRefundId: {
      type: String
    },
    processorResponse: {
      type: Schema.Types.Mixed
    },
    processingFee: {
      type: Number,
      min: 0,
      default: 0
    },
    netAmount: {
      type: Number,
      required: true
    },
    processedAt: {
      type: Date
    },
    failureReason: {
      type: String
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0
    }
  },
  
  // User impact
  userImpact: {
    subscriptionCancelled: {
      type: Boolean,
      default: false
    },
    subscriptionDowngraded: {
      type: Boolean,
      default: false
    },
    creditsRevoked: {
      type: Number,
      default: 0,
      min: 0
    },
    featuresRevoked: [{
      type: String
    }],
    promotionalCreditsRemoved: {
      type: Number,
      default: 0,
      min: 0
    },
    accessLevelChanged: {
      type: String,
      default: 'none'
    }
  },
  
  // Evidence and documentation
  evidence: {
    screenshots: [{
      type: String
    }],
    documents: [{
      type: String
    }],
    notes: {
      type: String,
      maxlength: 1000
    },
    adminNotes: {
      type: String,
      maxlength: 1000
    },
    userCommunication: [{
      type: {
        type: String,
        enum: ['email', 'ticket', 'chat']
      },
      content: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      adminId: {
        type: String,
        ref: 'Admin'
      }
    }]
  },
  
  // SLA and escalation
  sla: {
    responseTime: {
      type: Number,
      default: 24, // 24 hours
      min: 1
    },
    resolutionTime: {
      type: Number,
      default: 72, // 72 hours
      min: 1
    },
    responseDeadline: {
      type: Date,
      required: true
    },
    resolutionDeadline: {
      type: Date,
      required: true
    },
    isSlaBreached: {
      type: Boolean,
      default: false
    },
    escalationTriggers: [{
      type: String
    }]
  },
  
  // Audit and compliance
  audit: {
    createdBy: {
      type: String,
      ref: 'Admin',
      required: true
    },
    lastModifiedBy: {
      type: String,
      ref: 'Admin',
      required: true
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    },
    changes: [{
      field: {
        type: String,
        required: true
      },
      oldValue: {
        type: Schema.Types.Mixed
      },
      newValue: {
        type: Schema.Types.Mixed
      },
      changedBy: {
        type: String,
        ref: 'Admin',
        required: true
      },
      changedAt: {
        type: Date,
        default: Date.now
      },
      reason: {
        type: String,
        required: true
      }
    }]
  },
  
  // Risk assessment
  risk: {
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    riskFactors: [{
      type: String
    }],
    fraudScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    suspiciousActivity: {
      type: Boolean,
      default: false
    },
    flaggedBy: {
      type: String,
      enum: ['system', 'admin', 'ai'],
      default: 'system'
    },
    investigationRequired: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - transactionId already has unique: true)
RefundSchema.index({ userId: 1 });
RefundSchema.index({ status: 1 });
RefundSchema.index({ createdAt: -1 });
RefundSchema.index({ 'approval.approvedBy': 1 });
RefundSchema.index({ 'sla.responseDeadline': 1 });
RefundSchema.index({ 'sla.resolutionDeadline': 1 });
RefundSchema.index({ 'risk.riskLevel': 1 });

// Virtual for refund age
RefundSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60));
});

// Virtual for SLA status
RefundSchema.virtual('slaStatus').get(function() {
  const now = new Date();
  if (this.status === 'completed' || this.status === 'rejected') {
    return 'resolved';
  }
  if (now > this.sla.resolutionDeadline) {
    return 'breached';
  }
  if (now > this.sla.responseDeadline) {
    return 'at_risk';
  }
  return 'on_track';
});

// Pre-save middleware to calculate net amount
RefundSchema.pre('save', function(next) {
  this.processing.netAmount = this.amount - (this.processing.processingFee || 0);
  
  // Set SLA deadlines
  if (this.isNew) {
    this.sla.responseDeadline = new Date(Date.now() + this.sla.responseTime * 60 * 60 * 1000);
    this.sla.resolutionDeadline = new Date(Date.now() + this.sla.resolutionTime * 60 * 60 * 1000);
  }
  
  // Check SLA breach
  const now = new Date();
  this.sla.isSlaBreached = now > this.sla.resolutionDeadline && this.status !== 'completed' && this.status !== 'rejected';
  
  next();
});

// Method to check eligibility
RefundSchema.methods.checkEligibility = async function() {
  const user = await this.constructor.db.model('User').findById(this.userId);
  if (!user) {
    this.eligibility.isEligible = false;
    this.eligibility.reasons.push('User not found');
    return false;
  }
  
  let score = 0;
  const reasons = [];
  
  // Check refund window (7, 14, or 30 days)
  const refundWindow = 14; // days
  const daysSinceTransaction = (Date.now() - new Date(this.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceTransaction <= refundWindow) {
    this.eligibility.criteria.withinRefundWindow = true;
    score += 30;
  } else {
    reasons.push(`Transaction is ${Math.floor(daysSinceTransaction)} days old, exceeds ${refundWindow} day refund window`);
  }
  
  // Check usage threshold (less than 25% used)
  const usagePercentage = (user.credits.used / user.credits.total) * 100;
  if (usagePercentage < 25) {
    this.eligibility.criteria.usageThreshold = true;
    score += 25;
  } else {
    reasons.push(`User has used ${usagePercentage.toFixed(1)}% of credits, exceeds 25% threshold`);
  }
  
  // Check risk status
  if (!user.isBanned && user.isActive) {
    this.eligibility.criteria.riskStatus = true;
    score += 20;
  } else {
    reasons.push('User is banned or inactive');
  }
  
  // Check subscription status
  if (user.subscription.status === 'active' || user.subscription.status === 'trialing') {
    this.eligibility.criteria.subscriptionStatus = true;
    score += 15;
  } else {
    reasons.push('User subscription is not active');
  }
  
  // Check previous refunds (max 2 per year)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const previousRefunds = await this.constructor.countDocuments({
    userId: this.userId,
    status: 'completed',
    createdAt: { $gte: oneYearAgo }
  });
  
  if (previousRefunds < 2) {
    this.eligibility.criteria.previousRefunds = true;
    score += 10;
  } else {
    reasons.push(`User has already received ${previousRefunds} refunds in the past year`);
  }
  
  this.eligibility.eligibilityScore = score;
  this.eligibility.reasons = reasons;
  this.eligibility.isEligible = score >= 70; // 70% threshold for eligibility
  
  return this.eligibility.isEligible;
};

// Method to escalate refund
RefundSchema.methods.escalate = async function(escalatedTo: string, reason: string) {
  this.approval.escalationLevel = (this.approval.escalationLevel || 0) + 1;
  this.approval.escalatedTo = escalatedTo;
  this.approval.escalatedAt = new Date();
  
  this.audit.changes.push({
    field: 'escalation',
    oldValue: this.approval.escalationLevel - 1,
    newValue: this.approval.escalationLevel,
    changedBy: escalatedTo,
    changedAt: new Date(),
    reason
  });
  
  await this.save();
};

// Method to add communication
RefundSchema.methods.addCommunication = function(type: 'email' | 'ticket' | 'chat', content: string, adminId?: string) {
  this.evidence.userCommunication.push({
    type,
    content,
    timestamp: new Date(),
    adminId
  });
};

// Static method to get refund statistics
RefundSchema.statics.getRefundStats = async function(period: string = '30d') {
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
  
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: dateFilter
      }
    },
    {
      $group: {
        _id: null,
        totalRefunds: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
        completedRefunds: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pendingRefunds: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        rejectedRefunds: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
        },
        avgProcessingTime: {
          $avg: {
            $cond: [
              { $ne: ['$processing.processedAt', null] },
              {
                $divide: [
                  { $subtract: ['$processing.processedAt', '$createdAt'] },
                  1000 * 60 * 60 // Convert to hours
                ]
              },
              null
            ]
          }
        }
      }
    }
  ]);
  
  const statusBreakdown = await this.aggregate([
    {
      $match: {
        createdAt: dateFilter
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  const reasonBreakdown = await this.aggregate([
    {
      $match: {
        createdAt: dateFilter
      }
    },
    {
      $group: {
        _id: '$reason',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 10
    }
  ]);
  
  return {
    overview: stats[0] || {
      totalRefunds: 0,
      totalAmount: 0,
      avgAmount: 0,
      completedRefunds: 0,
      pendingRefunds: 0,
      rejectedRefunds: 0,
      avgProcessingTime: 0
    },
    statusBreakdown,
    reasonBreakdown
  };
};

export default mongoose.model<IRefund>('Refund', RefundSchema);
