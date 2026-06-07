import mongoose from 'mongoose';

export interface IWorkspace extends mongoose.Document {
  workspaceId: string;
  name: string;
  members: string[]; // Array of userIds
  ownerId: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  instagramAccountsCount: number;
  maxInstagramAccounts: number;
  apiRateLimit: number; // requests per hour
  webhookUrl?: string;
  webhookSecret?: string;
  settings: {
    pollingEnabled: boolean;
    webhooksEnabled: boolean;
    smartPollingIntervals: {
      followers: number; // minutes
      likes: number; // minutes  
      comments: number; // minutes
      reach: number; // minutes
      impressions: number; // minutes
    };
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
      maxBackoffTime: number; // milliseconds
    };
  };
  aiConfiguration?: {
    aiModel?: string;
    creativityLevel?: number;
    optimizationGoals?: string;
    aiPersona?: string;
    captionStyle?: string;
    responseLength?: string;
    multilingual?: string;
    videoEngine?: string;
    thumbnailStyle?: string;
    autoHashtags?: boolean;
    contentSafety?: string;
    aiMemory?: string;
    autoLearning?: boolean;
    googleAiStudioKey?: string;
    openAiKey?: string;
  };
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new mongoose.Schema({
  workspaceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  members: [{
    type: String,
    required: true
  }],
  ownerId: {
    type: String,
    required: true,
    index: true
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'free'
  },
  instagramAccountsCount: {
    type: Number,
    default: 0
  },
  maxInstagramAccounts: {
    type: Number,
    default: 1
  },
  apiRateLimit: {
    type: Number,
    default: 200 // requests per hour
  },
  webhookUrl: {
    type: String,
    default: null
  },
  webhookSecret: {
    type: String,
    default: null
  },
  settings: {
    pollingEnabled: {
      type: Boolean,
      default: true
    },
    webhooksEnabled: {
      type: Boolean,
      default: true
    },
    smartPollingIntervals: {
      followers: {
        type: Number,
        default: 60 // minutes - stable metric
      },
      likes: {
        type: Number,
        default: 15 // minutes - dynamic metric
      },
      comments: {
        type: Number,
        default: 10 // minutes - dynamic metric
      },
      reach: {
        type: Number,
        default: 30 // minutes
      },
      impressions: {
        type: Number,
        default: 45 // minutes
      }
    },
    retryPolicy: {
      maxRetries: {
        type: Number,
        default: 3
      },
      backoffMultiplier: {
        type: Number,
        default: 2
      },
      maxBackoffTime: {
        type: Number,
        default: 30000 // 30 seconds
      }
    }
  },
  aiConfiguration: {
    aiModel: {
      type: String,
      default: 'veegpt-hybrid'
    },
    creativityLevel: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 1
    },
    optimizationGoals: {
      type: String,
      default: 'Engagement'
    },
    aiPersona: {
      type: String,
      default: 'Professional & Authoritative'
    },
    captionStyle: {
      type: String,
      default: 'Storytelling'
    },
    responseLength: {
      type: String,
      default: 'medium'
    },
    multilingual: {
      type: String,
      default: 'auto'
    },
    videoEngine: {
      type: String,
      default: 'cinematic'
    },
    thumbnailStyle: {
      type: String,
      default: 'realistic'
    },
    autoHashtags: {
      type: Boolean,
      default: true
    },
    contentSafety: {
      type: String,
      default: 'standard'
    },
    aiMemory: {
      type: String,
      default: 'long-term'
    },
    autoLearning: {
      type: Boolean,
      default: true
    },
    googleAiStudioKey: {
      type: String,
      default: ''
    },
    openAiKey: {
      type: String,
      default: ''
    }
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'workspaces'
});

// Indexes for efficient queries
WorkspaceSchema.index({ ownerId: 1 });
WorkspaceSchema.index({ members: 1 });
WorkspaceSchema.index({ plan: 1 });

export default mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);