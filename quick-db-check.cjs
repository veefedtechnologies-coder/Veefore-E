const { MongoClient } = require('mongodb');

async function checkSocialAccounts() {
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    const accounts = await collection.find({}).toArray();
    
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
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkSocialAccounts();