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
exports.FinancialIdempotency = exports.financialIdempotencySchema = void 0;
var mongoose_1 = __importStar(require("mongoose"));
exports.financialIdempotencySchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    operation: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    ownerToken: { type: String },
    heartbeatAt: { type: Date },
    status: { type: String, enum: ['in_progress', 'completed'], required: true, default: 'in_progress' },
    resultRef: {
        paymentId: { type: String },
        examFeePaymentId: { type: String },
        salaryRecordId: { type: String },
        reversalId: { type: String },
        receiptNumber: { type: String },
    },
    responseStatus: { type: Number },
    responseBody: { type: mongoose_1.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
exports.financialIdempotencySchema.index({ tenantId: 1, operation: 1, idempotencyKey: 1 }, { unique: true });
exports.FinancialIdempotency = mongoose_1.default.models.FinancialIdempotency ||
    mongoose_1.default.model('FinancialIdempotency', exports.financialIdempotencySchema);
