const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
      schoolCode: 'BKM',
      email: 'balach937@gmail.com',
      password: 'GenZomate@123'
    });
    const token = loginRes.data.data.accessToken;
    console.log("Login success.");
    
    const sessionRes = await axios.get('http://localhost:4000/api/school-sessions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const sessionId = sessionRes.data.data[0]._id;
    
    const classRes = await axios.get('http://localhost:4000/api/classes', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const classId = classRes.data.data[0]._id;
    
    const postRes = await axios.post('http://localhost:4000/api/fee-structures', {
      sessionId,
      classId,
      feeType: 'monthly_tuition',
      title: 'Test Fee',
      amount: 150000,
      effectiveFromMonth: 1,
      effectiveFromYear: 2026
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('POST Status:', postRes.status);
    
    const feeId = postRes.data.data._id;
    const patchRes = await axios.patch(`http://localhost:4000/api/fee-structures/${feeId}`, {
      effectiveFromMonth: 2,
      effectiveFromYear: 2026
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('PATCH Status:', patchRes.status);
    
  } catch (e) {
    console.error('Error:', e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
  }
}

test();
