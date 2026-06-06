import axios from 'axios';
async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/dashboard/analytics?workspaceId=684402c2fd2cd4eb6521b386', {
      headers: {
        Cookie: 'auth_token=mocked-auth-token-for-development'
      }
    });
    console.log("Dashboard response:", res.data);
  } catch(e: any) {
    console.error("Dashboard error:", e.response?.data || e.message);
  }
}
run();
