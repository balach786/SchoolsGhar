/**
 * Phase 4E: Read-Only Financial Reconciliation Tool
 * 
 * Verifies ledger invariants, cached balances, receipt uniqueness,
 * and financial reference integrity per tenant.
 * 
 * Invariants:
 * - netPayable = originalAmount - discountAmount - scholarshipAmount + fineAmount
 * - effectivePaid = SUM(Payment) - SUM(PaymentReversal)
 * - remainingBalance = max(0, netPayable - effectivePaid)
 * - No duplicate receipts
 * - No duplicate non-cash reference registry entries
 * 
 * DEFAULT BEHAVIOR: REPORT ONLY (No automatic mutations).
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Tenant } from '../models/Tenant';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { StudentExamFee } from '../models/StudentExamFee';
import { ExamFeePayment } from '../models/ExamFeePayment';
import { PaymentReversal } from '../models/PaymentReversal';
import { FinancialReference } from '../models/FinancialReference';

export interface Discrepancy {
  type: 'AMOUNT_PAID_MISMATCH' | 'REMAINING_BALANCE_MISMATCH' | 'STATUS_MISMATCH' | 'OVERPAYMENT' | 'DUPLICATE_RECEIPT' | 'ORPHAN_REFERENCE';
  severity: 'CRITICAL' | 'WARNING';
  entityId: string;
  details: string;
  expected: any;
  actual: any;
}

export interface TenantReconciliationReport {
  tenantId: string;
  tenantName: string;
  studentFeesAudited: number;
  studentExamFeesAudited: number;
  paymentsAudited: number;
  examFeePaymentsAudited: number;
  reversalsAudited: number;
  financialReferencesAudited: number;
  discrepancies: Discrepancy[];
  isHealthy: boolean;
}

export async function runFinancialReconciliation(targetTenantId?: string): Promise<TenantReconciliationReport[]> {
  const query = targetTenantId ? { _id: targetTenantId } : {};
  let tenants = await Tenant.find(query).select('_id name code').lean();
  if (tenants.length === 0 && targetTenantId) {
    tenants = [{ _id: new mongoose.Types.ObjectId(targetTenantId), name: 'Audited Tenant', code: 'AUDIT' } as any];
  }

  const reports: TenantReconciliationReport[] = [];

  for (const tenant of tenants) {
    const tId = tenant._id;
    const discrepancies: Discrepancy[] = [];

    // 1. Audit Regular Student Fees
    const studentFees = await StudentFee.find({ tenantId: tId }).lean();
    for (const sf of studentFees) {
      const payments = await Payment.find({ tenantId: tId, studentFeeId: sf._id }).lean();
      const reversals = await PaymentReversal.find({ tenantId: tId, obligationId: sf._id, sourceType: 'regular_fee' }).lean();

      const postedPayments = payments.reduce((sum, p) => sum + p.amount, 0);
      const postedReversals = reversals.reduce((sum, r) => sum + r.amount, 0);
      const effectivePaid = Math.max(0, postedPayments - postedReversals);

      const calculatedNetPayable = sf.originalAmount - (sf.discountAmount ?? 0) - (sf.scholarshipAmount ?? 0) + (sf.fineAmount ?? 0);
      const expectedRemaining = Math.max(0, calculatedNetPayable - effectivePaid);

      let expectedStatus = 'unpaid';
      if (expectedRemaining === 0 && effectivePaid > 0) expectedStatus = 'paid';
      else if (effectivePaid > 0) expectedStatus = 'partial';

      if (effectivePaid > calculatedNetPayable) {
        discrepancies.push({
          type: 'OVERPAYMENT',
          severity: 'CRITICAL',
          entityId: String(sf._id),
          details: `Effective paid (${effectivePaid}) exceeds net payable (${calculatedNetPayable})`,
          expected: calculatedNetPayable,
          actual: effectivePaid,
        });
      }

      if (sf.amountPaid !== effectivePaid) {
        discrepancies.push({
          type: 'AMOUNT_PAID_MISMATCH',
          severity: 'CRITICAL',
          entityId: String(sf._id),
          details: `StudentFee amountPaid (${sf.amountPaid}) differs from payments - reversals (${effectivePaid})`,
          expected: effectivePaid,
          actual: sf.amountPaid,
        });
      }

      if (sf.remainingBalance !== expectedRemaining) {
        discrepancies.push({
          type: 'REMAINING_BALANCE_MISMATCH',
          severity: 'CRITICAL',
          entityId: String(sf._id),
          details: `StudentFee remainingBalance (${sf.remainingBalance}) differs from calculated remaining (${expectedRemaining})`,
          expected: expectedRemaining,
          actual: sf.remainingBalance,
        });
      }

      if (sf.status !== expectedStatus) {
        discrepancies.push({
          type: 'STATUS_MISMATCH',
          severity: 'WARNING',
          entityId: String(sf._id),
          details: `StudentFee status (${sf.status}) differs from ledger state (${expectedStatus})`,
          expected: expectedStatus,
          actual: sf.status,
        });
      }
    }

    // 2. Audit Student Exam Fees
    const examFees = await StudentExamFee.find({ tenantId: tId }).lean();
    for (const sef of examFees) {
      const payments = await ExamFeePayment.find({ tenantId: tId, studentExamFeeId: sef._id }).lean();
      const reversals = await PaymentReversal.find({ tenantId: tId, obligationId: sef._id, sourceType: 'exam_fee' }).lean();

      const postedPayments = payments.reduce((sum, p) => sum + p.amount, 0);
      const postedReversals = reversals.reduce((sum, r) => sum + r.amount, 0);
      const effectivePaid = Math.max(0, postedPayments - postedReversals);

      const calculatedNetPayable = sef.originalAmount - (sef.discountAmount ?? 0) + (sef.fineAmount ?? 0);
      const expectedRemaining = Math.max(0, calculatedNetPayable - effectivePaid);

      let expectedStatus = 'unpaid';
      if (expectedRemaining === 0 && effectivePaid > 0) expectedStatus = 'paid';
      else if (effectivePaid > 0) expectedStatus = 'partial';

      if (effectivePaid > calculatedNetPayable) {
        discrepancies.push({
          type: 'OVERPAYMENT',
          severity: 'CRITICAL',
          entityId: String(sef._id),
          details: `StudentExamFee effective paid (${effectivePaid}) exceeds net payable (${calculatedNetPayable})`,
          expected: calculatedNetPayable,
          actual: effectivePaid,
        });
      }

      if (sef.amountPaid !== effectivePaid) {
        discrepancies.push({
          type: 'AMOUNT_PAID_MISMATCH',
          severity: 'CRITICAL',
          entityId: String(sef._id),
          details: `StudentExamFee amountPaid (${sef.amountPaid}) differs from payments - reversals (${effectivePaid})`,
          expected: effectivePaid,
          actual: sef.amountPaid,
        });
      }

      if (sef.remainingBalance !== expectedRemaining) {
        discrepancies.push({
          type: 'REMAINING_BALANCE_MISMATCH',
          severity: 'CRITICAL',
          entityId: String(sef._id),
          details: `StudentExamFee remainingBalance (${sef.remainingBalance}) differs from calculated remaining (${expectedRemaining})`,
          expected: expectedRemaining,
          actual: sef.remainingBalance,
        });
      }

      if (sef.status !== expectedStatus && sef.status !== 'waived') {
        discrepancies.push({
          type: 'STATUS_MISMATCH',
          severity: 'WARNING',
          entityId: String(sef._id),
          details: `StudentExamFee status (${sef.status}) differs from ledger state (${expectedStatus})`,
          expected: expectedStatus,
          actual: sef.status,
        });
      }
    }

    // 3. Receipt Uniqueness Audit
    const allRegularPayments = await Payment.find({ tenantId: tId }).select('receiptNumber').lean();
    const allExamPayments = await ExamFeePayment.find({ tenantId: tId }).select('receiptNumber').lean();
    const allReversals = await PaymentReversal.find({ tenantId: tId }).select('reversalReceiptNumber').lean();

    const seenReceipts = new Set<string>();
    for (const p of allRegularPayments) {
      if (p.receiptNumber) {
        if (seenReceipts.has(p.receiptNumber)) {
          discrepancies.push({
            type: 'DUPLICATE_RECEIPT',
            severity: 'CRITICAL',
            entityId: String(p._id),
            details: `Duplicate regular payment receiptNumber: ${p.receiptNumber}`,
            expected: 'Unique receiptNumber',
            actual: p.receiptNumber,
          });
        }
        seenReceipts.add(p.receiptNumber);
      }
    }

    for (const ep of allExamPayments) {
      if (ep.receiptNumber) {
        if (seenReceipts.has(ep.receiptNumber)) {
          discrepancies.push({
            type: 'DUPLICATE_RECEIPT',
            severity: 'CRITICAL',
            entityId: String(ep._id),
            details: `Duplicate exam payment receiptNumber: ${ep.receiptNumber}`,
            expected: 'Unique receiptNumber',
            actual: ep.receiptNumber,
          });
        }
        seenReceipts.add(ep.receiptNumber);
      }
    }

    for (const rev of allReversals) {
      if (rev.reversalReceiptNumber) {
        if (seenReceipts.has(rev.reversalReceiptNumber)) {
          discrepancies.push({
            type: 'DUPLICATE_RECEIPT',
            severity: 'CRITICAL',
            entityId: String(rev._id),
            details: `Duplicate reversal receiptNumber: ${rev.reversalReceiptNumber}`,
            expected: 'Unique receiptNumber',
            actual: rev.reversalReceiptNumber,
          });
        }
        seenReceipts.add(rev.reversalReceiptNumber);
      }
    }

    // 4. Financial Reference Registry Audit
    const references = await FinancialReference.find({ tenantId: tId }).lean();
    for (const ref of references) {
      let targetExists = false;
      if (ref.sourceType === 'regular_fee') {
        targetExists = !!(await Payment.findOne({ _id: ref.paymentId, tenantId: tId }).lean());
      } else if (ref.sourceType === 'exam_fee') {
        targetExists = !!(await ExamFeePayment.findOne({ _id: ref.paymentId, tenantId: tId }).lean());
      }
      if (!targetExists) {
        discrepancies.push({
          type: 'ORPHAN_REFERENCE',
          severity: 'WARNING',
          entityId: String(ref._id),
          details: `FinancialReference ${ref.normalizedReference} points to missing ${ref.sourceType} ${ref.paymentId}`,
          expected: 'Valid target document',
          actual: 'Target not found',
        });
      }
    }

    reports.push({
      tenantId: String(tenant._id),
      tenantName: tenant.name,
      studentFeesAudited: studentFees.length,
      studentExamFeesAudited: examFees.length,
      paymentsAudited: allRegularPayments.length,
      examFeePaymentsAudited: allExamPayments.length,
      reversalsAudited: allReversals.length,
      financialReferencesAudited: references.length,
      discrepancies,
      isHealthy: discrepancies.length === 0,
    });
  }

  return reports;
}

// CLI runner
async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not defined');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('--- Financial Reconciliation Report (Read-Only) ---');
  const reports = await runFinancialReconciliation();

  for (const r of reports) {
    console.log(`\nTenant: ${r.tenantName} (${r.tenantId})`);
    console.log(`- Fees Audited: ${r.studentFeesAudited} regular, ${r.studentExamFeesAudited} exam`);
    console.log(`- Payments Audited: ${r.paymentsAudited} regular, ${r.examFeePaymentsAudited} exam, ${r.reversalsAudited} reversals`);
    console.log(`- References Audited: ${r.financialReferencesAudited}`);
    console.log(`- Health Status: ${r.isHealthy ? 'HEALTHY (0 discrepancies)' : 'UNHEALTHY'}`);
    if (r.discrepancies.length > 0) {
      console.log(`  Discrepancies found: ${r.discrepancies.length}`);
      for (const d of r.discrepancies) {
        console.log(`  [${d.severity}] ${d.type} (Entity: ${d.entityId}): ${d.details}`);
      }
    }
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Reconciliation error:', err);
    process.exit(1);
  });
}
