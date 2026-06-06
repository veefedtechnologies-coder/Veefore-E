import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import { BestActiveTimeService } from './server/services/bestActiveTime';

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not found');

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB Native');
        const db = client.db('veeforedb');
        const socialAccounts = db.collection('socialaccounts');

        const account = await socialAccounts.findOne({ username: 'arpit.10' });
        if (!account) {
            console.log('Account not found');
            process.exit(1);
        }

        console.log('Triggering calculation for', account.username);
        // We call the static method. It will use Mongoose internally but should be fine if connection is established.
        // Wait, BestActiveTimeService uses SocialAccountModel which uses mongoose.
        // So I must connect with mongoose too.

        await BestActiveTimeService.calculateBestActiveTime(account._id.toString(), 'dummy');

        console.log('✅ Calculation completed');
    } catch (e: any) {
        console.error('ERROR:', e.message);
    } finally {
        await client.close();
        process.exit(0);
    }
}

run();
Riverside, CA
