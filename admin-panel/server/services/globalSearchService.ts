import SearchIndex from '../models/SearchIndex';
import User from '../models/User';
import Admin from '../models/Admin';
import Subscription from '../models/Subscription';
import SupportTicket from '../models/SupportTicket';
import Webhook from '../models/Webhook';
import MaintenanceBanner from '../models/MaintenanceBanner';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  description: string;
  url: string;
  score: number;
  metadata: any;
  highlighted: {
    title: string;
    description: string;
  };
}

export interface SearchOptions {
  query: string;
  entityTypes?: string[];
  limit?: number;
  offset?: number;
  filters?: {
    [key: string]: any;
  };
  sortBy?: 'relevance' | 'date' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export class GlobalSearchService {
  private static instance: GlobalSearchService;

  private constructor() {}

  public static getInstance(): GlobalSearchService {
    if (!GlobalSearchService.instance) {
      GlobalSearchService.instance = new GlobalSearchService();
    }
    return GlobalSearchService.instance;
  }

  // Perform global search
  public async search(options: SearchOptions): Promise<{
    results: SearchResult[];
    total: number;
    facets: any;
  }> {
    const {
      query,
      entityTypes = [],
      limit = 20,
      offset = 0,
      filters = {},
      sortBy = 'relevance',
      sortOrder = 'desc'
    } = options;

    // Build search query
    const searchQuery: any = {
      isActive: true
    };

    // Add text search
    if (query && query.trim()) {
      searchQuery.$text = { $search: query };
    }

    // Filter by entity types
    if (entityTypes.length > 0) {
      searchQuery.entityType = { $in: entityTypes };
    }

    // Add custom filters
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null) {
        searchQuery[`metadata.${key}`] = filters[key];
      }
    });

    // Build sort object
    let sort: any = {};
    if (query && query.trim()) {
      sort.score = { $meta: 'textScore' };
    }
    
    switch (sortBy) {
      case 'relevance':
        if (query && query.trim()) {
          sort.score = { $meta: 'textScore' };
        } else {
          sort.priority = -1;
        }
        break;
      case 'date':
        sort.createdAt = sortOrder === 'asc' ? 1 : -1;
        break;
      case 'priority':
        sort.priority = sortOrder === 'asc' ? 1 : -1;
        break;
    }

    // Execute search
    const [results, total] = await Promise.all([
      SearchIndex.find(searchQuery)
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .lean(),
      SearchIndex.countDocuments(searchQuery)
    ]);

    // Transform results
    const transformedResults = await Promise.all(
      results.map(async (item) => {
        const result = await this.transformSearchResult(item, query);
        return result;
      })
    );

    // Get facets
    const facets = await this.getSearchFacets(searchQuery);

    return {
      results: transformedResults,
      total,
      facets
    };
  }

  // Transform search result
  private async transformSearchResult(item: any, query: string): Promise<SearchResult> {
    const entityData = await this.getEntityData(item.entityType, item.entityId);
    
    return {
      id: item.entityId,
      type: item.entityType,
      title: item.title,
      description: this.truncateText(item.content, 150),
      url: this.getEntityUrl(item.entityType, item.entityId),
      score: item.score || 0,
      metadata: {
        ...item.metadata,
        ...entityData
      },
      highlighted: {
        title: this.highlightText(item.title, query),
        description: this.highlightText(this.truncateText(item.content, 150), query)
      }
    };
  }

  // Get entity data
  private async getEntityData(entityType: string, entityId: string): Promise<any> {
    try {
      switch (entityType) {
        case 'user':
          const user = await User.findById(entityId).select('email firstName lastName avatar status');
          return user ? {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            avatar: user.avatar,
            status: user.status
          } : {};
        
        case 'admin':
          const admin = await Admin.findById(entityId).select('email firstName lastName role level');
          return admin ? {
            email: admin.email,
            name: `${admin.firstName} ${admin.lastName}`,
            role: admin.role,
            level: admin.level
          } : {};
        
        case 'subscription':
          const subscription = await Subscription.findById(entityId).select('plan status amount');
          return subscription ? {
            plan: subscription.plan,
            status: subscription.status,
            amount: subscription.amount
          } : {};
        
        case 'ticket':
          const ticket = await SupportTicket.findById(entityId).select('subject status priority');
          return ticket ? {
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority
          } : {};
        
        case 'webhook':
          const webhook = await Webhook.findById(entityId).select('name url status events');
          return webhook ? {
            name: webhook.name,
            url: webhook.url,
            status: webhook.status,
            events: webhook.events
          } : {};
        
        case 'banner':
          const banner = await MaintenanceBanner.findById(entityId).select('title type priority isActive');
          return banner ? {
            title: banner.title,
            type: banner.type,
            priority: banner.priority,
            isActive: banner.isActive
          } : {};
        
        default:
          return {};
      }
    } catch (error) {
      console.error(`Error fetching entity data for ${entityType}:${entityId}:`, error);
      return {};
    }
  }

  // Get entity URL
  private getEntityUrl(entityType: string, entityId: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    
    switch (entityType) {
      case 'user':
        return `${baseUrl}/users/${entityId}`;
      case 'admin':
        return `${baseUrl}/admins/${entityId}`;
      case 'subscription':
        return `${baseUrl}/subscriptions/${entityId}`;
      case 'ticket':
        return `${baseUrl}/tickets/${entityId}`;
      case 'webhook':
        return `${baseUrl}/webhooks/${entityId}`;
      case 'banner':
        return `${baseUrl}/maintenance-banners/${entityId}`;
      default:
        return `${baseUrl}/dashboard`;
    }
  }

  // Highlight search terms
  private highlightText(text: string, query: string): string {
    if (!query || !text) return text;
    
    const terms = query.split(' ').filter(term => term.length > 0);
    let highlighted = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    });
    
    return highlighted;
  }

  // Truncate text
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // Get search facets
  private async getSearchFacets(searchQuery: any): Promise<any> {
    const facets = await SearchIndex.aggregate([
      { $match: searchQuery },
      {
        $group: {
          _id: '$entityType',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      entityTypes: facets.reduce((acc, facet) => {
        acc[facet._id] = facet.count;
        return acc;
      }, {})
    };
  }

  // Index entity
  public async indexEntity(entityType: string, entityId: string, data: any): Promise<void> {
    try {
      const searchData = this.prepareSearchData(entityType, data);
      
      await SearchIndex.findOneAndUpdate(
        { entityType, entityId },
        {
          ...searchData,
          entityType,
          entityId,
          isActive: true
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`Error indexing ${entityType}:${entityId}:`, error);
    }
  }

  // Remove entity from index
  public async removeEntity(entityType: string, entityId: string): Promise<void> {
    try {
      await SearchIndex.findOneAndUpdate(
        { entityType, entityId },
        { isActive: false }
      );
    } catch (error) {
      console.error(`Error removing ${entityType}:${entityId} from index:`, error);
    }
  }

  // Prepare search data
  private prepareSearchData(entityType: string, data: any): any {
    switch (entityType) {
      case 'user':
        return {
          title: `${data.firstName} ${data.lastName}`,
          content: `${data.email} ${data.firstName} ${data.lastName} ${data.status || ''}`,
          tags: ['user', 'customer', data.status || 'active'],
          metadata: {
            email: data.email,
            status: data.status,
            createdAt: data.createdAt
          },
          searchableFields: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            status: data.status
          },
          priority: data.status === 'active' ? 2 : 1
        };
      
      case 'admin':
        return {
          title: `${data.firstName} ${data.lastName}`,
          content: `${data.email} ${data.firstName} ${data.lastName} ${data.role} ${data.level || ''}`,
          tags: ['admin', 'staff', data.role, data.level || ''],
          metadata: {
            email: data.email,
            role: data.role,
            level: data.level,
            createdAt: data.createdAt
          },
          searchableFields: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            level: data.level
          },
          priority: data.role === 'superadmin' ? 3 : 2
        };
      
      case 'subscription':
        return {
          title: `Subscription - ${data.plan}`,
          content: `${data.plan} ${data.status} ${data.amount || ''} ${data.userId || ''}`,
          tags: ['subscription', 'payment', data.plan, data.status],
          metadata: {
            plan: data.plan,
            status: data.status,
            amount: data.amount,
            userId: data.userId,
            createdAt: data.createdAt
          },
          searchableFields: {
            plan: data.plan,
            status: data.status,
            userId: data.userId
          },
          priority: data.status === 'active' ? 2 : 1
        };
      
      case 'ticket':
        return {
          title: data.subject,
          content: `${data.subject} ${data.description || ''} ${data.status} ${data.priority}`,
          tags: ['ticket', 'support', data.status, data.priority],
          metadata: {
            subject: data.subject,
            status: data.status,
            priority: data.priority,
            userId: data.userId,
            createdAt: data.createdAt
          },
          searchableFields: {
            subject: data.subject,
            status: data.status,
            priority: data.priority,
            userId: data.userId
          },
          priority: data.priority === 'high' ? 3 : data.priority === 'medium' ? 2 : 1
        };
      
      case 'webhook':
        return {
          title: data.name,
          content: `${data.name} ${data.description || ''} ${data.url} ${data.events?.join(' ') || ''}`,
          tags: ['webhook', 'integration', data.status || 'active'],
          metadata: {
            name: data.name,
            url: data.url,
            status: data.status,
            events: data.events,
            createdAt: data.createdAt
          },
          searchableFields: {
            name: data.name,
            url: data.url,
            status: data.status
          },
          priority: data.isActive ? 2 : 1
        };
      
      case 'banner':
        return {
          title: data.title,
          content: `${data.title} ${data.message} ${data.type} ${data.priority}`,
          tags: ['banner', 'maintenance', 'announcement', data.type, data.priority],
          metadata: {
            title: data.title,
            type: data.type,
            priority: data.priority,
            isActive: data.isActive,
            createdAt: data.createdAt
          },
          searchableFields: {
            title: data.title,
            type: data.type,
            priority: data.priority
          },
          priority: data.priority === 'critical' ? 3 : data.priority === 'high' ? 2 : 1
        };
      
      default:
        return {
          title: data.title || data.name || 'Unknown',
          content: JSON.stringify(data),
          tags: [entityType],
          metadata: data,
          searchableFields: {},
          priority: 1
        };
    }
  }

  // Get search suggestions
  public async getSuggestions(query: string, limit: number = 5): Promise<string[]> {
    if (!query || query.length < 2) return [];

    const suggestions = await SearchIndex.aggregate([
      {
        $match: {
          isActive: true,
          $text: { $search: query }
        }
      },
      {
        $group: {
          _id: '$title',
          score: { $max: { $meta: 'textScore' } }
        }
      },
      {
        $sort: { score: -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 0,
          title: '$_id'
        }
      }
    ]);

    return suggestions.map(s => s.title);
  }
}
