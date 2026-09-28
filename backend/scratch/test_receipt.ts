// @ts-nocheck
import mongoose from 'mongoose';
import { nextReceiptNumber } from '../src/models/ReceiptCounter';
import { getTenantModels } from '../src/services/TenantModelRegistry';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTests() {
  let masterDb;
  let tenantDb;
  
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
    masterDb = await mongoose.createConnection(mongoUri).asPromise();
    const TenantModel = masterDb.model('Tenant', new mongoose.Schema({ name: String, dbName: String }, { strict: false }));
    let tenant = await TenantModel.findOne({ dbName: 'tenant_test_1' });
    if (!tenant) {
      tenant = await TenantModel.create({ name: 'Test Tenant 1', dbName: 'tenant_test_1' });
    }
    const tenantId = String(tenant!._id);
    tenantDb = masterDb.useDb(tenant!.dbName, { useCache: true });
    
    const { Payment, PaymentReversal, ReceiptCounter } = getTenantModels(tenantDb);
    
    // Clear state
    await Payment.deleteMany({ tenantId });
    await PaymentReversal.deleteMany({ tenantId });
    await ReceiptCounter.deleteMany({});
    
    console.log('--- TEST CASE A: Existing RCPT-2026-000001 -> new payment -> unique next receipt ---');
    
    // Manually create an existing payment to simulate legacy imported data
    await Payment.create({
      tenantId,
      studentId: new mongoose.Types.ObjectId(),
      sessionId: new mongoose.Types.ObjectId(),
      amount: 5000,
      refundableAmount: 5000,
      paymentMethod: 'cash',
      paymentDate: new Date('2026-01-01T10:00:00Z'),
      receiptNumber: 'RCPT-2026-000001',
      status: 'active',
      collectedBy: new mongoose.Types.ObjectId()
    });
    
    const nextRcpt1 = await nextReceiptNumber(new Date('2026-01-02T10:00:00Z'), 'RCPT', tenantId, undefined, tenantDb);
    console.log('Generated receipt (expected RCPT-2026-000002):', nextRcpt1);
    
    if (nextRcpt1 !== 'RCPT-2026-000002') throw new Error('Test A Failed');
    
    // Save it
    await Payment.create({
      tenantId,
      studentId: new mongoose.Types.ObjectId(),
      sessionId: new mongoose.Types.ObjectId(),
      amount: 5000,
      refundableAmount: 5000,
      paymentMethod: 'cash',
      paymentDate: new Date('2026-01-02T10:00:00Z'),
      receiptNumber: nextRcpt1,
      status: 'active',
      collectedBy: new mongoose.Types.ObjectId()
    });
    
    console.log('--- TEST CASE B: Concurrent Payments ---');
    const p1 = nextReceiptNumber(new Date('2026-01-03T10:00:00Z'), 'RCPT', tenantId, undefined, tenantDb);
    const p2 = nextReceiptNumber(new Date('2026-01-03T10:00:00Z'), 'RCPT', tenantId, undefined, tenantDb);
    const [c1, c2] = await Promise.all([p1, p2]);
    console.log('Concurrent 1:', c1);
    console.log('Concurrent 2:', c2);
    if (c1 === c2) throw new Error('Test B Failed (Not Unique)');
    
    console.log('--- TEST CASE C: Same tenant correct sequence ---');
    const p3 = await nextReceiptNumber(new Date('2026-01-04T10:00:00Z'), 'RCPT', tenantId, undefined, tenantDb);
    console.log('Sequence next:', p3);
    
    console.log('--- TEST CASE D: Different tenants -> tenant isolation ---');
    let tenant2 = await TenantModel.findOne({ dbName: 'tenant_test_2' });
    if (!tenant2) tenant2 = await TenantModel.create({ name: 'Test 2', dbName: 'tenant_test_2' });
    const tenantId2 = String(tenant2._id);
    const tenantDb2 = masterDb.useDb(tenant2.dbName, { useCache: true });
    await getTenantModels(tenantDb2).ReceiptCounter.deleteMany({});
    
    const t2Rcpt1 = await nextReceiptNumber(new Date('2026-01-01T10:00:00Z'), 'RCPT', tenantId2!, undefined, tenantDb2);
    console.log('Tenant 2 first receipt:', t2Rcpt1);
    if (t2Rcpt1 !== 'RCPT-2026-000001') throw new Error('Test D Failed');
    
    console.log('--- TEST CASE H: Year rollover ---');
    const rollRcpt = await nextReceiptNumber(new Date('2027-01-01T10:00:00Z'), 'RCPT', tenantId, undefined, tenantDb);
    console.log('Year 2027 receipt:', rollRcpt);
    if (rollRcpt !== 'RCPT-2027-000001') throw new Error('Test H Failed');
    
    console.log('\\nALL TESTS PASSED SUCCESSFULLY');
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
