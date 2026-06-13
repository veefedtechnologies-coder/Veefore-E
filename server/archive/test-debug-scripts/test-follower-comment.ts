import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { storage } from './mongodb-storage';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  
  const accounts = await storage.getSocialAccountsWithTokensInternal("684402c2fd2cd4eb6521b386");
  const account = accounts.find((acc: any) => acc.accountId === "17841474747481653");
  
  if (!account || !account.accessToken) return console.log("No account");

  // IGSID for the user
  const igsid = "1479580653003682"; 
  const url1 = `https://graph.facebook.com/v19.0/${igsid}?fields=is_user_follow_business&access_token=${account.accessToken}`;
  console.log("Testing IGSID:", url1);
  const res1 = await fetch(url1);
  console.log("IGSID Result:", await res1.json());

  process.exit(0);
}
test();
