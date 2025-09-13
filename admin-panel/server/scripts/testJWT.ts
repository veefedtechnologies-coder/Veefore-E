import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testJWT() {
  try {
    console.log('🔍 Testing JWT configuration...');
    console.log('  - JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('  - JWT_SECRET value:', process.env.JWT_SECRET);
    
    // Create a test token with the admin panel's JWT secret
    const testPayload = {
      adminId: '68bc481d7d1e16ef75881636',
      email: 'admin@veefore.com',
      role: 'superadmin'
    };
    
    const token = jwt.sign(testPayload, process.env.JWT_SECRET!, { expiresIn: '1h' });
    console.log('  - Generated token:', token.substring(0, 50) + '...');
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    console.log('  - Token verification successful:', !!decoded);
    console.log('  - Decoded payload:', decoded);
    
  } catch (error) {
    console.log('❌ JWT test failed:', error.message);
  }
}

testJWT();
