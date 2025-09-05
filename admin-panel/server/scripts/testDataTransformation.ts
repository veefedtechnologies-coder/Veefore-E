import 'dotenv/config';
import { getMainAppUsers } from '../services/userDataService';

async function testDataTransformation() {
  try {
    console.log('🔍 Testing data transformation...');
    
    const result = await getMainAppUsers({}, {
      page: 1,
      limit: 3,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });
    
    console.log(`\n📊 Found ${result.users.length} users:`);
    
    result.users.forEach((user, index) => {
      console.log(`\n--- User ${index + 1} ---`);
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Social Connections:', user.socialConnections);
      console.log('Last Login Formatted:', user.lastLoginFormatted);
      console.log('Engagement Score:', user.engagementScore);
      console.log('Status:', user.subscription?.status);
      console.log('Plan:', user.subscription?.plan);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

testDataTransformation();