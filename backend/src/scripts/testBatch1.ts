import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Tenant } from '../models/Tenant';
import { Student } from '../models/Student';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { AcademicSession } from '../models/AcademicSession';
import { StudentHistory } from '../models/StudentHistory';
import { User } from '../models/User';
import { Role } from '../models/Role';

async function run() {
  await connectDatabase();
  console.log('\n--- Phase 4 Batch 1 Isolation Test ---');

  // Find a provisioned tenant
  let tenant = await Tenant.findOne({ isDatabaseProvisioned: true });
  if (!tenant) {
    console.log('No provisioned tenant found. Creating a temporary one...');
    tenant = await Tenant.create({
      name: 'Batch 1 Test School',
      slug: 'batch1test',
      schoolCode: 'B1TEST',
      databaseName: 'school_batch1test',
      isDatabaseProvisioned: true,
      contactEmail: 'admin@b1test.com',
      ownerUserId: new mongoose.Types.ObjectId(),
      trialEndsAt: new Date()
    });
  }

  const tenantDbName = tenant.databaseName;
  console.log(`Testing with tenant: ${tenant.slug} (DB: ${tenantDbName})`);

  // Connect to tenant DB
  const tenantDb = mongoose.connection.useDb(tenantDbName, { useCache: true });
  const tenantModels = getTenantModels(tenantDb);

  console.log('\n1. Creating records in tenant DB...');
  const session = await tenantModels.AcademicSession.create({
    tenantId: tenant._id,
    name: 'Test Session ' + Date.now(),
    startDate: new Date(),
    endDate: new Date(Date.now() + 31536000000),
    status: 'active'
  });

  const newClass = await tenantModels.Class.create({
    tenantId: tenant._id,
    sessionId: session._id,
    name: 'Test Class',
    code: 'TC'
  });

  const student = await tenantModels.Student.create({
    tenantId: tenant._id,
    sessionId: session._id,
    classId: newClass._id,
    fullName: 'Isolation Test Student',
    admissionNumber: 'ADM-2026-9999',
    rollNumber: '99',
    dateOfBirth: new Date('2010-01-01'),
    admissionDate: new Date(),
    gender: 'male',
    status: 'active',
    guardianName: 'Test Guardian'
  });

  const history = await tenantModels.StudentHistory.create({
    tenantId: tenant._id,
    studentId: student._id,
    sessionId: session._id,
    classId: newClass._id,
    status: 'admitted',
    eventDate: new Date(),
    date: new Date()
  });

  console.log(`Created Session: ${session._id}`);
  console.log(`Created Class: ${newClass._id}`);
  console.log(`Created Student: ${student._id}`);
  console.log(`Created History: ${history._id}`);

  console.log('\n2. Verifying cross-tenant isolation (Checking legacy DB)...');
  const legacyStudent = await Student.findById(student._id);
  if (legacyStudent) {
    console.error('FAIL: Student leaked into legacy DB!');
    process.exit(1);
  } else {
    console.log('PASS: Student is isolated from legacy DB.');
  }

  const legacyClass = await Class.findById(newClass._id);
  if (legacyClass) {
    console.error('FAIL: Class leaked into legacy DB!');
    process.exit(1);
  } else {
    console.log('PASS: Class is isolated from legacy DB.');
  }

  console.log('\n3. Cleaning up tenant DB...');
  await tenantModels.StudentHistory.deleteOne({ _id: history._id });
  await tenantModels.Student.deleteOne({ _id: student._id });
  await tenantModels.Class.deleteOne({ _id: newClass._id });
  await tenantModels.AcademicSession.deleteOne({ _id: session._id });
  console.log('Cleanup complete.');

  console.log('\n--- Test Successful ---');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
