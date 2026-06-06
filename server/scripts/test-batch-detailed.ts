import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { SocialAccountModel } from '../models/Social/SocialAccount';
import { tokenEncryption } from '../security/token-encryption';
import InstagramApiService from '../services/instagramApi';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  let token = account!.accessToken;
  if (!token && account!.encryptedAccessToken) {
      token = tokenEncryption.decryptToken(account!.encryptedAccessToken as any);
  }
  
  const recentMedia = await InstagramApiService.getRecentMediaWithInsights(token, account!.accountId);
  
  let totalSaves = 0, totalShares = 0, totalLikes = 0, totalComments = 0;
  recentMedia.forEach(m => {
    const saves = m.insights?.saves || 0;
    const shares = m.insights?.shares || 0;
    const likes = m.like_count || 0;
    const comments = m.comments_count || 0;
    totalSaves += saves;
    totalShares += shares;
    totalLikes += likes;
    totalComments += comments;
  });

  console.log(`TOTALS FROM API: Saves=${totalSaves}, Shares=${totalShares}, Likes=${totalLikes}, Comments=${totalComments}`);
  process.exit(0);
}
run();
