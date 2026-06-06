
import { storage } from '../storage';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function verifyPersistence() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is missing');
        return;
    }

    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log(`✅ Connected to ${mongoose.connection.name}`);

        const { SocialAccountModel } = await import('../models/Social/SocialAccount');

        const dummyData = {
            workspaceId: new mongoose.Types.ObjectId().toString(),
            platform: 'instagram',
            username: 'temp_verify_persistence',
            audienceActiveTime: { '0_12': 0.5, '0_13': 0.8 }
        };

        console.log('📝 Creating dummy account...');
        const created = await SocialAccountModel.create(dummyData);
        console.log('✅ Created ID:', created.id);
        console.log('✅ Created object keys:', Object.keys(created.toObject()));
        // @ts-ignore
        console.log('✅ Created audienceActiveTime:', created._doc?.audienceActiveTime || created.audienceActiveTime);

        console.log('🔍 Reading back via Model...');
        const direct = await SocialAccountModel.findById(created.id);
        // @ts-ignore
        console.log('📦 Direct Model retrieval:', direct?.toObject().audienceActiveTime);

        console.log('🔍 Reading back via Storage...');
        const retrieved = await storage.getSocialAccount(created.id);
        console.log('📦 Storage retrieval keys:', retrieved ? Object.keys(retrieved) : 'null');

        if (retrieved && retrieved.audienceActiveTime) {
            console.log('📦 Retrieved audienceActiveTime:', retrieved.audienceActiveTime);
            const val = retrieved.audienceActiveTime instanceof Map
                ? Object.fromEntries(retrieved.audienceActiveTime)
                : retrieved.audienceActiveTime;

            if (val['0_13'] === 0.8) {
                console.log('🎉 SUCCESS: Persistence verified!');
            } else {
                console.error('❌ Value mismatch');
            }
        } else {
            console.error('❌ Missing field in retrieval');
        }

        console.log('🧹 Cleaning up...');
        await SocialAccountModel.findByIdAndDelete(created.id);
        console.log('✅ Deleted');

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

verifyPersistence();
