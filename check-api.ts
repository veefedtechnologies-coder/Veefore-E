import axios from 'axios';
async function check() {
  const res = await axios.get('http://localhost:3000/api/social-listening/dashboard/overview/684402c2fd2cd4eb6521b386?niche=Technology');
  console.log("API RES:", res.data);
}
check().catch(console.error);
