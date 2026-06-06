import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social/SocialAccount';

async function findToken() {
    try {
        await mongoose.connect('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            followersCount: { $gt: 100 }
        });

        if (account) {
            console.log('VALID_TOKEN=' + account.accessToken);
            console.log('ACCOUNT_ID=' + account.accountId);
            console.log('USERNAME=' + account.username);
        } else {
            console.log('No account found with >100 followers');
            const any = await SocialAccountModel.findOne({ platform: 'instagram' });
            if (any) {
                console.log('VALID_TOKEN=' + any.accessToken);
                console.log('ACCOUNT_ID=' + any.accountId);
                console.log('USERNAME=' + any.username);
            }
        }
    } catch (err: any) {
        console.error(err.message);
    } finally {
        await mongoose.disconnect();
    }
}

findToken();
