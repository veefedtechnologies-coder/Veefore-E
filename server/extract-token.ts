#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SocialAccountModel } from './models/Social/SocialAccount';
import { decryptStoredToken } from './storage/converters';

dotenv.config();

async function extractToken() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        });

        if (!account) {
            console.error('Account not found');
            process.exit(1);
        }

        const token = decryptStoredToken(account.accessToken);

        if (!token) {
            console.error('Failed to decrypt token');
            process.exit(1);
        }

        // Output without newline and trimmed
        process.stdout.write(token.trim());

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

extractToken();
