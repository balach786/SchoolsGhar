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
exports.SubscriptionHistory = void 0;
exports.publicSubscriptionHistory = publicSubscriptionHistory;
var mongoose_1 = __importStar(require("mongoose"));
var subscriptionHistorySchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    action: { type: String, required: true, trim: true, maxlength: 60 },
    previousStatus: { type: String, trim: true, maxlength: 40 },
    newStatus: { type: String, required: true, trim: true, maxlength: 40 },
    previousEndsAt: { type: Date },
    newEndsAt: { type: Date },
    source: {
        type: String,
        enum: ['trial', 'payment', 'manual_extension', 'manual_activation', 'admin_adjustment', 'system'],
        default: 'system',
    },
    performedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SubscriptionPayment' },
    reason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
subscriptionHistorySchema.index({ tenantId: 1, createdAt: -1 });
exports.SubscriptionHistory = mongoose_1.default.models.SubscriptionHistory ||
    mongoose_1.default.model('SubscriptionHistory', subscriptionHistorySchema);
function publicSubscriptionHistory(h) {
    var _a, _b, _c, _d;
    return {
        _id: String(h._id),
        tenantId: String(h.tenantId),
        planId: h.planId ? String(h.planId) : null,
        action: h.action,
        previousStatus: (_a = h.previousStatus) !== null && _a !== void 0 ? _a : null,
        newStatus: h.newStatus,
        previousEndsAt: (_b = h.previousEndsAt) !== null && _b !== void 0 ? _b : null,
        newEndsAt: (_c = h.newEndsAt) !== null && _c !== void 0 ? _c : null,
        source: h.source,
        performedBy: h.performedBy ? String(h.performedBy) : null,
        paymentId: h.paymentId ? String(h.paymentId) : null,
        reason: (_d = h.reason) !== null && _d !== void 0 ? _d : null,
        createdAt: h.createdAt,
    };
}
