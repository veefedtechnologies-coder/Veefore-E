import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { storage } from './mongodb-storage';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  const db = mongoose.connection.db;
  
  const accounts = await storage.getSocialAccountsWithTokensInternal("684402c2fd2cd4eb6521b386");
  const account = accounts.find((acc: any) => acc.accountId === "17841474747481653");
  
  if (!account || !account.accessToken) return console.log("No account");

  // Let's test if we can query is_user_follow_business using the GLOBAL User ID (which we get from comments)
  // The global user ID for arpit.10 is 17841406961110225
  const globalUserId = "17841406961110225";
  const url3 = `https://graph.facebook.com/v19.0/${globalUserId}?fields=is_user_follow_business&access_token=${account.accessToken}`;
  console.log("Testing Global User ID:", url3);
  const res3 = await fetch(url3);
  console.log("Global User ID Result:", await res3.json());

  // Wait, let's look at a real comment in the DB to see what ID is stored in userId
  const comment = await db.collection('automationfunnelstates').findOne({ participantId: { $exists: true } });
  if (comment) {
    console.log("Participant ID in funnel state:", comment.participantId);
  }

  process.exit(0);
}
test();
