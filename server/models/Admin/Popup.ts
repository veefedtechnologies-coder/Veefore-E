import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPopup extends Document {
  title: string;
  content: string;
  type: string;
  priority: string;
  isActive: boolean;
  targetUserType?: string;
  displayConditions?: any;
  actionButton?: any;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PopupSchema = new Schema<IPopup>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, required: true },
  priority: { type: String, default: 'medium' },
  isActive: { type: Boolean, default: true },
  targetUserType: String,
  displayConditions: { type: Schema.Types.Mixed },
  actionButton: { type: Schema.Types.Mixed },
  startDate: Date,
  endDate: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const PopupModel: Model<IPopup> = mongoose.models.Popup as Model<IPopup> || mongoose.model<IPopup>('Popup', PopupSchema);
export { PopupSchema };
