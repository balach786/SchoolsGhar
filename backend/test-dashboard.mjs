import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    const loginRes = await axios.post('http://localhost:4000/api/platform/auth/login', { email: process.env.PLATFORM_ADMIN_EMAIL, password: process.env.PLATFORM_ADMIN_INITIAL_PASSWORD });
    const token = loginRes.data.data.accessToken;
    try {
        const dashboardRes = await axios.get('http://localhost:4000/api/platform/dashboard', {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Dashboard Success:', dashboardRes.status);
    } catch (err) {
        console.log('Dashboard Error Data:', err.response?.data);
    }
  } catch (err) {
    console.log('Login Error Data:', err.message, err.response?.data);
  }
})();
