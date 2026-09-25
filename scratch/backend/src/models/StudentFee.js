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
exports.StudentFee = exports.studentFeeSchema = exports.chargeBreakdownSchema = void 0;
exports.publicStudentFee = publicStudentFee;
var mongoose_1 = __importStar(require("mongoose"));
exports.chargeBreakdownSchema = new mongoose_1.Schema({
    baseFeePaisa: { type: Number, required: true, default: 0 },
    discount: {
        discountId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'FeeDiscount', default: null },
        name: { type: String, default: null },
        type: { type: String, enum: ['fixed', 'percentage', null], default: null },
        valueBps: { type: Number, default: null },
        amountPaisa: { type: Number, default: 0 },
    },
    lateFee: {
        applied: { type: Boolean, default: false },
        amountPaisa: { type: Number, default: 0 },
        assessedAt: { type: Date, default: null },
    },
    otherFee: {
        applied: { type: Boolean, default: false },
        name: { type: String, default: null },
        amountPaisa: { type: Number, default: 0 },
    },
    netPayablePaisa: { type: Number, required: true, default: 0 },
}, { _id: false });
exports.studentFeeSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Section', required: true },
    feeStructureId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
    title: { type: String, trim: true, maxlength: 120 },
    feeType: { type: String, enum: ['monthly_tuition', 'admission_fee', 'other'], required: true },
    month: { type: Number, min: 1, max: 12, default: null },
    billingMonth: { type: Number, min: 1, max: 12, default: null },
    billingYear: { type: Number, default: null },
    reAdmissionEventId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'StudentHistory', default: null },
    originalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    scholarshipAmount: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    otherFeeAmount: { type: Number, default: 0, min: 0 },
    fineAssessedAt: { type: Date, default: null },
    chargeBreakdown: { type: exports.chargeBreakdownSchema, default: null },
    netPayable: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    dueDate: { type: Date },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
// Duplicate generation prevention:
// 1. Non-monthly fees: one student fee per fee structure per tenant
exports.studentFeeSchema.index({ tenantId: 1, studentId: 1, feeStructureId: 1 }, {
    unique: true,
    partialFilterExpression: {
        feeType: 'admission_fee',
    },
});
// 2. Strong monthly tuition invoice uniqueness: tenant + student + session + billingMonth + billingYear
exports.studentFeeSchema.index({ tenantId: 1, studentId: 1, sessionId: 1, feeType: 1, billingMonth: 1, billingYear: 1 }, {
    unique: true,
    partialFilterExpression: {
        feeType: 'monthly_tuition',
        billingMonth: { $type: 'number' },
        billingYear: { $type: 'number' },
    },
});
exports.studentFeeSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });
exports.studentFeeSchema.index({ tenantId: 1, classId: 1, sectionId: 1, status: 1 });
exports.studentFeeSchema.index({ tenantId: 1, status: 1, sessionId: 1 });
exports.studentFeeSchema.index({ tenantId: 1, dueDate: 1, status: 1 });
exports.StudentFee = mongoose_1.default.models.StudentFee || mongoose_1.default.model('StudentFee', exports.studentFeeSchema);
function publicStudentFee(doc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    return {
        _id: String(doc._id),
        studentId: String(doc.studentId),
        sessionId: String(doc.sessionId),
        classId: String(doc.classId),
        sectionId: String(doc.sectionId),
        feeStructureId: String(doc.feeStructureId),
        title: (_a = doc.title) !== null && _a !== void 0 ? _a : null,
        feeType: doc.feeType,
        month: (_b = doc.month) !== null && _b !== void 0 ? _b : null,
        billingMonth: (_d = (_c = doc.billingMonth) !== null && _c !== void 0 ? _c : doc.month) !== null && _d !== void 0 ? _d : null,
        billingYear: (_e = doc.billingYear) !== null && _e !== void 0 ? _e : null,
        reAdmissionEventId: doc.reAdmissionEventId ? String(doc.reAdmissionEventId) : null,
        originalAmount: doc.originalAmount,
        discountAmount: (_f = doc.discountAmount) !== null && _f !== void 0 ? _f : 0,
        scholarshipAmount: (_g = doc.scholarshipAmount) !== null && _g !== void 0 ? _g : 0,
        fineAmount: (_h = doc.fineAmount) !== null && _h !== void 0 ? _h : 0,
        otherFeeAmount: (_j = doc.otherFeeAmount) !== null && _j !== void 0 ? _j : 0,
        fineAssessedAt: doc.fineAssessedAt ? new Date(doc.fineAssessedAt).toISOString() : null,
        chargeBreakdown: (_k = doc.chargeBreakdown) !== null && _k !== void 0 ? _k : null,
        netPayable: doc.netPayable,
        amountPaid: (_l = doc.amountPaid) !== null && _l !== void 0 ? _l : 0,
        remainingBalance: doc.remainingBalance,
        status: doc.status,
        dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
