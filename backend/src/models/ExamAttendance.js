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
exports.ExamAttendance = void 0;
exports.publicExamAttendance = publicExamAttendance;
var mongoose_1 = __importStar(require("mongoose"));
var examAttendanceSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    examScheduleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ExamSchedule', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    block: { type: String, required: true, trim: true },
    status: { type: String, enum: ['present', 'absent', 'leave'], default: 'present', required: true },
    markedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Prevent duplicate subject-exam attendance for a student
examAttendanceSchema.index({ tenantId: 1, examScheduleId: 1, studentId: 1 }, { unique: true });
examAttendanceSchema.index({ tenantId: 1, examScheduleId: 1, block: 1 });
examAttendanceSchema.index({ tenantId: 1, examId: 1, studentId: 1 });
exports.ExamAttendance = mongoose_1.default.models.ExamAttendance || mongoose_1.default.model('ExamAttendance', examAttendanceSchema);
function publicExamAttendance(doc) {
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        examScheduleId: String(doc.examScheduleId),
        studentId: String(doc.studentId),
        block: doc.block,
        status: doc.status,
        markedBy: doc.markedBy ? String(doc.markedBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
