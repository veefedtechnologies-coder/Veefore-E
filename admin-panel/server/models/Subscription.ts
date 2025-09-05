import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  _id: string;
  userId: string;
  planId: string;
  planName: string;
  
  // Pricing
  pricing: {
    basePrice: number;
    currency: string;
    billingCycle: 'monthly' | 'yearly' | 'lifetime';
    region: string; // Country code
    regionMultiplier: number; // Regional pricing multiplier
    finalPrice: number; // Calculated price after regional adjustments
  };
  
  // Status and lifecycle
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  endedAt?: Date;
  
  // Features and limits
  features: {
    credits: {
      included: number;
      used: number;
      remaining: number;
      resetDate: Date;
    };
    limits: {
      maxUsers?: number;
      maxProjects?: number;
      maxStorage?: number; // in GB
      apiCallsPerMonth?: number;
      customDomains?: number;
    };
    addons: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      billingCycle: 'monthly' | 'yearly' | 'one_time';
    }>;
  };
  
  // Billing
  billing: {
    paymentMethod: {
      type: 'card' | 'bank_transfer' | 'wallet' | 'crypto';
      last4?: string;
      brand?: string;
      expiryMonth?: number;
      expiryYear?: number;
    };
    nextBillingDate: Date;
    billingAddress: {
      country: string;
      state?: string;
      city: string;
      postalCode: string;
      line1: string;
      line2?: string;
    };
    taxRate: number;
    taxAmount: number;
  };
  
  // Coupons and discounts
  discounts: Array<{
    couponId: string;
    couponCode: string;
    type: 'percentage' | 'fixed' | 'free_trial';
    value: number;
    appliedAt: Date;
    expiresAt?: Date;
  }>;
  
  // Payment history
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'pending' | 'failed' | 'refunded';
    method: string;
    paidAt: Date;
    invoiceUrl?: string;
    receiptUrl?: string;
  }>;
  
  // Usage tracking
  usage: {
    creditsUsed: number;
    apiCalls: number;
    storageUsed: number; // in GB
    lastResetDate: Date;
    nextResetDate: Date;
  };
  
  // Upgrade/downgrade history
  changes: Array<{
    fromPlan: string;
    toPlan: string;
    reason: string;
    changedAt: Date;
    changedBy: string; // Admin ID
    prorationAmount?: number;
  }>;
  
  // Metadata
  metadata: {
    source: 'web' | 'api' | 'admin' | 'migration';
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    notes?: string;
  };
  
  // Audit
  createdBy: string; // Admin ID or 'system'
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  planId: {
    type: String,
    required: true
  },
  planName: {
    type: String,
    required: true
  },
  
  // Pricing
  pricing: {
    basePrice: {
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
    billingCycle: {
      type: String,
      required: true,
      enum: ['monthly', 'yearly', 'lifetime'],
      default: 'monthly'
    },
    region: {
      type: String,
      required: true,
      default: 'US'
    },
    regionMultiplier: {
      type: Number,
      default: 1.0,
      min: 0.1,
      max: 10.0
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  },
  
  // Status and lifecycle
  status: {
    type: String,
    required: true,
    enum: ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused'],
    default: 'active'
  },
  trialEndsAt: {
    type: Date
  },
  currentPeriodStart: {
    type: Date,
    required: true,
    default: Date.now
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  canceledAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  
  // Features and limits
  features: {
    credits: {
      included: {
        type: Number,
        required: true,
        min: 0
      },
      used: {
        type: Number,
        default: 0,
        min: 0
      },
      remaining: {
        type: Number,
        required: true,
        min: 0
      },
      resetDate: {
        type: Date,
        required: true
      }
    },
    limits: {
      maxUsers: Number,
      maxProjects: Number,
      maxStorage: Number,
      apiCallsPerMonth: Number,
      customDomains: Number
    },
    addons: [{
      id: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      price: {
        type: Number,
        required: true,
        min: 0
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      billingCycle: {
        type: String,
        enum: ['monthly', 'yearly', 'one_time'],
        required: true
      }
    }]
  },
  
  // Billing
  billing: {
    paymentMethod: {
      type: {
        type: String,
        enum: ['card', 'bank_transfer', 'wallet', 'crypto'],
        required: true
      },
      last4: String,
      brand: String,
      expiryMonth: Number,
      expiryYear: Number
    },
    nextBillingDate: {
      type: Date,
      required: true
    },
    billingAddress: {
      country: {
        type: String,
        required: true
      },
      state: String,
      city: {
        type: String,
        required: true
      },
      postalCode: {
        type: String,
        required: true
      },
      line1: {
        type: String,
        required: true
      },
      line2: String
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Coupons and discounts
  discounts: [{
    couponId: {
      type: String,
      ref: 'Coupon',
      required: true
    },
    couponCode: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'free_trial'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  
  // Payment history
  payments: [{
    id: {
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
      required: true
    },
    status: {
      type: String,
      enum: ['succeeded', 'pending', 'failed', 'refunded'],
      required: true
    },
    method: {
      type: String,
      required: true
    },
    paidAt: {
      type: Date,
      required: true
    },
    invoiceUrl: String,
    receiptUrl: String
  }],
  
  // Usage tracking
  usage: {
    creditsUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    apiCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    storageUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    nextResetDate: {
      type: Date,
      required: true
    }
  },
  
  // Upgrade/downgrade history
  changes: [{
    fromPlan: {
      type: String,
      required: true
    },
    toPlan: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: String,
      ref: 'Admin',
      required: true
    },
    prorationAmount: Number
  }],
  
  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'api', 'admin', 'migration'],
      default: 'web'
    },
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    notes: String
  },
  
  // Audit
  createdBy: {
    type: String,
    ref: 'Admin',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ planId: 1 });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ 'pricing.region': 1 });
SubscriptionSchema.index({ currentPeriodEnd: 1 });
SubscriptionSchema.index({ createdAt: -1 });

// Virtual for days until renewal
SubscriptionSchema.virtual('daysUntilRenewal').get(function() {
  const now = new Date();
  const diffTime = this.currentPeriodEnd.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for total addon cost
SubscriptionSchema.virtual('totalAddonCost').get(function() {
  return this.features.addons.reduce((total, addon) => {
    return total + (addon.price * addon.quantity);
  }, 0);
});

// Pre-save middleware to calculate final price
SubscriptionSchema.pre('save', function(next) {
  // Calculate final price with regional multiplier
  this.pricing.finalPrice = this.pricing.basePrice * this.pricing.regionMultiplier;
  
  // Apply discounts
  let discountAmount = 0;
  this.discounts.forEach(discount => {
    if (discount.type === 'percentage') {
      discountAmount += (this.pricing.finalPrice * discount.value) / 100;
    } else if (discount.type === 'fixed') {
      discountAmount += discount.value;
    }
  });
  
  this.pricing.finalPrice = Math.max(0, this.pricing.finalPrice - discountAmount);
  
  // Calculate tax
  this.billing.taxAmount = this.pricing.finalPrice * this.billing.taxRate;
  
  next();
});

// Method to check if subscription is active
SubscriptionSchema.methods.isActive = function() {
  return this.status === 'active' || this.status === 'trialing';
};

// Method to check if subscription is in trial
SubscriptionSchema.methods.isTrial = function() {
  return this.status === 'trialing' && this.trialEndsAt && this.trialEndsAt > new Date();
};

// Method to get next billing amount
SubscriptionSchema.methods.getNextBillingAmount = function() {
  return this.pricing.finalPrice + this.billing.taxAmount + this.totalAddonCost;
};

// Method to add payment
SubscriptionSchema.methods.addPayment = function(paymentData: any) {
  this.payments.push(paymentData);
  return this.save();
};

// Method to apply discount
SubscriptionSchema.methods.applyDiscount = function(coupon: any) {
  this.discounts.push({
    couponId: coupon._id,
    couponCode: coupon.code,
    type: coupon.discount.type,
    value: coupon.discount.value,
    appliedAt: new Date(),
    expiresAt: coupon.validity.endDate
  });
  return this.save();
};

// Static method to get subscription statistics
SubscriptionSchema.statics.getSubscriptionStats = async function(period: string = '30d') {
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
        totalSubscriptions: { $sum: 1 },
        activeSubscriptions: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        trialSubscriptions: {
          $sum: { $cond: [{ $eq: ['$status', 'trialing'] }, 1, 0] }
        },
        canceledSubscriptions: {
          $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
        },
        totalRevenue: { $sum: '$pricing.finalPrice' },
        avgRevenue: { $avg: '$pricing.finalPrice' },
        totalAddonRevenue: { $sum: '$totalAddonCost' }
      }
    }
  ]);
  
  const planBreakdown = await this.aggregate([
    {
      $match: {
        createdAt: dateFilter
      }
    },
    {
      $group: {
        _id: '$planName',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.finalPrice' },
        avgRevenue: { $avg: '$pricing.finalPrice' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  const regionBreakdown = await this.aggregate([
    {
      $match: {
        createdAt: dateFilter
      }
    },
    {
      $group: {
        _id: '$pricing.region',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.finalPrice' },
        avgRevenue: { $avg: '$pricing.finalPrice' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
  
  return {
    overview: stats[0] || {
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      trialSubscriptions: 0,
      canceledSubscriptions: 0,
      totalRevenue: 0,
      avgRevenue: 0,
      totalAddonRevenue: 0
    },
    planBreakdown,
    regionBreakdown
  };
};

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
