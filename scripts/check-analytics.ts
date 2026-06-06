import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

async function checkData() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not found in environment');
        process.exit(1);
    }

    await mongoose.connect(uri, { dbName: 'veeforedb' });
    console.log('Connected to veeforedb');

    const db = mongoose.connection.db;

    const workspaces = await db.collection('workspaces').find({}).toArray();
    console.log('\n--- Workspaces ---');
    workspaces.forEach(w => console.log(`ID: ${w._id}, Name: ${w.name}`));

    const sample = await db.collection('analytics').findOne({});
    console.log('\n--- Analytics Sample Document ---');
    console.log(JSON.stringify(sample, null, 2));

    if (sample) {
        console.log(`\nworkspaceId type: ${typeof sample.workspaceId}`);
        if (sample.workspaceId instanceof mongoose.Types.ObjectId) {
            console.log('workspaceId is an ObjectId');
        } else {
            console.log('workspaceId is NOT an ObjectId');
        }
    }

    const counts = await db.collection('analytics').aggregate([
        { $group: { _id: '$workspaceId', count: { $sum: 1 } } }
    ]).toArray();

    console.log('\n--- Analytics Counts per Workspace ---');
    counts.forEach(c => console.log(`Workspace: ${c._id}, Count: ${c.count}`));

    const latestData = await db.collection('analytics').find({}).sort({ date: -1 }).limit(5).toArray();
    console.log('\n--- Latest 5 Analytics Entries ---');
    latestData.forEach(d => {
        console.log(`Date: ${d.date}, Platform: ${d.platform}, WorkspaceId: ${d.workspaceId}, Followers: ${d.followers}, Reach: ${d.reach}`);
    });

    await mongoose.disconnect();
}

checkData().catch(err => {
    console.error(err);
    process.exit(1);
});
