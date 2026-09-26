import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { StudentAttendance } from '../models/StudentAttendance';
import {
  getOwnStudent,
  getOwnTeacher,
  normalizeDate,
  type AuthedUser,
} from '../services/attendance.service';
import { AuthRequest } from '../types';
import { getSchoolMonthRange, getSchoolCurrentMonthISO } from '../utils/schoolDate';

/**
 * My-attendance — Prompt 8 (student/parent + teacher self-service).
 * Students see ONLY their own attendance (the signed-in user's linked profile).
 * Teachers see ONLY their own attendance.
 */

function localDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthBounds(month?: string) {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : getSchoolCurrentMonthISO();
  const { start, endExclusive } = getSchoolMonthRange(m);
  return { start, end: endExclusive };
}

function summarize(counts: Record<string, number>) {
  const total = (counts.present ?? 0) + (counts.absent ?? 0) + (counts.late ?? 0) + (counts.leave ?? 0);
  const presentDays = (counts.present ?? 0) + (counts.late ?? 0);
  const percentage = total > 0 ? Math.round((presentDays / total) * 1000) / 10 : 0;
  return {
    total,
    present: counts.present ?? 0,
    absent: counts.absent ?? 0,
    late: counts.late ?? 0,
    leave: counts.leave ?? 0,
    percentage,
  };
}

/** GET /api/my-attendance — own student attendance, month-scoped, with summary. */
export const studentMyAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getOwnStudent(req.user as unknown as AuthedUser, req.tenantDb as mongoose.Connection);

  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : undefined;
  const { start, end } = monthBounds(month);
  const filter = { studentId: student._id, attendanceDate: { $gte: start, $lt: end } };

  const [records, summary] = await Promise.all([
    StudentAttendance.find(filter).sort({ attendanceDate: -1 }).lean(),
    StudentAttendance.aggregate([{ $match: { studentId: student._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts: Record<string, number> = {};
  for (const row of summary) counts[String(row._id)] = row.count;

  ok(res, {
    student: {
      studentId: String(student._id),
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
    },
    month: month ?? localDateOnly(new Date()).slice(0, 7),
    summary: summarize(counts),
    records: records.map((record) => ({
      attendanceDate: normalizeDate(record.attendanceDate).toISOString().slice(0, 10),
      status: record.status,
    })),
  });
});

/** GET /api/my-attendance/teacher — own teacher attendance, month-scoped, with summary. */
export const teacherMyAttendance = asyncHandler(async (req: AuthRequest & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher } = getTenantModels(tenantDb);
  const teacher = await getOwnTeacher(req.user as unknown as AuthedUser, tenantDb);

  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : undefined;
  const { start, end } = monthBounds(month);
  const filter = { teacherId: teacher._id, attendanceDate: { $gte: start, $lt: end } };

  const [records, summary] = await Promise.all([
    TeacherAttendance.find(filter).sort({ attendanceDate: -1 }).lean(),
    TeacherAttendance.aggregate([{ $match: { teacherId: teacher._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts: Record<string, number> = {};
  for (const row of summary) counts[String(row._id)] = row.count;

  ok(res, {
    teacher: { teacherId: String(teacher._id), fullName: teacher.fullName, employeeId: teacher.employeeId },
    month: month ?? localDateOnly(new Date()).slice(0, 7),
    summary: summarize(counts),
    records: records.map((record: any) => ({
      attendanceDate: normalizeDate(record.attendanceDate).toISOString().slice(0, 10),
      status: record.status,
    })),
  });
});
