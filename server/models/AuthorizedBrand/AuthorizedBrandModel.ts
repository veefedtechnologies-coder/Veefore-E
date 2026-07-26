import mongoose, { Document, Schema, Model } from 'mongoose';

export type AuthorizedBrandStatus = 'INACTIVE' | 'IMPORTED' | 'EXPIRED';

export interface IAuthorizedBrand extends Document {
  userId: string;                                    // Firebase UID — the authorizing user
  pageId: string;                                    // Meta Facebook Page ID
  pageName: string;
  pageProfilePictureUrl: string;
  linkedInstagramAccountId: string | null;
  linkedInstagramUsername: string | null;
  authorizationTokenRef: mongoose.Types.ObjectId;   // ref to UserAccessToken (facebook-page-integration spec)
  /** Actual Page Access Token stored directly for import use (avoids UserAccessToken collection dependency) */
  accessToken?: string;
  /** User Access Token (long-lived) for Instagram account sync */
  userAccessToken?: string;
  tokenExpiresAt: Date;
  authorizedAt: Date;
  status: AuthorizedBrandStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AuthorizedBrandSchema = new Schema<IAuthorizedBrand>(
  {
    userId: { type: String, required: true, index: true },
    pageId: { type: String, required: true },
    pageName: { type: String, required: true },
    pageProfilePictureUrl: { type: String, required: true },
    linkedInstagramAccountId: { type: String, default: null },
    linkedInstagramUsername: { type: String, default: null },
    authorizationTokenRef: {
      type: Schema.Types.ObjectId,
      ref: 'UserAccessToken',
      required: true,
    },
    accessToken: { type: String, default: null },
    userAccessToken: { type: String, default: null },
    tokenExpiresAt: { type: Date, required: true },
    authorizedAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['INACTIVE', 'IMPORTED', 'EXPIRED'],
      required: true,
      default: 'INACTIVE',
    },
  },
  { timestamps: true }
);

// One AuthorizedBrand record per (userId, pageId) — upsert target
AuthorizedBrandSchema.index({ userId: 1, pageId: 1 }, { unique: true });

export const AuthorizedBrandModel: Model<IAuthorizedBrand> =
  (mongoose.models.AuthorizedBrand as Model<IAuthorizedBrand>) ||
  mongoose.model<IAuthorizedBrand>('AuthorizedBrand', AuthorizedBrandSchema);
