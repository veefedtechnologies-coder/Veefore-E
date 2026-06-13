
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Manual env loading
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function check() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI is missing');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
        const acc = await mongoose.connection.collection('socialaccounts').findOne({ username: 'rahulc1020' });

        if (acc) {
            console.log('--- DB RECORD ---');
            console.log('ID:', acc._id);
            console.log('Username:', acc.username);
            console.log('Total Reach:', acc.totalReach);
            console.log('Account Level Reach:', acc.accountLevelReach);
            console.log('Avg Reach:', acc.avgReach);
            console.log('Last Sync:', acc.lastSyncAt);
            console.log('Updated At:', acc.updatedAt);

            // Check if there are any Analytics records
            const analytics = await mongoose.connection.collection('analytics').find({
                workspaceId: acc.workspaceId,
                platform: 'instagram'
            }).sort({ date: -1 }).limit(3).toArray();

            console.log('\n--- ANALYTICS RECORDS ---');
            analytics.forEach(a => {
                console.log(`Date: ${a.date}, Reach: ${a.metrics?.reach}, Impressions: ${a.metrics?.impressions}`);
            });
        } else {
            console.log('Account not found');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
