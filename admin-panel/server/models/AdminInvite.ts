import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminInvite extends Document {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  level: number;
  team: string;
  permissions: string[];
  invitedBy: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'accepted';
  invitationToken: string;
  expiresAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminInviteSchema = new Schema<IAdminInvite>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  role: {
    type: String,
    required: true,
    enum: ['superadmin', 'admin', 'support', 'billing', 'moderator', 'product', 'marketing', 'developer', 'sales', 'legal', 'aiops']
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3
  },
  team: {
    type: String,
    required: true,
    enum: ['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops']
  },
  permissions: [{
    type: String,
    required: true
  }],
  invitedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired', 'accepted'],
    default: 'pending'
  },
  invitationToken: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  acceptedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes (removed duplicates - email and invitationToken already have unique: true)
AdminInviteSchema.index({ status: 1 });
AdminInviteSchema.index({ expiresAt: 1 });
AdminInviteSchema.index({ invitedBy: 1 });
AdminInviteSchema.index({ createdAt: -1 });

// Virtual for full name
AdminInviteSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for isExpired
AdminInviteSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Pre-save middleware to generate invitation token
AdminInviteSchema.pre('save', function(next) {
  if (!this.invitationToken) {
    const crypto = require('crypto');
    this.invitationToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

export default mongoose.model<IAdminInvite>('AdminInvite', AdminInviteSchema);
