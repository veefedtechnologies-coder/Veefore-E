import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationFunnelState extends Document {
  workspaceId: string;
  accountId: string;
  participantId: string;
  commentId: string;
  ruleId: string;
  state: 'pending_follow' | 'pending_custom_reply' | 'processing' | 'completed' | 'retrying';
  retryCount: number;
  finalMessage?: string;
  finalButtons?: any[];
  expectedPayload?: string;
  buttonText?: string;
  username?: string;
  variables?: Record<string, any>;
  followUpButtons?: any[];
  createdAt: Date;
  updatedAt: Date;
}

export const AutomationFunnelStateSchema = new Schema<IAutomationFunnelState>({
  workspaceId: { type: String, required: true },
  accountId: { type: String, required: true },
  participantId: { type: String, required: true },
  commentId: { type: String, required: true },
  ruleId: { type: String, required: true },
  state: { type: String, enum: ['pending_follow', 'pending_custom_reply', 'processing', 'completed', 'retrying'], default: 'pending_follow' },
  retryCount: { type: Number, default: 0 },
  finalMessage: { type: String },
  finalButtons: [{ type: Schema.Types.Mixed }],
  expectedPayload: { type: String },
  buttonText: { type: String },
  username: { type: String },
  variables: { type: Schema.Types.Mixed },
  followUpButtons: [{ type: Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound indexes for quick lookup when webhooks arrive
AutomationFunnelStateSchema.index({ accountId: 1, participantId: 1, state: 1 });
AutomationFunnelStateSchema.index({ participantId: 1, state: 1, expectedPayload: 1 });
AutomationFunnelStateSchema.index({ commentId: 1 });

export const AutomationFunnelStateModel = mongoose.models.AutomationFunnelState as mongoose.Model<IAutomationFunnelState> || mongoose.model<IAutomationFunnelState>('AutomationFunnelState', AutomationFunnelStateSchema);
