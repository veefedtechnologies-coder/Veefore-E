import mongoose, { Document, Schema } from 'mongoose';

export interface IDmTemplate extends Document {
  userId: string;
  workspaceId: any;
  automationRuleId?: string;
  
  // Default fallback template
  messageText: string;
  buttonText: string;
  buttonUrl: string;
  
  // Multi-language variations
  variants?: {
    language: string; // e.g. 'en', 'es', 'hi'
    messageText: string;
    buttonText?: string;
    buttonUrl?: string;
  }[];

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const DmTemplateSchema = new Schema<IDmTemplate>({
  userId: { type: String, required: true },
  workspaceId: { type: Schema.Types.Mixed, required: true },
  automationRuleId: { type: String },
  
  messageText: { type: String, required: true },
  buttonText: { type: String },
  buttonUrl: { type: String },
  
  variants: [{
    language: { type: String, required: true },
    messageText: { type: String, required: true },
    buttonText: { type: String },
    buttonUrl: { type: String }
  }],

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const DmTemplateModel = mongoose.models.DmTemplate as mongoose.Model<IDmTemplate> || mongoose.model<IDmTemplate>('DmTemplate', DmTemplateSchema, 'dm_templates');
