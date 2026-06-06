/**
 * Find ALL social accounts and Instagram references across the entire database
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  console.log('═══════════════════════════════════════');
  console.log('📋 ALL collections in database:');
  console.log('═══════════════════════════════════════');
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  ${col.name}: ${count} documents`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📱 ALL social accounts (any platform):');
  console.log('═══════════════════════════════════════');
  const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
  if (socialAccounts.length === 0) {
    console.log('  (none found)');
  }
  for (const acc of socialAccounts) {
    console.log(`  - @${acc.username} | Platform: ${acc.platform} | Workspace: ${acc.workspaceId} | AccountId: ${acc.accountId} | _id: ${acc._id}`);
  }

  // Check other possible collection names
  for (const name of ['social_accounts', 'SocialAccounts', 'socialAccounts', 'social-accounts']) {
    const col = collections.find(c => c.name === name);
    if (col) {
      const docs = await db.collection(name).find({}).toArray();
      console.log(`\n  📦 Also found in '${name}': ${docs.length} documents`);
      for (const d of docs) {
        console.log(`    - @${d.username} | ${d.platform} | workspace: ${d.workspaceId}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('👤 Users with Instagram references:');
  console.log('═══════════════════════════════════════');
  const users = await db.collection('users').find({
    $or: [
      { instagramAccountId: { $ne: null } },
      { instagramUsername: { $ne: null } }
    ]
  }).toArray();
  
  if (users.length === 0) {
    console.log('  (none found)');
  }
  for (const u of users) {
    console.log(`  - User: ${u.username || u.email} | IG: @${u.instagramUsername} | IG AccountId: ${u.instagramAccountId} | Workspace: ${u.workspaceId}`);
  }

  // Check workspaces too
  console.log('\n═══════════════════════════════════════');
  console.log('🏢 Workspaces with Instagram data:');
  console.log('═══════════════════════════════════════');
  const workspaces = await db.collection('workspaces').find({}).toArray();
  for (const ws of workspaces) {
    const hasSocial = ws.socialAccounts || ws.instagramAccountId || ws.instagramUsername;
    if (hasSocial) {
      console.log(`  - Workspace: ${ws.name || ws._id} | IG: ${ws.instagramUsername || 'N/A'} | Social: ${JSON.stringify(ws.socialAccounts || 'none')}`);
    }
  }
  if (workspaces.length > 0 && !workspaces.some(ws => ws.socialAccounts || ws.instagramAccountId)) {
    console.log('  (no workspaces have Instagram data)');
  }

  console.log('\n═══════════════════════════════════════');
  console.log('🔎 All workspaces:');
  console.log('═══════════════════════════════════════');
  for (const ws of workspaces) {
    console.log(`  - ${ws.name || 'unnamed'} | _id: ${ws._id}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err);
  mongoose.disconnect();
});
