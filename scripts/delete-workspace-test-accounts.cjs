const { MongoClient } = require('mongodb')

async function run(workspaceId) {
  if (!workspaceId) {
    console.error('Workspace ID is required')
    process.exit(1)
  }

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()

    const dbNames = ['veeforedb', 'veefore']
    const collNames = ['socialaccounts', 'socialAccounts']
    let totalDeleted = 0

    for (const dbName of dbNames) {
      const db = client.db(dbName)
      for (const collName of collNames) {
        const coll = db.collection(collName)
        const ws = workspaceId.toString()

        const query = {
          workspaceId: ws,
          $or: [
            { isTestAccount: true },
            { tokenStatus: { $in: ['invalid', 'missing', 'expired'] } },
            {
              $and: [
                { $or: [ { accessToken: { $exists: false } }, { accessToken: null }, { accessToken: '' } ] },
                { $or: [ { encryptedAccessToken: { $exists: false } }, { encryptedAccessToken: null } ] }
              ]
            },
            { username: { $regex: /(test|demo|sample)/i } }
          ]
        }

        const toDelete = await coll.find(query).project({ _id: 1, username: 1, platform: 1 }).toArray()
        if (toDelete.length > 0) {
          const ids = toDelete.map(d => d._id)
          const res = await coll.deleteMany({ _id: { $in: ids } })
          console.log(`[DELETE] ${dbName}.${collName}: Deleted ${res.deletedCount} accounts in workspace ${ws}`)
          toDelete.forEach(a => console.log(` - @${a.username} (${a.platform})`))
          totalDeleted += res.deletedCount
        } else {
          console.log(`[DELETE] ${dbName}.${collName}: No matching test/invalid accounts found in workspace ${ws}`)
        }
      }
    }

    console.log(`Total deleted: ${totalDeleted}`)
  } catch (e) {
    console.error('Deletion failed:', e)
    process.exit(1)
  } finally {
    await client.close()
  }
}

const workspaceId = process.argv[2]
run(workspaceId)

