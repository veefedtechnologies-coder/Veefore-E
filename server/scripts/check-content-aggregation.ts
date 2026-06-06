import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { ContentModel } from '../models/Content/Content';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const contents = await ContentModel.find({ workspaceId: '684402c2fd2cd4eb6521b386' });
  
  let tReach = 0, tSaves = 0, tShares = 0, tLikes = 0, tComments = 0;
  contents.forEach((c: any) => {
      const m = c.metrics || {};
      tReach += m.reach || 0;
      tSaves += m.saves || 0;
      tShares += m.shares || 0;
      tLikes += m.likes || 0;
      tComments += m.comments || 0;
  });

  console.log(`Aggregated from DB ContentModel: Reach=${tReach}, Saves=${tSaves}, Shares=${tShares}, Likes=${tLikes}, Comments=${tComments}`);
  process.exit(0);
}
run();
