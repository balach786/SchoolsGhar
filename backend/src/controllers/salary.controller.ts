import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated, ok, created } from '../utils/apiResponse';
import { publicSalaryRecord } from '../models/SalaryRecord';
import { getTenantModels } from '../services/TenantModelRegistry';
import { createSalaryRecord } from '../services/finance.service';
import type { AuthedUser } from '../services/finance.service';
import mongoose from 'mongoose';
import { recordAudit, recordAuditWithSession } from '../services/audit.service';
import { sendCsv, wantsCsv } from '../utils/csv';
import { AuthRequest } from '../types';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { acquireIdempotency, completeIdempotency, releaseIdempotency } from '../services/idempotency.service';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

async function resolveStaff(req: AuthRequest, docs: any[]) {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Staff } = getTenantModels(tenantDb);
  
  const ids = Array.from(new Set(docs.map((d) => d.staffId).filter(Boolean).map((v: unknown) => String(v))));
  const staff = await Staff.find(scopeQuery(req, { _id: { $in: ids } })).select('fullName employeeId staffType designation').lean();
  return new Map(staff.map((s) => [String(s._id), s]));
}

function withStaff(d: any, map: Map<string, any>) {
  const s = map.get(String(d.staffId));
  return {
    ...publicSalaryRecord(d),
    staffName: s?.fullName ?? '—',
    employeeId: s?.employeeId ?? '—',
    staffType: s?.staffType ?? '—',
    designation: s?.designation ?? '—',
  };
}

/** GET /api/salaries — salaries.view gate on the route; values visible only here. */
export const listSalaries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { SalaryRecord, Staff } = getTenantModels(tenantDb);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  let filter: Record<string, any> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.month) filter.salaryMonth = req.query.month;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matched = await Staff.find(scopeQuery(req, { $or: [{ fullName: rx }, { employeeId: rx }] })).select('_id').lean();
    filter.staffId = { $in: matched.map((m) => m._id) };
  }

  filter = scopeQuery(req, filter);

  const [docs, total] = await Promise.all([
    SalaryRecord.find(filter).sort({ salaryMonth: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    SalaryRecord.countDocuments(filter),
  ]);
  const staffMap = await resolveStaff(req, docs);

  if (wantsCsv(req)) {
    return sendCsv(
      res,
      `salaries-${new Date().toISOString().slice(0, 7)}.csv`,
      ['Month', 'Staff', 'Employee ID', 'Type', 'Designation', 'Base (PKR)', 'Adjustment (PKR)', 'Net (PKR)', 'Status', 'Payment Date'],
      docs.map((d) => [
        d.salaryMonth,
        staffMap.get(String(d.staffId))?.fullName ?? '—',
        staffMap.get(String(d.staffId))?.employeeId ?? '—',
        staffMap.get(String(d.staffId))?.staffType ?? '—',
        staffMap.get(String(d.staffId))?.designation ?? '—',
        (d.baseAmount / 100).toFixed(2),
        ((d.adjustmentAmount ?? 0) / 100).toFixed(2),
        (d.netAmount / 100).toFixed(2),
        d.status,
        d.paymentDate ? new Date(d.paymentDate).toISOString().slice(0, 10) : '',
      ])
    );
  }

  paginated(res, {
    data: docs.map((d) => withStaff(d, staffMap)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** GET /api/salaries/:id */
export const getSalary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { SalaryRecord } = getTenantModels(tenantDb);

  const doc = await SalaryRecord.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Salary record not found');
  const map = await resolveStaff(req, [doc]);
  ok(res, withStaff(doc, map));
});

/** POST /api/salaries */
export const createSalary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  const doc = await createSalaryRecord(req.user as unknown as AuthedUser, req.body, tenantId, tenantDb);
  recordAudit('salaries', 'SALARY_CREATED', req.user, String(doc._id), {
    staffId: String(doc.staffId),
    salaryMonth: doc.salaryMonth,
    netAmount: doc.netAmount,
  });
  created(res, publicSalaryRecord(doc as never), { message: 'Salary record created' });
});

/** PATCH /api/salaries/:id — adjustment before payment. */
export const updateSalary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { SalaryRecord } = getTenantModels(tenantDb);

  const doc = await SalaryRecord.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Salary record not found');
  if (doc.status === 'paid') throw ApiError.badRequest('Paid salary records cannot be edited', 'SALARY_PAID_LOCKED');

  const beforeNet = doc.netAmount;
  if (req.body.baseAmount !== undefined) doc.baseAmount = req.body.baseAmount;
  if (req.body.adjustmentAmount !== undefined) doc.adjustmentAmount = req.body.adjustmentAmount;
  if (req.body.notes !== undefined) doc.notes = req.body.notes;
  if (req.body.bonusAmount !== undefined) {
    if (!Number.isInteger(req.body.bonusAmount) || req.body.bonusAmount < 0) {
      throw ApiError.unprocessable('Bonus amount must be a non-negative integer (paisa)', 'INVALID_BONUS');
    }
    doc.bonusAmount = req.body.bonusAmount;
  }
  if (req.body.bonusReason !== undefined) doc.bonusReason = req.body.bonusReason;

  doc.netAmount = doc.baseAmount + (doc.adjustmentAmount ?? 0) + (doc.bonusAmount ?? 0);
  if (doc.netAmount < 0) throw ApiError.unprocessable('Net salary cannot be negative', 'INVALID_SALARY');
  await doc.save();

  recordAudit('salaries', 'SALARY_UPDATED', req.user, String(doc._id), {
    staffId: String(doc.staffId),
    salaryMonth: doc.salaryMonth,
    beforeNetAmount: beforeNet,
    netAmount: doc.netAmount,
  });

  ok(res, publicSalaryRecord(doc as never), 200, { message: 'Salary record updated' });
});

/** POST /api/salaries/:id/mark-paid — atomic state transition with idempotency */
export const markSalaryPaid = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { SalaryRecord } = getTenantModels(tenantDb);

  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
  const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();

  // Idempotency check
  const idempotency = await acquireIdempotency(
    tenantId,
    'salary_paid',
    idempotencyKey,
    { salaryRecordId: req.params.id, paymentMethod: req.body.paymentMethod, notes: req.body.notes }
  );
  if (idempotency.isCached && idempotency.cachedResponse) {
    return ok(res, idempotency.cachedResponse.body, idempotency.cachedResponse.status);
  }

  const session = await mongoose.startSession();
  let responseBody: any;
  try {
    await session.withTransaction(async () => {
      // Atomic state transition: only transitions if status is currently 'unpaid'
      const updated = await SalaryRecord.findOneAndUpdate(
        scopeQuery(req, { _id: req.params.id, status: 'unpaid' }),
        {
          $set: {
            status: 'paid',
            paymentDate,
            paymentMethod: req.body.paymentMethod || undefined,
            notes: req.body.notes || undefined,
          },
        },
        { new: true, session }
      );

      if (!updated) {
        const existing = await SalaryRecord.findOne(scopeQuery(req, { _id: req.params.id })).session(session);
        if (!existing) throw ApiError.notFound('Salary record not found');
        throw ApiError.conflict('Salary is already marked paid', 'SALARY_ALREADY_PAID');
      }

      await recordAuditWithSession(
        'salaries',
        'SALARY_PAID',
        req.user,
        String(updated._id),
        {
          staffId: String(updated.staffId),
          salaryMonth: updated.salaryMonth,
          netAmount: updated.netAmount,
        },
        session,
        'tenant',
        tenantId
      );

      responseBody = publicSalaryRecord(updated as never);

      // Commit completed idempotency outcome inside the SAME MongoDB ClientSession transaction
      await completeIdempotency(
        idempotency.recordKey,
        { salaryRecordId: String(updated._id) },
        200,
        responseBody,
        session,
        idempotency.ownerToken
      );
    });

    ok(res, responseBody, 200, { message: 'Salary marked as paid' });
  } catch (err) {
    await releaseIdempotency(idempotency.recordKey, idempotency.ownerToken);
    throw err;
  } finally {
    idempotency.stopHeartbeat?.();
    await session.endSession();
  }
});

/**
 * Helper to compute teacher attendance counts and absent deductions for a month.
 * Deduction applies ONLY for absent days, as required.
 */
async function computeAttendanceDeduction(
  req: Request,
  tenantDb: mongoose.Connection,
  staff: { _id: mongoose.Types.ObjectId | string, staffType: string },
  salaryMonth: string,
  baseSalary: number,
  customWorkingDays?: number
) {
  const { SchoolClosure, TeacherAttendance, NonTeachingStaffAttendance } = getTenantModels(tenantDb);

  const [yearStr, monthStr] = salaryMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Fetch closures / official leave days for staff this month
  const closures = await SchoolClosure.find(
    scopeQuery(req, {
      dateString: { $regex: `^${salaryMonth}-` },
      applicableTo: { $in: ['all', 'staff'] },
    })
  ).lean();
  const closureMap = new Map(closures.map((c) => [c.dateString, c]));

  let totalSundays = 0;
  let totalOfficialLeaves = 0;
  let totalSchoolClosed = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateString = `${salaryMonth}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(Date.UTC(year, monthNum - 1, d, 12, 0, 0));
    const isSunday = dayDate.getUTCDay() === 0;
    if (isSunday) totalSundays++;

    const closure = closureMap.get(dateString);
    if (closure?.type === 'official_leave' && !isSunday) totalOfficialLeaves++;
    if (closure?.type === 'school_closed' && !isSunday) totalSchoolClosed++;
  }

  const netWorkingDays = Math.max(0, daysInMonth - totalSundays - totalOfficialLeaves - totalSchoolClosed);
  const workingDays = customWorkingDays && customWorkingDays > 0
    ? customWorkingDays
    : (netWorkingDays > 0 ? netWorkingDays : 30);

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, monthNum - 1, daysInMonth, 23, 59, 59, 999));

  const attRecords = staff.staffType === 'teaching'
    ? await TeacherAttendance.find(scopeQuery(req, { teacherId: staff._id, attendanceDate: { $gte: startDate, $lte: endDate } })).lean()
    : await NonTeachingStaffAttendance.find(scopeQuery(req, { staffId: staff._id, attendanceDate: { $gte: startDate, $lte: endDate } })).lean();

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let leaveCount = 0;

  for (const r of attRecords) {
    const dStr = new Date(r.attendanceDate).toISOString().slice(0, 10);
    const closure = closureMap.get(dStr);
    const dayDate = new Date(r.attendanceDate);
    const isSunday = dayDate.getUTCDay() === 0;

    // If day is closed/official leave or Sunday, do NOT count as absent!
    if (closure || isSunday) {
      continue;
    }

    if (r.status === 'present') presentCount++;
    else if (r.status === 'absent') absentCount++;
    else if (r.status === 'late') lateCount++;
    else if (r.status === 'leave') leaveCount++;
  }

  const dailyRate = workingDays > 0 ? Math.round(baseSalary / workingDays) : 0;
  // User rule: "Dedication should be only for the absent days."
  const deductionAmount = absentCount * dailyRate;
  const netAmount = Math.max(0, baseSalary - deductionAmount);

  return {
    daysInMonth,
    workingDays,
    netWorkingDays,
    totalOfficialLeaves,
    totalSchoolClosed,
    presentCount,
    absentCount,
    lateCount,
    leaveCount,
    totalRecorded: attRecords.length,
    dailyRate,
    deductionAmount,
    adjustmentAmount: -deductionAmount,
    netAmount,
  };
}

/** GET /api/salaries/calculate — preview attendance and auto-deduction for a teacher and month. */
export const calculateSalaryFromAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Staff, SalaryRecord } = getTenantModels(tenantDb);

  const staffId = req.query.staffId as string || req.query.teacherId as string;
  const salaryMonth = req.query.salaryMonth as string;
  const workingDays = req.query.workingDays ? Number(req.query.workingDays) : undefined;

  if (!staffId || !salaryMonth) {
    throw ApiError.badRequest('staffId and salaryMonth are required');
  }

  const staff = await Staff.findOne(scopeQuery(req, { _id: staffId, isArchived: false })).lean();
  if (!staff) throw ApiError.notFound('Staff member not found');

  const baseSalary = staff.salary ?? 0;
  const calc = await computeAttendanceDeduction(req, tenantDb, staff, salaryMonth, baseSalary, workingDays);

  const existing = await SalaryRecord.findOne(scopeQuery(req, { staffId, salaryMonth })).select('_id status').lean();

  ok(res, {
    staffId: String(staff._id),
    staffName: staff.fullName,
    employeeId: staff.employeeId,
    staffType: staff.staffType,
    designation: staff.designation,
    salaryMonth,
    baseAmount: baseSalary,
    workingDays: calc.workingDays,
    daysInMonth: calc.daysInMonth,
    dailyRate: calc.dailyRate,
    presentDays: calc.presentCount,
    absentDays: calc.absentCount,
    lateDays: calc.lateCount,
    leaveDays: calc.leaveCount,
    totalRecordedDays: calc.totalRecorded,
    deductionAmount: calc.deductionAmount,
    adjustmentAmount: calc.adjustmentAmount,
    netAmount: calc.netAmount,
    existingRecord: existing ? { _id: String(existing._id), status: existing.status } : null,
    notes: calc.absentCount > 0
      ? `Auto-calculated: ${calc.absentCount} absent day(s) deducted @ PKR ${(calc.dailyRate / 100).toFixed(2)}/day`
      : 'Auto-calculated: Full attendance (0 absent days)',
  });
});

/** POST /api/salaries/auto-generate — bulk create/update staff salaries based on monthly attendance absent days. */
export const autoGenerateSalariesFromAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession, Staff, SalaryRecord } = getTenantModels(tenantDb);

  const { sessionId, salaryMonth, workingDays, overwriteExisting } = req.body;
  if (!sessionId || !salaryMonth) {
    throw ApiError.badRequest('sessionId and salaryMonth are required');
  }

  const session = await AcademicSession.findOne(scopeQuery(req, { _id: sessionId }));
  if (!session) throw ApiError.notFound('Academic session not found');

  const staffList = await Staff.find(scopeQuery(req, { isArchived: false, isActive: true, salary: { $gt: 0 } }))
    .select('fullName employeeId salary staffType designation')
    .lean();

  const tenantId = getTenantObjectId(req);
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const s of staffList) {
    const baseSalary = s.salary ?? 0;
    const calc = await computeAttendanceDeduction(req, tenantDb, s, salaryMonth, baseSalary, workingDays);

    const existing = await SalaryRecord.findOne(scopeQuery(req, {
      staffId: s._id,
      salaryMonth,
    }));

    if (existing) {
      if (existing.status === 'paid' || !overwriteExisting) {
        skippedCount++;
        continue;
      }
      // Overwrite unpaid record
      existing.baseAmount = baseSalary;
      existing.adjustmentAmount = calc.adjustmentAmount;
      existing.netAmount = calc.netAmount;
      existing.absentDays = calc.absentCount;
      existing.notes = `Auto-calculated from attendance: ${calc.absentCount} absent day(s) deducted (-PKR ${(calc.deductionAmount / 100).toFixed(2)})`;
      await existing.save();
      updatedCount++;
      totalDeductions += calc.deductionAmount;
      totalNet += calc.netAmount;
    } else {
      await SalaryRecord.create({
        tenantId,
        staffId: s._id,
        sessionId,
        salaryMonth,
        baseAmount: baseSalary,
        adjustmentAmount: calc.adjustmentAmount,
        netAmount: calc.netAmount,
        absentDays: calc.absentCount,
        status: 'unpaid',
        notes: `Auto-calculated from attendance: ${calc.absentCount} absent day(s) deducted (-PKR ${(calc.deductionAmount / 100).toFixed(2)})`,
      });
      createdCount++;
      totalDeductions += calc.deductionAmount;
      totalNet += calc.netAmount;
    }
  }

  recordAudit('salaries', 'SALARIES_AUTO_GENERATED', req.user, String(sessionId), {
    salaryMonth,
    createdCount,
    updatedCount,
    skippedCount,
    totalDeductions,
    totalNet,
  });

  ok(res, {
    message: `Generated ${createdCount} salary records, updated ${updatedCount}, skipped ${skippedCount}`,
    createdCount,
    updatedCount,
    skippedCount,
    totalStaff: staffList.length,
    totalDeductions,
    totalNet,
    salaryMonth,
  });
});

