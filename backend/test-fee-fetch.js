const BASE_URL = 'http://localhost:4000/api';

async function testApi() {
  try {
    // Login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'balach937@gmail.com', password: 'Admin123!' })
    });
    const loginData = await loginRes.json();
    if (!loginData.data || !loginData.data.accessToken) {
      console.log('Login failed', loginData);
      return;
    }
    const token = loginData.data.accessToken;
    console.log('Login successful');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('--- TEST START ---');

    // 1. Create a new fee structure
    const createRes = await fetch(`${BASE_URL}/fee-structures`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: '6aa9b5b0b69635767ac0653c', // Using known session ID
        classId: '6aa9b6f53b54fa90d2ec1ff0', // Using known class ID
        feeType: 'other',
        title: 'Smoke Test Fee Structure ' + Date.now(),
        amount: 150000,
        description: 'Test API'
      })
    });
    const createData = await createRes.json();
    console.log('CREATE RESULT:', createRes.status);
    
    if (!createData.data || !createData.data._id) {
       console.log('Create failed data:', createData);
       return;
    }
    const createdId = createData.data._id;

    // 2. Edit an existing fee structure
    const editRes = await fetch(`${BASE_URL}/fee-structures/${createdId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'Smoke Test Fee Structure Edited' })
    });
    console.log('EDIT RESULT:', editRes.status);

    // 3. Archive a fee structure
    const archiveRes = await fetch(`${BASE_URL}/fee-structures/${createdId}/archive`, {
      method: 'POST',
      headers
    });
    console.log('ARCHIVE RESULT:', archiveRes.status);

    // 4. Restore the same structure
    const restoreRes = await fetch(`${BASE_URL}/fee-structures/${createdId}/restore`, {
      method: 'POST',
      headers
    });
    console.log('RESTORE RESULT:', restoreRes.status);

    // Also test PUT to show it fails (the original bug)
    const oldPutRes = await fetch(`${BASE_URL}/fee-structures/${createdId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ title: 'Smoke Test Fee Structure Edited Again' })
    });
    console.log('OLD FRONTEND BUG (PUT) RESULT:', oldPutRes.status);

    // Also test DELETE to show it fails (the original bug)
    const oldDeleteRes = await fetch(`${BASE_URL}/fee-structures/${createdId}`, {
      method: 'DELETE',
      headers
    });
    console.log('OLD FRONTEND BUG (DELETE) RESULT:', oldDeleteRes.status);

    console.log('--- TEST END ---');

  } catch (err) {
    console.error(err);
  }
}

testApi();
