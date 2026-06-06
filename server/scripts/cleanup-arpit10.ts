/**
 * Script to find and clean up @arpit.10 Instagram account from all workspaces
 * This removes tokens so it can be freshly reconnected to the current workspace
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI!;

async function main() {
  console.log('🔍 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db!;
  const socialAccounts = db.collection('socialaccounts');

  // 1. Find ALL instances of @arpit.10 (or arpit.10) across all workspaces
  console.log('═══════════════════════════════════════════════════');
  console.log('🔍 Searching for @arpit.10 across ALL workspaces...');
  console.log('═══════════════════════════════════════════════════\n');

  const accounts = await socialAccounts.find({
    $or: [
      { username: 'arpit.10' },
      { username: 'arpit_10' },
      { username: { $regex: /arpit.?10/i } }
    ]
  }).toArray();

  if (accounts.length === 0) {
    console.log('❌ No accounts found matching @arpit.10');
    
    // Also check all instagram accounts to be safe
    console.log('\n📋 Listing ALL Instagram accounts in the database:');
    const allIg = await socialAccounts.find({ platform: 'instagram' }).toArray();
    for (const acc of allIg) {
      console.log(`  - @${acc.username} | Workspace: ${acc.workspaceId} | ID: ${acc._id} | AccountId: ${acc.accountId}`);
    }
    
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${accounts.length} instance(s) of @arpit.10:\n`);

  for (const acc of accounts) {
    console.log(`  📱 Instance ${accounts.indexOf(acc) + 1}:`);
    console.log(`     MongoDB _id:    ${acc._id}`);
    console.log(`     Username:       @${acc.username}`);
    console.log(`     Account ID:     ${acc.accountId}`);
    console.log(`     Workspace ID:   ${acc.workspaceId}`);
    console.log(`     Platform:       ${acc.platform}`);
    console.log(`     Token Status:   ${acc.tokenStatus || 'unknown'}`);
    console.log(`     Has Token:      ${!!acc.accessToken}`);
    console.log(`     Has Encrypted:  ${!!acc.encryptedAccessToken}`);
    console.log(`     Last Sync:      ${acc.lastSyncAt || acc.updatedAt || 'never'}`);
    console.log();
  }

  // 2. DELETE all instances of this account from all workspaces
  console.log('═══════════════════════════════════════════════════');
  console.log('🗑️  REMOVING @arpit.10 from ALL workspaces...');
  console.log('═══════════════════════════════════════════════════\n');

  for (const acc of accounts) {
    const result = await socialAccounts.deleteOne({ _id: acc._id });
    console.log(`  ✅ Deleted from workspace ${acc.workspaceId} (${result.deletedCount} removed)`);
  }

  // 3. Also check the users collection for any lingering Instagram references
  const usersCollection = db.collection('users');
  const usersWithArpit = await usersCollection.find({
    $or: [
      { instagramUsername: 'arpit.10' },
      { instagramUsername: { $regex: /arpit.?10/i } }
    ]
  }).toArray();

  if (usersWithArpit.length > 0) {
    console.log(`\n  🧹 Also cleaning ${usersWithArpit.length} user record(s) with Instagram references:`);
    for (const user of usersWithArpit) {
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            instagramToken: null,
            instagramRefreshToken: null,
            instagramTokenExpiry: null,
            instagramAccountId: null,
            instagramUsername: null,
          }
        }
      );
      console.log(`     ✅ Cleaned user: ${user.username || user.email || user._id}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ CLEANUP COMPLETE!');
  console.log('═══════════════════════════════════════════════════');
  console.log('\n@arpit.10 has been fully removed from all workspaces.');
  console.log('You can now reconnect it via the Integration page.\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
