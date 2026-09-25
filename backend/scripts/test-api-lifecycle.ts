import request from 'supertest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import app from '../src/app';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('Connected to DB');

  const tenantId = '6aa9b276cd9297d5a9957787'; // Known tenant from previous query
  const token = jwt.sign(
    { userId: '000000000000000000000000', tenantId, role: 'admin' }, 
    process.env.JWT_ACCESS_SECRET || ''
  );

  const payload = {
    phone: '03001234567',
    website: 'https://example.com'
  };

  console.log('Sending PATCH request with payload:', payload);

  const res = await request(app)
    .patch('/api/school-settings')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  console.log('PATCH response status:', res.status);
  console.log('PATCH response body:', JSON.stringify(res.body, null, 2));

  const getRes = await request(app)
    .get('/api/school-settings')
    .set('Authorization', `Bearer ${token}`);

  console.log('GET response status:', getRes.status);
  console.log('GET response body:', JSON.stringify(getRes.body, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
