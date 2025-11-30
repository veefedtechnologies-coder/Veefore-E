// Direct test: Check what getSocialAccountsByWorkspace actually returns
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function testDirectConversion() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Import the ACTUAL storage module being used
    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    await storage.connect();

    const workspaceId = '684402c2fd2cd4eb6521b386';
    console.log(`📊 Testing getSocialAccountsByWorkspace for workspace: ${workspaceId}\n`);

    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const instagramAccount = accounts.find(a => a.platform === 'instagram');

    if (!instagramAccount) {
      console.log('❌ No Instagram account found');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DIRECT CONVERSION TEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Account:', instagramAccount.username);
    console.log('\n📊 CONVERTED ACCOUNT (from getSocialAccountsByWorkspace):');
    console.log({
      totalShares: instagramAccount.totalShares,
      totalSaves: instagramAccount.totalSaves,
      totalLikes: instagramAccount.totalLikes,
      totalComments: instagramAccount.totalComments,
      typeOfShares: typeof instagramAccount.totalShares,
      typeOfSaves: typeof instagramAccount.totalSaves,
      isSharesNull: instagramAccount.totalShares === null,
      isSharesUndefined: instagramAccount.totalShares === undefined,
      isSavesNull: instagramAccount.totalSaves === null,
      isSavesUndefined: instagramAccount.totalSaves === undefined,
    });

    // Check raw database value
    const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
    const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);
    const rawAccount = await SocialAccountModel.findOne({
      platform: 'instagram',
      workspaceId: workspaceId
    });

    if (rawAccount) {
      console.log('\n📊 RAW DATABASE VALUES:');
      console.log({
        totalShares: rawAccount.totalShares,
        totalSaves: rawAccount.totalSaves,
        totalLikes: rawAccount.totalLikes,
        totalComments: rawAccount.totalComments,
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testDirectConversion();

