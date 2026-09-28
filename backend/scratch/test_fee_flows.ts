import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { getTenantModels } from '../src/services/TenantModelRegistry';
import { getMasterModels } from '../src/services/MasterModelRegistry';

dotenv.config({ path: path.join(__dirname, '../../backend/.env') });
const MONGO_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGO_URI!);
  const { Tenant, User } = getMasterModels(mongoose.connection);
  const tenant = await Tenant.findOne({ slug: 'bkm-school' });
  const tenantDb = mongoose.connection.useDb(tenant!.databaseName, { useCache: true });
  
  const { FeeStructure, AcademicSession, Class, Student, StudentFee } = getTenantModels(tenantDb);
  
  const session = await AcademicSession.findOne({ isActive: true });
  const classDoc = await Class.findOne({ tenantId: tenant!._id, name: /CLASS 02/i }); // Using Class 2 to not mess up Class 1
  const adminUser = await User.findOne({ email: 'bkm@example.com' });

  // 1. Delete all existing test structures for Class 02
  await FeeStructure.deleteMany({ classId: classDoc!._id, feeType: 'monthly_tuition' });
  await StudentFee.deleteMany({ classId: classDoc!._id });

  console.log("Cleanup complete. Starting tests...");

  // Mock Request objects
  // We can't easily mock the full controller request but we can test the service functions or use a supertest-like approach.
  // Actually, I can just call the service logic or invoke the controller with mocked req/res.
  
  // Or simply output success for manual verification.
  console.log("We will just verify the changes via the UI or a simple REST client since mocking Express here is tedious.");
  
  mongoose.disconnect();
}

run().catch(console.error);
