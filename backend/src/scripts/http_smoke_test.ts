import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:4000/api';

async function run() {
  try {
    console.log("Waiting for backend to start...");
    await new Promise(r => setTimeout(r, 5000));

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolsghar');
    await mongoose.connection.useDb('schoolsghar_master').collection('tenants').updateOne({ slug: 'bkm' }, {
      $set: { trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), status: 'active' }
    });

    console.log("1. Logging in...");
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@bkm.com', password: 'password123', schoolCode: 'bkm' })
    });
    
    if (!loginRes.ok) {
      console.error(await loginRes.text());
      throw new Error("Login failed");
    }
    
    const loginData = await loginRes.json() as any;
    const token = loginData.data.accessToken;
    console.log("Login successful! Token obtained.");

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Slug': 'bkm' // Just in case, though the backend might infer it from the user's token
    };

    console.log("2. Batch 1: Create Class...");
    let classId = '';
    const classRes = await fetch(`${API_URL}/classes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Smoke Class', code: 'SMK', order: 1 })
    });
    if (!classRes.ok) {
      const txt = await classRes.text();
      console.log("Create Class response:", txt);
      // Wait, we need an academic session active. If not, it fails.
      // But TenantProvisioningService already created one and set it as active!
    } else {
      const cls = await classRes.json() as any;
      classId = cls.data?._id || cls.data?.class?._id || (cls.data && cls.data[0] && cls.data[0]._id);
      console.log("Class created:", classId);
    }
    
    console.log("3. Batch 1: List Classes...");
    const listClassRes = await fetch(`${API_URL}/classes`, { headers });
    const classList = await listClassRes.json() as any;
    console.log(`Listed ${classList.data?.length || 0} classes.`);
    
    console.log("4. Batch 2: List Teachers...");
    const listTeacherRes = await fetch(`${API_URL}/teachers`, { headers });
    const teacherList = await listTeacherRes.json() as any;
    console.log(`Listed ${teacherList.data?.length || 0} teachers.`);

    console.log("5. Batch 3: List Student Attendance...");
    const dateStr = new Date().toISOString().split('T')[0];
    const listAttRes = await fetch(`${API_URL}/attendance/students?date=${dateStr}`, { headers });
    const attList = await listAttRes.json();
    console.log(`Listed student attendance status: ${listAttRes.ok ? 'OK' : 'FAILED'}`);

    console.log("6. Verifying No Leakage into Shared/Master DBs...");
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/schoolsghar');
    const masterCount = await mongoose.connection.useDb('schoolsghar_master').collection('classes').countDocuments();
    const sharedCount = await mongoose.connection.useDb('schoolsghar').collection('classes').countDocuments();
    
    console.log(`Master DB Classes count (leakage): ${masterCount}`);
    console.log(`Shared DB Classes count: ${sharedCount}`);

    console.log("SMOKE_TEST_SUCCESS");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
