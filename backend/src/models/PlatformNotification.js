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
exports.PlatformNotification = void 0;
exports.publicPlatformNotification = publicPlatformNotification;
var mongoose_1 = __importStar(require("mongoose"));
var platformNotificationSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: [
            'new_customer',
            'payment_submitted',
            'trial_expiring',
            'subscription_expiring',
            'subscription_expired',
            'payment_needs_review',
        ],
        required: true,
        index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant' },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SubscriptionPayment' },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
platformNotificationSchema.index({ isRead: 1, createdAt: -1 });
exports.PlatformNotification = mongoose_1.default.models.PlatformNotification ||
    mongoose_1.default.model('PlatformNotification', platformNotificationSchema);
function publicPlatformNotification(n) {
    var _a;
    return {
        _id: String(n._id),
        type: n.type,
        title: n.title,
        message: n.message,
        tenantId: n.tenantId ? String(n.tenantId) : null,
        paymentId: n.paymentId ? String(n.paymentId) : null,
        isRead: n.isRead,
        readAt: (_a = n.readAt) !== null && _a !== void 0 ? _a : null,
        createdAt: n.createdAt,
    };
}
