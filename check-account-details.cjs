// Check the Instagram account details including displayName
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function checkAccountDetails() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
    const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

    // Find the Instagram account
    const account = await SocialAccountModel.findOne({
      platform: 'instagram',
      username: 'rahulc1020'
    });

    if (!account) {
      console.log('❌ Account not found');
      process.exit(1);
    }

    console.log('📊 Instagram Account Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Username:', account.username);
    console.log('Display Name:', account.displayName || 'NOT SET');
    console.log('Workspace ID:', account.workspaceId);
    console.log('Total Shares:', account.totalShares ?? 'NOT SET');
    console.log('Total Saves:', account.totalSaves ?? 'NOT SET');
    console.log('Total Likes:', account.totalLikes ?? 'NOT SET');
    console.log('Total Comments:', account.totalComments ?? 'NOT SET');
    console.log('Followers:', account.followersCount ?? 'NOT SET');
    console.log('Posts:', account.mediaCount ?? 'NOT SET');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Also check if there's an account with username containing "arpit"
    const arpitAccount = await SocialAccountModel.findOne({
      platform: 'instagram',
      $or: [
        { username: /arpit/i },
        { displayName: /arpit/i }
      ]
    });

    if (arpitAccount) {
      console.log('🔍 Found account matching "arpit":');
      console.log('   Username:', arpitAccount.username);
      console.log('   Display Name:', arpitAccount.displayName || 'NOT SET');
      console.log('   Workspace ID:', arpitAccount.workspaceId);
    } else {
      console.log('ℹ️  No account found matching "arpit"');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAccountDetails();

