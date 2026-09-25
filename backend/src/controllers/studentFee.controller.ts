import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { paginated, ok } from '../utils/apiResponse';
import { publicStudentFee } from '../models/StudentFee';
import { publicFeeStructure } from '../models/FeeStructure';
import {
  generateStudentFees,
  adjustStudentFee,
  buildLedger,
  ownStudentScope,
  type AuthedUser,
} from '../services/finance.service';
import { recordAudit } from '../services/audit.service';
import { notify, NOTIFICATION_TYPES } from '../services/notification.service';
import { AuthRequest } from '../types';
import { scopeQuery } from '../utils/tenantScope';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

async function resolveNames(req: Request, fees: any[]) {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  const { Student, Class, Section, FeeStructure } = getTenantModels(tenantDb);
  const ids = (key: string) => Array.from(new Set(fees.map((f) => f[key]).filter(Boolean).map((v: unknown) => String(v))));
  const [students, classes, sections, structures] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: ids('studentId') } })).select('fullName admissionNumber rollNumber').lean(),
    Class.find(scopeQuery(req, { _id: { $in: ids('classId') } })).select('name').lean(),
    Section.find(scopeQuery(req, { _id: { $in: ids('sectionId') } })).select('name').lean(),
    FeeStructure.find(scopeQuery(req, { _id: { $in: ids('feeStructureId') } })).select('title').lean(),
  ]);
  return {
    studentMap: new Map(students.map((s: any) => [String(s._id), s])),
    classMap: new Map(classes.map((c: any) => [String(c._id), c.name])),
    sectionMap: new Map(sections.map((s: any) => [String(s._id), s.name])),
    structureMap: new Map(structures.map((s: any) => [String(s._id), s.title])),
  };
}

function withNames(f: any, names: any) {
  const stu = names.studentMap.get(String(f.studentId));
  return {
    ...publicStudentFee(f),
    studentName: stu?.fullName ?? '—',
    admissionNumber: stu?.admissionNumber ?? '—',
    rollNumber: stu?.rollNumber ?? '—',
    className: names.classMap.get(String(f.classId)) ?? '—',
    sectionName: names.sectionMap.get(String(f.sectionId)) ?? '—',
    feeTitle: names.structureMap.get(String(f.feeStructureId)) ?? '—',
  };
}

/** GET /api/student-fees */
export const listStudentFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const ownStudentId = await ownStudentScope(user, req.query.studentId as string | undefined, tenantDb);

  let filter: Record<string, any> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.feeStructureId) filter.feeStructureId = req.query.feeStructureId;
  if (req.query.feeType) filter.feeType = req.query.feeType;
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.status) filter.status = req.query.status;

  if (ownStudentId) {
    filter.studentId = ownStudentId;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matched = await Student.find(scopeQuery(req, { $or: [{ fullName: rx }, { admissionNumber: rx }] })).select('_id').lean();
      const isMatched = matched.some((m) => String(m._id) === ownStudentId);
      if (!isMatched) filter.studentId = null;
    }
  } else {
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matched = await Student.find(scopeQuery(req, { $or: [{ fullName: rx }, { admissionNumber: rx }] })).select('_id').lean();
      filter.studentId = { $in: matched.map((m) => m._id) };
    }
  }

  filter = scopeQuery(req, filter);

  const [docs, total] = await Promise.all([
    StudentFee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StudentFee.countDocuments(filter),
  ]);
  const names = await resolveNames(req, docs);
  paginated(res, {
    data: docs.map((d) => withNames(d, names)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** GET /api/student-fees/:id */
export const getStudentFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await StudentFee.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Student fee not found');
  const ownStudentId = await ownStudentScope(user, String(doc.studentId));
  if (ownStudentId && String(doc.studentId) !== ownStudentId) {
    throw ApiError.forbidden('You can only view your own financial records', 'FINANCE_FORBIDDEN');
  }
  const names = await resolveNames(req, [doc]);
  ok(res, withNames(doc, names));
});

/** POST /api/student-fees/generate — controlled fee generation workflow with rule snapshotting. */
export const generateFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  // Use snapshot-aware generation preserving rules at creation time
  const { generateStudentFeesWithSnapshot } = await import('../services/feeManagement.service');
  const result = await generateStudentFeesWithSnapshot(user, req.body, tenantDb);

  const structure = await FeeStructure.findOne(scopeQuery(req, { _id: req.body.feeStructureId })).select('title amount').lean();
  recordAudit('fees', 'STUDENT_FEE_GENERATED', req.user, String(req.body.feeStructureId), {
    created: result.created,
    skipped: result.skipped,
    month: req.body.month,
    year: req.body.year,
  });

  // FEE_DUE notifications for newly generated fees (bounded, compact).
  if (result.created > 0) {
    const fresh = await StudentFee.find(scopeQuery(req, {
      feeStructureId: req.body.feeStructureId,
      sessionId: req.body.sessionId,
      classId: req.body.classId,
      amountPaid: 0,
    }))
      .select('studentId')
      .lean();
    const linked = await Student.find(scopeQuery(req, { _id: { $in: fresh.map((f) => f.studentId) }, userId: { $exists: true, $ne: null } }))
      .select('userId')
      .lean();
    const CHUNK_SIZE = 50;
    for (let i = 0; i < linked.length; i += CHUNK_SIZE) {
      const chunk = linked.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((s: any) =>
          notify(req.tenantDb as mongoose.Connection, {
            userId: s.userId as never,
            type: NOTIFICATION_TYPES.FEE_DUE,
            title: 'New fee due',
            message: `${structure?.title ?? 'A new fee'} of ${(structure?.amount ?? 0) / 100} has been generated for your account.`,
            referenceType: 'studentFee',
            referenceId: String(fresh.find((f) => String(f.studentId) === String(s._id))?._id ?? ''),
            dedupe: true,
          })
        )
      );
    }
  }

  ok(res, { created: result.created, skipped: result.skipped, total: result.created + result.skipped }, 200, {
    message: `Generated ${result.created} fee(s), skipped ${result.skipped} existing`,
  });
});

/** PATCH /api/student-fees/:id/adjust — discount / scholarship / fine (audited). */
export const adjustFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await StudentFee.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Student fee not found');

  const before = {
    discountAmount: doc.discountAmount ?? 0,
    scholarshipAmount: doc.scholarshipAmount ?? 0,
    fineAmount: doc.fineAmount ?? 0,
  };
  await adjustStudentFee(doc, req.body);

  if (req.body.discountAmount !== undefined) {
    recordAudit('fees', 'DISCOUNT_UPDATED', req.user, String(doc._id), {
      before: before.discountAmount,
      after: doc.discountAmount,
    });
  }
  if (req.body.scholarshipAmount !== undefined) {
    recordAudit('fees', 'SCHOLARSHIP_UPDATED', req.user, String(doc._id), {
      before: before.scholarshipAmount,
      after: doc.scholarshipAmount,
    });
  }
  if (req.body.fineAmount !== undefined) {
    recordAudit('fees', 'FINE_UPDATED', req.user, String(doc._id), { before: before.fineAmount, after: doc.fineAmount });
  }

  const names = await resolveNames(req, [doc]);
  ok(res, withNames(doc, names), 200, { message: 'Fee adjusted' });
});

/** GET /api/student-fees/ledger — per-student ledger (charges + payments). */
export const feeLedger = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const studentId = await ownStudentScope(user, req.query.studentId as string | undefined);
  if (!studentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');

  const student = await Student.findOne(scopeQuery(req, { _id: studentId })).select('fullName admissionNumber rollNumber').lean();
  if (!student) throw ApiError.notFound('Student not found');

  const rows = await buildLedger(studentId, {
    sessionId: req.query.sessionId as string | undefined,
    feeType: req.query.feeType as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });

  ok(res, {
    student: { studentId: String(student._id), fullName: student.fullName, admissionNumber: student.admissionNumber, rollNumber: student.rollNumber },
    rows,
    closingBalance: rows.length ? rows[rows.length - 1].balance : 0,
  });
});

/**
 * GET /api/student-fees/calculate
 * Calculates current month fee, previous pending balances, admission fee, other fee,
 * late fee (if past due date), and traceable discounts.
 */
export const calculateStudentFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const targetStudentId = await ownStudentScope(user, req.query.studentId as string);
  if (!targetStudentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');

  const { getTenantObjectId } = await import('../utils/tenantScope');
  const { calculateStudentFeeObligations } = await import('../services/feeManagement.service');
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const breakdown = await calculateStudentFeeObligations(tenantId, targetStudentId, {
    sessionId: req.query.sessionId as string,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    reAdmissionEventId: req.query.reAdmissionEventId as string,
  }, tenantDb);

  ok(res, breakdown);
});

/**
 * GET /api/student-fees/class-summary
 * Returns student list with Student Name, Roll No, Admission No, Total Fee, Paid, Remaining, Status,
 * previousOutstanding, totalOutstanding.
 * Filterable by: classId, sectionId, month, year, status (All, Paid, Partial, Unpaid).
 *
 * previousOutstanding is computed from older unpaid/partial invoices using a SINGLE batched
 * aggregation grouped by studentId — no N+1 per-student queries.
 */
export const listClassSectionSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const { classId, sectionId, sessionId, month, year, status } = req.query;
  if (!classId) throw ApiError.badRequest('classId is required');

  const stuFilter: Record<string, any> = { classId, isArchived: false, isActive: true };
  if (sectionId) stuFilter.sectionId = sectionId;
  if (sessionId) stuFilter.sessionId = sessionId;

  const students = await Student.find(scopeQuery(req, stuFilter))
    .select('fullName rollNumber admissionNumber classId sectionId guardianName guardianRelationship gender')
    .sort({ rollNumber: 1, fullName: 1 })
    .lean();

  const studentIds = students.map((s: any) => s._id);

  // ── Current month/year fees (the selected billing period) ──
  const feeFilter: Record<string, any> = {
    studentId: { $in: studentIds },
  };
  if (sessionId) feeFilter.sessionId = sessionId;
  if (month) feeFilter.month = Number(month);
  if (year) feeFilter.billingYear = Number(year);

  const fees = await StudentFee.find(scopeQuery(req, feeFilter)).lean();
  const feeByStudent = new Map<string, typeof fees>();
  for (const f of fees) {
    const sId = String(f.studentId);
    if (!feeByStudent.has(sId)) feeByStudent.set(sId, []);
    feeByStudent.get(sId)!.push(f);
  }

  // ── Previous Outstanding: SINGLE batched aggregation ──
  // Sum remaining balances from older unpaid/partial invoices NOT matching the current month/year.
  const prevFilter: Record<string, any> = {
    studentId: { $in: studentIds },
    status: { $in: ['unpaid', 'partial'] },
    remainingBalance: { $gt: 0 },
  };
  if (sessionId) prevFilter.sessionId = sessionId;

  // Exclude the current billing period (so we only get OLDER invoices)
  if (month && year) {
    prevFilter.$or = [
      { billingMonth: { $ne: Number(month) } },
      { billingYear: { $ne: Number(year) } },
      { billingMonth: null },
    ];
  }

  const prevAgg = await StudentFee.aggregate([
    { $match: scopeQuery(req, prevFilter) },
    {
      $group: {
        _id: '$studentId',
        previousOutstanding: { $sum: '$remainingBalance' },
      },
    },
  ]);
  const prevMap = new Map<string, number>();
  for (const row of prevAgg) {
    prevMap.set(String(row._id), row.previousOutstanding);
  }

  // ── Build response rows ──
  const rows = students
    .map((s: any) => {
      const sFees = feeByStudent.get(String(s._id)) || [];
      const totalFee = sFees.reduce((sum, f) => sum + f.netPayable, 0);
      const paid = sFees.reduce((sum, f) => sum + (f.amountPaid || 0), 0);
      const remaining = sFees.reduce((sum, f) => sum + f.remainingBalance, 0);

      let calcStatus = 'not_generated';
      if (sFees.length > 0) {
        calcStatus = 'unpaid';
        if (remaining === 0 && totalFee > 0) calcStatus = 'paid';
        else if (paid > 0) calcStatus = 'partial';
      }

      const previousOutstanding = prevMap.get(String(s._id)) || 0;
      const totalOutstanding = remaining + previousOutstanding;

      return {
        studentId: String(s._id),
        fullName: s.fullName,
        fatherName: s.fatherName,
        guardianName: s.guardianName,
        gender: s.gender,
        caste: s.caste,
        rollNumber: s.rollNumber || '—',
        admissionNumber: s.admissionNumber,
        netPayable: totalFee,
        amountPaid: paid,
        remainingBalance: remaining,
        previousOutstanding,
        totalOutstanding,
        status: calcStatus,
        invoiceId: sFees.length > 0 ? String(sFees[0]._id) : null,
        dueDate: null,
      };
    })
    .filter((r) => {
      if (!status || status === 'all') return true;
      return r.status.toLowerCase() === String(status).toLowerCase();
    });

  ok(res, {
    summary: {
      classId,
      sectionId: sectionId || null,
      totalStudents: students.length,
      filteredCount: rows.length,
      totalExpected: rows.reduce((sum, r) => sum + r.netPayable, 0),
      totalCollected: rows.reduce((sum, r) => sum + r.amountPaid, 0),
      totalPending: rows.reduce((sum, r) => sum + r.remainingBalance, 0),
      totalRemaining: rows.reduce((sum, r) => sum + r.remainingBalance, 0),
      totalPreviousOutstanding: rows.reduce((sum, r) => sum + r.previousOutstanding, 0),
      totalAllOutstanding: rows.reduce((sum, r) => sum + r.totalOutstanding, 0),
      collectionRate: rows.reduce((sum, r) => sum + r.netPayable, 0) > 0 ? (rows.reduce((sum, r) => sum + r.amountPaid, 0) / rows.reduce((sum, r) => sum + r.netPayable, 0)) * 100 : 0,
    },
    students: rows,
  });
});

