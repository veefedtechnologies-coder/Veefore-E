import mongoose, { Document, Schema } from 'mongoose';

export interface IMaintenanceBanner extends Document {
  _id: string;
  title: string;
  message: string;
  
  // Display settings
  type: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  
  // Scheduling
  startDate?: Date;
  endDate?: Date;
  isRecurring: boolean;
  recurringPattern?: {
    type: 'daily' | 'weekly' | 'monthly';
    days?: number[]; // for weekly: 0-6 (Sunday-Saturday)
    time?: string; // HH:MM format
  };
  
  // Targeting
  targetAudience: {
    type: 'all' | 'specific_roles' | 'specific_users';
    roles?: string[];
    userIds?: string[];
  };
  
  // Display options
  displayOptions: {
    showOnLogin: boolean;
    showOnDashboard: boolean;
    showOnAllPages: boolean;
    dismissible: boolean;
    autoHide: boolean;
    autoHideDelay?: number; // in seconds
  };
  
  // Actions
  actions?: Array<{
    label: string;
    url?: string;
    action?: string;
    style: 'primary' | 'secondary' | 'danger';
  }>;
  
  // Statistics
  stats: {
    views: number;
    dismissals: number;
    clicks: number;
    lastViewedAt?: Date;
  };
  
  // Metadata
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceBannerSchema = new Schema<IMaintenanceBanner>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  
  // Display settings
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Scheduling
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    days: [Number],
    time: String
  },
  
  // Targeting
  targetAudience: {
    type: {
      type: String,
      enum: ['all', 'specific_roles', 'specific_users'],
      default: 'all'
    },
    roles: [String],
    userIds: [String]
  },
  
  // Display options
  displayOptions: {
    showOnLogin: { type: Boolean, default: true },
    showOnDashboard: { type: Boolean, default: true },
    showOnAllPages: { type: Boolean, default: false },
    dismissible: { type: Boolean, default: true },
    autoHide: { type: Boolean, default: false },
    autoHideDelay: { type: Number, default: 10 }
  },
  
  // Actions
  actions: [{
    label: { type: String, required: true },
    url: { type: String },
    action: { type: String },
    style: {
      type: String,
      enum: ['primary', 'secondary', 'danger'],
      default: 'primary'
    }
  }],
  
  // Statistics
  stats: {
    views: { type: Number, default: 0 },
    dismissals: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    lastViewedAt: { type: Date }
  },
  
  // Metadata
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  },
  updatedBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes
MaintenanceBannerSchema.index({ isActive: 1 });
MaintenanceBannerSchema.index({ priority: 1 });
MaintenanceBannerSchema.index({ startDate: 1, endDate: 1 });
MaintenanceBannerSchema.index({ 'targetAudience.type': 1 });
MaintenanceBannerSchema.index({ createdAt: -1 });

// Compound indexes
MaintenanceBannerSchema.index({ isActive: 1, priority: 1 });
MaintenanceBannerSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

export default mongoose.model<IMaintenanceBanner>('MaintenanceBanner', MaintenanceBannerSchema);
