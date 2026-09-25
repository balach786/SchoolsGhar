const fs = require('fs');

const content = `import crypto from 'crypto';
import mongoose from 'mongoose';
import { Result, IResult, ISubjectResultSnapshot } from '../models/Result';
import { Exam, IExam } from '../models/Exam';
import { GradeScale, IGradeScale } from '../models/GradeScale';
import { ExamSchedule, IExamSchedule } from '../models/ExamSchedule';
import { Student } from '../models/Student';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { AcademicSession } from '../models/AcademicSession';
import { Subject } from '../models/Subject';
import { Mark, IMark } from '../models/Mark';
import { ExamAttendance, IExamAttendance } from '../models/ExamAttendance';
import ApiError from '../utils/ApiError';
import { validateSnapshotConsistency } from './validation.service';

export const RESULT_CALCULATION_VERSION = '2026.09-canonical';
export type ResultAttendanceStatus = 'present' | 'absent' | 'leave' | 'pending';

export interface CalculatedSubjectRow {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  attendanceStatus: ResultAttendanceStatus;
  passed: boolean;
  percentage: number;
  examScheduleId?: string;
}

export interface CalculatedStudentResult {
  studentId: string;
  totalObtained: number;
  totalMaximum: number;
  percentage: number;
  overallGrade: string;
  passed: boolean;
  failedSubjectCount: number;
  rank: number;
  rows: CalculatedSubjectRow[];
}

export function computeResultSourceChecksum(canonicalPayload: any): string {
  function deterministicStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => deterministicStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => JSON.stringify(k) + ':' + deterministicStringify(obj[k]));
    return '{' + entries.join(',') + '}';
  }

  const serialized = deterministicStringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Reconcile Exam and ExamSchedule configurations (Correction 3)
 */
export async function reconcileExamConfigurations(
  exam: IExam,
  tenantId: string | mongoose.Types.ObjectId,
  isPublicationPreflight?: boolean
): Promise<Map<string, IExamSchedule>> {
  const schedules = await ExamSchedule.find({
    tenantId,
    examId: exam._id,
  }).lean();

  const scheduleMap = new Map<string, IExamSchedule>();
  for (const s of schedules) {
    const key = String(s.classId) + '|' + String(s.subjectId);
    scheduleMap.set(key, s as any);
  }

  // Determine all classes applicable to the exam
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  for (const cId of classIds) {
    for (const sub of exam.subjects) {
      const key = String(cId) + '|' + String(sub.subjectId);
      const schedule = scheduleMap.get(key);

      if (!schedule) {
        if (isPublicationPreflight) {
          throw ApiError.badRequest(
            \`Exam schedule missing for class \${cId} and subject \${sub.subjectId}\`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
        continue;
      }

      if (schedule.totalMarks !== sub.maxMarks) {
        throw ApiError.badRequest(
          \`Exam subject max marks (\${sub.maxMarks}) contradicts schedule total marks (\${schedule.totalMarks})\`,
          'EXAM_CONFIGURATION_MISMATCH'
        );
      }

      if (sub.passMarks !== undefined && sub.passMarks !== null) {
        if (schedule.passingMarks !== sub.passMarks) {
          throw ApiError.badRequest(
            \`Exam subject pass marks (\${sub.passMarks}) contradicts schedule passing marks (\${schedule.passingMarks})\`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
      }
    }
  }

  return scheduleMap;
}

/**
 * Canonical Result Calculation Engine (Step 4C.1, Corrections 1-7)
 */
export async function computeCanonicalResults(
  exam: IExam,
  options?: {
    isPublicationPreflight?: boolean;
    studentIds?: string[];
  }
): Promise<{
  results: CalculatedStudentResult[];
  scale: IGradeScale;
  studentMap: Map<string, any>;
  subjectMap: Map<string, any>;
  scheduleMap: Map<string, IExamSchedule>;
}> {
  const tenantId = exam.tenantId;

  // 1. Resolve GradeScale
  const scale = await GradeScale.findOne({ _id: exam.gradeScaleId, tenantId }).lean();
  if (!scale || !scale.boundaries || scale.boundaries.length === 0) {
    throw ApiError.badRequest('The exam references a missing or invalid grade scale', 'GRADE_SCALE_NOT_FOUND');
  }

  // 2. Validate configuration consistency with ExamSchedule (Correction 3)
  const scheduleMap = await reconcileExamConfigurations(exam, tenantId, options?.isPublicationPreflight);

  // 3. Resolve applicable students
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  const studentQuery: Record<string, any> = {
    tenantId,
    sessionId: exam.sessionId,
    classId: { $in: classIds },
    isArchived: false,
  };
`;

const lines = fs.readFileSync('backend/src/services/resultCalculation.service.ts', 'utf8').split('\\n');
let target = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (options?.studentIds && options.studentIds.length > 0) {')) {
    target = i;
    break;
  }
}

if (target !== -1) {
  fs.writeFileSync('backend/src/services/resultCalculation.service.ts', content + lines.slice(target).join('\\n'));
  console.log('Fixed successfully');
} else {
  console.log('Target not found');
}
