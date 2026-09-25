import { getTenantModels } from './TenantModelRegistry';
import { AcademicSession, IAcademicSession, normalizeSessionName, publicSession } from '../models/AcademicSession';
import { Class, IClass, publicClass } from '../models/Class';
import { Section, ISection, publicSection } from '../models/Section';
import { Subject, ISubject, publicSubject } from '../models/Subject';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { User } from '../models/User';
import { Role } from '../models/Role';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { Staff } from '../models/Staff';

/**
 * Shared validators used across the academic module:
 * resolve entities and verify relationships (class→session, section→class, etc.)
 */

export async function requireSession(
  id: string,
  allowArchived = false,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {
    const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  let q = models.AcademicSession.findOne(query);
  if (mongoSession) q = q.session(mongoSession);
  const doc = await q;
  if (!doc) throw ApiError.notFound('Academic session not found');
  if (doc.isArchived && !allowArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
  return doc;
}

export async function requireClass(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {
    const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  let q = models.Class.findOne(query);
  if (mongoSession) q = q.session(mongoSession);
  const doc = await q;
  if (!doc) throw ApiError.notFound('Class not found');
  if (doc.isArchived) throw ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
  return doc;
}

export async function requireSection(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {
    const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  let q = models.Section.findOne(query);
  if (mongoSession) q = q.session(mongoSession);
  const doc = await q;
  if (!doc) throw ApiError.notFound('Section not found');
  if (doc.isArchived) throw ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
  return doc;
}

/** Section must belong to the given class. */
export async function requireSectionOfClass(
  sectionId: string,
  classId: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {
  const section = await requireSection(sectionId, tenantId, mongoSession, tenantDb);
  if (String(section.classId) !== String(classId)) {
    throw ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
  }
  return section;
}

/** Centralized teaching staff validation (Step 4B.7) */
export async function requireTeachingStaff(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  allowInactive = false,
  tenantDb?: mongoose.Connection
) {
    const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  const staff = await models.Staff.findOne(query);
  if (!staff) throw ApiError.notFound('Staff member not found');
  if (staff.isArchived) throw ApiError.badRequest('Staff member is archived', 'STAFF_ARCHIVED');
  if (!staff.isActive && !allowInactive) throw ApiError.badRequest('Staff member is inactive', 'STAFF_INACTIVE');
  if (staff.staffType !== 'teaching') {
    throw ApiError.badRequest('Only teaching staff can be assigned to classes or subjects', 'INVALID_STAFF_TYPE');
  }
  return staff;
}

export async function requireTeacher(id: string, allowInactive = false, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {
  return requireTeachingStaff(id, tenantId, allowInactive, tenantDb);
}

export async function requireSubject(id: string, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {
    const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  const doc = await models.Subject.findOne(query);
  if (!doc) throw ApiError.notFound('Subject not found');
  if (doc.isArchived) throw ApiError.badRequest('Subject is archived', 'SUBJECT_ARCHIVED');
  return doc;
}

/** Verify a list of ids exist (compact existence check). */
export async function ensureAllExist(model: mongoose.Model<mongoose.Document>, ids: string[], label: string) {
  if (!ids.length) return;
  const unique = Array.from(new Set(ids));
  const count = await model.countDocuments({ _id: { $in: unique } });
  if (count !== unique.length) throw ApiError.badRequest(`One or more ${label} do not exist`, 'INVALID_REFERENCE');
}

/** Verify classes all belong to a session and exist. */
export async function ensureClassesInSession(classIds: string[], sessionId: string, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {
    if (!classIds.length) return;
  const unique = Array.from(new Set(classIds));
  const query: Record<string, unknown> = { _id: { $in: unique } };
  if (tenantId) query.tenantId = tenantId;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  const docs = await models.Class.find(query).select('sessionId isArchived').lean();
  if (docs.length !== unique.length) throw ApiError.badRequest('One or more classes do not exist', 'INVALID_REFERENCE');
  for (const d of docs) {
    if (d.isArchived) {
      throw ApiError.badRequest('Cannot assign archived class', 'CLASS_ARCHIVED');
    }
    if (String(d.sessionId) !== String(sessionId)) {
      throw ApiError.badRequest('One or more classes belong to a different session', 'INVALID_CLASS_SESSION');
    }
  }
}

/** Verify subjects belong to a session and (if given) to a class. */
export async function ensureSubjectsInSession(subjectIds: string[], sessionId: string, classId?: string, tenantDb?: mongoose.Connection) {
    if (!subjectIds.length) return;
  const unique = Array.from(new Set(subjectIds));
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  const docs = await models.Subject.find({ _id: { $in: unique } }).select('sessionId classIds').lean();
  if (docs.length !== unique.length) throw ApiError.badRequest('One or more subjects do not exist', 'INVALID_REFERENCE');
  for (const d of docs) {
    if (String(d.sessionId) !== String(sessionId)) {
      throw ApiError.badRequest('One or more subjects belong to a different session', 'INVALID_SUBJECT_SESSION');
    }
    if (classId && d.classIds?.length && !d.classIds.map(String).includes(String(classId))) {
      throw ApiError.badRequest('One or more subjects are not assigned to this class', 'INVALID_SUBJECT_CLASS');
    }
  }
}

/**
 * Validate an optional userId link for a student/teacher profile:
 * the user must exist, have the expected role, and not already be
 * linked to another profile of that kind.
 */
export async function requireUserLink(
  userId: string | null | undefined,
  expectedRole: 'student' | 'teacher' | 'staff' | string,
  excludeProfileId?: string,
  tenantId?: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<mongoose.Types.ObjectId | undefined> {
  if (!userId) return undefined;
  if (!tenantDb) throw new Error('Tenant DB required');
  const models = getTenantModels(tenantDb);
  const query: Record<string, unknown> = { _id: userId };
  if (tenantId) query.tenantId = tenantId;
  let userQuery = models.User.findOne(query).select('roleId tenantId');
  if (session) userQuery = userQuery.session(session);
  const user = await userQuery.lean();
  if (!user) throw ApiError.badRequest('Linked user account does not exist', 'USER_NOT_FOUND');

  if (tenantId && user.tenantId && String(user.tenantId) !== String(tenantId)) {
    throw ApiError.badRequest('Linked user belongs to a different school tenant', 'USER_TENANT_MISMATCH');
  }

  let roleQuery = models.Role.findById(user.roleId).select('slug');
  if (session) roleQuery = roleQuery.session(session);
  const role = await roleQuery.lean();
  if (!role) throw ApiError.badRequest('Role for linked user does not exist', 'ROLE_NOT_FOUND');

  // Role compatibility check
  if (expectedRole === 'student') {
    if (role.slug !== 'student') {
      throw ApiError.badRequest('Linked user must have the student role', 'USER_ROLE_MISMATCH');
    }
  } else if (expectedRole === 'teacher') {
    if (role.slug !== 'teacher' && role.slug !== 'admin') {
      throw ApiError.badRequest('Linked user must have the teacher or admin role', 'USER_ROLE_MISMATCH');
    }
  } else {
    // Non-teaching Staff (receptionist, accountant, admin, etc.)
    const validStaffRoles = ['admin', 'super_admin', 'accountant', 'receptionist', expectedRole];
    if (!validStaffRoles.includes(role.slug)) {
      throw ApiError.badRequest(
        `Linked user role (${role.slug}) is not compatible with staff profile`,
        'USER_ROLE_MISMATCH'
      );
    }
  }

  // Cross-collection uniqueness: check BOTH Student and Staff (which includes Teacher discriminator)
  let studentCheck = models.Student.findOne({
    userId,
    ...(excludeProfileId ? { _id: { $ne: excludeProfileId } } : {}),
  }).select('_id');
  if (session) studentCheck = studentCheck.session(session);
  const takenStudent = await studentCheck.lean();
  if (takenStudent) {
    throw ApiError.conflict('This user account is already linked to another student profile', 'USER_ALREADY_LINKED');
  }

  let staffCheck = models.Staff.findOne({
    userId,
    ...(excludeProfileId ? { _id: { $ne: excludeProfileId } } : {}),
  }).select('_id');
  if (session) staffCheck = staffCheck.session(session);
  const takenStaff = await staffCheck.lean();
  if (takenStaff) {
    throw ApiError.conflict('This user account is already linked to another staff profile', 'USER_ALREADY_LINKED');
  }

  return new mongoose.Types.ObjectId(userId);
}

/**
 * Executes a profile link operation inside a MongoDB transaction with exclusive User-document serialization.
 * Ensures concurrent link attempts for the same userId cannot race across collections.
 */
export async function withUserLinkLock<T>(
  userId: string | null | undefined,
  fn: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  if (!userId) {
    return await fn();
  }
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      await User.updateOne({ _id: userId }, { $inc: { linkSeq: 1 } }, { session });
      result = await fn(session);
    });
    return result!;
  } catch (err: any) {
    if (
      err?.message?.includes('does not support retryable writes') ||
      err?.message?.includes('Transactions are not supported')
    ) {
      return await fn();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
