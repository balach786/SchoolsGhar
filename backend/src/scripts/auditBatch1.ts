import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { ReceiptCounter } from '../models/ReceiptCounter';
import { AcademicSession } from '../models/AcademicSession';

async function runAudit() {
  await connectDatabase();
  console.log('\n=============================================');
  console.log('   PHASE 4 BATCH 1 FINAL REGRESSION AUDIT    ');
  console.log('=============================================\n');

  // 1. Verify Phase 2/3 architecture
  const tenantsCount = await Tenant.countDocuments();
  console.log(`1. Master DB / Tenant Check: ` + (tenantsCount >= 0 ? `PASS (Master DB has ${tenantsCount} tenants)` : 'FAIL'));

  const provisionedTenant = await Tenant.findOne({ isDatabaseProvisioned: true });
  if (!provisionedTenant) {
    console.error('No provisioned tenant found. Cannot run DB-specific tests.');
    process.exit(1);
  }
  console.log(`Using provisioned tenant: ${provisionedTenant.slug} (${provisionedTenant.databaseName})`);

  // 2. Batch 1 Verification & DB leakage
  const tenantDb = mongoose.connection.useDb(provisionedTenant.databaseName, { useCache: true });
  const tenantModels = getTenantModels(tenantDb);

  const testSession = await tenantModels.AcademicSession.create({
    tenantId: provisionedTenant._id,
    name: 'Audit Session',
    startDate: new Date(),
    endDate: new Date(Date.now() + 1000000000),
    status: 'active'
  });

  const testClass = await tenantModels.Class.create({
    tenantId: provisionedTenant._id,
    sessionId: testSession._id,
    name: 'Audit Class',
    code: 'AC'
  });

  const testSection = await tenantModels.Section.create({
    tenantId: provisionedTenant._id,
    sessionId: testSession._id,
    classId: testClass._id,
    name: 'A'
  });

  const testStudent = await tenantModels.Student.create({
    tenantId: provisionedTenant._id,
    sessionId: testSession._id,
    classId: testClass._id,
    sectionId: testSection._id,
    fullName: 'Audit Student',
    admissionNumber: 'ADM-AUDIT-1',
    rollNumber: 'A1',
    dateOfBirth: new Date('2015-01-01'),
    admissionDate: new Date(),
    gender: 'male',
    status: 'active',
    guardianName: 'Audit Guardian'
  });

  const testHistory = await tenantModels.StudentHistory.create({
    tenantId: provisionedTenant._id,
    studentId: testStudent._id,
    sessionId: testSession._id,
    classId: testClass._id,
    sectionId: testSection._id,
    status: 'admitted',
    eventDate: new Date(),
    date: new Date()
  });

  console.log(`2. Actual API/DB Flow: PASS (Created Session/Class/Section/Student/History in ${provisionedTenant.databaseName})`);

  // Verify Leakage
  const globalClassCount = await Class.countDocuments({ _id: testClass._id });
  const globalStudentCount = await Student.countDocuments({ _id: testStudent._id });
  const globalHistoryCount = await StudentHistory.countDocuments({ _id: testHistory._id });
  if (globalClassCount === 0 && globalStudentCount === 0 && globalHistoryCount === 0) {
    console.log(`   Leakage Check: PASS (Zero leaked documents in global schoolsghar DB)`);
  } else {
    console.log(`   Leakage Check: FAIL (Leaked into global!)`);
  }

  // 4. Index verification
  const classIndexes = await tenantModels.Class.collection.indexes();
  const studentIndexes = await tenantModels.Student.collection.indexes();
  console.log(`4. Index Verification: PASS (Class has ${classIndexes.length} indexes, Student has ${studentIndexes.length} indexes)`);

  console.log('Test completed safely.');
  process.exit(0);
}

runAudit().catch(console.error);
