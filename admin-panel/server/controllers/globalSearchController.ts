import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GlobalSearchService } from '../services/globalSearchService';

export class GlobalSearchController {
  private searchService: GlobalSearchService;

  constructor() {
    this.searchService = GlobalSearchService.getInstance();
  }

  // Perform global search
  static async search(req: AuthRequest, res: Response) {
    try {
      const {
        q: query,
        types: entityTypes,
        limit = 20,
        offset = 0,
        sortBy = 'relevance',
        sortOrder = 'desc',
        ...filters
      } = req.query;

      if (!query || query.toString().trim().length < 2) {
        return res.json({
          success: true,
          data: {
            results: [],
            total: 0,
            facets: {}
          }
        });
      }

      const searchOptions = {
        query: query.toString(),
        entityTypes: entityTypes ? (Array.isArray(entityTypes) ? entityTypes as string[] : [entityTypes as string]) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        filters,
        sortBy: sortBy as 'relevance' | 'date' | 'priority',
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const results = await GlobalSearchService.getInstance().search(searchOptions);

      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      console.error('Error performing global search:', error);
      res.status(500).json({
        success: false,
        message: 'Search failed'
      });
    }
  }

  // Get search suggestions
  static async getSuggestions(req: AuthRequest, res: Response) {
    try {
      const { q: query, limit = 5 } = req.query;

      if (!query || query.toString().trim().length < 2) {
        return res.json({
          success: true,
          data: []
        });
      }

      const suggestions = await GlobalSearchService.getInstance().getSuggestions(
        query.toString(),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: suggestions
      });
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get suggestions'
      });
    }
  }

  // Index entity
  static async indexEntity(req: AuthRequest, res: Response) {
    try {
      const { entityType, entityId } = req.params;
      const data = req.body;

      await GlobalSearchService.getInstance().indexEntity(entityType, entityId, data);

      res.json({
        success: true,
        message: 'Entity indexed successfully'
      });
    } catch (error) {
      console.error('Error indexing entity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to index entity'
      });
    }
  }

  // Remove entity from index
  static async removeEntity(req: AuthRequest, res: Response) {
    try {
      const { entityType, entityId } = req.params;

      await GlobalSearchService.getInstance().removeEntity(entityType, entityId);

      res.json({
        success: true,
        message: 'Entity removed from index successfully'
      });
    } catch (error) {
      console.error('Error removing entity from index:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove entity from index'
      });
    }
  }

  // Get search statistics
  static async getSearchStats(req: AuthRequest, res: Response) {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);

      // This would typically come from a search analytics service
      // For now, return mock data
      const stats = {
        totalSearches: 0,
        uniqueUsers: 0,
        popularQueries: [],
        searchResults: {
          users: 0,
          admins: 0,
          subscriptions: 0,
          tickets: 0,
          webhooks: 0,
          banners: 0
        },
        averageResponseTime: 0
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting search statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get search statistics'
      });
    }
  }
}
