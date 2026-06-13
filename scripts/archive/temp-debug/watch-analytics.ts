import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

// Watch for ANY changes to the analytics collection
async function watch() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const db = mongoose.connection.db!;
  const collection = db.collection('analytics');
  
  // Set yesterday to 456 first
  await collection.updateOne(
    { _id: new mongoose.Types.ObjectId('6a12a75865a6b87f2cf43ad2') },
    { $set: { followers: 456 } }
  );
  console.log('Set yesterday to 456. Watching for changes...');
  
  // Watch for changes
  const changeStream = collection.watch([], { fullDocument: 'updateLookup' });
  
  changeStream.on('change', (change: any) => {
    if (change.documentKey?._id?.toString() === '6a12a75865a6b87f2cf43ad2') {
      console.log('\n🚨 YESTERDAY RECORD CHANGED!');
      console.log('Operation:', change.operationType);
      console.log('Update:', JSON.stringify(change.updateDescription?.updatedFields));
      console.log('Full doc followers:', change.fullDocument?.followers);
      console.log('Stack trace not available in change stream');
    } else {
      // Log other changes too
      const docId = change.documentKey?._id?.toString();
      console.log('Other change:', change.operationType, 'on', docId, '| followers:', change.updateDescription?.updatedFields?.followers);
    }
  });
  
  console.log('Watching... (Ctrl+C to stop)');
}

watch().catch(e => { console.error(e); process.exit(1); });
