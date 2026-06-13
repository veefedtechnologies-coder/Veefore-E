// Quick script to check analytics records and debug follower calculation
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const AnalyticsSchema = new mongoose.Schema({
    workspaceId: String,
    platform: String,
    date: Date,
    followers: Number
}, { collection: 'analytics' });

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

async function debugFollowerCalculation() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB');

        // Find all analytics records, sorted by date
        const records = await Analytics.find({})
            .sort({ date: -1 })
            .limit(10)
            .select('workspaceId platform date followers')
            .lean();

        console.log('\n=== LATEST 10 ANALYTICS RECORDS ===');
        records.forEach((record, index) => {
            console.log(`${index + 1}. Date: ${record.date?.toISOString()}, Followers: ${record.followers}, Platform: ${record.platform}`);
        });

        if (records.length >= 2) {
            const latest = records[0];
            const previous = records[1];
            const change = (latest.followers || 0) - (previous.followers || 0);
            console.log(`\nCHANGE: ${previous.followers} -> ${latest.followers} = ${change}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

debugFollowerCalculation();
