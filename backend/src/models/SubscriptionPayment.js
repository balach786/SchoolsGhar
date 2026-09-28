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
exports.SubscriptionPayment = void 0;
exports.publicSubscriptionPayment = publicSubscriptionPayment;
var mongoose_1 = __importStar(require("mongoose"));
var subscriptionPaymentSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    submittedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10, default: 'PKR' },
    paymentMethod: { type: String, required: true, trim: true, maxlength: 60 },
    transactionReference: { type: String, required: true, trim: true, maxlength: 100 },
    paymentDate: { type: Date, required: true },
    proofUrl: { type: String, required: true, trim: true, maxlength: 500 },
    proofStorageKey: { type: String, required: true, trim: true, maxlength: 200 },
    fileName: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, required: true, trim: true, maxlength: 100 },
    fileSize: { type: Number, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true,
    },
    submittedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 500 },
    approvedSubscriptionStart: { type: Date },
    approvedSubscriptionEnd: { type: Date },
}, { timestamps: true, versionKey: false });
subscriptionPaymentSchema.index({ tenantId: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ status: 1, createdAt: -1 });
exports.SubscriptionPayment = mongoose_1.default.models.SubscriptionPayment ||
    mongoose_1.default.model('SubscriptionPayment', subscriptionPaymentSchema);
function publicSubscriptionPayment(p) {
    var _a, _b, _c, _d, _e;
    return {
        _id: String(p._id),
        tenantId: String(p.tenantId),
        submittedBy: String(p.submittedBy),
        planId: String(p.planId),
        amount: p.amount,
        currency: p.currency,
        paymentMethod: p.paymentMethod,
        transactionReference: p.transactionReference,
        paymentDate: p.paymentDate,
        proofUrl: p.proofUrl,
        proofStorageKey: p.proofStorageKey,
        fileName: p.fileName,
        mimeType: p.mimeType,
        fileSize: p.fileSize,
        notes: (_a = p.notes) !== null && _a !== void 0 ? _a : null,
        status: p.status,
        submittedAt: p.submittedAt,
        reviewedBy: p.reviewedBy ? String(p.reviewedBy) : null,
        reviewedAt: (_b = p.reviewedAt) !== null && _b !== void 0 ? _b : null,
        reviewNote: (_c = p.reviewNote) !== null && _c !== void 0 ? _c : null,
        approvedSubscriptionStart: (_d = p.approvedSubscriptionStart) !== null && _d !== void 0 ? _d : null,
        approvedSubscriptionEnd: (_e = p.approvedSubscriptionEnd) !== null && _e !== void 0 ? _e : null,
        createdAt: p.createdAt,
    };
}
