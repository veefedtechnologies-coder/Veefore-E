require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  const db = mongoose.connection.db;
  const states = await db.collection('automationfunnelstates').find().sort({ createdAt: -1 }).limit(3).toArray();
  console.log("Latest states:");
  console.dir(states, { depth: null });
  process.exit(0);
}
check();
