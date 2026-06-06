import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const accounts = await SocialAccountModel.find({ platform: 'instagram' });
    console.log(accounts.map(a => a.toJSON()));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
