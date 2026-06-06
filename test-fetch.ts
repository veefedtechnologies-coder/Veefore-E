import 'dotenv/config';
import { InstagramApiService } from './server/services/instagramApi';
import axios from 'axios';

async function testFetch() {
  console.log('Testing makeApiRequest...');
  try {
    const data = await InstagramApiService['makeApiRequest']('https://graph.facebook.com/v18.0/me?access_token=INVALID_TOKEN');
    console.log(data);
  } catch (e: any) {
    console.log('makeApiRequest Threw correctly:', e.message);
  }
  process.exit(0);
}
testFetch();
