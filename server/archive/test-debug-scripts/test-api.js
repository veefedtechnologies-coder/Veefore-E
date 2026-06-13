import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  // Let's get the active workspace, there's a workspace for the user.
  const user = await db.collection('users').findOne({ email: 'rahulc1020@gmail.com' });
  if (!user) console.log("User not found");
  else console.log("User:", user.email, user._id);
  
  const workspaces = await db.collection('workspaces').find({ userId: user ? user._id : { $exists: true } }).toArray();
  console.log("Workspaces:", workspaces.map(w => w._id));
  
  await client.close();
}
run().catch(console.error);
