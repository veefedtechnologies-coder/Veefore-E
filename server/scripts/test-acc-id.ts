import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const accs = await SocialAccountModel.find({ platform: 'instagram' });
  accs.forEach(acc => console.log('acc._id:', acc._id.toString(), 'acc.accountId:', acc.accountId));
  process.exit(0);
}
run();
