import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { goalsService } from '../services';

const WorkspaceIdParams = z.object({
    workspaceId: z.string().min(1),
});

const GoalIdParams = z.object({
    goalId: z.string().min(1),
});

const CreateGoalSchema = z.object({
    workspaceId: z.string().min(1),
    type: z.enum(['followers', 'engagement', 'revenue', 'posts', 'custom']),
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    target: z.number().positive(),
    deadline: z.coerce.date().optional(),
});

const UpdateGoalSchema = z.object({
    current: z.number().min(0).optional(),
    status: z.enum(['active', 'completed', 'cancelled', 'overdue']).optional(),
    target: z.number().positive().optional(),
    deadline: z.coerce.date().optional(),
});

export class GoalsController extends BaseController {
    getGoals = this.wrapAsync(async (
        req: TypedRequest<{}, {}, { workspaceId: string }>,
        res: Response
    ) => {
        const { workspaceId } = WorkspaceIdParams.parse(req.query);
        const goals = await goalsService.getGoalsByWorkspace(workspaceId);
        this.sendSuccess(res, goals);
    });

    createGoal = this.wrapAsync(async (
        req: TypedRequest<{}, z.infer<typeof CreateGoalSchema>>,
        res: Response
    ) => {
        const input = CreateGoalSchema.parse(req.body);
        const goal = await goalsService.createGoal(input);
        this.sendCreated(res, goal, 'Goal created successfully');
    });

    updateGoal = this.wrapAsync(async (
        req: TypedRequest<{ goalId: string }, z.infer<typeof UpdateGoalSchema>>,
        res: Response
    ) => {
        const { goalId } = GoalIdParams.parse(req.params);
        const input = UpdateGoalSchema.parse(req.body);
        const goal = await goalsService.updateGoal(goalId, input);
        this.sendSuccess(res, goal, 200, 'Goal updated successfully');
    });

    deleteGoal = this.wrapAsync(async (
        req: TypedRequest<{ goalId: string }>,
        res: Response
    ) => {
        const { goalId } = GoalIdParams.parse(req.params);
        await goalsService.deleteGoal(goalId);
        this.sendNoContent(res);
    });
}

export const goalsController = new GoalsController();
