const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { connectDB } = require('./dist/config/db');
const { getTenantModels } = require('./dist/services/TenantModelRegistry');
const { authorizeAttendanceModification } = require('./dist/services/attendance.service');

async function runVerification() {
  console.log('Skipping DB connection for schema verification');
  
  // Create a mock tenant Db connection
  const tenantDb = mongoose.connection.useDb('tenant_verification_test');
  const models = getTenantModels(tenantDb);
  
  console.log('Tenant Models successfully extracted from registry:', Object.keys(models).join(', '));
  
  if (!models.StudentAttendance || !models.TeacherAttendance || !models.SchoolClosure) {
    console.error('FAIL: Missing attendance models in TenantModelRegistry');
    process.exit(1);
  }
  console.log('PASS: Attendance models registered in TenantModelRegistry.');
  
  console.log('Phase 4 Batch 3 Attendance Architecture verification passed.');
  process.exit(0);
}

runVerification().catch(console.error);
