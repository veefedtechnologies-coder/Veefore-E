import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
    try {
        const uri = process.env.MONGODB_URI;
        await mongoose.connect(uri as string, { dbName: 'veeforedb' });
        
        const account = await mongoose.connection.db?.collection('socialaccounts').findOne({ username: 'arpit.10' });
        console.log(JSON.stringify(account, null, 2));
    } catch(e) {
        console.error("Error:", e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
run();
