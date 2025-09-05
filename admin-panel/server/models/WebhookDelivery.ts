import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhookDelivery extends Document {
  _id: string;
  webhookId: string;
  event: string;
  payload: any;
  
  // Request details
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  };
  
  // Response details
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    responseTime: number; // in milliseconds
  };
  
  // Status
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  
  // Error details
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  
  // Timing
  scheduledAt: Date;
  deliveredAt?: Date;
  nextRetryAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>({
  webhookId: {
    type: String,
    required: true,
    ref: 'Webhook'
  },
  event: {
    type: String,
    required: true
  },
  payload: {
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Request details
  request: {
    url: { type: String, required: true },
    method: { type: String, default: 'POST' },
    headers: { type: Map, of: String },
    body: { type: String, required: true }
  },
  
  // Response details
  response: {
    statusCode: { type: Number },
    headers: { type: Map, of: String },
    body: { type: String },
    responseTime: { type: Number, default: 0 }
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'retrying'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  
  // Error details
  error: {
    message: { type: String },
    code: { type: String },
    stack: { type: String }
  },
  
  // Timing
  scheduledAt: {
    type: Date,
    default: Date.now
  },
  deliveredAt: {
    type: Date
  },
  nextRetryAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
WebhookDeliverySchema.index({ webhookId: 1 });
WebhookDeliverySchema.index({ event: 1 });
WebhookDeliverySchema.index({ status: 1 });
WebhookDeliverySchema.index({ scheduledAt: 1 });
WebhookDeliverySchema.index({ createdAt: -1 });

// Compound indexes
WebhookDeliverySchema.index({ webhookId: 1, status: 1 });
WebhookDeliverySchema.index({ status: 1, scheduledAt: 1 });
WebhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });

export default mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);
