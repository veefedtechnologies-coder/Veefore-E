import mongoose, { Schema, Document } from 'mongoose';

export interface IGoal extends Document {
    workspaceId: mongoose.Types.ObjectId;
    type: 'followers' | 'engagement' | 'revenue' | 'posts' | 'custom';
    title: string;
    description?: string;
    target: number;
    current: number;
    deadline?: Date;
    status: 'active' | 'completed' | 'cancelled' | 'overdue';
    icon?: string;
    createdAt: Date;
    updatedAt: Date;
}

const GoalSchema: Schema = new Schema({
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    type: {
        type: String,
        enum: ['followers', 'engagement', 'revenue', 'posts', 'custom'],
        required: true
    },
    title: { type: String, required: true },
    description: { type: String },
    target: { type: Number, required: true },
    current: { type: Number, default: 0 },
    deadline: { type: Date },
    status: {
        type: String,
        enum: ['active', 'completed', 'cancelled', 'overdue'],
        default: 'active'
    },
    icon: { type: String }
}, {
    timestamps: true
});

// Index for faster queries by workspace
GoalSchema.index({ workspaceId: 1 });

export default mongoose.models.Goal || mongoose.model<IGoal>('Goal', GoalSchema);
