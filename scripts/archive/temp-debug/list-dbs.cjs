const { MongoClient } = require('mongodb');

async function listDbs() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const admin = client.db().admin();
        const dbs = await admin.listDatabases();
        console.log('Databases:');
        dbs.databases.forEach(db => console.log(` - ${db.name}`));
    } finally {
        await client.close();
    }
}

listDbs();
