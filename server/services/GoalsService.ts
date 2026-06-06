import { BaseService } from './BaseService';
import Goal, { IGoal } from '../models/Goal';
import { NotFoundError, ValidationError } from '../errors';

interface CreateGoalInput {
    workspaceId: string;
    type: 'followers' | 'engagement' | 'revenue' | 'posts' | 'custom';
    title: string;
    description?: string;
    target: number;
    deadline?: Date;
}

interface UpdateGoalInput {
    current?: number;
    status?: 'active' | 'completed' | 'cancelled' | 'overdue';
    target?: number;
    deadline?: Date;
}

export class GoalsService extends BaseService {
    constructor() {
        super('GoalsService');
    }

    async getGoalsByWorkspace(workspaceId: string): Promise<IGoal[]> {
        return this.withErrorHandling('getGoalsByWorkspace', async () => {
            // Logic to check/update status based on deadline could go here
            return Goal.find({ workspaceId }).sort({ createdAt: -1 });
        });
    }

    async createGoal(input: CreateGoalInput): Promise<IGoal> {
        return this.withErrorHandling('createGoal', async () => {
            if (!input.target || input.target <= 0) {
                throw new ValidationError('Target must be greater than 0');
            }

            const goal = await Goal.create({
                ...input,
                current: 0,
                status: 'active'
            });

            this.log('createGoal', 'Goal created', { goalId: goal._id });
            return goal;
        });
    }

    async updateGoal(goalId: string, input: UpdateGoalInput): Promise<IGoal> {
        return this.withErrorHandling('updateGoal', async () => {
            const goal = await Goal.findById(goalId);
            if (!goal) {
                throw new NotFoundError('Goal', goalId);
            }

            // Automatically update status if target reached
            let newStatus = input.status || goal.status;
            const newCurrent = input.current !== undefined ? input.current : goal.current;
            const newTarget = input.target !== undefined ? input.target : goal.target;

            if (newCurrent >= newTarget && newStatus === 'active') {
                newStatus = 'completed';
            }

            Object.assign(goal, {
                ...input,
                current: newCurrent,
                target: newTarget,
                status: newStatus
            });

            await goal.save();
            this.log('updateGoal', 'Goal updated', { goalId });
            return goal;
        });
    }

    async deleteGoal(goalId: string): Promise<void> {
        return this.withErrorHandling('deleteGoal', async () => {
            const result = await Goal.findByIdAndDelete(goalId);
            if (!result) {
                throw new NotFoundError('Goal', goalId);
            }
            this.log('deleteGoal', 'Goal deleted', { goalId });
        });
    }
}

export const goalsService = new GoalsService();
