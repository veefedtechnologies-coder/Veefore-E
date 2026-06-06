import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { MetaCompliantWebhook } from '../../meta-compliant-webhook';
import { webhookRateLimiter } from '../../middleware/rate-limiting-working';

const router = Router();

const metaWebhook = new MetaCompliantWebhook(storage);

router.get('/instagram', async (req: Request, res: Response) => {
  console.log('[META WEBHOOK] Instagram webhook verification from Meta');
  await metaWebhook.handleVerification(req, res);
});

router.post('/instagram', webhookRateLimiter, async (req: Request, res: Response) => {
  console.log('[META WEBHOOK] 🎯 Real Instagram webhook event from Meta');
  await metaWebhook.handleEvent(req, res);
});

export default router;
