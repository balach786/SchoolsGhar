import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { publicSession, normalizeSessionName, IAcademicSession } from '../models/AcademicSession';
import { Tenant } from '../models/Tenant';

import { getTenantModels } from './TenantModelRegistry';
import { recordAudit } from './audit.service';
import { parseDateOrThrow } from '../validators/academic.validators';

export function parseSessionRange(start: string | Date, end: string | Date): { startDate: Date; endDate: Date } {
  const startDate = typeof start === 'string' ? parseDateOrThrow(start, 'Start date') : new Date(start);
  const endDate = typeof end === 'string' ? parseDateOrThrow(end, 'End date') : new Date(end);
  if (isNaN(startDate.getTime())) throw ApiError.badRequest('Invalid start date', 'INVALID_DATE');
  if (isNaN(endDate.getTime())) throw ApiError.badRequest('Invalid end date', 'INVALID_DATE');
  if (endDate <= startDate) {
    throw ApiError.badRequest('End date must be after the start date', 'INVALID_DATE_RANGE');
  }
  return { startDate, endDate };
}

function handleMongoDuplicateErrors(err: any): void {
  if (err?.code === 11000 || err?.message?.includes('E11000')) {
    if (err?.message?.includes('normalized') || err?.keyPattern?.normalizedName) {
      throw ApiError.conflict('A session with this name already exists for this school', 'SESSION_NAME_TAKEN');
    }
    if (err?.message?.includes('active') || err?.keyPattern?.isActive) {
      throw ApiError.conflict('An active academic session already exists for this tenant', 'ACTIVE_SESSION_EXISTS');
    }
    throw ApiError.conflict('A conflict occurred with an existing academic session', 'SESSION_CONFLICT');
  }
}

export interface CreateCanonicalSessionParams {
  tenantDb: mongoose.Connection;
  tenantId: mongoose.Types.ObjectId | string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  makeActive?: boolean;
  createdBy?: mongoose.Types.ObjectId | string;
  userAuditContext?: any;
  mongoSession?: mongoose.ClientSession;
}

/**
 * Canonical AcademicSession creation.
 * Guarantees:
 * 1. Strict tenant scoping
 * 2. normalizedName calculation
 * 3. Exactly-one-active invariant via Tenant.academicSessionSeq serialization + active_unique_per_tenant partial index
 * 4. Audit logging
 * 5. Atomic transaction support
 */
export async function createCanonicalSession(params: CreateCanonicalSessionParams): Promise<IAcademicSession> {
  const { tenantDb, tenantId, name, makeActive, createdBy, userAuditContext, mongoSession } = params;
  const { AcademicSession, SchoolSettings } = getTenantModels(tenantDb);
  if (!tenantId) {
    throw ApiError.forbidden('School workspace context required for session creation', 'NO_TENANT');
  }

  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  const creatorId = createdBy ? (typeof createdBy === 'string' ? new mongoose.Types.ObjectId(createdBy) : createdBy) : undefined;

  const { startDate, endDate } = parseSessionRange(params.startDate, params.endDate);
  const normalizedName = normalizeSessionName(name);

  if (mongoSession) {
    return await executeCreateInSession(mongoSession);
  }

  const session = await mongoose.startSession();
  try {
    let createdDoc: any;
    await session.withTransaction(async () => {
      createdDoc = await executeCreateInSession(session);
    });
    return createdDoc;
  } catch (err: any) {
    handleMongoDuplicateErrors(err);
    throw err;
  } finally {
    await session.endSession();
  }

  async function executeCreateInSession(s: mongoose.ClientSession): Promise<IAcademicSession> {
    try {
      // 1. Acquire tenant serialization lock
      await Tenant.updateOne({ _id: tId }, { $inc: { academicSessionSeq: 1 } }, { session: s });

      // 1b. Check duplicate normalized name for non-archived sessions
      const existingName = await AcademicSession.findOne({
        tenantId: tId,
        normalizedName,
        isArchived: false,
      }).session(s);
      if (existingName) {
        throw ApiError.conflict('A session with this name already exists for this school', 'SESSION_NAME_TAKEN');
      }

      // 2. Check if an active session currently exists for this tenant
      const existingActive = await AcademicSession.findOne({ tenantId: tId, isActive: true }).session(s);
      const shouldActivate = makeActive === true || !existingActive;

      if (shouldActivate) {
        // Deactivate currently active sessions for tenant
        await AcademicSession.updateMany(
          { tenantId: tId, isActive: true },
          { $set: { isActive: false } },
          { session: s }
        );
      }

      // 3. Create the session document
      const createdDocs = await AcademicSession.create(
        [
          {
            tenantId: tId,
            name,
            normalizedName,
            startDate,
            endDate,
            isActive: shouldActivate,
            isArchived: false,
            createdBy: creatorId,
          },
        ],
        { session: s }
      );

      const sessionDoc = createdDocs[0];

      // 4. Sync SchoolSettings.activeSessionId if active
      if (shouldActivate) {
        await SchoolSettings.updateOne(
          { tenantId: tId },
          { $set: { activeSessionId: sessionDoc._id } },
          { session: s }
        );
      }

      // 5. Audit log
      if (userAuditContext) {
        recordAudit('academicSessions', 'SESSION_CREATED', userAuditContext, String(sessionDoc._id), {
          name,
          isActive: shouldActivate,
        });
      }

      return sessionDoc;
    } catch (err: any) {
      handleMongoDuplicateErrors(err);
      throw err;
    }
  }
}

/**
 * Canonical AcademicSession activation.
 * Guarantees exactly-one-active via Tenant.academicSessionSeq lock and active_unique_per_tenant index.
 */
export async function activateCanonicalSession(
  tenantId: mongoose.Types.ObjectId | string,
  sessionId: string | mongoose.Types.ObjectId,
  userAuditContext: any,
  tenantDb: mongoose.Connection
): Promise<IAcademicSession> {
  const { AcademicSession, SchoolSettings } = getTenantModels(tenantDb);
  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  const targetCheck = await AcademicSession.findOne({ _id: sessionId, tenantId: tId });
  if (!targetCheck) throw ApiError.notFound('Academic session not found');
  if (targetCheck.isArchived) throw ApiError.badRequest('Archived sessions cannot be activated');
  if (targetCheck.isActive) return targetCheck;

  const mongoSession = await mongoose.startSession();
  let activatedDoc: any;

  try {
    await mongoSession.withTransaction(async () => {
      // 1. Serialize on Tenant write lock
      await Tenant.updateOne({ _id: tId }, { $inc: { academicSessionSeq: 1 } }, { session: mongoSession });

      // 2. Re-read target within transaction
      const currentTarget = await AcademicSession.findOne({ _id: sessionId, tenantId: tId }).session(mongoSession);
      if (!currentTarget) throw ApiError.notFound('Academic session not found');
      if (currentTarget.isArchived) throw ApiError.badRequest('Archived sessions cannot be activated');

      if (currentTarget.isActive) {
        activatedDoc = currentTarget;
        return;
      }

      // 3. Deactivate currently active sessions
      await AcademicSession.updateMany(
        { tenantId: tId, isActive: true },
        { $set: { isActive: false } },
        { session: mongoSession }
      );

      // 4. Activate target
      currentTarget.isActive = true;
      await currentTarget.save({ session: mongoSession });

      // 5. Sync activeSessionId on SchoolSettings
      await SchoolSettings.updateOne(
        { tenantId: tId },
        { $set: { activeSessionId: currentTarget._id } },
        { session: mongoSession }
      );

      activatedDoc = currentTarget;
    });
  } catch (err: any) {
    handleMongoDuplicateErrors(err);
    throw err;
  } finally {
    await mongoSession.endSession();
  }

  if (userAuditContext) {
    recordAudit('academicSessions', 'SESSION_ACTIVATED', userAuditContext, String(activatedDoc._id), {
      name: activatedDoc.name,
    });
  }

  return activatedDoc;
}

/**
 * Canonical AcademicSession archive / restore.
 */
export async function archiveCanonicalSession(
  tenantId: mongoose.Types.ObjectId | string,
  sessionId: string | mongoose.Types.ObjectId,
  restore: boolean,
  userAuditContext: any,
  tenantDb: mongoose.Connection
): Promise<IAcademicSession> {
  const { AcademicSession } = getTenantModels(tenantDb);
  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  const session = await AcademicSession.findOne({ _id: sessionId, tenantId: tId });
  if (!session) throw ApiError.notFound('Academic session not found');

  if (!restore && session.isActive) {
    throw ApiError.badRequest('Deactivate the session before archiving it');
  }

  session.isArchived = !restore;
  if (restore) {
    session.isActive = false;
  }

  try {
    await session.save();
  } catch (err: any) {
    handleMongoDuplicateErrors(err);
    throw err;
  }

  if (userAuditContext) {
    recordAudit('academicSessions', restore ? 'SESSION_RESTORED' : 'SESSION_ARCHIVED', userAuditContext, String(session._id), {
      name: session.name,
    });
  }

  return session;
}

export interface DeleteSessionResult {
  deleted: boolean;
  _id: mongoose.Types.ObjectId;
}

/**
 * Canonical AcademicSession permanent deletion.
 * Enforces comprehensive 23-model dependency verification.
 * Disallows deletion if session is active or ANY dependent/historical records exist.
 */
export async function deleteCanonicalSession(
  tenantDb: mongoose.Connection,
  tenantId: mongoose.Types.ObjectId | string,
  sessionId: string | mongoose.Types.ObjectId,
  userAuditContext?: any
): Promise<DeleteSessionResult> {
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { AcademicSession, SchoolSettings, Expense, Income, Student, StudentHistory, Class, Section, Subject, StudentAttendance, TeacherAttendance, FeeStructure, StudentFee, Payment, SalaryRecord, Exam, ExamSchedule, ExamFee, StudentExamFee, Mark, Result } = getTenantModels(tenantDb);
  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  const session = await AcademicSession.findOne({ _id: sessionId, tenantId: tId });
  if (!session) throw ApiError.notFound('Academic session not found');

  if (session.isActive) {
    throw ApiError.badRequest('Cannot delete the active academic session. Please activate another session before deleting this one.');
  }

  const sId = session._id;
  const match = { sessionId: sId, tenantId: tId };

  // Comprehensive 23-model dependency audit
  const [
    studentCount,
    studentHistoryCount,
    classCount,
    sectionCount,
    subjectCount,
    studentAttendanceCount,
    teacherAttendanceCount,
    feeStructureCount,
    studentFeeCount,
    paymentCount,
    salaryRecordCount,
    expenseCount,
    incomeCount,
    examCount,
    examScheduleCount,
    examFeeCount,
    studentExamFeeCount,
    examExpenseCount,
    markCount,
    resultCount,
    schoolSettingsCount,
  ] = await Promise.all([
    Student.countDocuments(match),
    StudentHistory.countDocuments(match),
    Class.countDocuments(match),
    Section.countDocuments(match),
    Subject.countDocuments(match),
    StudentAttendance.countDocuments(match),
    TeacherAttendance.countDocuments(match),
    FeeStructure.countDocuments(match),
    StudentFee.countDocuments(match),
    Payment.countDocuments(match),
    SalaryRecord.countDocuments(match),
    Expense.countDocuments(match),
    Income.countDocuments(match),
    Exam.countDocuments(match),
    ExamSchedule.countDocuments(match),
    ExamFee.countDocuments(match),
    StudentExamFee.countDocuments(match),
    Expense.countDocuments(match),
    Mark.countDocuments(match),
    Result.countDocuments(match),
    SchoolSettings.countDocuments({ activeSessionId: sId, tenantId: tId }),
  ]);

  const reasons: string[] = [];
  if (studentCount > 0) reasons.push(`${studentCount} student(s)`);
  if (studentHistoryCount > 0) reasons.push(`${studentHistoryCount} student historical record(s)`);
  if (classCount > 0) reasons.push(`${classCount} class(es)`);
  if (sectionCount > 0) reasons.push(`${sectionCount} section(s)`);
  if (subjectCount > 0) reasons.push(`${subjectCount} subject(s)`);
  if (studentAttendanceCount > 0) reasons.push(`${studentAttendanceCount} student attendance record(s)`);
  if (teacherAttendanceCount > 0) reasons.push(`${teacherAttendanceCount} teacher attendance record(s)`);
  if (feeStructureCount > 0) reasons.push(`${feeStructureCount} fee structure(s)`);
  if (studentFeeCount > 0) reasons.push(`${studentFeeCount} student fee record(s)`);
  if (paymentCount > 0) reasons.push(`${paymentCount} payment(s)`);
  if (salaryRecordCount > 0) reasons.push(`${salaryRecordCount} salary record(s)`);
  if (expenseCount > 0) reasons.push(`${expenseCount} expense record(s)`);
  if (incomeCount > 0) reasons.push(`${incomeCount} income record(s)`);
  if (examCount > 0) reasons.push(`${examCount} exam(s)`);
  if (examScheduleCount > 0) reasons.push(`${examScheduleCount} exam schedule(s)`);
  if (examFeeCount > 0) reasons.push(`${examFeeCount} exam fee record(s)`);
  if (studentExamFeeCount > 0) reasons.push(`${studentExamFeeCount} student exam fee record(s)`);
  if (examExpenseCount > 0) reasons.push(`${examExpenseCount} exam expense record(s)`);
  if (markCount > 0) reasons.push(`${markCount} exam mark(s)`);
  if (resultCount > 0) reasons.push(`${resultCount} student result(s)`);
  if (schoolSettingsCount > 0) reasons.push('referenced as activeSessionId in school settings');

  if (reasons.length > 0) {
    throw ApiError.badRequest(
      `Cannot delete session "${session.name}" because it contains: ${reasons.join(', ')}. Please archive the session instead to preserve historical records.`,
      'SESSION_HAS_DEPENDENCIES'
    );
  }

  await AcademicSession.deleteOne({ _id: sId, tenantId: tId });

  if (userAuditContext) {
    recordAudit('academicSessions', 'SESSION_DELETED', userAuditContext, String(sId), { name: session.name });
  }

  return { deleted: true, _id: sId };
}
