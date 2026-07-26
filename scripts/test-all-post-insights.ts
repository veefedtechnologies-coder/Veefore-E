import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { InstagramApiService } from '../server/services/instagramApi';
import { getAccessTokenFromAccount } from '../server/storage/converters';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  const account = await mongoose.connection.collection('socialaccounts').findOne({ platform: 'instagram', isActive: true });
  const token = getAccessTokenFromAccount(account as any);
  
  const media = await InstagramApiService.getUserMedia(token!, 50, account!.accountId);
  
  console.log('Individual insights (reach,likes,comments,shares,saved) on ALL posts:\n');
  let totalShares = 0, totalSaves = 0, totalReach = 0;
  
  for (const item of media.data) {
    const insights = await InstagramApiService.getMediaInsights(item.id, token!, item.media_type);
    totalShares += insights.shares || 0;
    totalSaves += insights.saves || 0;
    totalReach += insights.reach || 0;
    
    console.log(`${item.media_type.padEnd(14)} | reach:${String(insights.reach||0).padStart(4)} | saves:${insights.saves||0} | shares:${insights.shares||0} | likes:${item.like_count||0} | comments:${item.comments_count||0} | ${(item.caption||'').substring(0,25)}`);
  }
  
  console.log('\n--- TOTALS across all', media.data.length, 'posts ---');
  console.log('Total Reach:', totalReach);
  console.log('Total Shares:', totalShares);
  console.log('Total Saves:', totalSaves);
  console.log('Total Likes:', media.data.reduce((s: number, m: any) => s + (m.like_count||0), 0));
  console.log('Total Comments:', media.data.reduce((s: number, m: any) => s + (m.comments_count||0), 0));
  
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
