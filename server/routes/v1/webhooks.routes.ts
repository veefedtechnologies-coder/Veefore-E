import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { MetaCompliantWebhook } from '../../meta-compliant-webhook';

const router = Router();

const metaWebhook = new MetaCompliantWebhook(storage);

router.get('/instagram', async (req: Request, res: Response) => {
  console.log('[META WEBHOOK] Instagram webhook verification from Meta');
  await metaWebhook.handleVerification(req, res);
});

router.post('/instagram', async (req: Request, res: Response) => {
  console.log('[META WEBHOOK] 🎯 Real Instagram webhook event from Meta');
  await metaWebhook.handleEvent(req, res);
});

export default router;
