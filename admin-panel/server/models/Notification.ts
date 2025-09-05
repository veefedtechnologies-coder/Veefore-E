import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  _id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Targeting
  targetUsers: string[]; // User IDs
  targetRoles: string[]; // Role names
  targetTeams: string[]; // Team names
  targetSegments: string[]; // User segments
  
  // Delivery
  channels: ('in_app' | 'email' | 'push' | 'sms')[];
  scheduledFor?: Date;
  expiresAt?: Date;
  
  // Content
  richContent?: {
    html?: string;
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
    }>;
    actions?: Array<{
      label: string;
      action: string;
      url?: string;
    }>;
  };
  
  // Status
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sentAt?: Date;
  deliveredCount: number;
  readCount: number;
  clickCount: number;
  
  // A/B Testing
  abTest?: {
    variant: string;
    group: 'A' | 'B' | 'C' | 'D';
    originalId?: string;
  };
  
  // Analytics
  analytics: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  };
  
  createdBy: string; // Admin ID
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  type: {
    type: String,
    required: true,
    enum: ['info', 'success', 'warning', 'error', 'system'],
    default: 'info'
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Targeting
  targetUsers: [{
    type: String,
    ref: 'User'
  }],
  targetRoles: [{
    type: String
  }],
  targetTeams: [{
    type: String
  }],
  targetSegments: [{
    type: String
  }],
  
  // Delivery
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'push', 'sms'],
    required: true
  }],
  scheduledFor: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  
  // Content
  richContent: {
    html: String,
    attachments: [{
      name: String,
      url: String,
      type: String
    }],
    actions: [{
      label: String,
      action: String,
      url: String
    }]
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft'
  },
  sentAt: {
    type: Date
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  readCount: {
    type: Number,
    default: 0
  },
  clickCount: {
    type: Number,
    default: 0
  },
  
  // A/B Testing
  abTest: {
    variant: String,
    group: {
      type: String,
      enum: ['A', 'B', 'C', 'D']
    },
    originalId: {
      type: String,
      ref: 'Notification'
    }
  },
  
  // Analytics
  analytics: {
    deliveryRate: {
      type: Number,
      default: 0
    },
    openRate: {
      type: Number,
      default: 0
    },
    clickRate: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    }
  },
  
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
NotificationSchema.index({ status: 1 });
NotificationSchema.index({ scheduledFor: 1 });
NotificationSchema.index({ createdBy: 1 });
NotificationSchema.index({ targetUsers: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
