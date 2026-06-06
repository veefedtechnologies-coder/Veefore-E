import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  
  try {
    await client.connect();
    console.log("Connected to MongoDB via native driver");
    
    const db = client.db('veeforedb');
    
    const socialAccounts = db.collection('socialaccounts');
    const accounts = await socialAccounts.find({}).limit(5).toArray();
    
    console.log(`Found ${accounts.length} total accounts in DB`);
    accounts.forEach((acc: any) => {
      console.log(`Account ID: ${acc.accountId} | workspaceId: ${acc.workspaceId} (${typeof acc.workspaceId}) | username: ${acc.username} | totalViews: ${acc.totalViews} | views: ${acc.views}`);
    });
    
    // specifically look for workspaceId '1'
    const ws1Accounts = await socialAccounts.find({ workspaceId: "1" }).toArray();
    console.log(`\nFound ${ws1Accounts.length} accounts for workspaceId "1"`);
    ws1Accounts.forEach((acc: any) => {
      console.log(`Account ID: ${acc.accountId} | platform: ${acc.platform} | username: ${acc.username} | totalViews: ${acc.totalViews} | views: ${acc.views}`);
    });

  } finally {
    await client.close();
  }
}
run().catch(console.error);
