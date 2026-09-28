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
exports.ExamFee = void 0;
exports.publicExamFee = publicExamFee;
var mongoose_1 = __importStar(require("mongoose"));
var examFeeSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
    defaultFine: { type: Number, default: 0, min: 0 },
    discountAllowed: { type: Boolean, default: true },
    scholarshipAllowed: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });
// One exam fee structure per class per exam per tenant
examFeeSchema.index({ tenantId: 1, examId: 1, classId: 1 }, { unique: true });
examFeeSchema.index({ tenantId: 1, examId: 1 });
exports.ExamFee = mongoose_1.default.models.ExamFee || mongoose_1.default.model('ExamFee', examFeeSchema);
function publicExamFee(doc) {
    var _a;
    return {
        _id: String(doc._id),
        examId: String(doc.examId),
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        amount: doc.amount,
        dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
        defaultFine: (_a = doc.defaultFine) !== null && _a !== void 0 ? _a : 0,
        discountAllowed: Boolean(doc.discountAllowed),
        scholarshipAllowed: Boolean(doc.scholarshipAllowed),
        isActive: Boolean(doc.isActive),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
