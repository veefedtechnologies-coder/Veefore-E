import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const acc = await SocialAccountModel.findOne({ username: 'arpit.10' });
    console.log('Followers in DB:', acc.get('followersCount'));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
