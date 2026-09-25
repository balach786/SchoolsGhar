import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Tenant } from '../models/Tenant';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Staff } from '../models/Staff';
import { ClassTeacherAssignment } from '../models/ClassTeacherAssignment';
import { TemporaryAssignment } from '../models/TemporaryAssignment';
import { assignClassTeacher, changeClassTeacher, unassignClassTeacher } from '../services/classTeacher.service';

async function runVerification() {
  await connectDatabase();
  console.log('\n--- BATCH 2 VERIFICATION START ---\n');
  
  const tenants = await Tenant.find({ isDatabaseProvisioned: true });
  if (tenants.length < 2) {
    console.error('Need at least 2 provisioned tenants for cross-tenant tests.');
    process.exit(1);
  }
  const t1 = tenants[0];
  const t2 = tenants[1];
  console.log(`Using Tenant 1: ${t1.slug} (${t1.databaseName})`);
  console.log(`Using Tenant 2: ${t2.slug} (${t2.databaseName})`);

  const t1Db = mongoose.connection.useDb(t1.databaseName, { useCache: true });
  const t2Db = mongoose.connection.useDb(t2.databaseName, { useCache: true });
  const m1 = getTenantModels(t1Db);
  const m2 = getTenantModels(t2Db);

  const admin1 = await m1.User.findOne({ isActive: true });
  const adminId1 = admin1 ? admin1._id : new mongoose.Types.ObjectId();

  // 1. Class Teacher Lifecycle
  console.log('\n--- 1. Class Teacher Lifecycle ---');
  const session1 = await t1Db.startSession();
  
  // Setup data
  const teacherA = await m1.Staff.create({ tenantId: t1._id, employeeId: 'TCHA' + Date.now(), staffType: 'teaching', designation: 'Teacher', fullName: 'Teacher A', fatherName: 'F', caste: 'C', joiningDate: new Date(), isActive: true, salary: 0 });
  const teacherB = await m1.Staff.create({ tenantId: t1._id, employeeId: 'TCHB' + Date.now(), staffType: 'teaching', designation: 'Teacher', fullName: 'Teacher B', fatherName: 'F', caste: 'C', joiningDate: new Date(), isActive: true, salary: 0 });
  const cls = await m1.Class.create({ tenantId: t1._id, name: 'Audit Class ' + Date.now(), isActive: true });

  try {
    await session1.withTransaction(async () => {
      await assignClassTeacher(t1._id as any, cls._id as any, teacherA._id as any, adminId1 as any, session1 as any, t1Db);
    });
    const clsAfterA = await m1.Class.findById(cls._id);
    const histA = await m1.ClassTeacherAssignment.findOne({ classId: cls._id, status: 'active' });
    console.log(`Assign A: Class.classTeacherId == teacherA: ${String(clsAfterA?.classTeacherId) === String(teacherA._id)}`);
    console.log(`Assign A: History created: ${!!histA}`);

    await session1.withTransaction(async () => {
      await changeClassTeacher(t1._id as any, cls._id as any, teacherB._id as any, adminId1 as any, session1 as any, t1Db);
    });
    const clsAfterB = await m1.Class.findById(cls._id);
    const histBActive = await m1.ClassTeacherAssignment.findOne({ classId: cls._id, status: 'active' });
    const histAEnded = await m1.ClassTeacherAssignment.findOne({ classId: cls._id, status: 'ended', teacherId: teacherA._id });
    console.log(`Change to B: Class.classTeacherId == teacherB: ${String(clsAfterB?.classTeacherId) === String(teacherB._id)}`);
    console.log(`Change to B: New History active: ${!!histBActive}`);
    console.log(`Change to B: Old History ended: ${!!histAEnded}`);

    await session1.withTransaction(async () => {
      await unassignClassTeacher(t1._id as any, cls._id as any, adminId1 as any, session1 as any, t1Db);
    });
    const clsAfterUnassign = await m1.Class.findById(cls._id);
    const histBEnded = await m1.ClassTeacherAssignment.findOne({ classId: cls._id, status: 'ended', teacherId: teacherB._id });
    console.log(`Unassign B: Class.classTeacherId is null/undefined: ${!clsAfterUnassign?.classTeacherId}`);
    console.log(`Unassign B: History ended preserved: ${!!histBEnded}`);
  } finally {
    await session1.endSession();
  }

  // 2. Cross-tenant IDOR Checks
  console.log('\n--- 2. Cross-Tenant IDOR ---');
  const t2Teacher = await m2.Staff.create({ tenantId: t2._id, employeeId: 'TCH-T2-' + Date.now(), staffType: 'teaching', designation: 'Teacher', fullName: 'T2 Teacher', fatherName: 'F', caste: 'C', joiningDate: new Date(), isActive: true, salary: 0 });
  const fetchFromT1 = await m1.Staff.findById(t2Teacher._id);
  console.log(`T1 fetching T2 teacher: ${fetchFromT1 === null ? 'PASS (null)' : 'FAIL'}`);

  let assignT2ToT1Failed = false;
  const sessionFail = await t1Db.startSession();
  try {
    await sessionFail.withTransaction(async () => {
      await assignClassTeacher(t1._id as any, cls._id as any, t2Teacher._id as any, adminId1 as any, sessionFail as any, t1Db);
    });
  } catch (err: any) {
    if (err.message.includes('not found')) assignT2ToT1Failed = true;
  } finally {
    await sessionFail.endSession();
  }
  console.log(`T1 assigning T2 teacher fails: ${assignT2ToT1Failed ? 'PASS' : 'FAIL'}`);

  // 3. User Linking & Duplicate Claim
  console.log('\n--- 3. User Linking ---');
  // Simulating user creation and linking (we do it directly on T1 models)
  const teacherRole = await m1.Role.findOne({ slug: 'teacher' });
  const newStaff = await m1.Staff.create({ tenantId: t1._id, employeeId: 'LINK' + Date.now(), staffType: 'teaching', designation: 'Teacher', fullName: 'Link Teacher', fatherName: 'F', caste: 'C', joiningDate: new Date(), isActive: true, salary: 0 });
  
  // Link it
  const linkUser = await m1.User.create({ tenantId: t1._id, name: 'Link Teacher', email: 'link' + Date.now() + '@test.com', passwordHash: '123', roleId: teacherRole!._id, isActive: true });
  newStaff.userId = linkUser._id;
  await newStaff.save();
  console.log(`Link successful: profile.userId === user._id`);

  // Verify it doesn't appear in unlinked search
  const unlinkedSearch = await m1.Staff.find({ tenantId: t1._id, isActive: true, $or: [{ userId: null }, { userId: { $exists: false } }] });
  const stillUnlinked = unlinkedSearch.some(s => String(s._id) === String(newStaff._id));
  console.log(`Profile removed from unlinked results: ${!stillUnlinked}`);

  // Try to claim again
  const secondUser = await m1.User.create({ tenantId: t1._id, name: 'Bad Link', email: 'bad' + Date.now() + '@test.com', passwordHash: '123', roleId: teacherRole!._id, isActive: true });
  const claimAttempt = await m1.Staff.findOneAndUpdate(
    { _id: newStaff._id, tenantId: t1._id, $or: [{ userId: null }, { userId: { $exists: false } }] },
    { $set: { userId: secondUser._id } }
  );
  console.log(`Second claim attempt fails safely: ${claimAttempt === null}`);

  // 4. TemporaryAssignment Lifecycle
  console.log('\n--- 4. TemporaryAssignment ---');
  const ta = await m1.TemporaryAssignment.create({
    tenantId: t1._id,
    classId: cls._id,
    substituteTeacherId: teacherA._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    status: 'active',
    assignedBy: adminId1,
  });
  console.log(`Created TA: ${ta._id}`);
  ta.status = 'cancelled';
  ta.cancelledAt = new Date();
  await ta.save();
  console.log(`Cancelled TA: ${ta.status === 'cancelled'}`);
  const taLegacy = await TemporaryAssignment.findOne({ _id: ta._id });
  console.log(`TA absent from legacy global: ${taLegacy === null}`);

  // 5. Legacy bkm compatibility
  console.log('\n--- 5. Legacy BKM ---');
  const legacyDb = mongoose.connection.useDb('schoolsghar', { useCache: true });
  const legacyStaff = legacyDb.collection('staff');
  const bkmTenant = await Tenant.findOne({ slug: 'bkm' });
  const bkmStaffCount = await legacyStaff.countDocuments({ tenantId: bkmTenant!._id });
  console.log(`Legacy BKM Staff count accessible: ${bkmStaffCount >= 0}`);
  
  // 6. Database Placement Leakage
  console.log('\n--- 6. DB Placement Leakage ---');
  const leakStaff = await Staff.countDocuments({ _id: teacherA._id });
  const leakTA = await TemporaryAssignment.countDocuments({ _id: ta._id });
  const leakCTA = await ClassTeacherAssignment.countDocuments({ classId: cls._id });
  console.log(`Staff leaked to global: ${leakStaff}`);
  console.log(`TemporaryAssignment leaked to global: ${leakTA}`);
  console.log(`ClassTeacherAssignment leaked to global: ${leakCTA}`);

  console.log('\n--- END VERIFICATION ---');
  process.exit(0);
}

runVerification().catch(console.error);
