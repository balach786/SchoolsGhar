"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Result = void 0;
exports.publicResult = publicResult;
var mongoose_1 = __importStar(require("mongoose"));
var ApiError_1 = require("../utils/ApiError");
var subjectResultSnapshotSchema = new mongoose_1.Schema({
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject', required: true },
    subjectName: { type: String, required: true, trim: true },
    subjectCode: { type: String, required: true, trim: true },
    examScheduleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ExamSchedule' },
    marksObtained: { type: Number, min: 0, default: null },
    maximumMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, min: 0, default: null },
    attendanceStatus: { type: String, enum: ['present', 'absent', 'leave'], required: true },
    passed: { type: Boolean, required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    remarks: { type: String, trim: true, maxlength: 300 },
}, { _id: false });
var studentSnapshotSchema = new mongoose_1.Schema({
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
}, { _id: false });
var examSnapshotSchema = new mongoose_1.Schema({
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
}, { _id: false });
var resultSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section' },
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
    publishedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
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
        return next(ApiError_1.ApiError.badRequest('Published Result snapshots are immutable and cannot be modified. Create a new version via re-publication.', 'RESULT_IMMUTABLE'));
    }
    next();
});
// Block Mongoose query updates
resultSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function (next) {
    next(ApiError_1.ApiError.badRequest('Published Result snapshots are immutable and cannot be updated.', 'RESULT_IMMUTABLE'));
});
// Block Mongoose query deletions
resultSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
    next(ApiError_1.ApiError.badRequest('Published Result snapshots are immutable and cannot be deleted.', 'RESULT_IMMUTABLE'));
});
exports.Result = mongoose_1.default.models.Result || mongoose_1.default.model('Result', resultSchema, 'results');
function publicResult(r) {
    var _a;
    var isDoc = typeof r.toObject === 'function';
    var raw = isDoc ? r.toObject() : r;
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
        subjects: (raw.subjects || []).map(function (s) {
            var _a;
            return ({
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
                remarks: (_a = s.remarks) !== null && _a !== void 0 ? _a : null,
            });
        }),
        totalObtained: raw.totalObtained,
        totalMaximum: raw.totalMaximum,
        percentage: raw.percentage,
        overallGrade: (_a = raw.overallGrade) !== null && _a !== void 0 ? _a : null,
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
