import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  ChatConversation,
  IChatConversation,
  ChatMessage,
  IChatMessage,
} from '../models/Chat';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

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
