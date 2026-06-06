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
  
  // Find the workspace owner
  const workspace = await db?.collection('workspaces').findOne({ _id: new mongoose.Types.ObjectId('69f9c2996c1a882c06ec05eb') });
  console.log('--- Workspace 69f9c2996c1a882c06ec05eb ---');
  if (workspace) {
    console.log(`Owner ID: ${workspace.ownerId}`);
    
    // Find all workspaces for this owner
    const workspaces = await db?.collection('workspaces').find({ ownerId: workspace.ownerId }).toArray();
    console.log(`User has ${workspaces?.length} workspaces:`);
    for (const w of (workspaces || [])) {
        console.log(` - ${w.name} (ID: ${w._id})`);
        
        // Find accounts in this workspace
        const accounts = await db?.collection('socialaccounts').find({ workspaceId: w._id.toString() }).toArray();
        console.log(`   Has ${accounts?.length} accounts: ${accounts?.map(a => a.username).join(', ')}`);
    }
  }

  process.exit(0);
}

debug().catch(console.error);
