import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { workspaceService } from '../services';

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
});

type CreateWorkspaceBody = z.infer<typeof CreateWorkspaceSchema>;

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
});

const SetDefaultSchema = z.object({
  workspaceId: z.string().min(1),
});

export class WorkspaceController extends BaseController {
  getWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const workspace = await workspaceService.getWorkspaceById(workspaceId);
    this.sendSuccess(res, workspace);
  });

  getUserWorkspaces = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    const userId = req.user!.id;
    const workspaces = await workspaceService.getWorkspacesByUserId(userId);
    this.sendSuccess(res, workspaces);
  });

  createWorkspace = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CreateWorkspaceSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const input = CreateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.createWorkspace({
      userId,
      name: input.name,
      description: input.description,
      theme: input.theme,
      aiPersonality: input.aiPersonality,
    });
    this.sendCreated(res, workspace, 'Workspace created successfully');
  });

  updateWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof UpdateWorkspaceSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = UpdateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.updateWorkspace(workspaceId, userId, input);
    this.sendSuccess(res, workspace, 200, 'Workspace updated successfully');
  });

  deleteWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    await workspaceService.deleteWorkspace(workspaceId, userId);
    this.sendNoContent(res);
  });

  setDefault = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof SetDefaultSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = SetDefaultSchema.parse(req.body);
    const workspace = await workspaceService.setDefaultWorkspace(userId, workspaceId);
    this.sendSuccess(res, workspace, 200, 'Default workspace updated');
  });

  generateInviteCode = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const inviteCode = await workspaceService.generateInviteCode(workspaceId, userId);
    this.sendSuccess(res, { inviteCode });
  });

  getStats = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const stats = await workspaceService.getWorkspaceStats(workspaceId);
    this.sendSuccess(res, stats);
  });
}

export const workspaceController = new WorkspaceController();
