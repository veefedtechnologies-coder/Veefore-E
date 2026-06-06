const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  const uri = process.env.MONGODB_URI.includes('?') 
    ? process.env.MONGODB_URI.replace('?', 'veeforedb?')
    : process.env.MONGODB_URI + '/veeforedb';
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const db = mongoose.connection.db;
  const posts = await db.collection('contents').find({}).sort({ 'contentData.timestamp': -1 }).toArray();
  
  console.log(`Found ${posts.length} posts`);
  posts.forEach((p, i) => {
    console.log(`Post ${i+1}: ${p.contentData.timestamp}`);
  });
  
  process.exit(0);
  
  // Count how many are older than 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const oldPosts = posts.filter(p => new Date(p.contentData.timestamp) < cutoff);
  console.log(`${oldPosts.length} posts are OLDER than 14 days.`);
  
  process.exit(0);
}
check().catch(console.error);
