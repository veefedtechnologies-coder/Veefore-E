import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TrendEngineService } from '../services/social-listening/trend-engine.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  try {
    // Connect to test db to read data
    await mongoose.connect(process.env.MONGODB_URI as string);
    const mockWid = '6841a7d5d70118ce230574f8';
    
    // READ posts, hooks, trends, aggregations for mockWid
    const posts = await mongoose.connection.collection('listening_posts').find({ workspaceId: mockWid }).toArray();
    const hooks = await mongoose.connection.collection('listeninghooks').find({ workspaceId: mockWid }).toArray();
    const trends = await mongoose.connection.collection('listening_trends').find({ workspaceId: mockWid }).toArray();
    const aggs = await mongoose.connection.collection('listeningaggregations').find({ workspaceId: mockWid }).toArray();

    await mongoose.disconnect();
    
    console.log(`Read ${posts.length} posts, ${hooks.length} hooks, ${trends.length} trends, ${aggs.length} aggs from test DB.`);

    // Connect to veeforedb to write data
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    console.log('✅ Connected to veeforedb');

    const workspaces = await mongoose.connection.collection('workspaces').find({}).toArray();
    console.log(`Found ${workspaces.length} workspaces in veeforedb.`);

    // Clear existing to avoid duplicates
    await mongoose.connection.collection('listening_posts').deleteMany({});
    await mongoose.connection.collection('listeninghooks').deleteMany({});
    await mongoose.connection.collection('listening_trends').deleteMany({});
    await mongoose.connection.collection('listeningaggregations').deleteMany({});

    let postInserts = [];
    let hookInserts = [];
    let trendInserts = [];
    let aggInserts = [];

    for (const ws of workspaces) {
      const wid = ws._id.toString();
      
      for (const p of posts) {
        const { _id, ...rest } = p;
        postInserts.push({ ...rest, workspaceId: wid, externalId: p.externalId + '_' + wid, publishedAt: new Date() });
      }
      for (const h of hooks) {
        const { _id, ...rest } = h;
        hookInserts.push({ ...rest, workspaceId: wid });
      }
      for (const t of trends) {
        const { _id, ...rest } = t;
        trendInserts.push({ ...rest, workspaceId: wid, lastCalculatedAt: new Date() });
      }
      for (const a of aggs) {
        const { _id, ...rest } = a;
        aggInserts.push({ ...rest, workspaceId: wid, date: new Date() });
      }
    }

    if (postInserts.length) await mongoose.connection.collection('listening_posts').insertMany(postInserts);
    if (hookInserts.length) await mongoose.connection.collection('listeninghooks').insertMany(hookInserts);
    if (trendInserts.length) await mongoose.connection.collection('listening_trends').insertMany(trendInserts);
    if (aggInserts.length) await mongoose.connection.collection('listeningaggregations').insertMany(aggInserts);

    console.log('🎉 Done inserting identical test data into ALL veeforedb workspaces instantly!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
