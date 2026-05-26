import { storage } from './storage';

export async function seedCreditTransactions() {
  try {
    // Get the current user (you can modify this ID based on your actual user)
    const userId = "6844027426cae0200f88b5db"; // Your current user ID
    
    console.log('[SEED] Creating sample credit transactions for user:', userId);

    // Create sample transactions
    const transactions = [
      {
        userId: userId,
        type: 'earned',
        amount: 50,
        description: 'Monthly Free Plan Credits',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      },
      {
        userId: userId,
        type: 'spent',
        amount: -5,
        description: 'AI Content Generation - Instagram Post',
        referenceId: 'content_12345',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        userId: userId,
        type: 'spent',
        amount: -3,
        description: 'Hashtag Analysis & Suggestions',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        userId: userId,
        type: 'earned',
        amount: 10,
        description: 'Referral Bonus - Friend Signup',
        referenceId: 'referral_abc123',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      },
      {
        userId: userId,
        type: 'spent',
        amount: -2,
        description: 'AI Caption Optimization',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      }
    ];

    for (const transaction of transactions) {
      await storage.createCreditTransaction(transaction);
      console.log('[SEED] Created transaction:', transaction.description);
    }

    console.log('[SEED] Successfully created', transactions.length, 'sample credit transactions');
  } catch (error) {
    console.error('[SEED] Error creating credit transactions:', error);
  }
}