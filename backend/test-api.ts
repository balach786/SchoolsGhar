import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const URL = 'http://localhost:4000/api/fee-structures/6aa9b9653b54fa90d2ec2486';

async function testApi() {
  try {
    // Generate an admin token for the tenant
    const payload = {
      _id: '6aa9b276cd9297d5a9957788', // createdBy from earlier db check
      role: 'admin',
      tenantId: '6aa9b276cd9297d5a9957787',
      email: 'admin@school.com',
      sessionId: '6aa9b5b0b69635767ac0653c',
    };
    const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '1h' });

    const makeRequest = (method: string) => {
      return new Promise((resolve, reject) => {
        const req = http.request(URL, {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        if (method !== 'GET' && method !== 'DELETE') {
          req.write(JSON.stringify({ title: 'Class 02 Edit' }));
        }
        req.end();
      });
    };

    console.log('Testing GET request...');
    const getRes: any = await makeRequest('GET');
    console.log(`GET returned status: ${getRes.status}`);

    console.log('\nTesting PUT request (the old frontend bug)...');
    const putRes: any = await makeRequest('PUT');
    console.log(`PUT returned status: ${putRes.status}`);

    console.log('\nTesting PATCH request (the fix)...');
    const patchRes: any = await makeRequest('PATCH');
    console.log(`PATCH returned status: ${patchRes.status}`);

  } catch (err) {
    console.error(err);
  }
}

testApi();
