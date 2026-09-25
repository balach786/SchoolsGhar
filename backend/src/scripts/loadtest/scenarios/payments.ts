import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runPaymentScenario(
  client: mongoose.mongo.MongoClient,
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  concurrency: number,
  metrics: MetricsCollector
): Promise<{
  committedTransactions: number;
  controlledConflicts: number;
  idempotentDeduplications: number;
  duplicateReferenceRejections: number;
}> {
  const db = connection.db!;
  let committedTransactions = 0;
  let controlledConflicts = 0;
  let idempotentDeduplications = 0;
  let duplicateReferenceRejections = 0;

  // Helper: Execute payment transaction
  const executePaymentTx = async (
    tId: mongoose.Types.ObjectId,
    studentId: mongoose.Types.ObjectId,
    feeId: mongoose.Types.ObjectId,
    amount: number,
    idempotencyKey: string,
    ref: string
  ): Promise<{ status: 'committed' | 'conflict' | 'duplicate_idempotency' | 'duplicate_ref'; error?: string }> => {
    const session = client.startSession();
    try {
      let outcome: 'committed' | 'conflict' | 'duplicate_idempotency' | 'duplicate_ref' = 'committed';

      await session.withTransaction(async () => {
        // 1. Check idempotency lock
        const idempKey = `${tId}:fee_payment:${idempotencyKey}`;
        const existingIdemp = await db.collection('financialidempotencies').findOne(
          { _id: idempKey as any },
          { session }
        );

        if (existingIdemp) {
          outcome = 'duplicate_idempotency';
          return;
        }

        // Reserve idempotency
        await db.collection('financialidempotencies').insertOne(
          {
            _id: idempKey as any,
            tenantId: tId,
            operation: 'fee_payment',
            idempotencyKey,
            requestHash: 'hash-123',
            status: 'completed',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
          { session }
        );

        // 2. Reserve Financial Reference (unique: tenantId + method + ref)
        const refKey = `${tId}:cash:${ref.toUpperCase()}`;
        const existingRef = await db.collection('financialreferences').findOne(
          { _id: refKey as any },
          { session }
        );
        if (existingRef) {
          outcome = 'duplicate_ref';
          throw new Error('DUPLICATE_FINANCIAL_REFERENCE');
        }

        await db.collection('financialreferences').insertOne(
          {
            _id: refKey as any,
            tenantId: tId,
            paymentMethod: 'cash',
            normalizedReference: ref.toUpperCase(),
            sourceType: 'regular_fee',
            paymentId: new mongoose.Types.ObjectId(),
            receiptNumber: 'PENDING',
            createdAt: new Date(),
          },
          { session }
        );

        // 3. Inspect Fee balance
        const fee = await db.collection('studentfees').findOne(
          { _id: feeId, tenantId: tId },
          { session }
        );

        if (!fee) {
          outcome = 'conflict';
          throw new Error('FEE_NOT_FOUND');
        }

        if (fee.amountPaid + amount > fee.amount) {
          outcome = 'conflict';
          throw new Error('OVERPAYMENT_CONFLICT');
        }

        // 4. Sequential Receipt Allocation
        const counter = await db.collection('receiptcounters').findOneAndUpdate(
          { _id: `${tId}:REC:2026` as any },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after', session }
        );
        const receiptNumber = `REC-2026-${String(counter?.seq || 1).padStart(5, '0')}`;

        // 5. Update Fee & Create Payment
        await db.collection('studentfees').updateOne(
          { _id: feeId, tenantId: tId },
          {
            $inc: { amountPaid: amount },
            $set: {
              status: fee.amountPaid + amount >= fee.amount ? 'paid' : 'partial',
              updatedAt: new Date(),
            },
          },
          { session }
        );

        await db.collection('payments').insertOne(
          {
            tenantId: tId,
            studentId,
            studentFeeId: feeId,
            amount,
            receiptNumber,
            paymentDate: new Date(),
            paymentMethod: 'cash',
            reference: ref,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session }
        );
      });

      return { status: outcome };
    } catch (e: any) {
      if (e.message.includes('OVERPAYMENT_CONFLICT')) {
        return { status: 'conflict' };
      }
      if (e.message.includes('DUPLICATE_FINANCIAL_REFERENCE') || e.code === 11000) {
        return { status: 'duplicate_ref' };
      }
      return { status: 'conflict', error: e.message };
    } finally {
      await session.endSession();
    }
  };

  // Run concurrent payment requests
  const school = schools[0];
  const tId = school.tenantId;
  const fees = await db.collection('studentfees').find({ tenantId: tId, status: 'unpaid' }).limit(concurrency).toArray();

  if (!fees || fees.length === 0) {
    return {
      committedTransactions: 0,
      controlledConflicts: 0,
      idempotentDeduplications: 0,
      duplicateReferenceRejections: 0,
    };
  }

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    const fee = fees[i % fees.length];
    const targetStudent = school.students.find(s => String(s._id) === String(fee.studentId)) || school.students[0];
    const idempKey = `loadtest-pay-${i}-${Date.now()}`;
    const refKey = `REF-TXN-${i}-${Date.now()}`;

    tasks.push(
      (async () => {
        const start = performance.now();
        const res = await executePaymentTx(tId, targetStudent._id, fee._id, 100000, idempKey, refKey);
        const duration = performance.now() - start;

        if (res.status === 'committed') {
          committedTransactions++;
          metrics.record({
            scenario: 'payment_acid_transaction',
            durationMs: duration,
            statusCode: 200,
            success: true,
            tenantId: String(tId),
          });
        } else if (res.status === 'conflict') {
          controlledConflicts++;
          metrics.record({
            scenario: 'payment_controlled_conflict',
            durationMs: duration,
            statusCode: 400,
            success: true, // Controlled conflict is correct business rejection
            tenantId: String(tId),
          });
        } else if (res.status === 'duplicate_idempotency') {
          idempotentDeduplications++;
        } else if (res.status === 'duplicate_ref') {
          duplicateReferenceRejections++;
        }
      })()
    );
  }

  await Promise.all(tasks);

  // Test Race Condition 1: Same Fee, identical Idempotency Key (Instant duplicate click)
  if (fees.length > 0) {
    const sampleFee = fees[0];
    const identicalKey = `double-click-${Date.now()}`;
    const ref = `DBL-REF-${Date.now()}`;
    const [res1, res2] = await Promise.all([
      executePaymentTx(tId, sampleFee.studentId, sampleFee._id, 50000, identicalKey, ref),
      executePaymentTx(tId, sampleFee.studentId, sampleFee._id, 50000, identicalKey, ref),
    ]);
    if (res1.status === 'duplicate_idempotency' || res2.status === 'duplicate_idempotency') {
      idempotentDeduplications++;
    }
  }

  // Test Race Condition 2: Duplicate reference collision
  const collisionRef = `COLLISION-TXN-${Date.now()}`;
  const f1 = fees[0];
  const f2 = fees[1] || fees[0];
  await executePaymentTx(tId, f1.studentId, f1._id, 10000, `k1-${Date.now()}`, collisionRef);
  const dupRefRes = await executePaymentTx(tId, f2.studentId, f2._id, 10000, `k2-${Date.now()}`, collisionRef);
  if (dupRefRes.status === 'duplicate_ref') {
    duplicateReferenceRejections++;
  }

  return {
    committedTransactions,
    controlledConflicts,
    idempotentDeduplications,
    duplicateReferenceRejections,
  };
}
