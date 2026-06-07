import { BaseRepository } from './BaseRepository';
import { NicheContextModel, INicheContext } from '../models/NicheContext/NicheContext';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class NicheContextRepository extends BaseRepository<INicheContext> {
  constructor() {
    super(NicheContextModel, 'NicheContext');
  }

  /**
   * Find niche context by niche name
   */
  async findByNiche(niche: string): Promise<INicheContext | null> {
    return this.findOne({ niche: niche.toLowerCase() });
  }

  /**
   * Find multiple niche contexts by niche names
   */
  async findByNiches(niches: string[]): Promise<INicheContext[]> {
    const normalizedNiches = niches.map(n => n.toLowerCase());
    return this.findAll({ niche: { $in: normalizedNiches } });
  }

  /**
   * Update trends for a specific niche
   */
  async updateTrends(
    niche: string,
    trends: {
      trendingTopics?: string[];
      trendingHashtags?: string[];
      trendingPhrases?: string[];
    }
  ): Promise<INicheContext | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOneAndUpdate(
          { niche: niche.toLowerCase() },
          {
            $set: {
              ...trends,
              lastUpdated: new Date()
            }
          },
          { new: true, runValidators: true }
        )
        .exec();
      logger.db.query('updateTrends', this.entityName, Date.now() - startTime, { niche });
      return result;
    } catch (error) {
      logger.db.error('updateTrends', error, { entityName: this.entityName, niche });
      throw new DatabaseError('Failed to update niche trends', error as Error);
    }
  }

  /**
   * Check if niche context data is stale (older than 30 days)
   */
  async isStale(niche: string): Promise<boolean> {
    const context = await this.findByNiche(niche);
    if (!context) return true;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return context.lastUpdated < thirtyDaysAgo;
  }

  /**
   * Get all niches that need updating (older than 30 days)
   */
  async findStaleContexts(): Promise<INicheContext[]> {
    const startTime = Date.now();
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const result = await this.model
        .find({ lastUpdated: { $lt: thirtyDaysAgo } })
        .exec();
      
      logger.db.query('findStaleContexts', this.entityName, Date.now() - startTime, { count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findStaleContexts', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to find stale contexts', error as Error);
    }
  }

  /**
   * Create or update niche context
   */
  async upsert(niche: string, data: Partial<INicheContext>): Promise<INicheContext> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOneAndUpdate(
          { niche: niche.toLowerCase() },
          {
            $set: {
              ...data,
              niche: niche.toLowerCase(),
              lastUpdated: new Date()
            }
          },
          { new: true, upsert: true, runValidators: true }
        )
        .exec();
      
      logger.db.query('upsert', this.entityName, Date.now() - startTime, { niche });
      return result;
    } catch (error) {
      logger.db.error('upsert', error, { entityName: this.entityName, niche });
      throw new DatabaseError('Failed to upsert niche context', error as Error);
    }
  }
}

export const nicheContextRepository = new NicheContextRepository();
