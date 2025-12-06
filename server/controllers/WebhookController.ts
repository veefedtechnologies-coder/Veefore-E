import { Response, Request } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { BaseController, TypedRequest } from './BaseController';
import { ValidationError } from '../errors';
import { logger } from '../config/logger';

const InstagramWebhookQuery = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

const InstagramWebhookBody = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    time: z.number(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.any(),
    })).optional(),
    messaging: z.array(z.object({
      sender: z.object({ id: z.string() }),
      recipient: z.object({ id: z.string() }),
      timestamp: z.number(),
      message: z.object({
        mid: z.string(),
        text: z.string().optional(),
        attachments: z.array(z.any()).optional(),
      }).optional(),
    })).optional(),
  })),
});

const StripeWebhookBody = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  created: z.number(),
  data: z.object({
    object: z.record(z.any()),
    previous_attributes: z.record(z.any()).optional(),
  }),
  livemode: z.boolean(),
  pending_webhooks: z.number().optional(),
  request: z.object({
    id: z.string().nullable(),
    idempotency_key: z.string().nullable().optional(),
  }).optional(),
});

const MetaWebhookBody = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    time: z.number(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.any(),
    })).optional(),
  })),
});

export class WebhookController extends BaseController {
  private static readonly INSTAGRAM_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'veefore_webhook_token';
  private static readonly STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
  private static readonly META_APP_SECRET = process.env.META_APP_SECRET || '';

  handleInstagramWebhook = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof InstagramWebhookBody>, z.infer<typeof InstagramWebhookQuery>>,
    res: Response
  ) => {
    if (req.method === 'GET') {
      return this.verifyInstagramWebhook(req, res);
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!this.verifyInstagramSignature(req, signature)) {
      logger.warn('Invalid Instagram webhook signature');
      throw new ValidationError('Invalid webhook signature');
    }

    const body = InstagramWebhookBody.parse(req.body);
    logger.info('Instagram webhook received', { object: body.object, entryCount: body.entry.length });

    for (const entry of body.entry) {
      if (entry.messaging) {
        for (const messagingEvent of entry.messaging) {
          await this.processInstagramMessage(entry.id, messagingEvent);
        }
      }

      if (entry.changes) {
        for (const change of entry.changes) {
          await this.processInstagramChange(entry.id, change);
        }
      }
    }

    this.sendSuccess(res, { received: true });
  });

  private verifyInstagramWebhook(
    req: TypedRequest<{}, any, z.infer<typeof InstagramWebhookQuery>>,
    res: Response
  ): void {
    const query = InstagramWebhookQuery.parse(req.query);

    if (query['hub.mode'] === 'subscribe') {
      if (query['hub.verify_token'] === WebhookController.INSTAGRAM_VERIFY_TOKEN) {
        logger.info('Instagram webhook verified');
        res.status(200).send(query['hub.challenge']);
        return;
      }
      logger.warn('Instagram webhook verification failed - invalid token');
      res.status(403).send('Forbidden');
      return;
    }

    res.status(400).send('Bad Request');
  }

  private async processInstagramMessage(
    pageId: string,
    messagingEvent: any
  ): Promise<void> {
    logger.info('Processing Instagram message', {
      pageId,
      senderId: messagingEvent.sender?.id,
      hasMessage: !!messagingEvent.message,
    });
  }

  private async processInstagramChange(
    pageId: string,
    change: { field: string; value: any }
  ): Promise<void> {
    logger.info('Processing Instagram change', {
      pageId,
      field: change.field,
    });

    switch (change.field) {
      case 'comments':
        await this.handleInstagramComment(pageId, change.value);
        break;
      case 'mentions':
        await this.handleInstagramMention(pageId, change.value);
        break;
      case 'story_insights':
        await this.handleInstagramStoryInsights(pageId, change.value);
        break;
      default:
        logger.debug('Unhandled Instagram change field', { field: change.field });
    }
  }

  private async handleInstagramComment(pageId: string, value: any): Promise<void> {
    logger.info('Instagram comment received', { pageId, commentId: value?.id });
  }

  private async handleInstagramMention(pageId: string, value: any): Promise<void> {
    logger.info('Instagram mention received', { pageId, mediaId: value?.media_id });
  }

  private async handleInstagramStoryInsights(pageId: string, value: any): Promise<void> {
    logger.info('Instagram story insights received', { pageId });
  }

  handleStripeWebhook = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof StripeWebhookBody>>,
    res: Response
  ) => {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!this.verifyStripeSignature(req, signature)) {
      logger.warn('Invalid Stripe webhook signature');
      throw new ValidationError('Invalid webhook signature');
    }

    const event = StripeWebhookBody.parse(req.body);
    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleStripeCheckoutComplete(event.data.object);
        break;
      case 'customer.subscription.created':
        await this.handleStripeSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleStripeSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleStripeSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleStripeInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleStripePaymentFailed(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await this.handleStripePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handleStripePaymentIntentFailed(event.data.object);
        break;
      default:
        logger.debug('Unhandled Stripe event type', { type: event.type });
    }

    this.sendSuccess(res, { received: true });
  });

  private async handleStripeCheckoutComplete(session: any): Promise<void> {
    logger.info('Stripe checkout completed', { sessionId: session.id, customerId: session.customer });
  }

  private async handleStripeSubscriptionCreated(subscription: any): Promise<void> {
    logger.info('Stripe subscription created', { subscriptionId: subscription.id, status: subscription.status });
  }

  private async handleStripeSubscriptionUpdated(subscription: any): Promise<void> {
    logger.info('Stripe subscription updated', { subscriptionId: subscription.id, status: subscription.status });
  }

  private async handleStripeSubscriptionDeleted(subscription: any): Promise<void> {
    logger.info('Stripe subscription deleted', { subscriptionId: subscription.id });
  }

  private async handleStripeInvoicePaid(invoice: any): Promise<void> {
    logger.info('Stripe invoice paid', { invoiceId: invoice.id, amountPaid: invoice.amount_paid });
  }

  private async handleStripePaymentFailed(invoice: any): Promise<void> {
    logger.warn('Stripe payment failed', { invoiceId: invoice.id, customerId: invoice.customer });
  }

  private async handleStripePaymentSucceeded(paymentIntent: any): Promise<void> {
    logger.info('Stripe payment succeeded', { paymentIntentId: paymentIntent.id, amount: paymentIntent.amount });
  }

  private async handleStripePaymentIntentFailed(paymentIntent: any): Promise<void> {
    logger.warn('Stripe payment intent failed', { paymentIntentId: paymentIntent.id });
  }

  handleMetaWebhook = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof MetaWebhookBody>, z.infer<typeof InstagramWebhookQuery>>,
    res: Response
  ) => {
    if (req.method === 'GET') {
      return this.verifyMetaWebhook(req, res);
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!this.verifyMetaSignature(req, signature)) {
      logger.warn('Invalid Meta webhook signature');
      throw new ValidationError('Invalid webhook signature');
    }

    const body = MetaWebhookBody.parse(req.body);
    logger.info('Meta webhook received', { object: body.object, entryCount: body.entry.length });

    for (const entry of body.entry) {
      if (entry.changes) {
        for (const change of entry.changes) {
          await this.processMetaChange(entry.id, body.object, change);
        }
      }
    }

    this.sendSuccess(res, { received: true });
  });

  private verifyMetaWebhook(
    req: TypedRequest<{}, any, z.infer<typeof InstagramWebhookQuery>>,
    res: Response
  ): void {
    const query = InstagramWebhookQuery.parse(req.query);

    if (query['hub.mode'] === 'subscribe') {
      if (query['hub.verify_token'] === WebhookController.INSTAGRAM_VERIFY_TOKEN) {
        logger.info('Meta webhook verified');
        res.status(200).send(query['hub.challenge']);
        return;
      }
      logger.warn('Meta webhook verification failed - invalid token');
      res.status(403).send('Forbidden');
      return;
    }

    res.status(400).send('Bad Request');
  }

  private async processMetaChange(
    objectId: string,
    objectType: string,
    change: { field: string; value: any }
  ): Promise<void> {
    logger.info('Processing Meta change', {
      objectId,
      objectType,
      field: change.field,
    });
  }

  private verifyInstagramSignature(req: Request, signature: string): boolean {
    if (!WebhookController.META_APP_SECRET || !signature) {
      return process.env.NODE_ENV !== 'production';
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', WebhookController.META_APP_SECRET)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private verifyStripeSignature(req: Request, signature: string): boolean {
    if (!WebhookController.STRIPE_WEBHOOK_SECRET || !signature) {
      return process.env.NODE_ENV !== 'production';
    }

    try {
      const elements = signature.split(',');
      const signatureMap: Record<string, string> = {};
      
      for (const element of elements) {
        const [key, value] = element.split('=');
        signatureMap[key] = value;
      }

      const timestamp = signatureMap['t'];
      const receivedSignature = signatureMap['v1'];

      if (!timestamp || !receivedSignature) {
        return false;
      }

      const payload = `${timestamp}.${JSON.stringify(req.body)}`;
      const expectedSignature = crypto
        .createHmac('sha256', WebhookController.STRIPE_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      const tolerance = 300;
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime - parseInt(timestamp, 10) > tolerance) {
        logger.warn('Stripe webhook timestamp too old');
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Error verifying Stripe signature', { error });
      return false;
    }
  }

  private verifyMetaSignature(req: Request, signature: string): boolean {
    return this.verifyInstagramSignature(req, signature);
  }

  static generateWebhookSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  static createSignature(payload: string, secret: string): string {
    return 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}

export const webhookController = new WebhookController();
