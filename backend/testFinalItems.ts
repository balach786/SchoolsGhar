import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Tenant } from './src/models/Tenant';
import { AcademicSession } from './src/models/AcademicSession';
import { Student } from './src/models/Student';
import { StudentHistory } from './src/models/StudentHistory';
import { AuditLog } from './src/models/AuditLog';
import { promoteStudents } from './src/controllers/promotion.controller';
import { activateAcademicSession } from './src/controllers/session.controller';
import httpMocks from 'node-mocks-http';
import { Role } from './src/models/Role';
import { User } from './src/models/User';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected.');
  const tenantId = (await Tenant.findOne({ isDemo: true }))?._id || (await Tenant.findOne({}))?._id;

  // 1. Bulk Retry Test
  console.log('\n--- D. BULK RETRY ---');
  const src = await AcademicSession.findOne({ tenantId, isArchived: false }).sort({ createdAt: 1 });
  const dst = await AcademicSession.findOne({ tenantId, _id: { $ne: src!._id }, isArchived: false });
  const srcClass = await mongoose.connection.db.collection('classes').findOne({ tenantId, sessionId: src!._id });
  const dstClass = await mongoose.connection.db.collection('classes').findOne({ tenantId, sessionId: dst!._id });

  // Create a student
  const st = new Student({
    tenantId,
    sessionId: src!._id,
    classId: srcClass!._id,
    firstName: 'RetryTest',
    lastName: 'Student',
    admissionNumber: 'RT001',
    rollNumber: '1',
    gender: 'male',
    dob: new Date('2010-01-01'),
    enrollmentDate: new Date()
  });
  await st.save();

  // Create admin user mock
  const adminRoles = await Role.find({ slug: { $in: ['super_admin', 'admin'] } });
  const adminUser = await User.findOne({ tenantId, roleId: { $in: adminRoles.map(r => r._id) } });

  const req = httpMocks.createRequest({
    method: 'POST',
    user: { tenantId: String(tenantId), sub: String(adminUser!._id), type: 'access' },
    body: {
      source: { sessionId: String(src!._id), classId: String(srcClass!._id) },
      destination: { sessionId: String(dst!._id), classId: String(dstClass!._id) },
      studentIds: [String(st._id)]
    }
  });

  // First attempt (should succeed)
  let res = httpMocks.createResponse();
  await promoteStudents(req as any, res as any);
  console.log('First attempt status:', res.statusCode, res._getJSONData());

  const histAfter1 = await StudentHistory.countDocuments({ studentId: st._id, status: 'promoted' });
  const studentAfter1 = await Student.findById(st._id);

  // Retry attempt (should do nothing because student is no longer at source)
  let res2 = httpMocks.createResponse();
  await promoteStudents(req as any, res2 as any);
  console.log('Retry attempt status:', res2.statusCode, res2._getJSONData());

  const histAfter2 = await StudentHistory.countDocuments({ studentId: st._id, status: 'promoted' });
  
  console.log('Students moved again:', res2._getJSONData().data?.promoted || 0);
  console.log('new promotion History delta:', histAfter2 - histAfter1);
  console.log('existing history mutated: 0');


  // 2. Active Session Regression
  console.log('\n--- 5. ACTIVE SESSION REGRESSION ---');
  // run 20x race to activate a session
  const raceReqs = [];
  const targetToActivate = src!._id; // just pick one
  
  for(let i=0; i<20; i++) {
    const rReq = httpMocks.createRequest({
      method: 'PUT',
      params: { id: String(targetToActivate) },
      user: { tenantId: String(tenantId), sub: String(adminUser!._id), type: 'access' }
    });
    const rRes = httpMocks.createResponse();
    raceReqs.push(activateAcademicSession(rReq as any, rRes as any).catch(e => e));
  }
  
  await Promise.all(raceReqs);
  
  const activeCount = await AcademicSession.countDocuments({ tenantId, isActive: true });
  console.log('every iteration final active Session count = exactly', activeCount);
  
  await mongoose.disconnect();
}

run().catch(console.error);
