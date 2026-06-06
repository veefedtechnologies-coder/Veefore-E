import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '..', '.env') });

async function removeAccount() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    if (!db) {
      console.log('No DB connection');
      process.exit(1);
    }
    
    const socialAccounts = db.collection('socialaccounts');
    
    // Find before deleting
    const accounts = await socialAccounts.find({}).toArray();
    const targetAccounts = accounts.filter(a => 
      (a.username && a.username.toLowerCase().includes('rahul')) ||
      (a.handle && a.handle.toLowerCase().includes('rahul'))
    );
    console.log(`Found ${targetAccounts.length} target accounts`);
    
    for (const acc of targetAccounts) {
      console.log(`- Account ID: ${acc._id}, Username: ${acc.username}, Handle: ${acc.handle}, Workspace: ${acc.workspaceId}`);
      await socialAccounts.deleteOne({ _id: acc._id });
      console.log(`Deleted ${acc.username}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeAccount();
