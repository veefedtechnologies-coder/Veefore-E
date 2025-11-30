import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import Webhook from '../models/Webhook';
import WebhookDelivery from '../models/WebhookDelivery';

export class WebhookService {
  private static instance: WebhookService;
  private deliveryQueue: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  // Trigger webhook for an event
  public async triggerWebhook(event: string, payload: any, metadata?: any): Promise<void> {
    try {
      // Find active webhooks for this event
      const webhooks = await Webhook.find({
        isActive: true,
        events: event,
        status: { $in: ['active', 'testing'] }
      });

      for (const webhook of webhooks) {
        // Check if webhook should be triggered based on filters
        if (webhook.filters.enabled && !this.matchesFilters(webhook.filters.conditions, payload)) {
          continue;
        }

        // Check rate limiting
        if (webhook.rateLimit.enabled && !this.checkRateLimit(webhook._id.toString())) {
          console.log(`Rate limit exceeded for webhook ${webhook._id}`);
          continue;
        }

        // Create delivery record
        const delivery = await this.createDelivery(webhook, event, payload);
        
        // Queue for delivery
        this.queueDelivery(webhook, delivery, payload);
      }
    } catch (error) {
      console.error('Error triggering webhook:', error);
    }
  }

  // Create webhook delivery record
  private async createDelivery(webhook: any, event: string, payload: any): Promise<any> {
    const requestBody = JSON.stringify(payload);
    const signature = this.generateSignature(requestBody, webhook.secret);

    const delivery = new WebhookDelivery({
      webhookId: webhook._id,
      event,
      payload,
      request: {
        url: webhook.url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': signature,
          'User-Agent': 'VeeFore-Webhook/1.0',
          ...webhook.headers
        },
        body: requestBody
      },
      maxAttempts: webhook.retryConfig.maxRetries
    });

    await delivery.save();
    return delivery;
  }

  // Queue webhook for delivery
  private queueDelivery(webhook: any, delivery: any, payload: any): void {
    const deliveryId = delivery._id.toString();
    this.deliveryQueue.set(deliveryId, {
      webhook,
      delivery,
      payload,
      attempt: 0
    });

    // Process immediately
    this.processDelivery(deliveryId);
  }

  // Process webhook delivery
  private async processDelivery(deliveryId: string): Promise<void> {
    const queueItem = this.deliveryQueue.get(deliveryId);
    if (!queueItem) return;

    const { webhook, delivery, payload, attempt } = queueItem;

    try {
      // Prepare request
      const requestConfig = this.prepareRequest(webhook, delivery);

      // Make request
      const startTime = Date.now();
      const response: AxiosResponse = await axios(requestConfig);
      const responseTime = Date.now() - startTime;

      // Update delivery record
      await this.updateDeliverySuccess(delivery, response, responseTime);

      // Update webhook stats
      await this.updateWebhookStats(webhook, true, responseTime);

      // Remove from queue
      this.deliveryQueue.delete(deliveryId);

    } catch (error: any) {
      console.error(`Webhook delivery failed (attempt ${attempt + 1}):`, error.message);

      // Update delivery record with error
      await this.updateDeliveryError(delivery, error);

      // Check if we should retry
      if (attempt < webhook.retryConfig.maxRetries) {
        const retryDelay = this.calculateRetryDelay(webhook.retryConfig, attempt);
        
        // Update queue item
        queueItem.attempt = attempt + 1;
        delivery.nextRetryAt = new Date(Date.now() + retryDelay);
        await delivery.save();

        // Schedule retry
        setTimeout(() => {
          this.processDelivery(deliveryId);
        }, retryDelay);

      } else {
        // Max retries reached
        await this.updateWebhookStats(webhook, false, 0);
        this.deliveryQueue.delete(deliveryId);
      }
    }
  }

  // Prepare request configuration
  private prepareRequest(webhook: any, delivery: any): any {
    const config: any = {
      method: 'POST',
      url: webhook.url,
      headers: delivery.request.headers,
      data: delivery.request.body,
      timeout: 30000,
      validateStatus: (status: number) => status < 500 // Don't throw for 4xx errors
    };

    // Add authentication
    if (webhook.authType === 'basic' && webhook.authConfig.username) {
      config.auth = {
        username: webhook.authConfig.username,
        password: webhook.authConfig.password
      };
    } else if (webhook.authType === 'bearer' && webhook.authConfig.token) {
      config.headers.Authorization = `Bearer ${webhook.authConfig.token}`;
    } else if (webhook.authType === 'custom' && webhook.authConfig.customHeaders) {
      Object.assign(config.headers, webhook.authConfig.customHeaders);
    }

    return config;
  }

  // Update delivery record on success
  private async updateDeliverySuccess(delivery: any, response: AxiosResponse, responseTime: number): Promise<void> {
    delivery.status = 'delivered';
    delivery.attempts += 1;
    delivery.deliveredAt = new Date();
    delivery.response = {
      statusCode: response.status,
      headers: response.headers,
      body: JSON.stringify(response.data),
      responseTime
    };

    await delivery.save();
  }

  // Update delivery record on error
  private async updateDeliveryError(delivery: any, error: any): Promise<void> {
    delivery.status = 'failed';
    delivery.attempts += 1;
    delivery.error = {
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: error.code,
      stack: error.stack
    };

    if (error.response) {
      delivery.response = {
        statusCode: error.response.status,
        headers: error.response.headers,
        body: JSON.stringify(error.response.data),
        responseTime: 0
      };
    }

    await delivery.save();
  }

  // Update webhook statistics
  private async updateWebhookStats(webhook: any, success: boolean, responseTime: number): Promise<void> {
    webhook.stats.totalDeliveries += 1;
    webhook.stats.lastDeliveryAt = new Date();

    if (success) {
      webhook.stats.successfulDeliveries += 1;
      webhook.stats.lastSuccessAt = new Date();
      webhook.status = 'active';
      webhook.lastError = undefined;
    } else {
      webhook.stats.failedDeliveries += 1;
      webhook.stats.lastFailureAt = new Date();
      webhook.status = 'error';
    }

    // Update average response time
    const totalTime = webhook.stats.averageResponseTime * (webhook.stats.successfulDeliveries - 1) + responseTime;
    webhook.stats.averageResponseTime = totalTime / webhook.stats.successfulDeliveries;

    await webhook.save();
  }

  // Calculate retry delay with exponential backoff
  private calculateRetryDelay(retryConfig: any, attempt: number): number {
    const delay = retryConfig.retryDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, retryConfig.maxRetryDelay);
  }

  // Check if payload matches webhook filters
  private matchesFilters(conditions: any[], payload: any): boolean {
    for (const condition of conditions) {
      const value = this.getNestedValue(payload, condition.field);
      
      switch (condition.operator) {
        case 'equals':
          if (value !== condition.value) return false;
          break;
        case 'contains':
          if (!String(value).includes(condition.value)) return false;
          break;
        case 'starts_with':
          if (!String(value).startsWith(condition.value)) return false;
          break;
        case 'ends_with':
          if (!String(value).endsWith(condition.value)) return false;
          break;
        case 'regex':
          if (!new RegExp(condition.value).test(String(value))) return false;
          break;
      }
    }
    return true;
  }

  // Get nested value from object using dot notation
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Check rate limiting
  private checkRateLimit(webhookId: string): boolean {
    // Simple in-memory rate limiting
    // In production, use Redis or similar
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${webhookId}:${minute}`;
    
    // This is a simplified implementation
    // In production, implement proper rate limiting
    return true;
  }

  // Generate webhook signature
  private generateSignature(payload: string, secret?: string): string {
    if (!secret) return '';
    
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Test webhook
  public async testWebhook(webhookId: string, testPayload?: any): Promise<any> {
    const webhook = await Webhook.findById(webhookId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const payload = testPayload || {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook' }
    };

    try {
      const requestConfig = this.prepareRequest(webhook, {
        request: {
          url: webhook.url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'test',
            'X-Webhook-Signature': this.generateSignature(JSON.stringify(payload), webhook.secret),
            'User-Agent': 'VeeFore-Webhook/1.0',
            ...webhook.headers
          },
          body: JSON.stringify(payload)
        }
      });

      const startTime = Date.now();
      const response = await axios(requestConfig);
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        statusCode: response.status,
        responseTime,
        response: response.data
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        statusCode: error.response?.status,
        response: error.response?.data
      };
    }
  }

  // Get webhook statistics
  public async getWebhookStats(webhookId: string, days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const deliveries = await WebhookDelivery.find({
      webhookId,
      createdAt: { $gte: startDate }
    });

    const stats = {
      total: deliveries.length,
      successful: deliveries.filter(d => d.status === 'delivered').length,
      failed: deliveries.filter(d => d.status === 'failed').length,
      pending: deliveries.filter(d => d.status === 'pending').length,
      averageResponseTime: 0,
      successRate: 0
    };

    const successfulDeliveries = deliveries.filter(d => d.status === 'delivered');
    if (successfulDeliveries.length > 0) {
      stats.averageResponseTime = successfulDeliveries.reduce((sum, d) => sum + d.response.responseTime, 0) / successfulDeliveries.length;
    }

    if (stats.total > 0) {
      stats.successRate = (stats.successful / stats.total) * 100;
    }

    return stats;
  }
}
