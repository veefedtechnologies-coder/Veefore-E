
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Manual env loading to avoid alias issues
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
        const acc = await mongoose.connection.collection('socialaccounts').findOne({ username: 'rahulc1020' });

        if (acc) {
            console.log('ID:', acc._id);
            console.log('UpdatedAt:', acc.updatedAt);
            console.log('TokenLen:', acc.encryptedAccessToken ? acc.encryptedAccessToken.length : 'N/A');
        } else {
            console.log('Account not found');
        }
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}
check();
