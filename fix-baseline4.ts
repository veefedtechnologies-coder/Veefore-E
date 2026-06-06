import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({
  workspaceId: String,
  platform: String,
  date: Date,
  followers: Number,
}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const accounts = await SocialAccountModel.find({ platform: 'instagram' });
    console.log('Found accounts:', accounts.map(a => ({ id: a._id, username: a.get('username'), followers: a.get('followersCount'), workspaceId: a.get('workspaceId') })));
    
    // Find the analytics for the first account
    if (accounts.length > 0) {
      const workspaceId = accounts[0].get('workspaceId');
      const records = await AnalyticsModel.find({ workspaceId }).sort({ date: -1 }).limit(3);
      console.log('Analytics for workspace:', workspaceId);
      console.log(records);
      
      // Let's modify the latest record for today
      if (records.length > 0) {
        const latest = records[0];
        console.log(`Updating record ${latest._id} to 455 followers`);
        latest.followers = 455;
        await latest.save();
        console.log('Saved.');
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
