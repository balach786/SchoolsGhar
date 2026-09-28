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
exports.ExamSchedule = void 0;
exports.publicExamSchedule = publicExamSchedule;
var mongoose_1 = __importStar(require("mongoose"));
var examScheduleSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject', required: true },
    examDate: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    totalMarks: { type: Number, required: true, min: 1, max: 1000 },
    passingMarks: { type: Number, required: true, min: 0, max: 1000 },
    theoryMarks: { type: Number, min: 0, max: 1000 },
    practicalMarks: { type: Number, min: 0, max: 1000 },
    instructions: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false });
// Prevent duplicate subject schedule for same exam/class per tenant
examScheduleSchema.index({ tenantId: 1, examId: 1, classId: 1, subjectId: 1 }, { unique: true });
examScheduleSchema.index({ tenantId: 1, examId: 1, examDate: 1 });
examScheduleSchema.index({ tenantId: 1, classId: 1, examDate: 1 });
exports.ExamSchedule = mongoose_1.default.models.ExamSchedule || mongoose_1.default.model('ExamSchedule', examScheduleSchema);
function publicExamSchedule(doc) {
    var _a, _b, _c;
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        subjectId: String(doc.subjectId),
        examDate: new Date(doc.examDate).toISOString(),
        startTime: doc.startTime,
        endTime: doc.endTime,
        totalMarks: doc.totalMarks,
        passingMarks: doc.passingMarks,
        theoryMarks: (_a = doc.theoryMarks) !== null && _a !== void 0 ? _a : null,
        practicalMarks: (_b = doc.practicalMarks) !== null && _b !== void 0 ? _b : null,
        instructions: (_c = doc.instructions) !== null && _c !== void 0 ? _c : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
