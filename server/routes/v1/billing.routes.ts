import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { storage } from '../../mongodb-storage';

const router = Router();

const CreateOrderSchema = z.object({
  packageId: z.string().min(1, 'Package ID is required'),
});

const CreateSubscriptionSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
});

const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
  type: z.enum(['subscription', 'credits', 'addon']),
  planId: z.string().optional(),
  packageId: z.string().optional(),
});

const CreateAddonOrderSchema = z.object({
  addonId: z.string().min(1, 'Addon ID is required'),
});

router.get('/subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentPlan = user.plan || 'free';
    const creditBalance = user.credits || 0;
    
    console.log(`[SUBSCRIPTION] User ${userId} has plan: ${currentPlan} with ${creditBalance} credits`);
    
    const subscription = {
      id: 0,
      plan: currentPlan,
      status: 'active',
      userId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      priceId: null,
      subscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      canceledAt: null,
      trialEnd: null,
      monthlyCredits: currentPlan === 'free' ? 20 : 
                     currentPlan === 'starter' ? 300 :
                     currentPlan === 'pro' ? 1100 : 
                     currentPlan === 'business' ? 2000 : 50,
      extraCredits: 0,
      autoRenew: false,
      credits: creditBalance,
      lastUpdated: new Date()
    };
    
    res.json(subscription);
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch subscription' });
  }
});

router.get('/subscription/plans', async (req: Request, res: Response) => {
  try {
    const pricingConfig = await import('../../pricing-config');
    
    res.json({
      plans: pricingConfig.SUBSCRIPTION_PLANS,
      creditPackages: pricingConfig.CREDIT_PACKAGES,
      addons: pricingConfig.ADDONS
    });
  } catch (error: any) {
    console.error('[SUBSCRIPTION PLANS] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch subscription plans' });
  }
});

router.get('/credit-transactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { user } = req as any;
    const transactions = await storage.getCreditTransactions(user.id);
    
    res.json(transactions);
  } catch (error: any) {
    console.error('[CREDIT TRANSACTIONS] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch credit transactions' });
  }
});

router.post('/razorpay/create-order',
  requireAuth,
  validateRequest({ body: CreateOrderSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const { packageId } = req.body;

      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: 'Razorpay configuration missing' });
      }

      const Razorpay = (await import('razorpay')).default;
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const { CREDIT_PACKAGES } = await import('../../pricing-config');
      console.log(`[CREDIT PURCHASE] Available packages:`, CREDIT_PACKAGES.map(p => p.id));
      console.log(`[CREDIT PURCHASE] Requested package ID: ${packageId}`);
      const packageData = CREDIT_PACKAGES.find((pkg: any) => pkg.id === packageId);
      
      if (!packageData) {
        console.error(`[CREDIT PURCHASE] Invalid package ID: ${packageId}`);
        console.error(`[CREDIT PURCHASE] Available package IDs:`, CREDIT_PACKAGES.map(p => p.id));
        return res.status(400).json({ error: 'Invalid package ID' });
      }

      const options = {
        amount: packageData.price * 100,
        currency: 'INR',
        receipt: `credit_${packageId}_${Date.now()}`,
        notes: {
          userId: user.id,
          packageId,
          credits: packageData.totalCredits,
        },
      };

      console.log(`[CREDIT PURCHASE] Creating order for package ${packageId}: ${packageData.totalCredits} credits, ₹${packageData.price}`);
      const order = await rzp.orders.create(options);

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: `${packageData.name} - ${packageData.totalCredits} Credits`,
        type: 'credits',
        packageId: packageId,
        keyId: process.env.RAZORPAY_KEY_ID
      });
    } catch (error: any) {
      console.error('[CREDIT PURCHASE] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to purchase credits' });
    }
  }
);

router.post('/razorpay/create-subscription',
  requireAuth,
  validateRequest({ body: CreateSubscriptionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const { planId } = req.body;

      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: 'Razorpay configuration missing' });
      }

      const Razorpay = (await import('razorpay')).default;
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const pricingData = await storage.getPricingData();
      const planData = pricingData.plans[planId];
      
      if (!planData) {
        console.log('[SUBSCRIPTION] Available plans:', Object.keys(pricingData.plans));
        console.log('[SUBSCRIPTION] Requested plan:', planId);
        return res.status(400).json({ error: 'Invalid plan ID' });
      }

      const options = {
        amount: planData.price * 100,
        currency: 'INR',
        receipt: `sub_${planId}_${Date.now()}`,
        notes: {
          userId: user.id,
          planId,
          planName: planData.name,
        },
      };

      const order = await rzp.orders.create(options);

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: `${planData.name} Subscription - ₹${planData.price}/month`,
        type: 'subscription',
        planId: planId
      });
    } catch (error: any) {
      console.error('[SUBSCRIPTION PURCHASE] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription' });
    }
  }
);

router.post('/razorpay/verify-payment',
  requireAuth,
  validateRequest({ body: VerifyPaymentSchema }),
  async (req: Request, res: Response) => {
    try {
      console.log('[PAYMENT VERIFICATION] Endpoint hit with body:', req.body);
      const { user } = req as any;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, type, planId, packageId } = req.body;

      console.log('[PAYMENT VERIFICATION] Starting verification:', {
        userId: user.id,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        type: type,
        packageId: packageId,
        planId: planId
      });

      const crypto = await import('crypto');
      const hmac = crypto.default.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!);
      hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
      const generated_signature = hmac.digest('hex');

      if (generated_signature !== razorpay_signature) {
        console.log('[PAYMENT VERIFICATION] Signature verification failed');
        return res.status(400).json({ error: 'Payment verification failed' });
      }

      console.log('[PAYMENT VERIFICATION] Signature verified successfully');

      console.log('[PAYMENT VERIFICATION] Processing payment type:', type, 'planId:', planId, 'packageId:', packageId);
      
      if (type === 'subscription' && planId) {
        await storage.updateUserSubscription(user.id, planId);
      } else if (type === 'credits' && packageId) {
        console.log('[CREDIT PURCHASE] Processing credit purchase:', { packageId, userId: user.id });
        
        const { CREDIT_PACKAGES } = await import('../../pricing-config');
        console.log('[CREDIT PURCHASE] Available packages:', CREDIT_PACKAGES.map(p => p.id));
        const packageData = CREDIT_PACKAGES.find((pkg: any) => pkg.id === packageId);
        
        if (packageData) {
          console.log('[CREDIT PURCHASE] Found package:', packageData);
          console.log('[CREDIT PURCHASE] Adding credits to user:', user.id, 'credits:', packageData.totalCredits);
          
          await storage.addCreditsToUser(user.id, packageData.totalCredits);
          console.log('[CREDIT PURCHASE] Credits added successfully');
          
          await storage.createCreditTransaction({
            userId: user.id,
            type: 'purchase',
            amount: packageData.totalCredits,
            description: `Credit purchase: ${packageData.name}`,
            workspaceId: null,
            referenceId: razorpay_payment_id
          });
          console.log('[CREDIT PURCHASE] Transaction record created');
        } else {
          console.log('[CREDIT PURCHASE] Package not found:', packageId);
        }
      } else if (type === 'addon' && packageId) {
        console.log('[PAYMENT VERIFICATION] Processing addon purchase:', { type, packageId });
        const pricingData = await storage.getPricingData();
        console.log('[PAYMENT VERIFICATION] Available addons:', Object.keys(pricingData.addons));
        const addon = pricingData.addons[packageId];
        
        if (addon) {
          console.log('[ADDON PURCHASE] Creating addon for user:', user.id, 'addon:', addon);
          
          let targetUserId = user.id;
          
          console.log('[ADDON PURCHASE] Using userId:', targetUserId, 'for addon creation');
          
          try {
            const createdAddon = await storage.createAddon({
              userId: targetUserId,
              type: addon.type,
              name: addon.name,
              price: addon.price,
              isActive: true,
              expiresAt: null,
              metadata: { 
                addonId: packageId, 
                benefit: addon.benefit,
                paymentId: razorpay_payment_id,
                purchaseDate: new Date().toISOString(),
                autoCreated: true,
                createdFromPayment: true
              }
            });
            console.log('[ADDON PURCHASE] Successfully created addon:', createdAddon);
          } catch (addonError: any) {
            console.error('[ADDON PURCHASE] Failed to create addon:', addonError);
            console.error('[ADDON PURCHASE] Error details:', {
              userId: user.id,
              targetUserId: targetUserId,
              addonType: addon.type,
              error: addonError?.message || addonError
            });
            throw addonError;
          }

          if (addon.type === 'ai_boost') {
            await storage.addCreditsToUser(user.id, 500);
            await storage.createCreditTransaction({
              userId: user.id,
              type: 'addon_purchase',
              amount: 500,
              description: `${addon.name} - 500 AI credits`,
              workspaceId: null,
              referenceId: razorpay_payment_id
            });
          } else if (addon.type === 'workspace') {
            const currentUser = await storage.getUser(user.id);
            if (currentUser) {
              await storage.createWorkspace({
                name: `${currentUser.username}'s Brand Workspace`,
                description: 'Additional workspace from addon purchase',
                userId: user.id,
                isDefault: false,
                theme: 'cosmic',
                aiPersonality: 'professional'
              });
            }
          }
        } else {
          console.log('[ADDON PURCHASE] Addon not found in pricing data for packageId:', packageId);
          console.log('[ADDON PURCHASE] Available addon IDs:', Object.keys(pricingData.addons));
        }
      } else {
        console.log('[PAYMENT VERIFICATION] No matching payment type processed:', { type, planId: !!planId, packageId: !!packageId });
      }

      res.json({ success: true, message: 'Payment processed successfully' });
    } catch (error: any) {
      console.error('[PAYMENT VERIFICATION] Error:', error);
      res.status(500).json({ error: error.message || 'Payment verification failed' });
    }
  }
);

router.post('/razorpay/create-addon-order',
  requireAuth,
  validateRequest({ body: CreateAddonOrderSchema }),
  async (req: Request, res: Response) => {
    try {
      const { user } = req as any;
      const { addonId } = req.body;

      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: 'Razorpay configuration missing' });
      }

      const Razorpay = (await import('razorpay')).default;
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const pricingConfig = await import('../../pricing-config');
      const addon = pricingConfig.getAddonById(addonId) as { id: string; name: string; price: number; type: string; benefit: string } | undefined;
      
      if (!addon) {
        console.log('[ADDON] Available addons:', Object.keys(pricingConfig.ADDONS));
        console.log('[ADDON] Requested addon:', addonId);
        return res.status(400).json({ error: 'Invalid addon ID' });
      }

      const options = {
        amount: addon.price,
        currency: 'INR',
        receipt: `addon_${addonId}_${Date.now()}`,
        notes: {
          userId: user.id,
          addonId,
          addonName: addon.name,
          type: 'addon'
        },
      };

      const order = await rzp.orders.create(options);
      console.log(`[ADDON PURCHASE] Created order for user ${user.id}, addon: ${addon.name}`);

      res.json({
        orderId: order.id,
        amount: Math.floor(addon.price / 100),
        currency: 'INR',
        addon: addon
      });
    } catch (error: any) {
      console.error('[ADDON PURCHASE] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to create addon order' });
    }
  }
);

export default router;
