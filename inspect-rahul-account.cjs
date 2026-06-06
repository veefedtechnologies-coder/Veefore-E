const { MongoClient } = require('mongodb');

async function inspectRahul() {
    const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('veeforedb');

        const account = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
        console.log('Full Account Record for @rahulc1020:');
        console.log(JSON.stringify(account, null, 2));

    } finally {
        await client.close();
    }
}

inspectRahul();
