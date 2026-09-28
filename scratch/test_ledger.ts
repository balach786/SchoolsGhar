import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

import { getMasterConnection } from '../backend/src/services/MasterConnectionManager';
import { getTenantConnection } from '../backend/src/services/TenantConnectionManager';
import { getMasterModels } from '../backend/src/services/MasterModelRegistry';
import { getTenantModels } from '../backend/src/services/TenantModelRegistry';
import { recordPayment, buildLedger } from '../backend/src/services/finance.service';
import { executePaymentReversal } from '../backend/src/services/reversal.service';

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const masterDb = await getMasterConnection();
  const { Tenant } = getMasterModels(masterDb);
  const tenants = await Tenant.find().limit(2).lean();
  
  const tenant1 = tenants[0];
  const tenantDb1 = await getTenantConnection(tenant1.databaseName);
  const models1 = getTenantModels(tenantDb1);
  const user1 = { _id: new mongoose.Types.ObjectId(), tenantId: String(tenant1._id), role: 'admin' } as any;

  const student = await models1.Student.findOne().lean();
  
  // CASE A + B
  console.log('CASE A & B');
  const fee1 = await models1.StudentFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    sessionId: student.sessionId,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 100000,
    netPayable: 100000,
    remainingBalance: 100000,
    status: 'unpaid'
  });
  
  const { payment: p1 } = await recordPayment(user1, {
    studentId: String(student._id),
    studentFeeId: String(fee1._id),
    amount: 40000,
    paymentMethod: 'cash',
  }, tenant1._id, tenantDb1);
  
  let f = await models1.StudentFee.findById(fee1._id);
  if (f.remainingBalance !== 60000) throw new Error('CASE A failed');
  
  await recordPayment(user1, {
    studentId: String(student._id),
    studentFeeId: String(fee1._id),
    amount: 60000,
    paymentMethod: 'cash',
  }, tenant1._id, tenantDb1);
  
  f = await models1.StudentFee.findById(fee1._id);
  if (f.remainingBalance !== 0 || f.status !== 'paid') throw new Error('CASE B failed');

  // CASE C: Auto allocate
  console.log('CASE C');
  const fee2 = await models1.StudentFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    sessionId: student.sessionId,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 50000,
    netPayable: 50000,
    remainingBalance: 50000,
    status: 'unpaid'
  });
  const fee3 = await models1.StudentFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    sessionId: student.sessionId,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 100000,
    netPayable: 100000,
    remainingBalance: 100000,
    status: 'unpaid'
  });
  
  const { payment: pC, fees } = await recordPayment(user1, {
    studentId: String(student._id),
    amount: 90000,
    paymentMethod: 'cash'
  }, tenant1._id, tenantDb1);
  
  if (!pC.allocations || pC.allocations.length !== 2) throw new Error('CASE C allocations failed');
  if (pC.allocations[0].amountAllocated !== 50000) throw new Error('CASE C allocation 0 failed');
  if (pC.allocations[1].amountAllocated !== 40000) throw new Error('CASE C allocation 1 failed');
  
  // CASE D: Partial refund
  console.log('CASE D');
  const fee4 = await models1.StudentFee.create({
    tenantId: tenant1._id,
    studentId: student._id,
    sessionId: student.sessionId,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 100000,
    netPayable: 100000,
    remainingBalance: 100000,
    status: 'unpaid'
  });
  
  const { payment: p4 } = await recordPayment(user1, {
    studentId: String(student._id),
    studentFeeId: String(fee4._id),
    amount: 100000,
    paymentMethod: 'cash'
  }, tenant1._id, tenantDb1);
  
  await models1.PaymentReversal.create({
    tenantId: tenant1._id,
    sourceType: 'regular_fee',
    paymentId: p4._id,
    studentId: student._id,
    obligationId: fee4._id,
    originalReceiptNumber: p4.receiptNumber,
    reversalReceiptNumber: 'REV-1',
    amount: 40000,
    reversalType: 'partial_refund',
    reason: 'Test partial',
    initiatedBy: user1._id
  });
  
  const ledgerD = await buildLedger(String(student._id), {}, tenant1._id, tenantDb1);
  const revRow = ledgerD.find(r => r.kind === 'reversal' && r.receipt === 'REV-1');
  if (!revRow || revRow.charge !== 40000) throw new Error('CASE D partial refund ledger failed');
  
  console.log('ALL TESTS PASSED');
  process.exit(0);
}

runTests().catch(err => { console.error(err); process.exit(1); });
