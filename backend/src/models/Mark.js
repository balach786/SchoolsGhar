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
exports.Mark = void 0;
exports.publicMark = publicMark;
var mongoose_1 = __importStar(require("mongoose"));
var markSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    subjectId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subject', required: true },
    marksObtained: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    isAbsent: { type: Boolean, default: false },
    markedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Duplicate prevention: one mark per student per session per subject per exam per tenant.
markSchema.index({ tenantId: 1, studentId: 1, sessionId: 1, examId: 1, subjectId: 1 }, { unique: true });
markSchema.index({ tenantId: 1, examId: 1, subjectId: 1 });
markSchema.index({ tenantId: 1, studentId: 1, examId: 1 });
exports.Mark = mongoose_1.default.models.Mark || mongoose_1.default.model('Mark', markSchema);
/** Public serializer. */
function publicMark(doc) {
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        sessionId: doc.sessionId ? String(doc.sessionId) : null,
        studentId: String(doc.studentId),
        subjectId: String(doc.subjectId),
        marksObtained: doc.marksObtained,
        isAbsent: Boolean(doc.isAbsent),
        markedBy: doc.markedBy ? String(doc.markedBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
