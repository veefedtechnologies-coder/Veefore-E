import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IAppSetting extends Document {
  key: string;
  value: string;
  description?: string;
  category?: string;
  isPublic: boolean;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<IAppSetting>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  description: String,
  category: String,
  isPublic: { type: Boolean, default: false },
  updatedBy: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const AppSettingModel: Model<IAppSetting> = mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);
export { AppSettingSchema };
