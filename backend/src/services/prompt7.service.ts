import { ApiError } from '../utils/ApiError';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { Teacher } from '../models/Teacher';
import { Student } from '../models/Student';
import { Assignment } from '../models/Assignment';
import { Notice } from '../models/Notice';
import { LeaveRequest } from '../models/LeaveRequest';
import { Notification } from '../models/Notification';
import { getOwnStudent, getOwnTeacher, type AuthedUser } from './attendance.service';
import { notify, NOTIFICATION_TYPES } from './notification.service';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';

/**
 * Prompt 7 service — assignments, submissions, notices, leave, notifications.
 * Privacy rules live here (never trust the client for ownership decisions).
 */

const OWNER_ROLES = ['super_admin', 'admin'];



export async function resolveAssignmentScope(user: AuthedUser, tenantDb: mongoose.Connection): Promise<Record<string, any>> {
  if (user.role !== 'student') return {};
  const student = await getOwnStudent(user, tenantDb);
  const base = { classId: String(student.classId) } as Record<string, any>;
  if (student.sectionId) base.$or = [{ sectionId: null }, { sectionId: String(student.sectionId) }];
  return base;
}

/** Notify all users linked to students of a class (+ section filter) about a new assignment. */
export function notifyAssignmentCreated(assignment: { _id: unknown; title: string; classId: unknown; sectionId?: unknown }, tenantDb: mongoose.Connection) {
  const { Student } = getTenantModels(tenantDb);
  const fire = async () => {
    try {
      const filter: Record<string, unknown> = { classId: assignment.classId, isArchived: false, userId: { $exists: true, $ne: null } };
      if (assignment.sectionId) filter.sectionId = assignment.sectionId;
      const linked = await Student.find(filter).select('userId').lean();
      for (const s of linked) {
        notify(tenantDb, {
          userId: s.userId as never,
          type: NOTIFICATION_TYPES.NEW_ASSIGNMENT,
          title: 'New assignment',
          message: `"${assignment.title}" has been posted.`,
          referenceType: 'assignment',
          referenceId: assignment._id as never,
        });
      }
    } catch (err) {
      logger.warn('Assignment notification scan failed', err instanceof Error ? err.message : 'unknown');
    }
  };
  fire();
}

/** Notify targeted audience for a notice. */
export function notifyNoticeCreated(notice: {
  _id: unknown;
  title: string;
  audienceType: string;
  classId?: unknown;
  sectionId?: unknown;
}, tenantDb: mongoose.Connection) {
  const { Student, User } = getTenantModels(tenantDb);
  const fire = async () => {
    try {
      let userFilter: Record<string, unknown> = {};
      if (notice.audienceType === 'teachers') userFilter = { role: 'teacher' };
      else if (notice.audienceType === 'school') userFilter = {};
      else {
        const studentFilter: Record<string, unknown> = { isArchived: false, userId: { $exists: true, $ne: null } };
        if (notice.audienceType === 'class' && notice.classId) studentFilter.classId = notice.classId;
        if (notice.audienceType === 'section' && notice.sectionId) studentFilter.sectionId = notice.sectionId;
        if (notice.audienceType === 'students') studentFilter.sessionId = { $ne: null };
        const linked = await Student.find(studentFilter).select('userId').limit(500).lean();
        for (const s of linked) {
          notify(tenantDb, {
            userId: s.userId as never,
            type: NOTIFICATION_TYPES.NEW_NOTICE,
            title: 'New notice',
            message: notice.title,
            referenceType: 'notice',
            referenceId: notice._id as never,
          });
        }
        return;
      }
      const users = await User.find({ ...userFilter, isActive: true }).select('_id').limit(500).lean();
      for (const u of users) {
        notify(tenantDb, {
          userId: u._id as never,
          type: NOTIFICATION_TYPES.NEW_NOTICE,
          title: 'New notice',
          message: notice.title,
          referenceType: 'notice',
          referenceId: notice._id as never,
        });
      }
    } catch (err) {
      logger.warn('Notice notification scan failed', err instanceof Error ? err.message : 'unknown');
    }
  };
  fire();
}

/** Fire-and-forget LEAVE_APPROVED / LEAVE_REJECTED to the requester's linked user. */
export function notifyLeaveReviewed(leave: {
  requesterType: string;
  requesterId: unknown;
  status: string;
}, tenantDb: mongoose.Connection) {
  const { Student, Teacher } = getTenantModels(tenantDb);
  const fire = async () => {
    try {
      const userId = leave.requesterType === 'student'
        ? (await Student.findById(leave.requesterId).select('userId').lean())?.userId
        : (await Teacher.findById(leave.requesterId).select('userId').lean())?.userId;
      if (!userId) return;
      const approved = leave.status === 'approved';
      notify(tenantDb, {
        userId: userId as never,
        type: approved ? NOTIFICATION_TYPES.LEAVE_APPROVED : NOTIFICATION_TYPES.LEAVE_REJECTED,
        title: approved ? 'Leave approved' : 'Leave rejected',
        message: approved ? 'Your leave request was approved.' : 'Your leave request was rejected.',
        referenceType: 'leaveRequest',
        referenceId: leave.requesterId as never,
      });
    } catch (err) {
      logger.warn('Leave notification failed', err instanceof Error ? err.message : 'unknown');
    }
  };
  fire();
}

/** Resolve names for assignment list rows (class/section/subject/teacher). */
export async function resolveAssignmentNames(docs: any[]) {
  const ids = (key: string) => Array.from(new Set(docs.map((d) => d[key]).filter(Boolean).map((v: unknown) => String(v))));
  const [classes, sections, subjects, teachers] = await Promise.all([
    Class.find({ _id: { $in: ids('classId') } }).select('name').lean(),
    Section.find({ _id: { $in: ids('sectionId') } }).select('name').lean(),
    Subject.find({ _id: { $in: ids('subjectId') } }).select('name code').lean(),
    Teacher.find({ _id: { $in: ids('teacherId') } }).select('fullName').lean(),
  ]);
  return {
    classMap: new Map(classes.map((c) => [String(c._id), c.name])),
    sectionMap: new Map(sections.map((s) => [String(s._id), s.name])),
    subjectMap: new Map(subjects.map((s) => [String(s._id), `${s.name} (${s.code})`])),
    teacherMap: new Map(teachers.map((t) => [String(t._id), t.fullName])),
  };
}

export function publicAssignment(a: any, names?: any) {
  return {
    _id: String(a._id),
    title: a.title,
    description: a.description ?? null,
    classId: String(a.classId),
    sectionId: a.sectionId ? String(a.sectionId) : null,
    subjectId: a.subjectId ? String(a.subjectId) : null,
    teacherId: a.teacherId ? String(a.teacherId) : null,
    dueDate: a.dueDate ? new Date(a.dueDate).toISOString() : null,
    maxMarks: a.maxMarks ?? null,
    attachments: (a.attachments ?? []).map((f: any) => ({ name: f.name, url: f.url, mimeType: f.mimeType ?? null })),
    isArchived: Boolean(a.isArchived),
    createdAt: a.createdAt,
    ...(names
      ? {
          className: names.classMap.get(String(a.classId)) ?? '—',
          sectionName: a.sectionId ? names.sectionMap.get(String(a.sectionId)) ?? '—' : null,
          subjectName: a.subjectId ? names.subjectMap.get(String(a.subjectId)) ?? '—' : null,
          teacherName: names.teacherMap.get(String(a.teacherId)) ?? '—',
        }
      : {}),
  };
}

/** Notice visibility filter for the requesting user. */
export async function resolveNoticeScope(user: AuthedUser, tenantDb: mongoose.Connection): Promise<Record<string, any>> {
  const authUser = user as any;
  const canManageNotices = authUser.isPlatformAdmin || (authUser.permissions?.['notices']?.some((a: string) => ['create', 'edit', 'archive'].includes(a)));

  const now = new Date();
  const notExpired = { $or: [{ expiresAt: { $gte: now } }, { expiresAt: null }] };
  
  if (canManageNotices) {
    return { isArchived: false, ...notExpired };
  }
  if (user.role === 'teacher') {
    return { isArchived: false, audienceType: { $in: ['school', 'teachers'] }, ...notExpired };
  }
  if (user.role === 'student') {
    const student = await getOwnStudent(user, tenantDb);
    return {
      isArchived: false,
      $and: [
        {
          $or: [
            { audienceType: 'school' },
            { audienceType: 'students' },
            { audienceType: 'class', classId: student.classId },
            { audienceType: 'section', sectionId: student.sectionId },
          ],
        },
        { $or: [{ expiresAt: { $gte: now } }, { expiresAt: null }] },
      ],
    };
  }
  // Other staff roles (accountant, receptionist, …): school-wide notices only.
  return { isArchived: false, audienceType: 'school', ...notExpired };
}

export async function resolveLeaveScope(user: AuthedUser, requestedRequesterId?: string, tenantDb?: mongoose.Connection): Promise<Record<string, any>> {
  if (OWNER_ROLES.includes(user.role)) {
    const filter: Record<string, any> = {};
    if (requestedRequesterId) filter.requesterId = requestedRequesterId;
    return filter;
  }
  if (!tenantDb) {
    throw new Error('Tenant DB is required for resolveLeaveScope');
  }
  // Teachers and students only ever see their own requests.
  const ownId = user.role === 'teacher'
    ? String((await getOwnTeacher(user, tenantDb))._id)
    : String((await getOwnStudent(user, tenantDb))._id);
  return { requesterId: ownId };
}

export function publicLeave(l: any, names?: { requesterName?: string }) {
  return {
    _id: String(l._id),
    requesterType: l.requesterType,
    requesterId: String(l.requesterId),
    fromDate: new Date(l.fromDate).toISOString().slice(0, 10),
    toDate: new Date(l.toDate).toISOString().slice(0, 10),
    reason: l.reason,
    status: l.status,
    reviewNote: l.reviewNote ?? null,
    reviewedAt: l.reviewedAt ?? null,
    createdAt: l.createdAt,
    ...(names?.requesterName ? { requesterName: names.requesterName } : {}),
  };
}

export function publicNotification(n: any) {
  return {
    _id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message,
    referenceType: n.referenceType ?? null,
    referenceId: n.referenceId ? String(n.referenceId) : null,
    isRead: Boolean(n.isRead),
    createdAt: n.createdAt,
    readAt: n.readAt ?? null,
  };
}

/** Compact notification retention: remove read notifications older than N days (explicit admin command only). */
export async function cleanupNotifications(tenantDb: mongoose.Connection, olderThanDays = 90): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
  const { Notification } = getTenantModels(tenantDb);
  const result = await Notification.deleteMany({ isRead: true, createdAt: { $lt: cutoff } });
  return { deleted: result.deletedCount ?? 0 };
}
