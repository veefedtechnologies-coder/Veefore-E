const { MongoStorage } = require('./server/mongodb-storage.js');

(async () => {
  try {
    const storage = new MongoStorage();
    const accounts = await storage.getAllSocialAccounts();
    console.log('=== SOCIAL ACCOUNTS DATABASE VALUES ===');
    accounts.forEach(account => {
      console.log(`Account: ${account.username} (${account.platform})`);
      console.log(`  totalShares: ${account.totalShares}`);
      console.log(`  totalSaves: ${account.totalSaves}`);
      console.log(`  totalLikes: ${account.totalLikes}`);
      console.log(`  totalComments: ${account.totalComments}`);
      console.log(`  postsAnalyzed: ${account.postsAnalyzed}`);
      console.log(`  lastSyncAt: ${account.lastSyncAt}`);
      console.log('---');
    });
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();