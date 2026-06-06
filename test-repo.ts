import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { socialAccountRepository } from './server/repositories/SocialAccountRepository';

async function run() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri as string, { dbName: 'veeforedb' });
        
        const accounts = await socialAccountRepository.findByWorkspaceWithTolerantLookup('69f9c2996c1a882c06ec05eb');
        console.log("Returned accounts:", accounts.length);
        accounts.forEach((a: any) => console.log(a.username, "isActive:", a.isActive));
    } catch(e) {
        console.error("Error:", e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
run();
