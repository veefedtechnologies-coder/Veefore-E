import Razorpay from 'razorpay';
import crypto from 'crypto';
import { SUBSCRIPTION_PLANS, CREDIT_PACKAGES, ADDONS, calculateCreditPackageTotal } from './pricing-config';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('Razorpay credentials are required. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export class RazorpayService {
  
  // Create order for subscription
  async createSubscriptionOrder(planId: string, userId: string) {
    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
    if (!plan || plan.price === 'custom' || typeof plan.price !== 'number') {
      throw new Error('Invalid subscription plan');
    }

    const planPrice = plan.price as number;
    const options = {
      amount: planPrice * 100, // Convert to paise
      currency: plan.currency,
      receipt: `sub_${userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
      notes: {
        purpose: 'subscription',
        planId: plan.id,
        userId: userId.toString(),
      }
    };

    try {
      const order = await razorpay.orders.create(options);
      return {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        plan: plan,
      };
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw new Error('Failed to create payment order');
    }
  }

  // Create order for credit purchase
  async createCreditOrder(packageId: string, userId: string) {
    const packageInfo = calculateCreditPackageTotal(packageId);
    if (!packageInfo) {
      throw new Error('Invalid credit package');
    }

    const options = {
      amount: packageInfo.price * 100, // Convert to paise
      currency: 'INR',
      receipt: `crd_${userId.slice(-8)}_${Date.now().toString().slice(-8)}`,
      notes: {
        purpose: 'credits',
        packageId,
        userId: userId.toString(),
        baseCredits: packageInfo.baseCredits.toString(),
        bonusCredits: packageInfo.bonusCredits.toString(),
        totalCredits: packageInfo.totalCredits.toString(),
      }
    };

    try {
      const order = await razorpay.orders.create(options);
      return {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        package: packageInfo,
      };
    } catch (error) {
      console.error('Razorpay credit order creation failed:', error);
      throw new Error('Failed to create payment order');
    }
  }

  // Create order for addon
  async createAddonOrder(addonId: string, userId: string) {
    const addon = ADDONS[addonId as keyof typeof ADDONS];
    if (!addon) {
      throw new Error('Invalid addon');
    }

    const options = {
      amount: addon.price * 100, // Convert to paise
      currency: 'INR',
      receipt: `addon_${userId}_${Date.now()}`,
      notes: {
        purpose: 'addon',
        addonId: addon.id,
        userId: userId.toString(),
        addonType: addon.type,
      }
    };

    try {
      const order = await razorpay.orders.create(options);
      return {
        key: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        addon: addon,
      };
    } catch (error) {
      console.error('Razorpay addon order creation failed:', error);
      throw new Error('Failed to create payment order');
    }
  }

  // Verify payment signature
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return expectedSignature === signature;
  }

  // Get payment details
  async getPayment(paymentId: string) {
    try {
      return await razorpay.payments.fetch(paymentId);
    } catch (error) {
      console.error('Failed to fetch payment details:', error);
      throw new Error('Failed to fetch payment details');
    }
  }

  // Get order details
  async getOrder(orderId: string) {
    try {
      return await razorpay.orders.fetch(orderId);
    } catch (error) {
      console.error('Failed to fetch order details:', error);
      throw new Error('Failed to fetch order details');
    }
  }

  // Create refund
  async createRefund(paymentId: string, amount?: number) {
    try {
      const options: any = { payment_id: paymentId };
      if (amount) {
        options.amount = amount * 100; // Convert to paise
      }
      
      return await razorpay.payments.refund(paymentId, options);
    } catch (error) {
      console.error('Refund creation failed:', error);
      throw new Error('Failed to create refund');
    }
  }

  // Webhook signature verification
  verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  }
}

export const razorpayService = new RazorpayService();