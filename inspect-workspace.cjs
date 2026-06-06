const { MongoClient } = require('mongodb');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from server/.env
const envPath = path.join(__dirname, 'server', '.env');
dotenv.config({ path: envPath });

const uri = process.env.MONGODB_URI;

async function inspectWorkspace() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        const workspaceId = '68b723f16bcd3c9930f28762';

        console.log(`🔍 Inspecting Workspace: ${workspaceId}`);

        const sa = await db.collection('socialaccounts').find({ workspaceId }).toArray();
        console.log(`\n--- Social Accounts (${sa.length}) ---`);
        sa.forEach(a => {
            console.log(`ID: ${a._id}, Platform: ${a.platform}, Reach: ${a.totalReach}, avgEngagement: ${a.avgEngagement}`);
        });

        const an = await db.collection('analytics').find({ workspaceId }).toArray();
        console.log(`\n--- Analytics Documents (${an.length}) ---`);
        an.forEach(a => {
            console.log(`ID: ${a._id}, Platform: ${a.platform}, Reach: ${a.reach}, Engagement: ${a.engagement}`);
        });

    } catch (error) {
        console.error('❌ Inspection failed:', error);
    } finally {
        await client.close();
    }
}

inspectWorkspace();
