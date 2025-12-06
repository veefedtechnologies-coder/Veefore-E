import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import {
  automationRuleRepository,
  dmConversationRepository,
  dmMessageRepository,
} from '../repositories';
import { ValidationError, NotFoundError } from '../errors';

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const RuleIdParams = z.object({
  ruleId: z.string().min(1),
});

const ConversationIdParams = z.object({
  conversationId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const TriggerSchema = z.object({
  type: z.enum(['keyword', 'mention', 'dm', 'comment', 'follow', 'story_reply', 'scheduled']),
  keywords: z.array(z.string()).optional(),
  schedule: z.string().optional(),
  conditions: z.record(z.any()).optional(),
});

const ActionSchema = z.object({
  type: z.enum(['reply', 'dm', 'like', 'follow', 'notify', 'webhook', 'tag']),
  message: z.string().optional(),
  template: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  delay: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['auto_reply', 'dm_automation', 'comment_moderation', 'engagement', 'notification']),
  platform: z.enum(['instagram', 'twitter', 'facebook', 'linkedin', 'all']),
  trigger: TriggerSchema,
  actions: z.array(ActionSchema).min(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(100).default(50),
  schedule: z.object({
    timezone: z.string().optional(),
    activeHours: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    activeDays: z.array(z.number().int().min(0).max(6)).optional(),
  }).optional(),
});

const UpdateRuleSchema = CreateRuleSchema.partial();

const ToggleRuleSchema = z.object({
  isActive: z.boolean(),
});

const SendDmMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  attachments: z.array(z.object({
    type: z.enum(['image', 'video', 'file']),
    url: z.string().url(),
    filename: z.string().optional(),
  })).optional(),
  quickReplies: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export class AutomationController extends BaseController {
  createRule = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof CreateRuleSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = CreateRuleSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const rule = await automationRuleRepository.create({
      workspaceId,
      userId,
      name: input.name,
      description: input.description,
      type: input.type,
      platform: input.platform,
      trigger: input.trigger,
      actions: input.actions,
      isActive: input.isActive,
      priority: input.priority,
      schedule: input.schedule,
    });

    this.sendCreated(res, rule, 'Automation rule created successfully');
  });

  getRules = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string; active?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const activeOnly = req.query.active === 'true';

    let result;
    if (activeOnly) {
      const activeRules = await automationRuleRepository.findActiveByWorkspaceId(workspaceId);
      result = {
        data: activeRules,
        page: 1,
        limit: activeRules.length,
        total: activeRules.length,
        totalPages: 1,
      };
    } else {
      result = await automationRuleRepository.findByWorkspaceId(workspaceId, { page, limit });
    }

    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getRule = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; ruleId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { ruleId } = RuleIdParams.parse(req.params);

    const rule = await automationRuleRepository.findById(ruleId);
    if (!rule) {
      throw new NotFoundError('Automation rule not found');
    }

    if (rule.workspaceId !== workspaceId) {
      throw new ValidationError('Rule does not belong to this workspace');
    }

    this.sendSuccess(res, rule);
  });

  updateRule = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; ruleId: string }, z.infer<typeof UpdateRuleSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { ruleId } = RuleIdParams.parse(req.params);
    const input = UpdateRuleSchema.parse(req.body);

    const existingRule = await automationRuleRepository.findById(ruleId);
    if (!existingRule) {
      throw new NotFoundError('Automation rule not found');
    }

    if (existingRule.workspaceId !== workspaceId) {
      throw new ValidationError('Rule does not belong to this workspace');
    }

    const updatedRule = await automationRuleRepository.updateById(ruleId, {
      ...input,
      updatedAt: new Date(),
    });

    this.sendSuccess(res, updatedRule, 200, 'Automation rule updated successfully');
  });

  deleteRule = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; ruleId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { ruleId } = RuleIdParams.parse(req.params);

    const rule = await automationRuleRepository.findById(ruleId);
    if (!rule) {
      throw new NotFoundError('Automation rule not found');
    }

    if (rule.workspaceId !== workspaceId) {
      throw new ValidationError('Rule does not belong to this workspace');
    }

    await automationRuleRepository.deleteById(ruleId);
    this.sendNoContent(res);
  });

  toggleRule = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; ruleId: string }, z.infer<typeof ToggleRuleSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { ruleId } = RuleIdParams.parse(req.params);
    const { isActive } = ToggleRuleSchema.parse(req.body);

    const rule = await automationRuleRepository.findById(ruleId);
    if (!rule) {
      throw new NotFoundError('Automation rule not found');
    }

    if (rule.workspaceId !== workspaceId) {
      throw new ValidationError('Rule does not belong to this workspace');
    }

    const updatedRule = await automationRuleRepository.toggleActive(ruleId, isActive);
    this.sendSuccess(res, updatedRule, 200, `Automation rule ${isActive ? 'activated' : 'deactivated'} successfully`);
  });

  getDmConversations = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string; active?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const activeOnly = req.query.active === 'true';

    let result;
    if (activeOnly) {
      result = await dmConversationRepository.findActiveConversations(workspaceId, { page, limit });
    } else {
      result = await dmConversationRepository.findByWorkspaceId(workspaceId, { page, limit });
    }

    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getRecentConversations = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);

    const conversations = await dmConversationRepository.findRecentConversations(workspaceId, limit);
    this.sendSuccess(res, conversations);
  });

  getDmMessages = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; conversationId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { conversationId } = ConversationIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);

    const conversation = await dmConversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    if (conversation.workspaceId !== workspaceId) {
      throw new ValidationError('Conversation does not belong to this workspace');
    }

    const result = await dmMessageRepository.findByConversationId(conversationId, { page, limit });
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  sendDmMessage = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; conversationId: string }, z.infer<typeof SendDmMessageSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { conversationId } = ConversationIdParams.parse(req.params);
    const input = SendDmMessageSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const conversation = await dmConversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    if (conversation.workspaceId !== workspaceId) {
      throw new ValidationError('Conversation does not belong to this workspace');
    }

    const message = await dmMessageRepository.create({
      conversationId,
      content: input.message,
      sender: 'user',
      attachments: input.attachments,
      quickReplies: input.quickReplies,
      metadata: input.metadata,
      aiResponse: false,
    });

    await dmConversationRepository.incrementMessageCount(conversationId);

    this.sendCreated(res, message, 'Message sent successfully');
  });
}

export const automationController = new AutomationController();
