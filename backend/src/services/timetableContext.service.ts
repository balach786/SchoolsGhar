import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { getTenantModels } from './TenantModelRegistry';

export interface TimetableSchedulingContext {
  session: any;
  cls: any;
  section: any | null;
}

/**
 * Resolve and validate the session→class→optional-section chain for operational timetable scheduling.
 *
 * Rules:
 * 1. Session must exist for tenant and NOT be archived (can be inactive for upcoming session drafting).
 * 2. Class must exist for tenant, belong to the session, and NOT be archived.
 * 3. If the class has 0 operational (non-archived) sections, sectionId must be null/undefined.
 * 4. If the class has >=1 operational sections, sectionId is mandatory and must belong to the class.
 */
export async function resolveTimetableSchedulingContext(
  tenantId: string | mongoose.Types.ObjectId,
  sessionId: string,
  classId: string,
  sectionId?: string | null,
  clientSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<TimetableSchedulingContext> {
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession, Class, Section } = getTenantModels(tenantDb);
  const sessionQuery = AcademicSession.findOne({ _id: sessionId, tenantId });
  if (clientSession) sessionQuery.session(clientSession);
  const sessionDoc = await sessionQuery;
  if (!sessionDoc) throw ApiError.notFound('Academic session not found');
  if (sessionDoc.isArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');

  const classQuery = Class.findOne({ _id: classId, tenantId });
  if (clientSession) classQuery.session(clientSession);
  const cls = await classQuery;
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.isArchived) throw ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
  if (String(cls.sessionId) !== String(sessionDoc._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  const activeSectionCountQuery = Section.countDocuments({
    tenantId,
    classId: cls._id,
    isArchived: false,
  });
  if (clientSession) activeSectionCountQuery.session(clientSession);
  const activeSectionCount = await activeSectionCountQuery;

  if (activeSectionCount === 0) {
    if (sectionId) {
      throw ApiError.badRequest('This class has no sections; sectionId must not be specified', 'SECTION_NOT_ALLOWED');
    }
    return { session: sessionDoc, cls, section: null };
  }

  // Active sections exist: sectionId is mandatory
  if (!sectionId) {
    throw ApiError.badRequest('Section is required for this class because sections exist', 'SECTION_REQUIRED_FOR_CLASS');
  }

  const sectionQuery = Section.findOne({ _id: sectionId, tenantId });
  if (clientSession) sectionQuery.session(clientSession);
  const section = await sectionQuery;
  if (!section) throw ApiError.notFound('Section not found');
  if (section.isArchived) throw ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
  if (String(section.classId) !== String(cls._id)) {
    throw ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
  }

  return { session: sessionDoc, cls, section };
}

/**
 * Resolve context for historical reading and print view.
 * Allows archived sessions, but verifies tenant ownership and class-section hierarchy.
 */
export async function resolveTimetableReadContext(
  tenantId: string | mongoose.Types.ObjectId,
  sessionId: string,
  classId?: string,
  sectionId?: string | null,
  tenantDb?: mongoose.Connection
): Promise<{ session: any; cls?: any; section?: any | null }> {
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession, Class, Section } = getTenantModels(tenantDb);
  const sessionDoc = await AcademicSession.findOne({ _id: sessionId, tenantId });
  if (!sessionDoc) throw ApiError.notFound('Academic session not found');

  let cls: any = null;
  let section: any = null;

  if (classId) {
    cls = await Class.findOne({ _id: classId, tenantId });
    if (!cls) throw ApiError.notFound('Class not found');
    if (String(cls.sessionId) !== String(sessionDoc._id)) {
      throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
    }

    if (sectionId) {
      section = await Section.findOne({ _id: sectionId, tenantId });
      if (!section) throw ApiError.notFound('Section not found');
      if (String(section.classId) !== String(cls._id)) {
        throw ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
      }
    }
  }

  return { session: sessionDoc, cls, section };
}
