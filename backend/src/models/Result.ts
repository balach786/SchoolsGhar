import mongoose, { Schema, Document, Model } from 'mongoose';
import { ApiError } from '../utils/ApiError';

export type ResultAttendanceStatus = 'present' | 'absent' | 'leave';

export interface ISubjectResultSnapshot {
  subjectId: mongoose.Types.ObjectId;
  subjectName: string;
  subjectCode: string;
  examScheduleId?: mongoose.Types.ObjectId;
  marksObtained: number | null; // null if absent or on leave
  maximumMarks: number;
  passMarks: number | null;
  attendanceStatus: ResultAttendanceStatus;
  passed: boolean;
  percentage: number;
  remarks?: string;
}

export interface IStudentSnapshot {
  fullName: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: string;
  caste?: string | null;
  admissionNumber: string;
  rollNumber?: string;
  className: string;
  sectionName?: string;
  sessionName: string;
}

export interface IExamSnapshot {
  examName: string;
  examDate?: string | null;
  examTypeName?: string;
  gradeScaleName: string;
  gradeScaleBoundaries: {
    grade: string;
    minPercentage: number;
  }[];
}

export interface IResult extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;

  // Versioning (Correction 1: Pure immutable integer version; no mutable isLatest)
  version: number;

  // Historical Identity & Configuration Snapshots
  studentSnapshot: IStudentSnapshot;
  examSnapshot: IExamSnapshot;
  subjects: ISubjectResultSnapshot[];

  // Aggregated Academic Performance
  totalObtained: number;
  totalMaximum: number;
  percentage: number;
  overallGrade: string | null;
  passed: boolean;
  failedSubjectCount: number;

  // Integrity & Audit Metadata
  sourceChecksum: string;
  calculationVersion: number;
  publishedAt: Date;
  publishedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const subjectResultSnapshotSchema = new Schema<ISubjectResultSnapshot>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    subjectName: { type: String, required: true, trim: true },
    subjectCode: { type: String, required: true, trim: true },
    examScheduleId: { type: Schema.Types.ObjectId, ref: 'ExamSchedule' },
    marksObtained: { type: Number, min: 0, default: null },
    maximumMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, min: 0, default: null },
    attendanceStatus: { type: String, enum: ['present', 'absent', 'leave'], required: true },
    passed: { type: Boolean, required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    remarks: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

const studentSnapshotSchema = new Schema<IStudentSnapshot>(
  {
    fullName: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true, default: null },
    guardianName: { type: String, trim: true, default: null },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    caste: { type: String, trim: true, default: null },
    admissionNumber: { type: String, required: true, trim: true },
    rollNumber: { type: String, trim: true },
    className: { type: String, required: true, trim: true },
    sectionName: { type: String, trim: true },
    sessionName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const examSnapshotSchema = new Schema<IExamSnapshot>(
  {
    examName: { type: String, required: true, trim: true },
    examTypeName: { type: String, trim: true },
    gradeScaleName: { type: String, required: true, trim: true },
    gradeScaleBoundaries: [
      {
        grade: { type: String, required: true, trim: true },
        minPercentage: { type: Number, required: true, min: 0, max: 100 },
        _id: false,
      },
    ],
  },
  { _id: false }
);

const resultSchema = new Schema<IResult>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },

    version: { type: Number, required: true, min: 1 },

    studentSnapshot: { type: studentSnapshotSchema, required: true },
    examSnapshot: { type: examSnapshotSchema, required: true },
    subjects: { type: [subjectResultSnapshotSchema], required: true },

    totalObtained: { type: Number, required: true, min: 0 },
    totalMaximum: { type: Number, required: true, min: 1 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    overallGrade: { type: String, default: null },
    passed: { type: Boolean, required: true },
    failedSubjectCount: { type: Number, required: true, min: 0 },

    sourceChecksum: { type: String, required: true, trim: true },
    calculationVersion: { type: Number, required: true, default: 1 },
    publishedAt: { type: Date, required: true, default: Date.now },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// ── INDEXES (Correction 1 & Step 4C.5) ─────────────────────────
// Unique version index: Exactly one document per version of a student's exam result
// Descending version (-1) supports both uniqueness AND fast latest retrieval ({ version: -1 })
resultSchema.index({ tenantId: 1, examId: 1, studentId: 1, version: -1 }, { unique: true });

// Exam class listing index
resultSchema.index({ tenantId: 1, examId: 1, classId: 1 });

// ── IMMUTABILITY DEFENSE (Correction 1 & Step 4C.4) ───────────
// Block direct document mutation on existing records
resultSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(
      ApiError.badRequest(
        'Published Result snapshots are immutable and cannot be modified. Create a new version via re-publication.',
        'RESULT_IMMUTABLE'
      )
    );
  }
  next();
});

// Block Mongoose query updates
resultSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'] as any,
  function (this: any, next: any) {
    next(
      ApiError.badRequest(
        'Published Result snapshots are immutable and cannot be updated.',
        'RESULT_IMMUTABLE'
      )
    );
  }
);

// Block Mongoose query deletions
resultSchema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  function (this: any, next: any) {
    next(
      ApiError.badRequest(
        'Published Result snapshots are immutable and cannot be deleted.',
        'RESULT_IMMUTABLE'
      )
    );
  }
);

export const Result: Model<IResult> =
  mongoose.models.Result || mongoose.model<IResult>('Result', resultSchema, 'results');

export function publicResult(r: IResult | (Record<string, any> & { _id?: unknown })) {
  const isDoc = typeof (r as any).toObject === 'function';
  const raw = isDoc ? (r as IResult).toObject() : r;

  return {
    _id: String(raw._id),
    tenantId: String(raw.tenantId),
    examId: String(raw.examId),
    studentId: String(raw.studentId),
    sessionId: String(raw.sessionId),
    classId: String(raw.classId),
    sectionId: raw.sectionId ? String(raw.sectionId) : null,
    version: raw.version,
    studentSnapshot: raw.studentSnapshot,
    examSnapshot: raw.examSnapshot,
    subjects: (raw.subjects || []).map((s: any) => ({
      subjectId: String(s.subjectId),
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      examScheduleId: s.examScheduleId ? String(s.examScheduleId) : null,
      marksObtained: s.marksObtained,
      maximumMarks: s.maximumMarks,
      passMarks: s.passMarks,
      attendanceStatus: s.attendanceStatus,
      passed: s.passed,
      percentage: s.percentage,
      remarks: s.remarks ?? null,
    })),
    totalObtained: raw.totalObtained,
    totalMaximum: raw.totalMaximum,
    percentage: raw.percentage,
    overallGrade: raw.overallGrade ?? null,
    passed: raw.passed,
    failedSubjectCount: raw.failedSubjectCount,
    sourceChecksum: raw.sourceChecksum,
    calculationVersion: raw.calculationVersion,
    publishedAt: raw.publishedAt,
    publishedBy: raw.publishedBy ? String(raw.publishedBy) : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
