import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
  const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
  await mongoose.connect(process.env.MONGODB_URI!, { 
    dbName,
    serverSelectionTimeoutMS: 20000 
  });
  console.log(`Connected to ${dbName}`);

  const db = mongoose.connection.db;
  
  // Find all users
  const users = await db?.collection('users').find({}).toArray();
  console.log(`Found ${users?.length} users:`);
  for (const user of (users || [])) {
    const userIdStr = user._id.toString();
    
    // Find workspaces for this user
    const workspaces = await db?.collection('workspaces').find({ userId: userIdStr }).toArray();
    
    if (workspaces && workspaces.length > 0) {
        console.log(` - ${user.email} (ID: ${user._id}, FirebaseUID: ${user.firebaseUid})`);
        console.log(`   Has ${workspaces.length} workspaces`);
        
        // Find accounts for this user
        const accounts = await db?.collection('socialaccounts').find({ workspaceId: { $in: workspaces.map(w => w._id.toString()) } }).toArray();
        console.log(`   Has ${accounts?.length} social accounts across these workspaces`);
        
        if (accounts && accounts.length > 0) {
            for (const acc of accounts) {
                console.log(`     * ${acc.username} (Workspace: ${acc.workspaceId})`);
            }
        }
    }
  }

  process.exit(0);
}

debug().catch(console.error);
