import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { getTenantModels } from './TenantModelRegistry';

/**
 * Shared helpers for attendance + timetable:
 * context resolution, role scoping (teacher → assigned classes only,
 * student → own records only), date normalization.
 */

export type AuthedUser = {
  _id: string;
  role: string;
  roleId: string;
  studentId?: string;
  teacherId?: string;
  tenantId?: string;
  isPlatformAdmin?: boolean;
};

import { SCHOOL_TIMEZONE, getSchoolTodayISO } from '../utils/schoolDate';
export { SCHOOL_TIMEZONE, getSchoolTodayISO };

export function normalizeDate(value: Date | string): Date {
  const str = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) throw ApiError.badRequest('Invalid date value', 'INVALID_DATE');
  // Store as midnight UTC representation of the school calendar date
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function dayStart(d: Date | string): Date {
  return normalizeDate(d);
}

export function dayEnd(d: Date | string): Date {
  const start = normalizeDate(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  leave: number;
}

/** Standard attendance percentage formula shared across daily, monthly, and profile views. */
export function computeAttendanceRate(counts: AttendanceCounts): {
  attended: number;
  totalRecorded: number;
  attendanceRate: number;
} {
  const totalRecorded = counts.present + counts.late + counts.absent + counts.leave;
  const attended = counts.present + counts.late;
  const attendanceRate = totalRecorded > 0
    ? Math.round((attended / totalRecorded) * 1000) / 10
    : 0;
  return { attended, totalRecorded, attendanceRate };
}

/** Resolve and validate the session→class→optional-section chain for attendance. */
export async function resolveAttendanceContext(
  sessionId: string,
  classId: string,
  sectionId?: string | null,
  tenantId?: string | mongoose.Types.ObjectId,
  tenantDb?: mongoose.Connection
): Promise<{ session: any; cls: any; section: any }> {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required');
  const { AcademicSession, Class, Section } = getTenantModels(tenantDb);
  
  const qSession: Record<string, unknown> = { _id: sessionId };
  if (tenantId) qSession.tenantId = tenantId;
  const session = await AcademicSession.findOne(qSession);
  if (!session) throw ApiError.notFound('Academic session not found');
  if (session.isArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
  if (!session.isActive) throw ApiError.badRequest('Attendance can only be marked for the active academic session', 'SESSION_INACTIVE');

  const qClass: Record<string, unknown> = { _id: classId };
  if (tenantId) qClass.tenantId = tenantId;
  const cls = await Class.findOne(qClass);
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.isArchived) throw ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  let section: any = null;
  if (sectionId) {
    const qSection: Record<string, unknown> = { _id: sectionId };
    if (tenantId) qSection.tenantId = tenantId;
    section = await Section.findOne(qSection);
    if (!section) throw ApiError.notFound('Section not found');
    if (section.isArchived) throw ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
    if (String(section.classId) !== String(cls._id)) {
      throw ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
    }
  }

  return { session, cls, section };
}



import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { User } from '../models/User';

/** Resolve the student profile of the currently signed-in student user. */
export async function getOwnStudent(user: AuthedUser, tenantDb?: mongoose.Connection) {
  if (!tenantDb) throw new Error('Tenant DB required');
  const StudentModel = getTenantModels(tenantDb).Student;
  const student = await StudentModel.findOne({ userId: user._id, isArchived: false });
  if (!student) throw ApiError.forbidden('No active student profile is linked to this account', 'STUDENT_PROFILE_REQUIRED');
  return student;
}

/** Resolve the teacher profile of the currently signed-in teacher user. */
export async function getOwnTeacher(user: AuthedUser, tenantDb?: mongoose.Connection) {
  if (!tenantDb) throw new Error('Tenant DB required');
  const TeacherModel = getTenantModels(tenantDb).Teacher;
  const UserModel = getTenantModels(tenantDb).User;
  let teacher = await TeacherModel.findOne({ userId: user._id, isArchived: false });
  
  if (!teacher) {
    const userDoc = await UserModel.findById(user._id).select('email tenantId');
    if (userDoc && userDoc.email) {
      const matchQuery: Record<string, unknown> = {
        email: userDoc.email.trim().toLowerCase(),
        isArchived: false,
        isActive: true,
      };
      if (userDoc.tenantId) matchQuery.tenantId = userDoc.tenantId;
      
      const potentialMatches = await TeacherModel.find(matchQuery);
      
      // Auto-heal ONLY if there is exactly 1 match and it is not already linked to another user
      if (potentialMatches.length === 1 && !potentialMatches[0].userId) {
        teacher = potentialMatches[0];
        teacher.userId = new mongoose.Types.ObjectId(user._id);
        await teacher.save();
      }
    }
  }

  if (!teacher) throw ApiError.forbidden('No active teacher profile is linked to this account', 'TEACHER_PROFILE_REQUIRED');
  return teacher;
}

import { hasPermission } from './permission.service';

export async function authorizeAttendanceModification(user: AuthedUser, classId: string, attendanceDate: Date, tenantId: string | mongoose.Types.ObjectId, tenantDb: mongoose.Connection): Promise<void> {
  const { Class, TemporaryAssignment } = getTenantModels(tenantDb);

  // 1. Check if user has explicit attendance:manage permission (Admin/Principal)
  const canManage = await hasPermission(user.roleId, user.role, 'studentAttendance', 'create', tenantId as any, tenantDb);
  if (canManage) return;

  // If student or parent, deny immediately
  if (user.role === 'student' || user.role === 'parent') {
    throw ApiError.forbidden('Students and parents cannot mark attendance', 'ATTENDANCE_FORBIDDEN');
  }

  // 2. Resolve teacher
  const teacher = await getOwnTeacher(user, tenantDb);

  // 3. Is the user the permanent classTeacherId for this class?
  const cls = await Class.findOne({ _id: classId, tenantId });
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.classTeacherId && String(cls.classTeacherId) === String(teacher._id)) {
    return; // ALLOW
  }

  // 4. Is there an active TemporaryAssignment for this date?
  const startOfDay = normalizeDate(attendanceDate);
  const assignment = await TemporaryAssignment.findOne({
    classId: cls._id,
    substituteTeacherId: teacher._id,
    status: 'active',
    startDate: { $lte: startOfDay },
    endDate: { $gte: startOfDay }
  });

  if (assignment) {
    return; // ALLOW
  }

  throw ApiError.forbidden('You are not authorized to mark attendance for this class today. Only the Class Teacher, an active Substitute, or an Admin can modify attendance.', 'ATTENDANCE_NOT_AUTHORIZED');
}
