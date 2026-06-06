import axios from 'axios';
async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/dashboard/analytics', {
      headers: {
        Authorization: 'Bearer test_token_if_needed' // See if it needs a different token format
      }
    });
    console.log("Dashboard analytics:", res.data);
  } catch(e: any) {
    console.error("Error:", e.response?.data || e.message);
  }
}
run();
