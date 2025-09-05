import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhook extends Document {
  _id: string;
  name: string;
  description?: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  
  // Authentication
  authType: 'none' | 'basic' | 'bearer' | 'custom';
  authConfig: {
    username?: string;
    password?: string;
    token?: string;
    customHeaders?: Record<string, string>;
  };
  
  // Retry configuration
  retryConfig: {
    maxRetries: number;
    retryDelay: number; // in milliseconds
    backoffMultiplier: number;
    maxRetryDelay: number; // in milliseconds
  };
  
  // Rate limiting
  rateLimit: {
    enabled: boolean;
    requestsPerMinute: number;
    burstLimit: number;
  };
  
  // Filtering
  filters: {
    enabled: boolean;
    conditions: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';
      value: string;
    }>;
  };
  
  // Headers
  headers: Record<string, string>;
  
  // Statistics
  stats: {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    lastDeliveryAt?: Date;
    lastSuccessAt?: Date;
    lastFailureAt?: Date;
    averageResponseTime: number;
  };
  
  // Status
  status: 'active' | 'inactive' | 'error' | 'testing';
  lastError?: {
    message: string;
    timestamp: Date;
    responseCode?: number;
    responseBody?: string;
  };
  
  // Metadata
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhook>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  events: [{
    type: String,
    required: true
  }],
  secret: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Authentication
  authType: {
    type: String,
    enum: ['none', 'basic', 'bearer', 'custom'],
    default: 'none'
  },
  authConfig: {
    username: { type: String },
    password: { type: String },
    token: { type: String },
    customHeaders: { type: Map, of: String }
  },
  
  // Retry configuration
  retryConfig: {
    maxRetries: { type: Number, default: 3 },
    retryDelay: { type: Number, default: 1000 },
    backoffMultiplier: { type: Number, default: 2 },
    maxRetryDelay: { type: Number, default: 30000 }
  },
  
  // Rate limiting
  rateLimit: {
    enabled: { type: Boolean, default: false },
    requestsPerMinute: { type: Number, default: 60 },
    burstLimit: { type: Number, default: 10 }
  },
  
  // Filtering
  filters: {
    enabled: { type: Boolean, default: false },
    conditions: [{
      field: { type: String, required: true },
      operator: {
        type: String,
        enum: ['equals', 'contains', 'starts_with', 'ends_with', 'regex'],
        required: true
      },
      value: { type: String, required: true }
    }]
  },
  
  // Headers
  headers: { type: Map, of: String },
  
  // Statistics
  stats: {
    totalDeliveries: { type: Number, default: 0 },
    successfulDeliveries: { type: Number, default: 0 },
    failedDeliveries: { type: Number, default: 0 },
    lastDeliveryAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastFailureAt: { type: Date },
    averageResponseTime: { type: Number, default: 0 }
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'testing'],
    default: 'active'
  },
  lastError: {
    message: { type: String },
    timestamp: { type: Date },
    responseCode: { type: Number },
    responseBody: { type: String }
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
WebhookSchema.index({ url: 1 });
WebhookSchema.index({ events: 1 });
WebhookSchema.index({ isActive: 1 });
WebhookSchema.index({ status: 1 });
WebhookSchema.index({ createdBy: 1 });
WebhookSchema.index({ createdAt: -1 });

// Compound indexes
WebhookSchema.index({ isActive: 1, status: 1 });
WebhookSchema.index({ events: 1, isActive: 1 });

export default mongoose.model<IWebhook>('Webhook', WebhookSchema);