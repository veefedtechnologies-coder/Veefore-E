/**
 * Check social accounts in the CORRECT database (veeforedb)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  
  await mongoose.connect(uri, { dbName: 'veeforedb' });
  console.log('✅ Connected to MongoDB -', mongoose.connection.db!.databaseName);

  const db = mongoose.connection.db!;
  
  // List social account collections
  const collections = await db.listCollections().toArray();
  console.log('\n📋 Collections:');
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    if (count > 0) console.log(`  ${col.name}: ${count} documents`);
  }
  
  // Check socialaccounts
  const accounts = await db.collection('socialaccounts').find({}).toArray();
  console.log(`\n📊 Social accounts: ${accounts.length}`);
  
  for (const acc of accounts) {
    console.log('='.repeat(60));
    console.log(`Account: @${acc.username} (${acc.platform})`);
    console.log(`  _id:              ${acc._id}`);
    console.log(`  workspaceId:      ${acc.workspaceId}`);
    console.log(`  isActive:         ${acc.isActive}`);
    console.log(`  isConnected:      ${acc.isConnected}`);
    console.log(`  tokenStatus:      ${acc.tokenStatus}`);
    console.log(`  hasAccessToken:   ${acc.hasAccessToken}`);
    console.log(`  accessToken:      ${!!acc.accessToken} (length: ${acc.accessToken?.length || 0})`);
    console.log(`  encryptedToken:   ${!!acc.encryptedAccessToken} (length: ${acc.encryptedAccessToken?.length || 0})`);
    console.log(`  followersCount:   ${acc.followersCount}`);
  }
  
  // Frontend filter simulation
  console.log('\n\n🔍 Frontend validAccounts filter simulation:');
  console.log('Filter: (isConnected || tokenStatus) && (tokenStatus === "valid" || hasAccessToken || accessToken)');
  
  for (const acc of accounts) {
    const cond1 = !!(acc.isConnected || acc.tokenStatus);
    const cond2 = !!(acc.tokenStatus === 'valid' || acc.hasAccessToken || acc.accessToken);
    const isValid = cond1 && cond2;
    console.log(`  @${acc.username}: cond1=${cond1} cond2=${cond2} => VALID=${isValid}`);
    if (!isValid) {
      console.log(`    ❌ FAILS! isConnected=${acc.isConnected}, tokenStatus="${acc.tokenStatus}", hasAccessToken=${acc.hasAccessToken}`);
    } else {
      console.log(`    ✅ PASSES`);
    }
  }
  
  // Check workspaces
  const workspaces = await db.collection('workspaces').find({}).toArray();
  console.log(`\n🏢 Workspaces:`);
  for (const ws of workspaces) {
    console.log(`  ${ws._id}: "${ws.name}" default=${ws.isDefault}`);
  }

  // Now check what the API controller serializes (via sendSuccess)
  // The BaseController.sendSuccess wraps response as { success: true, data: ... }
  // The frontend extracts response.data from it
  // So we need to check if the Mongoose model toJSON transforms strip fields

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
