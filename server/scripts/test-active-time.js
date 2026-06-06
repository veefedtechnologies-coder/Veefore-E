const mongoose = require('mongoose');
require('dotenv').config();

async function checkActiveTime() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Analytics = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }));
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));

    // Check latest analytics record
    const latestAnalytics = await Analytics.findOne().sort({ recordedAt: -1 }).lean();
    console.log('�� Latest Analytics Record:');
    console.log('  audienceActiveTime:', latestAnalytics?.audienceActiveTime);
    console.log('  audienceGenderAge:', Object.keys(latestAnalytics?.audienceGenderAge || {}).length, 'entries');
    console.log('  recordedAt:', latestAnalytics?.recordedAt);

    // Check social account
    const account = await SocialAccount.findOne({ platform: 'instagram' }).lean();
    console.log('\n📱 Social Account:');
    console.log('  audienceActiveTime:', account?.audienceActiveTime);
    console.log('  audienceGenderAge:', Object.keys(account?.audienceGenderAge || {}).length, 'entries');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkActiveTime();
