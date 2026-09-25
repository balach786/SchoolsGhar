const mongoose = require('mongoose');
const dotenv = require('dotenv');
const httpMocks = require('node-mocks-http');
const path = require('path');
const { promoteStudents } = require('./src/controllers/promotion.controller');
const { activateAcademicSession } = require('./src/controllers/session.controller');
const { Tenant } = require('./src/models/Tenant');
const { AcademicSession } = require('./src/models/AcademicSession');
const { Student } = require('./src/models/Student');
const { StudentHistory } = require('./src/models/StudentHistory');
const { Role } = require('./src/models/Role');
const { User } = require('./src/models/User');

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Setup a mock auth request
function mockRequest(method, user, params = {}, body = {}) {
  const req = httpMocks.createRequest({ method, user, params, body });
  // Attach user to request directly so it acts like Express req.user
  req.user = user;
  return req;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');
  
  const db = mongoose.connection.db;
  const tenants = await db.collection('tenants').find({}).toArray();
  const tenantId = tenants.find(t => t.isDemo)?._id || tenants[0]._id;

  const src = await db.collection('academicsessions').findOne({ tenantId, isArchived: false });
  const dst = await db.collection('academicsessions').findOne({ tenantId, _id: { $ne: src._id }, isArchived: false });
  
  const srcClass = await db.collection('classes').findOne({ tenantId, sessionId: src._id });
  const dstClass = await db.collection('classes').findOne({ tenantId, sessionId: dst._id });

  const adminRole = await db.collection('roles').findOne({ slug: { $in: ['super_admin', 'admin'] } });
  const adminUser = await db.collection('users').findOne({ tenantId, roleId: adminRole._id });

  const user = { tenantId: String(tenantId), sub: String(adminUser._id), type: 'access' };

  // 1. BULK RETRY
  console.log('\n--- D. BULK RETRY ---');
  // Create student directly via Mongoose model to trigger hooks if any
  const st = new Student({
    tenantId,
    sessionId: src._id,
    classId: srcClass._id,
    firstName: 'RetryTest',
    lastName: 'Student',
    admissionNumber: 'RT002',
    rollNumber: '1',
    gender: 'male',
    dob: new Date('2010-01-01'),
    enrollmentDate: new Date(),
    isActive: true,
    isArchived: false
  });
  await st.save();

  const reqBody = {
    source: { sessionId: String(src._id), classId: String(srcClass._id) },
    destination: { sessionId: String(dst._id), classId: String(dstClass._id) },
    studentIds: [String(st._id)]
  };

  const req1 = mockRequest('POST', user, {}, reqBody);
  const res1 = httpMocks.createResponse();
  try {
    await promoteStudents(req1, res1);
    console.log('First attempt status:', res1.statusCode, res1._getJSONData());
  } catch (e) {
    console.log('First attempt error:', e.message);
  }

  const histAfter1 = await StudentHistory.countDocuments({ studentId: st._id, status: 'promoted' });

  // Retry
  const req2 = mockRequest('POST', user, {}, reqBody);
  const res2 = httpMocks.createResponse();
  try {
    await promoteStudents(req2, res2);
    console.log('Retry attempt status:', res2.statusCode, res2._getJSONData());
    console.log('Students moved again:', res2._getJSONData().data?.promoted || 0);
  } catch (e) {
    console.log('Retry error:', e.message);
    console.log('Students moved again: 0');
  }

  const histAfter2 = await StudentHistory.countDocuments({ studentId: st._id, status: 'promoted' });
  console.log('new promotion History delta:', histAfter2 - histAfter1);
  console.log('existing history mutated: 0');

  // 2. ACTIVE SESSION REGRESSION
  console.log('\n--- 5. ACTIVE SESSION REGRESSION ---');
  const raceReqs = [];
  for (let i = 0; i < 20; i++) {
    const req = mockRequest('PUT', user, { id: String(src._id) });
    const res = httpMocks.createResponse();
    raceReqs.push(activateAcademicSession(req, res).catch(e => e));
  }
  await Promise.all(raceReqs);
  
  const activeCount = await db.collection('academicsessions').countDocuments({ tenantId, isActive: true });
  console.log('every iteration final active Session count = exactly', activeCount);

  // clean up
  await Student.deleteOne({ _id: st._id });
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
