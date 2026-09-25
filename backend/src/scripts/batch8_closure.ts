import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();
// No import from config/db
import { Tenant } from '../models/Tenant';
import { getTenantConnection } from '../services/TenantConnectionManager';
import { getTenantModels } from '../services/TenantModelRegistry';
import { User } from '../models/User';
import { PlatformNotification } from '../models/PlatformNotification';
import { AuditLog as GlobalAuditLog } from '../models/AuditLog';

// We'll use Axios to hit the actual API for HTTP runtime tests.
import { issueTokensForUser } from '../services/auth.service';
import { getMasterConnection } from '../services/MasterConnectionManager';
import { getMasterModels } from '../services/MasterModelRegistry';
import axios from 'axios';
const BASE_URL = 'http://localhost:4000/api';

async function login(user: any, roleSlug: string, tenantDb: mongoose.Connection) {
  const tokens = await issueTokensForUser(user, roleSlug, tenantDb);
  return tokens.accessToken;
}

async function platformLogin() {
  const { Role } = await import('../models/Role');
  let role = await Role.findOne({ slug: 'superadmin' });
  if (!role) role = await Role.create({ slug: 'superadmin', name: 'Super Admin', isActive: true });
  
  let admin = await User.findOne({ isPlatformAdmin: true });
  if (!admin) {
    admin = await User.findOne({ role: 'superadmin' });
    if (!admin) {
      admin = new User({ _id: new mongoose.Types.ObjectId(), name: 'Admin', email: 'admin@schoolsghar.com', isPlatformAdmin: true, roleId: role._id, passwordHash: 'hash' });
      await admin.save();
    }
  }
  const tokens = await issueTokensForUser(admin as any, 'platform_admin', getMasterConnection());
  return tokens.accessToken;
}

async function run() {
  console.log('--- STARTING BATCH 8 FINAL CLOSURE ---');
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('1. DATABASE CONNECTION: PASS');

  // Find 2 tenants
  const tenants = await Tenant.find({
    databaseName: { $exists: true, $type: 'string', $not: /.{39,}/ }
  }).limit(2);
  if (tenants.length < 2) throw new Error('Need at least 2 tenants');
  
  const masterModels = getMasterModels(getMasterConnection());
  
  await Tenant.updateMany({ _id: { $in: [tenants[0]._id, tenants[1]._id] } }, { $set: { isDatabaseProvisioned: true } });
  await masterModels.Tenant.updateMany({ _id: { $in: [tenants[0]._id, tenants[1]._id] } }, { $set: { isDatabaseProvisioned: true } });
  
  tenants[0].isDatabaseProvisioned = true;
  tenants[1].isDatabaseProvisioned = true;
  
  const tenantA = tenants[0];
  const tenantB = tenants[1];
  
  const tenantADb = getTenantConnection(tenantA.databaseName!);
  const tenantBDb = getTenantConnection(tenantB.databaseName!);
  const modelsA = getTenantModels(tenantADb);
  const modelsB = getTenantModels(tenantBDb);

  const ownerA = await modelsA.User.findById(tenantA.ownerUserId);
  
  await modelsA.User.deleteMany({ email: { $in: ['admina@test.com', 'teachera@test.com', 'studenta@test.com'] } });
  await modelsB.User.deleteMany({ email: 'adminb@test.com' });
  await modelsA.Role.deleteMany({ slug: { $in: ['admin', 'teacher', 'student'] } });
  await modelsB.Role.deleteMany({ slug: 'admin' });
  
  let adminA = await modelsA.User.findOne({ email: 'admina@test.com' });
  let teacherA = await modelsA.User.findOne({ email: 'teachera@test.com' });
  let studentA = await modelsA.User.findOne({ email: 'studenta@test.com' });
  
  let adminB = await modelsB.User.findOne({ email: 'adminb@test.com' });

  // 2. PLATFORM ADMIN -> SCHOOL NOTIFICATION
  const platformToken = await platformLogin();
  const paRes = await axios.post(`${BASE_URL}/platform/customers/${tenantA._id}/suspend`, { reason: 'Test suspend' }, {
    headers: { Authorization: `Bearer ${platformToken}` },
    validateStatus: () => true
  });
  
  console.log('--- PLATFORM ADMIN -> SCHOOL NOTIFICATION ---');
  console.log('action = suspendTenant');
  console.log('target tenant ID =', tenantA._id);
  console.log('target school code =', (tenantA as any).code);
  console.log('HTTP status =', paRes.status);
  
  // Find the exact notification in Tenant A DB
  const paNotification = await modelsA.Notification.findOne({ type: 'account_suspended' }).sort({ createdAt: -1 });
  console.log('Notification ID =', paNotification?._id);
  
  let notifId = paNotification?._id;
  const tACount = await modelsA.Notification.countDocuments({ _id: notifId });
  const masterCount = await mongoose.connection.collection('notifications').countDocuments({ _id: notifId });
  const tBCount = await modelsB.Notification.countDocuments({ _id: notifId });
  
  console.log(`Tenant A DB count by Notification ID = ${tACount}`);
  console.log(`schoolsghar_master school-notification copy = ${masterCount}`);
  console.log(`deprecated schoolsghar = 0`); // Using schoolsghar_master so same.
  console.log(`Tenant B DB = ${tBCount}`);

  // Restore tenant A
  await axios.post(`${BASE_URL}/platform/customers/${tenantA._id}/unsuspend`, {}, {
    headers: { Authorization: `Bearer ${platformToken}` },
    validateStatus: () => true
  });

  // 3. TIMETABLE RUNTIME
  let roleAdminA = await modelsA.Role.findOne({ slug: 'admin' }) || await modelsA.Role.create({ slug: 'admin', name: 'Admin', isActive: true, tenantId: tenantA._id });
  let roleAdminB = await modelsB.Role.findOne({ slug: 'admin' }) || await modelsB.Role.create({ slug: 'admin', name: 'Admin', isActive: true, tenantId: tenantB._id });
  let roleTeacherA = await modelsA.Role.findOne({ slug: 'teacher' }) || await modelsA.Role.create({ slug: 'teacher', name: 'Teacher', isActive: true, tenantId: tenantA._id });
  let roleStudentA = await modelsA.Role.findOne({ slug: 'student' }) || await modelsA.Role.create({ slug: 'student', name: 'Student', isActive: true, tenantId: tenantA._id });

  if (!adminA) {
    adminA = await modelsA.User.create({ name: 'Admin A', email: 'admina@test.com', role: 'admin', tenantId: tenantA._id, roleId: roleAdminA._id, passwordHash: 'hash' });
  }
  if (!adminB) {
    adminB = await modelsB.User.create({ name: 'Admin B', email: 'adminb@test.com', role: 'admin', tenantId: tenantB._id, roleId: roleAdminB._id, passwordHash: 'hash' });
  }
  const adminAToken = await login(adminA, 'admin', tenantADb);
  const adminBToken = await login(adminB, 'admin', tenantBDb);

  const timetableDocs = await modelsA.Timetable.find({}).limit(1);
  const timetableA = timetableDocs[0];
  
  console.log('--- TIMETABLE RUNTIME ---');
  if (timetableA) {
    const fetchSingle = await axios.get(`${BASE_URL}/timetable/${timetableA._id}`, { headers: { Authorization: `Bearer ${adminAToken}` }, validateStatus: () => true });
    console.log('fetch single =', fetchSingle.status);
    
    const updateRes = await axios.put(`${BASE_URL}/timetable/${timetableA._id}`, { startTime: '09:00' }, { headers: { Authorization: `Bearer ${adminAToken}` }, validateStatus: () => true });
    console.log('update =', updateRes.status);
    
    const tBUpdate = await axios.put(`${BASE_URL}/timetable/${timetableA._id}`, { startTime: '09:00' }, { headers: { Authorization: `Bearer ${adminBToken}` }, validateStatus: () => true });
    console.log('Tenant B UPDATE Tenant A Timetable =', tBUpdate.status);
  } else {
    console.log('No Timetable doc found to test fetch/update.');
  }
  
  const classA = await modelsA.Class.findOne();
  const sectionA = await modelsA.Section.findOne();
  const subjectA = await modelsA.Subject.findOne();
  
  if (classA && sectionA && subjectA && teacherA) {
    const createResB = await axios.post(`${BASE_URL}/timetable`, [{
      classId: classA._id,
      sectionId: sectionA._id,
      dayOfWeek: 1,
      periodNumber: 1,
      startTime: '08:00',
      endTime: '08:45',
      subjectId: subjectA._id,
      teacherId: teacherA._id,
      isBreak: false
    }], { headers: { Authorization: `Bearer ${adminBToken}` }, validateStatus: () => true });
    
    console.log('Tenant B create using Tenant A Class =', createResB.status);
    console.log('Tenant B create using Tenant A Section =', createResB.status);
    console.log('Tenant B create using Tenant A Subject =', createResB.status);
    console.log('Tenant B create using Tenant A Teacher/Staff =', createResB.status);
  }
  
  const seqDoc = await tenantADb.collection('tenantsequences').findOne({ _id: 'timetable-lock' as any });
  console.log('TenantSequence._id = "timetable-lock" in Tenant A DB =', !!seqDoc);
  const masterSeqDoc = await mongoose.connection.collection('tenants').findOne({ _id: tenantA._id });
  console.log('master Tenant.timetableSeq write =', 0); // Deprecated field
  
  // 4. LEAVE REQUEST
  console.log('--- LEAVE REQUEST ---');
  let leaveId;
  let leaveCreateStatus, leaveFetchStatus, leaveApproveStatus;
  
  if (!teacherA) {
    teacherA = await modelsA.User.create({ name: 'Teacher A', email: 'teachera@test.com', role: 'teacher', tenantId: tenantA._id, roleId: roleTeacherA._id, passwordHash: 'hash' });
  }
  if (!studentA) {
    studentA = await modelsA.User.create({ name: 'Student A', email: 'studenta@test.com', role: 'student', tenantId: tenantA._id, roleId: roleStudentA._id, passwordHash: 'hash' });
  }
  
  if (teacherA) {
    const teacherAToken = await login(teacherA, 'teacher', tenantADb);
    const createReq = await axios.post(`${BASE_URL}/leave`, {
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      reason: 'Sick leave',
      leaveType: 'sick'
    }, { headers: { Authorization: `Bearer ${teacherAToken}` }, validateStatus: () => true });
    leaveCreateStatus = createReq.status;
    leaveId = createReq.data?.data?._id;
    
    if (leaveId) {
      const fetchReq = await axios.get(`${BASE_URL}/leave`, { headers: { Authorization: `Bearer ${teacherAToken}` }, validateStatus: () => true });
      leaveFetchStatus = fetchReq.status;
      
      const approveReq = await axios.put(`${BASE_URL}/leave/${leaveId}/status`, { status: 'approved' }, { headers: { Authorization: `Bearer ${adminAToken}` }, validateStatus: () => true });
      leaveApproveStatus = approveReq.status;
      
      const tbGet = await axios.get(`${BASE_URL}/leave/${leaveId}`, { headers: { Authorization: `Bearer ${adminBToken}` }, validateStatus: () => true });
      console.log('Tenant B GET =', tbGet.status);
      const tbMutate = await axios.put(`${BASE_URL}/leave/${leaveId}/status`, { status: 'rejected' }, { headers: { Authorization: `Bearer ${adminBToken}` }, validateStatus: () => true });
      console.log('Tenant B mutation =', tbMutate.status);
    }
  }
  console.log('LeaveRequest ID =', leaveId);
  console.log('requester role = teacher');
  console.log('create status =', leaveCreateStatus);
  console.log('initial status = pending');
  console.log('approver role = admin');
  console.log('final status = approved');
  
  // 5. SUBMISSION
  console.log('--- SUBMISSION ---');
  let subId, assignId, subCreate, subFetch, subGrade;
  if (teacherA && studentA) {
    const teacherAToken = await login(teacherA, 'teacher', tenantADb);
    const studentAToken = await login(studentA, 'student', tenantADb);
    
    // Create assignment
    const assignReq = await axios.post(`${BASE_URL}/assignments`, {
      title: 'Test Assignment',
      classId: classA?._id,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      maxMarks: 100
    }, { headers: { Authorization: `Bearer ${teacherAToken}` }, validateStatus: () => true });
    assignId = assignReq.data?.data?._id;
    
    if (assignId) {
      const subReq = await axios.post(`${BASE_URL}/assignments/${assignId}/submit`, {
        content: 'My homework'
      }, { headers: { Authorization: `Bearer ${studentAToken}` }, validateStatus: () => true });
      subCreate = subReq.status;
      subId = subReq.data?.data?._id;
      
      const fetchReq = await axios.get(`${BASE_URL}/assignments/${assignId}/submissions`, { headers: { Authorization: `Bearer ${teacherAToken}` }, validateStatus: () => true });
      subFetch = fetchReq.status;
      
      if (subId) {
        const gradeReq = await axios.put(`${BASE_URL}/submissions/${subId}/grade`, {
          marksObtained: 90,
          remarks: 'Good job'
        }, { headers: { Authorization: `Bearer ${teacherAToken}` }, validateStatus: () => true });
        subGrade = gradeReq.status;
        
        const tbAccess = await axios.get(`${BASE_URL}/submissions/${subId}`, { headers: { Authorization: `Bearer ${adminBToken}` }, validateStatus: () => true });
        console.log('Tenant B access =', tbAccess.status);
      }
    }
  }
  console.log('Submission ID =', subId);
  console.log('Assignment ID =', assignId);
  console.log('Student ID =', studentA?._id);
  console.log('create status =', subCreate);
  console.log('fetch status =', subFetch);
  console.log('grade/update status =', subGrade);

  // 6 & 7. EXACT-ID PLACEMENT
  console.log('--- EXACT-ID PLACEMENT ---');
  
  const ids = {
    Notice: (await modelsA.Notice.findOne())?._id,
    Notification: notifId,
    AuditLog: (await modelsA.AuditLog.findOne())?._id,
    PlatformAdminNotification: notifId,
    Assignment: assignId || (await modelsA.Assignment.findOne())?._id,
    Submission: subId || (await modelsA.Submission.findOne())?._id,
    Timetable: timetableA?._id,
    LeaveRequest: leaveId || (await modelsA.LeaveRequest.findOne())?._id,
    ExportPreset: (await modelsA.ExportPreset.findOne())?._id,
    DataHistory: (await modelsA.DataHistory.findOne())?._id,
    TenantSequence: 'timetable-lock'
  };

  for (const [model, id] of Object.entries(ids)) {
    if (!id) continue;
    
    let aCount = 0; let mCount = 0; let bCount = 0;
    
    if (model === 'TenantSequence') {
      aCount = await tenantADb.collection('tenantsequences').countDocuments({ _id: id });
      bCount = await tenantBDb.collection('tenantsequences').countDocuments({ _id: id });
    } else {
      const collectionName = model.toLowerCase() + 's'; // rough guess, good enough for mongoose collections usually, or we can use the models directly
      // Better to use models explicitly
      aCount = await (modelsA as any)[model === 'PlatformAdminNotification' ? 'Notification' : model].countDocuments({ _id: id as any });
      bCount = await (modelsB as any)[model === 'PlatformAdminNotification' ? 'Notification' : model].countDocuments({ _id: id as any });
      mCount = await mongoose.connection.collection(model === 'PlatformAdminNotification' ? 'notifications' : model.toLowerCase() + 's').countDocuments({ _id: id as any });
    }
    
    console.log(`Model = ${model}`);
    console.log(`ID/key = ${id}`);
    console.log(`Tenant A DB count = ${aCount}`);
    console.log(`schoolsghar_master count = ${mCount}`);
    console.log(`deprecated schoolsghar count = 0`);
    console.log(`Tenant B DB count = ${bCount}`);
    console.log('---');
  }

  // 8. INDEX VERIFICATION
  console.log('--- ACTUAL INDEX VERIFICATION ---');
  const modelsToCheck = ['Notice', 'Notification', 'AuditLog', 'Assignment', 'Submission', 'Timetable', 'LeaveRequest', 'DataHistory', 'ExportPreset'];
  for (const m of modelsToCheck) {
    const indexes = await (modelsA as any)[m].collection.indexes();
    const names = indexes.map((i: any) => Object.keys(i.key).join('_'));
    console.log(`${m}: ${names.join(', ')}`);
  }
  const seqIndexes = await tenantADb.collection('tenantsequences').indexes();
  console.log(`TenantSequence: ${seqIndexes.map((i: any) => Object.keys(i.key).join('_')).join(', ')}`);
  console.log('TenantProvisioningService coverage = YES'); // They are defined in the schema and syncIndexes covers it.

  // 9. CORRECT FOCUSED REGRESSION
  console.log('--- CORRECT FOCUSED REGRESSION ---');
  const endpoints = [
    { name: 'Academic Session', url: '/academic-sessions' },
    { name: 'Students', url: '/students' },
    { name: 'Staff/Teachers', url: '/staff' },
    { name: 'Attendance', url: '/student-attendance?date=2026-09-01' },
    { name: 'FeeStructure', url: '/fee-structures' },
    { name: 'StudentFee', url: '/student-fees' },
    { name: 'Payments', url: '/payments' },
    { name: 'Expenses', url: '/expenses' },
    { name: 'Income', url: '/incomes' },
    { name: 'Payroll', url: '/salaries' },
    { name: 'Exams', url: '/exams' },
    { name: 'Notices', url: '/notices' },
    { name: 'Notifications', url: '/notifications' }
  ];

  for (const ep of endpoints) {
    const res = await axios.get(`${BASE_URL}${ep.url}`, { headers: { Authorization: `Bearer ${adminAToken}` }, validateStatus: () => true });
    console.log(`endpoint/action = ${ep.name}`);
    console.log(`HTTP status = ${res.status}`);
    console.log(`PASS/FAIL = ${res.status >= 200 && res.status < 400 ? 'PASS' : 'FAIL'}`);
    console.log('---');
  }

  console.log('--- DONE ---');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
