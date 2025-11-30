import { MongoClient } from 'mongodb';

async function main() {
  const uri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const acc = await db.collection('socialaccounts').findOne({ platform: 'instagram', username: 'arpit9996363' });
    
    console.log(JSON.stringify({
      id: acc ? String(acc._id) : null,
      workspaceId: acc ? String(acc.workspaceId) : null,
      totals: acc ? {
        totalLikes: acc.totalLikes || 0,
        totalComments: acc.totalComments || 0,
        totalShares: acc.totalShares || 0,
        totalSaves: acc.totalSaves || 0,
        postsAnalyzed: acc.postsAnalyzed || 0
      } : null,
      updatedAt: acc?.updatedAt,
      lastSyncAt: acc?.lastSyncAt
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(console.error);


