import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  AutomationRuleModel,
  IAutomationRule,
  DmConversationModel,
  IDmConversation,
  DmMessageModel,
  IDmMessage,
  ConversationContextModel,
  IConversationContext,
  DmTemplateModel,
  IDmTemplate,
} from '../models/Automation';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export interface FormattedAutomationRule {
  id: string;
  name: string;
  workspaceId: string | number;
  description: string | null;
  isActive: boolean;
  type?: string;
  postInteraction?: boolean;
  trigger: Record<string, any>;
  triggers?: Record<string, any>;
  action: Record<string, any>;
  keywords?: string[];
  responses?: any[];
  dmResponses?: any[];
  targetMediaIds?: string[];
  lastRun: Date | null;
  nextRun: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAutomationRuleData {
  name?: string;
  workspaceId: string | number;
  description?: string | null;
  isActive?: boolean;
  type?: string;
  trigger?: Record<string, any>;
  action?: Record<string, any>;
  keywords?: string[];
  responses?: any;
  targetMediaIds?: string[];
  nextRun?: Date | null;
}

export class AutomationRuleRepository extends BaseRepository<IAutomationRule> {
  constructor() {
    super(AutomationRuleModel, 'AutomationRule');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findActiveByWorkspaceId(workspaceId: string): Promise<IAutomationRule[]> {
    return this.findAll({ workspaceId, isActive: true });
  }

  async findActiveRules(options?: PaginationOptions) {
    return this.findMany({ isActive: true }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findByPlatform(platform: string, options?: PaginationOptions) {
    return this.findMany({ platform }, options);
  }

  async findByTriggerType(workspaceId: string, triggerType: string): Promise<IAutomationRule[]> {
    return this.findAll({ workspaceId, isActive: true, 'trigger.type': triggerType });
  }

  async findDueRules(): Promise<IAutomationRule[]> {
    return this.findAll({
      isActive: true,
      nextRun: { $lte: new Date() }
    });
  }

  async updateLastRun(ruleId: string, nextRun?: Date): Promise<IAutomationRule | null> {
    const updateData: any = { lastRun: new Date(), updatedAt: new Date() };
    if (nextRun) {
      updateData.nextRun = nextRun;
    }
    return this.updateById(ruleId, updateData);
  }

  async toggleActive(ruleId: string, isActive: boolean): Promise<IAutomationRule | null> {
    return this.updateById(ruleId, { isActive, updatedAt: new Date() });
  }

  async findByKeyword(workspaceId: string, keyword: string): Promise<IAutomationRule[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({
          workspaceId,
          isActive: true,
          keywords: { $in: [new RegExp(keyword, 'i')] }
        })
        .exec();
      logger.db.query('findByKeyword', this.entityName, Date.now() - startTime, { workspaceId, keyword });
      return result;
    } catch (error) {
      logger.db.error('findByKeyword', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find rules by keyword', error as Error);
    }
  }

  formatAutomationRule(rule: IAutomationRule, workspaceIdOverride?: string | number): FormattedAutomationRule {
    const trigger = rule.trigger || {};
    const action = rule.action || {};
    
    let displayResponses: any[] = [];
    let displayDmResponses: any[] = [];
    let targetMediaIds: string[] = [];
    
    if (rule.responses) {
      if (typeof rule.responses === 'object' && rule.responses.responses) {
        displayResponses = rule.responses.responses || [];
        displayDmResponses = rule.responses.dmResponses || [];
      } else if (Array.isArray(rule.responses)) {
        displayResponses = rule.responses;
      }
    }
    
    if (rule.targetMediaIds) {
      targetMediaIds = rule.targetMediaIds || [];
    }
    
    return {
      id: rule._id.toString(),
      name: rule.name || '',
      workspaceId: workspaceIdOverride !== undefined 
        ? (typeof workspaceIdOverride === 'string' ? workspaceIdOverride : parseInt(rule.workspaceId))
        : rule.workspaceId,
      description: rule.description || null,
      isActive: rule.isActive !== false,
      type: rule.type || trigger.type || action.type || 'dm',
      postInteraction: rule.postInteraction,
      trigger: trigger,
      triggers: rule.triggers || trigger,
      action: action,
      keywords: rule.keywords || [],
      responses: displayResponses,
      dmResponses: displayDmResponses,
      targetMediaIds: targetMediaIds,
      lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
      nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
      createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
      updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
    };
  }

  formatAutomationRuleSimple(rule: IAutomationRule): FormattedAutomationRule {
    return {
      id: rule._id.toString(),
      name: rule.name || '',
      workspaceId: parseInt(rule.workspaceId),
      description: rule.description || null,
      isActive: rule.isActive !== false,
      trigger: rule.trigger || {},
      action: rule.action || {},
      lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
      nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
      createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
      updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
    };
  }

  formatAutomationRuleByType(rule: IAutomationRule, type: string): FormattedAutomationRule {
    const trigger = rule.trigger || {};
    const action = rule.action || {};
    
    return {
      id: rule._id.toString(),
      name: rule.name || '',
      workspaceId: rule.workspaceId,
      description: rule.description || null,
      isActive: rule.isActive !== false,
      type: trigger.type || action.type || rule.type || type,
      trigger: trigger,
      action: action,
      lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
      nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
      createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
      updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
    };
  }

  async findByWorkspaceIdFormatted(workspaceId: string): Promise<FormattedAutomationRule[]> {
    try {
      const result = await this.findByWorkspaceId(workspaceId, { limit: 10000 });
      const rules = result.data;
      return rules.map(rule => this.formatAutomationRule(rule, workspaceId));
    } catch (error: any) {
      logger.db.error('findByWorkspaceIdFormatted', error, { entityName: this.entityName, workspaceId });
      return [];
    }
  }

  async findActiveRulesFormatted(): Promise<FormattedAutomationRule[]> {
    try {
      const result = await this.findActiveRules({ limit: 10000 });
      const rules = result.data;
      return rules.map(rule => this.formatAutomationRuleSimple(rule));
    } catch (error: any) {
      logger.db.error('findActiveRulesFormatted', error, { entityName: this.entityName });
      return [];
    }
  }

  async findByTypeFormatted(type: string): Promise<FormattedAutomationRule[]> {
    try {
      const result = await this.findByType(type, { limit: 10000 });
      const rules = result.data.filter(rule => rule.isActive !== false);
      return rules.map(rule => this.formatAutomationRuleByType(rule, type));
    } catch (error: any) {
      logger.db.error('findByTypeFormatted', error, { entityName: this.entityName, type });
      return [];
    }
  }

  async createWithDefaults(data: CreateAutomationRuleData): Promise<FormattedAutomationRule> {
    const automationRuleData = {
      name: data.name || 'Instagram Auto-Reply',
      workspaceId: data.workspaceId.toString(),
      description: data.description || null,
      isActive: data.isActive !== false,
      type: data.type || 'comment_dm',
      trigger: data.trigger || {},
      action: data.action || {},
      keywords: data.keywords || [],
      responses: data.responses || {},
      targetMediaIds: data.targetMediaIds || [],
      lastRun: null,
      nextRun: data.nextRun || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const savedRule = await this.create(automationRuleData);
    
    return {
      id: savedRule._id.toString(),
      name: savedRule.name,
      workspaceId: parseInt(savedRule.workspaceId),
      description: savedRule.description || null,
      isActive: savedRule.isActive,
      type: savedRule.type,
      trigger: savedRule.trigger || {},
      action: savedRule.action || {},
      keywords: savedRule.keywords,
      responses: savedRule.responses,
      targetMediaIds: savedRule.targetMediaIds,
      lastRun: savedRule.lastRun || null,
      nextRun: savedRule.nextRun || null,
      createdAt: savedRule.createdAt,
      updatedAt: savedRule.updatedAt
    };
  }

  async updateWithCleanup(id: string, updates: Partial<FormattedAutomationRule>): Promise<FormattedAutomationRule> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date()
    };
    
    delete updateData.id;
    delete updateData.createdAt;
    
    const result = await this.updateById(id, updateData);
    
    if (!result) {
      throw new DatabaseError('Automation rule not found', new Error('Rule not found'));
    }
    
    return {
      id: result._id.toString(),
      name: result.name,
      workspaceId: parseInt(result.workspaceId),
      description: result.description || null,
      isActive: result.isActive !== false,
      trigger: result.trigger || {},
      action: result.action || {},
      lastRun: result.lastRun ? new Date(result.lastRun) : null,
      nextRun: result.nextRun ? new Date(result.nextRun) : null,
      createdAt: result.createdAt ? new Date(result.createdAt) : new Date(),
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date()
    };
  }
}

export class DmConversationRepository extends BaseRepository<IDmConversation> {
  constructor() {
    super(DmConversationModel, 'DmConversation');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByPlatform(platform: string, options?: PaginationOptions) {
    return this.findMany({ platform }, options);
  }

  async findByParticipantId(participantId: string): Promise<IDmConversation | null> {
    return this.findOne({ participantId });
  }

  async findByWorkspaceAndParticipant(workspaceId: string, participantId: string): Promise<IDmConversation | null> {
    return this.findOne({ workspaceId, participantId });
  }

  async findActiveConversations(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, isActive: true }, options);
  }

  async findRecentConversations(workspaceId: string, limit: number = 20): Promise<IDmConversation[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ workspaceId, isActive: true })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('findRecentConversations', this.entityName, Date.now() - startTime, { workspaceId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findRecentConversations', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find recent conversations', error as Error);
    }
  }

  async incrementMessageCount(conversationId: string): Promise<IDmConversation | null> {
    return this.updateById(conversationId, {
      $inc: { messageCount: 1 },
      lastMessageAt: new Date(),
      updatedAt: new Date()
    });
  }

  async markInactive(conversationId: string): Promise<IDmConversation | null> {
    return this.updateById(conversationId, { isActive: false, updatedAt: new Date() });
  }
}

export class DmMessageRepository extends BaseRepository<IDmMessage> {
  constructor() {
    super(DmMessageModel, 'DmMessage');
  }

  async findByConversationId(conversationId: string, options?: PaginationOptions) {
    return this.findMany({ conversationId }, options);
  }

  async findBySender(sender: 'user' | 'ai', options?: PaginationOptions) {
    return this.findMany({ sender }, options);
  }

  async findAIResponses(conversationId: string): Promise<IDmMessage[]> {
    return this.findAll({ conversationId, aiResponse: true });
  }

  async findByAutomationRuleId(automationRuleId: string, options?: PaginationOptions) {
    return this.findMany({ automationRuleId }, options);
  }

  async getRecentMessages(conversationId: string, limit: number = 50): Promise<IDmMessage[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getRecentMessages', this.entityName, Date.now() - startTime, { conversationId, count: result.length });
      return result.reverse();
    } catch (error) {
      logger.db.error('getRecentMessages', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to get recent messages', error as Error);
    }
  }

  async findBySentiment(conversationId: string, sentiment: string): Promise<IDmMessage[]> {
    return this.findAll({ conversationId, sentiment });
  }

  async findByTopics(conversationId: string, topics: string[]): Promise<IDmMessage[]> {
    return this.findAll({ conversationId, topics: { $in: topics } });
  }
}

export class ConversationContextRepository extends BaseRepository<IConversationContext> {
  constructor() {
    super(ConversationContextModel, 'ConversationContext');
  }

  async findByConversationId(conversationId: string): Promise<IConversationContext[]> {
    return this.findAll({ conversationId });
  }

  async findByContextType(conversationId: string, contextType: string): Promise<IConversationContext[]> {
    return this.findAll({ conversationId, contextType });
  }

  async findActiveContexts(conversationId: string): Promise<IConversationContext[]> {
    return this.findAll({
      conversationId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });
  }

  async findHighConfidenceContexts(conversationId: string, minConfidence: number = 80): Promise<IConversationContext[]> {
    return this.findAll({ conversationId, confidence: { $gte: minConfidence } });
  }

  async deleteExpiredContexts(): Promise<number> {
    return this.deleteMany({ expiresAt: { $lte: new Date() } });
  }
}

export class DmTemplateRepository extends BaseRepository<IDmTemplate> {
  constructor() {
    super(DmTemplateModel, 'DmTemplate');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findActiveByWorkspaceId(workspaceId: string): Promise<IDmTemplate[]> {
    return this.findAll({ workspaceId, isActive: true });
  }

  async findActiveTemplates(options?: PaginationOptions) {
    return this.findMany({ isActive: true }, options);
  }

  async toggleActive(templateId: string, isActive: boolean): Promise<IDmTemplate | null> {
    return this.updateById(templateId, { isActive, updatedAt: new Date() });
  }
}

export const automationRuleRepository = new AutomationRuleRepository();
export const dmConversationRepository = new DmConversationRepository();
export const dmMessageRepository = new DmMessageRepository();
export const conversationContextRepository = new ConversationContextRepository();
export const dmTemplateRepository = new DmTemplateRepository();
