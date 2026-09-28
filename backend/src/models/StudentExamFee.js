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
exports.StudentExamFee = exports.studentExamFeeSchema = void 0;
exports.publicStudentExamFee = publicStudentExamFee;
var mongoose_1 = __importStar(require("mongoose"));
exports.studentExamFeeSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    scholarshipAmount: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    netPayable: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ['unpaid', 'partial', 'paid', 'waived'],
        default: 'unpaid',
    },
    dueDate: { type: Date },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Exactly one exam fee record per student per exam per tenant (duplicate prevention)
exports.studentExamFeeSchema.index({ tenantId: 1, studentId: 1, examId: 1 }, { unique: true });
exports.studentExamFeeSchema.index({ tenantId: 1, examId: 1, status: 1 });
exports.studentExamFeeSchema.index({ tenantId: 1, examId: 1, classId: 1, sectionId: 1 });
exports.studentExamFeeSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });
exports.StudentExamFee = mongoose_1.default.models.StudentExamFee || mongoose_1.default.model('StudentExamFee', exports.studentExamFeeSchema);
function publicStudentExamFee(doc) {
    var _a, _b, _c, _d;
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        studentId: String(doc.studentId),
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        sectionId: String(doc.sectionId),
        originalAmount: doc.originalAmount,
        discountAmount: (_a = doc.discountAmount) !== null && _a !== void 0 ? _a : 0,
        scholarshipAmount: (_b = doc.scholarshipAmount) !== null && _b !== void 0 ? _b : 0,
        fineAmount: (_c = doc.fineAmount) !== null && _c !== void 0 ? _c : 0,
        netPayable: doc.netPayable,
        amountPaid: (_d = doc.amountPaid) !== null && _d !== void 0 ? _d : 0,
        remainingBalance: doc.remainingBalance,
        status: doc.status,
        dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
        createdBy: doc.createdBy ? String(doc.createdBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
