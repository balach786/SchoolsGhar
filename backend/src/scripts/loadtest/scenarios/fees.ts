import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runFeeGenerationScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  metrics: MetricsCollector
): Promise<{ totalGenerated: number; duplicateRejections: number }> {
  const db = connection.db!;
  let totalGenerated = 0;
  let duplicateRejections = 0;

  for (const school of schools) {
    const tId = school.tenantId;
    const structureId = new mongoose.Types.ObjectId();
    const structure = school.feeStructures[0];
    const targetStudents = school.students;

    const feeDocs = targetStudents.map(st => ({
      tenantId: tId,
      studentId: st._id,
      feeStructureId: structureId,
      sessionId: school.sessionId,
      classId: st.classId,
      sectionId: st.sectionId,
      amount: structure.amount,
      amountPaid: 0,
      discount: 0,
      fine: 0,
      dueDate: new Date('2026-10-15'),
      status: 'unpaid',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // 1. Initial Generation (300 to 1,000 obligations)
    let start = performance.now();
    try {
      const res = await db.collection('studentfees').insertMany(feeDocs, { ordered: false });
      totalGenerated += res.insertedCount;

      metrics.record({
        scenario: 'fee_generation_batch',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'fee_generation_batch',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }

    // 2. Duplicate generation attempt (must be blocked by unique index)
    start = performance.now();
    try {
      await db.collection('studentfees').insertMany(feeDocs.slice(0, 10), { ordered: false });
    } catch (e: any) {
      if (e.code === 11000 || e.message.includes('E11000')) {
        duplicateRejections++;
      }
    }
  }

  return { totalGenerated, duplicateRejections };
}
