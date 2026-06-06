import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const Schema = new mongoose.Schema({}, { strict: false });
const Model = mongoose.model('SocialAccount', Schema, 'socialaccounts');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const records = await Model.find({ workspaceId: '684402c2fd2cd4eb6521b386' });
    records.forEach(r => console.log(r._id, 'username:', r.get('username'), 'followersCount:', r.get('followersCount'), 'updatedAt:', r.get('updatedAt')));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
