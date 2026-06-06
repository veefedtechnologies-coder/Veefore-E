
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
    const db = mongoose.connection.db;
    const workspaces = await db.collection('workspaces').find({}).toArray();
    const socialAccounts = await db.collection('socialaccounts').find({}).toArray();

    console.log('--- Workspace ID Prefixes (6 chars) ---');
    const wsPrefixes = new Map();
    workspaces.forEach(w => {
        const id = w._id.toString();
        const prefix = id.substring(0, 6);
        if (!wsPrefixes.has(prefix)) wsPrefixes.set(prefix, []);
        wsPrefixes.get(prefix).push({ id, name: w.name });
    });

    let totalCollisions = 0;
    for (const [prefix, list] of wsPrefixes.entries()) {
        if (list.length > 1) {
            totalCollisions++;
            console.log('🚨 COLLISION for prefix', prefix + ':');
            list.forEach(item => console.log('  -', item.id, '(' + item.name + ')'));
        }
    }

    if (totalCollisions === 0) {
        console.log('✅ No prefix collisions found among', workspaces.length, 'workspaces.');
    }

    console.log('\n--- Social Account Mappings ---');
    socialAccounts.forEach(sa => {
        console.log('Account:', sa.username, 'Platform:', sa.platform, 'Workspace:', sa.workspaceId);
    });

    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
