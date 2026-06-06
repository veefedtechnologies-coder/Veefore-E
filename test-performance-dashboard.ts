import axios from 'axios';
async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/dashboard/analytics', {
      headers: {
        Cookie: 'auth_token=mocked-auth-token-for-development'
      }
    });
    console.log("Dashboard analytics:", res.data);
  } catch(e: any) {
    console.error("Error:", e.response?.data || e.message);
  }
}
run();
