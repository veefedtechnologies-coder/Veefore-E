import { storage } from './storage';
import { CREDIT_COSTS, REFERRAL_REWARDS } from './pricing-config';

export class CreditService {
  
  // Get user's current credit balance
  async getUserCredits(userId: number | string): Promise<number> {
    const user = await storage.getUser(userId);
    return user?.credits || 0;
  }

  // Get user's subscription and credit details
  async getUserCreditInfo(userId: number | string) {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get current subscription
    const subscription = await storage.getSubscription(userId);

    // Get recent credit transactions
    const recentTransactions = await storage.getCreditTransactions(userId, 10);

    return {
      currentCredits: user.credits || 0,
      plan: user.plan,
      subscription: subscription || null,
      recentTransactions
    };
  }

  // Check if user has sufficient credits for a feature
  async hasCredits(userId: number | string, featureType: string, quantity: number = 1): Promise<boolean> {
    const creditCost = CREDIT_COSTS[featureType as keyof typeof CREDIT_COSTS];
    if (!creditCost) {
      throw new Error(`Unknown feature type: ${featureType}`);
    }

    const userCredits = await this.getUserCredits(userId);
    const totalCost = creditCost * quantity;
    
    return userCredits >= totalCost;
  }

  // Consume credits for a feature
  async consumeCredits(userId: number | string, featureType: string, quantity: number = 1, description?: string): Promise<boolean> {
    const creditCost = CREDIT_COSTS[featureType as keyof typeof CREDIT_COSTS];
    if (!creditCost) {
      throw new Error(`Unknown feature type: ${featureType}`);
    }

    const totalCost = Math.ceil(creditCost * quantity);
    const userCredits = await this.getUserCredits(userId);

    if (userCredits < totalCost) {
      return false;
    }

    // Update user credits and log transaction
    const user = await storage.getUser(userId);
    if (!user) return false;

    const newCredits = (user.credits || 0) - totalCost;
    await storage.updateUserCredits(userId, newCredits);

    // Create credit transaction record
    await storage.createCreditTransaction({
      userId,
      type: 'used',
      amount: -totalCost,
      description: description || `${featureType} usage (${quantity}x)`,
      referenceId: `${featureType}_${Date.now()}`
    });

    return true;
  }

  // Add credits to user account
  async addCredits(userId: number | string, amount: number, type: 'purchase' | 'earned' | 'refund' | 'bonus', description: string, referenceId?: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error('User not found');

    const newCredits = (user.credits || 0) + amount;
    await storage.updateUserCredits(userId, newCredits);

    // Create credit transaction record
    await storage.createCreditTransaction({
      userId,
      type,
      amount,
      description,
      referenceId
    });
  }

  // Reset monthly credits based on subscription - DISABLED FOR SECURITY
  async resetMonthlyCredits(userId: number | string): Promise<void> {
    // SECURITY: Automatic credit allocation disabled to prevent credit loopholes
    // Users must purchase credits manually through payment system
    console.log(`[CREDIT SECURITY] Automatic credit reset disabled for user ${userId} - credits must be purchased`);
    return;
  }

  // Handle referral rewards
  async awardReferralCredits(userId: number | string, type: 'inviteFriend' | 'submitFeedback'): Promise<void> {
    const credits = REFERRAL_REWARDS[type];
    if (!credits) return;

    await this.addCredits(
      userId, 
      credits, 
      'earned', 
      `Referral reward: ${type}`, 
      `referral_${type}_${Date.now()}`
    );
  }

  // Deduct credits from user account
  async deductCredits(userId: number | string, amount: number, description: string = 'Credit usage', referenceId?: string): Promise<void> {
    const user = await storage.getUser(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const currentCredits = user.credits || 0;
    if (currentCredits < amount) {
      throw new Error('Insufficient credits');
    }
    
    // Deduct credits from user
    await storage.updateUserCredits(userId, currentCredits - amount);
    
    // Record the transaction
    await storage.createCreditTransaction({
      userId,
      type: 'spent',
      amount: -amount,
      description,
      referenceId
    });
  }

  // Get credit transaction history
  async getCreditHistory(userId: number | string, limit: number = 50) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId;
    return await storage.getCreditTransactions(userIdNum, limit);
  }

  // Calculate credit rollover (unused credits from previous month)
  async calculateCreditRollover(userId: number | string): Promise<number> {
    // Get last month's credit reset transactions
    const transactions = await storage.getCreditTransactions(userId, 50);
    const resets = transactions.filter(t => 
      t.type === 'earned' && 
      t.description?.includes('Monthly') && 
      t.description?.includes('reset')
    );

    if (resets.length < 2) return 0;

    // Calculate credits used between the two resets
    const lastReset = resets[0];
    const previousReset = resets[1];
    
    const usedTransactions = transactions.filter(t => 
      t.type === 'used' && 
      t.createdAt && previousReset.createdAt && lastReset.createdAt &&
      t.createdAt >= previousReset.createdAt && 
      t.createdAt <= lastReset.createdAt
    );

    const usedAmount = usedTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const monthlyAllocation = previousReset.amount || 0;
    const rollover = Math.max(0, monthlyAllocation - usedAmount);

    // Max rollover is 30 days worth (same as monthly allocation)
    return Math.min(rollover, monthlyAllocation);
  }

  // Preview credit cost for a feature
  getCreditCost(featureType: string, quantity: number = 1): number {
    const creditCost = CREDIT_COSTS[featureType as keyof typeof CREDIT_COSTS];
    if (!creditCost) {
      throw new Error(`Unknown feature type: ${featureType}`);
    }
    return Math.ceil(creditCost * quantity);
  }

  // Get all available features and their costs
  getAllFeatureCosts() {
    return CREDIT_COSTS;
  }
}

export const creditService = new CreditService();