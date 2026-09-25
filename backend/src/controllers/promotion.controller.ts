import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../types';
import { ok } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { Section } from '../models/Section';
import { Tenant } from '../models/Tenant';
import { requireSession, requireClass, requireSectionOfClass } from '../services/academic.service';
import { recordAuditWithSession } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

// ── Types ──────────────────────────────────────────────────────────

interface PromotionRefs {
  sessionId: string;
  classId: string;
  sectionId?: string | null;
}

interface ResolvedRefs {
  session: any;
  cls: any;
  section: any | null;
  sectionId: mongoose.Types.ObjectId | null;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve and validate session/class/section references for promotion.
 * Supports sectionless classes: if the class has no operational non-archived
 * sections, sectionId may be null. If it has sections, sectionId is required.
 *
 * All reads use the provided mongoSession when present so they participate
 * in the transaction snapshot.
 */
async function resolvePromotionRefs(
  ref: PromotionRefs,
  tenantDb: mongoose.Connection,
  tenantId: mongoose.Types.ObjectId | undefined,
  mongoSession?: mongoose.ClientSession
): Promise<ResolvedRefs> {
  const session = await requireSession(ref.sessionId, false, tenantId, mongoSession, tenantDb);
  const cls = await requireClass(ref.classId, tenantId, mongoSession, tenantDb);

  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  let section: any = null;
  let resolvedSectionId: mongoose.Types.ObjectId | null = null;

  if (ref.sectionId) {
    // Section provided — validate it belongs to class and session
    section = await requireSectionOfClass(ref.sectionId, ref.classId, tenantId, mongoSession, tenantDb);
    if (String(section.sessionId) !== String(session._id)) {
      throw ApiError.badRequest('Section does not belong to the selected session', 'INVALID_SECTION_SESSION');
    }
    resolvedSectionId = section._id;
  } else {
    // No section provided — verify class is truly sectionless
    // Query includes tenantId + classId + isArchived:false (correction #11)
    const sectionFilter: Record<string, unknown> = {
      classId: cls._id,
      isArchived: false,
    };
    if (tenantId) sectionFilter.tenantId = tenantId;
    let q = Section.findOne(sectionFilter).select('_id');
    if (mongoSession) q = q.session(mongoSession);
    const hasSection = await q.lean();
    if (hasSection) {
      throw ApiError.badRequest(
        'This class has sections — please select a section',
        'SECTION_REQUIRED_FOR_CLASS'
      );
    }
    // Class is truly sectionless — section remains null
  }

  return { session, cls, section, sectionId: resolvedSectionId };
}

/**
 * Build a MongoDB query filter for sectionId that correctly handles null.
 * MongoDB { sectionId: null } matches both null values and missing fields.
 */
function sectionFilter(sectionId: mongoose.Types.ObjectId | null): Record<string, unknown> {
  if (sectionId) return { sectionId };
  return { sectionId: null };
}

// ── Preview ────────────────────────────────────────────────────────

/** GET /api/promotions/preview — eligible students for a source→destination move. */
export const previewPromotion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    sessionId, classId, sectionId,
    toSessionId, toClassId, toSectionId,
  } = req.query as Record<string, string>;
  const tenantId = getTenantObjectId(req);

  // Same-session fast-fail (backend authoritative check is also inside tx for POST)
  if (sessionId === toSessionId) {
    throw ApiError.badRequest(
      'Source and destination must be different academic sessions. Use class/section transfer for within-session moves.',
      'SAME_SESSION_PROMOTION'
    );
  }

  await resolvePromotionRefs({ sessionId, classId, sectionId: sectionId || null }, req.tenantDb!, tenantId);
  const destination = await resolvePromotionRefs(
    { sessionId: toSessionId, classId: toClassId, sectionId: toSectionId || null },
    req.tenantDb!,
    tenantId
  );

  const studentQuery: Record<string, unknown> = {
    sessionId, classId, isArchived: false,
    ...sectionFilter(sectionId ? new mongoose.Types.ObjectId(sectionId) : null),
  };

  const students = await Student.find(scopeQuery(req, studentQuery))
    .select('fullName admissionNumber rollNumber gender isActive')
    .sort({ rollNumber: 1 })
    .lean();

  ok(res, {
    source: { sessionId, classId, sectionId: sectionId || null },
    destination: {
      sessionId: String(destination.session._id),
      classId: String(destination.cls._id),
      sectionId: destination.sectionId ? String(destination.sectionId) : null,
    },
    total: students.length,
    students: students.map((s) => ({
      _id: String(s._id),
      fullName: s.fullName,
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber,
      gender: s.gender,
      isActive: s.isActive,
    })),
  });
});

// ── Promote ────────────────────────────────────────────────────────

/**
 * POST /api/promotions — promote selected students with full transactional safety.
 *
 * Architecture:
 * - All authoritative validation runs INSIDE the MongoDB transaction
 * - Tenant.promotionSeq serializes competing promotion operations
 * - StudentHistory uses create() (pure insert) — promotion NEVER mutates existing history
 * - ONE canonical promotion event per student (no source-history upsert)
 * - previousClassId / previousSectionId preserve "from" context
 * - Optimistic source filter on Student update verifies placement at write time
 * - mongoose withTransaction handles TransientTransactionError retries
 *
 * Corrections applied: #3,4,5,6,7,8,9,10,11,12,13,14,20,21
 */
export const promoteStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { source, destination, studentIds } = req.body as {
    source: PromotionRefs;
    destination: PromotionRefs;
    studentIds?: string[];
  };

  const tenantId = getTenantObjectId(req);

  // ── Pre-transaction fast-fail (non-authoritative UX only) ────────
  if (source.sessionId === destination.sessionId) {
    throw ApiError.badRequest(
      'Source and destination must be different academic sessions. Use class/section transfer for within-session moves.',
      'SAME_SESSION_PROMOTION'
    );
  }
  // Validate refs exist (fast-fail; re-validated inside tx)
  await resolvePromotionRefs(source, req.tenantDb!, tenantId);
  await resolvePromotionRefs(destination, req.tenantDb!, tenantId);

  // ── Deduplicate student IDs (correction #8) ──────────────────────
  const selectedIds = studentIds?.length
    ? [...new Set(studentIds)].map((id) => new mongoose.Types.ObjectId(id))
    : null;

  // ── Execute inside serialized transaction ────────────────────────
  // mongoose withTransaction handles TransientTransactionError retries
  // internally (correction #21 — no custom retry wrapper stacked on top).
  const mongoSession = await mongoose.startSession();
  let txResult: { total: number; promoted: number; skipped: number };

  try {
    await mongoSession.withTransaction(async () => {
      // ── Step 1: Acquire tenant promotion serialization lock ───────
      await Tenant.updateOne(
        { _id: tenantId },
        { $inc: { promotionSeq: 1 } },
        { session: mongoSession }
      );

      // ── Step 2–7: Resolve ALL refs INSIDE transaction (correction #3,4) ──
      const src = await resolvePromotionRefs(source, req.tenantDb!, tenantId, mongoSession);
      const dst = await resolvePromotionRefs(destination, req.tenantDb!, tenantId, mongoSession);

      // ── Step 8: Same-session rejection (backend authoritative, correction #12) ──
      if (String(src.session._id) === String(dst.session._id)) {
        throw ApiError.badRequest(
          'Source and destination must be different academic sessions.',
          'SAME_SESSION_PROMOTION'
        );
      }

      // ── Step 9: Re-read selected students inside transaction ─────
      const studentFilter: Record<string, unknown> = { isArchived: false };
      if (tenantId) studentFilter.tenantId = tenantId;

      if (selectedIds) {
        studentFilter._id = { $in: selectedIds };
      } else {
        // No explicit IDs → promote entire source cohort
        studentFilter.sessionId = src.session._id;
        studentFilter.classId = src.cls._id;
        Object.assign(studentFilter, sectionFilter(src.sectionId));
      }

      const students = await Student.find(studentFilter)
        .session(mongoSession)
        .sort({ rollNumber: 1 });

      if (!students.length) {
        throw ApiError.badRequest('No eligible students found for promotion', 'NO_STUDENTS');
      }

      // ── Correction #7: Validate exact requested set ──────────────
      if (selectedIds && students.length !== selectedIds.length) {
        const foundIds = new Set(students.map((s) => String(s._id)));
        const missingIds = selectedIds
          .filter((id) => !foundIds.has(String(id)))
          .map(String);
        throw ApiError.badRequest(
          `${missingIds.length} selected student(s) not found or archived`,
          'STUDENTS_NOT_FOUND',
          { missingStudentIds: missingIds }
        );
      }

      // ── Step 10: Source revalidation (correction #9 null semantics) ──
      const srcSessionStr = String(src.session._id);
      const srcClassStr = String(src.cls._id);
      const srcSectionStr = src.sectionId ? String(src.sectionId) : null;

      for (const student of students) {
        const studentSession = String(student.sessionId);
        const studentClass = String(student.classId);
        const studentSection = student.sectionId ? String(student.sectionId) : null;

        if (
          studentSession !== srcSessionStr ||
          studentClass !== srcClassStr ||
          studentSection !== srcSectionStr
        ) {
          throw ApiError.conflict(
            'One or more students have moved since preview. Please refresh and try again.',
            'STUDENT_PLACEMENT_CHANGED',
            {
              staleStudentIds: [String(student._id)],
              expected: { sessionId: srcSessionStr, classId: srcClassStr, sectionId: srcSectionStr },
              actual: { sessionId: studentSession, classId: studentClass, sectionId: studentSection },
            }
          );
        }
      }

      // ── Step 11: Compute roll numbers inside serialized tx (correction #13) ──
      const dstRollFilter: Record<string, unknown> = {
        sessionId: dst.session._id,
        classId: dst.cls._id,
        isArchived: false,
        ...sectionFilter(dst.sectionId),
      };
      if (tenantId) dstRollFilter.tenantId = tenantId;

      const lastStudent = await Student.findOne(dstRollFilter)
        .session(mongoSession)
        .sort({ rollNumber: -1 })
        .select('rollNumber')
        .lean();

      let nextRoll = 1;
      const lastNum = parseInt(String(lastStudent?.rollNumber ?? '0'), 10);
      if (!Number.isNaN(lastNum) && lastNum >= nextRoll) nextRoll = lastNum + 1;

      // ── Build ops ────────────────────────────────────────────────
      const now = new Date();
      let promoted = 0;
      const skipped: string[] = [];

      const dstSessionId = dst.session._id;
      const dstClassId = dst.cls._id;
      const dstSectionId = dst.sectionId;

      const historyDocs: any[] = [];
      const studentUpdateOps: any[] = [];

      for (const student of students) {
        // Skip students already at destination
        const alreadyAtDst =
          String(student.sessionId) === String(dstSessionId) &&
          String(student.classId) === String(dstClassId) &&
          (student.sectionId ? String(student.sectionId) : null) ===
            (dstSectionId ? String(dstSectionId) : null);

        if (alreadyAtDst) {
          skipped.push(String(student._id));
          continue;
        }

        const assignedRoll = String(nextRoll++);

        // ONE canonical promotion history event per student (correction #6)
        historyDocs.push({
          tenantId,
          studentId: student._id,
          sessionId: dstSessionId,
          classId: dstClassId,
          sectionId: dstSectionId ?? undefined,
          status: 'promoted' as const,
          eventDate: now,
          date: now,
          previousClassId: student.classId,
          previousSectionId: student.sectionId ?? undefined,
          recordedBy: req.user?._id,
        });

        // Optimistic source filter on Student update (correction #14)
        studentUpdateOps.push({
          updateOne: {
            filter: {
              _id: student._id,
              tenantId,
              sessionId: src.session._id,
              classId: src.cls._id,
              ...sectionFilter(src.sectionId),
              isArchived: false,
            },
            update: {
              $set: {
                sessionId: dstSessionId,
                classId: dstClassId,
                sectionId: dstSectionId ?? null,
                rollNumber: assignedRoll,
              },
            },
          },
        });
        promoted++;
      }

      // ── Step 12: Append history — pure insert, never upsert (correction #5) ──
      if (historyDocs.length > 0) {
        // StudentHistory.create() triggers pre('save') middleware and Mongoose
        // validation — ensuring the append-only contract is enforced normally.
        await StudentHistory.create(historyDocs, { session: mongoSession });
      }

      // ── Step 13: Update students with optimistic source filter ────
      if (studentUpdateOps.length > 0) {
        const bulkResult = await Student.bulkWrite(studentUpdateOps, { session: mongoSession });

        // Correction #14: Verify all expected updates actually matched
        if (bulkResult.modifiedCount !== studentUpdateOps.length) {
          throw ApiError.conflict(
            'One or more students have moved since validation. Please refresh and try again.',
            'STUDENT_PLACEMENT_CHANGED'
          );
        }
      }

      // ── Step 14: Audit INSIDE transaction (correction #20) ────────
      if (promoted > 0) {
        await recordAuditWithSession(
          'students',
          'STUDENTS_PROMOTED',
          req.user,
          undefined,
          {
            sourceSessionId: srcSessionStr,
            sourceClassId: srcClassStr,
            sourceSectionId: srcSectionStr || '',
            targetSessionId: String(dstSessionId),
            targetClassId: String(dstClassId),
            targetSectionId: dstSectionId ? String(dstSectionId) : '',
            promotedCount: promoted,
          },
          mongoSession
        );
      }

      txResult = {
        total: students.length,
        promoted,
        skipped: skipped.length,
      };
    });
  } catch (err: any) {
    // Translate raw E11000 from roll number collisions into controlled error
    if (err?.code === 11000 && err?.message?.includes('rollNumber')) {
      throw ApiError.conflict(
        'Roll number conflict in destination. Please retry.',
        'ROLL_NUMBER_CONFLICT'
      );
    }
    throw err;
  } finally {
    await mongoSession.endSession();
  }

  ok(res, txResult!);
});
