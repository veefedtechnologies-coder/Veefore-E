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
  trigger: { type: Schema.Types.Mixed, default: {} },
  triggers: { type: Schema.Types.Mixed, default: {} },
  action: { type: Schema.Types.Mixed, default: {} },
  lastRun: { type: Date },
  nextRun: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const AutomationRuleModel = mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
