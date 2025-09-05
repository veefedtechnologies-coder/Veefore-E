import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import Admin from '../models/Admin';
import Subscription from '../models/Subscription';
import SupportTicket from '../models/SupportTicket';
import Webhook from '../models/Webhook';
import MaintenanceBanner from '../models/MaintenanceBanner';
import { GlobalSearchService } from '../services/globalSearchService';

export interface BulkOperation {
  entityType: string;
  operation: 'update' | 'delete' | 'activate' | 'deactivate' | 'export';
  criteria: any;
  data?: any;
  options?: {
    dryRun?: boolean;
    batchSize?: number;
    confirmRequired?: boolean;
  };
}

export class BulkOperationsController {
  private searchService: GlobalSearchService;

  constructor() {
    this.searchService = GlobalSearchService.getInstance();
  }

  // Execute bulk operation
  static async executeBulkOperation(req: AuthRequest, res: Response) {
    try {
      const { entityType, operation, criteria, data, options = {} } = req.body;

      if (!entityType || !operation || !criteria) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

      // Validate operation
      const validOperations = ['update', 'delete', 'activate', 'deactivate', 'export'];
      if (!validOperations.includes(operation)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid operation'
        });
      }

      // Get entity model
      const model = getEntityModel(entityType);
      if (!model) {
        return res.status(400).json({
          success: false,
          message: 'Invalid entity type'
        });
      }

      // Execute operation
      const result = await executeBulkOperationOnModel(
        model,
        entityType,
        operation,
        criteria,
        data,
        options,
        req.admin!._id
      );

      res.json({
        success: true,
        message: `Bulk operation completed successfully`,
        data: result
      });
    } catch (error) {
      console.error('Error executing bulk operation:', error);
      res.status(500).json({
        success: false,
        message: 'Bulk operation failed'
      });
    }
  }

  // Get bulk operation preview
  static async getBulkOperationPreview(req: AuthRequest, res: Response) {
    try {
      const { entityType, operation, criteria } = req.query;

      if (!entityType || !operation || !criteria) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

      const model = getEntityModel(entityType as string);
      if (!model) {
        return res.status(400).json({
          success: false,
          message: 'Invalid entity type'
        });
      }

      // Count affected records
      const count = await model.countDocuments(JSON.parse(criteria as string));

      res.json({
        success: true,
        data: {
          affectedCount: count,
          operation,
          entityType
        }
      });
    } catch (error) {
      console.error('Error getting bulk operation preview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get operation preview'
      });
    }
  }

  // Export data
  static async exportData(req: AuthRequest, res: Response) {
    try {
      const { entityType, criteria, format = 'json', fields } = req.body;

      if (!entityType || !criteria) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

      const model = getEntityModel(entityType);
      if (!model) {
        return res.status(400).json({
          success: false,
          message: 'Invalid entity type'
        });
      }

      // Get data
      const query = model.find(JSON.parse(criteria));
      if (fields) {
        query.select(fields.join(' '));
      }

      const data = await query.lean();

      // Format data based on requested format
      let formattedData;
      let contentType;
      let filename;

      switch (format) {
        case 'csv':
          formattedData = convertToCSV(data);
          contentType = 'text/csv';
          filename = `${entityType}_export_${Date.now()}.csv`;
          break;
        case 'xlsx':
          // For Excel export, you'd typically use a library like xlsx
          formattedData = JSON.stringify(data, null, 2);
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = `${entityType}_export_${Date.now()}.xlsx`;
          break;
        default:
          formattedData = JSON.stringify(data, null, 2);
          contentType = 'application/json';
          filename = `${entityType}_export_${Date.now()}.json`;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(formattedData);
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({
        success: false,
        message: 'Export failed'
      });
    }
  }

  // Get bulk operation templates
  static async getBulkOperationTemplates(req: AuthRequest, res: Response) {
    try {
      const templates = {
        users: [
          {
            name: 'Activate Users',
            operation: 'update',
            description: 'Activate selected users',
            data: { status: 'active' }
          },
          {
            name: 'Deactivate Users',
            operation: 'update',
            description: 'Deactivate selected users',
            data: { status: 'inactive' }
          },
          {
            name: 'Delete Users',
            operation: 'delete',
            description: 'Permanently delete selected users'
          }
        ],
        admins: [
          {
            name: 'Update Admin Role',
            operation: 'update',
            description: 'Update role for selected admins',
            data: { role: 'admin' }
          },
          {
            name: 'Deactivate Admins',
            operation: 'update',
            description: 'Deactivate selected admins',
            data: { isActive: false }
          }
        ],
        subscriptions: [
          {
            name: 'Cancel Subscriptions',
            operation: 'update',
            description: 'Cancel selected subscriptions',
            data: { status: 'cancelled' }
          },
          {
            name: 'Pause Subscriptions',
            operation: 'update',
            description: 'Pause selected subscriptions',
            data: { status: 'paused' }
          }
        ],
        tickets: [
          {
            name: 'Close Tickets',
            operation: 'update',
            description: 'Close selected tickets',
            data: { status: 'closed' }
          },
          {
            name: 'Assign Priority',
            operation: 'update',
            description: 'Set priority for selected tickets',
            data: { priority: 'high' }
          }
        ],
        webhooks: [
          {
            name: 'Activate Webhooks',
            operation: 'update',
            description: 'Activate selected webhooks',
            data: { isActive: true }
          },
          {
            name: 'Deactivate Webhooks',
            operation: 'update',
            description: 'Deactivate selected webhooks',
            data: { isActive: false }
          }
        ],
        banners: [
          {
            name: 'Activate Banners',
            operation: 'update',
            description: 'Activate selected banners',
            data: { isActive: true }
          },
          {
            name: 'Deactivate Banners',
            operation: 'update',
            description: 'Deactivate selected banners',
            data: { isActive: false }
          }
        ]
      };

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      console.error('Error getting bulk operation templates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get templates'
      });
    }
  }
}

// Helper function to get entity model
function getEntityModel(entityType: string): any {
  switch (entityType) {
    case 'users':
      return User;
    case 'admins':
      return Admin;
    case 'subscriptions':
      return Subscription;
    case 'tickets':
      return SupportTicket;
    case 'webhooks':
      return Webhook;
    case 'banners':
      return MaintenanceBanner;
    default:
      return null;
  }
}

// Helper function to execute bulk operation on model
async function executeBulkOperationOnModel(
  model: any,
  entityType: string,
  operation: string,
  criteria: any,
  data: any,
  options: any,
  adminId: string
): Promise<any> {
  const batchSize = options.batchSize || 100;
  let processedCount = 0;
  let errorCount = 0;
  const errors: any[] = [];

  try {
    switch (operation) {
      case 'update':
        const updateResult = await model.updateMany(criteria, {
          ...data,
          updatedBy: adminId,
          updatedAt: new Date()
        });
        processedCount = updateResult.modifiedCount;
        break;

      case 'delete':
        const deleteResult = await model.deleteMany(criteria);
        processedCount = deleteResult.deletedCount;
        break;

      case 'activate':
        const activateResult = await model.updateMany(criteria, {
          isActive: true,
          updatedBy: adminId,
          updatedAt: new Date()
        });
        processedCount = activateResult.modifiedCount;
        break;

      case 'deactivate':
        const deactivateResult = await model.updateMany(criteria, {
          isActive: false,
          updatedBy: adminId,
          updatedAt: new Date()
        });
        processedCount = deactivateResult.modifiedCount;
        break;

      default:
        throw new Error('Invalid operation');
    }

    // Update search index
    if (operation === 'update' || operation === 'activate' || operation === 'deactivate') {
      // Re-index affected entities
      const affectedEntities = await model.find(criteria).select('_id');
      for (const entity of affectedEntities) {
        try {
          await GlobalSearchService.getInstance().indexEntity(entityType, entity._id, entity);
        } catch (error) {
          console.error(`Error re-indexing ${entityType}:${entity._id}:`, error);
        }
      }
    } else if (operation === 'delete') {
      // Remove from search index
      const affectedEntities = await model.find(criteria).select('_id');
      for (const entity of affectedEntities) {
        try {
          await GlobalSearchService.getInstance().removeEntity(entityType, entity._id);
        } catch (error) {
          console.error(`Error removing ${entityType}:${entity._id} from index:`, error);
        }
      }
    }

    return {
      processedCount,
      errorCount,
      errors,
      operation,
      entityType
    };
  } catch (error) {
    console.error('Error in bulk operation:', error);
    throw error;
  }
}

// Helper function to convert data to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value).replace(/,/g, ';');
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}
