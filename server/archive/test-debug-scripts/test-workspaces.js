import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const wks = await db.collection('workspaces').find().toArray();
  console.log("Total workspaces:", wks.length);
  
  const accs = await db.collection('socialaccounts').find().toArray();
  const followersByWorkspace = {};
  for(const a of accs) {
      if(!followersByWorkspace[a.workspaceId]) followersByWorkspace[a.workspaceId] = 0;
      followersByWorkspace[a.workspaceId] += a.followersCount || 0;
  }
  
  for(const wId in followersByWorkspace) {
      if(followersByWorkspace[wId] === 119 || followersByWorkspace[wId] === 116) {
          console.log("Workspace with exactly 116 or 119 followers:", wId);
      }
  }

  await client.close();
}
run().catch(console.error);
