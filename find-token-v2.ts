import { connectionManager } from './server/infrastructure/mongodb-connection';
import { SocialAccountModel } from './server/models/Social/SocialAccount';
import { getAccessTokenFromAccount } from './server/storage/converters';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
    try {
        await connectionManager.connect();
        const specificId = '69899bfd8041d0cc5940e75f';
        const accountDoc = await SocialAccountModel.findById(specificId);

        if (accountDoc) {
            const token = getAccessTokenFromAccount(accountDoc as any);
            console.log('TOKEN:' + token);
            console.log('ACCOUNT_ID:' + accountDoc.accountId);
            console.log('USERNAME:' + accountDoc.username);
        } else {
            console.log('Account not found: ' + specificId);
            const all = await SocialAccountModel.find({ platform: 'instagram' });
            console.log('Found ' + all.length + ' insta accounts');
            all.forEach(a => console.log(`ID: ${a._id}, User: ${a.username}`));
        }
    } catch (err: any) {
        console.error(err.message);
    } finally {
        process.exit(0);
    }
}

run();
