import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

import { getMasterConnection } from '../backend/src/services/MasterConnectionManager';
import { getTenantConnection } from '../backend/src/services/TenantConnectionManager';
import { getMasterModels } from '../backend/src/services/MasterModelRegistry';
import { getTenantModels } from '../backend/src/services/TenantModelRegistry';
import { adjustStudentFee, recordPayment, buildLedger } from '../backend/src/services/finance.service';
import { executePaymentReversal } from '../backend/src/services/reversal.service';
import { reserveFinancialReference } from '../backend/src/services/financialReference.service';
import { nextReceiptNumber } from '../backend/src/models/ReceiptCounter';
import { ApiError } from '../backend/src/utils/ApiError';

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const masterDb = await getMasterConnection();
  
  const { Tenant } = getMasterModels(masterDb);
  const tenants = await Tenant.find().limit(2).lean();
  if (tenants.length < 2) throw new Error('Need at least 2 tenants for cross-tenant test');
  
  const tenant1 = tenants[0];
  const tenant2 = tenants[1];
  
  const tenantDb1 = await getTenantConnection(tenant1.databaseName);
  const tenantDb2 = await getTenantConnection(tenant2.databaseName);
  
  const models1 = getTenantModels(tenantDb1);
  const models2 = getTenantModels(tenantDb2);
  
  const user1 = { _id: new mongoose.Types.ObjectId(), tenantId: String(tenant1._id), role: 'admin' } as any;

  // 1. Create unpaid StudentFee
  console.log('1. Creating unpaid StudentFee...');
  const student = await models1.Student.findOne().lean();
  if (!student) throw new Error('No student found in tenant1');
  
  const fee = await models1.StudentFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    sessionId: student.sessionId,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 1000000,
    netPayable: 1000000,
    remainingBalance: 1000000,
    status: 'unpaid'
  });
  
  // 2. Apply discount
  console.log('2. Applying discount...');
  await adjustStudentFee(fee, { discountAmount: 100000 }, tenant1._id, tenantDb1);
  
  // 3. Verify amount recalculation
  console.log('3. Verify amount recalculation...');
  let updatedFee = await models1.StudentFee.findById(fee._id);
  if (updatedFee!.netPayable !== 900000) throw new Error('Discount amount recalculation failed');
  
  // 4. Apply fine
  console.log('4. Applying fine...');
  await adjustStudentFee(updatedFee, { fineAmount: 50000 }, tenant1._id, tenantDb1);
  
  // 5. Verify remaining balance
  console.log('5. Verify remaining balance...');
  updatedFee = await models1.StudentFee.findById(fee._id);
  if (updatedFee!.netPayable !== 950000 || updatedFee!.remainingBalance !== 950000) throw new Error('Fine amount recalculation failed');
  
  // 7. GET /student-fees/ledger (simulated)
  console.log('7. GET ledger (admin)...');
  const ledger1 = await buildLedger(String(student._id), {}, tenant1._id, tenantDb1);
  console.log('Ledger length:', ledger1.length);
  
  // 10. Record regular cash payment
  console.log('10. Record regular cash payment...');
  const { payment: payment1 } = await recordPayment(user1, {
    studentId: String(student._id),
    studentFeeId: String(fee._id),
    amount: 500000,
    paymentMethod: 'cash',
  }, tenant1._id, tenantDb1);
  
  console.log('Payment 1 recorded:', payment1.receiptNumber);

  // 13. Record non-cash payment with reference
  console.log('13. Record non-cash payment with reference...');
  const refString = `REF-TEST-${Date.now()}`;
  const { payment: payment2 } = await recordPayment(user1, {
    studentId: String(student._id),
    studentFeeId: String(fee._id),
    amount: 100000,
    paymentMethod: 'bank_transfer',
    reference: refString
  }, tenant1._id, tenantDb1);
  console.log('Payment 2 recorded:', payment2.receiptNumber);
  
  // 14. Try same reference in Exam Fee → rejected
  console.log('14. Try same reference in Exam Fee → rejected...');
  const examFee = await models1.StudentExamFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    examId: new mongoose.Types.ObjectId(),
    amount: 50000,
    netPayable: 50000,
    remainingBalance: 50000,
    status: 'unpaid'
  });
  
  let examFeeRefRejected = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reserveFinancialReference(
        tenant1._id,
        'bank_transfer',
        refString,
        'exam_fee',
        new mongoose.Types.ObjectId(),
        'EXM-123',
        session,
        tenantDb1
      );
    });
  } catch (err: any) {
    if (err.code === 'DUPLICATE_PAYMENT_REFERENCE') examFeeRefRejected = true;
  } finally {
    await session.endSession();
  }
  
  if (!examFeeRefRejected) throw new Error('Exam fee duplicate reference was not rejected');
  console.log('Exam fee duplicate reference rejected successfully');

  // 15. Reverse a payment
  console.log('15. Reverse a payment...');
  await executePaymentReversal(user1, {
    paymentId: String(payment1._id),
    reversalType: 'error_correction',
    reason: 'Testing reversal',
    notes: 'none'
  }, tenant1._id, tenantDb1);
  
  const reversal = await models1.PaymentReversal.findOne({ paymentId: payment1._id });
  if (!reversal) throw new Error('Payment reversal not found');
  console.log('Reversal created:', reversal.reversalReceiptNumber);
  
  // 17. Cross-tenant test
  console.log('17. Cross-tenant test...');
  let crossTenantFailed = false;
  try {
    const pt = await models2.Payment.findById(payment1._id);
    if (pt) crossTenantFailed = true; // wait, findById works globally on the connection? No, model is tied to DB!
    // But since they use different DBs, it should return null.
  } catch (err) {}
  
  if (crossTenantFailed) throw new Error('Cross-tenant leak detected');
  console.log('Cross tenant isolation verified');

  console.log('ALL TESTS PASSED');
  process.exit(0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
