import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalytics extends Document {
  _id: string;
  date: Date;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  
  // Revenue metrics
  revenue: {
    total: number;
    byPlan: { [key: string]: number };
    byRegion: { [key: string]: number };
    refunded: number;
    net: number;
  };
  
  // User metrics
  users: {
    total: number;
    new: number;
    active: number;
    churned: number;
    byPlan: { [key: string]: number };
    topSpenders: Array<{
      userId: string;
      email: string;
      amount: number;
    }>;
  };
  
  // Credit & feature usage
  credits: {
    totalPurchased: number;
    totalSpent: number;
    byFeature: { [key: string]: number };
    addOnsPurchased: { [key: string]: number };
  };
  
  // AI model usage
  aiUsage: {
    openai: {
      tokens: number;
      cost: number;
      models: { [key: string]: number };
    };
    vapi: {
      minutes: number;
      cost: number;
    };
    transcription: {
      hours: number;
      cost: number;
    };
    other: { [key: string]: { usage: number; cost: number } };
  };
  
  // Plan distribution
  planDistribution: {
    free: number;
    paid: { [key: string]: number };
    upgrades: number;
    downgrades: number;
  };
  
  // Performance metrics
  performance: {
    avgTicketResolutionTime: number; // in minutes
    refundApprovalTime: number; // in minutes
    couponSuccessRate: number; // percentage
    systemUptime: number; // percentage
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsSchema = new Schema<IAnalytics>({
  date: {
    type: Date,
    required: true,
    index: true
  },
  period: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    index: true
  },
  
  // Revenue metrics
  revenue: {
    total: {
      type: Number,
      default: 0
    },
    byPlan: {
      type: Map,
      of: Number,
      default: {}
    },
    byRegion: {
      type: Map,
      of: Number,
      default: {}
    },
    refunded: {
      type: Number,
      default: 0
    },
    net: {
      type: Number,
      default: 0
    }
  },
  
  // User metrics
  users: {
    total: {
      type: Number,
      default: 0
    },
    new: {
      type: Number,
      default: 0
    },
    active: {
      type: Number,
      default: 0
    },
    churned: {
      type: Number,
      default: 0
    },
    byPlan: {
      type: Map,
      of: Number,
      default: {}
    },
    topSpenders: [{
      userId: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true
      },
      amount: {
        type: Number,
        required: true
      }
    }]
  },
  
  // Credit & feature usage
  credits: {
    totalPurchased: {
      type: Number,
      default: 0
    },
    totalSpent: {
      type: Number,
      default: 0
    },
    byFeature: {
      type: Map,
      of: Number,
      default: {}
    },
    addOnsPurchased: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  
  // AI model usage
  aiUsage: {
    openai: {
      tokens: {
        type: Number,
        default: 0
      },
      cost: {
        type: Number,
        default: 0
      },
      models: {
        type: Map,
        of: Number,
        default: {}
      }
    },
    vapi: {
      minutes: {
        type: Number,
        default: 0
      },
      cost: {
        type: Number,
        default: 0
      }
    },
    transcription: {
      hours: {
        type: Number,
        default: 0
      },
      cost: {
        type: Number,
        default: 0
      }
    },
    other: {
      type: Map,
      of: {
        usage: Number,
        cost: Number
      },
      default: {}
    }
  },
  
  // Plan distribution
  planDistribution: {
    free: {
      type: Number,
      default: 0
    },
    paid: {
      type: Map,
      of: Number,
      default: {}
    },
    upgrades: {
      type: Number,
      default: 0
    },
    downgrades: {
      type: Number,
      default: 0
    }
  },
  
  // Performance metrics
  performance: {
    avgTicketResolutionTime: {
      type: Number,
      default: 0
    },
    refundApprovalTime: {
      type: Number,
      default: 0
    },
    couponSuccessRate: {
      type: Number,
      default: 0
    },
    systemUptime: {
      type: Number,
      default: 100
    }
  }
}, {
  timestamps: true
});

// Indexes (removed duplicate - period already has index: true)
AnalyticsSchema.index({ date: -1, period: 1 });

export default mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
