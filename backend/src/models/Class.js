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
exports.Class = exports.classSchema = void 0;
exports.normalizeName = normalizeName;
exports.publicClass = publicClass;
var mongoose_1 = __importStar(require("mongoose"));
function normalizeName(name) {
    return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
exports.classSchema = new mongoose_1.Schema({
    tenantId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    normalizedName: { type: String, trim: true, lowercase: true, index: true },
    code: { type: String, trim: true, uppercase: true, maxlength: 20 },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    classTeacherId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Staff', index: true },
}, { timestamps: true, versionKey: false });
exports.classSchema.pre('save', function (next) {
    if (this.name) {
        this.normalizedName = normalizeName(this.name);
    }
    next();
});
exports.classSchema.index({ tenantId: 1, sessionId: 1, isArchived: 1 });
exports.Class = mongoose_1.default.models.Class || mongoose_1.default.model('Class', exports.classSchema);
function publicClass(c) {
    return {
        _id: String(c._id),
        tenantId: c.tenantId ? String(c.tenantId) : null,
        name: c.name,
        code: c.code,
        sessionId: String(c.sessionId),
        classTeacherId: c.classTeacherId ? String(c.classTeacherId) : null,
        isActive: c.isActive,
        isArchived: c.isArchived,
        createdAt: c.createdAt,
    };
}
