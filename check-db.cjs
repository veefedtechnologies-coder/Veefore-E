const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const db = mongoose.connection.db;
  
  const post = await db.collection('contents').findOne({ platform: 'instagram' });
  console.log(JSON.stringify(post, null, 2));

  process.exit(0);
}

check().catch(console.error);