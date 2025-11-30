const { MongoClient } = require('mongodb')
const fetch = require('node-fetch')

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db('veefore')
  const acc = await db.collection('socialaccounts').findOne({ platform: 'instagram', username: 'arpit.10' })
  if (!acc) throw new Error('Account not found')
  console.log('Initial tokenStatus:', acc.tokenStatus, 'expiresAt:', acc.expiresAt)
  // 1) Force expire
  await db.collection('socialaccounts').updateOne({ _id: acc._id }, { $set: { expiresAt: new Date(Date.now() - 1000), tokenStatus: 'expired' } })
  // 2) Token status API should mark invalid/expired
  const statusResp = await fetch(`http://localhost:5000/api/instagram/token-status/${acc._id}`)
  const status = await statusResp.json()
  console.log('Token status API:', status)
  // 3) Disconnect
  const dcResp = await fetch('http://localhost:5000/api/instagram/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: acc._id.toString() }) })
  console.log('Disconnect:', await dcResp.json())
  const after = await db.collection('socialaccounts').findOne({ _id: acc._id })
  console.log('After cleanup tokens:', { accessToken: after.accessToken, encryptedAccessToken: after.encryptedAccessToken, tokenStatus: after.tokenStatus })
  await client.close()
}

run().catch(e => { console.error(e); process.exit(1) })

