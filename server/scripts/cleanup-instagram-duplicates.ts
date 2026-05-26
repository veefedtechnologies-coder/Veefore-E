import { MongoStorage } from '../mongodb-storage';
import { cleanupDuplicateInstagramAccounts } from '../utils/instagram-validation';

/**
 * Migration script to clean up duplicate Instagram accounts
 * Usage: tsx server/scripts/cleanup-instagram-duplicates.ts [priorityWorkspaceId]
 */

async function runCleanupMigration() {
  try {
    console.log('🧹 Starting Instagram account duplicate cleanup migration...');
    
    // Get priority workspace from command line argument
    const priorityWorkspaceId = process.argv[2];
    
    if (priorityWorkspaceId) {
      console.log(`🎯 Priority workspace specified: ${priorityWorkspaceId}`);
      console.log('   Accounts in this workspace will be preserved when duplicates are found');
    } else {
      console.log('ℹ️  No priority workspace specified - keeping oldest connections');
    }
    
    // Connect to database
    console.log('🔌 Connecting to MongoDB...');
    const storage = new MongoStorage();
    await storage.connect();
    console.log('✅ Connected to database');
    
    // Run the cleanup
    await cleanupDuplicateInstagramAccounts(priorityWorkspaceId);
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   - All duplicate Instagram accounts have been cleaned up');
    console.log('   - Each Instagram account is now connected to only one workspace');
    console.log('   - Future connections will be validated to prevent duplicates');
    
    process.exit(0);
    
  } catch (error) {
    console.error('🚨 Migration failed:', error);
    process.exit(1);
  }
}

// Handle specific user case: rahulc1020 account
async function cleanupRahulcAccount() {
  try {
    console.log('🔍 Searching for rahulc1020 account duplicates...');
    
    const storage = new MongoStorage();
    await storage.connect();
    
    const users = await storage.getAllUsers();
    const rahulcUsers = users.filter(u => 
      u.instagramUsername === 'rahulc1020' || 
      u.username?.toLowerCase().includes('rahulc') ||
      u.email?.toLowerCase().includes('rahulc')
    );
    
    if (rahulcUsers.length === 0) {
      console.log('ℹ️  No rahulc1020 accounts found');
      return;
    }
    
    console.log(`📱 Found ${rahulcUsers.length} potential rahulc accounts:`);
    rahulcUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.username} (${user.email}) - Workspace: ${user.workspaceId}`);
      console.log(`     Instagram: @${user.instagramUsername} (${user.instagramAccountId})`);
    });
    
    // If there are multiple, suggest running cleanup with specific workspace
    if (rahulcUsers.length > 1) {
      console.log('');
      console.log('🔧 To specify which workspace should keep the account:');
      console.log(`   tsx server/scripts/cleanup-instagram-duplicates.ts [WORKSPACE_ID]`);
      console.log('');
      console.log('Available workspace IDs:');
      rahulcUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.workspaceId} (${user.username})`);
      });
    }
    
  } catch (error) {
    console.error('🚨 Error checking rahulc1020 account:', error);
  }
}

// Main execution
const command = process.argv[3];
if (command === '--check-rahulc') {
  cleanupRahulcAccount();
} else {
  runCleanupMigration();
}