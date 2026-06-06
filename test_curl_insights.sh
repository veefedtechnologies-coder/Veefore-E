#!/bin/bash
MONGODB_URI="mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
# Get the token and a media ID
DATA=$(npx tsx - <<'ESCRIPT'
import mongoose from 'mongoose';
async function run() {
  await mongoose.connect("", { dbName: 'veeforedb' });
  const account = await mongoose.connection.collection('socialaccounts').findOne({ platform: 'instagram' });
  const content = await mongoose.connection.collection('contents').findOne({ platform: 'instagram', 'contentData.id': { $exists: true } });
  console.log(JSON.stringify({ token: account.accessToken, mediaId: content.contentData.id }));
  process.exit(0);
}
run();
ESCRIPT
)

TOKEN=$(echo $DATA | jq -r .token)
MEDIA_ID=$(echo $DATA | jq -r .mediaId)

echo "Testing Media ID: $MEDIA_ID"
curl -s "https://graph.facebook.com/v22.0/$MEDIA_ID/insights?metric=reach,impressions,saved&access_token=$TOKEN" > curl_resp.json
echo "Raw Response:"
cat curl_resp.json
