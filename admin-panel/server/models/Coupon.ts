import mongoose, { Document, Schema } from 'mongoose';

export interface ICoupon extends Document {
  _id: string;
  code: string;
  name: string;
  description: string;
  
  // Discount configuration
  discount: {
    type: 'percentage' | 'fixed' | 'free_shipping';
    value: number; // Percentage or fixed amount
    currency?: string;
    maxDiscount?: number; // Maximum discount amount
  };
  
  // Targeting
  target: {
    type: 'all' | 'specific_users' | 'user_segments' | 'plans' | 'regions';
    users?: string[]; // User IDs
    segments?: string[]; // User segments
    plans?: string[]; // Plan names
    regions?: string[]; // Country codes
  };
  
  // Scope
  scope: {
    type: 'subscription' | 'credits' | 'addons' | 'all';
    plans?: string[]; // Specific plans if scope is subscription
    features?: string[]; // Specific features if scope is addons
  };
  
  // Usage limits
  limits: {
    maxUses: number; // Total uses allowed
    maxUsesPerUser: number; // Uses per user
    minOrderValue?: number; // Minimum order value
    maxOrderValue?: number; // Maximum order value
  };
  
  // Validity
  validity: {
    startDate: Date;
    endDate: Date;
    timezone: string;
  };
  
  // Stacking rules
  stacking: {
    allowStacking: boolean;
    stackableWith: string[]; // Other coupon codes
    maxStackDepth: number; // Maximum coupons that can be stacked
  };
  
  // Campaign management
  campaign: {
    name?: string;
    description?: string;
    goals?: {
      targetRedemptions: number;
      targetRevenue: number;
      targetConversions: number;
    };
  };
  
  // QR Code
  qrCode?: {
    url: string;
    imageUrl: string;
    format: 'png' | 'svg' | 'pdf';
  };
  
  // Status
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived';
  isPublic: boolean; // Can be used by anyone vs internal only
  
  // Analytics
  analytics: {
    totalRedemptions: number;
    uniqueUsers: number;
    revenueGenerated: number;
    conversionRate: number;
    avgOrderValue: number;
    topRedemptions: Array<{
      date: Date;
      count: number;
    }>;
  };
  
  // Alerts
  alerts: {
    redemptionAlerts: {
      enabled: boolean;
      frequency: 'realtime' | 'hourly' | 'daily';
      threshold: number; // Alert every X redemptions
      recipients: string[]; // Admin emails
    };
    expiryAlerts: {
      enabled: boolean;
      daysBefore: number[]; // Alert X days before expiry
      recipients: string[]; // Admin emails
    };
  };
  
  // Automation
  automation: {
    autoSuggest: {
      enabled: boolean;
      conditions: Array<{
        type: 'user_type' | 'cart_value' | 'region' | 'plan';
        operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
        value: any;
      }>;
    };
    autoApply: {
      enabled: boolean;
      conditions: Array<{
        type: 'user_type' | 'cart_value' | 'region' | 'plan';
        operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
        value: any;
      }>;
    };
  };
  
  // Audit
  createdBy: string; // Admin ID
  lastModifiedBy: string; // Admin ID
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 50
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  
  // Discount configuration
  discount: {
    type: {
      type: String,
      required: true,
      enum: ['percentage', 'fixed', 'free_shipping']
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    maxDiscount: Number
  },
  
  // Targeting
  target: {
    type: {
      type: String,
      required: true,
      enum: ['all', 'specific_users', 'user_segments', 'plans', 'regions'],
      default: 'all'
    },
    users: [{
      type: String,
      ref: 'User'
    }],
    segments: [{
      type: String
    }],
    plans: [{
      type: String
    }],
    regions: [{
      type: String
    }]
  },
  
  // Scope
  scope: {
    type: {
      type: String,
      required: true,
      enum: ['subscription', 'credits', 'addons', 'all'],
      default: 'all'
    },
    plans: [{
      type: String
    }],
    features: [{
      type: String
    }]
  },
  
  // Usage limits
  limits: {
    maxUses: {
      type: Number,
      default: 1000
    },
    maxUsesPerUser: {
      type: Number,
      default: 1
    },
    minOrderValue: Number,
    maxOrderValue: Number
  },
  
  // Validity
  validity: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  
  // Stacking rules
  stacking: {
    allowStacking: {
      type: Boolean,
      default: false
    },
    stackableWith: [{
      type: String
    }],
    maxStackDepth: {
      type: Number,
      default: 1
    }
  },
  
  // Campaign management
  campaign: {
    name: String,
    description: String,
    goals: {
      targetRedemptions: Number,
      targetRevenue: Number,
      targetConversions: Number
    }
  },
  
  // QR Code
  qrCode: {
    url: String,
    imageUrl: String,
    format: {
      type: String,
      enum: ['png', 'svg', 'pdf'],
      default: 'png'
    }
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['draft', 'active', 'paused', 'expired', 'archived'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  
  // Analytics
  analytics: {
    totalRedemptions: {
      type: Number,
      default: 0
    },
    uniqueUsers: {
      type: Number,
      default: 0
    },
    revenueGenerated: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    },
    avgOrderValue: {
      type: Number,
      default: 0
    },
    topRedemptions: [{
      date: Date,
      count: Number
    }]
  },
  
  // Alerts
  alerts: {
    redemptionAlerts: {
      enabled: {
        type: Boolean,
        default: false
      },
      frequency: {
        type: String,
        enum: ['realtime', 'hourly', 'daily'],
        default: 'daily'
      },
      threshold: {
        type: Number,
        default: 10
      },
      recipients: [{
        type: String
      }]
    },
    expiryAlerts: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: [{
        type: Number
      }],
      recipients: [{
        type: String
      }]
    }
  },
  
  // Automation
  automation: {
    autoSuggest: {
      enabled: {
        type: Boolean,
        default: false
      },
      conditions: [{
        type: {
          type: String,
          enum: ['user_type', 'cart_value', 'region', 'plan']
        },
        operator: {
          type: String,
          enum: ['equals', 'greater_than', 'less_than', 'contains']
        },
        value: Schema.Types.Mixed
      }]
    },
    autoApply: {
      enabled: {
        type: Boolean,
        default: false
      },
      conditions: [{
        type: {
          type: String,
          enum: ['user_type', 'cart_value', 'region', 'plan']
        },
        operator: {
          type: String,
          enum: ['equals', 'greater_than', 'less_than', 'contains']
        },
        value: Schema.Types.Mixed
      }]
    }
  },
  
  // Audit
  createdBy: {
    type: String,
    required: true,
    ref: 'Admin'
  },
  lastModifiedBy: {
    type: String,
    required: true,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - code already has unique: true)
CouponSchema.index({ status: 1, isPublic: 1 });
CouponSchema.index({ 'validity.startDate': 1, 'validity.endDate': 1 });
CouponSchema.index({ createdBy: 1 });
CouponSchema.index({ createdAt: -1 });

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
