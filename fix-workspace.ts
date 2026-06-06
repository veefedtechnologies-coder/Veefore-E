import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const oldWs = "684402c2fd2cd4eb6521b386";
  const newWs = "ws_68440274";

  await mongoose.connection.db.collection('listening_posts').updateMany({ workspaceId: oldWs }, { $set: { workspaceId: newWs } });
  await mongoose.connection.db.collection('listening_trends').updateMany({ workspaceId: oldWs }, { $set: { workspaceId: newWs } });
  await mongoose.connection.db.collection('listening_hooks').updateMany({ workspaceId: oldWs }, { $set: { workspaceId: newWs } });

  console.log("Workspace IDs updated!");
  await mongoose.disconnect();
}
fix().catch(console.error);
