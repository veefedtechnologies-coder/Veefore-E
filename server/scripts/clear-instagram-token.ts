
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SocialAccountModel } from '../models/Social/SocialAccount';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-local';

async function main() {
    try {
        console.log('Connecting to MongoDB at:', MONGODB_URI);
        const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
        console.log('Using Database Name:', dbName);

        await mongoose.connect(MONGODB_URI, {
            dbName: dbName
        });
        console.log('Connected.');

        // Find the target account
        const username = 'arpit.10'; // Target account
        console.log(`Searching for account: ${username}`);
        const account = await SocialAccountModel.findOne({ username, platform: 'instagram' });

        if (!account) {
            console.error(`Account ${username} not found!`);
            process.exit(1);
        }

        console.log(`Found account: ${account.username} (${account._id})`);

        // Clear token fields
        await SocialAccountModel.updateOne(
            { _id: account._id },
            {
                $unset: {
                    accessToken: "",
                    encryptedAccessToken: "",
                    refreshToken: "",
                    encryptedRefreshToken: ""
                },
                $set: {
                    tokenStatus: 'missing',
                    updatedAt: new Date()
                }
            }
        );

        console.log('✅ Successfully cleared access tokens.');
        console.log('ACTION REQUIRED: Please go to the Veefore app and reconnect/refresh the Instagram account for this user.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

main();
