/**
 * Safety Feedback Mongoose Models
 * 
 * Task 22.2: Safety flag system
 * Requirements: 11.6 - User feedback on safety false positives
 */

import mongoose, { Schema, Document } from 'mongoose';

// Safety Feedback Schema
export interface ISafetyFeedback extends Document {
  userId: string;
  workspaceId: string;
  captionId?: string;
  feedbackType: 'false_positive' | 'missed_issue' | 'calibration_request';
  flaggedIssue: string;
  userRating: 'inappropriate' | 'acceptable' | 'authentic';
  comment?: string;
  caption: string;
  safetyLevel: 'off' | 'standard' | 'strict';
  originalSafetyScore: number;
  originalFlags: string[];
  status: 'pending' | 'reviewed' | 'calibrated';
  reviewedAt?: Date;
  calibrationApplied: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SafetyFeedbackSchema = new Schema<ISafetyFeedback>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    captionId: { type: String, index: true },
    feedbackType: {
      type: String,
      required: true,
      enum: ['false_positive', 'missed_issue', 'calibration_request'],
      index: true,
    },
    flaggedIssue: { type: String, required: true },
    userRating: {
      type: String,
      required: true,
      enum: ['inappropriate', 'acceptable', 'authentic'],
    },
    comment: { type: String },
    caption: { type: String, required: true },
    safetyLevel: {
      type: String,
      required: true,
      enum: ['off', 'standard', 'strict'],
    },
    originalSafetyScore: { type: Number, required: true },
    originalFlags: [{ type: String }],
    status: {
      type: String,
      required: true,
      enum: ['pending', 'reviewed', 'calibrated'],
      default: 'pending',
    },
    reviewedAt: { type: Date },
    calibrationApplied: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'safetyfeedback',
  }
);

// Indexes
SafetyFeedbackSchema.index({ userId: 1, workspaceId: 1, createdAt: -1 });
SafetyFeedbackSchema.index({ feedbackType: 1 });

export const SafetyFeedbackModel = mongoose.models.SafetyFeedback || mongoose.model<ISafetyFeedback>(
  'SafetyFeedback',
  SafetyFeedbackSchema
);

// Safety Calibration Schema
export interface ISafetyCalibration extends Document {
  userId: string;
  workspaceId: string;
  allowedPatterns: string[];
  sensitivePatterns: string[];
  customRules: {
    pattern: string;
    action: 'allow' | 'flag' | 'block';
    reason: string;
  }[];
  falsePositiveCount: number;
  feedbackCount: number;
  lastCalibrationAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SafetyCalibrationSchema = new Schema<ISafetyCalibration>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    allowedPatterns: [{ type: String }],
    sensitivePatterns: [{ type: String }],
    customRules: [
      {
        pattern: { type: String, required: true },
        action: {
          type: String,
          required: true,
          enum: ['allow', 'flag', 'block'],
        },
        reason: { type: String, required: true },
      },
    ],
    falsePositiveCount: { type: Number, default: 0 },
    feedbackCount: { type: Number, default: 0 },
    lastCalibrationAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'safetycalibration',
  }
);

// Unique index on userId + workspaceId
SafetyCalibrationSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

export const SafetyCalibrationModel = mongoose.models.SafetyCalibration || mongoose.model<ISafetyCalibration>(
  'SafetyCalibration',
  SafetyCalibrationSchema
);
