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
exports.PaymentReversal = exports.paymentReversalSchema = void 0;
exports.publicPaymentReversal = publicPaymentReversal;
var mongoose_1 = __importStar(require("mongoose"));
exports.paymentReversalSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sourceType: { type: String, enum: ['regular_fee', 'exam_fee'], required: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    obligationId: { type: mongoose_1.Schema.Types.ObjectId, required: true },
    originalReceiptNumber: { type: String, required: true },
    reversalReceiptNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    reversalType: { type: String, enum: ['full_reversal', 'partial_refund', 'void'], required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 300 },
    initiatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false });
exports.paymentReversalSchema.index({ tenantId: 1, reversalReceiptNumber: 1 }, { unique: true });
exports.paymentReversalSchema.index({ tenantId: 1, paymentId: 1 });
exports.paymentReversalSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });
exports.paymentReversalSchema.index({ tenantId: 1, sourceType: 1, createdAt: 1 });
exports.PaymentReversal = mongoose_1.default.models.PaymentReversal ||
    mongoose_1.default.model('PaymentReversal', exports.paymentReversalSchema);
function publicPaymentReversal(doc) {
    var _a;
    return {
        _id: String(doc._id),
        sourceType: doc.sourceType,
        paymentId: String(doc.paymentId),
        studentId: String(doc.studentId),
        obligationId: String(doc.obligationId),
        originalReceiptNumber: doc.originalReceiptNumber,
        reversalReceiptNumber: doc.reversalReceiptNumber,
        amount: doc.amount,
        reversalType: doc.reversalType,
        reason: doc.reason,
        initiatedBy: doc.initiatedBy ? String(doc.initiatedBy) : null,
        approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
        notes: (_a = doc.notes) !== null && _a !== void 0 ? _a : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
