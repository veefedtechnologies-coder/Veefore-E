// Find Instagram account and its workspace
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function findInstagramAccount() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
    const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

    // Find ALL Instagram accounts
    const accounts = await SocialAccountModel.find({ platform: 'instagram' });

    console.log(`\n📊 Found ${accounts.length} Instagram account(s):\n`);

    for (const account of accounts) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Username:', account.username);
      console.log('Workspace ID:', account.workspaceId);
      console.log('Total Shares:', account.totalShares ?? 'NOT SET');
      console.log('Total Saves:', account.totalSaves ?? 'NOT SET');
      console.log('Total Likes:', account.totalLikes ?? 'NOT SET');
      console.log('Total Comments:', account.totalComments ?? 'NOT SET');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findInstagramAccount();

