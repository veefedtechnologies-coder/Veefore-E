import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const token = jwt.sign(
    { userId: 'XG0OYy2RkmYMhgRzT4cVjb4H0rY2', email: 'arpit@example.com' },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1d' }
  );

  try {
    const res = await axios.get('http://localhost:3000/api/social-listening/dashboard/overview/684402c2fd2cd4eb6521b386?niche=Technology', {
      headers: {
        Cookie: `token=${token}`
      }
    });
    console.log("API RES:", res.data);
  } catch(e: any) {
    console.error("ERR:", e.response?.data || e.message);
  }
}
check().catch(console.error);
