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
exports.AcademicSession = void 0;
exports.normalizeSessionName = normalizeSessionName;
exports.publicSession = publicSession;
var mongoose_1 = __importStar(require("mongoose"));
function normalizeSessionName(name) {
    return (name || '').trim().replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, ' ').toLowerCase();
}
var academicSessionSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    normalizedName: { type: String, trim: true, lowercase: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });
academicSessionSchema.pre('save', function (next) {
    if (this.name) {
        this.normalizedName = normalizeSessionName(this.name);
    }
    next();
});
academicSessionSchema.index({ tenantId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true }, name: 'active_unique_per_tenant' });
academicSessionSchema.index({ tenantId: 1, normalizedName: 1 }, { unique: true, partialFilterExpression: { isArchived: false }, name: 'normalized_name_unique_per_tenant' });
academicSessionSchema.index({ tenantId: 1, isArchived: 1 });
exports.AcademicSession = mongoose_1.default.models.AcademicSession || mongoose_1.default.model('AcademicSession', academicSessionSchema);
function publicSession(s) {
    return {
        _id: String(s._id),
        tenantId: s.tenantId ? String(s.tenantId) : null,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        isActive: s.isActive,
        isArchived: s.isArchived,
        createdAt: s.createdAt,
    };
}
