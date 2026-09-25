import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'admin@schoolsghar.com';
const PASSWORD = process.env.PLATFORM_ADMIN_INITIAL_PASSWORD || 'Schoolsghar@GenZomate.coMm';
const API_URL = 'http://localhost:4000/api';

async function verify() {
  let dbConnection;
  try {
    console.log('Connecting to MongoDB...');
    dbConnection = await mongoose.connect(MONGODB_URI);
    const User = mongoose.connection.collection('users');
    const Role = mongoose.connection.collection('roles');

    const user = await User.findOne({ email: EMAIL.toLowerCase(), isArchived: false });
    
    console.log(`Platform Admin user exists = ${user ? 'YES' : 'NO'}`);
    if (!user) {
      console.log('User not found. Aborting.');
      return;
    }
    console.log(`entered email matches stored admin email = ${user.email === EMAIL.toLowerCase() ? 'YES' : 'NO'}`);
    console.log(`isPlatformAdmin = ${user.isPlatformAdmin}`);
    
    const role = await Role.findOne({ _id: user.roleId });
    console.log(`platform_admin role = ${role?.slug === 'platform_admin' ? 'YES' : 'NO'}`);
    console.log(`isActive = ${user.isActive}`);

    console.log('\n--- API Verification ---');
    
    // Correct login
    const loginRes = await axios.post(`${API_URL}/platform/auth/login`, { email: EMAIL, password: PASSWORD }, { validateStatus: () => true });
    console.log(`POST /api/platform/auth/login = ${loginRes.status}`);
    console.log(`login response success = ${loginRes.data?.success}`);
    const token = loginRes.data?.data?.accessToken;
    console.log(`access token returned = ${token ? 'YES' : 'NO'}`);

    if (token) {
      const dashboardRes = await axios.get(`${API_URL}/platform/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      console.log(`GET /api/platform/dashboard = ${dashboardRes.status}`);

      const customersRes = await axios.get(`${API_URL}/platform/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      console.log(`GET /api/platform/customers = ${customersRes.status}`);
    }

    // Wrong password
    const wrongPassRes = await axios.post(`${API_URL}/platform/auth/login`, { email: EMAIL, password: 'wrongpassword' }, { validateStatus: () => true });
    console.log(`Wrong password login = ${wrongPassRes.status}`);

    // Wrong email
    const wrongEmailRes = await axios.post(`${API_URL}/platform/auth/login`, { email: 'wrong@email.com', password: PASSWORD }, { validateStatus: () => true });
    console.log(`Wrong email login = ${wrongEmailRes.status}`);

  } catch (error) {
    console.error('Error during verification:', error.message);
  } finally {
    if (dbConnection) await mongoose.disconnect();
  }
}

verify();
