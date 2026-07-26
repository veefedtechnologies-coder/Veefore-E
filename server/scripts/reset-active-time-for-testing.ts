/**
 * reset-active-time-for-testing.ts
 *
 * Clears audienceActiveTime from the DB so the next OAuth reconnect
 * properly tests the ConnectInitService demographics refresh path.
 *
 * Run BEFORE disconnecting + reconnecting to test the real flow.
 *
 * Usage: npx tsx server/scripts/reset-active-time-for-testing.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });

  const result = await mongoose.connection.db!.collection('socialaccounts').updateOne(
    { platform: 'instagram', username: 'arpit.10' },
    { $unset: { audienceActiveTime: '' } }
  );

  console.log(`✅ Cleared audienceActiveTime (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
  console.log('Now disconnect + reconnect your Instagram account through OAuth to test the real sync flow.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
