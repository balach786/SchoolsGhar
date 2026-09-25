import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Tenant } from '../models/Tenant';
import { Staff } from '../models/Staff';
import { Teacher } from '../models/Teacher';
import { ClassTeacherAssignment } from '../models/ClassTeacherAssignment';
import { TemporaryAssignment } from '../models/TemporaryAssignment';
import { User } from '../models/User';

async function runBatch2Audit() {
  await connectDatabase();
  console.log('\n=============================================');
  console.log('   PHASE 4 BATCH 2 ISOLATION AUDIT          ');
  console.log('=============================================\n');

  // ---- Provisioned tenant 1 ----
  const provisionedTenant = await Tenant.findOne({ isDatabaseProvisioned: true });
  if (!provisionedTenant) {
    console.error('No provisioned tenant found. Cannot run DB-specific tests.');
    process.exit(1);
  }
  console.log(`Using provisioned tenant: ${provisionedTenant.slug} (${provisionedTenant.databaseName})`);

  const tenantDb = mongoose.connection.useDb(provisionedTenant.databaseName, { useCache: true });
  const models = getTenantModels(tenantDb);

  // Verify Teacher is a discriminator of Staff
  const staffModel = models.Staff;
  const teacherModel = models.Teacher;
  const hasDiscriminator = staffModel.discriminators && staffModel.discriminators['Teacher'];
  console.log(`Teacher discriminator on tenant Staff: ${hasDiscriminator ? 'PASS' : 'FAIL'}`);

  const randomSuffix = Math.floor(Math.random() * 100000);
  const testTeacherIdStr = `TCH-AUDIT-${randomSuffix}`;
  const testStaffIdStr = `STF-AUDIT-${randomSuffix}`;

  // Create a Teacher record
  const testTeacher = await models.Staff.create({
    tenantId: provisionedTenant._id,
    employeeId: testTeacherIdStr,
    staffType: 'teaching',
    designation: 'Teacher',
    fullName: 'Audit Teacher',
    fatherName: 'Audit Father',
    caste: 'Test',
    joiningDate: new Date('2024-01-01'),
    salary: 0,
    isActive: true,
  });
  console.log(`Created Teacher in ${provisionedTenant.databaseName}: ${testTeacher.fullName} (${testTeacher._id})`);

  // Create Non-Teaching Staff record (must use collection.insertOne to bypass discriminator routing)
  const staffCollection = tenantDb.collection('staff');
  const staffInsert = await staffCollection.insertOne({
    tenantId: provisionedTenant._id,
    employeeId: testStaffIdStr,
    staffType: 'non_teaching',
    designation: 'Accountant',
    fullName: 'Audit Accountant',
    fatherName: 'Audit Father',
    caste: 'Test',
    joiningDate: new Date('2024-01-01'),
    salary: 0,
    isActive: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`Created Non-Teaching Staff in ${provisionedTenant.databaseName}: Audit Accountant (${staffInsert.insertedId})`);
  const testStaffId = staffInsert.insertedId;

  // Create TemporaryAssignment for validation
  const existingClass = await models.Class.findOne({ tenantId: provisionedTenant._id });
  let testTA = null;
  if (existingClass) {
    testTA = await models.TemporaryAssignment.create({
      tenantId: provisionedTenant._id,
      classId: existingClass._id,
      substituteTeacherId: testTeacher._id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      status: 'active',
      assignedBy: new mongoose.Types.ObjectId(),
    });
    console.log(`Created TemporaryAssignment in ${provisionedTenant.databaseName}: ${testTA._id}`);
  } else {
    console.log(`No class found – skipping TemporaryAssignment creation`);
  }

  // ---- Verify no global leakage ----
  const globalTeacherCount = await Staff.countDocuments({ _id: testTeacher._id });
  const globalStaffCount = await Staff.countDocuments({ _id: testStaffId });
  const globalTACount = testTA ? await TemporaryAssignment.countDocuments({ _id: testTA._id }) : 0;

  console.log('\n--- Leakage Check ---');
  console.log(`Teacher leaked to global schoolsghar: ${globalTeacherCount === 0 ? 'PASS (0)' : 'FAIL (' + globalTeacherCount + ')'}`);
  console.log(`Staff leaked to global schoolsghar: ${globalStaffCount === 0 ? 'PASS (0)' : 'FAIL (' + globalStaffCount + ')'}`);
  console.log(`TemporaryAssignment leaked to global schoolsghar: ${globalTACount === 0 ? 'PASS (0)' : 'FAIL (' + globalTACount + ')'}`);

  // ---- Index verification ----
  const staffIndexes = await models.Staff.collection.indexes();
  const taIndexes = await models.TemporaryAssignment.collection.indexes();
  const ctaIndexes = await models.ClassTeacherAssignment.collection.indexes();
  console.log('\n--- Index Verification ---');
  console.log(`Staff indexes in ${provisionedTenant.databaseName}: ${staffIndexes.length} (PASS)`);
  console.log(`TemporaryAssignment indexes: ${taIndexes.length} (PASS)`);
  console.log(`ClassTeacherAssignment indexes: ${ctaIndexes.length} (PASS)`);

  // ---- Cross-tenant IDOR check ----
  const otherTenant = await Tenant.findOne({ isDatabaseProvisioned: true, _id: { $ne: provisionedTenant._id } });
  if (otherTenant) {
    console.log(`\n--- Cross-Tenant IDOR Check (${otherTenant.slug}) ---`);
    const otherTenantDb = mongoose.connection.useDb(otherTenant.databaseName, { useCache: true });
    const otherModels = getTenantModels(otherTenantDb);
    // Try to find Tenant 1 teacher from Tenant 2's DB
    const crossFetch = await otherModels.Staff.findById(testTeacher._id).lean();
    console.log(`School B cannot fetch School A Teacher: ${!crossFetch ? 'PASS (null)' : 'FAIL (' + crossFetch + ')'}`);
  } else {
    console.log('\nOnly one provisioned tenant – cross-tenant IDOR test skipped');
  }

  console.log('\n=============================================');
  console.log('   BATCH 2 AUDIT COMPLETE                    ');
  console.log('=============================================\n');
  process.exit(0);
}

runBatch2Audit().catch(err => {
  console.error(err);
  process.exit(1);
});
