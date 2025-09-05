import mongoose, { Document, Schema } from 'mongoose';

export interface IAICompliance extends Document {
  _id: string;
  userId: string;
  contentId: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'document';
  content: string;
  aiModel: string;
  prompt: string;
  response: string;
  
  // Moderation results
  moderationResults: {
    toxicity: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
    };
    bias: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
    };
    safety: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
    };
    quality: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
    };
    compliance: {
      score: number;
      level: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
    };
  };
  
  // Action taken
  action: 'approved' | 'flagged' | 'blocked' | 'quarantined' | 'escalated';
  actionReason: string;
  actionTakenBy: string;
  actionTakenAt: Date;
  
  // Review process
  reviewStatus: 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  
  // Compliance flags
  complianceFlags: {
    gdpr: boolean;
    ccpa: boolean;
    coppa: boolean;
    hipaa: boolean;
    sox: boolean;
    pci: boolean;
    custom: string[];
  };
  
  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  mitigationActions: string[];
  
  // Audit trail
  auditTrail: Array<{
    action: string;
    performedBy: string;
    performedAt: Date;
    details: any;
    reason?: string;
  }>;
  
  // Metadata
  metadata: {
    userAgent: string;
    ipAddress: string;
    sessionId: string;
    requestId: string;
    processingTime: number;
    modelVersion: string;
    apiVersion: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const AIComplianceSchema = new Schema<IAICompliance>({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  contentId: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    required: true,
    enum: ['text', 'image', 'video', 'audio', 'document']
  },
  content: {
    type: String,
    required: true
  },
  aiModel: {
    type: String,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  response: {
    type: String,
    required: true
  },
  
  // Moderation results
  moderationResults: {
    toxicity: {
      score: { type: Number, required: true, min: 0, max: 1 },
      level: { type: String, required: true, enum: ['low', 'medium', 'high', 'critical'] },
      categories: [{ type: String }]
    },
    bias: {
      score: { type: Number, required: true, min: 0, max: 1 },
      level: { type: String, required: true, enum: ['low', 'medium', 'high', 'critical'] },
      categories: [{ type: String }]
    },
    safety: {
      score: { type: Number, required: true, min: 0, max: 1 },
      level: { type: String, required: true, enum: ['low', 'medium', 'high', 'critical'] },
      categories: [{ type: String }]
    },
    quality: {
      score: { type: Number, required: true, min: 0, max: 1 },
      level: { type: String, required: true, enum: ['low', 'medium', 'high', 'critical'] },
      categories: [{ type: String }]
    },
    compliance: {
      score: { type: Number, required: true, min: 0, max: 1 },
      level: { type: String, required: true, enum: ['low', 'medium', 'high', 'critical'] },
      categories: [{ type: String }]
    }
  },
  
  // Action taken
  action: {
    type: String,
    required: true,
    enum: ['approved', 'flagged', 'blocked', 'quarantined', 'escalated'],
    default: 'pending'
  },
  actionReason: {
    type: String,
    required: true
  },
  actionTakenBy: {
    type: String,
    required: true,
    ref: 'Admin'
  },
  actionTakenAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Review process
  reviewStatus: {
    type: String,
    required: true,
    enum: ['pending', 'in_review', 'approved', 'rejected', 'escalated'],
    default: 'pending'
  },
  reviewedBy: {
    type: String,
    ref: 'Admin'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  },
  
  // Compliance flags
  complianceFlags: {
    gdpr: { type: Boolean, default: false },
    ccpa: { type: Boolean, default: false },
    coppa: { type: Boolean, default: false },
    hipaa: { type: Boolean, default: false },
    sox: { type: Boolean, default: false },
    pci: { type: Boolean, default: false },
    custom: [{ type: String }]
  },
  
  // Risk assessment
  riskLevel: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  riskFactors: [{
    type: String
  }],
  mitigationActions: [{
    type: String
  }],
  
  // Audit trail
  auditTrail: [{
    action: { type: String, required: true },
    performedBy: { type: String, required: true, ref: 'Admin' },
    performedAt: { type: Date, required: true, default: Date.now },
    details: { type: Schema.Types.Mixed },
    reason: { type: String }
  }],
  
  // Metadata
  metadata: {
    userAgent: { type: String, required: true },
    ipAddress: { type: String, required: true },
    sessionId: { type: String, required: true },
    requestId: { type: String, required: true },
    processingTime: { type: Number, required: true },
    modelVersion: { type: String, required: true },
    apiVersion: { type: String, required: true }
  }
}, {
  timestamps: true
});

// Indexes
AIComplianceSchema.index({ userId: 1 });
AIComplianceSchema.index({ contentId: 1 });
AIComplianceSchema.index({ contentType: 1 });
AIComplianceSchema.index({ action: 1 });
AIComplianceSchema.index({ reviewStatus: 1 });
AIComplianceSchema.index({ riskLevel: 1 });
AIComplianceSchema.index({ createdAt: -1 });
AIComplianceSchema.index({ 'moderationResults.toxicity.level': 1 });
AIComplianceSchema.index({ 'moderationResults.bias.level': 1 });
AIComplianceSchema.index({ 'moderationResults.safety.level': 1 });
AIComplianceSchema.index({ 'moderationResults.quality.level': 1 });
AIComplianceSchema.index({ 'moderationResults.compliance.level': 1 });

// Compound indexes for common queries
AIComplianceSchema.index({ userId: 1, createdAt: -1 });
AIComplianceSchema.index({ action: 1, reviewStatus: 1 });
AIComplianceSchema.index({ riskLevel: 1, reviewStatus: 1 });
AIComplianceSchema.index({ contentType: 1, action: 1 });

export default mongoose.model<IAICompliance>('AICompliance', AIComplianceSchema);