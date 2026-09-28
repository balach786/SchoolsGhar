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
exports.Notification = void 0;
exports.publicNotification = publicNotification;
var mongoose_1 = __importStar(require("mongoose"));
var notificationSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    referenceType: { type: String, maxlength: 40 },
    referenceId: { type: mongoose_1.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
// Unread-count queries + per-user lists.
notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
// Retention cleanup (old read notifications).
notificationSchema.index({ tenantId: 1, isRead: 1, createdAt: 1 });
exports.Notification = mongoose_1.default.models.Notification || mongoose_1.default.model('Notification', notificationSchema);
function publicNotification(doc) {
    var _a;
    return {
        _id: String(doc._id),
        type: doc.type,
        title: doc.title,
        message: doc.message,
        referenceType: (_a = doc.referenceType) !== null && _a !== void 0 ? _a : null,
        referenceId: doc.referenceId ? String(doc.referenceId) : null,
        isRead: Boolean(doc.isRead),
        readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
        createdAt: doc.createdAt,
    };
}
