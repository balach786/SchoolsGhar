import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { Exam } from '../models/Exam';
import { ExamSchedule, publicExamSchedule } from '../models/ExamSchedule';
import { StudentExamFee } from '../models/StudentExamFee';
import { AdmitCardOverride, publicAdmitCardOverride } from '../models/AdmitCardOverride';
import { Student } from '../models/Student';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { SchoolSettings, publicSchoolSettings } from '../models/SchoolSettings';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** GET /api/admit-cards?examId=&classId=&sectionId= */
export const listAdmitCards = asyncHandler(async (req: Request, res: Response) => {
  const { examId, classId, sectionId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const examClassIds = exam.classIds && exam.classIds.length > 0 ? exam.classIds : (exam.classId ? [exam.classId] : []);
  const targetClassId = classId || { $in: examClassIds };

  const studentFilter: Record<string, any> = {
    sessionId: exam.sessionId,
    classId: targetClassId,
    isArchived: false,
  };
  if (sectionId) studentFilter.sectionId = sectionId;

  // Student role check: only see own admit card
  const user = req.user as any;
  if (user?.role === 'student') {
    const own = await Student.findOne(scopeQuery(req, { userId: user._id })).select('_id').lean();
    if (own) studentFilter._id = own._id;
  }

  const [students, fees, overrides, classes, sections, rollNumbers] = await Promise.all([
    Student.find(scopeQuery(req, studentFilter))
      .select('fullName admissionNumber rollNumber sectionId classId profilePhotoUrl fatherName guardianName gender caste')
      .sort({ rollNumber: 1 })
      .lean(),
    StudentExamFee.find(scopeQuery(req, { examId })).lean(),
    AdmitCardOverride.find(scopeQuery(req, { examId })).lean(),
    Class.find(scopeQuery(req, {})).select('name').lean(),
    Section.find(scopeQuery(req, {})).select('name').lean(),
    import('../models/ExamRollNumber').then(m => m.ExamRollNumber.find(scopeQuery(req, { examId })).lean()),
  ]);

  const feeMap = new Map(fees.map((f) => [String(f.studentId), f]));
  const overrideMap = new Map(overrides.map((o) => [String(o.studentId), o]));
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));
  const rollMap = new Map(rollNumbers.map((r) => [String(r.studentId), r]));

  const requireFee = exam.requireExamFeeForAdmitCard;

  const cards = students.map((s) => {
    const fee = feeMap.get(String(s._id));
    const override = overrideMap.get(String(s._id));
    const rollInfo = rollMap.get(String(s._id));
    const examRollNumber = rollInfo?.examRollNumber;
    const block = rollInfo?.block;
    const seatNumber = rollInfo?.seatNumber;

    let isEligible = true;
    let statusText = 'Eligible';

    if (requireFee) {
      if (!fee || fee.status !== 'paid') {
        if (override) {
          isEligible = true;
          statusText = 'Overridden by Admin';
        } else {
          isEligible = false;
          statusText = 'Blocked: Exam Fee Pending';
        }
      }
    }

    const status = !isEligible ? 'pending_fees' : (override && (!fee || fee.status !== 'paid') ? 'overridden' : 'eligible');

    return {
      studentId: String(s._id),
      student: { _id: String(s._id), fullName: s.fullName },
      fullName: s.fullName,
      studentName: s.fullName,
      fatherName: s.fatherName,
      guardianName: s.guardianName,
      gender: s.gender,
      caste: s.caste,
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber,
      examRollNumber,
      block: block ?? 'Unassigned',
      seatNumber: seatNumber ?? '—',
      className: classMap.get(String(s.classId)) ?? '—',
      sectionName: sectionMap.get(String(s.sectionId)) ?? '—',
      photo: s.profilePhotoUrl ?? null,
      isEligible,
      status,
      statusText,
      feeStatus: fee?.status ?? 'not_generated',
      remainingFee: fee ? fee.remainingBalance : 0,
      overrideReason: override ? override.reason : null,
    };
  });

  ok(res, {
    examId: String(exam._id),
    examName: exam.name,
    requireFeeBeforeAdmitCard: requireFee,
    cards,
  });
});

/** POST /api/admit-cards/override — admin override for unpaid student */
export const overrideAdmitCard = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantObjectId(req);
  const { examId, studentId, reason } = req.body;

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const student = await Student.findOne(scopeQuery(req, { _id: studentId }));
  if (!student) throw ApiError.notFound('Student not found');

  const doc = await AdmitCardOverride.findOneAndUpdate(
    scopeQuery(req, { examId, studentId }),
    {
      tenantId,
      examId,
      studentId,
      reason,
      grantedBy: (req.user as any)?._id,
    },
    { upsert: true, new: true }
  );

  created(res, publicAdmitCardOverride(doc), { message: 'Admit card fee override granted' });
});

/** DELETE /api/admit-cards/override */
export const revokeOverride = asyncHandler(async (req: Request, res: Response) => {
  const { examId, studentId } = req.body;
  if (!examId || !studentId) throw ApiError.badRequest('examId and studentId are required');
  await AdmitCardOverride.deleteOne(scopeQuery(req, { examId, studentId }));
  ok(res, { revoked: true }, 200, { message: 'Admit card override revoked' });
});

/** GET /api/admit-cards/print?examId=&studentId=&classId= — printable admit card(s) */
export const getPrintableAdmitCard = asyncHandler(async (req: Request, res: Response) => {
  const { examId, studentId, classId } = req.query;
  if (!examId || (!studentId && !classId)) {
    throw ApiError.badRequest('examId and either studentId or classId are required', 'MISSING_PARAMS');
  }

  const [exam, settings] = await Promise.all([
    Exam.findOne(scopeQuery(req, { _id: examId })).lean(),
    SchoolSettings.findOne(scopeQuery(req, {})).lean(),
  ]);

  if (!exam) throw ApiError.notFound('Exam not found');

  let studentsQuery: Record<string, any> = { isArchived: false, sessionId: exam.sessionId };
  if (studentId) {
    studentsQuery._id = studentId;
  } else if (classId) {
    studentsQuery.classId = classId;
  }

  const targetStudents = await Student.find(scopeQuery(req, studentsQuery)).sort({ rollNumber: 1 }).lean();
  if (targetStudents.length === 0) {
    if (studentId) throw ApiError.notFound('Student not found');
    return ok(res, []);
  }

  const studentIds = targetStudents.map((s) => s._id);
  const [allFees, allOverrides, classes, sections, session, schedules, allRolls] = await Promise.all([
    StudentExamFee.find(scopeQuery(req, { examId, studentId: { $in: studentIds } })).lean(),
    AdmitCardOverride.find(scopeQuery(req, { examId, studentId: { $in: studentIds } })).lean(),
    Class.find(scopeQuery(req, {})).select('name').lean(),
    Section.find(scopeQuery(req, {})).select('name').lean(),
    AcademicSession.findOne(scopeQuery(req, { _id: exam.sessionId })).select('name').lean(),
    ExamSchedule.find(scopeQuery(req, { examId })).sort({ examDate: 1, startTime: 1 }).lean(),
    import('../models/ExamRollNumber').then(m => m.ExamRollNumber.find(scopeQuery(req, { examId, studentId: { $in: studentIds } })).lean()),
  ]);

  const feeMap = new Map(allFees.map((f) => [String(f.studentId), f]));
  const overrideMap = new Map(allOverrides.map((o) => [String(o.studentId), o]));
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));
  const rollMap = new Map(allRolls.map((r) => [String(r.studentId), r]));

  const subjectIds = Array.from(new Set(schedules.map((s) => s.subjectId)));
  const subjects = await Subject.find(scopeQuery(req, { _id: { $in: subjectIds } })).select('name code').lean();
  const subMap = new Map(subjects.map((s) => [String(s._id), s]));

  const instructions = [
    'Students must bring their printed Admit Card to every examination session.',
    'Electronic devices, smart watches, and unauthorized notes are strictly prohibited.',
    'Students must be seated at least 15 minutes before the exam start time.',
    'Follow all instructions given by the invigilators.',
  ];

  const cards = [];

  for (const st of targetStudents) {
    const fee = feeMap.get(String(st._id));
    const override = overrideMap.get(String(st._id));
    const rollInfo = rollMap.get(String(st._id));
    const examRollNumber = rollInfo?.examRollNumber;
    const block = rollInfo?.block;
    const seatNumber = rollInfo?.seatNumber;

    // If studentId was requested explicitly, enforce fee blocking if fee is unpaid and not overridden
    if (studentId && exam.requireExamFeeForAdmitCard && !override) {
      if (!fee || fee.status !== 'paid') {
        throw ApiError.forbidden(
          'Admit card blocked: Exam fee is pending for this student. Clear fees or grant an authorized admin override.',
          'EXAM_FEE_PENDING'
        );
      }
    }

    // For batch printing, skip students whose fees are blocked without override
    if (!studentId && exam.requireExamFeeForAdmitCard && !override && (!fee || fee.status !== 'paid')) {
      continue;
    }

    const studentSchedules = schedules.filter((sch) => String(sch.classId) === String(st.classId));

    cards.push({
      school: settings ? publicSchoolSettings(settings) : null,
      exam: {
        _id: String(exam._id),
        name: exam.name,
        startDate: exam.startDate ? new Date(exam.startDate).toISOString() : null,
        endDate: exam.endDate ? new Date(exam.endDate).toISOString() : null,
      },
      student: {
        _id: String(st._id),
        name: st.fullName,
        fullName: st.fullName,
        fatherName: st.fatherName,
        guardianName: st.guardianName,
        gender: st.gender,
        caste: st.caste,
        admissionNumber: st.admissionNumber,
        rollNumber: st.rollNumber,
        examRollNumber: examRollNumber ?? 'Not Generated',
        block: block ?? 'Unassigned',
        seatNumber: seatNumber ?? '—',
        class: classMap.get(String(st.classId)) ?? '—',
        className: classMap.get(String(st.classId)) ?? '—',
        section: sectionMap.get(String(st.sectionId)) ?? '—',
        sectionName: sectionMap.get(String(st.sectionId)) ?? '—',
        sessionName: session?.name ?? '—',
        profilePhotoUrl: st.profilePhotoUrl ?? null,
        photo: st.profilePhotoUrl ?? null,
      },
      schedule: studentSchedules.map((s) => {
        const sub = subMap.get(String(s.subjectId));
        return {
          ...publicExamSchedule(s),
          subjectName: sub?.name ?? '—',
          subjectCode: sub?.code ?? '—',
        };
      }),
      schedules: studentSchedules.map((s) => {
        const sub = subMap.get(String(s.subjectId));
        return {
          ...publicExamSchedule(s),
          subjectName: sub?.name ?? '—',
          subjectCode: sub?.code ?? '—',
        };
      }),
      instructions,
    });
  }

  // If single student was queried, return single card or array of 1
  if (studentId) {
    ok(res, cards[0]);
  } else {
    ok(res, cards);
  }
});
