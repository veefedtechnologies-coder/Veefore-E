/**
 * VideoModelCapabilities — versioned, append-only provider/model capability metadata.
 *
 * The persisted form of the Provider_Capability_Registry record (Req 7.1, 7.5,
 * master §2/§34). Each document is ONE immutable version of a provider/model's
 * capabilities: supported operations, editable-input/output duration bounds,
 * output resolutions, input/output modalities, routing priority, per-output-second
 * cost, and the protected elements it can guarantee.
 *
 * Version history is append-only: a model upgrade inserts a NEW document with a
 * new `version` for the same (provider, model); prior versions are RETAINED and
 * never mutated (Req 7.5). A unique compound index on (provider, model, version)
 * rejects duplicate versions at the database level, mirroring the pure core's
 * DUPLICATE_VERSION guard. Provider limits live here as metadata so providers/
 * models can be upgraded without changing routing source code (Req 7.3).
 *
 * Uses the hot-reload-safe `mongoose.models.X || mongoose.model(...)` idiom and
 * `{ timestamps: true }`; re-exported from `server/models/index.ts` via the
 * VideoEditor barrel.
 */

import mongoose, { Schema, Model } from 'mongoose';

/** Inclusive numeric bounds (seconds); persisted with `min <= max`, `min >= 0`. */
export interface IDurationBounds {
  min: number;
  max: number;
}

// NOTE: This is the raw document type — it intentionally does NOT `extends Document`.
// A top-level `model` field collides with Mongoose's inherited `Document.model()`
// method (TS2430), and Mongoose 8's `Schema<T>`/`Model<T>` expect the raw doc type
// anyway (hydrated instances still get `.save()`, `._id`, etc. via HydratedDocument).
export interface IVideoModelCapabilities {
  provider: string;               // indexed
  model: string;                  // indexed
  version: string;                // append-only version id (Req 7.5)
  supportedOperations: string[];  // required, non-empty
  editableInputSeconds: IDurationBounds; // required (Req 7.1)
  outputSeconds: IDurationBounds;        // required (Req 7.1)
  outputResolutions: string[];    // required, non-empty
  inputModalities: string[];      // required, non-empty
  outputModalities: string[];     // required, non-empty
  priorityRank: number;           // routing tie-break (Req 6.4)
  costPerOutputSecondInr: number; // fuels additionalProviderCostInr metering
  guaranteesPreservation: string[]; // protected elements this model can guarantee
  createdAt: Date;
  updatedAt: Date;
}

const DurationBoundsSchema = new Schema<IDurationBounds>(
  {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const VideoModelCapabilitiesSchema = new Schema<IVideoModelCapabilities>(
  {
    provider: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    version: { type: String, required: true },
    supportedOperations: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'supportedOperations must be a non-empty array',
      },
    },
    editableInputSeconds: { type: DurationBoundsSchema, required: true },
    outputSeconds: { type: DurationBoundsSchema, required: true },
    outputResolutions: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'outputResolutions must be a non-empty array',
      },
    },
    inputModalities: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'inputModalities must be a non-empty array',
      },
    },
    outputModalities: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'outputModalities must be a non-empty array',
      },
    },
    priorityRank: { type: Number, required: true, default: 0 },
    costPerOutputSecondInr: { type: Number, required: true, default: 0 },
    guaranteesPreservation: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Append-only immutability guard: a given (provider, model, version) can exist
// at most once, so a stored version can never be silently overwritten (Req 7.5).
VideoModelCapabilitiesSchema.index(
  { provider: 1, model: 1, version: 1 },
  { unique: true }
);

// Version-history reads oldest-first for a provider/model (Req 7.5).
VideoModelCapabilitiesSchema.index({ provider: 1, model: 1, createdAt: 1 });

export const VideoModelCapabilitiesModel: Model<IVideoModelCapabilities> =
  (mongoose.models.VideoModelCapabilities as Model<IVideoModelCapabilities>) ||
  mongoose.model<IVideoModelCapabilities>(
    'VideoModelCapabilities',
    VideoModelCapabilitiesSchema
  );

export { VideoModelCapabilitiesSchema };
