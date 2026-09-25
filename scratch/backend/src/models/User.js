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
exports.User = void 0;
exports.publicUser = publicUser;
var mongoose_1 = __importStar(require("mongoose"));
var userSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 120,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    // select:false → never returned by queries unless explicitly projected
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', index: true },
    isPlatformAdmin: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    linkSeq: { type: Number, default: 0 },
    dashboardOrder: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });
// Email unique index declared inline; ESR index for tenant user listings sorted by createdAt
userSchema.index({ tenantId: 1, isArchived: 1, createdAt: -1 });
exports.User = mongoose_1.default.models.User || mongoose_1.default.model('User', userSchema);
/** Public-safe user shape (never includes passwordHash). */
function publicUser(u) {
    var _a, _b, _c;
    return {
        _id: String(u._id),
        name: u.name,
        email: u.email,
        roleId: String(u.roleId),
        tenantId: u.tenantId ? String(u.tenantId) : null,
        isPlatformAdmin: Boolean(u.isPlatformAdmin),
        isActive: u.isActive,
        isArchived: u.isArchived,
        lastLoginAt: (_a = u.lastLoginAt) !== null && _a !== void 0 ? _a : null,
        passwordChangedAt: (_b = u.passwordChangedAt) !== null && _b !== void 0 ? _b : null,
        dashboardOrder: (_c = u.dashboardOrder) !== null && _c !== void 0 ? _c : [],
        createdAt: u.createdAt,
    };
}
