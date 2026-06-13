
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { socialAccountRepository } from './server/repositories/SocialAccountRepository';
import { getAccessTokenFromAccount } from './server/storage/converters';
import InstagramApiService from './server/services/instagramApi';

async function listMedia() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
        const account = await socialAccountRepository.findById('69882372f5077d91457e876a');
        if (!account) return;
        const token = getAccessTokenFromAccount(account);
        console.log('Fetching media...');
        const mediaResponse = await InstagramApiService.getUserMedia(token, 100);
        console.log('Media Count: ' + mediaResponse.data.length);
        mediaResponse.data.forEach(m => console.log(m.timestamp + ' - ' + m.id + ' - ' + m.media_type));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

listMedia();
