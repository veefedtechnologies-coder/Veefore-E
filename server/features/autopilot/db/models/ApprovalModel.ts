/**
 * Auto Pilot — Approval MongoDB model (collection `autopilot_approvals`).
 *
 * An Approval is the GATE-stage record backing an Approval Card in the VeeGPT
 * chat: it references the item awaiting a decision (slot, caption, automation,
 * plan, or budget), the chat message carrying the card, the decision status,
 * any edited payload, and an expiry at the slot's publish time (R4.7).
 *
 * Queried per mission and per workspace; the expiry sweep reads pending
 * approvals by `expiresAt`.
 *
 * Satisfies Requirements: 4, 5
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type ApprovalItemType = 'content-slot' | 'caption' | 'automation' | 'plan' | 'budget'
export type ApprovalStatus = 'pending' | 'approved' | 'edited' | 'rejected' | 'expired'

export interface IApproval extends Document {
  missionId: mongoose.Types.ObjectId
  workspaceId: unknown
  itemType: ApprovalItemType
  itemRef: mongoose.Types.ObjectId
  chatMessageId?: number
  status: ApprovalStatus
  editedPayload?: Record<string, unknown>
  decidedAt?: Date
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

const ApprovalSchema = new Schema<IApproval>(
  {
    missionId: { type: Schema.Types.ObjectId, ref: 'AutoPilotMission', required: true, index: true },
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    itemType: {
      type: String,
      enum: ['content-slot', 'caption', 'automation', 'plan', 'budget'],
      required: true,
    },
    itemRef: { type: Schema.Types.ObjectId, required: true },
    // The ChatMessage carrying the Approval Card (R16.2).
    chatMessageId: { type: Number, required: false },
    status: {
      type: String,
      enum: ['pending', 'approved', 'edited', 'rejected', 'expired'],
      required: true,
      default: 'pending',
      index: true,
    },
    editedPayload: { type: Schema.Types.Mixed, required: false },
    decidedAt: { type: Date, required: false },
    // R4.7: expires at the slot's publish time.
    expiresAt: { type: Date, required: false },
  },
  { timestamps: true }
)

// Pending approvals for a mission (Mission Control count + list).
ApprovalSchema.index({ missionId: 1, status: 1 }, { background: true })
// Expiry sweep: pending approvals past their publish time within a workspace.
ApprovalSchema.index({ workspaceId: 1, status: 1, expiresAt: 1 }, { background: true })

export const ApprovalModel =
  (mongoose.models.Approval as mongoose.Model<IApproval>) ||
  mongoose.model<IApproval>('Approval', ApprovalSchema)
