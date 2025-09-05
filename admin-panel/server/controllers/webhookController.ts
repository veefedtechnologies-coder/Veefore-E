import { Request, Response } from 'express';
import Webhook from '../models/Webhook';
import WebhookDelivery from '../models/WebhookDelivery';
import { AuthRequest } from '../middleware/auth';
import { WebhookService } from '../services/webhookService';

export class WebhookController {
  private webhookService: WebhookService;

  constructor() {
    this.webhookService = WebhookService.getInstance();
  }

  // Get all webhooks
  static async getWebhooks(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status,
        event,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build filter query
      const filter: any = {};

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { url: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        filter.status = status;
      }

      if (event) {
        filter.events = event;
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      const webhooks = await Webhook.find(filter)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

      const total = await Webhook.countDocuments(filter);

      res.json({
        success: true,
        data: {
          webhooks,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhooks'
      });
    }
  }

  // Get webhook by ID
  static async getWebhookById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const webhook = await Webhook.findById(id)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email');

      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        data: webhook
      });
    } catch (error) {
      console.error('Error fetching webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook'
      });
    }
  }

  // Create webhook
  static async createWebhook(req: AuthRequest, res: Response) {
    try {
      const webhookData = {
        ...req.body,
        createdBy: req.admin!._id,
        updatedBy: req.admin!._id
      };

      const webhook = new Webhook(webhookData);
      await webhook.save();

      res.status(201).json({
        success: true,
        message: 'Webhook created successfully',
        data: webhook
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create webhook'
      });
    }
  }

  // Update webhook
  static async updateWebhook(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updatedBy: req.admin!._id
      };

      const webhook = await Webhook.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        message: 'Webhook updated successfully',
        data: webhook
      });
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update webhook'
      });
    }
  }

  // Delete webhook
  static async deleteWebhook(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const webhook = await Webhook.findByIdAndDelete(id);

      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found'
        });
      }

      // Also delete related deliveries
      await WebhookDelivery.deleteMany({ webhookId: id });

      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete webhook'
      });
    }
  }

  // Test webhook
  static async testWebhook(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { testPayload } = req.body;

      const webhookService = WebhookService.getInstance();
      const result = await webhookService.testWebhook(id, testPayload);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error testing webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test webhook'
      });
    }
  }

  // Get webhook deliveries
  static async getWebhookDeliveries(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 10,
        status,
        event,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build filter query
      const filter: any = { webhookId: id };

      if (status) {
        filter.status = status;
      }

      if (event) {
        filter.event = event;
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate as string);
        }
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

      const deliveries = await WebhookDelivery.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

      const total = await WebhookDelivery.countDocuments(filter);

      res.json({
        success: true,
        data: {
          deliveries,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching webhook deliveries:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook deliveries'
      });
    }
  }

  // Get webhook statistics
  static async getWebhookStats(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { days = 30 } = req.query;

      const webhookService = WebhookService.getInstance();
      const stats = await webhookService.getWebhookStats(id, parseInt(days as string));

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching webhook stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook statistics'
      });
    }
  }

  // Toggle webhook status
  static async toggleWebhookStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const webhook = await Webhook.findByIdAndUpdate(
        id,
        { 
          isActive,
          updatedBy: req.admin!._id
        },
        { new: true }
      );

      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        message: `Webhook ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: webhook
      });
    } catch (error) {
      console.error('Error toggling webhook status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle webhook status'
      });
    }
  }

  // Retry failed delivery
  static async retryDelivery(req: AuthRequest, res: Response) {
    try {
      const { deliveryId } = req.params;

      const delivery = await WebhookDelivery.findById(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }

      const webhook = await Webhook.findById(delivery.webhookId);
      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found'
        });
      }

      // Reset delivery status
      delivery.status = 'pending';
      delivery.attempts = 0;
      delivery.nextRetryAt = new Date();
      await delivery.save();

      // Queue for retry
      const webhookService = WebhookService.getInstance();
      (webhookService as any).queueDelivery(webhook, delivery, delivery.payload);

      res.json({
        success: true,
        message: 'Delivery queued for retry'
      });
    } catch (error) {
      console.error('Error retrying delivery:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retry delivery'
      });
    }
  }
}
