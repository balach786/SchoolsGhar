import mongoose from 'mongoose';
import { getTenantModels } from './TenantModelRegistry';

export async function generateStudentExamFeesForClass(
  tenantDb: mongoose.Connection,
  tenantId: string | mongoose.Types.ObjectId,
  examId: string | mongoose.Types.ObjectId,
  classId: string | mongoose.Types.ObjectId,
  sessionId: string | mongoose.Types.ObjectId,
  feeConfig: { amount: number; dueDate?: Date },
  createdBy: string | mongoose.Types.ObjectId | undefined,
  session?: mongoose.ClientSession
): Promise<number> {
  // If amount is 0 or less, do not generate fees (No Fee scenario)
  if (feeConfig.amount <= 0) {
    return 0;
  }

  const { Student, StudentExamFee } = getTenantModels(tenantDb);

  // Find all active eligible students in the class
  const studentFilter: Record<string, any> = {
    tenantId,
    sessionId,
    classId,
    isArchived: false,
  };

  const eligibleStudents = await Student.find(studentFilter)
    .select('_id sectionId')
    .session(session || null)
    .lean();

  if (eligibleStudents.length === 0) {
    return 0;
  }

  // Find existing fees to prevent duplicates
  const existingFees = await StudentExamFee.find({
    tenantId,
    examId,
    studentId: { $in: eligibleStudents.map((s) => s._id) },
  })
    .select('studentId')
    .session(session || null)
    .lean();

  const existingSet = new Set(existingFees.map((f) => String(f.studentId)));
  const toCreate: any[] = [];

  for (const s of eligibleStudents) {
    if (existingSet.has(String(s._id))) continue;

    const originalAmount = feeConfig.amount;
    const discountAmount = 0;
    const scholarshipAmount = 0;
    const netPayable = Math.max(0, originalAmount - discountAmount - scholarshipAmount);

    toCreate.push({
      tenantId,
      examId,
      studentId: s._id,
      sessionId,
      classId,
      sectionId: s.sectionId,
      originalAmount,
      discountAmount,
      scholarshipAmount,
      fineAmount: 0,
      netPayable,
      amountPaid: 0,
      remainingBalance: netPayable,
      status: netPayable === 0 ? 'paid' : 'unpaid',
      dueDate: feeConfig.dueDate,
      createdBy,
    });
  }

  if (toCreate.length > 0) {
    if (session) {
      await StudentExamFee.insertMany(toCreate, { session, ordered: false });
    } else {
      await StudentExamFee.insertMany(toCreate, { ordered: false });
    }
  }

  return toCreate.length;
}
