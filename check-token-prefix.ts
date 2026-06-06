
import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social';
import { tokenEncryption } from './server/security/token-encryption';

process.env.TOKEN_ENCRYPTION_KEY = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';

const MONGO_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'veeforedb';

async function checkToken() {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    const account = await SocialAccountModel.findOne({ username: 'rahulc1020' });
    if (account && account.encryptedAccessToken) {
        try {
            const token = tokenEncryption.decryptToken(account.encryptedAccessToken);
            console.log('TOKEN_PREFIX:', token.substring(0, 4));
        } catch (e: any) {
            console.log('DECRYPTION_FAILED:', e.message);
        }
    } else {
        console.log('ACCOUNT_NOT_FOUND');
    }
    await mongoose.disconnect();
}
checkToken();
