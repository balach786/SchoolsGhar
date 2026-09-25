import jwt from 'jsonwebtoken';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:4000/api/fee-structures';

async function testApi() {
  try {
    const payload = {
      sub: '6aa9b276cd9297d5a9957788',
      role: 'admin',
      roleId: '6aa9b1977b6ab34c1a6b8e37',
      tenantId: '6aa9b276cd9297d5a9957787',
      email: 'balach937@gmail.com',
      name: 'Muhammad Muzamil',
      type: 'access'
    };
    const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '1h' });

    const makeRequest = (method: string, path: string, body?: any) => {
      return new Promise((resolve, reject) => {
        const req = http.request(BASE_URL + path, {
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
        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      });
    };

    console.log('--- TEST START ---');
    // 1. Create a new fee structure
    const createRes: any = await makeRequest('POST', '', {
      sessionId: '6aa9b5b0b69635767ac0653c',
      classId: '6aa9b6f53b54fa90d2ec1ff0',
      feeType: 'other',
      title: 'Smoke Test ' + Date.now(),
      amount: 150000,
      description: 'Test API'
    });
    console.log('CREATE RESULT:', createRes.status);
    
    let createdId = '';
    try {
      createdId = JSON.parse(createRes.body).data._id;
    } catch(e) {}

    // 2. Edit an existing fee structure
    const editRes: any = await makeRequest('PATCH', `/${createdId}`, { title: 'Updated Title' });
    console.log('EDIT RESULT:', editRes.status);

    // 3. Archive a fee structure
    const archiveRes: any = await makeRequest('POST', `/${createdId}/archive`);
    console.log('ARCHIVE RESULT:', archiveRes.status);

    // 4. Restore the same structure
    const restoreRes: any = await makeRequest('POST', `/${createdId}/restore`);
    console.log('RESTORE RESULT:', restoreRes.status);
    console.log('--- TEST END ---');

  } catch (err) {
    console.error(err);
  }
}

testApi();
