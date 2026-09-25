import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { requireTenantId } from '../utils/tenantScope';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicTimetable, overlaps, DAY_NAMES, toMinutes } from '../models/Timetable';
import { AuthUser } from '../types';
import { resolveTimetableSchedulingContext, resolveTimetableReadContext } from '../services/timetableContext.service';
import { requireTeachingStaff } from '../services/academic.service';
import { getOwnStudent, type AuthedUser } from '../services/attendance.service';
import { recordAuditWithSession } from '../services/audit.service';
import { getTenantModels } from '../services/TenantModelRegistry';

type ReqUser = AuthedUser & { _id: string; role: string; tenantId?: string };

/**
 * Executes a mutation within a MongoDB transaction serialized by incrementing
 * the tenant-owned timetable sequence counter (stored in TenantSequence collection
 * with key "timetable-lock" inside the tenant database).
 * Retries on transient MongoDB transaction write conflicts up to 3 times.
 * Domain/validation ApiErrors abort immediately without retrying.
 */
async function executeWithTimetableLock<T>(
  tenantId: string | mongoose.Types.ObjectId,
  tenantDb: mongoose.Connection,
  action: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await tenantDb.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        // Acquire serialization write lock via tenant-owned counter (tenant DB, not master DB)
        const { TenantSequence } = getTenantModels(tenantDb);
        const lockDoc = await TenantSequence.findOneAndUpdate(
          { _id: `timetable-lock` },
          { $inc: { seq: 1 } },
          { session, new: true, upsert: true }
        );
        if (!lockDoc) {
          throw new ApiError(500, 'Failed to acquire timetable lock', 'TIMETABLE_LOCK_FAILED');
        }

        result = await action(session);
      });
      return result as T;
    } catch (err: any) {
      lastError = err;
      if (err instanceof ApiError) {
        throw err;
      }
      const isTransient =
        err?.hasErrorLabel?.('TransientTransactionError') ||
        err?.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        err?.code === 112 ||
        err?.message?.includes('WriteConflict');

      if (isTransient && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt * (0.8 + Math.random() * 0.4)));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

async function ensureSchoolReferences(req: Request, session?: mongoose.ClientSession, tenantDb?: mongoose.Connection) {
  const tenantId = requireTenantId(req);
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { AcademicSession, Class, Section, Staff, Subject } = getTenantModels(tenantDb);

  const inputs = [req.query, req.body, ...(Array.isArray(req.body?.periods) ? req.body.periods : [])];
  for (const input of inputs) {
    if (!input) continue;
    const references: [string, (id: string) => PromiseLike<unknown>][] = [
      ['sessionId', (id) => AcademicSession.exists({ _id: id, tenantId }).session(session ?? null)],
      ['classId', (id) => Class.exists({ _id: id, tenantId }).session(session ?? null)],
      ['sectionId', (id) => Section.exists({ _id: id, tenantId }).session(session ?? null)],
      ['teacherId', (id) => Staff.exists({ _id: id, tenantId }).session(session ?? null)],
      ['subjectId', (id) => Subject.exists({ _id: id, tenantId }).session(session ?? null)],
    ];
    for (const [field, exists] of references) {
      const val = input[field];
      if (val && val !== 'null' && !(await exists(String(val)))) {
        throw ApiError.notFound('School timetable reference not found');
      }
    }
  }
}

interface PeriodInput {
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectId?: string | null;
  teacherId?: string | null;
  isBreak?: boolean;
}

/** Validate + hydrate a single period's references against the session/class. */
async function validatePeriodReferences(
  p: PeriodInput,
  tenantId: string,
  sessionId: string,
  classId: string,
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<{ subjectId?: string | null; teacherId?: string | null }> {
  const isBreak = Boolean(p.isBreak);
  const subjectId = p.subjectId || null;
  const teacherId = p.teacherId || null;

  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Subject } = getTenantModels(tenantDb);

  if (isBreak && (subjectId || teacherId)) {
    throw ApiError.badRequest('Break periods cannot have a subject or teacher', 'BREAK_PERIOD_INVALID');
  }
  if (!isBreak && !subjectId) {
    throw ApiError.badRequest('A non-break period must have a subject', 'SUBJECT_REQUIRED');
  }

  let subjectDoc: any = null;
  if (subjectId) {
    const qSubject = Subject.findOne({ _id: subjectId, tenantId });
    if (session) qSubject.session(session);
    subjectDoc = await qSubject.lean();

    if (!subjectDoc) throw ApiError.notFound('Subject not found');
    if (subjectDoc.isArchived) throw ApiError.badRequest('Subject is archived', 'SUBJECT_ARCHIVED');
    if (String(subjectDoc.sessionId) !== String(sessionId)) {
      throw ApiError.badRequest('Subject belongs to a different session', 'INVALID_SUBJECT_SESSION');
    }
    // Subject.classIds is authoritative: empty does NOT act as a wildcard
    if (!subjectDoc.classIds?.length || !subjectDoc.classIds.map(String).includes(String(classId))) {
      throw ApiError.badRequest('Subject is not assigned to this class', 'INVALID_SUBJECT_CLASS');
    }
  }

  if (teacherId) {
    // Teacher must be assigned to teach this subject
    if (!subjectDoc?.teacherIds?.length || !subjectDoc.teacherIds.map(String).includes(String(teacherId))) {
      throw ApiError.badRequest('Teacher is not assigned to teach this subject', 'INVALID_SUBJECT_TEACHER');
    }

    await requireTeachingStaff(String(teacherId), tenantId, false, tenantDb);
  }

  return { subjectId, teacherId };
}

/** Teacher conflict: actual wall-clock overlap for the same teacher on the same day/session. */
async function checkTeacherConflicts(
  tenantId: string,
  teacherId: string | null | undefined,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  sessionId: string,
  excludeIds: string[] = [],
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<void> {
  if (!teacherId) return;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Timetable } = getTenantModels(tenantDb);

  const objectIdExcludes = excludeIds
    .filter(Boolean)
    .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id));

  const q = Timetable.findOne({
    _id: { $nin: objectIdExcludes },
    tenantId,
    sessionId,
    teacherId,
    dayOfWeek,
    isArchived: false,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  }).select('classId sectionId periodNumber startTime endTime');

  if (session) q.session(session);
  const clash = await q.lean();

  if (clash) {
    throw ApiError.conflict(
      `Teacher is already assigned on ${DAY_NAMES[dayOfWeek]} at period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
      'TEACHER_TIME_CONFLICT',
      { dayOfWeek, periodNumber: clash.periodNumber }
    );
  }
}

/** Class / Section conflict: overlapping periods for the exact same class/section slot. */
async function checkClassConflicts(
  tenantId: string,
  classId: string,
  sectionId: string | null,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  sessionId: string,
  excludeIds: string[] = [],
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<void> {
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Timetable } = getTenantModels(tenantDb);

  const objectIdExcludes = excludeIds
    .filter(Boolean)
    .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id));

  const filter: Record<string, any> = {
    _id: { $nin: objectIdExcludes },
    tenantId,
    sessionId,
    classId,
    dayOfWeek,
    isArchived: false,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };

  if (sectionId) {
    filter.sectionId = sectionId;
  } else {
    filter.sectionId = null;
  }

  const q = Timetable.findOne(filter).select('sectionId periodNumber startTime endTime isBreak');
  if (session) q.session(session);
  const clash = await q.lean();

  if (clash) {
    throw ApiError.conflict(
      sectionId
        ? `Section is already occupied on ${DAY_NAMES[dayOfWeek]} at period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`
        : `Class is already occupied on ${DAY_NAMES[dayOfWeek]} at period ${clash.periodNumber} (${clash.startTime}–${clash.endTime})`,
      'CLASS_TIME_CONFLICT',
      { dayOfWeek, periodNumber: clash.periodNumber }
    );
  }
}

/** Duplicate cell (section/class + day + periodNumber) check. */
async function checkCellConflict(
  tenantId: string,
  sessionId: string,
  classId: string,
  sectionId: string | null,
  dayOfWeek: number,
  periodNumber: number,
  excludeIds: string[] = [],
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<void> {
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Timetable } = getTenantModels(tenantDb);

  const objectIdExcludes = excludeIds
    .filter(Boolean)
    .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id));

  const filter: Record<string, any> = {
    _id: { $nin: objectIdExcludes },
    tenantId,
    sessionId,
    classId,
    dayOfWeek,
    periodNumber,
    isArchived: false,
  };

  if (sectionId) {
    filter.sectionId = sectionId;
  } else {
    filter.sectionId = null;
  }

  const q = Timetable.findOne(filter).select('_id');
  if (session) q.session(session);
  const clash = await q.lean();

  if (clash) {
    throw ApiError.conflict(
      sectionId
        ? `Period ${periodNumber} already exists on ${DAY_NAMES[dayOfWeek]} for this section`
        : `Period ${periodNumber} already exists on ${DAY_NAMES[dayOfWeek]} for this class`,
      'PERIOD_CELL_EXISTS',
      { dayOfWeek, periodNumber }
    );
  }
}

/** Validate all periods in a batch (cross-batch intra-checks + DB conflicts). */
async function validateBatch(
  periods: PeriodInput[],
  tenantId: string,
  sessionId: string,
  classId: string,
  sectionId: string | null,
  excludeIds: string[] = [],
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<PeriodInput[]> {
  const hydrated: PeriodInput[] = [];
  const cells = new Set<string>();
  const teacherSpots = new Map<string, PeriodInput>();
  const teacherTimes: { teacherId: string; dayOfWeek: number; start: string; end: string }[] = [];
  const classTimes: { dayOfWeek: number; start: string; end: string }[] = [];

  for (const p of periods) {
    const { subjectId, teacherId } = await validatePeriodReferences(p, tenantId, sessionId, classId, session, tenantDb);
    const item = { ...p, subjectId, teacherId };
    hydrated.push(item);

    const cellKey = `${p.dayOfWeek}|${p.periodNumber}`;
    if (cells.has(cellKey)) {
      throw ApiError.badRequest(
        `Duplicate period ${p.periodNumber} on ${DAY_NAMES[p.dayOfWeek]} in the request`,
        'PERIOD_DUPLICATE_IN_REQUEST'
      );
    }
    cells.add(cellKey);

    await checkCellConflict(tenantId, sessionId, classId, sectionId, p.dayOfWeek, p.periodNumber, excludeIds, session, tenantDb);

    if (teacherId) {
      const spotKey = `${teacherId}|${p.dayOfWeek}|${p.periodNumber}`;
      const prev = teacherSpots.get(spotKey);
      if (prev) {
        throw ApiError.conflict(
          `Teacher is assigned twice on ${DAY_NAMES[p.dayOfWeek]} at period ${p.periodNumber}`,
          'TEACHER_PERIOD_CLASH'
        );
      }
      teacherSpots.set(spotKey, item);

      for (const t of teacherTimes) {
        if (t.teacherId === teacherId && t.dayOfWeek === p.dayOfWeek && overlaps(t.start, t.end, p.startTime, p.endTime)) {
          throw ApiError.conflict(
            `Teacher time overlap on ${DAY_NAMES[p.dayOfWeek]} between ${t.start}–${t.end} and ${p.startTime}–${p.endTime}`,
            'TEACHER_TIME_CONFLICT'
          );
        }
      }
      teacherTimes.push({ teacherId, dayOfWeek: p.dayOfWeek, start: p.startTime, end: p.endTime });
      await checkTeacherConflicts(tenantId, teacherId, p.dayOfWeek, p.startTime, p.endTime, sessionId, excludeIds, session, tenantDb);
    }

    // Break periods also occupy the class/section time slot
    for (const c of classTimes) {
      if (c.dayOfWeek === p.dayOfWeek && overlaps(c.start, c.end, p.startTime, p.endTime)) {
        throw ApiError.conflict(
          `Class time overlap on ${DAY_NAMES[p.dayOfWeek]} between ${c.start}–${c.end} and ${p.startTime}–${p.endTime}`,
          'CLASS_TIME_CONFLICT'
        );
      }
    }
    classTimes.push({ dayOfWeek: p.dayOfWeek, start: p.startTime, end: p.endTime });
    await checkClassConflicts(tenantId, classId, sectionId, p.dayOfWeek, p.startTime, p.endTime, sessionId, excludeIds, session, tenantDb);
  }

  return hydrated;
}

/** POST /api/timetables — bulk period creation (atomic, up to 100). */
export const createTimetable = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantId = requireTenantId(req);
  await ensureSchoolReferences(req, undefined, tenantDb);
  const { sessionId, classId, sectionId, periods } = req.body;
  const targetSectionId = sectionId ? String(sectionId) : null;

  const docs = await executeWithTimetableLock(tenantId, tenantDb, async (session) => {
    const { Timetable } = getTenantModels(tenantDb);
    const ctx = await resolveTimetableSchedulingContext(tenantId, sessionId, classId, targetSectionId, session, tenantDb);
    const hydrated = await validateBatch(periods, tenantId, sessionId, classId, ctx.section ? String(ctx.section._id) : null, [], session, tenantDb);

    const created = await Timetable.insertMany(
      hydrated.map((p) => ({
        tenantId,
        sessionId,
        classId,
        sectionId: ctx.section ? ctx.section._id : null,
        dayOfWeek: p.dayOfWeek,
        periodNumber: p.periodNumber,
        startTime: p.startTime,
        endTime: p.endTime,
        subjectId: p.subjectId ?? undefined,
        teacherId: p.teacherId ?? undefined,
        isBreak: Boolean(p.isBreak),
        isArchived: false,
      })),
      { session }
    );

    await recordAuditWithSession(
      'timetables',
      'TIMETABLE_CREATED',
      req.user as unknown as AuthUser,
      String(classId),
      {
        sessionId,
        classId,
        sectionId: ctx.section ? String(ctx.section._id) : '',
        count: created.length,
      },
      session
    );

    return created;
  });

  res.status(201).json({
    success: true,
    message: `${(docs as any[]).length} period(s) added to the timetable`,
    data: (docs as any[]).map((d) => publicTimetable(d as never)),
  });
});

/** POST /api/timetables/periods — add a single period. */
export const addPeriod = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantId = requireTenantId(req);
  await ensureSchoolReferences(req, undefined, tenantDb);
  const { sessionId, classId, sectionId, ...period } = req.body;
  const targetSectionId = sectionId ? String(sectionId) : null;

  const doc = await executeWithTimetableLock(tenantId, tenantDb, async (session) => {
    const { Timetable } = getTenantModels(tenantDb);
    const ctx = await resolveTimetableSchedulingContext(tenantId, sessionId, classId, targetSectionId, session, tenantDb);
    const [hydrated] = await validateBatch([period], tenantId, sessionId, classId, ctx.section ? String(ctx.section._id) : null, [], session, tenantDb);

    const [created] = await Timetable.create(
      [
        {
          tenantId,
          sessionId,
          classId,
          sectionId: ctx.section ? ctx.section._id : null,
          dayOfWeek: hydrated.dayOfWeek,
          periodNumber: hydrated.periodNumber,
          startTime: hydrated.startTime,
          endTime: hydrated.endTime,
          subjectId: hydrated.subjectId ?? undefined,
          teacherId: hydrated.teacherId ?? undefined,
          isBreak: Boolean(hydrated.isBreak),
          isArchived: false,
        },
      ],
      { session }
    );

    await recordAuditWithSession(
      'timetables',
      'TIMETABLE_CREATED',
      req.user as unknown as AuthUser,
      String(created._id),
      {
        sessionId,
        classId,
        sectionId: ctx.section ? String(ctx.section._id) : '',
        dayOfWeek: created.dayOfWeek,
        periodNumber: created.periodNumber,
        subjectId: created.subjectId ? String(created.subjectId) : '',
        teacherId: created.teacherId ? String(created.teacherId) : '',
      },
      session
    );

    return created;
  });

  res.status(201).json({ success: true, message: 'Period added', data: publicTimetable(doc as never) });
});

/** PATCH /api/timetables/periods/:id — structural identity (session, class, section) is immutable. */
export const updatePeriod = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantId = requireTenantId(req);
  await ensureSchoolReferences(req, undefined, tenantDb);

  const updatedDoc = await executeWithTimetableLock(tenantId, tenantDb, async (session) => {
    const { Timetable } = getTenantModels(tenantDb);
    const doc = await Timetable.findOne({ _id: req.params.id, tenantId, isArchived: false }).session(session);
    if (!doc) throw ApiError.notFound('Timetable period not found');

    const merged: PeriodInput = {
      dayOfWeek: req.body.dayOfWeek ?? doc.dayOfWeek,
      periodNumber: req.body.periodNumber ?? doc.periodNumber,
      startTime: req.body.startTime ?? doc.startTime,
      endTime: req.body.endTime ?? doc.endTime,
      subjectId: req.body.subjectId !== undefined ? req.body.subjectId : doc.subjectId ? String(doc.subjectId) : null,
      teacherId: req.body.teacherId !== undefined ? req.body.teacherId : doc.teacherId ? String(doc.teacherId) : null,
      isBreak: req.body.isBreak !== undefined ? req.body.isBreak : doc.isBreak,
    };
    if (toMinutes(merged.startTime) >= toMinutes(merged.endTime)) {
      throw ApiError.badRequest('startTime must be earlier than endTime', 'INVALID_TIME_RANGE');
    }

    const sectionIdStr = doc.sectionId ? String(doc.sectionId) : null;
    const [hydrated] = await validateBatch(
      [merged],
      tenantId,
      String(doc.sessionId),
      String(doc.classId),
      sectionIdStr,
      [String(doc._id)],
      session,
      tenantDb
    );

    doc.dayOfWeek = hydrated.dayOfWeek;
    doc.periodNumber = hydrated.periodNumber;
    doc.startTime = hydrated.startTime;
    doc.endTime = hydrated.endTime;
    doc.subjectId = hydrated.subjectId ? (hydrated.subjectId as never) : undefined;
    doc.teacherId = hydrated.teacherId ? (hydrated.teacherId as never) : undefined;
    doc.isBreak = Boolean(hydrated.isBreak);
    await doc.save({ session });

    await recordAuditWithSession(
      'timetables',
      'TIMETABLE_UPDATED',
      req.user as unknown as AuthUser,
      String(doc._id),
      {
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        sectionId: sectionIdStr || '',
        dayOfWeek: doc.dayOfWeek,
        periodNumber: doc.periodNumber,
      },
      session
    );

    return doc;
  });

  res.json({ success: true, message: 'Period updated', data: publicTimetable(updatedDoc as never) });
});

/** DELETE /api/timetables/periods — soft-removal preserving historical records. */
export const removePeriods = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantId = requireTenantId(req);
  const { periodIds } = req.body;

  const modifiedCount = await executeWithTimetableLock(tenantId, tenantDb, async (session) => {
    const { Timetable } = getTenantModels(tenantDb);
    const result = await Timetable.updateMany(
      { _id: { $in: periodIds }, tenantId, isArchived: false },
      { $set: { isArchived: true } },
      { session }
    );

    if (result.modifiedCount > 0) {
      await recordAuditWithSession(
        'timetables',
        'TIMETABLE_REMOVED',
        req.user as unknown as AuthUser,
        periodIds.join(','),
        { removedCount: result.modifiedCount },
        session
      );
    }
    return result.modifiedCount;
  });

  res.json({
    success: true,
    message: `${modifiedCount} period(s) removed`,
    data: { removed: modifiedCount },
  });
});

/** POST /api/timetables/swap — atomic swap of two periods on the same day. */
export const swapPeriods = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantId = requireTenantId(req);
  await ensureSchoolReferences(req, undefined, tenantDb);
  const { sessionId, classId, sectionId, dayOfWeek, periodA, periodB } = req.body;
  const targetSectionId = sectionId ? String(sectionId) : null;

  const swapped = await executeWithTimetableLock(tenantId, tenantDb, async (session) => {
    const { Timetable } = getTenantModels(tenantDb);
    await resolveTimetableSchedulingContext(tenantId, sessionId, classId, targetSectionId, session, tenantDb);

    const filterA: any = {
      tenantId: new mongoose.Types.ObjectId(String(tenantId)),
      sessionId: new mongoose.Types.ObjectId(String(sessionId)),
      classId: new mongoose.Types.ObjectId(String(classId)),
      dayOfWeek,
      periodNumber: periodA,
      isArchived: false,
    };
    const filterB: any = {
      tenantId: new mongoose.Types.ObjectId(String(tenantId)),
      sessionId: new mongoose.Types.ObjectId(String(sessionId)),
      classId: new mongoose.Types.ObjectId(String(classId)),
      dayOfWeek,
      periodNumber: periodB,
      isArchived: false,
    };
    if (targetSectionId) {
      filterA.sectionId = new mongoose.Types.ObjectId(String(targetSectionId));
      filterB.sectionId = new mongoose.Types.ObjectId(String(targetSectionId));
    } else {
      filterA.sectionId = null;
      filterB.sectionId = null;
    }

    const [a, b] = await Promise.all([
      Timetable.findOne(filterA).session(session),
      Timetable.findOne(filterB).session(session),
    ]);

    if (!a || !b) throw ApiError.notFound('Both periods must exist to swap');
    if (a.isBreak && b.isBreak) {
      return [a, b] as const;
    }

    const aTeacher = a.teacherId ? String(a.teacherId) : null;
    const bTeacher = b.teacherId ? String(b.teacherId) : null;
    const aSubject = a.subjectId ? String(a.subjectId) : null;
    const bSubject = b.subjectId ? String(b.subjectId) : null;
    const aIsBreak = a.isBreak;
    const bIsBreak = b.isBreak;

    // Both IDs excluded from conflict queries to avoid self/mutual collision
    const exclude = [String(a._id), String(b._id)];
    if (!aIsBreak && aTeacher && aTeacher !== bTeacher) {
      await checkTeacherConflicts(tenantId, aTeacher, dayOfWeek, b.startTime, b.endTime, sessionId, exclude, session, tenantDb);
    }
    if (!bIsBreak && bTeacher && bTeacher !== aTeacher) {
      await checkTeacherConflicts(tenantId, bTeacher, dayOfWeek, a.startTime, a.endTime, sessionId, exclude, session, tenantDb);
    }

    a.isBreak = bIsBreak;
    a.subjectId = bIsBreak ? (undefined as never) : bSubject ? (bSubject as never) : (undefined as never);
    a.teacherId = bIsBreak ? (undefined as never) : bTeacher ? (bTeacher as never) : (undefined as never);

    b.isBreak = aIsBreak;
    b.subjectId = aIsBreak ? (undefined as never) : aSubject ? (aSubject as never) : (undefined as never);
    b.teacherId = aIsBreak ? (undefined as never) : aTeacher ? (aTeacher as never) : (undefined as never);

    await Promise.all([a.save({ session }), b.save({ session })]);

    await recordAuditWithSession(
      'timetables',
      'TIMETABLE_SWAPPED',
      req.user as unknown as AuthUser,
      String(a._id),
      {
        sessionId,
        classId,
        sectionId: targetSectionId || '',
        dayOfWeek,
        periodA,
        periodB,
        periodAId: String(a._id),
        periodBId: String(b._id),
      },
      session
    );

    return [a, b] as const;
  });

  res.json({
    success: true,
    message: 'Periods swapped',
    data: [publicTimetable((swapped as unknown as any[])[0] as never), publicTimetable((swapped as unknown as any[])[1] as never)],
  });
});

interface TTFilter {
  sessionId?: string;
  classId?: string;
  sectionId?: string | null;
  teacherId?: string;
  dayOfWeek?: number;
}

/** Scope a timetable query by role. */
async function scopeQuery(user: ReqUser, q: TTFilter, tenantDb: mongoose.Connection): Promise<Record<string, any>> {
  const filter: Record<string, any> = { tenantId: user.tenantId, isArchived: false };
  if (q.sessionId) filter.sessionId = q.sessionId;
  if (q.dayOfWeek) filter.dayOfWeek = q.dayOfWeek;

  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (q.classId && String(q.classId) !== String(own.classId)) {
      throw ApiError.forbidden('You can only view your own class timetable', 'TIMETABLE_FORBIDDEN');
    }
    if (own.sectionId && q.sectionId && String(q.sectionId) !== String(own.sectionId)) {
      throw ApiError.forbidden('You can only view your own section timetable', 'TIMETABLE_FORBIDDEN');
    }
    filter.classId = own.classId;
    filter.sectionId = own.sectionId ? own.sectionId : null;
    return filter;
  }

  if (q.classId) filter.classId = q.classId;
  if (q.sectionId !== undefined) {
    filter.sectionId = q.sectionId ? q.sectionId : null;
  }
  if (q.teacherId) filter.teacherId = q.teacherId;
  return filter;
}

async function resolveNames(periods: any[], tenantDb: mongoose.Connection) {
  const { Class, Section, Subject, Teacher, AcademicSession } = getTenantModels(tenantDb);
  const ids = (key: string) =>
    Array.from(new Set(periods.map((p) => p[key]).filter(Boolean).map((v: unknown) => String(v))));
  const [classes, sections, subjects, teachers, sessions] = await Promise.all([
    Class.find({ _id: { $in: ids('classId') } }).select('name').lean(),
    Section.find({ _id: { $in: ids('sectionId') } }).select('name').lean(),
    Subject.find({ _id: { $in: ids('subjectId') } }).select('name code').lean(),
    Teacher.find({ _id: { $in: ids('teacherId') } }).select('fullName employeeId').lean(),
    AcademicSession.find({ _id: { $in: ids('sessionId') } }).select('name').lean(),
  ]);
  return {
    classMap: new Map(classes.map((c) => [String(c._id), c.name])),
    sectionMap: new Map(sections.map((s) => [String(s._id), s.name])),
    subjectMap: new Map(subjects.map((s) => [String(s._id), s])),
    teacherMap: new Map(teachers.map((t) => [String(t._id), t])),
    sessionMap: new Map(sessions.map((s) => [String(s._id), s.name])),
  };
}

function publicPeriod(p: any, names: any) {
  return {
    ...publicTimetable(p),
    className: names.classMap.get(String(p.classId)) ?? '—',
    sectionName: p.sectionId ? names.sectionMap.get(String(p.sectionId)) ?? '—' : null,
    subjectName: p.subjectId ? names.subjectMap.get(String(p.subjectId))?.name ?? '—' : null,
    teacherName: p.teacherId ? names.teacherMap.get(String(p.teacherId))?.fullName ?? '—' : null,
  };
}

/** GET /api/timetables — list operational periods. */
export const listTimetable = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  await ensureSchoolReferences(req, undefined, tenantDb);
  const user = req.user as unknown as ReqUser;
  if (!req.query.sessionId) throw ApiError.badRequest('sessionId is required', 'SESSION_REQUIRED');

  const sessionId = String(req.query.sessionId);
  const classId = (req.query.classId as string) || undefined;
  const sectionId =
    req.query.sectionId !== undefined && req.query.sectionId !== '' && req.query.sectionId !== 'null'
      ? String(req.query.sectionId)
      : req.query.sectionId === '' || req.query.sectionId === 'null'
      ? null
      : undefined;

  await resolveTimetableReadContext(user.tenantId!, sessionId, classId, sectionId, tenantDb);

  const filter = await scopeQuery(user, {
    sessionId,
    classId,
    sectionId,
    teacherId: (req.query.teacherId as string) || undefined,
    dayOfWeek: Number(req.query.dayOfWeek) || undefined,
  }, tenantDb);

  const { Timetable } = getTenantModels(tenantDb);
  const docs = await Timetable.find(filter)
    .sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 })
    .lean();
  const names = await resolveNames(docs, tenantDb);
  res.json({ success: true, data: docs.map((d) => publicPeriod(d, names)) });
});

/** GET /api/timetables/print — grouped, print-ready structure. */
export const printTimetable = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  await ensureSchoolReferences(req, undefined, tenantDb);
  const user = req.user as unknown as ReqUser;
  const sessionId = String(req.query.sessionId || '');
  const classId = (req.query.classId as string) || undefined;
  const sectionId =
    req.query.sectionId !== undefined && req.query.sectionId !== '' && req.query.sectionId !== 'null'
      ? String(req.query.sectionId)
      : null;

  if (!sessionId || !classId) {
    throw ApiError.badRequest('sessionId and classId are required for printing', 'PRINT_PARAMS_REQUIRED');
  }

  const { session, cls, section } = await resolveTimetableReadContext(user.tenantId!, sessionId, classId, sectionId, tenantDb);

  // If class has active sections, verify sectionId was supplied
  const { Section, Timetable } = getTenantModels(tenantDb);
  const activeSectionsCount = await Section.countDocuments({ tenantId: user.tenantId, classId, isArchived: false });
  if (activeSectionsCount > 0 && !sectionId) {
    throw ApiError.badRequest('Section is required for printing this class timetable', 'SECTION_REQUIRED_FOR_CLASS');
  }

  const filter = await scopeQuery(user, { sessionId, classId, sectionId }, tenantDb);
  const docs = await Timetable.find(filter).sort({ dayOfWeek: 1, periodNumber: 1 }).lean();
  const names = await resolveNames(docs, tenantDb);

  const grouped: Record<number, any[]> = {};
  for (const d of docs) {
    if (!grouped[d.dayOfWeek]) grouped[d.dayOfWeek] = [];
    grouped[d.dayOfWeek].push(publicPeriod(d, names));
  }

  const days = [1, 2, 3, 4, 5, 6]
    .filter((d) => grouped[d])
    .map((d) => ({ dayOfWeek: d, dayName: DAY_NAMES[d], periods: grouped[d] }));

  res.json({
    success: true,
    data: {
      sessionName: session?.name ?? '—',
      className: cls?.name ?? '—',
      sectionName: section?.name ?? '',
      days,
    },
  });
});
