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
exports.Tenant = void 0;
exports.getEffectiveTenantStatus = getEffectiveTenantStatus;
exports.publicTenant = publicTenant;
var mongoose_1 = __importStar(require("mongoose"));
var tenantSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    databaseName: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    isDatabaseProvisioned: { type: Boolean, default: false, index: true },
    provisioningStatus: { type: String, enum: ['pending', 'provisioning', 'ready', 'failed'], default: 'pending', index: true },
    provisioningFailedAt: { type: Date },
    provisioningErrorCode: { type: String, maxlength: 200 },
    ownerUserId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    city: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80, default: 'Pakistan' },
    status: {
        type: String,
        enum: ['trial', 'active', 'expired', 'suspended', 'cancelled'],
        default: 'trial',
        index: true,
    },
    trialStartedAt: { type: Date, required: true, default: Date.now },
    trialEndsAt: { type: Date, required: true },
    subscriptionStatus: {
        type: String,
        enum: ['trial', 'active', 'expired', 'suspended'],
        default: 'trial',
        index: true,
    },
    subscriptionStartedAt: { type: Date },
    subscriptionEndsAt: { type: Date },
    currentPlanId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false, index: true },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
    isDemo: { type: Boolean, default: false, index: true },
    demoBatchId: { type: String, index: true },
    adminSecuritySeq: { type: Number, default: 0 },
    academicSessionSeq: { type: Number, default: 0 },
    timetableSeq: { type: Number, default: 0 },
    promotionSeq: { type: Number, default: 0 },
    deletionStatus: {
        type: String,
        enum: ['NONE', 'SOFT_DELETED', 'DELETION_IN_PROGRESS', 'DATABASE_DELETED_CLEANUP_PENDING', 'HARD_DELETED'],
        default: 'NONE'
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
}, { timestamps: true, versionKey: false });
tenantSchema.index({ subscriptionEndsAt: 1 });
tenantSchema.index({ trialEndsAt: 1 });
exports.Tenant = mongoose_1.default.models.Tenant || mongoose_1.default.model('Tenant', tenantSchema);
/** Evaluate live status based on dates and suspension */
function getEffectiveTenantStatus(t) {
    var now = new Date();
    if (t.isSuspended) {
        return {
            status: 'suspended',
            daysRemaining: 0,
            isExpired: false,
            isSuspended: true,
        };
    }
    // Active paid subscription
    if (t.subscriptionEndsAt && t.subscriptionEndsAt > now) {
        var diffMs = t.subscriptionEndsAt.getTime() - now.getTime();
        var daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return {
            status: 'active',
            daysRemaining: daysRemaining,
            isExpired: false,
            isSuspended: false,
        };
    }
    // Active free trial
    if (t.trialEndsAt && t.trialEndsAt > now) {
        var diffMs = t.trialEndsAt.getTime() - now.getTime();
        var daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return {
            status: 'trial',
            daysRemaining: daysRemaining,
            isExpired: false,
            isSuspended: false,
        };
    }
    // Otherwise expired
    return {
        status: 'expired',
        daysRemaining: 0,
        isExpired: true,
        isSuspended: false,
    };
}
function publicTenant(t) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    var effective = getEffectiveTenantStatus(t);
    return {
        _id: String(t._id),
        name: t.name,
        slug: t.slug,
        ownerUserId: String(t.ownerUserId),
        contactEmail: t.contactEmail,
        contactPhone: (_a = t.contactPhone) !== null && _a !== void 0 ? _a : null,
        city: (_b = t.city) !== null && _b !== void 0 ? _b : null,
        country: (_c = t.country) !== null && _c !== void 0 ? _c : 'Pakistan',
        status: effective.status,
        rawStatus: t.status,
        trialStartedAt: t.trialStartedAt,
        trialEndsAt: t.trialEndsAt,
        subscriptionStatus: effective.status,
        subscriptionStartedAt: (_d = t.subscriptionStartedAt) !== null && _d !== void 0 ? _d : null,
        subscriptionEndsAt: (_e = t.subscriptionEndsAt) !== null && _e !== void 0 ? _e : null,
        currentPlanId: t.currentPlanId ? String(t.currentPlanId) : null,
        isActive: t.isActive,
        isSuspended: t.isSuspended,
        suspensionReason: (_f = t.suspensionReason) !== null && _f !== void 0 ? _f : null,
        isDemo: Boolean(t.isDemo),
        demoBatchId: (_g = t.demoBatchId) !== null && _g !== void 0 ? _g : null,
        daysRemaining: effective.daysRemaining,
        isExpired: effective.isExpired,
        deletionStatus: (_h = t.deletionStatus) !== null && _h !== void 0 ? _h : 'NONE',
        isDeleted: Boolean(t.isDeleted),
        deletedAt: (_j = t.deletedAt) !== null && _j !== void 0 ? _j : null,
        createdAt: t.createdAt,
    };
}
