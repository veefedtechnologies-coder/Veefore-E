import mongoose from 'mongoose';
import axios from 'axios';
import 'dotenv/config';

async function testHttp() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const user = await User.findOne();
  
  if (!user) {
    console.log('No user');
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) return;
  const session = await db.collection('sessions').findOne({ 'session.passport.user': user._id.toString() });
  
  // Actually, I can't easily mock the session cookie.
  // But wait, there is `GET /api/dashboard/meta-usage` which is open? No.
  
  process.exit(0);
}
testHttp();
