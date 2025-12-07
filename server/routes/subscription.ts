import { Request, Response, Router, NextFunction } from 'express';
import { 
  SUBSCRIPTION_PLANS, 
  CREDIT_PACKAGES, 
  ADDONS, 
  validateFeatureAccess,
  calculateYearlySavings,
  getPlanById,
  getCreditPackageById,
  getAddonById,
  hasEnoughCredits,
  calculateCreditDeduction
} from '../subscription-config';
import { SUBSCRIPTION_PLANS as PRICING_PLANS } from '../pricing-config';
import { z } from 'zod';
import { storage } from '../storage';
import Razorpay from 'razorpay';

const router = Router();

// Initialize Razorpay only when needed and credentials are available
let razorpay: Razorpay | null = null;
const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('[SUBSCRIPTION] Razorpay initialized successfully');
  }
  return razorpay;
};

// Authentication middleware - Using the same system as main routes
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    console.log('[SUBSCRIPTION AUTH] Auth header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let token;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader;
    }
    
    console.log('[SUBSCRIPTION AUTH] Token extracted:', token ? 'Present' : 'Missing');
    
    if (!token || token.trim() === '') {
      console.error('[SUBSCRIPTION AUTH] No token found in authorization header');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    token = token.trim();

    // Extract Firebase UID from JWT token payload
    let firebaseUid;
    let cleanToken = token;
    
    // Handle malformed tokens by finding the actual JWT parts
    cleanToken = cleanToken.replace(/\s+/g, '').replace(/[^\w\-._]/g, '');
    
    console.log('[SUBSCRIPTION AUTH] Clean token parts:', cleanToken.split('.').length);
    
    const tokenParts = cleanToken.split('.');
    if (tokenParts.length > 3) {
      cleanToken = tokenParts.slice(0, 3).join('.');
    } else if (tokenParts.length < 3) {
      console.error('[SUBSCRIPTION AUTH] Invalid JWT structure - expected 3 parts, got:', tokenParts.length);
      return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
      const finalParts = cleanToken.split('.');
      const payload = JSON.parse(Buffer.from(finalParts[1], 'base64').toString());
      firebaseUid = payload.user_id || payload.sub;
      
      console.log('[SUBSCRIPTION AUTH] Firebase UID extracted:', firebaseUid ? 'Present' : 'Missing');
      
      if (!firebaseUid) {
        console.error('[SUBSCRIPTION AUTH] No Firebase UID found in token payload');
        return res.status(401).json({ error: 'Invalid token payload' });
      }
    } catch (error) {
      console.error('[SUBSCRIPTION AUTH] Token parsing error:', error);
      return res.status(401).json({ error: 'Invalid token format' });
    }
    
    const user = await storage.getUserByFirebaseUid(firebaseUid);
    console.log(`[SUBSCRIPTION AUTH] User lookup for firebaseUid ${firebaseUid}:`, user ? `Found - ID: ${user.id}` : 'Not found');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[SUBSCRIPTION AUTH] Error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Get all subscription plans
router.get('/plans', async (req: Request, res: Response) => {
  try {
    // Use the pricing config directly for correct pricing display
    const plans = Object.values(PRICING_PLANS);
    
    // Convert to object with plan IDs as keys for frontend compatibility
    const plansObject = {};
    plans.forEach(plan => {
      plansObject[plan.id] = plan;
    });
    
    res.json({ 
      plans: plansObject,
      creditPackages: CREDIT_PACKAGES,
      addons: ADDONS
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Get credit packages
router.get('/credit-packages', async (req: Request, res: Response) => {
  try {
    res.json({ packages: CREDIT_PACKAGES });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching credit packages:', error);
    res.status(500).json({ error: 'Failed to fetch credit packages' });
  }
});

// Get available addons
router.get('/addons', async (req: Request, res: Response) => {
  try {
    res.json({ addons: Object.values(ADDONS) });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching addons:', error);
    res.status(500).json({ error: 'Failed to fetch addons' });
  }
});

// Get current user subscription
router.get('/current', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentPlan = getPlanById(user.plan || 'free');
    
    // Calculate total credits
    const totalCredits = user.credits || 0;
    const monthlyCredits = currentPlan?.credits || 0;
    
    // Format subscription data for frontend
    const subscriptionData = {
      id: user.id,
      userId: user.id,
      plan: user.plan || 'free',
      planStatus: user.planStatus || 'active',
      credits: totalCredits,
      nextBillingDate: null, // Will be set when payment system is integrated
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        plan: user.plan || 'free',
        planStatus: user.planStatus || 'active',
        credits: totalCredits
      },
      subscription: subscriptionData,
      plan: currentPlan,
      addons: [],
      billing: {
        monthlyCredits,
        totalCredits,
        nextBillingDate: subscriptionData.nextBillingDate
      }
    });
    
    console.log('[SUBSCRIPTION] Returned subscription data:', {
      plan: user.plan || 'free',
      credits: totalCredits,
      planStatus: user.planStatus || 'active'
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching current subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription details' });
  }
});

// Validate feature access
router.post('/validate-feature', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { featureId, creditsRequired = 0 } = req.body;
    if (!featureId) {
      return res.status(400).json({ error: 'Feature ID is required' });
    }

    const userPlan = user.plan || 'free';
    const currentPlan = getPlanById(userPlan);
    const userCredits = user.credits || 0;
    
    // Check if feature is allowed on current plan
    const featureConfig = currentPlan?.features?.[featureId];
    const isFeatureAllowed = featureConfig?.allowed || false;
    
    // Check if user has enough credits
    const hasEnoughCredits = userCredits >= creditsRequired;
    
    // Final access decision
    const hasAccess = isFeatureAllowed && hasEnoughCredits;
    
    // Track feature usage if access is granted
    if (hasAccess && creditsRequired > 0) {
      try {
        await storage.trackFeatureUsage(user.id, featureId, creditsRequired);
      } catch (error) {
        console.error('[FEATURE ACCESS] Error tracking usage:', error);
      }
    }
    
    res.json({
      hasAccess,
      isFeatureAllowed,
      hasEnoughCredits,
      userCredits,
      creditsRequired,
      currentPlan: userPlan,
      requiredPlan: featureConfig?.upgrade || null,
      reason: !hasAccess ? 
        (!isFeatureAllowed ? `Feature requires ${featureConfig?.upgrade || 'pro'} plan` : 'Insufficient credits') : 
        'Access granted'
    });
    
    console.log('[FEATURE ACCESS] Validation result:', {
      featureId,
      userId: user.id,
      hasAccess,
      isFeatureAllowed,
      hasEnoughCredits,
      userCredits,
      creditsRequired,
      currentPlan: userPlan
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error validating feature access:', error);
    res.status(500).json({ error: 'Failed to validate feature access' });
  }
});

// Update subscription plan
router.post('/update-plan', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId, interval = 'month' } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Calculate price based on interval
    const price = interval === 'year' ? plan.yearlyPrice : plan.price;
    
    // For now, just update the user's plan (payment integration would go here)
    await storage.updateUserPlan(user.id, {
      plan: planId,
      planStatus: 'active',
      interval,
      monthlyCredits: plan.credits
    });

    res.json({ 
      success: true, 
      message: `Successfully updated to ${plan.name} plan`,
      plan: {
        id: planId,
        name: plan.name,
        price,
        interval,
        credits: plan.credits
      }
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update subscription plan' });
  }
});

// REMOVED: Direct credit purchase endpoint - all credit purchases must go through Razorpay payment verification
// Use /api/razorpay/create-order and /api/razorpay/verify-payment instead

// Purchase addon
router.post('/purchase-addon', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { addonId } = req.body;
    if (!addonId) {
      return res.status(400).json({ error: 'Addon ID is required' });
    }

    const addon = getAddonById(addonId);
    if (!addon) {
      return res.status(400).json({ error: 'Invalid addon ID' });
    }

    // For now, just add addon (payment integration would go here)
    await storage.createUserAddon({
      userId: user.id,
      type: addon.type,
      name: addon.name,
      price: addon.price,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    res.json({ 
      success: true, 
      message: `Successfully purchased ${addon.name}`,
      addon: {
        id: addonId,
        name: addon.name,
        type: addon.type,
        price: addon.price
      }
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error purchasing addon:', error);
    res.status(500).json({ error: 'Failed to purchase addon' });
  }
});

// Get subscription usage analytics
router.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get feature usage for current month
    const featureUsage = await storage.getFeatureUsage(user.id);
    
    // Get recent credit transactions
    const creditTransactions = await storage.getCreditTransactions(user.id, 10);
    
    // Calculate usage statistics
    const currentPlan = getPlanById(user.plan || 'free');
    const planLimits = currentPlan?.features || {};
    
    res.json({
      currentPlan: user.plan || 'free',
      credits: user.credits || 0,
      featureUsage,
      planLimits,
      recentTransactions: creditTransactions
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// Create Razorpay order for subscription upgrade
router.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId, interval = 'month' } = req.body;
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Get plan details from pricing config
    const plan = PRICING_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Calculate price based on interval
    const price = interval === 'year' ? plan.yearlyPrice : plan.price;
    
    // Don't allow downgrades to free plan
    if (planId === 'free') {
      return res.status(400).json({ error: 'Cannot downgrade to free plan' });
    }

    // Validate required environment variables
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('[SUBSCRIPTION] Missing Razorpay credentials');
      return res.status(500).json({ error: 'Payment system not configured' });
    }

    console.log('[SUBSCRIPTION] Creating order with details:', {
      planId,
      price,
      amount: price * 100,
      userId: user.id,
      interval
    });

    // Create Razorpay order
    const orderData = {
      amount: price * 100, // Razorpay expects amount in paisa
      currency: 'INR',
      receipt: `${planId}_${Date.now()}`.substring(0, 40), // Razorpay requires max 40 characters
      notes: {
        userId: user.id,
        planId,
        interval,
        planName: plan.name,
        currentPlan: user.plan || 'free'
      }
    };

    console.log('[SUBSCRIPTION] Razorpay order payload:', orderData);
    
    const order = await razorpay.orders.create(orderData);

    console.log('[SUBSCRIPTION] Created Razorpay order:', {
      orderId: order.id,
      amount: price,
      planId,
      userId: user.id
    });

    res.json({
      orderId: order.id,
      amount: price * 100, // Return amount in paisa for Razorpay
      currency: 'INR',
      planId,
      planName: plan.name,
      interval,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Upgrade subscription (requires payment verification)
router.post('/upgrade', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[SUBSCRIPTION] Upgrade request received:', { 
      userId: req.user?.id, 
      body: req.body 
    });

    const user = req.user;
    if (!user) {
      console.error('[SUBSCRIPTION] No user found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId, paymentId, orderId, signature } = req.body;
    console.log('[SUBSCRIPTION] Payment data received:', { 
      planId, 
      paymentId, 
      orderId, 
      hasSignature: !!signature 
    });

    if (!planId || !paymentId || !orderId || !signature) {
      console.error('[SUBSCRIPTION] Missing payment verification data:', {
        planId: !!planId,
        paymentId: !!paymentId,
        orderId: !!orderId,
        signature: !!signature
      });
      return res.status(400).json({ 
        error: 'Payment verification required. Please complete payment first.' 
      });
    }

    // Verify payment signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    console.log('[SUBSCRIPTION] Payment verification details:', {
      orderId,
      paymentId,
      receivedSignature: signature,
      expectedSignature,
      match: signature === expectedSignature
    });

    if (signature !== expectedSignature) {
      console.error('[SUBSCRIPTION] Payment verification failed:', {
        expected: expectedSignature,
        received: signature,
        orderId,
        paymentId
      });
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Get plan details
    const plan = PRICING_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Verify payment with Razorpay
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      
      if (payment.status !== 'captured') {
        return res.status(400).json({ error: 'Payment not completed' });
      }

      if (payment.order_id !== orderId) {
        return res.status(400).json({ error: 'Payment order mismatch' });
      }
    } catch (error) {
      console.error('[SUBSCRIPTION] Razorpay payment verification failed:', error);
      return res.status(500).json({ error: 'Payment verification failed' });
    }

    try {
      // Update user's plan
      console.log('[SUBSCRIPTION] Updating user plan:', { userId: user.id, planId });
      await storage.updateUserSubscription(user.id, planId);

      // Set user to the full plan credits (not additive)
      const planCredits = plan.credits;
      console.log('[SUBSCRIPTION] Setting user to full plan credits:', { userId: user.id, currentCredits: user.credits, planCredits });
      await storage.updateUserCredits(user.id, planCredits);

      // Log transaction for the credit adjustment
      const creditAdjustment = planCredits - (user.credits || 0);
      console.log('[SUBSCRIPTION] Creating credit transaction:', { userId: user.id, amount: creditAdjustment });
      await storage.createCreditTransaction({
        userId: user.id,
        type: 'subscription_upgrade',
        amount: creditAdjustment,
        description: `Upgraded to ${plan.name} plan - ${planCredits} monthly credits`,
        referenceId: paymentId
      });

      console.log('[SUBSCRIPTION] Successfully upgraded user:', {
        userId: user.id,
        planId,
        planName: plan.name,
        paymentId,
        creditsAdded: plan.credits
      });
    } catch (storageError) {
      console.error('[SUBSCRIPTION] Storage operation failed:', storageError);
      return res.status(500).json({ error: 'Failed to update subscription' });
    }

    res.json({ 
      success: true, 
      message: `Successfully upgraded to ${plan.name} plan`,
      plan: {
        id: planId,
        name: plan.name,
        credits: plan.credits
      },
      payment: {
        id: paymentId,
        orderId,
        verified: true
      }
    });
  } catch (error) {
    console.error('[SUBSCRIPTION] Error upgrading subscription - Full error:', error);
    console.error('[SUBSCRIPTION] Error stack:', error.stack);
    console.error('[SUBSCRIPTION] Error message:', error.message);
    console.error('[SUBSCRIPTION] Error type:', typeof error);
    
    // More specific error handling
    if (error.message && error.message.includes('RAZORPAY_KEY_SECRET')) {
      return res.status(500).json({ error: 'Razorpay configuration missing' });
    }
    
    if (error.message && error.message.includes('updateUserSubscription')) {
      return res.status(500).json({ error: 'Database update failed' });
    }
    
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

export default router;