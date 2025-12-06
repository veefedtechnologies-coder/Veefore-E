import mongoose from 'mongoose';
import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  ChatConversation,
  IChatConversation,
  ChatMessage,
  IChatMessage,
} from '../models/Chat';
import { logger } from '../config/logger';
import { DatabaseError, ValidationError } from '../errors';
import type { ChatConversation as ChatConversationType } from '@shared/schema';

export class ChatConversationRepository extends BaseRepository<IChatConversation> {
  constructor() {
    super(ChatConversation, 'ChatConversation');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserAndWorkspace(userId: string, workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ userId, workspaceId }, options);
  }

  async findRecentConversations(userId: string, limit: number = 20): Promise<IChatConversation[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId })
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('findRecentConversations', this.entityName, Date.now() - startTime, { userId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findRecentConversations', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to find recent conversations', error as Error);
    }
  }

  async incrementMessageCount(conversationId: string): Promise<IChatConversation | null> {
    return this.updateById(conversationId, {
      $inc: { messageCount: 1 },
      lastMessageAt: new Date(),
      updatedAt: new Date()
    });
  }

  async updateTitle(conversationId: string, title: string): Promise<IChatConversation | null> {
    return this.updateById(conversationId, { title, updatedAt: new Date() });
  }

  async searchByTitle(userId: string, searchQuery: string, options?: PaginationOptions) {
    return this.findMany({
      userId,
      title: { $regex: searchQuery, $options: 'i' }
    }, options);
  }

  async getConversationStats(userId: string): Promise<{ totalConversations: number; totalMessages: number }> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: '$messageCount' }
          }
        }
      ]).exec();
      logger.db.query('getConversationStats', this.entityName, Date.now() - startTime, { userId });
      return {
        totalConversations: result[0]?.totalConversations || 0,
        totalMessages: result[0]?.totalMessages || 0
      };
    } catch (error) {
      logger.db.error('getConversationStats', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get conversation stats', error as Error);
    }
  }

  async deleteConversationWithMessages(conversationId: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const conversation = await this.findById(conversationId);
      if (!conversation) return false;

      await ChatMessage.deleteMany({ conversationId: conversation.id }).exec();
      const deleted = await this.deleteById(conversationId);
      
      logger.db.query('deleteConversationWithMessages', this.entityName, Date.now() - startTime, { conversationId });
      return deleted;
    } catch (error) {
      logger.db.error('deleteConversationWithMessages', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to delete conversation with messages', error as Error);
    }
  }

  private formatConversation(doc: IChatConversation): ChatConversationType {
    return {
      id: doc.id,
      userId: doc.userId as unknown as number,
      workspaceId: doc.workspaceId as unknown as number,
      title: doc.title,
      messageCount: doc.messageCount,
      lastMessageAt: doc.lastMessageAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  async findByWorkspaceSorted(workspaceId: string, userId?: string): Promise<ChatConversationType[]> {
    const startTime = Date.now();
    try {
      if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
        return [];
      }
      if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
        return [];
      }

      const query = userId 
        ? { workspaceId, userId }
        : { workspaceId };

      const conversations = await this.model
        .find(query)
        .sort({ updatedAt: -1 })
        .exec();

      logger.db.query('findByWorkspaceSorted', this.entityName, Date.now() - startTime, { 
        workspaceId, 
        userId, 
        count: conversations.length 
      });

      return conversations.map(doc => this.formatConversation(doc));
    } catch (error) {
      logger.db.error('findByWorkspaceSorted', error, { entityName: this.entityName, workspaceId, userId });
      throw new DatabaseError('Failed to find conversations by workspace', error as Error);
    }
  }

  async findByUserSorted(userId: string, workspaceId?: string): Promise<ChatConversationType[]> {
    const startTime = Date.now();
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return [];
      }
      if (workspaceId && !mongoose.Types.ObjectId.isValid(workspaceId)) {
        return [];
      }

      const conversations = workspaceId
        ? await this.findMany({ userId, workspaceId }, { sortBy: 'updatedAt', sortOrder: 'desc' })
        : await this.findMany({ userId }, { sortBy: 'updatedAt', sortOrder: 'desc' });

      logger.db.query('findByUserSorted', this.entityName, Date.now() - startTime, { 
        userId, 
        workspaceId, 
        count: conversations.length 
      });

      return conversations.map(doc => this.formatConversation(doc));
    } catch (error) {
      logger.db.error('findByUserSorted', error, { entityName: this.entityName, userId, workspaceId });
      throw new DatabaseError('Failed to find conversations by user', error as Error);
    }
  }

  async createWithDefaults(data: { userId: string; workspaceId: string; title?: string }): Promise<ChatConversationType> {
    const startTime = Date.now();
    try {
      if (!mongoose.Types.ObjectId.isValid(data.userId)) {
        throw new ValidationError('Invalid userId format');
      }
      if (data.workspaceId && !mongoose.Types.ObjectId.isValid(data.workspaceId)) {
        throw new ValidationError('Invalid workspaceId format');
      }

      const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);

      const conversationData = {
        id: numericId,
        userId: data.userId,
        workspaceId: data.workspaceId,
        title: data.title || 'New chat',
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const saved = await this.create(conversationData);

      logger.db.query('createWithDefaults', this.entityName, Date.now() - startTime, { 
        userId: data.userId, 
        workspaceId: data.workspaceId 
      });

      return this.formatConversation(saved);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      logger.db.error('createWithDefaults', error, { entityName: this.entityName, data });
      throw new DatabaseError('Failed to create conversation', error as Error);
    }
  }
}

export class ChatMessageRepository extends BaseRepository<IChatMessage> {
  constructor() {
    super(ChatMessage, 'ChatMessage');
  }

  async findByConversationId(conversationId: number, options?: PaginationOptions) {
    return this.findMany({ conversationId }, options);
  }

  async findByRole(role: 'user' | 'assistant', options?: PaginationOptions) {
    return this.findMany({ role }, options);
  }

  async getRecentMessages(conversationId: number, limit: number = 50): Promise<IChatMessage[]> {
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

  async getMessagesAfter(conversationId: number, afterDate: Date): Promise<IChatMessage[]> {
    return this.findAll({
      conversationId,
      createdAt: { $gt: afterDate }
    });
  }

  async getMessagesBefore(conversationId: number, beforeDate: Date, limit: number = 20): Promise<IChatMessage[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ conversationId, createdAt: { $lt: beforeDate } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getMessagesBefore', this.entityName, Date.now() - startTime, { conversationId });
      return result.reverse();
    } catch (error) {
      logger.db.error('getMessagesBefore', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to get messages before date', error as Error);
    }
  }

  async getTotalTokensUsed(conversationId: number): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { conversationId } },
        { $group: { _id: null, total: { $sum: '$tokensUsed' } } }
      ]).exec();
      logger.db.query('getTotalTokensUsed', this.entityName, Date.now() - startTime, { conversationId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalTokensUsed', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to get total tokens used', error as Error);
    }
  }

  async searchMessages(conversationId: number, searchQuery: string, options?: PaginationOptions) {
    return this.findMany({
      conversationId,
      content: { $regex: searchQuery, $options: 'i' }
    }, options);
  }

  async deleteMessagesByConversationId(conversationId: number): Promise<number> {
    return this.deleteMany({ conversationId });
  }

  async getLastMessage(conversationId: number): Promise<IChatMessage | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOne({ conversationId })
        .sort({ createdAt: -1 })
        .exec();
      logger.db.query('getLastMessage', this.entityName, Date.now() - startTime, { conversationId });
      return result;
    } catch (error) {
      logger.db.error('getLastMessage', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to get last message', error as Error);
    }
  }

  async countMessagesByRole(conversationId: number): Promise<{ user: number; assistant: number }> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { conversationId } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]).exec();
      
      const counts = { user: 0, assistant: 0 };
      result.forEach((item: { _id: 'user' | 'assistant'; count: number }) => {
        counts[item._id] = item.count;
      });
      
      logger.db.query('countMessagesByRole', this.entityName, Date.now() - startTime, { conversationId });
      return counts;
    } catch (error) {
      logger.db.error('countMessagesByRole', error, { entityName: this.entityName, conversationId });
      throw new DatabaseError('Failed to count messages by role', error as Error);
    }
  }
}

export const chatConversationRepository = new ChatConversationRepository();
export const chatMessageRepository = new ChatMessageRepository();
