import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationRule extends Document {
  name: string;
  workspaceId: any;
  description?: string;
  isActive: boolean;
  type?: string;
  postInteraction?: boolean;
  platform?: string;
  keywords?: string[];
  responses?: any;
  targetMediaIds?: string[];
  
  // Follower Gate Funnel Configuration
  followerGate?: {
    enabled: boolean;
    lockedMessage?: string;
    visitProfileLabel?: string;
    confirmLabel?: string;
    retryMessage?: string;
    successMessage?: string;
    delay?: string;
    maxRetries?: number;
  };
  
  // Advanced Trigger configuration
  matchMode?: 'exact' | 'contains' | 'intent' | 'any';
  negativeKeywords?: string[];
  aiIntents?: string[];
  
  trigger: Record<string, any>;
  triggers: Record<string, any>;
  action: Record<string, any>;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const AutomationRuleSchema = new Schema<IAutomationRule>({
  name: { type: String, required: true },
  workspaceId: { type: Schema.Types.Mixed, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  type: { type: String },
  postInteraction: { type: Boolean },
  platform: { type: String },
  keywords: [{ type: String }],
  responses: { type: Schema.Types.Mixed },
  targetMediaIds: [{ type: String }],
  
  followerGate: {
    enabled: { type: Boolean, default: false },
    lockedMessage: { type: String },
    visitProfileLabel: { type: String },
    confirmLabel: { type: String },
    retryMessage: { type: String },
    successMessage: { type: String },
    delay: { type: String },
    maxRetries: { type: Number }
  },
  
  matchMode: { type: String, enum: ['exact', 'contains', 'intent', 'any'], default: 'contains' },
  negativeKeywords: [{ type: String }],
  aiIntents: [{ type: String }],

  trigger: { type: Schema.Types.Mixed, default: {} },
  triggers: { type: Schema.Types.Mixed, default: {} },
  action: { type: Schema.Types.Mixed, default: {} },
  lastRun: { type: Date },
  nextRun: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AutomationRuleSchema.index({ workspaceId: 1 }, { background: true });
AutomationRuleSchema.index({ isActive: 1 }, { background: true });
AutomationRuleSchema.index({ workspaceId: 1, isActive: 1 }, { background: true });
AutomationRuleSchema.index({ nextRun: 1 }, { background: true });

export const AutomationRuleModel = mongoose.models.AutomationRule as mongoose.Model<IAutomationRule> || mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
