import axios from 'axios';

async function fetchMonitor() {
  try {
    const res = await axios.get('http://localhost:3000/api/admin/monitoring/meta-usage');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error('Error fetching monitor:', e.message);
  }
}

fetchMonitor();
