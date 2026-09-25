import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { ExamAttendance, publicExamAttendance } from '../models/ExamAttendance';
import { ExamSchedule } from '../models/ExamSchedule';
import { Exam } from '../models/Exam';
import { Student } from '../models/Student';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

export const getExamAttendanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const { examId, date, startTime, block } = req.query;

  if (!examId || !date || !startTime || !block) {
    throw ApiError.badRequest('examId, date, startTime, and block are required');
  }

  // Find all schedules for this exam at this date and time
  const schedules = await ExamSchedule.find(scopeQuery(req, {
    examId,
    examDate: new Date(date as string),
    startTime: startTime as string
  })).populate('subjectId', 'name').lean();

  if (schedules.length === 0) {
    throw ApiError.notFound('No exam schedules found for this date and time');
  }

  // Find students assigned to this block for this exam
  const rollNumbers = await import('../models/ExamRollNumber').then(m => 
    m.ExamRollNumber.find(scopeQuery(req, { examId, block })).lean()
  );

  if (rollNumbers.length === 0) {
    return ok(res, { roster: [], records: [] }, 200, { message: 'No students assigned to this block' });
  }

  // Filter students who are actually scheduled for an exam at this time
  const scheduleByClassId = new Map(schedules.map(s => [String(s.classId), s]));
  const participatingRolls = rollNumbers.filter(r => scheduleByClassId.has(String(r.classId)));

  if (participatingRolls.length === 0) {
    return ok(res, { roster: [], records: [] }, 200, { message: 'No students in this block have an exam at this time' });
  }

  const studentIds = participatingRolls.map(r => r.studentId);
  const scheduleIds = schedules.map(s => s._id);

  const [students, attendanceRecords] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: studentIds }, isArchived: false }))
      .select('fullName admissionNumber rollNumber sectionId fatherName guardianName classId')
      .populate('classId', 'name')
      .lean(),
    ExamAttendance.find(scopeQuery(req, { examId, examScheduleId: { $in: scheduleIds }, block })).lean()
  ]);

  const attMap = new Map(attendanceRecords.map((a) => [String(a.studentId), a]));
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const roster = participatingRolls
    .map((r) => {
      const s = studentMap.get(String(r.studentId));
      if (!s) return null;
      const record = attMap.get(String(s._id));
      const sch = scheduleByClassId.get(String(s.classId));
      
      return {
        studentId: String(s._id),
        examScheduleId: sch ? String(sch._id) : null,
        subjectName: sch && typeof sch.subjectId === 'object' ? (sch.subjectId as any).name : 'Subject',
        fullName: s.fullName,
        fatherName: s.fatherName,
        guardianName: s.guardianName,
        className: (s.classId as any)?.name ?? 'Unknown',
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        examRollNumber: r.examRollNumber,
        seatNumber: r.seatNumber,
        sectionId: String(s.sectionId),
        status: record?.status ?? 'present',
        remarks: (record as any)?.remarks ?? '',
        recorded: Boolean(record),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a!.examRollNumber || 0) - (b!.examRollNumber || 0));

  ok(res, {
    examId,
    date,
    startTime,
    block,
    roster,
    records: roster,
  });
});

export const markExamAttendance = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantObjectId(req);
  const { examId, block, records } = req.body;

  if (!examId || !block || !records || !Array.isArray(records)) {
    throw ApiError.badRequest('examId, block, and records are required');
  }

  const ops = records.map((r: any) => {
    if (!r.examScheduleId) throw ApiError.badRequest(`examScheduleId missing for student ${r.studentId}`);
    return {
      updateOne: {
        filter: scopeQuery(req, {
          tenantId,
          examId,
          examScheduleId: r.examScheduleId,
          studentId: r.studentId,
        }),
        update: {
          $set: {
            block,
            status: r.status,
            markedBy: (req.user as any)?._id,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await ExamAttendance.bulkWrite(ops);
  }

  ok(res, { success: true, count: records.length }, 200, {
    message: `${records.length} student exam attendance record(s) saved for block ${block}`,
  });
});
