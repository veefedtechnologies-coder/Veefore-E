require('dotenv').config({path: '.env'});
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  const db = mongoose.connection.db;
  const states = await db.collection('automationfunnelstates').find({ 
    expectedPayload: 'PAYLOAD_1779912136015_35'
  }).toArray();
  console.log(`Found ${states.length} states for that payload:`);
  console.dir(states, { depth: null });
  process.exit(0);
}
check();
