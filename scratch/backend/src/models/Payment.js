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
exports.Payment = exports.paymentSchema = void 0;
exports.publicPayment = publicPayment;
var mongoose_1 = __importStar(require("mongoose"));
exports.paymentSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentFeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'StudentFee' }, // Made optional
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    amount: { type: Number, required: true, min: 1 },
    refundableAmount: { type: Number, required: true, min: 0 },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'online', 'other'],
        required: true,
    },
    paymentDate: { type: Date, required: true },
    receiptNumber: { type: String, required: true },
    reference: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 500 },
    allocations: [
        {
            studentFeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'StudentFee', required: true },
            amountAllocated: { type: Number, required: true, min: 1 },
        },
    ],
    status: { type: String, enum: ['active', 'voided', 'refunded'], default: 'active' },
    collectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
// Collision-safe uniqueness for receipts per tenant.
exports.paymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
exports.paymentSchema.index({ tenantId: 1, studentFeeId: 1, paymentDate: 1 });
exports.paymentSchema.index({ tenantId: 1, 'allocations.studentFeeId': 1, paymentDate: 1 });
exports.paymentSchema.index({ tenantId: 1, paymentDate: 1 });
exports.paymentSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });
exports.paymentSchema.index({ tenantId: 1, status: 1 });
exports.Payment = mongoose_1.default.models.Payment || mongoose_1.default.model('Payment', exports.paymentSchema);
function publicPayment(doc) {
    var _a, _b, _c;
    return {
        _id: String(doc._id),
        studentId: String(doc.studentId),
        studentFeeId: doc.studentFeeId ? String(doc.studentFeeId) : null,
        sessionId: String(doc.sessionId),
        amount: doc.amount,
        refundableAmount: doc.refundableAmount !== undefined ? doc.refundableAmount : doc.amount,
        paymentMethod: doc.paymentMethod,
        paymentDate: new Date(doc.paymentDate).toISOString(),
        receiptNumber: doc.receiptNumber,
        reference: (_a = doc.reference) !== null && _a !== void 0 ? _a : null,
        notes: (_b = doc.notes) !== null && _b !== void 0 ? _b : null,
        allocations: ((_c = doc.allocations) === null || _c === void 0 ? void 0 : _c.map(function (a) { return ({
            studentFeeId: String(a.studentFeeId),
            amountAllocated: a.amountAllocated,
        }); })) || [],
        status: doc.status || 'active',
        collectedBy: doc.collectedBy ? String(doc.collectedBy) : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
